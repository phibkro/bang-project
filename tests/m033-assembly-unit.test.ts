import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { M031TargetQualificationObservations } from "@bang/evidence";
import { BunServices } from "@effect/platform-bun";
import { describe, expect, test } from "bun:test";
import { Crypto, Effect, FileSystem, Path } from "effect";
import {
  AssemblyFailure,
  decodeAssemblyObservation,
  extractToolchainPin,
  findRawExport,
  runAssemblyProcess,
  selectedGleamEvidence,
} from "../apps/bang/src/assemble.ts";
import type { PlanCompileStagedResult } from "../apps/bang/src/plan.ts";

const textEncoder = new TextEncoder();

const testCrypto = Crypto.make({
  randomBytes: (size) => new Uint8Array(size),
  digest: (_algorithm, data) =>
    Effect.promise(() => crypto.subtle.digest("SHA-256", Uint8Array.from(data).buffer)).pipe(
      Effect.map((hash) => new Uint8Array(hash)),
    ),
});

const trace = {
  valid: "1>0",
  reuse: "0>0",
  competing: "1>0",
  wrongDestination: "1>1",
  disabled: "1>1",
  defect: "1>0",
  stale: "0>0",
  replacement: "1>0",
} as const;

const actorRestart = {
  oldGrantRejected: true,
  freshGrantDistinct: true,
  replacementGrantAccepted: true,
  supervised: true,
} as const;

const expectedObservation: M031TargetQualificationObservations = {
  target: "gleam-beam",
  realization: "WithdrawAccountOnce",
  entity: "account-1",
  validCall: true,
  reuse: true,
  competing: true,
  competingSuccesses: 1,
  competingRejections: 1,
  wrongDestination: true,
  disabled: true,
  defect: true,
  stateTrace: trace,
  remainingTrace: trace,
  actorRestart,
};

const rawObservation = {
  ...expectedObservation,
  actorRestart: {
    oldGrantRejected: actorRestart.oldGrantRejected,
    freshGrantDistinct: actorRestart.freshGrantDistinct,
    replacementGrantAccepted: actorRestart.replacementGrantAccepted,
  },
  supervised: actorRestart.supervised,
};

describe("M033 assembly failure boundaries", () => {
  test("rejects an unpinned toolchain definition", async () => {
    const error = await Effect.runPromise(
      Effect.flip(extractToolchainPin(textEncoder.encode("unpinned toolchain"))),
    );

    expect(error).toBeInstanceOf(AssemblyFailure);
    expect(error.stage).toBe("toolchain");
    expect(error.reason).toBe("toolchain-unavailable");
    expect(error.path).toBe("nix/gleam.nix");
  });

  test("rejects generated boundary bytes that differ from selected evidence", async () => {
    const generatedPath =
      ".bang/qualifications/unit-qualification/gleam-beam/src/bang/account_entity.gleam";
    const staged = {
      selection: {
        id: "unit-assembly",
        qualificationSelection: "unit-qualification.json",
      },
      report: {
        _tag: "Selected",
        plan: { candidate: { target: "gleam-beam" } },
      },
      qualification: {
        selection: { id: "unit-qualification" },
        evidence: [
          {
            targetId: "gleam-beam",
            materials: [
              {
                role: "generated-gleam-boundary",
                path: generatedPath,
                sha256: "0".repeat(64),
              },
            ],
          },
        ],
      },
      publicationEntries: [
        {
          path: generatedPath,
          bytes: textEncoder.encode("changed generated boundary"),
        },
      ],
    } as unknown as PlanCompileStagedResult;

    const error = await Effect.runPromise(
      Effect.flip(Effect.provideService(selectedGleamEvidence(staged), Crypto.Crypto, testCrypto)),
    );

    expect(error).toBeInstanceOf(AssemblyFailure);
    expect(error.stage).toBe("material");
    expect(error.reason).toBe("material-mismatch");
    expect(error.path).toBe(generatedPath);
  });

  test("rejects an export closure without a main escript", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "bang-m033-export-"));
    try {
      const error = await Effect.runPromise(
        // Test execution is the composition root for platform filesystem services.
        // @effect-diagnostics-next-line strictEffectProvide:off
        Effect.provide(
          Effect.flip(
            Effect.gen(function* () {
              const fileSystem = yield* FileSystem.FileSystem;
              const path = yield* Path.Path;
              return yield* findRawExport(fileSystem, path, projectRoot);
            }),
          ),
          BunServices.layer,
        ),
      );

      expect(error).toBeInstanceOf(AssemblyFailure);
      expect(error.stage).toBe("build");
      expect(error.reason).toBe("export-failed");
      expect(error.path).toBe("build/export");
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });

  test("maps an unsuccessful child process to execution-failed", async () => {
    const error = await Effect.runPromise(
      // Test execution is the composition root for platform process services.
      // @effect-diagnostics-next-line strictEffectProvide:off
      Effect.provide(
        Effect.flip(
          Effect.scoped(
            runAssemblyProcess(
              process.execPath,
              ["-e", "process.exit(7)"],
              process.cwd(),
              {},
              "execution",
              "execution-failed",
              "unit-child",
            ),
          ),
        ),
        BunServices.layer,
      ),
    );

    expect(error).toBeInstanceOf(AssemblyFailure);
    expect(error.stage).toBe("execution");
    expect(error.reason).toBe("execution-failed");
    expect(error.path).toBe("unit-child");
  });

  test("rejects an observation that differs from selected M031 evidence", async () => {
    const mismatched = { ...rawObservation, validCall: false };
    const error = await Effect.runPromise(
      Effect.flip(
        decodeAssemblyObservation(
          `BANG_M031_RESULT|${JSON.stringify(mismatched)}\n`,
          "",
          { observations: expectedObservation },
          "unit-artifact",
        ),
      ),
    );

    expect(error).toBeInstanceOf(AssemblyFailure);
    expect(error.stage).toBe("execution");
    expect(error.reason).toBe("observation-mismatch");
    expect(error.path).toBe("unit-artifact");
  });
});
