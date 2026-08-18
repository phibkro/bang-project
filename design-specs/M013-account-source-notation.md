---
id: M013
title: Account source notation
status: complete
timebox: 2 focused sessions
vision_claims:
  - minimal-surface-language
  - single-source-semantics
  - deterministic-lowering
  - preserved-core-authority
depends_on:
  - M004
  - M006
  - M007
  - M008
  - M010
  - M012
---

# Mission

BANG can parse one human-readable Account source file and lower it to the existing Core document. The source declares the `Account` state machine, `DebitAccount` capability, and `WithdrawAccount` realization once.

The lowered declarations retain their existing identities and order. Existing Core validation, target projections, observations, replay, and accumulated reporting consume the lowered Core without a copied Account declaration.

# User journey

```text
one Account source file
  -> source tokens with spans
  -> generalized Pratt rule table
  -> spanned surface tree
  -> deterministic Core lowering
  -> existing Core validation
  -> existing M004/M006/M007/M008/M010/M012 journeys
```

Run `bun run demo:m013`. Inspect the readable source, the checked declaration identities, the syntax rejection, the Core semantic rejection, and the deterministic lowering result.

# Felt capability

A contributor writes this Account behavior once in BANG source:

```bang
machine Account {
  state AccountState {
    balance: Integer
  }

  initializer initialize(initialBalance: Integer) {
    requires initialBalance >= 0
  }

  transition withdraw(amount: Integer) {
    requires amount >= 0
    requires balance >= amount
  }

  invariant nonnegativeBalance {
    balance >= 0
  }
}

capability DebitAccount

realization WithdrawAccount {
  operation Account.withdraw
  requires DebitAccount
  disabled WithdrawalRejected
}
```

This file replaces both of these handwritten Core fixtures:

- `examples/tiny-bank/core/account-state-machine.json`;
- `examples/tiny-bank/core/account-withdrawal-realization.json`.

The old fixtures contain the same `Account` declaration. That copied semantic definition is removed rather than retained as a compatibility path.

# Frozen syntax

M013 supports only the syntax used by the selected source.

```text
source          := declaration* end

declaration     := machine-declaration
                 | capability-declaration
                 | realization-declaration

machine-declaration
                := "machine" identifier "{"
                     machine-member*
                     state-declaration
                     machine-member*
                   "}"

machine-member  := initializer-declaration
                 | transition-declaration
                 | invariant-declaration

state-declaration
                := "state" identifier "{" field* "}"
field           := identifier ":" identifier

initializer-declaration
                := "initializer" identifier parameters "{" requirement* "}"
transition-declaration
                := "transition" identifier parameters "{" requirement* "}"
parameters      := "(" (parameter ("," parameter)*)? ")"
parameter       := identifier ":" identifier
requirement     := "requires" predicate
invariant-declaration
                := "invariant" identifier "{" predicate "}"

capability-declaration
                := "capability" identifier

realization-declaration
                := "realization" identifier "{"
                     "operation" qualified-identifier
                     "requires" identifier+
                     "disabled" identifier
                   "}"

qualified-identifier
                := identifier "." identifier
predicate       := value ">=" value
value           := identifier | decimal-integer
decimal-integer := "0" | nonzero-digit digit*
nonzero-digit   := "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9"
digit           := "0" | nonzero-digit
```

Whitespace separates adjacent word tokens and is otherwise insignificant. M013 supports line comments beginning with `//`. It does not support user-defined operators.

The grammar is frozen for this mission. Later missions can extend it only with their own observable claim and fixtures.

# Parser architecture

M013 uses the generalized Pratt architecture from Cheng and Parreaux, _A Simple Recipe for Writing Decent Recursive Descent Parsers_, ECOOP 2026, DOI `10.4230/LIPIcs.ECOOP.2026.30`.

The parser reifies syntax as data:

- syntax kinds name recursive categories;
- rules contain ordered choices;
- token choices consume fixed tokens;
- reference choices parse another syntax kind;
- end choices complete a rule;
- the predicate operator table records left and right binding powers.

