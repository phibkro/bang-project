import { createHash } from "node:crypto";
import { chmod, cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { BunServices } from "@effect/platform-bun";
import type { Crypto, Path } from "effect";
import { Effect, FileSystem, Schema } from "effect";
import { ChildProcessSpawner } from "effect/unstable/process";
import {
  M037CandidateFailureSchema,
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
  validateM037RunComparison,
  validateM037UnsupportedClaims,
  type M037ArtifactInvocation,
  type M037CandidateFailure,
  type RuntimeBoundary,
} from "../scripts/m037-full-compiler-candidate.ts";

const workspaceRoot = resolve(import.meta.dir, "..");
const candidateCommand = [
  process.execPath,
  "run",
  "scripts/m037-full-compiler-candidate.ts",
  "examples/clinic/full-candidate.json",
] as const;
let candidateRoot: string;
let temporaryCheckoutParent: string;
const reportPath = () => join(candidateRoot, ".bang/evidence/M037.json");
const sha256 = (bytes: Uint8Array | string): `sha256:${string}` =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
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
  const lines = projection.stderr.trimEnd().split("\n");
  expect(lines).toHaveLength(1);
  const decoded = decodeFailure(JSON.parse(lines[0]!));
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
    readonly materials: ReadonlyArray<{ readonly path: string; readonly role: string }>;
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
    readonly materials: ReadonlyArray<{ readonly path: string; readonly role: string }>;
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
beforeAll(async () => {
  temporaryCheckoutParent = await mkdtemp(join(dirname(workspaceRoot), ".bang-m037-test-"));
  candidateRoot = join(temporaryCheckoutParent, "checkout");
  const checkout = await runCommand(
    [actualPaths.git!, "worktree", "add", "--detach", candidateRoot, "HEAD"],
    workspaceRoot,
  );
  if (checkout.exitCode !== 0)
    throw new Error(`could not create M037 test checkout: ${checkout.stderr}`);
  await symlink(join(workspaceRoot, "node_modules"), join(candidateRoot, "node_modules"), "dir");
  const result = await runCommand(candidateCommand, candidateRoot);
  if (
    result.exitCode !== 0 ||
    result.stderr !== "" ||
    result.stdout !== ".bang/evidence/M037.json\n"
  )
    throw new Error(
      `M037 positive fixture failed: exit=${result.exitCode}; stdout=${JSON.stringify(result.stdout)}; stderr=${JSON.stringify(result.stderr)}`,
    );
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
  test("rejects a non-x86_64-linux injected host fact before a worktree exists", async () => {
    expect(await preflightFailure({ architecture: "arm64" })).toMatchObject({
      stage: "preflight",
      reason: "unsupported-platform",
    });
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

  test("projects a real damaged escript execution", async () => {
    const directory = await mkdtemp(join(tmpdir(), "bang-m037-damaged-escript-"));
    try {
      await writeFile(join(directory, "exact_one"), "not an escript\n");
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
      await writeFile(materialPath, `${await readFile(materialPath, "utf8")}\n`);
      const result = await runConsumer(fixture.directory);
      const failure = await candidateFailure(
        projectM037ExternalConsumerResult(toProcessResult(result)),
      );
      expect(failure).toMatchObject({
        stage: "external-consumer",
        reason: "consumer-rejected",
        cause: { _tag: "M035RejectedVerdict", stage: "custody", reason: "digest-mismatch" },
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
      expect(failure).toMatchObject({
        stage: "external-consumer",
        reason: "consumer-rejected",
        cause: { _tag: "M035RejectedVerdict", stage: "decode", reason: "decode-failed" },
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
      await writeFile(outsideModule, "export const outside = true;\n");
      const consumerPath = join(fixture.directory, "consumer.mjs");
      const consumer = await readFile(consumerPath, "utf8");
      await writeFile(
        consumerPath,
        `import ${JSON.stringify(pathToFileURL(outsideModule).href)};\n${consumer}`,
      );
      const result = await runConsumer(fixture.directory);
      expect(result.exitCode).not.toBe(0);
      expect(result.stdout).toBe("");
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

  test("reports the first real file-byte inventory divergence with both digests", async () => {
    const directory = await mkdtemp(join(tmpdir(), "bang-m037-comparison-"));
    try {
      const path = ".bang/assemblies/clinic-supervised-exact-one/src/main.gleam";
      const firstBytes = new TextEncoder().encode("first\n");
      const secondBytes = new TextEncoder().encode("second\n");
      await writeFile(join(directory, "first"), firstBytes);
      await writeFile(join(directory, "second"), secondBytes);
      const firstSha256 = sha256(await readFile(join(directory, "first")));
      const secondSha256 = sha256(await readFile(join(directory, "second")));
      const report = Schema.decodeSync(M037FullCompilerCandidateReportFromJson)(firstReportBytes);
      const observations = [
        report.embeddedRecords.theoryApplicability.value,
        report.embeddedRecords.artifactIsolation.value,
        report.embeddedRecords.audit.value,
        report.embeddedRecords.schemaCustody.value,
        report.embeddedRecords.externalConsumerIsolation.value,
      ] as const;
      const failure = await candidateFailure(
        validateM037RunComparison(
          {
            inventory: [{ path, sha256: firstSha256 }],
            inventorySha256: sha256("first inventory"),
            observations,
            observationsSha256: sha256("observations"),
          },
          {
            inventory: [{ path, sha256: secondSha256 }],
            inventorySha256: sha256("second inventory"),
            observations,
            observationsSha256: sha256("observations"),
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
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("maps a failed final rename to publication-failed and restores prior bytes", async () => {
    const fixture = await makePublicationFailureFixture(false);
    try {
      expect(fixture.failure).toMatchObject({
        stage: "publication",
        reason: "publication-failed",
        cause: { _tag: "PublicationFailure", reason: "publication-failed" },
      });
      expect(await readFile(join(fixture.root, "a.txt"), "utf8")).toBe("old-a\n");
      expect(await readFile(join(fixture.root, "b.txt"), "utf8")).toBe("old-b\n");
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  test("maps a failed rollback restore without claiming unchanged bytes", async () => {
    const fixture = await makePublicationFailureFixture(true);
    try {
      expect(fixture.failure).toMatchObject({
        stage: "publication",
        reason: "rollback-failed",
        cause: { _tag: "PublicationFailure", reason: "rollback-failed" },
      });
      expect(await readFile(join(fixture.root, "a.txt"), "utf8")).toBe("new-a\n");
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  test("strictly rejects excess and digest-tampered public report bytes", async () => {
    const report = Schema.decodeSync(M037FullCompilerCandidateReportFromJson)(firstReportBytes);
    expect(report.publicationPlan.enumeratedFiles).toBe(22);
    expect(() =>
      Schema.decodeSync(M037FullCompilerCandidateReportFromJson)(
        JSON.stringify({ ...report, unexpected: true }),
      ),
    ).toThrow();
    const tampered = {
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
    const decodedTampered = Schema.decodeSync(M037FullCompilerCandidateReportFromJson)(
      JSON.stringify(tampered),
    );
    expect(await candidateFailure(validateM037ReportDigests(decodedTampered))).toMatchObject({
      stage: "decode",
      reason: "report-invalid",
    });
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
    const unsafeFailure = decodeFailure(JSON.parse(unsafeDecode.stderr));
    expect(unsafeFailure).toMatchObject({
      stage: "decode",
      reason: "report-invalid",
    });
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

const makePublicationFailureFixture = async (
  rollbackFails: boolean,
): Promise<{ readonly root: string; readonly failure: M037CandidateFailure }> => {
  const root = await mkdtemp(join(tmpdir(), "bang-m037-publication-fixture-"));
  await writeFile(join(root, "a.txt"), "old-a\n");
  await writeFile(join(root, "b.txt"), "old-b\n");
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
      return renameCalls === 2
        ? realFileSystem.rename(join(root, "missing-rename-source"), newPath)
        : realFileSystem.rename(oldPath, newPath);
    },
    copyFile: (fromPath, toPath) => {
      copyCalls += 1;
      return rollbackFails && copyCalls === 3
        ? realFileSystem.copyFile(join(root, "missing-rollback-source"), toPath)
        : realFileSystem.copyFile(fromPath, toPath);
    },
  };
  const effect = publishM037Entries(root, [
    { path: "a.txt", bytes: new TextEncoder().encode("new-a\n") },
    { path: "b.txt", bytes: new TextEncoder().encode("new-b\n") },
  ]).pipe(
    Effect.provideService(FileSystem.FileSystem, failingFileSystem),
    // BunServices supplies only the remaining scoped Path service here.
    // @effect-diagnostics-next-line strictEffectProvide:off
    Effect.provide(BunServices.layer),
  );
  const failure = await Effect.runPromise(Effect.flip(effect));
  return { root, failure: await validateFailureProjection(failure) };
};
