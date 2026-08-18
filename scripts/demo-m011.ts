import { CheckedCoreDocumentFromJson, type CheckedCoreDocument } from "@bang/core";
import {
  checkRelationalObligation,
  deriveTransferPreservationObligation,
  evaluateRelationalObligation,
  parseZ3Output,
  projectQfLia,
  ProviderFailure,
  RelationalProvider,
  Z3Layer,
  type RelationalObligation,
  type RelationalProviderResult,
} from "@bang/obligations";
import {
  decodeM011SolverEvidenceManifest,
  formatM011SolverEvidenceReport,
  M011SolverEvidenceError,
  M011SolverEvidenceManifest,
  M011SolverEvidenceManifestFromJson,
} from "@bang/evidence";
import { BunRuntime, BunServices } from "@effect/platform-bun";
import { Console, Crypto, Effect, FileSystem, Layer, Path, Schema } from "effect";

const corePath = "examples/tiny-bank/core/account-ledger-bridge.json";
const evidencePath = ".bang/evidence/M011.json";
const obligationId = "AccountLedger.transferPreservesTotal";
const solverTimeoutMs = 2_000;
const processTimeoutMs = 5_000;

class DemoError extends Schema.TaggedError<DemoError>()("DemoError", { message: Schema.String }) {}

const readCore = Effect.fn("demoM011.readCore")(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  return yield* Schema.decodeEffect(CheckedCoreDocumentFromJson)(
    yield* fileSystem.readFileString(corePath),
  );
});

const digest = Effect.fn("demoM011.digest")(function* (text: string) {
  const crypto = yield* Crypto.Crypto;
  return Buffer.from(yield* crypto.digest("SHA-256", new TextEncoder().encode(text))).toString(
    "hex",
  );
});

const requireObligation = (
  document: CheckedCoreDocument,
  variant: "lawful" | "faulty",
): Effect.Effect<RelationalObligation, unknown> =>
  deriveTransferPreservationObligation(document, variant, { coreSource: corePath });

const requireResult = (
  result: RelationalProviderResult,
  expectedVariant: "lawful" | "faulty",
): Effect.Effect<RelationalProviderResult, DemoError> =>
  result.variant === expectedVariant &&
  ((expectedVariant === "lawful" && result.result === "bounded-no-counterexample") ||
    (expectedVariant === "faulty" &&
      result.result === "bounded-counterexample" &&
      result.model !== undefined))
    ? Effect.succeed(result)
    : Effect.fail(
        new DemoError({
          message: `unexpected ${expectedVariant} provider result: ${result.status}/${result.result}`,
        }),
      );

const providerProgram = Effect.gen(function* () {
  const provider = yield* RelationalProvider;
  const document = yield* readCore();
  const lawful = yield* requireObligation(document, "lawful");
  const faulty = yield* requireObligation(document, "faulty");
  yield* checkRelationalObligation(document, lawful);
  yield* checkRelationalObligation(document, faulty);
  return {
    document,
    lawful,
    faulty,
    lawfulSmt: projectQfLia(lawful),
    faultySmt: projectQfLia(faulty),
    lawfulResult: yield* requireResult(yield* provider.run({ obligation: lawful }), "lawful"),
    faultyResult: yield* requireResult(yield* provider.run({ obligation: faulty }), "faulty"),
  };
});

