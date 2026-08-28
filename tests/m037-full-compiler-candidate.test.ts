import { resolve } from "node:path";
import { describe, expect, test } from "bun:test";
import { BunServices } from "@effect/platform-bun";
import { Effect, Schema } from "effect";
import {
  ClassificationFailure,
  compileSelectedM031ClassificationStaged,
} from "../apps/bang/src/classify.ts";
import {
  M037CandidateFailureSchema,
  M037FullCompilerCandidateReportFromJson,
  M037FullCompilerCandidateSelectionSchema,
  validateM037UnsupportedClaims,
} from "../scripts/m037-full-compiler-candidate.ts";

const workspaceRoot = resolve(import.meta.dir, "..");
const sha256 = `sha256:${"0".repeat(64)}`;
const publicationCause = {
  _tag: "PublicationFailure",
  stage: "commit",
  path: ".bang/evidence/M037.json",
  reason: "publication-failed",
  message: "fixture publication failure",
} as const;
const consumerCause = (stage: string, reason: string) => ({
  _tag: "M035RejectedVerdict" as const,
  stage,
  reason,
  message: "fixture rejected verdict",
});

const negativeFixtures = [
  {
    name: "rejects a non-x86_64-linux host fact",
    stage: "preflight",
    reason: "unsupported-platform",
  },
  {
    name: "rejects Bun 1.3.12",
    stage: "preflight",
    reason: "bun-version-unsupported",
  },
  {
    name: "reports an unavailable detached worktree",
    stage: "preflight",
    reason: "git-worktree-unavailable",
  },
  {
    name: "reports a failed Bash strict-mode probe",
    stage: "preflight",
    reason: "bash-unavailable",
  },
  {
    name: "rejects Just 1.57.0",
    stage: "preflight",
    reason: "just-version-unsupported",
  },
  {
    name: "reports a failed Nix preflight",
    stage: "preflight",
    reason: "nix-unavailable",
  },
  {
    name: "rejects a combined-toolchain escript path",
    stage: "artifact",
    reason: "runtime-boundary-violated",
  },
  {
    name: "rejects a changed artifact command boundary",
    stage: "artifact",
    reason: "runtime-boundary-violated",
  },
  {
    name: "rejects a workspace or Gleam resolution leak",
    stage: "artifact",
    reason: "runtime-boundary-violated",
  },
  {
    name: "rejects an excess candidate selection property",
    stage: "selection",
    reason: "invalid-selection",
  },
  {
    name: "projects the foreign realization classifier failure",
    stage: "classify",
    reason: "producer-failed",
  },
  {
    name: "projects the unsupported target classifier failure",
    stage: "classify",
    reason: "producer-failed",
  },
  {
    name: "projects a damaged escript execution failure",
    stage: "artifact",
    reason: "execution-failed",
  },
  {
    name: "projects an M035 custody rejection",
    stage: "external-consumer",
    reason: "consumer-rejected",
    cause: consumerCause("custody", "digest-mismatch"),
  },
  {
    name: "projects an M035 strict decode rejection",
    stage: "external-consumer",
    reason: "consumer-rejected",
    cause: consumerCause("decode", "decode-failed"),
  },
  {
    name: "projects an outside-import process failure",
    stage: "external-consumer",
    reason: "process-failed",
  },
  {
    name: "rejects an upgraded unsupported claim",
    stage: "accumulation",
    reason: "unsupported-claim-upgraded",
  },
  {
    name: "reports the first producer inventory divergence",
    stage: "comparison",
    reason: "producer-inventory-diverged",
    firstDifferingPath: ".bang/assemblies/clinic-supervised-exact-one/src/main.gleam",
    firstSha256: sha256,
    secondSha256: `sha256:${"1".repeat(64)}`,
  },
  {
    name: "reports a restored publication failure",
    stage: "publication",
    reason: "publication-failed",
    cause: publicationCause,
  },
  {
    name: "reports a rollback failure without a restoration claim",
    stage: "publication",
    reason: "rollback-failed",
    cause: { ...publicationCause, reason: "rollback-failed" },
  },
] as const;

const decodeFailure = Schema.decodeUnknownSync(M037CandidateFailureSchema);

describe("M037 full compiler candidate contract", () => {
  for (const fixture of negativeFixtures) {
    test(fixture.name, () => {
      const { name, ...failure } = fixture;
      const decoded = decodeFailure({
        bangFullCompilerCandidateFailure: 1,
        message: name,
        ...failure,
      });
      expect(decoded.stage).toBe(fixture.stage);
      expect(decoded.reason).toBe(fixture.reason);
    });
  }

  test("keeps stage and reason pairs discriminated", () => {
    expect(() =>
      decodeFailure({
        bangFullCompilerCandidateFailure: 1,
        stage: "selection",
        reason: "nix-unavailable",
        message: "cross-stage pair",
      }),
    ).toThrow();
  });

  test("strictly decodes the public selection and rejects an excess property", () => {
    const selection = {
      bangFullCompilerCandidate: 1,
      id: "clinic-full-compiler-candidate",
      assemblySelection: "examples/clinic/assemblies/supervised-exact-one.json",
      externalConsumer: "examples/clinic/external-consumer/consumer.mjs",
    } as const;
    expect(Schema.decodeUnknownSync(M037FullCompilerCandidateSelectionSchema)(selection)).toEqual(
      selection,
    );
    expect(() =>
      Schema.decodeUnknownSync(M037FullCompilerCandidateSelectionSchema)({
        ...selection,
        unexpected: true,
      }),
    ).toThrow();
  });

  test("strictly rejects an excess failure property", () => {
    expect(() =>
      decodeFailure({
        bangFullCompilerCandidateFailure: 1,
        stage: "preflight",
        reason: "unsupported-platform",
        message: "fixture",
        unexpected: true,
      }),
    ).toThrow();
  });

  test("rejects a malformed or incomplete public report", () => {
    expect(() =>
      Schema.decodeUnknownSync(M037FullCompilerCandidateReportFromJson)(
        JSON.stringify({ bangFullCompilerCandidate: 1, id: "M037", unexpected: true }),
      ),
    ).toThrow();
  });

  test("keeps every unsupported claim unsupported", async () => {
    const failure = await Effect.runPromise(
      Effect.flip(
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
      ),
    );
    expect(failure).toMatchObject({
      stage: "accumulation",
      reason: "unsupported-claim-upgraded",
    });
  });

  test("observes the foreign realization producer failure in-process", async () => {
    const failure = await classificationFailure(
      "examples/clinic/realizations/foreign-realization.json",
    );
    expect(failure).toBeInstanceOf(ClassificationFailure);
    expect(failure).toMatchObject({
      stage: "target",
      reason: "missing-declaration",
      address: "operationRealization:WithdrawAccountOnce",
    });
  });

  test("observes the unsupported two-field target producer failure in-process", async () => {
    const failure = await classificationFailure(
      "examples/clinic/realizations/unsupported-two-state-fields.json",
    );
    expect(failure).toBeInstanceOf(ClassificationFailure);
    expect(failure).toMatchObject({
      stage: "target",
      reason: "unsupported-target",
      address: "stateMachine:AppointmentBook",
    });
  });
});

const classificationFailure = (selectionPath: string) =>
  Effect.runPromise(
    Effect.flip(
      compileSelectedM031ClassificationStaged(workspaceRoot, selectionPath).pipe(
        // Test execution is the composition root for staged platform services.
        // @effect-diagnostics-next-line strictEffectProvide:off
        Effect.provide(BunServices.layer),
      ),
    ),
  );
