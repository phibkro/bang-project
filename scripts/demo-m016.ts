import { CheckedCoreDocumentFromJson } from "@bang/core";
import {
  decodeM011SolverEvidenceManifest,
  decodeM016DualProviderEvidenceManifest,
  formatM016DualProviderEvidenceReport,
  M016DualProviderEvidenceError,
  M016DualProviderEvidenceManifest,
  M016DualProviderEvidenceManifestFromJson,
  verifyM016EvidenceMaterials,
} from "@bang/evidence";
import {
  deriveTransferPreservationObligation,
  LeanLayer,
  LeanProvider,
  LeanProviderFailure,
  LEAN_ARCHIVE_SHA256,
  LEAN_FAULTY_THEOREM_ID,
  LEAN_IMPORTED_MODULE,
  LEAN_LAWFUL_THEOREM_ID,
  LEAN_PROVIDER_COMMAND,
  LEAN_VERSION,
  projectLeanModule,
  type LeanProviderObservation,
  type RelationalObligation,
} from "@bang/obligations";
import { BunRuntime, BunServices } from "@effect/platform-bun";
import { Console, Crypto, Effect, FileSystem, Layer, Path, Schema } from "effect";

const corePath = "examples/tiny-bank/core/account-ledger-bridge.json";
const solverEvidencePath = ".bang/evidence/M011.json";
const leanPath = "generated/lean/AccountLedgerTransfer.lean";
const evidencePath = ".bang/evidence/M016.json";

class DemoError extends Schema.TaggedError<DemoError>()("DemoError", {
  message: Schema.String,
}) {}

const digest = Effect.fn("demoM016.digest")(function* (text: string) {
  const crypto = yield* Crypto.Crypto;
  return Buffer.from(yield* crypto.digest("SHA-256", new TextEncoder().encode(text))).toString(
    "hex",
  );
});

const requireObservation = (
  observations: ReadonlyArray<LeanProviderObservation>,
  variant: "lawful" | "faulty",
): Effect.Effect<LeanProviderObservation, DemoError> => {
  const observation = observations.find((candidate) => candidate.variant === variant);
  return observation === undefined
    ? Effect.fail(new DemoError({ message: `Lean provider omitted ${variant} observation` }))
    : Effect.succeed(observation);
};

const normalizedDigest = (obligation: RelationalObligation) => digest(JSON.stringify(obligation));

const qualification = {
  assumptions: [
    "Lean 4.30.0 and its imported environment implement their reported versions",
    "the BANG-to-Lean translation preserves this normalized relational obligation",
  ],
  limitations: [
    "the Lean kernel and imported axioms are part of the trust boundary",
    "the generated proposition is not independently verified against Core semantics",
  ],
  unsupportedClaims: [
    {
      claim: "Effect implementation conformance",
      reason: "the theorem targets the abstract relational obligation, not generated Effect code",
    },
    {
      claim: "Rust implementation conformance",
      reason: "the theorem targets the abstract relational obligation, not generated Rust code",
    },
  ],
  lifetime: "valid while the normalized obligation and every bound artifact remain unchanged",
  invalidators: [
    "checked Core source changes",
    "normalized obligation changes",
    "generated Lean source changes",
    "Lean toolchain or imported environment changes",
  ],
} as const;

