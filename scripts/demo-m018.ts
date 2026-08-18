import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { validateCore } from "@bang/core";
import { sourceToCore } from "@bang/surface";
import { projectEffectSingleUseOperationRealization } from "@bang/target-effect";
import {
  checkM018SingleUseCapabilityEvidenceManifest,
  decodeM018SingleUseCapabilityEvidenceManifest,
  formatM018SingleUseCapabilityEvidenceReport,
  M018SingleUseCapabilityEvidenceManifest,
  M018SingleUseCapabilityEvidenceManifestFromJson,
  M018_TARGET_WEAKENINGS,
  verifyM018SingleUseCapabilityEvidenceMaterials,
} from "@bang/evidence";
import { BunServices } from "@effect/platform-bun";
import { Effect, Schema } from "effect";

const root = resolve(import.meta.dir, "..");
const sourcePath = "examples/tiny-bank/account.bang";
const generatedPath = "generated/effect/WithdrawAccountOnce.ts";
const snapshotPath = "tests/snapshots/M018-WithdrawAccountOnce.ts";
const realizationPath = "examples/tiny-bank/capability/account-withdrawal-once-effect.ts";
const diagnosticPath = "examples/tiny-bank/capability/single-use-diagnostics.ts";
const evidencePath = ".bang/evidence/M018.json";
const resultPrefix = "BANG_M018_RESULT|";

type ChildResult = {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
};

type DiagnosticState = { readonly balance: number };
type DiagnosticOutcome =
  | {
      readonly _tag: "Success";
      readonly state: DiagnosticState;
      readonly remainingUses: number;
      readonly implementationCalls: number;
    }
  | {
      readonly _tag: "DomainRejected";
      readonly failure: "WithdrawalRejectedOnce";
      readonly state: DiagnosticState;
      readonly amount: number;
      readonly remainingUses: number;
      readonly implementationCalls: number;
    }
  | {
      readonly _tag: "CapabilityUseRejected";
      readonly failure: "DebitAccountGrantAlreadyConsumed";
      readonly state: DiagnosticState;
      readonly amount: number;
      readonly remainingUses: number;
      readonly implementationCalls: number;
    }
  | {
      readonly _tag: "WrongDestination";
      readonly destination: string;
      readonly expectedDestination: string;
      readonly state: DiagnosticState;
      readonly amount: number;
      readonly remainingUses: number;
      readonly implementationCalls: number;
    }
  | {
      readonly _tag: "Defect";
      readonly failure: string;
      readonly state: DiagnosticState;
      readonly amount: number;
      readonly defect: string;
      readonly remainingUses: number;
      readonly implementationCalls: number;
    };
type DiagnosticCall = {
  readonly sequence: number;
  readonly invocationId: string;
  readonly grantId: string;
  readonly destination: string;
  readonly amount: number;
  readonly preState: DiagnosticState;
  readonly remainingUsesBefore: number;
  readonly outcome: DiagnosticOutcome;
};
type DiagnosticPayload = {
  readonly entityId: string;
  readonly initialState: DiagnosticState;
  readonly grantId: string;
  readonly first: DiagnosticCall;
  readonly second: DiagnosticCall;
  readonly wrongDestination: {
    readonly grantId: string;
    readonly remainingUsesBefore: number;
    readonly outcome: DiagnosticOutcome;
  };
  readonly disabled: {
    readonly grantId: string;
    readonly remainingUsesBefore: number;
    readonly outcome: DiagnosticOutcome;
  };
  readonly defect: {
    readonly grantId: string;
    readonly first: DiagnosticCall;
    readonly reuse: DiagnosticCall;
  };
};

type EvidenceCall = M018SingleUseCapabilityEvidenceManifest["observation"]["calls"][number];
type EvidenceOutcome = EvidenceCall["outcome"];

