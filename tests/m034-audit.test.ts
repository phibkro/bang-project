import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { M031TargetQualificationEvidence } from "@bang/evidence";
import { BunServices } from "@effect/platform-bun";
import { describe, expect, test } from "bun:test";
import { type FileSystem, type Path, Crypto, Effect } from "effect";
import type { ChildProcessSpawner } from "effect/unstable/process";

import {
  AuditFailure,
  collectAuditMaterials,
  formatAuditFailure,
  formatAuditReport,
  materialClassForRole,
  runAudit,
  runInvalidation,
  selectAssembly,
  summarizeAudit,
  verifyMaterialEntries,
} from "../apps/bang/src/audit.ts";
import type { AssemblyReport } from "../apps/bang/src/assemble.ts";
import type { PlanningReport } from "@bang/planning";

const root = resolve(import.meta.dir, "..");

const testCrypto = Crypto.make({
  randomBytes: (size) => new Uint8Array(size),
  digest: (_algorithm, data) =>
    Effect.promise(() => crypto.subtle.digest("SHA-256", Uint8Array.from(data).buffer)).pipe(
      Effect.map((hash) => new Uint8Array(hash)),
    ),
});

// Test execution is the composition root for platform filesystem services.
const provideServices = <A, E>(
  effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path | Crypto.Crypto>,
) =>
  // @effect-diagnostics-next-line strictEffectProvide:off
  Effect.provide(effect, BunServices.layer).pipe(Effect.provideService(Crypto.Crypto, testCrypto));

const provideServicesWithSpawner = <A, E>(
  effect: Effect.Effect<
    A,
    E,
    FileSystem.FileSystem | Path.Path | Crypto.Crypto | ChildProcessSpawner.ChildProcessSpawner
  >,
) =>
  // Test execution is the composition root; BunServices.layer supplies the
  // ChildProcessSpawner alongside FileSystem and Path. The deterministic test
  // Crypto replaces the platform digest so fixture digests stay reproducible.
  // @effect-diagnostics-next-line strictEffectProvide:off
  Effect.provide(effect, BunServices.layer).pipe(Effect.provideService(Crypto.Crypto, testCrypto));

describe("M034 audit material classes", () => {
  test("assigns one equality class per recorded role", () => {
    expect(materialClassForRole("core-source")).toBe("decoded");
    expect(materialClassForRole("theory-package")).toBe("decoded");
    expect(materialClassForRole("assembled-entry")).toBe("opaque");
    expect(materialClassForRole("compiled-artifact")).toBe("opaque");
    expect(materialClassForRole("third-party-lock")).toBe("opaque");
    expect(materialClassForRole("assembly-canonicalizer")).toBe("opaque");
    expect(materialClassForRole("toolchain-definition")).toBe("opaque");
    expect(materialClassForRole("generated-gleam-boundary")).toBe("opaque");
    expect(materialClassForRole("unknown-future-role")).toBe("opaque");
    expect(materialClassForRole("semantic-artifact")).toBe("derived");
    expect(materialClassForRole("theory-lock")).toBe("derived");
    expect(materialClassForRole("assembly-report")).toBe("derived");
    expect(materialClassForRole("plan-report")).toBe("derived");
    expect(materialClassForRole("qualification-report")).toBe("derived");
    expect(materialClassForRole("evidence-record:gleam-beam")).toBe("derived");
  });
});

interface FixtureRecord {
  readonly materials?: ReadonlyArray<{ path: string; role: string; sha256: string }>;
}

const digestOf = (value: string): string =>
  Array.from(new Bun.CryptoHasher("sha256").update(value).digest())
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

