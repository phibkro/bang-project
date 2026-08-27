import { createHash } from "node:crypto";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { validateCore } from "@bang/core";
import {
  checkM031TargetQualificationEvidence,
  decodeM031TargetQualificationEvidence,
  type M031TargetQualificationEvidence,
} from "@bang/evidence";
import { sourceToCore } from "@bang/surface";
import { Effect, Result } from "effect";

const workspaceRoot = resolve(import.meta.dir, "..");
const executable = join(workspaceRoot, "node_modules/.bin/bang");
let root: string;
const clinicClassification = "examples/clinic/realizations/two-qualified-exact-one.json";
const clinicPlan = "examples/clinic/plans/supervised-exact-one.json";
const clinicAssembly = "examples/clinic/assemblies/supervised-exact-one.json";
const clinicAssemblyId = "clinic-supervised-exact-one";
const clinicQualificationId = "clinic-two-qualified-exact-one";
const clinicArtifactId = "clinic-packaged-exact-one";
const clinicRequirement = "operationRealization:BookAppointmentOnce.requirement:ConfirmBooking";
const clinicEvidencePath = `.bang/qualifications/${clinicQualificationId}/effect-typescript/evidence.json`;
const clinicLockPath = `.bang/theory-locks/${clinicArtifactId}.json`;

const clinicClosure = [
  `.bang/artifacts/${clinicArtifactId}.json`,
  clinicLockPath,
  `.bang/qualifications/${clinicQualificationId}/effect-typescript/boundary.ts`,
  clinicEvidencePath,
  `.bang/qualifications/${clinicQualificationId}/gleam-beam/src/bang/appointment_book_entity.gleam`,
  `.bang/qualifications/${clinicQualificationId}/gleam-beam/evidence.json`,
  `.bang/qualifications/${clinicQualificationId}/report.json`,
  `.bang/plans/${clinicAssemblyId}/report.json`,
  `.bang/assemblies/${clinicAssemblyId}/gleam.toml`,
  `.bang/assemblies/${clinicAssemblyId}/manifest.toml`,
  `.bang/assemblies/${clinicAssemblyId}/canonicalize_escript.escript`,
  `.bang/assemblies/${clinicAssemblyId}/src/bang/appointment_book_entity.gleam`,
  `.bang/assemblies/${clinicAssemblyId}/src/main.gleam`,
  `.bang/assemblies/${clinicAssemblyId}/bin/exact_one`,
  `.bang/assemblies/${clinicAssemblyId}/report.json`,
] as const;

const schemaPublication = [
  "dist/schemas/2/manifest.json",
  "dist/schemas/2/schemas/bang-semantic-artifact-1.schema.json",
  "dist/schemas/2/schemas/bang-target-evidence-1.schema.json",
  "dist/schemas/2/schemas/bang-theory-lock-1.schema.json",
  "dist/schemas/2/types/consumer.d.ts",
  "dist/schemas/2/types/consumer.js",
] as const;

const fullClinicLayout = [...clinicClosure, ...schemaPublication] as const;
const legacySchemaPublication = schemaPublication.map((path) =>
  path.replace("dist/schemas/2/", "dist/schemas/1/"),
);
const clinicPublicationRoots = [
  `.bang/artifacts/${clinicArtifactId}.json`,
  clinicLockPath,
  `.bang/qualifications/${clinicQualificationId}`,
  `.bang/plans/${clinicAssemblyId}`,
  `.bang/assemblies/${clinicAssemblyId}`,
  "dist/schemas/2",
] as const;
const tinyBankPublicationRoots = [
  ".bang/artifacts/tiny-bank-packaged-exact-one.json",
  ".bang/theory-locks/tiny-bank-packaged-exact-one.json",
  ".bang/qualifications/tiny-bank-two-qualified-exact-one",
  ".bang/plans/tiny-bank-supervised-exact-one",
  ".bang/assemblies/tiny-bank-supervised-exact-one",
] as const;
const persistentPublicationRoots = [".bang", "dist"] as const;

interface CommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

