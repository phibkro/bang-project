import { mkdtemp, rm } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const canonicalSelectionPath = "examples/tiny-bank/system/account-ledger.json";
const canonicalSourcePath = "examples/tiny-bank/account.bang";

interface ParticipantModel {
  participant: string;
  theory: string;
  realization: string;
}

interface SelectionFixture {
  sources: {
    refinement: { path: string };
    state: { path: string };
    bridge: { path: string };
  };
  selection: {
    participantModels: Array<ParticipantModel>;
  };
}

interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

const assert: (condition: boolean, message: string) => asserts condition = (condition, message) => {
  if (!condition) throw new Error(message);
};

const runCli = async (selectionPath: string): Promise<CliResult> => {
  const child = Bun.spawn([join(root, "node_modules/.bin/bang"), "report", selectionPath], {
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

const readSelection = async (): Promise<{ text: string; value: SelectionFixture }> => {
  const text = await Bun.file(resolve(root, canonicalSelectionPath)).text();
  return { text, value: JSON.parse(text) as SelectionFixture };
};

const main = async (): Promise<void> => {
  const temporaryRoot = await mkdtemp(join(root, ".m014-cli-demo-"));
  try {
    const canonical = await readSelection();

    const selectedMissing = JSON.parse(canonical.text) as SelectionFixture;
    selectedMissing.sources.refinement.path =
      "examples/tiny-bank/core/not-selected-by-default.json";
    const selectedMissingPath = join(temporaryRoot, "selected-missing-source.json");
    await Bun.write(selectedMissingPath, `${JSON.stringify(selectedMissing, null, 2)}\n`);
    const selectedMissingResult = await runCli(relative(root, selectedMissingPath));
    assert(selectedMissingResult.exitCode !== 0, "selected missing source unexpectedly succeeded");
    assert(selectedMissingResult.stdout === "", "selected missing source printed a report");
    assert(
      selectedMissingResult.stderr.includes("stage: refinement-source") &&
        selectedMissingResult.stderr.includes("not-selected-by-default.json"),
      "CLI did not load the refinement path from the selection",
    );
    console.log("PASS selection-authoritative loading");

    const first = await runCli(canonicalSelectionPath);
    const second = await runCli(canonicalSelectionPath);
    assert(first.exitCode === 0 && second.exitCode === 0, "positive CLI command failed");
    assert(first.stderr === "" && second.stderr === "", "positive CLI wrote a diagnostic");
    assert(first.stdout.endsWith("\n"), "positive CLI output has no final newline");
    assert(first.stdout.includes("M012 accumulated system report"), "report heading is missing");
    for (const identity of [
      "refinement:Balance",
      "stateMachine:Account",
      "capability:DebitAccount",
      "operationRealization:WithdrawAccount",
      "theory:AccountBalance",
      "theory:LedgerBalance",
      "theoryBridge:AccountLedger",
    ]) {
      assert(first.stdout.includes(identity), `missing declaration identity ${identity}`);
    }
    const declarationLine = first.stdout
      .split("\n")
      .find((line) => line.startsWith("Declarations: "));
    assert(
      declarationLine !== undefined &&
        declarationLine.slice("Declarations: ".length).split(", ").length === 7,
      "canonical report declaration count differs from seven",
    );
    for (const evidence of [
      "Bridge evidence:",
      "Property evidence:",
      "Runtime evidence:",
      "Portability evidence:",
      "Replay evidence:",
      "Solver evidence:",
    ]) {
      assert(first.stdout.includes(evidence), `missing evidence payload ${evidence}`);
    }
    assert(
      Buffer.from(first.stdout).equals(Buffer.from(second.stdout)),
      "positive CLI output bytes differ",
    );
    console.log("PASS identity/evidence retention");
    console.log("PASS deterministic output");

    const incoherent = JSON.parse(canonical.text) as SelectionFixture;
    incoherent.selection.participantModels = incoherent.selection.participantModels.map((model) =>
      model.participant === "ledger"
        ? { ...model, realization: "InconsistentLedgerBalance" }
        : model,
    );
    const incoherentSelection = join(temporaryRoot, "incoherent-selection.json");
    await Bun.write(incoherentSelection, `${JSON.stringify(incoherent, null, 2)}\n`);
    const incoherentResult = await runCli(relative(root, incoherentSelection));
    assert(incoherentResult.exitCode !== 0, "incoherent selection unexpectedly succeeded");
    assert(
      incoherentResult.stdout === "" &&
        !incoherentResult.stdout.includes("M012 accumulated system report"),
      "incoherent selection printed a successful report",
    );
    assert(
      incoherentResult.stderr.includes("bridge-law-failed"),
      "bridge failure reason is missing",
    );
    assert(
      incoherentResult.stderr.includes("AccountLedger.balancesAgree"),
      "bridge failure identity is missing",
    );
    console.log("PASS incoherent selection rejected");

    const malformedSource = join(temporaryRoot, "account-missing-brace.bang");
    const source = await Bun.file(resolve(root, canonicalSourcePath)).text();
    await Bun.write(malformedSource, source.slice(0, source.lastIndexOf("}")));
    const malformed = JSON.parse(canonical.text) as SelectionFixture;
    malformed.sources.state.path = relative(root, malformedSource);
    const malformedSelection = join(temporaryRoot, "malformed-selection.json");
    await Bun.write(malformedSelection, `${JSON.stringify(malformed, null, 2)}\n`);
    const malformedResult = await runCli(relative(root, malformedSelection));
    assert(malformedResult.exitCode !== 0, "malformed source unexpectedly succeeded");
    assert(
      malformedResult.stdout === "" &&
        !malformedResult.stdout.includes("M012 accumulated system report"),
      "malformed source printed a successful report",
    );
    assert(
      malformedResult.stderr.includes(relative(root, malformedSource)),
      "source path is missing from the parse diagnostic",
    );
    assert(
      /line\s*:\s*\d+/i.test(malformedResult.stderr) &&
        /column\s*:\s*1/i.test(malformedResult.stderr),
      "source line and column are missing from the parse diagnostic",
    );
    assert(
      /found(?:\s+token)?\s*:?\s*end of input/i.test(malformedResult.stderr),
      "found token is missing from the parse diagnostic",
    );
    assert(
      /expected(?:\s+syntax)?\s*:?[^\n]*\}/i.test(malformedResult.stderr),
      "expected syntax labels are missing from the parse diagnostic",
    );
    console.log("PASS malformed source rejected");
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
};

await main();
