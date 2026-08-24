import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";

const root = resolve(import.meta.dir, "..");
const executable = join(root, "node_modules/.bin/bang");
const canonicalSelection = "examples/tiny-bank/assemblies/supervised-exact-one.json";
const canonicalAssemblyId = "tiny-bank-supervised-exact-one";
const m032Closure = [
  ".bang/artifacts/tiny-bank-packaged-exact-one.json",
  ".bang/theory-locks/tiny-bank-packaged-exact-one.json",
  ".bang/qualifications/tiny-bank-two-qualified-exact-one/effect-typescript/boundary.ts",
  ".bang/qualifications/tiny-bank-two-qualified-exact-one/effect-typescript/evidence.json",
  ".bang/qualifications/tiny-bank-two-qualified-exact-one/gleam-beam/src/bang/account_entity.gleam",
  ".bang/qualifications/tiny-bank-two-qualified-exact-one/gleam-beam/evidence.json",
  ".bang/qualifications/tiny-bank-two-qualified-exact-one/report.json",
  `.bang/plans/${canonicalAssemblyId}/report.json`,
] as const;
const m033Closure = [
  ...m032Closure,
  `.bang/assemblies/${canonicalAssemblyId}/gleam.toml`,
  `.bang/assemblies/${canonicalAssemblyId}/manifest.toml`,
  `.bang/assemblies/${canonicalAssemblyId}/src/bang/account_entity.gleam`,
  `.bang/assemblies/${canonicalAssemblyId}/src/main.gleam`,
  `.bang/assemblies/${canonicalAssemblyId}/canonicalize_escript.escript`,
  `.bang/assemblies/${canonicalAssemblyId}/bin/exact_one`,
  `.bang/assemblies/${canonicalAssemblyId}/report.json`,
] as const;

interface CliResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

interface AssemblyMaterial {
  readonly role: string;
  readonly path: string;
  readonly sha256: string;
}

interface Observation {
  readonly [key: string]: unknown;
  readonly target: string;
  readonly realization: string;
  readonly entity: string;
  readonly validCall: boolean;
}

interface AssemblyReport {
  readonly selectedCandidate: {
    readonly target: string;
    readonly realization: string;
  };
  readonly qualification: {
    readonly evidencePath: string;
    readonly evidenceSha256: string;
    readonly generatedBoundaryPath: string;
    readonly generatedBoundarySha256: string;
  };
  readonly materials: ReadonlyArray<AssemblyMaterial>;
  readonly toolchain: {
    readonly definition: { readonly path: string; readonly sha256: string };
    readonly gleam: string;
    readonly otp: string;
  };
  readonly execution: {
    readonly exitCode: number;
    readonly stderr: string;
    readonly observation: Observation;
  };
  readonly artifact: {
    readonly kind: string;
    readonly entry: string;
    readonly path: string;
    readonly sha256: string;
  };
  readonly plan: {
    readonly _tag: string;
    readonly plan: { readonly candidate: { readonly target: string } };
  };
}

interface M031Evidence {
  readonly observations: Observation;
}

const digest = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

const pathExists = async (path: string): Promise<boolean> => {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
};

const readJson = async <A>(path: string): Promise<A> =>
  JSON.parse(await Bun.file(join(root, path)).text()) as A;

const readBytes = async (paths: ReadonlyArray<string>): Promise<ReadonlyArray<Uint8Array>> =>
  Promise.all(paths.map((path) => Bun.file(join(root, path)).bytes()));

const sameBytes = (left: ReadonlyArray<Uint8Array>, right: ReadonlyArray<Uint8Array>): boolean =>
  left.length === right.length &&
  left.every(
    (first, index) =>
      first.length === right[index]!.length &&
      first.every((byte, offset) => byte === right[index]![offset]),
  );

let rejectProcessTimeout: (reason?: unknown) => void = () => {};

const runProcess = async (
  command: string,
  arguments_: ReadonlyArray<string>,
  timeoutMs: number,
): Promise<CliResult> => {
  const child = Bun.spawn([command, ...arguments_], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  });
  const output = Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]).then(([exitCode, stdout, stderr]) => ({ exitCode, stdout, stderr }));
  // This is an integration bound for an external compiler/process, not a test delay.
  const timeout = new Promise<CliResult>((_, reject) => {
    rejectProcessTimeout = reject;
  });
  const timer = setTimeout(() => {
    child.kill();
    rejectProcessTimeout(new Error(`${command} ${arguments_.join(" ")} exceeded ${timeoutMs}ms`));
  }, timeoutMs);
  try {
    return await Promise.race([output, timeout]);
  } finally {
    clearTimeout(timer);
  }
};

const runBang = (arguments_: ReadonlyArray<string>, timeoutMs = 180_000): Promise<CliResult> =>
  runProcess(executable, arguments_, timeoutMs);

