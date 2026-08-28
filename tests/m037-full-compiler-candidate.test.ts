import { createHash } from "node:crypto";
import { chmod, cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { BunServices } from "@effect/platform-bun";
import { encodeCanonicalJson } from "@bang/core";
import type { Path } from "effect";
import { Crypto, Effect, FileSystem, PlatformError, Schema } from "effect";
import { ChildProcessSpawner } from "effect/unstable/process";
import {
  M037CandidateFailureSchema,
  M037_DIGEST_FAILURE_BUILDERS,
  M037FullCompilerCandidateReportFromJson,
  M037FullCompilerCandidateSelectionSchema,
  M037_ISOLATION_LOADER_SOURCE,
  decodeSelection,
  executeM037ArtifactProcess,
  inspectM037ArtifactResolution,
  preflightHost,
  projectM037ExternalConsumerResult,
  projectM037FailureProcess,
  publishM037Entries,
  runM037ClassificationProjection,
  scanFiles,
  validateM037ArtifactInvocation,
  validateM037PublicationPaths,
  validateM037ReportDigests,
  sha256Bytes,
  validateM037RunComparison,
  validateM037UnsupportedClaims,
  type M037ArtifactInvocation,
  type M037CandidateFailure,
  type M037DigestFailureStage,
  type M037FullCompilerCandidateReport,
  type RuntimeBoundary,
} from "../scripts/m037-full-compiler-candidate.ts";

const workspaceRoot = resolve(import.meta.dir, "..");
const candidateCommand = [
  process.execPath,
  "run",
  "scripts/m037-full-compiler-candidate.ts",
  "examples/clinic/full-candidate.json",
] as const;
const decodeCommand = [
  process.execPath,
  "run",
  "scripts/m037-full-compiler-candidate.ts",
  "--decode",
  ".bang/evidence/M037.json",
] as const;
let candidateRoot: string;
let temporaryCheckoutParent: string;
const reportPath = () => join(candidateRoot, ".bang/evidence/M037.json");
const rawSha256 = (bytes: Uint8Array | string): string =>
  createHash("sha256").update(bytes).digest("hex");
const sha256 = (bytes: Uint8Array | string): `sha256:${string}` => `sha256:${rawSha256(bytes)}`;
const decodeFailure = Schema.decodeUnknownSync(M037CandidateFailureSchema);
const actualPaths = {
  git: Bun.which("git"),
  bash: Bun.which("bash"),
  just: Bun.which("just"),
  nix: Bun.which("nix"),
};
for (const [name, path] of Object.entries(actualPaths)) {
  if (path === null) throw new Error(`M037 focused fixtures require ${name}`);
}

interface CommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

const runCommand = async (
  command: ReadonlyArray<string>,
  cwd: string,
  environment: Readonly<Record<string, string>> = process.env as Record<string, string>,
): Promise<CommandResult> => {
  const child = Bun.spawn({
    cmd: [...command],
    cwd,
    env: { ...environment },
    stdin: "ignore",
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

const validateCliFailure = (actual: CommandResult, expected: M037CandidateFailure): void => {
  expect(actual).toEqual({
    exitCode: 1,
    stdout: "",
    stderr: `${encodeCanonicalJson(expected)}\n`,
  });
  const decoded = decodeFailure(JSON.parse(actual.stderr));
  expect(decoded).toEqual(expected);
};

type Mutable<T> =
  T extends ReadonlyArray<infer Value>
    ? Array<Mutable<Value>>
    : T extends object
      ? { -readonly [Key in keyof T]: Mutable<T[Key]> }
      : T;

type MutableReport = Mutable<M037FullCompilerCandidateReport>;

const sha256Canonical = (value: unknown): `sha256:${string}` => sha256(encodeCanonicalJson(value));

const recomputeReportLocalDigests = (report: MutableReport): void => {
  const inventorySha256 = sha256Canonical(report.producerInventory);
  report.cleanRun.firstInventorySha256 = inventorySha256;
  report.cleanRun.secondInventorySha256 = inventorySha256;
  const comparison = report.embeddedRecords.producerInventoryComparison.value;
  comparison.firstInventorySha256 = inventorySha256;
  comparison.secondInventorySha256 = inventorySha256;

  const observationsSha256 = sha256Canonical([
    report.embeddedRecords.theoryApplicability.value,
    report.embeddedRecords.artifactIsolation.value,
    report.embeddedRecords.audit.value,
    report.embeddedRecords.schemaCustody.value,
    report.embeddedRecords.externalConsumerIsolation.value,
  ]);
  comparison.firstObservationsSha256 = observationsSha256;
  comparison.secondObservationsSha256 = observationsSha256;

  for (const record of Object.values(report.embeddedRecords))
    record.sha256 = sha256Canonical(record.value);

  const digestByPath = new Map<string, `sha256:${string}`>([
    ...report.producerInventory.map(
      ({ path, sha256: digest }) => [path, digest as `sha256:${string}`] as const,
    ),
    ...Object.values(report.embeddedRecords).map(
      ({ path, sha256: digest }) => [path, digest as `sha256:${string}`] as const,
    ),
  ]);
  for (const references of [
    ...report.claims.map(({ sourceReferences }) => sourceReferences),
    ...report.scorecard.map(({ currentSourceReferences }) => currentSourceReferences),
  ]) {
    for (const reference of references) {
      const digest = digestByPath.get(reference.path);
      if (digest === undefined)
        throw new Error(`no authoritative digest for report source ${reference.path}`);
      reference.sha256 = digest;
    }
  }
};

const validateLocallyCoherentReport = async (encoded: string): Promise<void> => {
  const decoded = Schema.decodeSync(M037FullCompilerCandidateReportFromJson)(encoded);
  await Effect.runPromise(
    validateM037ReportDigests(decoded, M037_DIGEST_FAILURE_BUILDERS.decode).pipe(
      // Test execution is the composition root for the Crypto service.
      // @effect-diagnostics-next-line strictEffectProvide:off
      Effect.provide(BunServices.layer),
    ),
  );
};

const withReplacedReport = async <Value>(
  encoded: string,
  use: () => Promise<Value>,
): Promise<Value> => {
  const original = await readFile(reportPath());
  try {
    await writeFile(reportPath(), encoded);
    return await use();
  } finally {
    await writeFile(reportPath(), original);
  }
};

const withExternalSymlink = async <Value>(
  sourcePath: string,
  use: () => Promise<Value>,
): Promise<Value> => {
  const original = await readFile(sourcePath);
  const outside = await mkdtemp(join(tmpdir(), "bang-m037-source-symlink-"));
  const target = join(outside, "outside-source");
  let restoreSource = false;
  try {
    await writeFile(target, original);
    await rm(sourcePath);
    restoreSource = true;
    await symlink(target, sourcePath);
    return await use();
  } finally {
    if (restoreSource) {
      await rm(sourcePath, { force: true });
      await writeFile(sourcePath, original);
    }
    await rm(outside, { recursive: true, force: true });
  }
};

const toProcessResult = (result: CommandResult) => ({
  ...result,
  exitCode: ChildProcessSpawner.ExitCode(result.exitCode),
});

const snapshotPublishedBytes = async () => {
  const reportBytes = await readFile(reportPath(), "utf8");
  const report = Schema.decodeSync(M037FullCompilerCandidateReportFromJson)(reportBytes);
  return Promise.all(
    report.outputInventory.map(async ({ path }) => ({
      path,
      sha256: sha256(await readFile(join(candidateRoot, path))),
    })),
  );
};

const validateFailureProjection = async (
  failure: M037CandidateFailure,
): Promise<M037CandidateFailure> => {
  const projection = await Effect.runPromise(projectM037FailureProcess(failure));
  expect(projection).toMatchObject({ exitCode: 1, stdout: "" });
  expect(projection.stderr).toBe(`${encodeCanonicalJson(failure)}\n`);
  const decoded = decodeFailure(JSON.parse(projection.stderr));
  expect(decoded).toEqual(failure);
  expect(decoded.message.length).toBeGreaterThan(0);
  return decoded;
};

const candidateFailure = async <A>(
  effect: Effect.Effect<
    A,
    M037CandidateFailure,
    FileSystem.FileSystem | Path.Path | Crypto.Crypto | ChildProcessSpawner.ChildProcessSpawner
  >,
): Promise<M037CandidateFailure> => {
  const before = await snapshotPublishedBytes();
  const failure = await Effect.runPromise(
    Effect.flip(
      effect.pipe(
        // Test execution is the composition root for real filesystem, crypto, and process services.
        // @effect-diagnostics-next-line strictEffectProvide:off
        Effect.provide(BunServices.layer),
      ),
    ),
  );
  const decoded = await validateFailureProjection(failure);
  expect(await snapshotPublishedBytes()).toEqual(before);
  return decoded;
};

const installWrapper = async (
  directory: string,
  name: "git" | "bash" | "just" | "nix",
  body: string,
): Promise<void> => {
  const executable = join(directory, name);
  await writeFile(executable, `#!${actualPaths.bash}\nset -euo pipefail\n${body}\n`);
  await chmod(executable, 0o755);
};

const preflightFailure = async (
  runtimeChanges: Partial<RuntimeBoundary>,
  wrapper?: { readonly name: "git" | "bash" | "just" | "nix"; readonly body: string },
): Promise<M037CandidateFailure> => {
  const parent = await mkdtemp(join(tmpdir(), "bang-m037-preflight-fixture-"));
  try {
    const bin = join(parent, "bin");
    await mkdir(bin);
    if (wrapper !== undefined)
      await installWrapper(
        bin,
        wrapper.name,
        wrapper.body.replace("__M037_PROBE_LOG__", join(parent, "probe-path")),
      );
    const runtime: RuntimeBoundary = {
      platform: "linux",
      architecture: "x64",
      bunVersion: "1.3.13",
      executablePath: process.execPath,
      environment: { PATH: `${bin}:${process.env.PATH ?? ""}` },
      scriptDirectory: join(candidateRoot, "scripts"),
      ...runtimeChanges,
    };
    const failure = await candidateFailure(
      preflightHost(candidateRoot, runtime, join(parent, "scope")),
    );
    if (wrapper?.name === "git") {
      const probePath = await readFile(join(parent, "probe-path"), "utf8");
      const worktrees = await runCommand(
        [actualPaths.git!, "worktree", "list", "--porcelain"],
        candidateRoot,
      );
      expect(worktrees.exitCode).toBe(0);
      expect(worktrees.stdout).not.toContain(probePath);
      expect(await Bun.file(probePath).exists()).toBe(false);
    }
    return failure;
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
};

const classificationFailure = (selectionPath: string) =>
  candidateFailure(runM037ClassificationProjection(candidateRoot, selectionPath));

const makeConsumerSandbox = async (): Promise<{
  readonly directory: string;
  readonly evidence: {
    readonly materials: ReadonlyArray<{
      readonly path: string;
      readonly role: string;
      readonly sha256: string;
    }>;
  };
}> => {
  const directory = await mkdtemp(join(tmpdir(), "bang-m037-consumer-fixture-"));
  await cp(join(candidateRoot, "dist/schemas/2"), join(directory, "publication"), {
    recursive: true,
  });
  await mkdir(join(directory, "inputs/materials"), { recursive: true });
  await cp(
    join(candidateRoot, ".bang/theory-locks/clinic-packaged-exact-one.json"),
    join(directory, "inputs/clinic.lock.json"),
  );
  const evidencePath = join(
    candidateRoot,
    ".bang/qualifications/clinic-two-qualified-exact-one/effect-typescript/evidence.json",
  );
  await cp(evidencePath, join(directory, "inputs/effect-typescript.evidence.json"));
  const evidence = JSON.parse(await readFile(evidencePath, "utf8")) as {
    readonly materials: ReadonlyArray<{
      readonly path: string;
      readonly role: string;
      readonly sha256: string;
    }>;
  };
  await Promise.all(
    evidence.materials.map(async (material) => {
      const destination = join(directory, "inputs/materials", material.path);
      await mkdir(dirname(destination), { recursive: true });
      await cp(join(candidateRoot, material.path), destination);
    }),
  );
  await cp(
    join(candidateRoot, "examples/clinic/external-consumer/consumer.mjs"),
    join(directory, "consumer.mjs"),
  );
  await writeFile(join(directory, "isolation-loader.mjs"), M037_ISOLATION_LOADER_SOURCE);
  return { directory, evidence };
};

const runConsumer = (directory: string) =>
  runCommand(
    [
      pinnedNodePath,
      "--no-warnings",
      "--experimental-loader",
      join(directory, "isolation-loader.mjs"),
      join(directory, "consumer.mjs"),
    ],
    directory,
    {
      BANG_M037_MODULE_LOG: join(directory, "module-loads.jsonl"),
      BANG_M037_SANDBOX_ROOT: directory,
      HOME: directory,
      LANG: "C.UTF-8",
      PATH: dirname(pinnedNodePath),
    },
  );

let firstReportBytes: string;
let escriptPath: string;
let pinnedNodePath: string;
let hostileTempDirectory: string;
let observedExternalWorktreePaths: ReadonlyArray<string> = [];
beforeAll(async () => {
  temporaryCheckoutParent = await mkdtemp(join("/tmp", "bang-m037-test-"));
  candidateRoot = join(temporaryCheckoutParent, "checkout");
  const checkout = await runCommand(
    [actualPaths.git!, "worktree", "add", "--detach", candidateRoot, "HEAD"],
    workspaceRoot,
  );
  if (checkout.exitCode !== 0)
    throw new Error(`could not create M037 test checkout: ${checkout.stderr}`);
  await symlink(join(workspaceRoot, "node_modules"), join(candidateRoot, "node_modules"), "dir");
  hostileTempDirectory = join(candidateRoot, "hostile-tmp");
  await mkdir(hostileTempDirectory);
  const wrapperBin = join(temporaryCheckoutParent, "candidate-bin");
  const worktreeLog = join(temporaryCheckoutParent, "candidate-worktrees");
  await mkdir(wrapperBin);
  await installWrapper(
    wrapperBin,
    "git",
    `if [[ "$1" == "worktree" && "\${2:-}" == "add" ]]; then
  if [[ "\${4:-}" == "--no-checkout" ]]; then
    printf '%s\\n' "$5" >> ${worktreeLog}
  else
    printf '%s\\n' "$4" >> ${worktreeLog}
  fi
fi
exec ${actualPaths.git} "$@"`,
  );
  const result = await runCommand(candidateCommand, candidateRoot, {
    ...(process.env as Record<string, string>),
    PATH: `${wrapperBin}:${process.env.PATH ?? ""}`,
    TMPDIR: hostileTempDirectory,
  });
  if (
    result.exitCode !== 0 ||
    result.stderr !== "" ||
    result.stdout !== ".bang/evidence/M037.json\n"
  )
    throw new Error(
      `M037 positive fixture failed: exit=${result.exitCode}; stdout=${JSON.stringify(result.stdout)}; stderr=${JSON.stringify(result.stderr)}`,
    );
  observedExternalWorktreePaths = (await readFile(worktreeLog, "utf8")).trim().split("\n");
  firstReportBytes = await readFile(reportPath(), "utf8");
  const report = Schema.decodeSync(M037FullCompilerCandidateReportFromJson)(firstReportBytes);
  escriptPath = report.embeddedRecords.artifactIsolation.value.escriptRealPath;
  const nodeClosure = await runCommand(
    [
      actualPaths.nix!,
      "build",
      "--no-link",
      "--print-out-paths",
      "--extra-experimental-features",
      "nix-command flakes",
      "github:NixOS/nixpkgs/adf428a7cfbb66e9b5cb5cdd2df8a659c2df1052#nodejs_24",
    ],
    candidateRoot,
  );
  const nodeOutputs = nodeClosure.stdout.trim().split("\n");
  if (nodeClosure.exitCode !== 0 || nodeOutputs.length !== 1 || nodeOutputs[0] === "")
    throw new Error(`could not resolve pinned M037 Node: ${nodeClosure.stderr}`);
  pinnedNodePath = join(nodeOutputs[0]!, "bin/node");
  const nodeVersion = await runCommand([pinnedNodePath, "--version"], candidateRoot);
  if (nodeVersion.exitCode !== 0 || nodeVersion.stdout !== "v24.7.0\n")
    throw new Error(`pinned M037 Node version is invalid: ${nodeVersion.stdout}`);
}, 180_000);

afterAll(async () => {
  if (candidateRoot !== undefined) {
    await runCommand(
      [actualPaths.git!, "worktree", "remove", "--force", candidateRoot],
      workspaceRoot,
    );
  }
  if (temporaryCheckoutParent !== undefined)
    await rm(temporaryCheckoutParent, { recursive: true, force: true });
}, 60_000);

describe("M037 full compiler candidate", () => {
  test("keeps hostile /tmp placement external and rejects a non-x86_64-linux host", async () => {
    expect(await preflightFailure({ architecture: "arm64" })).toMatchObject({
      stage: "preflight",
      reason: "unsupported-platform",
    });
    expect(candidateRoot.startsWith("/tmp/")).toBe(true);
    expect(hostileTempDirectory.startsWith(`${candidateRoot}/`)).toBe(true);
    expect(observedExternalWorktreePaths).toHaveLength(3);
    for (const worktreePath of observedExternalWorktreePaths) {
      expect(worktreePath.startsWith("/tmp/")).toBe(true);
      expect(worktreePath === candidateRoot || worktreePath.startsWith(`${candidateRoot}/`)).toBe(
        false,
      );
    }
  });

  test("rejects injected Bun 1.3.12", async () => {
    expect(await preflightFailure({ bunVersion: "1.3.12" })).toMatchObject({
      stage: "preflight",
      reason: "bun-version-unsupported",
    });
  });

  test("projects a real failed detached-worktree process", async () => {
    const body = `if [[ "$1" == "worktree" && "\${2:-}" == "add" ]]; then\n  ${actualPaths.git} "$@"\n  printf '%s' "$5" > __M037_PROBE_LOG__\n  exit 73\nfi\nexec ${actualPaths.git} "$@"`;
    const failure = await preflightFailure({}, { name: "git", body });
    expect(failure).toMatchObject({
      stage: "preflight",
      reason: "git-worktree-unavailable",
      command: "git worktree add --detach --no-checkout <probe> HEAD",
    });
  });

  test("projects a real failed Bash strict-mode token process", async () => {
    const body = `if [[ "$1" == "-euo" ]]; then exit 74; fi\nexec ${actualPaths.bash} "$@"`;
    expect(await preflightFailure({}, { name: "bash", body })).toMatchObject({
      stage: "preflight",
      reason: "bash-unavailable",
      command: "bash -euo pipefail -c <probe>",
    });
  });

  test("rejects a real Just 1.57.0 process observation", async () => {
    const body = `if [[ "$1" == "--version" ]]; then printf 'just 1.57.0\\n'; exit 0; fi\nexec ${actualPaths.just} "$@"`;
    expect(await preflightFailure({}, { name: "just", body })).toMatchObject({
      stage: "preflight",
      reason: "just-version-unsupported",
    });
  });

  test("projects a real failed Nix version process", async () => {
    const body = `if [[ "$1" == "--version" ]]; then exit 75; fi\nexec ${actualPaths.nix} "$@"`;
    expect(await preflightFailure({}, { name: "nix", body })).toMatchObject({
      stage: "preflight",
      reason: "nix-unavailable",
      command: "nix --version",
    });
  });

  test("rejects a combined-toolchain escript path", async () => {
    const directory = "/tmp/m037-artifact";
    const erlangBin = "/nix/store/00000000000000000000000000000000-gleam-erlang/bin";
    const failure = await candidateFailure(
      validateM037ArtifactInvocation(
        {
          executable: `${erlangBin}/escript`,
          arguments: ["exact_one"],
          cwd: directory,
          environment: {
            HOME: directory,
            LANG: "C.UTF-8",
            PATH: erlangBin,
            ERL_ROOTDIR: dirname(erlangBin),
            ERL_CRASH_DUMP_SECONDS: "0",
          },
        },
        directory,
        erlangBin,
        dirname(erlangBin),
      ),
    );
    expect(failure).toMatchObject({ stage: "artifact", reason: "runtime-boundary-violated" });
  });

  test("rejects a changed artifact argument vector", async () => {
    const directory = "/tmp/m037-artifact";
    const erlangRoot = "/nix/store/00000000000000000000000000000000-erlang-29.0.5/lib/erlang";
    const erlangBin = dirname(dirname(erlangRoot)) + "/bin";
    const invocation: M037ArtifactInvocation = {
      executable: `${erlangBin}/escript`,
      arguments: ["changed"],
      cwd: directory,
      environment: {
        HOME: directory,
        LANG: "C.UTF-8",
        PATH: erlangBin,
        ERL_ROOTDIR: erlangRoot,
        ERL_CRASH_DUMP_SECONDS: "0",
      },
    };
    const failure = await candidateFailure(
      validateM037ArtifactInvocation(invocation, directory, erlangBin, erlangRoot),
    );
    expect(failure).toMatchObject({ stage: "artifact", reason: "runtime-boundary-violated" });
  });

  test("observes a real workspace sentinel through the artifact working directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "bang-m037-artifact-resolution-"));
    try {
      const artifactDirectory = join(root, "artifact");
      const erlangBin = join(root, "erlang-bin");
      await mkdir(artifactDirectory);
      await mkdir(erlangBin);
      await mkdir(join(artifactDirectory, "packages"));
      const failure = await candidateFailure(
        inspectM037ArtifactResolution(artifactDirectory, erlangBin),
      );
      expect(failure).toMatchObject({
        stage: "artifact",
        reason: "runtime-boundary-violated",
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("strictly rejects an excess property in the real candidate file path", async () => {
    const root = await mkdtemp(join(tmpdir(), "bang-m037-selection-"));
    try {
      const candidatePath = "examples/clinic/full-candidate.json";
      await mkdir(dirname(join(root, candidatePath)), { recursive: true });
      await writeFile(
        join(root, candidatePath),
        JSON.stringify({
          bangFullCompilerCandidate: 1,
          id: "clinic-full-compiler-candidate",
          assemblySelection: "examples/clinic/assemblies/supervised-exact-one.json",
          externalConsumer: "examples/clinic/external-consumer/consumer.mjs",
          unexpected: true,
        }),
      );
      expect(await candidateFailure(decodeSelection(root, candidatePath))).toMatchObject({
        stage: "selection",
        reason: "invalid-selection",
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("projects the foreign realization as M037 classify/producer-failed", async () => {
    expect(
      await classificationFailure("examples/clinic/realizations/foreign-realization.json"),
    ).toMatchObject({
      stage: "classify",
      reason: "producer-failed",
      path: "examples/clinic/realizations/foreign-realization.json",
      cause: {
        _tag: "ClassificationFailure",
        reason: "missing-declaration",
        address: "operationRealization:WithdrawAccountOnce",
      },
    });
  });

  test("projects the unsupported two-field target as M037 classify/producer-failed", async () => {
    expect(
      await classificationFailure("examples/clinic/realizations/unsupported-two-state-fields.json"),
    ).toMatchObject({
      stage: "classify",
      reason: "producer-failed",
      path: "examples/clinic/realizations/unsupported-two-state-fields.json",
      cause: {
        _tag: "ClassificationFailure",
        reason: "unsupported-target",
        address: "stateMachine:AppointmentBook",
      },
    });
  });

  test("projects a first-byte bit flip of the real copied producer escript", async () => {
    const directory = await mkdtemp(join(tmpdir(), "bang-m037-damaged-escript-"));
    try {
      const copiedArtifactPath = join(directory, "exact_one");
      await cp(
        join(candidateRoot, ".bang/assemblies/clinic-supervised-exact-one/bin/exact_one"),
        copiedArtifactPath,
      );
      const damagedBytes = await readFile(copiedArtifactPath);
      const firstByte = damagedBytes[0];
      if (firstByte === undefined) throw new Error("real producer escript is empty");
      damagedBytes[0] = firstByte ^ 0x01;
      await writeFile(copiedArtifactPath, damagedBytes);
      const invocation: M037ArtifactInvocation = {
        executable: escriptPath,
        arguments: ["exact_one"],
        cwd: directory,
        environment: {
          HOME: directory,
          LANG: "C.UTF-8",
          PATH: dirname(escriptPath),
          ERL_ROOTDIR: join(dirname(dirname(escriptPath)), "lib/erlang"),
          ERL_CRASH_DUMP_SECONDS: "0",
        },
      };
      expect(await candidateFailure(executeM037ArtifactProcess(invocation))).toMatchObject({
        stage: "artifact",
        reason: "execution-failed",
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("projects a real M035 custody rejection with exact cause fields", async () => {
    const fixture = await makeConsumerSandbox();
    try {
      const boundary = fixture.evidence.materials.find(
        ({ role }) => role === "generated-effect-boundary",
      );
      if (boundary === undefined) throw new Error("missing generated Effect boundary material");
      const materialPath = join(fixture.directory, "inputs/materials", boundary.path);
      const damagedMaterial = `${await readFile(materialPath, "utf8")}\n`;
      await writeFile(materialPath, damagedMaterial);
      const result = await runConsumer(fixture.directory);
      const failure = await candidateFailure(
        projectM037ExternalConsumerResult(toProcessResult(result)),
      );
      expect(failure).toEqual({
        bangFullCompilerCandidateFailure: 1,
        stage: "external-consumer",
        reason: "consumer-rejected",
        message: "external consumer returned a rejected verdict",
        path: "consumer.mjs",
        cause: {
          _tag: "M035RejectedVerdict",
          stage: "custody",
          reason: "digest-mismatch",
          message: `supplied bytes differ from the recorded digest for ${boundary.path}`,
          path: boundary.path,
          expected: boundary.sha256,
          observed: rawSha256(damagedMaterial),
        },
      });
    } finally {
      await rm(fixture.directory, { recursive: true, force: true });
    }
  });

  test("projects a real M035 strict evidence decode rejection", async () => {
    const fixture = await makeConsumerSandbox();
    try {
      const evidencePath = join(fixture.directory, "inputs/effect-typescript.evidence.json");
      const evidence = JSON.parse(await readFile(evidencePath, "utf8")) as Record<string, unknown>;
      await writeFile(evidencePath, JSON.stringify({ ...evidence, unexpected: true }));
      const result = await runConsumer(fixture.directory);
      const failure = await candidateFailure(
        projectM037ExternalConsumerResult(toProcessResult(result)),
      );
      expect(failure).toEqual({
        bangFullCompilerCandidateFailure: 1,
        stage: "external-consumer",
        reason: "consumer-rejected",
        message: "external consumer returned a rejected verdict",
        path: "consumer.mjs",
        cause: {
          _tag: "M035RejectedVerdict",
          stage: "decode",
          reason: "decode-failed",
          message: "strict decoder rejected evidence document at ${options.evidencePath}",
          path: "inputs/effect-typescript.evidence.json",
        },
      });
    } finally {
      await rm(fixture.directory, { recursive: true, force: true });
    }
  });

  test("projects a real outside-import loader rejection as process-failed", async () => {
    const fixture = await makeConsumerSandbox();
    const outside = await mkdtemp(join(tmpdir(), "bang-m037-outside-module-"));
    try {
      const outsideModule = join(outside, "outside.mjs");
      const evaluationSentinel = join(outside, "evaluated");
      await writeFile(
        outsideModule,
        `import { writeFileSync } from "node:fs";
writeFileSync(${JSON.stringify(evaluationSentinel)}, "evaluated\\n");
export const outside = true;
`,
      );
      const consumerPath = join(fixture.directory, "consumer.mjs");
      const consumer = await readFile(consumerPath, "utf8");
      const outsideUrl = pathToFileURL(outsideModule).href;
      await writeFile(consumerPath, `import ${JSON.stringify(outsideUrl)};\n${consumer}`);
      const result = await runConsumer(fixture.directory);
      expect(result.exitCode).not.toBe(0);
      expect(result.stdout).toBe("");
      expect(await Bun.file(evaluationSentinel).exists()).toBe(false);
      const moduleLog = await readFile(join(fixture.directory, "module-loads.jsonl"), "utf8");
      expect(moduleLog).not.toContain(outsideUrl);
      expect(moduleLog).not.toContain(outsideModule);
      expect(moduleLog).not.toContain("outside.mjs");
      const failure = await candidateFailure(
        projectM037ExternalConsumerResult(toProcessResult(result)),
      );
      expect(failure).toMatchObject({
        stage: "external-consumer",
        reason: "process-failed",
      });
    } finally {
      await rm(fixture.directory, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });

  test("rejects a real unsupported-claim upgrade", async () => {
    const failure = await candidateFailure(
      validateM037UnsupportedClaims([
        ...Array.from({ length: 11 }, (_, index) => ({
          id: `C${String(index + 1).padStart(2, "0")}`,
          claim: "fixture current claim",
          disposition: "warranted" as const,
          sourceReferences: [],
        })),
        {
          id: "C12",
          claim: "unsupported",
          disposition: "warranted",
          sourceReferences: [],
        },
      ]),
    );
    expect(failure).toMatchObject({
      stage: "accumulation",
      reason: "unsupported-claim-upgraded",
    });
  });

  test("mutates the real second-run src/main.gleam row in the ordered 21-row inventory", async () => {
    const path = ".bang/assemblies/clinic-supervised-exact-one/src/main.gleam";
    const report = Schema.decodeSync(M037FullCompilerCandidateReportFromJson)(firstReportBytes);
    const firstInventory = report.producerInventory.map(({ path: entryPath, sha256: digest }) => ({
      path: entryPath,
      sha256: digest as `sha256:${string}`,
    }));
    expect(firstInventory).toHaveLength(21);
    const differingIndex = firstInventory.findIndex((entry) => entry.path === path);
    const firstEntry = firstInventory[differingIndex];
    if (firstEntry === undefined) throw new Error(`real producer inventory omits ${path}`);
    const realBytes = await readFile(join(candidateRoot, path));
    const firstSha256 = sha256(realBytes);
    expect(firstEntry.sha256).toBe(firstSha256);
    const secondRunBytes = new Uint8Array(realBytes);
    const firstByte = secondRunBytes[0];
    if (firstByte === undefined) throw new Error(`real producer ${path} is empty`);
    secondRunBytes[0] = firstByte ^ 0x01;
    const secondSha256 = sha256(secondRunBytes);
    const secondInventory = firstInventory.map((entry, index) =>
      index === differingIndex ? { ...entry, sha256: secondSha256 } : { ...entry },
    );
    expect(secondInventory.map((entry) => entry.path)).toEqual(
      firstInventory.map((entry) => entry.path),
    );
    const observations = [
      report.embeddedRecords.theoryApplicability.value,
      report.embeddedRecords.artifactIsolation.value,
      report.embeddedRecords.audit.value,
      report.embeddedRecords.schemaCustody.value,
      report.embeddedRecords.externalConsumerIsolation.value,
    ] as const;
    const comparison = report.embeddedRecords.producerInventoryComparison.value;
    expect(sha256(encodeCanonicalJson(firstInventory))).toBe(
      comparison.firstInventorySha256 as `sha256:${string}`,
    );
    const failure = await candidateFailure(
      validateM037RunComparison(
        {
          inventory: firstInventory,
          inventorySha256: comparison.firstInventorySha256 as `sha256:${string}`,
          observations,
          observationsSha256: comparison.firstObservationsSha256 as `sha256:${string}`,
        },
        {
          inventory: secondInventory,
          inventorySha256: sha256(encodeCanonicalJson(secondInventory)),
          observations,
          observationsSha256: comparison.secondObservationsSha256 as `sha256:${string}`,
        },
      ),
    );
    expect(failure).toMatchObject({
      stage: "comparison",
      reason: "producer-inventory-diverged",
      firstDifferingPath: path,
      firstSha256,
      secondSha256,
    });
  });

  test("fails the last rename of all 22 real publication paths and restores every byte", async () => {
    const fixture = await makePublicationFailureFixture(false);
    try {
      expect(fixture.paths).toHaveLength(22);
      expect(fixture.failure).toMatchObject({
        stage: "publication",
        reason: "publication-failed",
        path: fixture.failedPath,
        cause: {
          _tag: "PublicationFailure",
          stage: "publication",
          path: fixture.failedPath,
          reason: "publication-failed",
        },
      });
      expect(fixture.after).toEqual(fixture.before);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  test("maps a failed rollback restore without claiming unchanged bytes", async () => {
    const fixture = await makePublicationFailureFixture(true);
    try {
      expect(fixture.paths).toHaveLength(22);
      expect(fixture.failure).toMatchObject({
        stage: "publication",
        reason: "rollback-failed",
        path: fixture.failedPath,
        cause: {
          _tag: "PublicationFailure",
          stage: "publication",
          path: fixture.failedPath,
          reason: "rollback-failed",
        },
      });
      expect(fixture.after).not.toEqual(fixture.before);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  test("strictly source-binds public decode and rejects tampering and symlink escapes", async () => {
    const report = Schema.decodeSync(M037FullCompilerCandidateReportFromJson)(firstReportBytes);
    expect(report.publicationPlan.enumeratedFiles).toBe(22);
    expect(() =>
      Schema.decodeSync(M037FullCompilerCandidateReportFromJson)(
        JSON.stringify({ ...report, unexpected: true }),
      ),
    ).toThrow();
    const digestTampered = {
      ...report,
      embeddedRecords: {
        ...report.embeddedRecords,
        artifactIsolation: {
          ...report.embeddedRecords.artifactIsolation,
          value: {
            ...report.embeddedRecords.artifactIsolation.value,
            escriptSha256: `sha256:${"0".repeat(64)}` as const,
          },
        },
      },
    };
    const decodedDigestTampered = Schema.decodeSync(M037FullCompilerCandidateReportFromJson)(
      JSON.stringify(digestTampered),
    );
    expect(
      await candidateFailure(
        validateM037ReportDigests(decodedDigestTampered, M037_DIGEST_FAILURE_BUILDERS.decode),
      ),
    ).toMatchObject({
      stage: "decode",
      reason: "report-invalid",
    });

    expect(await runCommand(decodeCommand, candidateRoot)).toEqual({
      exitCode: 0,
      stdout: ".bang/evidence/M037.json: valid\n",
      stderr: "",
    });

    const forgedE02 = structuredClone(report) as unknown as MutableReport;
    forgedE02.embeddedRecords.artifactIsolation.value.observation.validCall = false;
    recomputeReportLocalDigests(forgedE02);
    const encodedE02 = encodeCanonicalJson(forgedE02);
    await validateLocallyCoherentReport(encodedE02);
    const expectedE02Failure = decodeFailure({
      bangFullCompilerCandidateFailure: 1,
      stage: "decode",
      reason: "report-invalid",
      message: "embedded artifact observation differs from live Gleam evidence",
      path: "embedded/artifact-isolation.json",
    });
    const actualE02Failure = await withReplacedReport(encodedE02, () =>
      runCommand(decodeCommand, candidateRoot),
    );
    validateCliFailure(actualE02Failure, expectedE02Failure);

    const forgedE07 = structuredClone(report) as unknown as MutableReport;
    const applicability = forgedE07.embeddedRecords.theoryApplicability.value.result;
    if (applicability._tag !== "Applicable") throw new Error("M037 E07 must be Applicable");
    const obligation = applicability.obligations[0];
    if (obligation === undefined) throw new Error("M037 E07 must contain one obligation");
    obligation.statement = "forged exact-one obligation";
    recomputeReportLocalDigests(forgedE07);
    const encodedE07 = encodeCanonicalJson(forgedE07);
    await validateLocallyCoherentReport(encodedE07);
    const expectedE07Failure = decodeFailure({
      bangFullCompilerCandidateFailure: 1,
      stage: "decode",
      reason: "report-invalid",
      message: "embedded theory applicability differs from live semantic artifact",
      path: "embedded/theory-applicability.json",
    });
    const actualE07Failure = await withReplacedReport(encodedE07, () =>
      runCommand(decodeCommand, candidateRoot),
    );
    validateCliFailure(actualE07Failure, expectedE07Failure);

    const selectionPath = "examples/clinic/full-candidate.json";
    const expectedSelectionFailure = decodeFailure({
      bangFullCompilerCandidateFailure: 1,
      stage: "selection",
      reason: "unsafe-path",
      message: `${selectionPath} contains a symbolic-link path component`,
      path: selectionPath,
    });
    const actualSelectionFailure = await withExternalSymlink(
      join(candidateRoot, selectionPath),
      () => runCommand(candidateCommand, candidateRoot),
    );
    validateCliFailure(actualSelectionFailure, expectedSelectionFailure);

    const publicReportPath = ".bang/evidence/M037.json";
    const expectedReportFailure = decodeFailure({
      bangFullCompilerCandidateFailure: 1,
      stage: "decode",
      reason: "report-invalid",
      message: `${publicReportPath} contains a symbolic-link path component`,
      path: publicReportPath,
    });
    const actualReportFailure = await withExternalSymlink(reportPath(), () =>
      runCommand(decodeCommand, candidateRoot),
    );
    validateCliFailure(actualReportFailure, expectedReportFailure);
  });

  test("scans symlinks without following loops and reports a stale member unchanged", async () => {
    const scanRoot = await mkdtemp(join(tmpdir(), "bang-m037-stale-scan-"));
    try {
      await mkdir(join(scanRoot, "owned"));
      await writeFile(join(scanRoot, "owned/extra.txt"), "stale\n");
      await symlink(".", join(scanRoot, "owned/loop"));
      expect(
        await Effect.runPromise(
          // Test execution is the composition root for staged platform services.
          // @effect-diagnostics-next-line strictEffectProvide:off
          scanFiles(scanRoot, "owned").pipe(Effect.provide(BunServices.layer)),
        ),
      ).toEqual(["owned/extra.txt", "owned/loop"]);
      expect(
        await candidateFailure(
          validateM037PublicationPaths(scanRoot, [
            {
              path: "owned/loop/escaped.txt",
              bytes: new TextEncoder().encode("must not publish\n"),
            },
          ]),
        ),
      ).toMatchObject({ stage: "accumulation", reason: "report-invalid" });
    } finally {
      await rm(scanRoot, { recursive: true, force: true });
    }

    const stalePath = join(
      candidateRoot,
      ".bang/qualifications/clinic-two-qualified-exact-one/unlisted-stale.txt",
    );
    const staleBytes = "unlisted stale bytes\n";
    await writeFile(stalePath, staleBytes);
    try {
      const repeated = await runCommand(candidateCommand, candidateRoot);
      expect(repeated).toMatchObject({
        exitCode: 0,
        stdout: ".bang/evidence/M037.json\n",
        stderr: "",
      });
      const report = Schema.decodeSync(M037FullCompilerCandidateReportFromJson)(
        await readFile(reportPath(), "utf8"),
      );
      expect(report.publicationPlan.staleMembers).toContain(
        ".bang/qualifications/clinic-two-qualified-exact-one/unlisted-stale.txt",
      );
      expect(await readFile(stalePath, "utf8")).toBe(staleBytes);
    } finally {
      await rm(stalePath, { force: true });
    }
  }, 180_000);

  test("keeps stage and reason pairs strict", async () => {
    expect(() =>
      decodeFailure({
        bangFullCompilerCandidateFailure: 1,
        stage: "selection",
        reason: "nix-unavailable",
        message: "cross-stage pair",
      }),
    ).toThrow();
    const digestError = PlatformError.systemError({
      _tag: "Unknown",
      module: "Crypto",
      method: "digest",
      description: "injected digest failure",
    });
    const failingCrypto = Crypto.make({
      randomBytes: (size) => new Uint8Array(size),
      digest: () => Effect.fail(digestError),
    });
    await Promise.all(
      Object.entries(M037_DIGEST_FAILURE_BUILDERS).map(async ([stage, builder]) => {
        const failure = await candidateFailure(
          sha256Bytes(new Uint8Array([0]), builder).pipe(
            Effect.provideService(Crypto.Crypto, failingCrypto),
          ),
        );
        expect(failure).toEqual({
          bangFullCompilerCandidateFailure: 1,
          stage: stage as M037DigestFailureStage,
          reason: "digest-failed",
          cause: {
            _tag: "PlatformError",
            message: digestError.message,
            reason: {
              _tag: "Unknown",
              module: "Crypto",
              method: "digest",
              description: "injected digest failure",
            },
          },
          message: "SHA-256 digest failed",
        });
        await validateFailureProjection(failure);
      }),
    );
    const selection = {
      bangFullCompilerCandidate: 1,
      id: "clinic-full-compiler-candidate",
      assemblySelection: "examples/clinic/assemblies/supervised-exact-one.json",
      externalConsumer: "examples/clinic/external-consumer/consumer.mjs",
    } as const;
    expect(Schema.decodeSync(M037FullCompilerCandidateSelectionSchema)(selection)).toEqual(
      selection,
    );
    const unsafeDecode = await runCommand(
      [
        process.execPath,
        "run",
        "scripts/m037-full-compiler-candidate.ts",
        "--decode",
        "../M037.json",
      ],
      candidateRoot,
    );
    expect(unsafeDecode).toMatchObject({ exitCode: 1, stdout: "" });
    const unsafeExpected: M037CandidateFailure = {
      bangFullCompilerCandidateFailure: 1,
      stage: "decode",
      reason: "report-invalid",
      message: "report path must be repository-relative",
    };
    expect(unsafeDecode.stderr).toBe(`${encodeCanonicalJson(unsafeExpected)}\n`);
    const unsafeFailure = decodeFailure(JSON.parse(unsafeDecode.stderr));
    expect(unsafeFailure).toEqual(unsafeExpected);
    expect("path" in unsafeFailure).toBe(false);
    const validDecode = await runCommand(
      [
        process.execPath,
        "run",
        "scripts/m037-full-compiler-candidate.ts",
        "--decode",
        ".bang/evidence/M037.json",
      ],
      candidateRoot,
    );
    expect(validDecode).toEqual({
      exitCode: 0,
      stdout: ".bang/evidence/M037.json: valid\n",
      stderr: "",
    });
  });
});

type M037PublicationByteSnapshot = ReadonlyArray<{
  readonly path: string;
  readonly bytes: Uint8Array;
}>;

const snapshotM037PublicationBytes = (
  root: string,
  paths: ReadonlyArray<string>,
): Promise<M037PublicationByteSnapshot> =>
  Promise.all(
    paths.map(async (path) => ({
      path,
      bytes: new Uint8Array(await readFile(join(root, path))),
    })),
  );

const makePublicationFailureFixture = async (
  rollbackFails: boolean,
): Promise<{
  readonly root: string;
  readonly failure: M037CandidateFailure;
  readonly paths: ReadonlyArray<string>;
  readonly failedPath: string;
  readonly before: M037PublicationByteSnapshot;
  readonly after: M037PublicationByteSnapshot;
}> => {
  const root = await mkdtemp(join(tmpdir(), "bang-m037-publication-fixture-"));
  const report = Schema.decodeSync(M037FullCompilerCandidateReportFromJson)(firstReportBytes);
  const paths = report.outputInventory.map(({ path }) => path);
  if (paths.length !== 22) throw new Error("real M037 publication inventory must contain 22 paths");
  const entries = await Promise.all(
    paths.map(async (path) => ({
      path,
      bytes: new Uint8Array(await readFile(join(candidateRoot, path))),
    })),
  );
  await Promise.all(
    entries.map(async (entry) => {
      const priorBytes = new Uint8Array(entry.bytes);
      const firstByte = priorBytes[0];
      if (firstByte === undefined)
        throw new Error(`real M037 publication entry ${entry.path} is empty`);
      priorBytes[0] = firstByte ^ 0x01;
      await mkdir(dirname(join(root, entry.path)), { recursive: true });
      await writeFile(join(root, entry.path), priorBytes);
    }),
  );
  const before = await snapshotM037PublicationBytes(root, paths);
  const failedPath = [...paths].toSorted().at(-1);
  if (failedPath === undefined) throw new Error("real M037 publication inventory is empty");
  const realFileSystem = await Effect.runPromise(
    // Test execution is the composition root for staged platform services.
    // @effect-diagnostics-next-line strictEffectProvide:off
    FileSystem.FileSystem.pipe(Effect.provide(BunServices.layer)),
  );
  let renameCalls = 0;
  let copyCalls = 0;
  const failingFileSystem: FileSystem.FileSystem = {
    ...realFileSystem,
    rename: (oldPath, newPath) => {
      renameCalls += 1;
      return renameCalls === entries.length
        ? realFileSystem.rename(join(root, "missing-rename-source"), newPath)
        : realFileSystem.rename(oldPath, newPath);
    },
    copyFile: (fromPath, toPath) => {
      copyCalls += 1;
      return rollbackFails && copyCalls === entries.length + 1
        ? realFileSystem.copyFile(join(root, "missing-rollback-source"), toPath)
        : realFileSystem.copyFile(fromPath, toPath);
    },
  };
  const effect = publishM037Entries(root, entries).pipe(
    Effect.provideService(FileSystem.FileSystem, failingFileSystem),
    // BunServices supplies only the remaining scoped Path service here.
    // @effect-diagnostics-next-line strictEffectProvide:off
    Effect.provide(BunServices.layer),
  );
  const failure = await Effect.runPromise(Effect.flip(effect));
  const decoded = await validateFailureProjection(failure);
  const after = await snapshotM037PublicationBytes(root, paths);
  return { root, failure: decoded, paths, failedPath, before, after };
};
