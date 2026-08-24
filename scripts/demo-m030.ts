import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const executable = join(root, "node_modules/.bin/bang");
const tinyBankSelection = "examples/tiny-bank/theories/packaged-exact-one.json";
const inventorySelection = "examples/inventory/theories/packaged-exact-one.json";
const unboundedSelection = "examples/inventory/theories/packaged-unbounded.json";
const inventoryArtifact = join(root, ".bang/artifacts/inventory-packaged-exact-one.json");
const inventoryLock = join(root, ".bang/theory-locks/inventory-packaged-exact-one.json");

interface CliResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

const runExplain = async (selection: string): Promise<CliResult> => {
  const child = Bun.spawn([executable, "explain", selection], {
    cwd: root,
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

const obligationIds = (report: string): ReadonlyArray<string> =>
  [...report.matchAll(/^Obligation: (.+)$/gm)].map((match) => match[1]!).toSorted();

const tinyBank = await runExplain(tinyBankSelection);
const first = await runExplain(inventorySelection);
if (
  tinyBank.exitCode !== 0 ||
  tinyBank.stderr !== "" ||
  first.exitCode !== 0 ||
  first.stderr !== ""
) {
  throw new Error(`M030 packaged domain journey failed\n${tinyBank.stderr}${first.stderr}`);
}
const firstArtifact = await Bun.file(inventoryArtifact).bytes();
const firstLock = await Bun.file(inventoryLock).bytes();
const second = await runExplain(inventorySelection);
const secondArtifact = await Bun.file(inventoryArtifact).bytes();
const secondLock = await Bun.file(inventoryLock).bytes();
if (
  second.exitCode !== 0 ||
  second.stderr !== "" ||
  first.stdout !== second.stdout ||
  !firstArtifact.every((byte, index) => byte === secondArtifact[index]) ||
  !firstLock.every((byte, index) => byte === secondLock[index])
) {
  throw new Error("M030 report, semantic artifact, or theory lock was not deterministic");
}
if (
  !first.stdout.includes("Theory package: ExactOneCapabilityExecution@1") ||
  !first.stdout.includes("Resolution: locked") ||
  JSON.stringify(obligationIds(tinyBank.stdout)) !== JSON.stringify(obligationIds(first.stdout))
) {
  throw new Error("M030 domains did not consume the same locked package meaning");
}

const unbounded = await runExplain(unboundedSelection);
if (
  unbounded.exitCode !== 0 ||
  unbounded.stderr !== "" ||
  !unbounded.stdout.includes("Result: not-applicable") ||
  !unbounded.stdout.includes("Obligations: none")
) {
  throw new Error("M030 packaged unbounded journey received incorrect conclusions");
}

await Promise.all(
  (
    [
      ["package-digest-mismatch", "digest-mismatch"],
      ["package-version-mismatch", "version-mismatch"],
      ["package-missing", "package-not-found"],
      ["package-unsupported-evaluator", "unsupported-evaluator"],
      ["package-evaluator-disagreement", "evaluator-disagreement"],
    ] as const
  ).map(async ([id, reason]) => {
    const result = await runExplain(`examples/inventory/theories/${id}.json`);
    if (
      result.exitCode === 0 ||
      result.stdout !== "" ||
      !/stage:\s*package/i.test(result.stderr) ||
      !result.stderr.includes(`reason: ${reason}`)
    ) {
      throw new Error(`M030 ${reason} journey did not fail atomically`);
    }
  }),
);

process.stdout.write(
  [
    "M030 local versioned theory package consumption",
    "Domains: TinyBank and Inventory",
    "Theory package: ExactOneCapabilityExecution@1",
    "Resolution: local identity + version + semantic digest -> deterministic lock",
    `Obligations: ${obligationIds(first.stdout).length} shared derived identities`,
    "Inventory unbounded: not-applicable; zero obligations",
    "Negative journeys: digest, version, missing package, evaluator support, evaluator agreement",
    "Evidence: runtime-checked package resolution, artifact crossing, and evaluator agreement",
  ].join("\n") + "\n",
);