interface TinyBankBaseline {
  readonly bangM036TinyBankParity: 1;
  readonly protectedRevision: string;
  readonly candidateRevision: string;
  readonly dependencyLock: {
    readonly path: string;
    readonly sha256: string;
  };
  readonly commands: ReadonlyArray<string>;
  readonly files: ReadonlyArray<{
    readonly path: string;
    readonly protectedSha256: string;
    readonly candidateSha256: string;
  }>;
}

interface ClinicJourney {
  readonly classification: CommandResult;
  readonly planning: CommandResult;
  readonly assembly: CommandResult;
  readonly artifact: CommandResult;
  readonly audit: CommandResult;
  readonly schemas: CommandResult;
}

const sandboxInputs = [
  "package.json",
  "bun.lock",
  "nix/gleam.nix",
  "packages/theories/theory-packages",
  "examples/clinic",
  "examples/tiny-bank",
] as const;

const makeRepositorySandbox = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), "bang-m036-repository-"));
  await Promise.all(
    sandboxInputs.map(async (repositoryPath) => {
      const destination = join(directory, repositoryPath);
      await mkdir(dirname(destination), { recursive: true });
      await cp(join(workspaceRoot, repositoryPath), destination, { recursive: true });
    }),
  );
  await symlink(join(workspaceRoot, "node_modules"), join(directory, "node_modules"), "dir");
  await Promise.all(
    legacySchemaPublication.map(async (publicationPath) => {
      const destination = join(directory, publicationPath);
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, `protected M035 major 1 custody: ${publicationPath}\n`);
    }),
  );
  return directory;
};

const runProcess = async (
  command: ReadonlyArray<string>,
  cwd = root,
  timeoutMilliseconds = 900_000,
  environment: Readonly<Record<string, string | undefined>> = processEnv,
): Promise<CommandResult> => {
  const process = Bun.spawn([...command], {
    cwd,
    env: environment,
    stdout: "pipe",
    stderr: "pipe",
  });
  // This wall-clock deadline bounds an external compiler process; fake test time cannot stop it.
  let timer: NodeJS.Timeout | undefined;
  const timedOut = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      process.kill();
      reject(new Error(`command timed out: ${command.join(" ")}`));
    }, timeoutMilliseconds);
  });
  try {
    return await Promise.race([
      Promise.all([
        process.exited,
        new Response(process.stdout).text(),
        new Response(process.stderr).text(),
      ]).then(([exitCode, stdout, stderr]) => ({ exitCode, stdout, stderr })),
      timedOut,
    ]);
  } finally {
    clearTimeout(timer);
  }
};

const processEnv = Object.freeze({
  ...globalThis.process.env,
  NO_COLOR: "1",
  FORCE_COLOR: "0",
});

const runBang = (args: ReadonlyArray<string>, timeoutMilliseconds?: number, cwd = root) =>
  runProcess([executable, ...args], cwd, timeoutMilliseconds);

const requireSuccess = (label: string, result: CommandResult): void => {
  if (result.exitCode !== 0 || result.stderr !== "") {
    throw new Error(
      `${label} failed: exit=${result.exitCode}; stdout=${JSON.stringify(result.stdout)}; stderr=${JSON.stringify(result.stderr)}`,
    );
  }
};

