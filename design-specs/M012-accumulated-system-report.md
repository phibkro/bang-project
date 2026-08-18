---
id: M012
title: Accumulated system report
status: complete
timebox: 2 focused sessions
vision_claims:
  - categorical-composition
  - accumulated-system-contract
  - preserved-declaration-identity
  - evidence-without-flattening
depends_on:
  - M005
  - M007
  - M008
  - M009
  - M010
  - M011
---

# Mission

BANG can select one Account/Ledger system and produce one structured report. The report composes checked declarations, obligations, requirements, observations, and target limits without changing their meanings.

One incoherent participant selection fails with a typed reason and the stable `AccountLedger.balancesAgree` identity.

# User journey

```text
three checked Core sources
  -> one validated declaration union
  -> explicit Account/Ledger selection
  -> identity and representation checks
  -> typed evidence loading
  -> obligation and evidence alignment
  -> bridge-model evidence check
  -> one accumulated structured report
```

Run `bun run demo:m012`. Inspect `.bang/evidence/M012.json`.

# Felt capability

A contributor selects the existing Account/Ledger system once. BANG then reports its contract and the evidence that applies to it.

The report retains these separate facts:

- `refinement:Balance` rejects negative values at its target boundaries;
- `Account.withdraw` has a checked nonnegative-balance obligation;
- `WithdrawAccount` requires `DebitAccount` and exposes `WithdrawalRejected`;
- `AccountLedger.balancesAgree` has sampled bridge-model evidence;
- property and runtime observations use different realizations and scopes;
- the saved property observation has a replay input closure;
- `AccountLedger.transferPreservesTotal` is a mission-local bounded relation;
- Z3 found no lawful counterexample in bounds and found one faulty counterexample;
- Rust weakens Core `Integer` to `i128`.

The report must not collapse these facts into one truth grade.

# Selected system

The selected system is `TinyBankAccountLedger`.

Its Core sources are:

- `examples/tiny-bank/core/balance.json` for `Balance`;
- `examples/tiny-bank/account.bang` for `Account`, `DebitAccount`, and `WithdrawAccount`;
- `examples/tiny-bank/core/account-ledger-bridge.json` for `AccountBalance`, `LedgerBalance`, and `AccountLedger`.

BANG parses the Account source, decodes the two Core JSON sources, and validates their combined declaration array as one Core document. Declaration identities must remain unchanged.

The positive participant selection is:

```text
account -> AccountBalance -> AccountBalance
ledger  -> LedgerBalance  -> LedgerBalance
```

The negative selection changes only the final ledger realization to `InconsistentLedgerBalance`.

# Composition links

M012 adds no general system graph and no new normative Core declaration.

The selection records exact, mission-local links:

```text
refinement:Balance
  -- representation-compatible --> stateMachine:Account.state.balance

refinement:Balance
  -- representation-compatible --> theoryBridge:AccountLedger.sharedSort.Balance

operationRealization:WithdrawAccount
  -- realizes --> stateMachine:Account.transition.withdraw

operationRealization:WithdrawAccount
  -- requires --> capability:DebitAccount

theoryBridge:AccountLedger
  -- relates --> theory:AccountBalance
  -- relates --> theory:LedgerBalance
```

`representation-compatible` means that each selected carrier uses Core `Integer`. It does not establish domain identity or semantic equivalence.

# Selected obligations and evidence

The report selects these stable obligations:

- `Account.withdraw.preserves.nonnegativeBalance`;
- `AccountLedger.balancesAgree`;
- `AccountLedger.transferPreservesTotal`.

It loads these existing records through strict Schemas:

- `.bang/evidence/M005.json`: sampled bridge-law observations;
- `.bang/evidence/M007.json`: sampled property observation;
- `.bang/evidence/M008.json`: one closed runtime trace;
- `.bang/evidence/M009.json`: Rust portability observations and weakening;
- `.bang/evidence/M010.json`: replay input closure and embedded property record;
- `.bang/evidence/M011.json`: bounded solver observations.

M012 adds narrow strict Schemas for the legacy M005 and M009 shapes. It does not create a universal evidence payload.