const run = async (argv: readonly string[]): Promise<ChildResult> => {
  const child = Bun.spawn([...argv], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { exitCode, stdout, stderr };
};

const sha256 = async (path: string): Promise<string> =>
  createHash("sha256")
    .update(await Bun.file(resolve(root, path)).bytes())
    .digest("hex");

const parseCheckedCore = async () => {
  const source = await Bun.file(resolve(root, sourcePath)).text();
  return Effect.runSync(Effect.fromResult(sourceToCore(source)).pipe(Effect.flatMap(validateCore)));
};

const readDiagnostic = async (): Promise<DiagnosticPayload> => {
  const result = await run(["bun", "run", diagnosticPath]);
  if (result.exitCode !== 0) {
    throw new Error(`M018 diagnostic failed: ${result.stderr || result.stdout}`);
  }
  const lines = result.stdout.split("\n").filter((line) => line.startsWith(resultPrefix));
  if (lines.length !== 1) {
    throw new Error(`expected exactly one ${resultPrefix} line, found ${lines.length}`);
  }
  const payload = lines[0]?.slice(resultPrefix.length);
  if (payload === undefined) throw new Error("M018 diagnostic payload is missing");
  return JSON.parse(payload) as DiagnosticPayload;
};

const toEvidenceOutcome = (outcome: DiagnosticOutcome): EvidenceOutcome => {
  switch (outcome._tag) {
    case "Success":
      return {
        _tag: "Success",
        state: { balance: Number(outcome.state.balance) },
        remainingUses: Number(outcome.remainingUses),
        implementationCalls: Number(outcome.implementationCalls),
      };
    case "DomainRejected":
      return {
        _tag: "DomainRejected",
        failure: "WithdrawalRejectedOnce",
        state: { balance: Number(outcome.state.balance) },
        remainingUses: Number(outcome.remainingUses),
        implementationCalls: Number(outcome.implementationCalls),
      };
    case "CapabilityUseRejected":
      return {
        _tag: "CapabilityUseRejected",
        failure: "DebitAccountGrantAlreadyConsumed",
        state: { balance: Number(outcome.state.balance) },
        remainingUses: Number(outcome.remainingUses),
        implementationCalls: Number(outcome.implementationCalls),
      };
    case "Defect":
      return {
        _tag: "Defect",
        failure: "implementation-defect",
        state: { balance: Number(outcome.state.balance) },
        remainingUses: Number(outcome.remainingUses),
        implementationCalls: Number(outcome.implementationCalls),
      };
    case "WrongDestination":
      throw new Error("wrong-destination observations are diagnostic negatives, not trace calls");
  }
};

const toEvidenceCall = (call: DiagnosticCall): EvidenceCall => ({
  sequence: Number(call.sequence),
  invocationId: String(call.invocationId),
  grantId: String(call.grantId),
  destination: String(call.destination),
  amount: Number(call.amount),
  preState: { balance: Number(call.preState.balance) },
  remainingUsesBefore: Number(call.remainingUsesBefore),
  outcome: toEvidenceOutcome(call.outcome),
});

const buildManifest = async (diagnostic: DiagnosticPayload) =>
  M018SingleUseCapabilityEvidenceManifest.make({
    bangEvidence: 1,
    mission: "M018",
    version: 1,
    kind: "single-use-capability-runtime",
    source: {
      stateMachine: "Account",
      operation: "withdraw",
      realization: "WithdrawAccountOnce",
      capability: "DebitAccount",
      quantity: { kind: "exactly", uses: "1" },
      failure: "WithdrawalRejectedOnce",
    },
    observation: {
      class: "runtime-checked",
      result: "passed",
      scope: "single-grant-two-call-trace",
      entityId: String(diagnostic.entityId),
      initialState: { balance: Number(diagnostic.initialState.balance) },
      grantId: String(diagnostic.grantId),
      calls: [toEvidenceCall(diagnostic.first), toEvidenceCall(diagnostic.second)],
      defect: {
        grantId: String(diagnostic.defect.grantId),
        first: toEvidenceCall(diagnostic.defect.first),
        reuse: toEvidenceCall(diagnostic.defect.reuse),
      },
    },
    provenance: {
      coreSource: { path: sourcePath, sha256: await sha256(sourcePath) },
      generatedBoundary: { path: generatedPath, sha256: await sha256(generatedPath) },
      realization: { path: realizationPath, sha256: await sha256(realizationPath) },
      evaluator: "scripts/demo-m018.ts",
    },
    producer: {
      identity: "bun run scripts/demo-m018.ts",
      trust: "assumed-truthful",
    },
    qualification: {
      assumptions: [
        "the selected checked realization and the independent implementation are the executed boundary",
        "the diagnostic process reports the generated boundary without an unobserved bypass",
      ],
      weakenings: [...M018_TARGET_WEAKENINGS],
      lifetime:
        "valid while the checked Core source, generated boundary, realization, and evaluator remain unchanged",
      invalidators: [
        "Core declaration, quantity, or failure identity changes",
        "generated boundary or independent realization changes",
        "runtime order, implementation call trace, or target dependency changes",
      ],
    },
  });

const assert = (condition: boolean, message: string): void => {
  if (!condition) throw new Error(message);
};

const main = async (): Promise<void> => {
  const preparation = await run(["bun", "run", "scripts/prepare-m018.ts"]);
  assert(
    preparation.exitCode === 0,
    `M018 preparation failed: ${preparation.stderr || preparation.stdout}`,
  );
  console.log("PASS prepared deterministic M018 Effect boundary");

  const checkedCore = await parseCheckedCore();
  const identities = checkedCore.declarations.map(({ kind, id }) => `${kind}:${id}`);
  assert(
    identities.join("\n") ===
      [
        "stateMachine:Account",
        "capability:DebitAccount",
        "operationRealization:WithdrawAccount",
        "operationRealization:WithdrawAccountOnce",
      ].join("\n"),
    `unexpected checked declaration identities: ${identities.join(", ")}`,
  );
  console.log("PASS checked Account, DebitAccount, WithdrawAccount, WithdrawAccountOnce");

  const projection = Effect.runSync(
    projectEffectSingleUseOperationRealization(checkedCore, "WithdrawAccountOnce"),
  );
  assert(projection.length > 0, "M018 projection returned empty source");
  const generated = await Bun.file(resolve(root, generatedPath)).text();
  const snapshot = await Bun.file(resolve(root, snapshotPath)).text();
  assert(generated === snapshot, `generated M018 boundary differs from ${snapshotPath}`);
  console.log("PASS generated boundary matches deterministic M018 snapshot");
  const diagnostic = await readDiagnostic();
  const { disabled, wrongDestination } = diagnostic;
  assert(
    diagnostic.first.outcome._tag === "Success" &&
      diagnostic.first.outcome.state.balance === 6 &&
      diagnostic.first.outcome.remainingUses === 0 &&
      diagnostic.first.outcome.implementationCalls === 1,
    "first authorized withdrawal did not consume exactly one grant use",
  );
  assert(
    diagnostic.second.outcome._tag === "CapabilityUseRejected" &&
      diagnostic.second.outcome.state.balance === 6 &&
      diagnostic.second.outcome.remainingUses === 0 &&
      diagnostic.second.outcome.implementationCalls === 1,
    "grant reuse reached the implementation or changed state",
  );
  assert(
    diagnostic.defect.first.outcome._tag === "Defect" &&
      diagnostic.defect.first.outcome.implementationCalls === 1 &&
      diagnostic.defect.reuse.outcome._tag === "CapabilityUseRejected" &&
      diagnostic.defect.reuse.outcome.implementationCalls === 1,
    "implementation defect restored the consumed grant",
  );
  console.log("PASS consumed one grant and rejected reuse before implementation");
  console.log("PASS implementation defect did not restore consumed authority");

  assert(
    wrongDestination.remainingUsesBefore === 1 &&
      wrongDestination.outcome._tag === "WrongDestination" &&
      wrongDestination.outcome.state.balance === 10 &&
      wrongDestination.outcome.remainingUses === 1 &&
      wrongDestination.outcome.implementationCalls === 0,
    "wrong destination consumed a grant, changed state, or reached the implementation",
  );
  assert(
    disabled.remainingUsesBefore === 1 &&
      disabled.outcome._tag === "DomainRejected" &&
      disabled.outcome.state.balance === 10 &&
      disabled.outcome.remainingUses === 1 &&
      disabled.outcome.implementationCalls === 0,
    "disabled transition consumed a grant, changed state, or reached the implementation",
  );
  console.log("PASS destination and enabled checks preserve fresh grants");

  const manifest = await buildManifest(diagnostic);
  const checkedManifest = await Effect.runPromise(
    checkM018SingleUseCapabilityEvidenceManifest(manifest, checkedCore),
  );
  const json = await Effect.runPromise(
    Schema.encodeEffect(M018SingleUseCapabilityEvidenceManifestFromJson)(manifest),
  );
  const evidenceFile = Bun.file(resolve(root, evidencePath));
  await Bun.write(evidenceFile, `${json}\n`);
  const reloaded = await Effect.runPromise(
    decodeM018SingleUseCapabilityEvidenceManifest(await evidenceFile.text()),
  );
  assert(
    (await Effect.runPromise(
      Schema.encodeEffect(M018SingleUseCapabilityEvidenceManifestFromJson)(reloaded),
    )) === json,
    "M018 evidence JSON changed after strict reload",
  );
  await Effect.runPromise(
    verifyM018SingleUseCapabilityEvidenceMaterials(manifest).pipe(
      // The demo composition root supplies Bun's FileSystem and Crypto services.
      // @effect-diagnostics-next-line strictEffectProvide:off
      Effect.provide(BunServices.layer),
    ),
  );
  console.log(`PASS checked and reloaded deterministic ${evidencePath}`);
  console.log(formatM018SingleUseCapabilityEvidenceReport(checkedManifest));
};

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
