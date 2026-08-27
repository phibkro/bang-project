import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const workspaceRoot = resolve(import.meta.dir, "..");
const recordPath = join(workspaceRoot, "tests/m036-tiny-bank-protected-baseline.json");
const protectedRevision = "f2673c1b74726adcbf6b56a8655d5efee505b1b2";
// M036 defines the candidate as the implementation checkpoint. The evidence record is
// committed later, so binding it to its own containing commit would be recursive.
const candidateRevision = "8c0d590b08a1432ede1279cf501a46e88efb96d2";
const expectedRecordSha256 = "b456a217afa00279e6cd6710bc99b35dab41fbbb618822d31b93764cca644680";
const dependencyLockPath = "bun.lock";
const setupCommands = ["bun install --frozen-lockfile", "bun run build"] as const;
const journeyCommands = [
  {
    display: "bun run bang classify examples/tiny-bank/realizations/two-qualified-exact-one.json",
    argv: [
      "bun",
      "run",
      "bang",
      "classify",
      "examples/tiny-bank/realizations/two-qualified-exact-one.json",
    ],
  },
  {
    display: "bun run bang plan examples/tiny-bank/plans/supervised-exact-one.json",
    argv: ["bun", "run", "bang", "plan", "examples/tiny-bank/plans/supervised-exact-one.json"],
  },
  {
    display: "bun run bang assemble examples/tiny-bank/assemblies/supervised-exact-one.json",
    argv: [
      "bun",
      "run",
      "bang",
      "assemble",
      "examples/tiny-bank/assemblies/supervised-exact-one.json",
    ],
  },
] as const;
const commands = journeyCommands.map(({ display }) => display);
const publicationRoots = [
  ".bang/artifacts/tiny-bank-packaged-exact-one.json",
  ".bang/theory-locks/tiny-bank-packaged-exact-one.json",
  ".bang/qualifications/tiny-bank-two-qualified-exact-one",
  ".bang/plans/tiny-bank-supervised-exact-one",
  ".bang/assemblies/tiny-bank-supervised-exact-one",
] as const;
const publicationPaths = [
  ".bang/artifacts/tiny-bank-packaged-exact-one.json",
  ".bang/theory-locks/tiny-bank-packaged-exact-one.json",
  ".bang/qualifications/tiny-bank-two-qualified-exact-one/effect-typescript/boundary.ts",
  ".bang/qualifications/tiny-bank-two-qualified-exact-one/effect-typescript/evidence.json",
  ".bang/qualifications/tiny-bank-two-qualified-exact-one/gleam-beam/src/bang/account_entity.gleam",
  ".bang/qualifications/tiny-bank-two-qualified-exact-one/gleam-beam/evidence.json",
  ".bang/qualifications/tiny-bank-two-qualified-exact-one/report.json",
  ".bang/plans/tiny-bank-supervised-exact-one/report.json",
  ".bang/assemblies/tiny-bank-supervised-exact-one/gleam.toml",
  ".bang/assemblies/tiny-bank-supervised-exact-one/manifest.toml",
  ".bang/assemblies/tiny-bank-supervised-exact-one/canonicalize_escript.escript",
  ".bang/assemblies/tiny-bank-supervised-exact-one/src/bang/account_entity.gleam",
  ".bang/assemblies/tiny-bank-supervised-exact-one/src/main.gleam",
  ".bang/assemblies/tiny-bank-supervised-exact-one/bin/exact_one",
  ".bang/assemblies/tiny-bank-supervised-exact-one/report.json",
] as const;
const implementationPaths = [
  "apps/bang/src",
  "apps/bang/package.json",
  "packages",
  "scripts/build.ts",
  "nix",
  "bun.lock",
  "examples/tiny-bank",
] as const;

interface CompletedProcess {
  readonly exitCode: number;
  readonly stdout: Uint8Array;
  readonly stderr: string;
}