One rule interpreter parses declarations and nested members. One Pratt continuation loop parses predicate operators. The M013 table contains only `>=`.

The rule table is the parser's single source of truth. M013 does not add a generated grammar reference, formatter, or tree-sitter grammar. Those remain possible derivations if later missions need them.

The implementation adapts the architecture already used by sibling project `../lang-bang` in `Bang/Frontend/Surface.lean` and documented by `docs/decisions/0071-rule-table-pratt-parser.md`. It does not copy Lean source.

# Source boundary

Every token and surface node carries this half-open source span:

```text
start.offset <= end.offset
[start.offset, end.offset)
```

Each endpoint also records one-based `line` and `column` values. The original source text is not copied into every node.

The parser is a total, dependency-free function. It returns `Result<SurfaceDocument, SourceParseError>`. `SourceParseError` is a typed, Schema-backed failure with:

- a stable reason;
- one source span;
- the observed token or end of input;
- one or more expected syntax labels;
- a readable message.

I/O remains outside the parser. An Effect wrapper composes file loading, parsing, lowering, and existing Core validation.

Effect v4 has no general parser or scanner API with source spans. The project-owned parser therefore adds domain behavior rather than duplicating an existing Effect facility.

# Surface and Core authority

The surface tree records syntax and spans. It does not define Core meaning.

Lowering performs only these named transformations:

- declaration syntax to the corresponding existing Core declaration shape;
- identifier operands matching operation parameters to Core `parameter` values;
- all other identifier operands to Core `stateField` values;
- decimal tokens to Core decimal-integer strings;
- `>=` to the existing Core `greaterThanOrEqual` predicate;
- `operation Account.withdraw` to the existing operation reference;
- `disabled WithdrawalRejected` to the existing failure reference.

Lowering preserves source declaration order:

```text
stateMachine:Account
capability:DebitAccount
operationRealization:WithdrawAccount
```

It strips spans and emits an ordinary `CoreDocument`. It does not emit a privileged checked value.

Existing `validateCore` remains the semantic authority for:

- identifiers and duplicate identities;
- types;
- operation and state-field references;
- initializer pre-state restrictions;
- capabilities;
- operation realizations and failure identity;
- invariant obligations.

A successful parse does not imply a valid Core program.

# Typed negative journeys

M013 includes two distinct failures.

## Syntax failure

A source with a missing closing brace fails before lowering. The rejection is `SourceParseError`, includes the exact end-of-input span, and expects `}`.

## Semantic failure

A well-formed source changes the transition requirement from `balance >= amount` to `missing >= amount`.

Parsing and lowering succeed. Existing Core validation rejects the result because `missing` is not a state field. The failure remains `SemanticError`, not `SourceParseError`.

These failures demonstrate that the source parser recognizes syntax while Core owns semantic validity.

# Clean cutover

All live consumers of the two copied JSON fixtures move to one canonical path:

```text
examples/tiny-bank/account.bang
```

This includes:

- M004 state-machine projection and evidence;
- M006 capability projection and evidence;
- M007 property evidence;
- M008 runtime observation;
- M010 replay input closure and provenance;
- M012 source selection, embedded evidence alignment, and accumulated report;
- Core, evidence, and target tests.

M010 records the canonical source once as its Core input. Its old separate `obligation-core` and `generated-kit-core` entries become one `account-source` entry because the same source drives both derivations. Generated kit, realization, and evaluator inputs remain separate.

M012 continues to compile seven checked declarations. Its state source path and every aligned evidence provenance path become the canonical source path. Surface spans do not enter Core or evidence records.

Generated Effect output remains byte-identical if lowering preserves the existing Core shape. M010 and M012 evidence bytes change because their material source path and digest change; they must be regenerated, reloaded, and rechecked.

The two obsolete JSON fixtures are removed after every consumer has migrated. No alias, generated compatibility copy, or fallback decoder remains.

# Vertical acceptance path

