import { CoreDocumentFromJson, validateCore } from "@bang/core";
import {
  M019DecoderConformanceResultFromJson,
  M019SelfCheckEvidenceManifest,
  M019SelfCheckSelectionFromJson,
  checkM019SelfCheckEvidence,
  formatM019SelfCheckReport,
  type M019SelfCheckEvidenceManifest as M019EvidenceManifest,
  type M019SelfCheckSelection,
} from "@bang/evidence";
import { projectEffectData } from "@bang/target-effect";
import { Crypto, Effect, Encoding, FileSystem, Path, Schema, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import { resolveSelfCheckBinding } from "./self-check-bindings.ts";

const BangCheckInputStageSchema = Schema.Literals([
  "selection",
  "core-source",
  "core-validation",
  "declaration",
  "binding",
  "toolchain",
]);

const BangCheckToolVersionsFromJson = Schema.fromJsonString(
  Schema.Struct({
    dependencies: Schema.Struct({ effect: Schema.String }),
    devDependencies: Schema.Struct({ typescript: Schema.String }),
  }),
);

export type BangCheckInputStage = typeof BangCheckInputStageSchema.Type;

export class BangCheckInputError extends Schema.TaggedError<BangCheckInputError>()(
  "BangCheckInputError",
  {
    stage: BangCheckInputStageSchema,
    path: Schema.String,
    message: Schema.String,
  },
) {}

export class BangCheckGenerationError extends Schema.TaggedError<BangCheckGenerationError>()(
  "BangCheckGenerationError",
  {
    stage: Schema.Literal("generation"),
    declaration: Schema.String,
    message: Schema.String,
  },
) {}

export class BangCheckImplementationError extends Schema.TaggedError<BangCheckImplementationError>()(
  "BangCheckImplementationError",
  {
    stage: Schema.Literal("implementation"),
    implementationBinding: Schema.String,
    message: Schema.String,
  },
) {}

export class BangCheckConformanceError extends Schema.TaggedError<BangCheckConformanceError>()(
  "BangCheckConformanceError",
  {
    stage: Schema.Literal("conformance"),
    declaration: Schema.String,
    implementationBinding: Schema.String,
    evidenceClass: Schema.Literal("property-tested"),
    scope: Schema.Literal("sampled"),
    domainPath: Schema.String,
    message: Schema.String,
  },
) {}

export type BangCheckFailure =
  | BangCheckInputError
  | BangCheckGenerationError
  | BangCheckImplementationError
  | BangCheckConformanceError;

export interface BangCheckResult {
  readonly selection: M019SelfCheckSelection;
  readonly evidence: M019EvidenceManifest;
  readonly text: string;
}

const inputError = (
  stage: BangCheckInputStage,
  path: string,
  message: string,
): BangCheckInputError => new BangCheckInputError({ stage, path, message });

const generationError = (declaration: string, message: string): BangCheckGenerationError =>
  new BangCheckGenerationError({ stage: "generation", declaration, message });

const implementationError = (
  implementationBinding: string,
  message: string,
): BangCheckImplementationError =>
  new BangCheckImplementationError({
    stage: "implementation",
    implementationBinding,
    message,
  });

const readText = Effect.fn("bangCheck.readText")(function* (
  filePath: string,
  stage: BangCheckInputStage,
) {
  const fileSystem = yield* FileSystem.FileSystem;
  return yield* fileSystem
    .readFileString(filePath)
    .pipe(
      Effect.mapError((error) =>
        inputError(stage, filePath, error instanceof Error ? error.message : String(error)),
      ),
    );
});

const decodeSelection = (contents: string, filePath: string) =>
  Schema.decodeEffect(M019SelfCheckSelectionFromJson)(contents, {
    onExcessProperty: "error",
  }).pipe(
    Effect.mapError((issue) =>
      inputError("selection", filePath, `invalid M019 self-check selection: ${String(issue)}`),
    ),
  );

const decodeCoreDocument = (contents: string, filePath: string) =>
  Schema.decodeEffect(CoreDocumentFromJson)(contents, {
    onExcessProperty: "error",
  }).pipe(
    Effect.mapError((issue) =>
      inputError("core-source", filePath, `invalid Core document: ${String(issue)}`),
    ),
  );

const decodeToolVersions = (contents: string, filePath: string) =>
  Schema.decodeEffect(BangCheckToolVersionsFromJson)(contents).pipe(
    Effect.mapError((issue) =>
      inputError("toolchain", filePath, `invalid toolchain manifest: ${String(issue)}`),
    ),
  );

const evaluateRunnerSource = (
  adapterImport: string,
  declaration: string,
  seed: number,
  cases: number,
): string => `import { check${declaration}Decoder } from "./${declaration}.ts";
import { bridgeTermDecoder } from ${JSON.stringify(adapterImport)};

const result = check${declaration}Decoder(bridgeTermDecoder, ${JSON.stringify({ seed, numRuns: cases })});
console.log(JSON.stringify(result));
`;

const runEvaluator = Effect.fn("bangCheck.runEvaluator")(function* (
  root: string,
  runnerPath: string,
  bindingId: string,
) {
  const handle = yield* ChildProcess.make("bun", ["run", runnerPath], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  }).pipe(
    Effect.mapError((error) =>
      implementationError(bindingId, `could not start evaluator: ${error}`),
    ),
  );
  const [stdout, stderr, exitCode] = yield* Effect.all(
    [
      handle.stdout.pipe(Stream.decodeText(), Stream.mkString),
      handle.stderr.pipe(Stream.decodeText(), Stream.mkString),
      handle.exitCode,
    ] as const,
    { concurrency: "unbounded" },
  ).pipe(
    Effect.mapError((error) =>
      implementationError(bindingId, `could not collect evaluator result: ${error}`),
    ),
  );
  if (exitCode !== ChildProcessSpawner.ExitCode(0)) {
    return yield* implementationError(
      bindingId,
      stderr.trim() || `self-check evaluator exited ${exitCode}`,
    );
  }
  return yield* Schema.decodeEffect(M019DecoderConformanceResultFromJson)(stdout.trim(), {
    onExcessProperty: "error",
  }).pipe(
    Effect.mapError((issue) =>
      implementationError(bindingId, `invalid evaluator result: ${String(issue)}`),
    ),
  );
}, Effect.scoped);