interface RunEvidence {
  readonly revision: string;
  readonly dependencyLock: {
    readonly path: string;
    readonly sha256: string;
  };
  readonly setupCommands: ReadonlyArray<string>;
  readonly commands: ReadonlyArray<string>;
}

interface ParityRecord {
  readonly bangM036TinyBankParity: 1;
  readonly protectedRun: RunEvidence;
  readonly candidateRun: RunEvidence;
  readonly files: ReadonlyArray<{
    readonly path: string;
    readonly protectedSha256: string;
    readonly candidateSha256: string;
  }>;
}

interface ObservedRun {
  readonly run: RunEvidence;
  readonly digests: Readonly<Record<string, string>>;
}

const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();
const environment = Object.freeze({
  ...globalThis.process.env,
  CI: "1",
  NO_COLOR: "1",
  FORCE_COLOR: "0",
});

const runProcess = async (
  command: ReadonlyArray<string>,
  cwd = workspaceRoot,
  timeoutMilliseconds = 900_000,
): Promise<CompletedProcess> => {
  const process = Bun.spawn([...command], {
    cwd,
    env: environment,
    stdout: "pipe",
    stderr: "pipe",
  });
  let timer: NodeJS.Timeout | undefined;
  const timedOut = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      process.kill();
      reject(new Error(`command timed out: ${command.join(" ")}`));
    }, timeoutMilliseconds);
  });
  try {
    const [exitCode, stdout, stderr] = await Promise.race([
      Promise.all([
        process.exited,
        new Response(process.stdout).arrayBuffer(),
        new Response(process.stderr).text(),
      ]),
      timedOut,
    ]);
    return { exitCode, stdout: new Uint8Array(stdout), stderr };
  } finally {
    clearTimeout(timer);
  }
};

const requireSuccess = async (
  command: ReadonlyArray<string>,
  cwd = workspaceRoot,
  timeoutMilliseconds?: number,
): Promise<CompletedProcess> => {
  const result = await runProcess(command, cwd, timeoutMilliseconds);
  if (result.exitCode === 0) return result;
  throw new Error(
    `${command.join(" ")} failed in ${cwd}: exit=${result.exitCode}; stdout=${JSON.stringify(textDecoder.decode(result.stdout))}; stderr=${JSON.stringify(result.stderr)}`,
  );
};

const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

const digestPaths = async (
  root: string,
  paths: ReadonlyArray<string>,
): Promise<Readonly<Record<string, string>>> =>
  Object.fromEntries(
    await Promise.all(
      paths.map(async (path) => [path, sha256(await readFile(join(root, path)))] as const),
    ),
  );

const inventoryPaths = async (root: string): Promise<ReadonlyArray<string>> => {
  const paths: Array<string> = [];
  const visit = async (repositoryPath: string): Promise<void> => {
    const absolutePath = join(root, repositoryPath);
    const metadata = await stat(absolutePath);
    if (metadata.isFile()) {
      paths.push(repositoryPath);
      return;
    }
    const entries = await readdir(absolutePath, { withFileTypes: true });
    await Promise.all(entries.map(({ name }) => visit(join(repositoryPath, name))));
  };
  await Promise.all(publicationRoots.map(visit));
  return paths.toSorted();
};

const gitBytes = async (revision: string, path: string): Promise<Uint8Array> =>
  (await requireSuccess(["git", "show", `${revision}:${path}`])).stdout;
const rootManifestFingerprint = (bytes: Uint8Array): string => {
  const manifest = JSON.parse(textDecoder.decode(bytes)) as Record<string, unknown>;
  const scripts = manifest.scripts;
  if (scripts === null || typeof scripts !== "object" || Array.isArray(scripts)) {
    throw new Error("root package manifest has no scripts object");
  }
  const acceptanceScripts = new Set(["evidence:m036", "test", "test:m036"]);
  return JSON.stringify({
    ...manifest,
    scripts: Object.fromEntries(
      Object.entries(scripts).filter(([name]) => !acceptanceScripts.has(name)),
    ),
  });
};

