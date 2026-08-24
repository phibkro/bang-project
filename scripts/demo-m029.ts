import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const executable = join(root, "node_modules/.bin/bang");
const tinyBankSelection = "examples/tiny-bank/theories/exact-one-capability.json";
const applicableSelection = "examples/inventory/theories/exact-one-reservation.json";
const unboundedSelection = "examples/inventory/theories/unbounded-reservation.json";
const unknownSelection = "examples/inventory/theories/unknown-reservation.json";
const applicableArtifact = join(root, ".bang/artifacts/inventory-exact-one-reservation.json");

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
if (tinyBank.exitCode !== 0 || tinyBank.stderr !== "") {
  throw new Error(`M029 TinyBank baseline failed\n${tinyBank.stderr}`);
}

const first = await runExplain(applicableSelection);
if (first.exitCode !== 0 || first.stderr !== "") {
  throw new Error(`M029 applicable journey failed\n${first.stderr}`);
}
const firstArtifact = await Bun.file(applicableArtifact).bytes();
const second = await runExplain(applicableSelection);
if (second.exitCode !== 0 || second.stderr !== "") {
  throw new Error(`M029 repeated applicable journey failed\n${second.stderr}`);
}
const secondArtifact = await Bun.file(applicableArtifact).bytes();
if (
  first.stdout !== second.stdout ||
  firstArtifact.length !== secondArtifact.length ||
  !firstArtifact.every((byte, index) => byte === secondArtifact[index])
) {
  throw new Error("M029 applicable report or artifact was not deterministic");
}
if (first.stdout.match(/^Premise:/gm)?.length !== 4) {
  throw new Error("M029 applicable journey did not report four premises");
}
if (first.stdout.match(/^Status: satisfied$/gm)?.length !== 4) {
  throw new Error("M029 applicable journey did not satisfy all four premises");
}
if (first.stdout.match(/^Obligation:/gm)?.length !== 4) {
  throw new Error("M029 applicable journey did not report four obligations");
}
if (!first.stdout.includes("Material provenance: examples/inventory/inventory.bang")) {
  throw new Error("M029 applicable journey omitted Inventory provenance");
}
if (
  JSON.stringify(obligationIds(tinyBank.stdout)) !== JSON.stringify(obligationIds(first.stdout))
) {
  throw new Error("M029 domains did not receive the same obligation identities");
}

const unbounded = await runExplain(unboundedSelection);
if (unbounded.exitCode !== 0 || unbounded.stderr !== "") {
  throw new Error(`M029 unbounded journey failed\n${unbounded.stderr}`);
}
if (
  !unbounded.stdout.includes("Result: not-applicable") ||
  !unbounded.stdout.includes("Status: failed") ||
  !unbounded.stdout.includes("Obligations: none") ||
  /^Obligation:/m.test(unbounded.stdout)
) {
  throw new Error("M029 unbounded journey received incorrect theory conclusions");
}

const unknown = await runExplain(unknownSelection);
if (
  unknown.exitCode === 0 ||
  unknown.stdout !== "" ||
  !/stage:\s*theory/i.test(unknown.stderr) ||
  !unknown.stderr.includes("MissingReservation")
) {
  throw new Error("M029 unknown-address journey did not fail atomically");
}

process.stdout.write(
  [
    "M029 second-domain reusable theory portability",
    "Domains: TinyBank and Inventory",
    "Theory: ExactOneCapabilityExecution version 1",
    "Inventory exact-one: applicable; 4/4 premises; 4 obligations",
    "Inventory unbounded: not-applicable; 1 failed premise; 0 obligations",
    "Unknown Inventory address: typed rejection; no partial report",
    "Deterministic report and semantic artifact: match",
    "Evidence: runtime-checked encoded artifact crossing and theory evaluation",
  ].join("\n") + "\n",
);