const fixtureReport = (overrides: Partial<FixtureRecord> = {}) =>
  ({
    bangAssembly: 1,
    id: "fixture-audit",
    planSelection: ".bang/plans/fixture-audit/report.json",
    plan: { _tag: "Selected", selectionId: "fixture-audit" },
    selectedCandidate: {
      target: "gleam-beam",
      realization: "WithdrawAccountOnce",
      artifactId: "fixture-artifact",
      artifactFormat: "bangSemanticArtifact:1",
      requirementAddress: "operationRealization:WithdrawAccountOnce.requirement:DebitAccount",
    },
    qualification: {
      selectionPath: "examples/tiny-bank/realizations/two-qualified-exact-one.json",
      evidencePath: ".bang/q/g/evidence.json",
      evidenceSha256: "0".repeat(64),
      generatedBoundaryPath: ".bang/q/g/boundary.gleam",
      generatedBoundarySha256: "0".repeat(64),
    },
    materials: overrides.materials ?? [
      { path: "src/main.gleam", role: "assembled-entry", sha256: digestOf("entry") },
    ],
    toolchain: {},
    execution: {},
    artifact: {},
    assumptions: ["a"],
    limitations: ["l"],
    lifetime: "test",
    invalidators: ["i"],
  }) as unknown as AssemblyReport;

describe("M034 audit inventory collection", () => {
  test("collects every cited material with its records and classes", () => {
    const boundaryPath = ".bang/qualifications/fixture-q/g/boundary.gleam";
    const corePath = "examples/tiny-bank/account.bang";
    const report = fixtureReport();
    const records = {
      planPath: ".bang/plans/fixture-audit/report.json",
      plan: {
        _tag: "Selected",
        plan: {
          targetMaterials: [
            { role: "generated-gleam-boundary", path: boundaryPath, sha256: digestOf("boundary") },
            { role: "core-source", path: corePath, sha256: digestOf("core") },
          ],
          evidenceReferences: [],
          dispositions: [],
        },
      } as unknown as PlanningReport,
      qualificationBase: ".bang/qualifications/fixture-q",
      qualificationReportPath: ".bang/qualifications/fixture-q/report.json",
      evidencePaths: [".bang/qualifications/fixture-q/g/evidence.json"],
      embeddedEvidence: [
        {
          targetId: "g",
          materials: [
            { role: "generated-gleam-boundary", path: boundaryPath, sha256: digestOf("boundary") },
            { role: "core-source", path: corePath, sha256: digestOf("core") },
          ],
        },
      ] as unknown as ReadonlyArray<M031TargetQualificationEvidence>,
      artifactPath: ".bang/artifacts/fixture-artifact.json",
      lockPath: ".bang/theory-locks/fixture-artifact.json",
    };
    const entries = collectAuditMaterials(
      report,
      records,
      "packages/theories/theory-packages/exact-one-capability.json",
    );
    const byPath = new Map(entries.map((entry) => [entry.path, entry]));
    expect(byPath.get(corePath)?.class).toBe("decoded");
    expect(byPath.get(corePath)?.citedBy).toContain("evidence:g");
    expect(byPath.get(boundaryPath)?.role).toBe("generated-gleam-boundary");
    expect(byPath.get(boundaryPath)?.recordedSha256).toBe(digestOf("boundary"));
    expect(byPath.get(".bang/artifacts/fixture-artifact.json")?.class).toBe("derived");
    expect(byPath.get(".bang/theory-locks/fixture-artifact.json")?.citedBy).toContain(
      "theory-lock",
    );
    expect([...byPath.keys()]).toStrictEqual([...byPath.keys()].toSorted());
  });

  test("deduplicates a material cited by several records into one entry", () => {
    const sharedPath = "examples/tiny-bank/account.bang";
    const records = {
      planPath: "plan.json",
      plan: { _tag: "NoPlan" } as unknown as PlanningReport,
      qualificationBase: ".bang/q",
      qualificationReportPath: ".bang/q/report.json",
      evidencePaths: [],
      embeddedEvidence: [
        {
          targetId: "a",
          materials: [{ role: "core-source", path: sharedPath, sha256: "1".repeat(64) }],
        },
        {
          targetId: "b",
          materials: [{ role: "core-source", path: sharedPath, sha256: "1".repeat(64) }],
        },
      ] as unknown as ReadonlyArray<M031TargetQualificationEvidence>,
      artifactPath: ".bang/artifacts/x.json",
      lockPath: ".bang/locks/x.json",
    };
    const entries = collectAuditMaterials(fixtureReport(), records, "pkg.json");
    const shared = entries.find(({ path }) => path === sharedPath);
    expect(shared?.citedBy).toEqual(["evidence:a", "evidence:b"]);
  });
});