const assertImplementationBinding = async (): Promise<void> => {
  await requireSuccess(["git", "cat-file", "-e", `${protectedRevision}^{commit}`]);
  await requireSuccess(["git", "cat-file", "-e", `${candidateRevision}^{commit}`]);
  await requireSuccess(["git", "merge-base", "--is-ancestor", candidateRevision, "HEAD"]);
  const comparison = await runProcess([
    "git",
    "diff",
    "--quiet",
    candidateRevision,
    "--",
    ...implementationPaths,
  ]);
  if (comparison.exitCode !== 0) {
    throw new Error(
      `M036 implementation differs from recorded candidate checkpoint ${candidateRevision}; regenerate and explicitly advance the checkpoint`,
    );
  }
  const currentManifest = rootManifestFingerprint(
    await readFile(join(workspaceRoot, "package.json")),
  );
  const candidateManifest = rootManifestFingerprint(
    await gitBytes(candidateRevision, "package.json"),
  );
  if (currentManifest !== candidateManifest) {
    throw new Error(
      `root install/build manifest semantics differ from recorded candidate checkpoint ${candidateRevision}`,
    );
  }
};

const readRecord = async (): Promise<ParityRecord> => {
  const record = JSON.parse(await readFile(recordPath, "utf8")) as ParityRecord;
  const observedSha256 = sha256(textEncoder.encode(JSON.stringify(record)));
  if (observedSha256 !== expectedRecordSha256) {
    throw new Error(
      `M036 parity record hash is stale or unbound: expected ${expectedRecordSha256}, observed ${observedSha256}`,
    );
  }
  return record;
};

const expectedRun = async (revision: string): Promise<RunEvidence> => ({
  revision,
  dependencyLock: {
    path: dependencyLockPath,
    sha256: sha256(await gitBytes(revision, dependencyLockPath)),
  },
  setupCommands,
  commands,
});

const verifyRecord = async (): Promise<ParityRecord> => {
  await assertImplementationBinding();
  const record = await readRecord();
  const expectedProtectedRun = await expectedRun(protectedRevision);
  const expectedCandidateRun = await expectedRun(candidateRevision);
  if (JSON.stringify(record.protectedRun) !== JSON.stringify(expectedProtectedRun)) {
    throw new Error("M036 protected run metadata is stale or unbound");
  }
  if (JSON.stringify(record.candidateRun) !== JSON.stringify(expectedCandidateRun)) {
    throw new Error("M036 candidate run metadata is stale or unbound");
  }
  if (JSON.stringify(record.files.map(({ path }) => path)) !== JSON.stringify(publicationPaths)) {
    throw new Error("M036 parity record does not name the exact 15-file publication closure");
  }
  for (const file of record.files) {
    if (
      !/^[0-9a-f]{64}$/.test(file.protectedSha256) ||
      !/^[0-9a-f]{64}$/.test(file.candidateSha256)
    ) {
      throw new Error(`M036 parity record has an invalid digest for ${file.path}`);
    }
    if (file.protectedSha256 !== file.candidateSha256) {
      throw new Error(`TinyBank parity diverges at ${file.path}`);
    }
  }
  return record;
};