const runClinicJourney = async (cwd = root): Promise<ClinicJourney> => {
  const classification = await runBang(["classify", clinicClassification], 300_000, cwd);
  requireSuccess("Clinic classification", classification);
  const planning = await runBang(["plan", clinicPlan], 300_000, cwd);
  requireSuccess("Clinic planning", planning);
  const assembly = await runBang(["assemble", clinicAssembly], 600_000, cwd);
  requireSuccess("Clinic assembly", assembly);
  const runtime = await runProcess(
    [
      "nix",
      "shell",
      "-f",
      join(cwd, "nix/gleam.nix"),
      "-c",
      "sh",
      "-c",
      'readlink -f "$(command -v escript)"; command -v dirname',
    ],
    cwd,
    300_000,
  );
  requireSuccess("Erlang runtime resolution", runtime);
  const [escript, dirnameCommand] = runtime.stdout.trim().split("\n");
  if (escript === undefined || !escript.startsWith("/"))
    throw new Error(`Erlang runtime returned an unsafe escript path: ${escript}`);
  if (dirnameCommand === undefined || !dirnameCommand.startsWith("/"))
    throw new Error(`Erlang runtime returned an unsafe dirname path: ${dirnameCommand}`);
  const artifactRuntimePath = `${dirname(escript)}:${dirname(dirnameCommand)}`;
  if (
    await Promise.all(
      artifactRuntimePath.split(":").map((directory) => pathExists(join(directory, "gleam"))),
    ).then((results) => results.some(Boolean))
  ) {
    throw new Error(`artifact-only PATH exposes the Gleam compiler: ${artifactRuntimePath}`);
  }
  const artifactDirectory = await mkdtemp(join(tmpdir(), "bang-m036-artifact-"));
  await cp(
    join(cwd, `.bang/assemblies/${clinicAssemblyId}/bin/exact_one`),
    join(artifactDirectory, "exact_one"),
  );
  let artifact: CommandResult;
  try {
    artifact = await runProcess([escript, "exact_one"], artifactDirectory, 300_000, {
      HOME: artifactDirectory,
      LANG: "C.UTF-8",
      PATH: artifactRuntimePath,
      ERL_CRASH_DUMP_SECONDS: "0",
    });
  } finally {
    await rm(artifactDirectory, { recursive: true, force: true });
  }
  requireSuccess("published Clinic artifact", artifact);
  const audit = await runBang(["audit", clinicAssemblyId], 900_000, cwd);
  requireSuccess("Clinic audit", audit);
  const schemas = await runBang(["export-schemas"], 300_000, cwd);
  requireSuccess("schema publication", schemas);
  return { classification, planning, assembly, artifact, audit, schemas };
};

const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

const digestPaths = async (
  paths: ReadonlyArray<string>,
  cwd = root,
): Promise<Readonly<Record<string, string>>> =>
  Object.fromEntries(
    await Promise.all(
      paths.map(async (path) => [path, sha256(await readFile(join(cwd, path)))] as const),
    ),
  );
const digestInventory = async (
  roots: ReadonlyArray<string>,
  cwd = root,
): Promise<Readonly<Record<string, string>>> => {
  const files: Array<readonly [string, string]> = [];
  const visit = async (repositoryPath: string): Promise<void> => {
    const absolute = join(cwd, repositoryPath);
    const metadata = await stat(absolute);
    if (!metadata.isDirectory()) {
      files.push([repositoryPath, sha256(await readFile(absolute))]);
      return;
    }
    const entries = await readdir(absolute, { withFileTypes: true });
    await Promise.all(entries.map(({ name }) => visit(join(repositoryPath, name))));
  };
  await Promise.all(roots.map(visit));
  files.sort(([left], [right]) => left.localeCompare(right));
  return Object.fromEntries(files);
};

const pathExists = async (path: string): Promise<boolean> =>
  stat(path).then(
    () => true,
    () => false,
  );

const readJson = async <A>(path: string, cwd = root): Promise<A> =>
  JSON.parse(await readFile(join(cwd, path), "utf8")) as A;
const artifactObservation = (stdout: string): unknown => {
  const prefix = "BANG_M031_RESULT|";
  const encoded = stdout
    .split("\n")
    .findLast((line) => line.startsWith(prefix))
    ?.slice(prefix.length);
  if (encoded === undefined)
    throw new Error("published Clinic artifact emitted no M031 observation");
  return JSON.parse(encoded);
};

const checkedClinicCore = async (cwd = root) => {
  const source = await readFile(join(cwd, "examples/clinic/clinic.bang"), "utf8");
  const parsed = sourceToCore(source);
  if (Result.isFailure(parsed)) throw parsed.failure;
  return Effect.runSync(validateCore(parsed.success));
};

const decodeEvidence = (value: unknown) =>
  Effect.runPromise(decodeM031TargetQualificationEvidence(JSON.stringify(value)));

