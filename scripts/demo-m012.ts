import { CoreDocumentFromJson, type CoreDocument, validateCore } from "@bang/core";
import { sourceToCore } from "@bang/surface";
import {
  decodeM005BridgeEvidenceManifest,
  decodeM009PortabilityEvidenceManifest,
  decodeM010ReplayManifest,
  decodeM011SolverEvidenceManifest,
  formatM012SystemReport,
  M012SystemReportError,
  M012SystemReportFromJson,
  M012SystemSelectionFromJson,
  compileM012SystemReport,
  PropertyTestEvidenceRecordFromJson,
  RuntimeTraceEvidenceRecordFromJson,
} from "@bang/evidence";
import { BunRuntime, BunServices } from "@effect/platform-bun";
import { Console, Effect, FileSystem, Layer, Path, Schema } from "effect";

const corePaths = [
  "examples/tiny-bank/core/balance.json",
  "examples/tiny-bank/account.bang",
  "examples/tiny-bank/core/account-ledger-bridge.json",
] as const;
const selectionPath = "examples/tiny-bank/system/account-ledger.json";
const reportPath = ".bang/evidence/M012.json";

class DemoError extends Schema.TaggedError<DemoError>()("DemoError", {
  message: Schema.String,
}) {}

const readCore = Effect.fn("demoM012.readCore")(function* (sourcePath: string) {
  const fileSystem = yield* FileSystem.FileSystem;
  return yield* Schema.decodeEffect(CoreDocumentFromJson)(
    yield* fileSystem.readFileString(sourcePath),
  );
});
const readSourceCore = Effect.fn("demoM012.readSourceCore")(function* (sourcePath: string) {
  const fileSystem = yield* FileSystem.FileSystem;
  return yield* Effect.fromResult(sourceToCore(yield* fileSystem.readFileString(sourcePath)));
});

const mergeCoreDocuments = (documents: ReadonlyArray<CoreDocument>): CoreDocument => ({
  bangCore: 1,
  declarations: documents.flatMap(({ declarations }) => declarations),
});

const loadM012Inputs = Effect.fn("demoM012.loadInputs")(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const sources: CoreDocument[] = [
    yield* readCore(corePaths[0]),
    yield* readSourceCore(corePaths[1]),
    yield* readCore(corePaths[2]),
  ];

  const checkedCore = yield* validateCore(mergeCoreDocuments(sources));
  if (checkedCore.declarations.length !== 8) {
    return yield* new DemoError({
      message: `expected eight declarations, got ${checkedCore.declarations.length}`,
    });
  }

  const selection = yield* Schema.decodeEffect(M012SystemSelectionFromJson)(
    yield* fileSystem.readFileString(selectionPath),
  );
  const bridgeEvidence = yield* decodeM005BridgeEvidenceManifest(
    yield* fileSystem.readFileString(selection.evidence.bridge),
  );
  const propertyEvidence = yield* Schema.decodeEffect(PropertyTestEvidenceRecordFromJson)(
    yield* fileSystem.readFileString(selection.evidence.property),
  );
  const runtimeEvidence = yield* Schema.decodeEffect(RuntimeTraceEvidenceRecordFromJson)(
    yield* fileSystem.readFileString(selection.evidence.runtime),
  );
  const portabilityEvidence = yield* decodeM009PortabilityEvidenceManifest(
    yield* fileSystem.readFileString(selection.evidence.portability),
  );
  const replayEvidence = yield* decodeM010ReplayManifest(
    yield* fileSystem.readFileString(selection.evidence.replay),
  );
  const solverEvidence = yield* decodeM011SolverEvidenceManifest(
    yield* fileSystem.readFileString(selection.evidence.solver),
  );

  return {
    selection,
    checkedCore,
    bridgeEvidence,
    propertyEvidence,
    runtimeEvidence,
    portabilityEvidence,
    replayEvidence,
    solverEvidence,
  };
});

const program = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const input = yield* loadM012Inputs();

  yield* Console.log("PASS parsed/decoded three selected Core sources");
  yield* Console.log("PASS validated eight stable Core declarations");
  yield* Console.log(`PASS strictly loaded selection ${input.selection.id}`);
  yield* Console.log("PASS strictly loaded selection and six typed evidence manifests");

  const report = yield* compileM012SystemReport(input);
  const reportJson = yield* Schema.encodeEffect(M012SystemReportFromJson)(report);
  yield* fileSystem.makeDirectory(path.dirname(reportPath), { recursive: true });
  yield* fileSystem.writeFileString(reportPath, `${reportJson}\n`);
  const reportBytes = yield* fileSystem.readFileString(reportPath);
  if (reportBytes !== `${reportJson}\n`) {
    return yield* new DemoError({ message: "M012 report file bytes changed during write" });
  }
  const reloadedReport = yield* Schema.decodeEffect(M012SystemReportFromJson)(
    yield* fileSystem.readFileString(reportPath),
  );
  const reloadedJson = yield* Schema.encodeEffect(M012SystemReportFromJson)(reloadedReport);
  if (reloadedJson !== reportJson) {
    return yield* new DemoError({ message: "strict M012 report reload changed its JSON bytes" });
  }
  yield* Console.log(`PASS compiled and strictly reloaded ${reportPath}`);
  yield* Console.log(formatM012SystemReport(reloadedReport));

  const inconsistentSelection = {
    ...input.selection,
    selection: {
      ...input.selection.selection,
      participantModels: input.selection.selection.participantModels.map((participant) =>
        participant.participant === "ledger"
          ? {
              participant: participant.participant,
              theory: participant.theory,
              realization: "InconsistentLedgerBalance",
            }
          : participant,
      ),
    },
  };
  const rejection = yield* Effect.flip(
    compileM012SystemReport({
      ...input,
      selection: inconsistentSelection,
    }),
  );
  if (
    !(rejection instanceof M012SystemReportError) ||
    rejection.reason !== "bridge-law-failed" ||
    rejection.identity !== "AccountLedger.balancesAgree" ||
    !rejection.message.includes("counterexample")
  ) {
    return yield* new DemoError({
      message: `unexpected inconsistent bridge rejection: ${String(rejection)}`,
    });
  }
  yield* Console.log(
    `PASS rejected InconsistentLedgerBalance: ${rejection.reason} (${rejection.identity})`,
  );

  const secondInput = yield* loadM012Inputs();
  const secondReport = yield* compileM012SystemReport(secondInput);
  const secondJson = yield* Schema.encodeEffect(M012SystemReportFromJson)(secondReport);
  if (secondJson !== reportJson) {
    return yield* new DemoError({ message: "M012 report JSON was not byte-identical" });
  }
  yield* Console.log("PASS deterministic M012 report bytes");
});

const MainLayer = Layer.mergeAll(BunServices.layer);
// @effect-diagnostics-next-line strictEffectProvide:off
BunRuntime.runMain(program.pipe(Effect.provide(MainLayer)));