const observeCleanRun = async (worktreePath: string, revision: string): Promise<ObservedRun> => {
  const head = textDecoder
    .decode((await requireSuccess(["git", "rev-parse", "HEAD"], worktreePath)).stdout)
    .trim();
  if (head !== revision) {
    throw new Error(`clean worktree resolved ${revision} to unexpected HEAD ${head}`);
  }
  await requireSuccess(["bun", "install", "--frozen-lockfile"], worktreePath, 300_000);
  await requireSuccess(["bun", "run", "build"], worktreePath, 300_000);
  await Promise.all(
    publicationRoots.map((path) => rm(join(worktreePath, path), { recursive: true, force: true })),
  );
  for (const command of journeyCommands) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- each command consumes the prior publication.
    await requireSuccess(command.argv, worktreePath, 900_000);
  }
  const inventory = await inventoryPaths(worktreePath);
  if (JSON.stringify(inventory) !== JSON.stringify([...publicationPaths].toSorted())) {
    throw new Error(
      `clean ${revision} run emitted an unexpected publication inventory: ${JSON.stringify(inventory)}`,
    );
  }
  const lockDigest = sha256(await readFile(join(worktreePath, dependencyLockPath)));
  const trackedStatus = textDecoder
    .decode(
      (await requireSuccess(["git", "status", "--porcelain", "--untracked-files=no"], worktreePath))
        .stdout,
    )
    .trim();
  if (trackedStatus !== "") {
    throw new Error(`clean ${revision} run changed tracked bytes:\n${trackedStatus}`);
  }
  return {
    run: {
      revision: head,
      dependencyLock: { path: dependencyLockPath, sha256: lockDigest },
      setupCommands,
      commands,
    },
    digests: await digestPaths(worktreePath, publicationPaths),
  };
};

const observeBothCleanRuns = async (): Promise<ParityRecord> => {
  await assertImplementationBinding();
  const temporaryRoot = await mkdtemp(join(tmpdir(), "bang-m036-clean-parity-"));
  const protectedWorktree = join(temporaryRoot, "protected");
  const candidateWorktree = join(temporaryRoot, "candidate");
  let protectedAdded = false;
  let candidateAdded = false;
  try {
    await requireSuccess([
      "git",
      "worktree",
      "add",
      "--detach",
      protectedWorktree,
      protectedRevision,
    ]);
    protectedAdded = true;
    const protectedRun = await observeCleanRun(protectedWorktree, protectedRevision);
    await requireSuccess([
      "git",
      "worktree",
      "add",
      "--detach",
      candidateWorktree,
      candidateRevision,
    ]);
    candidateAdded = true;
    const candidateRun = await observeCleanRun(candidateWorktree, candidateRevision);
    const files = publicationPaths.map((path) => ({
      path,
      protectedSha256: protectedRun.digests[path]!,
      candidateSha256: candidateRun.digests[path]!,
    }));
    for (const file of files) {
      if (file.protectedSha256 !== file.candidateSha256) {
        throw new Error(`TinyBank clean-run parity diverges at ${file.path}`);
      }
    }
    return {
      bangM036TinyBankParity: 1,
      protectedRun: protectedRun.run,
      candidateRun: candidateRun.run,
      files,
    };
  } finally {
    if (candidateAdded) {
      await requireSuccess(["git", "worktree", "remove", "--force", candidateWorktree]);
    }
    if (protectedAdded) {
      await requireSuccess(["git", "worktree", "remove", "--force", protectedWorktree]);
    }
    await rm(temporaryRoot, { recursive: true, force: true });
    await requireSuccess(["git", "worktree", "prune"]);
  }
};

const mode = process.argv[2];
if (mode !== undefined && mode !== "--verify-record" && mode !== "--write") {
  throw new Error(`unsupported M036 parity mode: ${mode}`);
}

if (mode === "--verify-record") {
  const record = await verifyRecord();
  console.log(
    JSON.stringify({ protectedRun: record.protectedRun, candidateRun: record.candidateRun }),
  );
} else {
  const observed = await observeBothCleanRuns();
  if (mode === "--write") {
    await writeFile(recordPath, `${JSON.stringify(observed, undefined, 2)}\n`);
  } else {
    const recorded = await verifyRecord();
    if (JSON.stringify(observed) !== JSON.stringify(recorded)) {
      throw new Error("M036 clean-worktree evidence differs from the checked parity record");
    }
  }
  console.log(
    JSON.stringify({
      protectedRun: observed.protectedRun,
      candidateRun: observed.candidateRun,
      files: observed.files.length,
      parity: "equal",
      recordSha256: sha256(textEncoder.encode(JSON.stringify(observed))),
    }),
  );
}