const evidenceFailure = async (value: unknown) => {
  const core = await checkedClinicCore();
  return Effect.runPromise(
    Effect.flip(
      decodeM031TargetQualificationEvidence(JSON.stringify(value)).pipe(
        Effect.flatMap((evidence) =>
          checkM031TargetQualificationEvidence(evidence, {
            selectionId: clinicQualificationId,
            targetId: "effect-typescript",
            realizationId: "BookAppointmentOnce",
            artifactId: clinicArtifactId,
            artifactFormat: "bangSemanticArtifact:1",
            requirementAddress: clinicRequirement,
            core,
          }),
        ),
      ),
    ),
  );
};

const consumerSource = `import { verifyBangConsumption } from "./publication/types/consumer.js";

const verdict = await verifyBangConsumption({
  manifestPath: "publication/manifest.json",
  lockPath: "inputs/clinic.lock.json",
  evidencePath: "inputs/effect-typescript.evidence.json",
  materialsDirectory: "inputs/materials",
});
process.stdout.write(JSON.stringify(verdict));
if (verdict.verdict !== "valid") process.exit(1);
`;

const makeConsumerSandbox = async (): Promise<{
  readonly directory: string;
  readonly evidence: M031TargetQualificationEvidence;
}> => {
  const directory = await mkdtemp(join(tmpdir(), "bang-m036-consumer-"));
  await cp(join(root, "dist/schemas/2"), join(directory, "publication"), {
    recursive: true,
  });
  await mkdir(join(directory, "inputs/materials"), { recursive: true });
  await cp(join(root, clinicLockPath), join(directory, "inputs/clinic.lock.json"));
  await cp(
    join(root, clinicEvidencePath),
    join(directory, "inputs/effect-typescript.evidence.json"),
  );
  const evidence = await decodeEvidence(await readJson<unknown>(clinicEvidencePath));
  await Promise.all(
    evidence.materials.map(async (material) => {
      const destination = join(directory, "inputs/materials", material.path);
      await mkdir(dirname(destination), { recursive: true });
      await cp(join(root, material.path), destination);
    }),
  );
  await writeFile(join(directory, "consumer.mjs"), consumerSource);
  return { directory, evidence };
};

const runConsumer = (directory: string) =>
  runProcess([process.execPath, "consumer.mjs"], directory, 60_000);

let temporaryRoot: string;
let firstJourney: ClinicJourney;
let firstClinicInventory: Readonly<Record<string, string>>;
let legacySchemaDigests: Readonly<Record<string, string>>;
let tinyBankBaseline: TinyBankBaseline;