const digestBytes = Effect.fn("bangCheck.digestBytes")(function* (
  bytes: Uint8Array,
  declaration: string,
) {
  const crypto = yield* Crypto.Crypto;
  const digest = yield* crypto
    .digest("SHA-256", bytes)
    .pipe(
      Effect.mapError((error) =>
        generationError(declaration, `could not digest evidence material: ${error}`),
      ),
    );
  return Encoding.encodeHex(digest);
});

const digestText = (text: string, declaration: string) =>
  digestBytes(new TextEncoder().encode(text), declaration);

const digestRepositoryMaterial = Effect.fn("bangCheck.digestRepositoryMaterial")(function* (
  root: string,
  repositoryPath: string,
  declaration: string,
) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const absolutePath = path.resolve(root, repositoryPath);
  const bytes = yield* fileSystem
    .readFile(absolutePath)
    .pipe(
      Effect.mapError((error) =>
        generationError(
          declaration,
          `could not read material ${repositoryPath}: ${error instanceof Error ? error.message : String(error)}`,
        ),
      ),
    );
  return yield* digestBytes(bytes, declaration);
});

/** Generate, execute, and classify one selected real BANG self-check. */
export const compileSelectedSelfCheck = (
  root: string,
  selectionPath: string,
): Effect.Effect<
  BangCheckResult,
  BangCheckFailure,
  FileSystem.FileSystem | Path.Path | Crypto.Crypto | ChildProcessSpawner.ChildProcessSpawner
