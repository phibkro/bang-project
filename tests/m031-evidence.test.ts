import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import {
  checkM031TargetQualificationEvidence,
  checkM031TargetQualificationEvidenceSet,
  decodeM031TargetQualificationEvidence,
  encodeM031TargetQualificationEvidence,
  M031TargetQualificationEvidence,
  M031TargetQualificationEvidenceError,
  type M031TargetQualificationEvidence as M031Evidence,
} from "@bang/evidence";

const digest = "a".repeat(64);

const stateTraces = {
  valid: "10>6",
  reuse: "6>6",
  competing: "6>4",
  wrongDestination: "4>4",
  disabled: "4>4",
  defect: "4>4",
  stale: "4>4",
  replacement: "4>4",
};

const remainingTraces = {
  valid: "1>0",
  reuse: "0>0",
  competing: "1>0",
  wrongDestination: "1>1",
  disabled: "1>1",
  defect: "1>0",
  stale: "0>0",
  replacement: "1>1",
};

const makeEvidence = (targetId: "effect-typescript" | "gleam-beam"): M031Evidence =>
  M031TargetQualificationEvidence.make({
    bangTargetQualificationEvidence: 1,
    selectionId: "tiny-bank-two-qualified-exact-one",
    targetId,
    realizationId: "WithdrawAccountOnce",
    artifactId: "tiny-bank-artifact",
    artifactFormat: "bangSemanticArtifact:1",
    theory: { id: "ExactOneCapabilityExecution", version: 1 },
    package: {
      id: "ExactOneCapabilityExecution",
      version: 1,
      semanticDigest: `sha256:${digest}`,
    },
    requirementAddress: "operationRealization:WithdrawAccountOnce.requirement:DebitAccount",
    observations: {
      target: targetId,
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
      stateTrace: stateTraces,
      remainingTrace:
        targetId === "gleam-beam" ? { ...remainingTraces, replacement: "1>0" } : remainingTraces,
      ...(targetId === "gleam-beam"
        ? {
            actorRestart: {
              oldGrantRejected: true,
              freshGrantDistinct: true,
              replacementGrantAccepted: true,
              supervised: true,
            },
          }
        : {}),
    },
    materials: [
      { role: "core-source", path: "examples/tiny-bank/account.bang", sha256: digest },
      {
        role:
          targetId === "effect-typescript"
            ? "generated-effect-boundary"
            : "generated-gleam-boundary",
        path:
          targetId === "effect-typescript"
            ? "packages/target-effect/src/index.ts"
            : "packages/target-gleam/src/index.ts",
        sha256: digest,
      },
    ],
    producer: {
      identity: targetId === "effect-typescript" ? "m031-effect-probe" : "m031-gleam-probe",
      version: "1",
      targetId,
    },
    assumptions: ["the selected probe is the executed target"],
    weakenings: ["bounded runtime observations do not establish universal behavior"],
    limitations: ["termination and distributed exactly-once behavior are not established"],
    lifetime: `valid while ${targetId} materials remain unchanged`,
    invalidators: ["checked Core or target material changes"],
  });

const replaceMaterial = (
  materials: M031Evidence["materials"],
  role: string,
  replace: (material: M031Evidence["materials"][number]) => M031Evidence["materials"][number],
): M031Evidence["materials"] => {
  const [first, ...rest] = materials;
  return [
    first.role === role ? replace(first) : first,
    ...rest.map((material) => (material.role === role ? replace(material) : material)),
  ];
};