const program = Effect.scoped(
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const provider = yield* LeanProvider;

    const coreText = yield* fileSystem.readFileString(corePath);
    const checked = yield* Schema.decodeEffect(CheckedCoreDocumentFromJson)(coreText);
    const lawful = yield* deriveTransferPreservationObligation(checked, "lawful", {
      coreSource: corePath,
    });
    const faulty = yield* deriveTransferPreservationObligation(checked, "faulty", {
      coreSource: corePath,
    });
    const projection = projectLeanModule({ lawful, faulty });
    const secondProjection = projectLeanModule({ lawful, faulty });
    if (projection.source !== secondProjection.source) {
      return yield* new DemoError({ message: "Lean projection was not byte-identical" });
    }
    yield* fileSystem.makeDirectory(path.dirname(leanPath), { recursive: true });
    yield* fileSystem.writeFileString(leanPath, projection.source);
    yield* Console.log("PASS projected one deterministic unbounded Lean module");

    const kernelResult = yield* provider.run({ lawful, faulty });
    const lawfulKernel = yield* requireObservation(kernelResult.observations, "lawful");
    const faultyKernel = yield* requireObservation(kernelResult.observations, "faulty");
    if (lawfulKernel.result !== "kernel-proven" || faultyKernel.result !== "kernel-refuted") {
      return yield* new DemoError({ message: "Lean provider returned an impossible result pair" });
    }
    yield* Console.log(`PASS Lean ${kernelResult.leanVersion} kernel-checked lawful theorem`);
    yield* Console.log("PASS Lean kernel-checked explicit faulty-claim refutation");

    const brokenLawful = {
      ...lawful,
      claim: {
        kind: "equal" as const,
        left: { kind: "literal" as const, value: 0 },
        right: { kind: "literal" as const, value: 1 },
      },
    };
    const brokenFailure = yield* Effect.flip(provider.run({ lawful: brokenLawful, faulty }));
    if (
      !(brokenFailure instanceof LeanProviderFailure) ||
      brokenFailure.reason !== "provider-failed"
    ) {
      return yield* new DemoError({
        message: "broken Lean theorem did not fail as provider-failed",
      });
    }
    yield* Console.log("PASS broken theorem failed without becoming a refutation");

    const solverText = yield* fileSystem.readFileString(solverEvidencePath).pipe(
      Effect.mapError(
        () =>
          new DemoError({
            message: `missing ${solverEvidencePath}; run bun run demo:m011 first`,
          }),
      ),
    );
    const solver = yield* decodeM011SolverEvidenceManifest(solverText);
    const solverLawful = solver.observations.find(
      ({ obligation }) => obligation.variant === "lawful",
    )?.obligation;
    const solverFaulty = solver.observations.find(
      ({ obligation }) => obligation.variant === "faulty",
    )?.obligation;
    if (
      JSON.stringify(solverLawful) !== JSON.stringify(lawful) ||
      JSON.stringify(solverFaulty) !== JSON.stringify(faulty)
    ) {
      return yield* new DemoError({
        message: `${solverEvidencePath} does not describe the freshly derived M016 obligations`,
      });
    }
    const [coreSha256, lawfulSha256, faultySha256, leanSha256] = yield* Effect.all(
      [
        digest(coreText),
        normalizedDigest(lawful),
        normalizedDigest(faulty),
        digest(projection.source),
      ] as const,
      { concurrency: "unbounded" },
    );
    const provenance = (normalizedObligationSha256: string) => ({
      coreSource: { path: corePath, sha256: coreSha256 },
      normalizedObligationSha256,
      generatedLean: { path: leanPath, sha256: leanSha256 },
    });
    const manifest = M016DualProviderEvidenceManifest.make({
      bangEvidence: 1,
      mission: "M016",
      kind: "dual-provider-relational-evidence",
      solver,
      kernelProof: {
        kind: "kernel-proof",
        provider: {
          name: "lean",
          version: LEAN_VERSION,
          archiveSha256: LEAN_ARCHIVE_SHA256,
          imports: [
            {
              module: LEAN_IMPORTED_MODULE,
              version: LEAN_VERSION,
              sha256: LEAN_ARCHIVE_SHA256,
            },
          ],
          command: LEAN_PROVIDER_COMMAND,
        },
        observations: [
          {
            obligation: { id: lawful.id, variant: lawful.variant },
            theorem: {
              id: LEAN_LAWFUL_THEOREM_ID,
              result: "kernel-proven",
              axioms: lawfulKernel.axioms,
            },
            provenance: provenance(lawfulSha256),
            qualification,
          },
          {
            obligation: { id: faulty.id, variant: faulty.variant },
            theorem: {
              id: LEAN_FAULTY_THEOREM_ID,
              result: "kernel-refuted",
              axioms: faultyKernel.axioms,
            },
            provenance: provenance(faultySha256),
            qualification,
            refutation: {
              witness: {
                sourceBefore: 1,
                targetBefore: 0,
                amount: 1,
                sourceAfter: 0,
                targetAfter: 2,
              },
              beforeTotal: 1,
              afterTotal: 2,
            },
          },
        ],
        trust: {
          class: "kernel-checked",
          producer: "lean-kernel",
          limitations: [
            "kernel acceptance is conditional on Lean's implementation and imported axioms",
          ],
        },
      },
    });
    const manifestText = yield* Schema.encodeEffect(M016DualProviderEvidenceManifestFromJson)(
      manifest,
    );
    const checkedManifest = yield* decodeM016DualProviderEvidenceManifest(manifestText);
    const secondText = yield* Schema.encodeEffect(M016DualProviderEvidenceManifestFromJson)(
      checkedManifest,
    );
    yield* verifyM016EvidenceMaterials(checkedManifest);
    if (manifestText !== secondText) {
      return yield* new DemoError({ message: "M016 evidence was not byte-identical" });
    }

    const wrongTheorem = {
      ...manifest,
      kernelProof: {
        ...manifest.kernelProof,
        // Immutable evidence fixtures intentionally replace one nested observation.
        // oxlint-disable-next-line no-map-spread
        observations: manifest.kernelProof.observations.map((observation) =>
          observation.obligation.variant === "lawful"
            ? {
                ...observation,
                theorem: { ...observation.theorem, id: LEAN_FAULTY_THEOREM_ID },
              }
            : observation,
        ),
      },
    };
    const identityFailure = yield* Effect.flip(
      decodeM016DualProviderEvidenceManifest(wrongTheorem),
    );
    if (
      !(identityFailure instanceof M016DualProviderEvidenceError) ||
      identityFailure.reason !== "identity-mismatch"
    ) {
      return yield* new DemoError({ message: "wrong theorem identity was not rejected" });
    }
    yield* Console.log("PASS strict evidence rejected wrong theorem identity");

    yield* fileSystem.makeDirectory(path.dirname(evidencePath), { recursive: true });
    yield* fileSystem.writeFileString(evidencePath, `${manifestText}\n`);
    yield* Console.log("PASS wrote and strictly reloaded deterministic M016 evidence");
    yield* Console.log(formatM016DualProviderEvidenceReport(checkedManifest));
  }),
);

const MainLayer = Layer.mergeAll(LeanLayer, BunServices.layer);
// @effect-diagnostics-next-line strictEffectProvide:off
BunRuntime.runMain(program.pipe(Effect.provide(MainLayer)));