beforeAll(async () => {
  root = await makeRepositorySandbox();
  temporaryRoot = await mkdtemp(join(root, ".m036-portability-test-"));
  tinyBankBaseline = JSON.parse(
    await readFile(join(workspaceRoot, "tests/m036-tiny-bank-protected-baseline.json"), "utf8"),
  ) as TinyBankBaseline;
  legacySchemaDigests = await digestPaths(legacySchemaPublication);

  for (const command of [
    ["classify", "examples/tiny-bank/realizations/two-qualified-exact-one.json"],
    ["plan", "examples/tiny-bank/plans/supervised-exact-one.json"],
    ["assemble", "examples/tiny-bank/assemblies/supervised-exact-one.json"],
  ] as const) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- each command consumes the prior command's publication.
    const result = await runBang(command, 600_000);
    requireSuccess(`TinyBank ${command[0]}`, result);
  }

  firstJourney = await runClinicJourney();
  firstClinicInventory = await digestInventory(clinicPublicationRoots);
}, 1_800_000);

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("M036 second-domain realization boundary portability", () => {
  test("carries stable Clinic identities through qualification, planning, assembly, audit, and publication", async () => {
    expect(firstJourney.classification.stdout).toContain(
      "Requirement: operationRealization:BookAppointmentOnce.requirement:ConfirmBooking",
    );
    expect(firstJourney.classification.stdout).toContain("effect-typescript -> qualified");
    expect(firstJourney.classification.stdout).toContain("gleam-beam -> qualified");
    expect(firstJourney.planning.stdout).toContain("Result: Selected");
    expect(firstJourney.planning.stdout).toContain("Candidate: gleam-beam");
    expect(firstJourney.assembly.stdout).toContain("Assembly: clinic-supervised-exact-one");
    expect(artifactObservation(firstJourney.artifact.stdout)).toMatchObject({
      target: "gleam-beam",
      realization: "BookAppointmentOnce",
      entity: "appointment-book-1",
    });
    expect(firstJourney.audit.stdout).toContain("Assembly: clinic-supervised-exact-one");
    expect(firstJourney.audit.stdout).toContain("Changed: 0");
    expect(firstJourney.audit.stdout).toContain("Would retire 0 records");
    expect(firstJourney.schemas.stdout).toBe("dist/schemas/2\n");
    expect(Object.keys(firstClinicInventory)).toEqual([...fullClinicLayout].toSorted());
    expect(await digestPaths(legacySchemaPublication)).toEqual(legacySchemaDigests);
    const publication = await readJson<{
      readonly bangSchemaPublication: number;
      readonly version: number;
      readonly documents: ReadonlyArray<{ readonly format: string }>;
    }>("dist/schemas/2/manifest.json");
    expect(publication).toMatchObject({ bangSchemaPublication: 1, version: 2 });
    expect(publication.documents.map(({ format }) => format)).toEqual([
      "bangSemanticArtifact:1",
      "bangTheoryLock:1",
      "bangTargetQualificationEvidence:1",
    ]);

    const qualification = await readJson<{
      readonly requirementAddress: string;
      readonly evidence: ReadonlyArray<{
        readonly targetId: string;
        readonly realizationId: string;
        readonly requirementAddress: string;
        readonly observations: {
          readonly target: string;
          readonly realization: string;
          readonly entity: string;
        };
      }>;
    }>(`.bang/qualifications/${clinicQualificationId}/report.json`);
    expect(qualification.requirementAddress).toBe(clinicRequirement);
    expect(
      qualification.evidence.map((evidence) => ({
        targetId: evidence.targetId,
        realizationId: evidence.realizationId,
        requirementAddress: evidence.requirementAddress,
        observation: {
          target: evidence.observations.target,
          realization: evidence.observations.realization,
          entity: evidence.observations.entity,
        },
      })),
    ).toEqual([
      {
        targetId: "effect-typescript",
        realizationId: "BookAppointmentOnce",
        requirementAddress: clinicRequirement,
        observation: {
          target: "effect-typescript",
          realization: "BookAppointmentOnce",
          entity: "appointment-book-1",
        },
      },
      {
        targetId: "gleam-beam",
        realizationId: "BookAppointmentOnce",
        requirementAddress: clinicRequirement,
        observation: {
          target: "gleam-beam",
          realization: "BookAppointmentOnce",
          entity: "appointment-book-1",
        },
      },
    ]);

    const plan = await readJson<{
      readonly _tag: string;
      readonly plan: {
        readonly candidate: {
          readonly target: string;
          readonly realization: string;
          readonly requirementAddress: string;
        };
      };
    }>(`.bang/plans/${clinicAssemblyId}/report.json`);
    expect(plan._tag).toBe("Selected");
    expect(plan.plan.candidate).toMatchObject({
      target: "gleam-beam",
      realization: "BookAppointmentOnce",
      requirementAddress: clinicRequirement,
    });

    const assembly = await readJson<{
      readonly execution: {
        readonly observation: {
          readonly target: string;
          readonly realization: string;
          readonly entity: string;
        };
      };
    }>(`.bang/assemblies/${clinicAssemblyId}/report.json`);
    expect(assembly.execution.observation).toMatchObject({
      target: "gleam-beam",
      realization: "BookAppointmentOnce",
      entity: "appointment-book-1",
    });
  });

  test("matches all 15 regenerated TinyBank files to both clean-checkout records", async () => {
    expect(tinyBankBaseline.protectedRevision).toBe("f2673c1b74726adcbf6b56a8655d5efee505b1b2");
    expect(tinyBankBaseline.candidateRevision).toBe("8c0d590b08a1432ede1279cf501a46e88efb96d2");
    expect(tinyBankBaseline.files).toHaveLength(15);
    expect(sha256(await readFile(join(root, tinyBankBaseline.dependencyLock.path)))).toBe(
      tinyBankBaseline.dependencyLock.sha256,
    );
    const regenerated = await digestPaths(tinyBankBaseline.files.map(({ path }) => path));
    expect(Object.keys(await digestInventory(tinyBankPublicationRoots))).toEqual(
      tinyBankBaseline.files.map(({ path }) => path).toSorted(),
    );
    expect(
      tinyBankBaseline.files.map(({ path, protectedSha256, candidateSha256 }) => ({
        path,
        protected: protectedSha256,
        candidate: candidateSha256,
        observed: regenerated[path],
      })),
    ).toEqual(
      tinyBankBaseline.files.map(({ path, protectedSha256 }) => ({
        path,
        protected: protectedSha256,
        candidate: protectedSha256,
        observed: protectedSha256,
      })),
    );
  });

  test("rejects a foreign realization before target execution and preserves both domains", async () => {
    const before = await digestInventory(persistentPublicationRoots);
    const result = await runBang([
      "classify",
      "examples/clinic/realizations/foreign-realization.json",
    ]);
    const after = await digestInventory(persistentPublicationRoots);
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("stage: target");
    expect(result.stderr).toContain("reason: missing-declaration");
    expect(result.stderr).toContain("operationRealization:WithdrawAccountOnce");
    expect(after).toEqual(before);
  });

  test("accepts theory applicability but rejects the unsupported two-field target without partial output", async () => {
    const explanation = await runBang([
      "explain",
      "examples/clinic/theories/unsupported-two-state-fields.json",
    ]);
    requireSuccess("unsupported-profile theory applicability", explanation);
    expect(explanation.stdout).toContain("Result: applicable");

    const before = await digestInventory(persistentPublicationRoots);
    const result = await runBang([
      "classify",
      "examples/clinic/realizations/unsupported-two-state-fields.json",
    ]);
    const after = await digestInventory(persistentPublicationRoots);
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("stage: target");
    expect(result.stderr).toContain("reason: unsupported-target");
    expect(result.stderr).toContain("stateMachine:AppointmentBook");
    expect(after).toEqual(before);
  });

  test("rejects realization, entity, and requirement-suffix evidence drift without publication", async () => {
    const original = await readJson<Record<string, unknown>>(clinicEvidencePath);
    const before = await digestInventory(persistentPublicationRoots);

    const wrongRealization = structuredClone(original) as {
      observations: { realization: string };
    };
    wrongRealization.observations.realization = "WithdrawAccountOnce";
    const realizationError = await evidenceFailure(wrongRealization);
    expect(realizationError.reason).toBe("target-mismatch");
    expect(realizationError.identity).toBe("observations");

    const wrongEntity = structuredClone(original) as {
      observations: { entity: string };
    };
    wrongEntity.observations.entity = "account-1";
    const entityError = await evidenceFailure(wrongEntity);
    expect(entityError.reason).toBe("target-mismatch");
    expect(entityError.identity).toBe("observations");

    const wrongRequirement = structuredClone(original) as {
      requirementAddress: string;
    };
    wrongRequirement.requirementAddress =
      "operationRealization:BookAppointmentOnce.requirement:DebitAccount";
    const requirementError = await evidenceFailure(wrongRequirement);
    expect(requirementError.reason).toBe("identity-mismatch");
    expect(requirementError.identity).toBe("requirementAddress");

    expect(await digestInventory(persistentPublicationRoots)).toEqual(before);
  });

  test("lets an external Clinic consumer validate custody and reject byte and schema drift", async () => {
    const repositoryBefore = await digestInventory(persistentPublicationRoots);

    const valid = await makeConsumerSandbox();
    try {
      const result = await runConsumer(valid.directory);
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      const verdict = JSON.parse(result.stdout) as {
        readonly verdict: string;
        readonly verifiedMaterials: ReadonlyArray<{ readonly role: string }>;
      };
      expect(verdict.verdict).toBe("valid");
      expect(verdict.verifiedMaterials.map(({ role }) => role)).toEqual([
        "core-source",
        "generated-effect-boundary",
      ]);
    } finally {
      await rm(valid.directory, { recursive: true, force: true });
    }

    const changedBytes = await makeConsumerSandbox();
    try {
      const coreMaterial = changedBytes.evidence.materials.find(
        ({ role }) => role === "core-source",
      );
      if (coreMaterial === undefined)
        throw new Error("Clinic evidence has no core-source material");
      await writeFile(
        join(changedBytes.directory, "inputs/materials", coreMaterial.path),
        "\n# changed outside custody\n",
        { flag: "a" },
      );
      const result = await runConsumer(changedBytes.directory);
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toBe("");
      expect(JSON.parse(result.stdout)).toMatchObject({
        verdict: "rejected",
        stage: "custody",
        reason: "digest-mismatch",
        path: coreMaterial.path,
      });
    } finally {
      await rm(changedBytes.directory, { recursive: true, force: true });
    }

    const excessEvidence = await makeConsumerSandbox();
    try {
      const evidencePath = join(excessEvidence.directory, "inputs/effect-typescript.evidence.json");
      const encoded = JSON.parse(await readFile(evidencePath, "utf8")) as Record<string, unknown>;
      encoded.unexpected = true;
      await writeFile(evidencePath, `${JSON.stringify(encoded)}\n`);
      const result = await runConsumer(excessEvidence.directory);
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toBe("");
      expect(JSON.parse(result.stdout)).toMatchObject({
        verdict: "rejected",
        stage: "decode",
        reason: "decode-failed",
      });
    } finally {
      await rm(excessEvidence.directory, { recursive: true, force: true });
    }

    expect(await digestInventory(persistentPublicationRoots)).toEqual(repositoryBefore);
  });

  test("rolls back a late Clinic assembly publication failure without changing either closure", async () => {
    const failureId = "clinic-assembly-publication-failure";
    const failureDirectory = join(root, ".bang/assemblies", failureId);
    const selectionPath = join(temporaryRoot, "assembly-publication-failure.json");
    await rm(failureDirectory, { recursive: true, force: true });
    await mkdir(failureDirectory, { recursive: true });
    await writeFile(join(failureDirectory, "src"), "blocks publication directory creation\n");
    await writeFile(
      selectionPath,
      `${JSON.stringify(
        {
          bangAssembly: 1,
          id: failureId,
          planSelection: clinicPlan,
          artifact: { kind: "escript", entry: "main" },
        },
        undefined,
        2,
      )}\n`,
    );

    const before = await digestInventory(persistentPublicationRoots);
    try {
      const result = await runBang([
        "assemble",
        relative(root, selectionPath).replaceAll("\\", "/"),
      ]);
      expect(result.exitCode).not.toBe(0);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("stage: publication");
      expect(result.stderr).toContain("reason: publication-failed");
      expect(await pathExists(join(failureDirectory, "report.json"))).toBe(false);
      expect(await pathExists(join(failureDirectory, "bin/exact_one"))).toBe(false);
      expect(await digestInventory(persistentPublicationRoots)).toEqual(before);
    } finally {
      await rm(failureDirectory, { recursive: true, force: true });
    }
  }, 900_000);

  test("repeats the complete clean Clinic journey byte for byte in a fresh sandbox", async () => {
    const secondRoot = await makeRepositorySandbox();
    try {
      const secondJourney = await runClinicJourney(secondRoot);
      expect(secondJourney.classification.stdout).toBe(firstJourney.classification.stdout);
      expect(secondJourney.planning.stdout).toBe(firstJourney.planning.stdout);
      expect(secondJourney.assembly.stdout).toBe(firstJourney.assembly.stdout);
      expect(artifactObservation(secondJourney.artifact.stdout)).toEqual(
        artifactObservation(firstJourney.artifact.stdout),
      );
      expect(secondJourney.audit.stdout).toBe(firstJourney.audit.stdout);
      expect(secondJourney.schemas.stdout).toBe(firstJourney.schemas.stdout);
      expect(await digestInventory(clinicPublicationRoots, secondRoot)).toEqual(
        firstClinicInventory,
      );
      expect(await digestPaths(legacySchemaPublication, secondRoot)).toEqual(legacySchemaDigests);
    } finally {
      await rm(secondRoot, { recursive: true, force: true });
    }
  }, 1_800_000);
});