describe("M031 target qualification evidence boundary", () => {
  test("checks valid Effect and Gleam records independently", async () => {
    const effect = await Effect.runPromise(
      checkM031TargetQualificationEvidence(makeEvidence("effect-typescript")),
    );
    const gleam = await Effect.runPromise(
      checkM031TargetQualificationEvidence(makeEvidence("gleam-beam")),
    );
    expect(effect.targetId).toBe("effect-typescript");
    expect(gleam.targetId).toBe("gleam-beam");
  });

  test("checks the ordered pair and rejects shared or reordered targets", async () => {
    const effect = makeEvidence("effect-typescript");
    const gleam = makeEvidence("gleam-beam");
    const checked = await Effect.runPromise(
      checkM031TargetQualificationEvidenceSet([effect, gleam]),
    );
    expect(checked).toHaveLength(2);

    const error = await Effect.runPromise(
      Effect.flip(checkM031TargetQualificationEvidenceSet([gleam, effect])),
    );
    expect(error).toBeInstanceOf(M031TargetQualificationEvidenceError);
    expect(error.reason).toBe("target-mismatch");
  });

  test("requires target-owned roles and permits only identical shared core material", async () => {
    const effect = makeEvidence("effect-typescript");
    const wrongTargetRole = M031TargetQualificationEvidence.make({
      ...effect,
      materials: replaceMaterial(effect.materials, "generated-effect-boundary", (material) =>
        Object.assign({}, material, { role: "generated-gleam-boundary" }),
      ),
    });
    const roleError = await Effect.runPromise(
      Effect.flip(checkM031TargetQualificationEvidence(wrongTargetRole)),
    );
    expect(roleError.reason).toBe("target-mismatch");

    const gleam = makeEvidence("gleam-beam");
    const effectBoundaryPath = effect.materials.find(
      ({ role }) => role === "generated-effect-boundary",
    )?.path;
    if (effectBoundaryPath === undefined) throw new Error("Effect boundary material is missing");
    const sharedTargetMaterial = M031TargetQualificationEvidence.make({
      ...gleam,
      materials: replaceMaterial(gleam.materials, "generated-gleam-boundary", (material) =>
        Object.assign({}, material, { path: effectBoundaryPath }),
      ),
    });
    const sharedTargetError = await Effect.runPromise(
      Effect.flip(checkM031TargetQualificationEvidenceSet([effect, sharedTargetMaterial])),
    );
    expect(sharedTargetError.reason).toBe("shared-evidence");

    const mismatchedSharedDigest = M031TargetQualificationEvidence.make({
      ...gleam,
      materials: replaceMaterial(gleam.materials, "core-source", (material) =>
        Object.assign({}, material, { sha256: "b".repeat(64) }),
      ),
    });
    const sharedDigestError = await Effect.runPromise(
      Effect.flip(checkM031TargetQualificationEvidenceSet([effect, mismatchedSharedDigest])),
    );
    expect(sharedDigestError.reason).toBe("shared-evidence");
  });

  test("rejects contradictory competing and restart observations", async () => {
    const effect = makeEvidence("effect-typescript");
    const competing = M031TargetQualificationEvidence.make({
      ...effect,
      observations: { ...effect.observations, competingSuccesses: 2, competingRejections: 0 },
    });
    const competingError = await Effect.runPromise(
      Effect.flip(checkM031TargetQualificationEvidence(competing)),
    );
    expect(competingError.reason).toBe("contradictory-observation");

    const gleam = makeEvidence("gleam-beam");
    const restored = M031TargetQualificationEvidence.make({
      ...gleam,
      observations: {
        ...gleam.observations,
        actorRestart: {
          oldGrantRejected: false,
          freshGrantDistinct: true,
          replacementGrantAccepted: true,
          supervised: true,
        },
      },
    });
    const restartError = await Effect.runPromise(
      Effect.flip(checkM031TargetQualificationEvidence(restored)),
    );
    expect(restartError.reason).toBe("contradictory-observation");
  });

  test("decodes strict JSON and encodes deterministically", async () => {
    const evidence = makeEvidence("effect-typescript");
    const encoded = encodeM031TargetQualificationEvidence(evidence);
    const decoded = await Effect.runPromise(decodeM031TargetQualificationEvidence(encoded));
    expect(encodeM031TargetQualificationEvidence(decoded)).toBe(encoded);

    const malformed = await Effect.runPromise(
      Effect.flip(
        decodeM031TargetQualificationEvidence(JSON.stringify({ ...evidence, unexpected: true })),
      ),
    );
    expect(malformed.reason).toBe("invalid-manifest");
  });
});