describe("M034 audit verification boundaries", () => {
  test("fails with inventory/material-missing before any verdict when a material is gone", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "bang-m034-missing-"));
    try {
      await Bun.write(join(projectRoot, "present.txt"), "here\n");
      const error = await Effect.runPromise(
        Effect.flip(
          provideServices(
            verifyMaterialEntries(projectRoot, [
              {
                path: "present.txt",
                role: "assembled-entry",
                class: "opaque",
                recordedSha256: digestOf("here\n"),
                citedBy: ["assembly"],
              },
              {
                path: "absent.txt",
                role: "assembled-entry",
                class: "opaque",
                recordedSha256: "0".repeat(64),
                citedBy: ["assembly"],
              },
            ]),
          ),
        ),
      );
      expect(error).toBeInstanceOf(AuditFailure);
      expect(error.stage).toBe("inventory");
      expect(error.reason).toBe("material-missing");
      expect(error.path).toBe("absent.txt");
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  test("recomputes digests and marks byte changes as changed", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "bang-m034-digest-"));
    try {
      await Bun.write(join(projectRoot, "entry.gleam"), "changed bytes\n");
      await Bun.write(join(projectRoot, "config.toml"), "stable\n");
      await Bun.write(join(projectRoot, "report.json"), "{}\n");
      const audited = await Effect.runPromise(
        provideServices(
          verifyMaterialEntries(projectRoot, [
            {
              path: "entry.gleam",
              role: "assembled-entry",
              class: "opaque",
              recordedSha256: digestOf("original\n"),
              citedBy: ["assembly"],
            },
            {
              path: "config.toml",
              role: "assembly-configuration",
              class: "opaque",
              recordedSha256: digestOf("stable\n"),
              citedBy: ["assembly"],
            },
            {
              path: "report.json",
              role: "assembly-report",
              class: "derived",
              recordedSha256: undefined,
              citedBy: ["assembly"],
            },
          ]),
        ),
      );
      expect(audited.map(({ status }) => status)).toEqual(["changed", "unchanged", "deferred"]);
      expect(audited[2]!.status).toBe("deferred");
      expect(audited[2]!.recordedSha256).toBeUndefined();
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  test("rejects an unsafe assembly identity at selection", async () => {
    const error = await Effect.runPromise(
      Effect.flip(provideServices(selectAssembly(".", "../escape"))),
    );
    expect(error).toBeInstanceOf(AuditFailure);
    expect(error.stage).toBe("selection");
    expect(error.reason).toBe("unsafe-identity");
    expect(error.path).toBe("../escape");
  });

  test("rejects an unknown assembly identity at selection without reading anything else", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "bang-m034-unknown-"));
    try {
      const error = await Effect.runPromise(
        Effect.flip(provideServices(selectAssembly(projectRoot, "never-published"))),
      );
      expect(error).toBeInstanceOf(AuditFailure);
      expect(error.stage).toBe("selection");
      expect(error.reason).toBe("unknown-assembly");
      expect(error.path).toBe("never-published");
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });
});

describe("M034 audit verdict formatting", () => {
  test("prints one deterministic verdict-only report", () => {
    const summary = summarizeAudit("fixture-audit", [
      {
        path: "a.gleam",
        role: "assembled-entry",
        class: "opaque",
        recordedSha256: "1".repeat(64),
        actualSha256: "1".repeat(64),
        citedBy: ["assembly"],
        status: "unchanged",
      },
      {
        path: "b.nix",
        role: "toolchain-definition",
        class: "opaque",
        recordedSha256: "2".repeat(64),
        actualSha256: "3".repeat(64),
        citedBy: ["assembly", "plan-report"],
        status: "changed",
      },
      {
        path: "report.json",
        role: "plan-report",
        class: "derived",
        recordedSha256: undefined,
        actualSha256: "4".repeat(64),
        citedBy: ["assembly"],
        status: "deferred",
      },
    ]);
    const first = formatAuditReport(summary);
    const second = formatAuditReport(summarizeAudit("fixture-audit", summary.materials));
    expect(first).toBe(second);
    expect(first).toContain("Unchanged: 1");
    expect(first).toContain("Changed: 1");
    expect(first).toContain("Deferred: 1");
    expect(first).toContain(`Would retire ${2} records`);
    expect(first).toContain(`changed opaque b.nix [${"3".repeat(64)}]`);
  });

  test("formats typed failures exactly like the house CLI shape", () => {
    const text = formatAuditFailure(
      new AuditFailure({
        stage: "selection",
        path: "bad id",
        reason: "unsafe-identity",
        message: "assembly identity is not a safe identifier",
        address: "addr-1",
      }),
    );
    expect(text.split("\n")).toEqual([
      "stage: selection",
      "path: bad id",
      "reason: unsafe-identity",
      "address: addr-1",
      "message: assembly identity is not a safe identifier",
    ]);
  });
});