> =>
  Effect.scoped(
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const resolvedSelectionPath = path.resolve(root, selectionPath);
      const selection = yield* decodeSelection(
        yield* readText(resolvedSelectionPath, "selection"),
        resolvedSelectionPath,
      );
      const corePath = path.resolve(root, selection.core.path);
      const coreDocument = yield* decodeCoreDocument(
        yield* readText(corePath, "core-source"),
        corePath,
      );
      const checkedCore = yield* validateCore(coreDocument).pipe(
        Effect.mapError((error) => inputError("core-validation", corePath, error.message)),
      );
      const declaration = checkedCore.declarations.find(
        (candidate) => candidate.kind === "data" && candidate.id === selection.core.declaration,
      );
      if (declaration === undefined) {
        return yield* inputError(
          "declaration",
          selection.core.path,
          `checked Core does not contain data:${selection.core.declaration}`,
        );
      }
      const toolchainPath = path.resolve(root, "package.json");
      const toolVersions = yield* decodeToolVersions(
        yield* readText(toolchainPath, "toolchain"),
        toolchainPath,
      );
      const binding = resolveSelfCheckBinding(selection.implementation.binding);
      if (binding === undefined) {
        return yield* inputError(
          "binding",
          resolvedSelectionPath,
          `unsupported implementation binding ${selection.implementation.binding}`,
        );
      }
      if (binding.declarationId !== selection.core.declaration) {
        return yield* inputError(
          "binding",
          resolvedSelectionPath,
          `implementation binding ${binding.id} targets data:${binding.declarationId}, not data:${selection.core.declaration}`,
        );
      }

      const generatedSource = yield* projectEffectData(checkedCore, selection.core.declaration, {
        profile: "runtime",
      }).pipe(
        Effect.mapError((error) => generationError(selection.core.declaration, error.message)),
      );
      const temporaryDirectory = yield* fileSystem
        .makeTempDirectoryScoped({ directory: root, prefix: ".m019-check-" })
        .pipe(
          Effect.mapError((error) =>
            generationError(
              selection.core.declaration,
              `could not create temporary directory: ${error}`,
            ),
          ),
        );
      const generatedPath = path.join(temporaryDirectory, `${selection.core.declaration}.ts`);
      const runnerPath = path.join(temporaryDirectory, "evaluate.ts");
      const adapterPath = path.resolve(root, binding.adapterPath);
      const relativeAdapterPath = path
        .relative(temporaryDirectory, adapterPath)
        .replaceAll("\\", "/");
      const adapterImport = relativeAdapterPath.startsWith(".")
        ? relativeAdapterPath
        : `./${relativeAdapterPath}`;
      const runnerSource = evaluateRunnerSource(
        adapterImport,
        selection.core.declaration,
        selection.evidence.seed,
        selection.evidence.cases,
      );
      yield* fileSystem
        .writeFileString(generatedPath, generatedSource)
        .pipe(
          Effect.mapError((error) =>
            generationError(
              selection.core.declaration,
              `could not write generated boundary: ${error}`,
            ),
          ),
        );
      yield* fileSystem
        .writeFileString(runnerPath, runnerSource)
        .pipe(
          Effect.mapError((error) =>
            generationError(selection.core.declaration, `could not write evaluator: ${error}`),
          ),
        );

      const coreSourceSha256 = yield* digestRepositoryMaterial(
        root,
        selection.core.path,
        selection.core.declaration,
      );
      const implementationSourceSha256 = yield* digestRepositoryMaterial(
        root,
        binding.implementationSourcePath,
        selection.core.declaration,
      );
      const adapterSha256 = yield* digestRepositoryMaterial(
        root,
        binding.adapterPath,
        selection.core.declaration,
      );
      const bindingRegistrySha256 = yield* digestRepositoryMaterial(
        root,
        "apps/bang/src/self-check-bindings.ts",
        selection.core.declaration,
      );
      const observations = yield* runEvaluator(root, runnerPath, binding.id);
      const materials = [
        {
          role: "core-source" as const,
          path: selection.core.path,
          sha256: coreSourceSha256,
        },
        {
          role: "generated-boundary" as const,
          path: `temporary/M019/${selection.core.declaration}.ts`,
          sha256: yield* digestText(generatedSource, selection.core.declaration),
        },
        {
          role: "implementation-source" as const,
          path: binding.implementationSourcePath,
          sha256: implementationSourceSha256,
        },
        {
          role: "adapter" as const,
          path: binding.adapterPath,
          sha256: adapterSha256,
        },
        {
          role: "binding-registry" as const,
          path: "apps/bang/src/self-check-bindings.ts",
          sha256: bindingRegistrySha256,
        },
        {
          role: "evaluator" as const,
          path: "temporary/M019/evaluate.ts",
          sha256: yield* digestText(runnerSource, selection.core.declaration),
        },
      ];
      const manifest = M019SelfCheckEvidenceManifest.make({
        bangEvidence: 1,
        mission: "M019",
        kind: "property-tested-self-check",
        declarationIdentity: {
          path: selection.core.path,
          declaration: selection.core.declaration,
        },
        implementationBinding: { binding: binding.id },
        targetProfile: selection.target.profile,
        observations,
        materials,
        versions: {
          provider: `effect@${toolVersions.dependencies.effect}`,
          target: `effect-typescript@${toolVersions.devDependencies.typescript}`,
          runtime: `bun@${Bun.version}`,
        },
        qualification: {
          assumptions: [
            "Effect Schema.toArbitrary and FastCheck supply the recorded generation and shrinking behavior",
            "the child evaluator reports every result produced by the generated boundary",
          ],
          targetWeakening: [
            "bounded generated cases are sampled evidence, not exhaustive or proven decoder equivalence",
            "unsafe TypeScript, foreign JavaScript, or direct calls can bypass the generated boundary",
          ],
          lifetime: "valid while the recorded material digests and versions remain unchanged",
          invalidators: [
            "Core declaration or implementation binding changes",
            "generated boundary, adapter, registry, evaluator, policy, or tool version changes",
            "unobserved bypass or fabricated evaluator output",
          ],
        },
      });
      const evidence = yield* checkM019SelfCheckEvidence(manifest).pipe(
        Effect.mapError((error) =>
          generationError(selection.core.declaration, `invalid fresh evidence: ${error.message}`),
        ),
      );
      const failedLane = !evidence.observations.valid.passed
        ? evidence.observations.valid
        : !evidence.observations.invalid.passed
          ? evidence.observations.invalid
          : undefined;
      if (failedLane !== undefined) {
        return yield* new BangCheckConformanceError({
          stage: "conformance",
          declaration: `data:${selection.core.declaration}`,
          implementationBinding: binding.id,
          evidenceClass: "property-tested",
          scope: "sampled",
          domainPath: failedLane.counterexamplePath ?? selection.core.declaration,
          message: "generated decoder conformance property failed",
        });
      }
      return {
        selection,
        evidence,
        text: formatM019SelfCheckReport(evidence),
      };
    }),
  );