const removeAssembly = async (id: string): Promise<void> => {
  await rm(join(root, ".bang/assemblies", id), { recursive: true, force: true });
};

const ensureM032Closure = async (): Promise<void> => {
  const ready = await Promise.all(m032Closure.map((path) => pathExists(join(root, path))));
  if (ready.every(Boolean)) return;
  const m031 = await runProcess("bun", ["run", "scripts/demo-m031.ts"], 180_000);
  if (m031.exitCode !== 0 || m031.stderr !== "") {
    throw new Error(`M031 prerequisite failed\n${m031.stderr}`);
  }
  const m032 = await runProcess("bun", ["run", "scripts/demo-m032.ts"], 300_000);
  if (m032.exitCode !== 0 || m032.stderr !== "") {
    throw new Error(`M032 prerequisite failed\n${m032.stderr}`);
  }
};

const negativeFixtures = [
  {
    fixture: "incomparable.json",
    id: "tiny-bank-assembly-incomparable",
    stage: "planning",
    reason: "incomparable-plan",
  },
  {
    fixture: "no-plan.json",
    id: "tiny-bank-assembly-no-plan",
    stage: "planning",
    reason: "no-plan",
  },
  {
    fixture: "effect-selected.json",
    id: "tiny-bank-assembly-effect-selected",
    stage: "planning",
    reason: "unsupported-selected-target",
  },
  {
    fixture: "malformed.json",
    id: "tiny-bank-assembly-malformed",
    stage: "selection",
    reason: "invalid-selection",
  },
  {
    fixture: "unknown-field.json",
    id: "tiny-bank-assembly-unknown-field",
    stage: "selection",
    reason: "invalid-selection",
  },
  {
    fixture: "unsafe-identity.json",
    id: "../tiny-bank-assembly-unsafe",
    stage: "selection",
    reason: "invalid-selection",
  },
  {
    fixture: "path-traversal.json",
    id: "tiny-bank-assembly-path-traversal",
    stage: "selection",
    reason: "invalid-selection",
  },
] as const;

let temporaryRoot: string;

beforeAll(async () => {
  temporaryRoot = await mkdtemp(join(root, ".m033-cli-test-"));
  await ensureM032Closure();
  await Promise.all(negativeFixtures.map(({ id }) => removeAssembly(id.replaceAll("/", "-"))));
  await removeAssembly("tiny-bank-assembly-publication-failure");
});

afterAll(async () => {
  await rm(temporaryRoot, { recursive: true, force: true });
  await Promise.all(
    negativeFixtures.filter(({ id }) => !id.includes("/")).map(({ id }) => removeAssembly(id)),
  );
  await removeAssembly("tiny-bank-assembly-publication-failure");
});