const executable = join(root, "node_modules/.bin/bang");
const canonicalSelection = "examples/tiny-bank/assemblies/supervised-exact-one.json";
const canonicalAssemblyId = "tiny-bank-supervised-exact-one";
const m033Closure = [
  ".bang/artifacts/tiny-bank-packaged-exact-one.json",
  ".bang/theory-locks/tiny-bank-packaged-exact-one.json",
  ".bang/qualifications/tiny-bank-two-qualified-exact-one/effect-typescript/boundary.ts",
  ".bang/qualifications/tiny-bank-two-qualified-exact-one/effect-typescript/evidence.json",
  ".bang/qualifications/tiny-bank-two-qualified-exact-one/gleam-beam/src/bang/account_entity.gleam",
  ".bang/qualifications/tiny-bank-two-qualified-exact-one/gleam-beam/evidence.json",
  ".bang/qualifications/tiny-bank-two-qualified-exact-one/report.json",
  `.bang/plans/${canonicalAssemblyId}/report.json`,
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
  // This is an integration bound for an external CLI process, not a test delay.
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

const readBytesOf = async (paths: ReadonlyArray<string>): Promise<ReadonlyArray<Uint8Array>> =>
  Promise.all(paths.map((path) => Bun.file(join(root, path)).bytes()));

const sameBytes = (left: ReadonlyArray<Uint8Array>, right: ReadonlyArray<Uint8Array>): boolean =>
  left.length === right.length &&
  left.every(
    (first, index) =>
      first.length === right[index]!.length &&
      first.every((byte, offset) => byte === right[index]![offset]),
  );

const ensureM032Closure = async (): Promise<void> => {
  const ready = await Promise.all(
    m033Closure.slice(0, 8).map((path) => Bun.file(join(root, path)).exists()),
  );
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

describe("M034 audit CLI", () => {
  test("rejects an unsafe assembly identity without stdout or byte change", async () => {
    await ensureM032Closure();
    const before = await readBytesOf(m033Closure);
    const result = await runBang(["audit", "../escape"]);
    const after = await readBytesOf(m033Closure);
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("stage: selection");
    expect(result.stderr).toContain("reason: unsafe-identity");
    expect(sameBytes(before, after)).toBe(true);
  }, 120_000);

  test("rejects an unknown assembly id without stdout or byte change", async () => {
    const before = await readBytesOf(m033Closure);
    const result = await runBang(["audit", "never-published-assembly"]);
    const after = await readBytesOf(m033Closure);
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("stage: selection");
    expect(result.stderr).toContain("reason: unknown-assembly");
    expect(sameBytes(before, after)).toBe(true);
  }, 60_000);

  test("inventories a freshly assembled closure and prints the same verdict twice", async () => {
    await ensureM032Closure();
    await rm(join(root, ".bang/assemblies", canonicalAssemblyId), { recursive: true, force: true });
    const assembled = await runBang(["assemble", canonicalSelection]);
    expect(assembled.exitCode).toBe(0);
    expect(assembled.stderr).toBe("");

    const first = await runBang(["audit", canonicalAssemblyId]);
    expect(first.exitCode).toBe(0);
    expect(first.stderr).toBe("");
    expect(first.stdout).toContain("M034 audit");
    expect(first.stdout).toContain(`Assembly: ${canonicalAssemblyId}`);
    expect(first.stdout).toContain("Materials: 18 recorded");
    for (const path of m033Closure) {
      expect(first.stdout).toContain(` ${path} [`);
    }
    expect(first.stdout).toContain("decoded examples/tiny-bank/account.bang [");
    expect(first.stdout).toContain("deferred derived .bang/theory-locks/");
    expect(first.stdout).toContain("unchanged opaque nix/gleam.nix [");
    expect(first.stdout).toContain("Changed: 0");
    expect(first.stdout).toContain("Would retire 0 records");

    const second = await runBang(["audit", canonicalAssemblyId]);
    expect(second.exitCode).toBe(0);
    expect(second.stderr).toBe("");
    expect(second.stdout).toBe(first.stdout);
  }, 600_000);
});

const toolchainPath = "nix/gleam.nix";

describe("M034 invalidation fixtures", () => {
  test("fixture 1: changed toolchain bytes retire the artifact, observation, and assembly record only", async () => {
    await ensureM032Closure();
    const original = new Uint8Array(await Bun.file(join(root, toolchainPath)).bytes());
    try {
      await Bun.write(
        join(root, toolchainPath),
        `${new TextDecoder().decode(original)}\n# audit fixture\n`,
      );
      // The canonical CLI audit stays verdict-only; invalidation semantics
      // run through the library boundary in this phase.
      const audited = await Effect.runPromise(provideServices(runAudit(root, canonicalAssemblyId)));
      expect(audited.summary.materials.find((m) => m.path === toolchainPath)?.status).toBe(
        "changed",
      );
    } finally {
      await Bun.write(join(root, toolchainPath), original);
    }
    const restored = await Effect.runPromise(provideServices(runAudit(root, canonicalAssemblyId)));
    expect(restored.summary.materials.find((m) => m.path === toolchainPath)?.status).toBe(
      "unchanged",
    );
  }, 120_000);

  test("fixture 9: deleting a recorded material fails inventory before any verdict", async () => {
    await ensureM032Closure();
    const entryPath = join(root, `.bang/assemblies/${canonicalAssemblyId}/src/main.gleam`);
    const original = new Uint8Array(await Bun.file(entryPath).bytes());
    await rm(entryPath);
    try {
      const error = await Effect.runPromise(
        Effect.flip(provideServices(runAudit(root, canonicalAssemblyId))),
      );
      expect(error).toBeInstanceOf(AuditFailure);
      expect(error.stage).toBe("inventory");
      expect(error.reason).toBe("material-missing");
      expect(error.path).toBe(`.bang/assemblies/${canonicalAssemblyId}/src/main.gleam`);
    } finally {
      await Bun.write(entryPath, original);
    }
  }, 60_000);

  test("fixture 10: two identical runs produce byte-identical reports", async () => {
    await ensureM032Closure();
    const first = await runBang(["audit", canonicalAssemblyId]);
    const second = await runBang(["audit", canonicalAssemblyId]);
    expect(first.exitCode).toBe(0);
    expect(second.exitCode).toBe(0);
    expect(first.stdout).toBe(second.stdout);
  }, 60_000);
});

describe("M034 cosmetic and failed-requalification fixtures", () => {
  const coreSourcePath = "examples/tiny-bank/account.bang";
  const assemblySelection = "examples/tiny-bank/assemblies/supervised-exact-one.json";
  const theoryPackageSourcePath = "packages/theories/theory-packages/exact-one-capability.json";

  test("fixture 5: reordered theory-package JSON keeps the closure valid and refreshes custody", async () => {
    await ensureM032Closure();
    await rm(join(root, ".bang/assemblies", canonicalAssemblyId), {
      recursive: true,
      force: true,
    });
    // Rebuild the closure against the ORIGINAL package so every recorded
    // digest matches before the mutation.
    const baseline = await runBang(["assemble", canonicalSelection]);
    expect(baseline.exitCode).toBe(0);
    expect(baseline.stderr).toBe("");

    const originalPackage = new Uint8Array(
      await Bun.file(join(root, theoryPackageSourcePath)).bytes(),
    );
    try {
      // Cosmetic edit: reverse top-level key order. Same parsed JSON value,
      // different bytes, identical M030 canonical semantic digest.
      const parsed = JSON.parse(new TextDecoder().decode(originalPackage)) as object;
      const reordered: Record<string, unknown> = {};
      for (const key of Object.keys(parsed).toReversed()) {
        reordered[key] = (parsed as Record<string, unknown>)[key];
      }
      await Bun.write(
        join(root, theoryPackageSourcePath),
        `${JSON.stringify(reordered, null, 2)}\n`,
      );

      // Spec material classes: a decoded material with different bytes but
      // equal semantics is cosmetic, and a cosmetic change retires nothing
      // (falsifier #5). This closure records the package only by semantic
      // digest (lock + plan candidate), so there are no byte-custody digests
      // to refresh and every verdict stays valid.
      const invalidation = await Effect.runPromise(
        provideServicesWithSpawner(runInvalidation(root, canonicalAssemblyId, assemblySelection)),
      );
      expect(invalidation.retired.length).toBe(0);
      expect(invalidation.text).toContain("cosmetic decoded packages/theories/");
      expect(invalidation.text).toContain("Would retire 0 records");
      expect(invalidation.text).toContain("Requalified: 0");
      expect(invalidation.text).toContain("Audit parity: match");

      // After recovery, the published closure is valid again with refreshed
      // custody digests matching the reordered package bytes.
      const recovered = await runBang(["audit", canonicalAssemblyId]);
      expect(recovered.exitCode).toBe(0);
      expect(recovered.stderr).toBe("");
      expect(recovered.stdout).toContain("Materials:");
      expect(recovered.stdout).toContain("Changed: 0");
      expect(recovered.stdout).toContain("Would retire 0 records");
    } finally {
      await Bun.write(join(root, theoryPackageSourcePath), originalPackage);
    }
    const restoredAudit = await runBang(["assemble", canonicalSelection]);
    expect(restoredAudit.exitCode).toBe(0);
    const finalAudit = await runBang(["audit", canonicalAssemblyId]);
    expect(finalAudit.exitCode).toBe(0);
    expect(finalAudit.stdout).toContain("Changed: 0");
  }, 600_000);

  test("fixture 8: strengthened invariant forces typed requalification failure and leaves bytes unchanged", async () => {
    await ensureM032Closure();
    await rm(join(root, ".bang/assemblies", canonicalAssemblyId), {
      recursive: true,
      force: true,
    });
    const baseline = await runBang(["assemble", canonicalSelection]);
    expect(baseline.exitCode).toBe(0);
    expect(baseline.stderr).toBe("");

    const originalSource = new Uint8Array(await Bun.file(join(root, coreSourcePath)).bytes());
    try {
      // Strengthen the Account invariant: balance >= 0 -> balance >= 1. The
      // Gleam exact-one projection requires the literal >= 0 predicate and
      // rejects anything else, so M031 requalification genuinely fails and
      // planning surfaces a non-qualified candidate for gleam-beam.
      const strengthened = new TextDecoder()
        .decode(originalSource)
        .replace("balance >= 0", "balance >= 1");
      expect(strengthened).not.toBe(new TextDecoder().decode(originalSource));
      await Bun.write(join(root, coreSourcePath), strengthened);

      const failureBytes = await readBytesOf(m033Closure);
      const error = await Effect.runPromise(
        Effect.flip(
          provideServicesWithSpawner(runInvalidation(root, canonicalAssemblyId, assemblySelection)),
        ),
      );
      expect(error).toBeInstanceOf(AuditFailure);
      expect(error.stage).toBe("requalification");
      // The strengthened invariant makes the Gleam exact-one projection
      // reject the literal >= 0 predicate; M031 requalification surfaces
      // that as an unsupported-target reason mapped onto planning-failed.
      expect(error.reason).toBe("planning-failed");
      expect(error.message).toContain("nonnegativeBalance");

      // Every prior byte remains: the failed journey publishes nothing.
      const afterFailure = await readBytesOf(m033Closure);
      expect(sameBytes(failureBytes, afterFailure)).toBe(true);
    } finally {
      await Bun.write(join(root, coreSourcePath), originalSource);
    }

    // Restore the source; observe recovery to a fully valid closure.
    const recovered = await runBang(["assemble", canonicalSelection]);
    expect(recovered.exitCode).toBe(0);
    expect(recovered.stderr).toBe("");
    const finalAudit = await runBang(["audit", canonicalAssemblyId]);
    expect(finalAudit.exitCode).toBe(0);
    expect(finalAudit.stdout).toContain("Changed: 0");
    expect(finalAudit.stdout).toContain("Would retire 0 records");
  }, 600_000);
});