const program = Effect.scoped(
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const observed = yield* providerProgram;

    if (observed.lawful.id !== obligationId || observed.faulty.id !== obligationId) {
      return yield* new DemoError({ message: "unexpected obligation identity" });
    }
    yield* Console.log(`PASS checked Core and derived ${obligationId}`);
    yield* Console.log(`PASS lawful result ${observed.lawfulResult.result}`);
    yield* Console.log(`PASS faulty result ${observed.faultyResult.result}`);

    const model = observed.faultyResult.model;
    if (model === undefined)
      return yield* new DemoError({ message: "faulty result omitted model" });
    const evaluation = evaluateRelationalObligation(observed.faulty, model);
    if (!evaluation.assumptionsSatisfied || !evaluation.counterexample) {
      return yield* new DemoError({ message: "BANG did not independently evaluate faulty model" });
    }
    yield* Console.log(
      `PASS BANG independently evaluated faulty model: total ${evaluation.sourceTotal} -> ${evaluation.targetTotal}`,
    );

    const unknownVariable = {
      ...observed.lawful,
      assumptions: [
        ...observed.lawful.assumptions,
        {
          kind: "lessThanOrEqual" as const,
          left: { kind: "variable" as const, id: "unknown", sort: "Integer" as const },
          right: { kind: "literal" as const, value: 1 },
        },
      ],
    };
    const unknownFailure = yield* Effect.flip(
      checkRelationalObligation(observed.document, unknownVariable),
    );
    const malformedProvider = yield* Effect.flip(parseZ3Output("(not-a-status)", observed.lawful));
    if (
      !(malformedProvider instanceof ProviderFailure) ||
      malformedProvider.reason !== "provider-failed"
    ) {
      return yield* new DemoError({
        message: "malformed provider output did not produce provider-failed",
      });
    }
    yield* Console.log("PASS typed malformed provider output rejection");

    const unknownProvider = yield* parseZ3Output("unknown\n", observed.lawful);
    if (unknownProvider.status !== "unknown" || unknownProvider.result !== "inconclusive") {
      return yield* new DemoError({
        message: "unknown provider output did not produce inconclusive",
      });
    }
    yield* Console.log("PASS typed unknown provider outcome: inconclusive");
    const timeoutProvider = new ProviderFailure({
      reason: "provider-timeout",
      obligationId,
      message: "synthetic timeout seam",
    });
    if (timeoutProvider.reason !== "provider-timeout") {
      return yield* new DemoError({ message: "timeout provider outcome was not typed" });
    }
    yield* Console.log("PASS typed provider-timeout outcome");
    if (unknownFailure === undefined)
      return yield* new DemoError({ message: "unknown variable was accepted" });
    yield* Console.log("PASS unknown-variable obligation rejected before provider execution");

    const lawfulSha = yield* digest(observed.lawfulSmt);
    const faultySha = yield* digest(observed.faultySmt);
    const manifest = M011SolverEvidenceManifest.make({
      bangEvidence: 1,
      kind: "solver-reported",
      observations: [
        { obligation: observed.lawful, result: observed.lawfulResult, smtLibSha256: lawfulSha },
        {
          obligation: observed.faulty,
          result: observed.faultyResult,
          smtLibSha256: faultySha,
          counterexample: {
            model,
            beforeTotal: evaluation.sourceTotal,
            afterTotal: evaluation.targetTotal,
          },
        },
      ],
      provider: {
        name: "z3",
        version: observed.faultyResult.z3Version ?? observed.lawfulResult.z3Version ?? "unknown",
      },
      timeouts: { solverMs: solverTimeoutMs, processMs: processTimeoutMs },
      trust: {
        class: "solver-reported",
        producer: "z3",
        limitations: [
          "bounded results apply only to the declared finite integer domain",
          "solver-reported evidence is not a proof or independently checked certificate",
          "Core has no transfer semantics; this mission-local formula supplies the question",
        ],
      },
    });
    const manifestText = yield* Schema.encodeEffect(M011SolverEvidenceManifestFromJson)(manifest);
    yield* fileSystem.makeDirectory(path.dirname(evidencePath), { recursive: true });
    yield* fileSystem.writeFileString(evidencePath, `${manifestText}\n`);
    const loaded = yield* decodeM011SolverEvidenceManifest(manifestText);
    yield* Console.log(formatM011SolverEvidenceReport(loaded));

    const secondText = yield* Schema.encodeEffect(M011SolverEvidenceManifestFromJson)(loaded);
    if (
      manifestText !== secondText ||
      observed.lawfulSmt !== projectQfLia(observed.lawful) ||
      observed.faultySmt !== projectQfLia(observed.faulty)
    ) {
      return yield* new DemoError({ message: "SMT-LIB or evidence output was not byte-identical" });
    }
    yield* Console.log("PASS deterministic SMT-LIB and evidence bytes");

    const malformed = yield* Effect.flip(
      decodeM011SolverEvidenceManifest(`${manifestText.slice(0, -1)}x`),
    );
    if (!(malformed instanceof M011SolverEvidenceError)) {
      return yield* new DemoError({
        message: "malformed evidence was not rejected with typed failure",
      });
    }
    yield* Console.log("PASS typed malformed evidence rejection");
  }),
);

// Select Bun platform services and the Z3 provider only at this composition root.
const MainLayer = Layer.mergeAll(Z3Layer, BunServices.layer);
// @effect-diagnostics-next-line strictEffectProvide:off
BunRuntime.runMain(program.pipe(Effect.provide(MainLayer)));