describe("M033 selected realization assembly CLI", () => {
  test("publishes a runnable report and deterministic full closure", async () => {
    await removeAssembly(canonicalAssemblyId);
    const first = await runBang(["assemble", canonicalSelection]);
    expect(first.exitCode).toBe(0);
    expect(first.stderr).toBe("");
    expect(first.stdout).toContain("M033 selected realization assembly");
    expect(first.stdout).toContain("Target: gleam-beam");
    expect(first.stdout).toContain(
      "Artifact: .bang/assemblies/tiny-bank-supervised-exact-one/bin/exact_one",
    );
    expect(first.stdout).toContain(
      "Report: .bang/assemblies/tiny-bank-supervised-exact-one/report.json",
    );
    expect(first.stdout).toContain(
      "Run: escript .bang/assemblies/tiny-bank-supervised-exact-one/bin/exact_one",
    );
    expect(first.stdout).toContain("Evidence scope: one bounded runtime observation");

    const report = await readJson<AssemblyReport>(m033Closure.at(-1)!);
    const evidence = await readJson<M031Evidence>(
      ".bang/qualifications/tiny-bank-two-qualified-exact-one/gleam-beam/evidence.json",
    );
    expect(report.plan._tag).toBe("Selected");
    expect(report.plan.plan.candidate.target).toBe("gleam-beam");
    expect(report.selectedCandidate.target).toBe("gleam-beam");
    expect(report.execution.exitCode).toBe(0);
    expect(report.execution.stderr).toBe("");
    expect(report.execution.observation).toEqual(evidence.observations);
    expect(report.execution.observation.target).toBe(report.selectedCandidate.target);
    expect(report.execution.observation.realization).toBe(report.selectedCandidate.realization);
    expect(report.execution.observation.entity).toBe("account-1");
    expect(report.execution.observation.validCall).toBe(true);

    const roles = report.materials.map(({ role }) => role).toSorted();
    expect(roles).toEqual(
      [
        "assembled-entry",
        "assembly-configuration",
        "assembly-canonicalizer",
        "compiled-artifact",
        "qualified-generated",
        "third-party-lock",
        "toolchain-definition",
      ].toSorted(),
    );
    await Promise.all(
      report.materials.map(async (material) => {
        const bytes = await Bun.file(join(root, material.path)).bytes();
        expect(digest(bytes)).toBe(material.sha256);
      }),
    );
    const evidenceBytes = await Bun.file(join(root, report.qualification.evidencePath)).bytes();
    const generatedBytes = await Bun.file(
      join(root, report.qualification.generatedBoundaryPath),
    ).bytes();
    expect(digest(evidenceBytes)).toBe(report.qualification.evidenceSha256);
    expect(digest(generatedBytes)).toBe(report.qualification.generatedBoundarySha256);
    const artifactBytes = await Bun.file(join(root, report.artifact.path)).bytes();
    expect(digest(artifactBytes)).toBe(report.artifact.sha256);
    expect(report.artifact.kind).toBe("escript");
    expect(report.artifact.entry).toBe("main");
    expect(report.toolchain.definition.path).toBe("nix/gleam.nix");
    expect(report.toolchain.gleam).toContain("1.18.1");
    expect(report.toolchain.otp.length).toBeGreaterThan(0);

    const firstClosure = await readBytes(m033Closure);
    await removeAssembly(canonicalAssemblyId);
    const second = await runBang(["assemble", canonicalSelection]);
    expect(second.exitCode).toBe(0);
    expect(second.stderr).toBe("");
    expect(second.stdout).toBe(first.stdout);
    const secondClosure = await readBytes(m033Closure);
    expect(sameBytes(firstClosure, secondClosure)).toBe(true);

    const pinned = await runProcess(
      "nix",
      ["shell", "-f", "nix/gleam.nix", "-c", "escript", report.artifact.path],
      120_000,
    );
    expect(pinned.exitCode).toBe(0);
    expect(pinned.stderr).toBe("");
    const marker = "BANG_M031_RESULT|";
    const observations = pinned.stdout
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line.startsWith(marker));
    expect(observations).toHaveLength(1);
    const rawObservation = JSON.parse(observations[0]!.slice(marker.length)) as Record<
      string,
      unknown
    >;
    const { supervised, ...withoutTopLevelSupervised } = rawObservation;
    const normalizedObservation =
      rawObservation.actorRestart === undefined
        ? withoutTopLevelSupervised
        : {
            ...withoutTopLevelSupervised,
            actorRestart: {
              ...(rawObservation.actorRestart as Record<string, unknown>),
              supervised: supervised ?? true,
            },
          };
    expect(normalizedObservation).toEqual(report.execution.observation);
  }, 600_000);

  test("rejects non-selected and malformed fixtures without publishing or changing M031/M032 bytes", async () => {
    // Fixtures share one publication closure; each run must complete before the next starts.
    // oxlint-disable eslint/no-await-in-loop
    for (const fixture of negativeFixtures) {
      const before = await readBytes(m032Closure);
      await removeAssembly(fixture.id.replaceAll("/", "-"));
      const result = await runBang([
        "assemble",
        `examples/tiny-bank/assemblies/${fixture.fixture}`,
      ]);
      const after = await readBytes(m032Closure);
      expect(result.exitCode).not.toBe(0);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain(`stage: ${fixture.stage}`);
      expect(result.stderr).toContain(`reason: ${fixture.reason}`);
      expect(sameBytes(before, after)).toBe(true);
      expect(await pathExists(join(root, ".bang/assemblies", fixture.id))).toBe(false);
      if (fixture.id === "tiny-bank-assembly-effect-selected") {
        expect(result.stderr).toContain("address: effect-typescript");
      }
    }
    // oxlint-enable eslint/no-await-in-loop
  }, 600_000);

  test("restores the complete shared closure after a late publication failure", async () => {
    const id = "tiny-bank-assembly-publication-failure";
    const assemblyDirectory = join(root, ".bang/assemblies", id);
    await removeAssembly(id);
    await mkdir(assemblyDirectory, { recursive: true });
    await Bun.write(join(assemblyDirectory, "src"), "publication blocker\n");
    const before = await readBytes(m032Closure);
    try {
      const result = await runBang([
        "assemble",
        "examples/tiny-bank/assemblies/publication-failure.json",
      ]);
      const after = await readBytes(m032Closure);
      expect(result.exitCode).not.toBe(0);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("stage: publication");
      expect(result.stderr).toContain("reason: publication-failed");
      expect(sameBytes(before, after)).toBe(true);
      expect(await pathExists(join(assemblyDirectory, "bin/exact_one"))).toBe(false);
      expect(await pathExists(join(assemblyDirectory, "report.json"))).toBe(false);
    } finally {
      await rm(assemblyDirectory, { recursive: true, force: true });
    }
    expect(await pathExists(assemblyDirectory)).toBe(false);
  }, 300_000);
});