/** Format one typed self-check failure without losing semantic identities. */
export const formatBangCheckFailure = (failure: BangCheckFailure): string => {
  switch (failure._tag) {
    case "BangCheckInputError":
      return [
        "M019 self-check failed",
        `Stage: ${failure.stage}`,
        `Path: ${failure.path}`,
        `Diagnostic: ${failure.message}`,
      ].join("\n");
    case "BangCheckGenerationError":
      return [
        "M019 self-check failed",
        `Stage: ${failure.stage}`,
        `Declaration: data:${failure.declaration}`,
        `Diagnostic: ${failure.message}`,
      ].join("\n");
    case "BangCheckImplementationError":
      return [
        "M019 self-check failed",
        `Stage: ${failure.stage}`,
        `Implementation binding: ${failure.implementationBinding}`,
        `Diagnostic: ${failure.message}`,
      ].join("\n");
    case "BangCheckConformanceError":
      return [
        "M019 self-check failed",
        `Stage: ${failure.stage}`,
        `Declaration: ${failure.declaration}`,
        `Implementation binding: ${failure.implementationBinding}`,
        `Evidence: ${failure.evidenceClass}; scope: ${failure.scope}`,
        `Domain path: ${failure.domainPath}`,
        `Diagnostic: ${failure.message}`,
      ].join("\n");
  }
};
