---
id: M014
title: Cohesive system CLI
status: complete
timebox: 2 focused sessions
vision_claims:
  - user-selected-system-input
  - stable-identity-through-cli
  - accumulated-evidence-report
  - typed-terminal-diagnostics
depends_on:
  - M007
  - M012
  - M013
---

# Mission

BANG can load one system selection from a path that the contributor supplies. It can print one accumulated contract report through a shipped command.

The command loads every source and evidence path from the selection. It does not use a second hard-coded source list.

# User claim

> A contributor can run one `bang report <selection>` command and receive one deterministic accumulated report without losing declaration identity, evidence class, scope, weakening, or source diagnostics.

# User journey

```text
selection path from the command line
  -> strict selection decode
  -> source paths from the selection
  -> BANG source parse or Core JSON decode
  -> one checked Core declaration union
  -> evidence paths from the selection
  -> six strict evidence decoders
  -> existing accumulated report compiler
  -> readable report on standard output
```

The selected system file is the source of truth for input paths. The current M012 constants are not part of the command path.

# Command contract

The shipped command is:

```sh
bang report <selection>
```

The command accepts one required selection path. The first mission has no other command options.

A successful command:

- writes the readable accumulated report to standard output;
- writes no report to the repository;
- returns exit status `0`;
- produces identical report bytes for identical input bytes;
- retains the identities from the checked Core and evidence records.

A failed command:

- writes one readable diagnostic to standard error;
- returns a nonzero exit status;
- writes no partial report;
- retains the failure stage and input path when an input boundary fails;
- retains the source span when BANG source parsing fails;
- retains the typed M012 reason when system composition fails.

# Positive fixture

Run:

```sh
bang report examples/tiny-bank/system/account-ledger.json
```

The command must load these paths from the selection:

- the refinement Core path;
- the Account BANG source path;
- the bridge Core path;
- all six evidence paths.

The report must retain seven checked declaration identities and six separate evidence payloads.

# Negative fixtures

## Incoherent selection

A selection that uses `InconsistentLedgerBalance` must fail with:

```text
reason: bridge-law-failed
identity: AccountLedger.balancesAgree
```

The command must return a nonzero status. It must not print a successful report.

## Malformed BANG source

A selection whose state source has a missing closing brace must fail at the source boundary. The diagnostic must include:

- the source path;
- the source line and column;
- the found token or end of input;
- one or more expected syntax labels.

The command must not relabel this failure as a Core semantic failure.

# Input resolution

M014 keeps the M012 selection schema. All selection paths remain repository-relative paths.

The command runs from the BANG repository root. It resolves the selection path and all repository-relative paths inside the selection from that directory.

Project discovery from a subdirectory or from outside the current repository is not part of M014.

# Application boundary

`apps/bang` owns the shipped executable and command composition.

Reusable semantic functions remain in their current packages:

- `@bang/surface` parses BANG source and lowers it to Core;
- `@bang/core` decodes Core JSON and validates the merged document;
- `@bang/evidence` decodes evidence and compiles the accumulated report.

The application can add a domain error for input loading and boundary classification. It must not add a second report compiler or source parser.

# Effect boundary

The application uses the pinned Effect v4 modules.

The command composition root can use `effect/unstable/cli`. This module supplies typed arguments, help output, and command execution.

The unstable CLI import remains inside `apps/bang`. Domain functions do not expose CLI types.

The application uses `FileSystem`, `Path`, and terminal services. It does not use direct Node file-system imports.

# Acceptance path

1. Run the command with the selected Account/Ledger system.
2. Check that the selection supplies every source and evidence path.
3. Check that the report retains seven declaration identities.
4. Check that the report retains six evidence payloads.
5. Run the incoherent selection and observe the typed M012 reason.
6. Run the malformed source selection and observe the source span.
7. Run the positive command twice and compare the output bytes.
8. Run `just verify`.

# Demonstrated evidence

M014 can demonstrate only these claims:

- one user-supplied selection path drives the complete report journey;
- the selection is the only source of input paths in that journey;
- stable declaration and evidence identities survive the command boundary;
- the selected report output is deterministic;
- the two selected failures produce nonzero command outcomes;
- source and composition failures remain distinct.

Observed by `bun run demo:m014` and `bun test tests/cli.test.ts`:

- the command followed a selected missing refinement path and classified that boundary;
- the canonical selection produced the same report bytes twice;
- the report retained seven declaration identities and six evidence sections;
- an incoherent selection exited nonzero with `bridge-law-failed`;
- malformed Account source exited nonzero with path, line, column, found token, and expected syntax;
- failed journeys wrote no successful report.

# Unsupported claims

M014 does not demonstrate:

- general project discovery;
- a complete BANG project format;
- interactive command use;
- watch mode or incremental compilation;
- automatic evidence production;
- shell completion installation;
- a stable public CLI API;
- remote or registry inputs;
- actor, temporal, quantitative, feedback, or adaptive semantics;
- universal target equivalence or Core soundness.

# Non-goals

- no new Core declaration or judgment;
- no new surface syntax;
- no source formatter or LSP;
- no target-kit generation command;
- no plugin system;
- no daemon or TUI;
- no generalized compiler service graph;
- no compatibility command for the fixed-path demo scripts.

# Primary uncertainty

Can one shipped command preserve the selected system identities and evidence qualifications without copying M012 orchestration or hiding input-boundary failures?

# Sources

- `BANG-PROJECT-DIRECTION.md`;
- `CAPABILITIES.md`;
- `decisions/0006-semantic-tower-and-composition-frontier.md`;
- `design-specs/M012-accumulated-system-report.md`;
- `design-specs/M013-account-source-notation.md`;
- `examples/tiny-bank/system/account-ledger.json`;
- `../effect/packages/effect/src/unstable/cli/Command.ts`;
- `../effect/packages/effect/src/unstable/cli/CliOutput.ts`;
- `../effect/packages/effect/src/Terminal.ts`.
