import { Schema } from "effect";

const Diagnostic = Schema.Struct({
  name: Schema.String,
  severity: Schema.String,
});

const DiagnosticReport = Schema.Struct({
  diagnostics: Schema.Array(Diagnostic),
  summary: Schema.Struct({
    filesChecked: Schema.Finite,
    errors: Schema.Finite,
    warnings: Schema.Finite,
    messages: Schema.Finite,
  }),
});

const DiagnosticReportFromJson = Schema.fromJsonString(DiagnosticReport);

const runDiagnostics = (project: string) => {
  const process = Bun.spawnSync(
    ["bun", "x", "effect-tsgo", "diagnostics", "--project", project, "--format", "json"],
    {
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const stdout = new TextDecoder().decode(process.stdout);
  const stderr = new TextDecoder().decode(process.stderr);
  const report = Schema.decodeSync(DiagnosticReportFromJson)(stdout);
  return { exitCode: process.exitCode, report, stderr } as const;
};

const clean = runDiagnostics("tsconfig.json");
if (clean.exitCode !== 0 || clean.report.summary.errors !== 0) {
  throw new Error(`Effect language service rejected the root project\n${clean.stderr}`);
}

const counterexample = runDiagnostics("fixtures/effect-lsp-invalid/tsconfig.json");
const floatingEffect = counterexample.report.diagnostics.find(
  ({ name }) => name === "floatingEffect",
);
if (counterexample.exitCode === 0 || floatingEffect?.severity !== "error") {
  throw new Error("Effect language service accepted the floating Effect counterexample");
}

console.log(`PASS Effect LSP root diagnostics (${clean.report.summary.filesChecked} files)`);
console.log("PASS Effect LSP floatingEffect counterexample");