1. Read `examples/tiny-bank/account.bang` through Effect `FileSystem`.
2. Tokenize it with offsets and one-based line and column endpoints.
3. Parse it through the M013 generalized Pratt rule table.
4. Lower the spanned surface tree to one ordinary `CoreDocument`.
5. Validate that document through existing `validateCore`.
6. Confirm exact declaration order and stable identities.
7. Confirm exact derived state-invariant obligations.
8. Project the existing M004, M006, and M008 Effect kits from the checked document.
9. Confirm those generated bytes remain unchanged.
10. Run the M007 property observation against the same checked source.
11. Record one four-file M010 replay closure with one canonical `account-source` input.
12. Reload, verify, and replay the M010 record.
13. Compile the M012 report from the same canonical source and six aligned evidence payloads.
14. Reload the strict M012 report and retain its seven checked declaration identities.
15. Reject the missing-brace source with an exact spanned `SourceParseError`.
16. Reject the unknown-state-field source through existing `SemanticError`.
17. Parse and lower the positive source twice and produce byte-identical canonical Core JSON.
18. Remove both obsolete Account Core JSON fixtures and verify no live consumer names them.

# Acceptance evidence

- `bun run demo:m013` exercises the source parse, lowering, syntax failure, semantic failure, and deterministic Core result;
- existing M004, M006, M007, M008, M010, and M012 preview journeys consume the canonical source;
- the generated M004, M006, and M008 target snapshots remain unchanged;
- M010 reports one four-file closure and replays the recorded observation;
- M012 retains seven declarations and six separate evidence payloads;
- focused source tests cover token spans, rule parsing, lowering, syntax rejection, and semantic separation;
- `just verify` passes from the live repository state.

# Evidence classification

## Demonstrated

- the selected Account syntax parses with stable source spans;
- the selected source lowers deterministically to the existing three Core declarations;
- existing Core validation accepts the lowered positive source;
- the selected syntax and semantic failures remain distinct;
- the six existing downstream journeys consume one canonical Account source;
- the copied Account declaration is absent from live source fixtures;
- generated Effect projections remain byte-identical for this selected source.

## Assumed

- the selected concrete syntax will remain readable as BANG grows;
- the generalized Pratt rule representation will scale to future BANG constructs;
- downstream evidence producers report their observations truthfully.

## Unsupported

- a complete BANG surface language;
- parser correctness for syntax outside the frozen M013 grammar;
- general grammar ambiguity detection;
- formal equivalence between surface parsing and Core semantics;
- parser error recovery or multiple diagnostics;
- formatter or parser-printer round-trip laws;
- incremental parsing, tree-sitter, or LSP support;
- actor, temporal, quantitative, feedback, or adaptive semantics;
- universal target equivalence or proof of Core soundness.

# Non-goals

- no new normative Core declaration or judgment;
- no syntax for refinements, services, data, theories, bridges, finite models, or system selections;
- no modules, imports, registries, macros, traits, or user-defined operators;
- no CLI application;
- no parser generator dependency;
- no formatter, exact printer, generated syntax reference, tree-sitter grammar, or LSP;
- no generalized compiler Service graph;
- no compatibility JSON copies;
- no claim that parsing proves semantic validity.

# Primary uncertainty

Can one reified generalized Pratt rule table express the selected Account source, retain useful spans, and lower deterministically into existing Core without becoming a second semantic authority?

# Sources and prior art

- `BANG-PROJECT-DIRECTION.md`;
- `decisions/0006-semantic-tower-and-composition-frontier.md`;
- `docs/repository-map.md`;
- `packages/core/src/index.ts`;
- `examples/tiny-bank/account.bang` and the deleted duplicate Account Core fixtures compared during migration;
- Cheng and Parreaux, _A Simple Recipe for Writing Decent Recursive Descent Parsers_, ECOOP 2026, DOI `10.4230/LIPIcs.ECOOP.2026.30`, CC BY 4.0;
- `../lang-bang/docs/decisions/0071-rule-table-pratt-parser.md`;
- `../lang-bang/Bang/Frontend/Surface.lean`.