# Composition judgment

Let `S` be the checked declaration union. Let `Q` be the explicit selection. Let `E` be the decoded evidence set.

```text
S checks
Q resolves every selected identity in S
Q links only representation-compatible Integer carriers
E references the selected declarations and obligations
E contains a passing observation for the selected bridge realizations
---------------------------------------------------------------------
BANG |- accumulate(S, Q, E) : M012SystemReport
```

The state obligation is rederived from checked Core. The relational obligation is checked against the selected bridge source.

The bridge law and transfer relation stay distinct. M012 does not infer transfer semantics from `balancesAgree`.

# Typed rejection

The negative selection chooses `InconsistentLedgerBalance`. The existing M005 record reports a sampled counterexample for this exact participant pair.

BANG must reject it as:

```text
reason: bridge-law-failed
identity: AccountLedger.balancesAgree
```

The diagnostic includes the selected realizations and the recorded counterexample. A checked Core union alone is not enough to accept this selection.

# Structured report

The report is strict and versioned. It contains:

- the exact system selection and Core source roles;
- the selected declaration and obligation identities;
- every original typed evidence payload;
- composition-level assumptions, unsupported claims, weakenings, and invalidators.

A formatter derives readable text from this structure. It labels each observation by its original class and scope.

# Vertical acceptance path

1. Decode the three selected Core sources.
2. Validate their declaration union as one checked Core document.
3. Resolve every selected declaration, operation, participant, sort, law, and capability.
4. Check both representation links as Core `Integer` compatibility.
5. Rederive `Account.withdraw.preserves.nonnegativeBalance`.
6. Strictly decode M005, M007, M008, M009, M010, and M011 evidence.
7. Check the property, runtime, and replay records against the rederived state obligation.
8. Check the M011 obligations against the selected bridge source.
9. Match the selected participant realizations to the M005 bridge observation.
10. Emit and reload one strict `.bang/evidence/M012.json` report.
11. Format one readable accumulated report without a combined truth grade.
12. Change only the ledger realization to `InconsistentLedgerBalance`.
13. Reject it with `bridge-law-failed` and `AccountLedger.balancesAgree`.
14. Run the positive journey twice and get byte-identical report bytes.

# Acceptance evidence

- one clean `demo:m012` command exercises the complete path;
- the checked declaration union contains seven stable declarations;
- every selected identity resolves before report construction;
- the report preserves all six evidence payloads;
- property and runtime records retain different provenance and scope;
- M010 retains its four-file digest closure;
- M009 retains the arbitrary-precision to `i128` weakening;
- M011 retains bounds, formulas, provider status, model, timeouts, and trust limits;
- the lawful bridge selection is accepted from its exact sampled observation;
- the inconsistent bridge selection is rejected from its exact sampled counterexample;
- strict decoding rejects excess fields in M005, M009, the selection, and the M012 report;
- `bun run demo:m012` is included in `preview`;
- `just verify` passes.

# Primary uncertainty

Can BANG compose existing semantic and evidence layers without inventing a universal graph or flattening distinct judgments?

# Non-goals

- a general category, graph, workflow, actor, or process calculus;
- a new normative Core system declaration;
- inference of domain identity from equal carrier representations;
- transfer semantics in normative Core;
- migration of all historical evidence to one envelope;
- one scalar confidence, truth, or maturity grade;
- rerunning M005, M007, M008, M009, M010, or M011 producers;
- proof, proof certificates, or universal cross-target equivalence;
- temporal, concurrency, lifetime, resource, cybernetic, or adaptive semantics;
- a new package, provider registry, plugin framework, or CLI application.

# Explicit limitations

- source paths identify selected inputs but do not byte-bind them, except where M010 records digests;
- the bridge-law acceptance is sampled evidence, not universal proof;
- the runtime trace is one violating execution through a different realization;
- the M011 relation is bounded, mission-local, and solver-reported;
- equal `Integer` representations do not prove that three Balance concepts are identical;
- M012 reports existing target behavior and does not establish semantic equivalence;
- producer truthfulness remains assumed where each source record says so.
