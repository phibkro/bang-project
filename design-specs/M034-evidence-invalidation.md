---
id: M034
title: Continuous evidence invalidation
status: complete
timebox: 2 focused sessions
vision_claims:
  - continuous-evidence-invalidation
  - recorded-material-diff
  - transitive-dependent-retirement
  - scoped-requalification
  - audit-clean-run-parity
depends_on:
  - M021
  - M028
  - M030
  - M031
  - M032
  - M033
---

# Mission

BANG audits one published assembly closure against its recorded materials.

The audit diffs recorded digests with current bytes, retires every evidence record whose recorded closure changed, and requalifies only the retired records. Valid evidence keeps its bytes and its verdict.

# User claim

> I change one material — theory package bytes, target adapter output, toolchain pin, entry module, or dependency lock — and one command tells me exactly which published evidence is invalidated and why. It then requalifies only the affected closure and leaves unrelated evidence untouched.

# Primary uncertainty

Can recorded digests plus construct-addressed comparison invalidate exactly the dependent evidence — no more and no less — across one assembled closure without a watcher, cache, or build scheduler?

# Stable boundary

M034 audits one published M033 assembly closure:

- the assembly record and its staged execution observation;
- the M032 plan report and its candidate evaluations;
- the M031 per-target evidence records;
- the M030 theory lock and semantic artifact;
- every material these records name by path and SHA-256 digest.

M034 reuses:

- M021 construct addresses, semantic fingerprints, typed dependency closure, and clean-run parity;
- M028 dependency-scoped reuse and invalidation discipline over qualified evidence;
- M030 package identity, semantic digest, evaluator agreement, and deterministic lock;
- M031 target-owned evidence records with materials, lifetime, and invalidators;
- M032 staged planning without publication;
- M033 staged assembly, material roles, and atomic publication.

M034 adds no Core construct, surface form, theory, obligation, target, provider, or planning demand. It changes no M021, M028, M030, M031, M032, or M033 output for unchanged inputs.

The first audited closure is `tiny-bank-supervised-exact-one`.

# Canonical command

The canonical command is:

```sh
bang audit tiny-bank-supervised-exact-one
```

The argument is one published assembly identity. The command resolves:

```text
.bang/assemblies/<assembly-id>/report.json
```

An unsafe identity or a missing report fails with a typed `selection` failure.

Audit is a new verb, not an `assemble` extension:

- invalidation is a standing question over published evidence, not a production request;
- an `assemble` extension would rebuild and re-export on every freshness question and could not answer "all valid, nothing re-run";
- the CLI grows one verb per user journey; `audit` continues that pattern.

# User journey

The command performs these operations:

1. loads the published assembly record for the requested identity;
2. inventories every recorded material from the assembly record, plan report, target evidence records, semantic artifact, and theory lock; it never scans for unrecorded dependencies;
3. recomputes the SHA-256 digest of every recorded material; a missing or unreadable material fails before any verdict;
4. re-decodes and re-checks changed Core sources and the theory package, and compares normalized constructs by stable address against the embedded normalized baseline;
5. classifies each material as `unchanged`, `cosmetic`, or `changed`;
6. retires every evidence record whose recorded closure intersects the changed set, and closes retirement transitively over recorded evidence references;
7. requalifies only the retired records through the staged M030 agreement, M031 probes, M032 planning, and M033 assembly journeys;
8. checks audit parity between the resulting closure and a clean rebuild over the same current inputs;
9. republishes the complete closure in one transaction: requalified records replace retired records, valid payloads keep their bytes, refreshed records update only recorded digests;
10. prints one deterministic report: per-material status, per-record verdict with the invalidating material or edge, the requalification summary, and `Audit parity: match`.

# Material classes

Each recorded material has one equality rule:

| Recorded material                                 | Class   | Equality rule                                        |
| ------------------------------------------------- | ------- | ---------------------------------------------------- |
| checked Core sources                              | decoded | M021 construct comparison over the embedded baseline |
| theory package JSON                               | decoded | M030 canonical semantic digest                       |
| generated Gleam boundary                          | opaque  | byte SHA-256                                         |
| entry module                                      | opaque  | byte SHA-256                                         |
| `gleam.toml` and `manifest.toml`                  | opaque  | byte SHA-256                                         |
| canonical escript repackager                      | opaque  | byte SHA-256                                         |
| pinned Nix toolchain definition                   | opaque  | byte SHA-256                                         |
| semantic artifact, theory lock, published reports | derived | recomputation by the owning producer                 |

Rules:

- A decoded material with different bytes but equal semantics is `cosmetic`. A cosmetic change refreshes recorded digests and retires nothing.
- An opaque material has no cosmetic class. Any byte change is a change. Custody for qualified and assembled bytes is byte-exact.
- Opaque does not mean immutable. It means only its owning producer may replace its bytes.
- A derived member that differs from recomputation over valid inputs is drift. Drift retires the producing record.
- The audit reads dependency edges only from recorded references. It invents no edges from filesystem layout.

# Invalidation model

The audit builds one material graph from the published records alone:

- vertices are recorded materials and evidence records;
- edges are the references each record already carries in its materials, evidence references, and parent links.

A record is retired when one of these holds:

1. an opaque material it records has different bytes;
2. a decoded material it cites changed semantics — the package semantic digest changed, or the M021 reverse closure of a changed construct reaches an address the record cites;
3. a derived member it owns drifted from recomputation;
4. another record it references is retired.

Retirement closes transitively. The report names, for every retired record, the changed material and the recorded edge that carried the invalidation.

Retirement is not deletion and not punishment. It is custody: the record may no longer speak for current materials.

# Requalification

Requalification reruns only retired producers, in dependency order:

1. packaged explanation and evaluator agreement (M030);
2. affected target projections and fresh probes (M031);
3. staged planning (M032);
4. staged assembly and staged observation (M033).

Rules:

- Requalification consumes only valid or freshly produced records. It never reuses a retired payload.
- Only affected targets re-probe. Effect evidence never supports Gleam, and Gleam evidence never supports Effect.
- Requalification preserves each record's evidence classes, producers, scopes, assumptions, weakenings, lifetime, and invalidators. A retired `runtime-checked` record returns as `runtime-checked` or the command fails.
- A requalification failure — a disagreed package, failed projection, failed export, failed execution, or contradicted observation — is a typed command failure. It names the retired records and the invalidating chain. Publication aborts and every prior byte remains. The stale records stay published until the materials are repaired, and every later audit run recomputes the same retirement set.

# Audit parity

Identical inputs give identical verdicts:

1. verdict determinism: the same current bytes against the same recorded closure produce the same verdict table and the same report text;
2. idempotence: an audit that follows itself with no intervening change writes no bytes, reports zero requalifications, and prints the same report;
3. closure equivalence: the published post-audit closure equals a clean M032-plus-M033 rebuild over the same inputs, byte for byte.

Any divergence is a typed `parity` failure, the same failure the exported verifier raises internally.

# Typed failures

M034 reports these stages and reasons:

| Stage             | Reason                 |
| ----------------- | ---------------------- |
| `selection`       | `unsafe-identity`      |
| `selection`       | `unknown-assembly`     |
| `inventory`       | `record-unreadable`    |
| `inventory`       | `material-missing`     |
| `inventory`       | `material-unreadable`  |
| `diff`            | `digest-failed`        |
| `normalization`   | `core-invalid`         |
| `comparison`      | `comparison-failed`    |
| `requalification` | `package-disagreement` |
| `requalification` | `projection-failed`    |
| `requalification` | `export-failed`        |
| `requalification` | `execution-failed`     |
| `requalification` | `observation-mismatch` |
| `requalification` | `planning-failed`      |
| `parity`          | `parity-divergence`    |
| `publication`     | `publication-failed`   |

Every failure includes the repository-relative path or the record and material identity, plus the invalidating address when available.

CLI failures print no report to standard output and leave every persistent byte unchanged.

# Evidence statement

The audit report can establish:

- every recorded material was found and its digest recomputed from current bytes;
- every verdict follows from recorded digests and recorded reference edges;
- retired records were replaced by fresh evidence from their owning producers;
- valid records kept byte-identical qualification payloads;
- the post-audit closure equals a clean rebuild for the exercised inputs.

The audit cannot establish:

- that unrecorded influences did not change; closure completeness stays a declared assumption;
- that valid evidence is true — only that its recorded materials are unchanged;
- invalidation correctness for closures it did not exercise;
- material authenticity; a digest match is not a trust statement;
- anything about evidence families outside the M033 assembly shape;
- deployment readiness, security, performance, or operational suitability.

# Negative fixtures

M034 includes fixtures for:

1. stale acceptance: changed toolchain bytes with any of the compiled artifact, staged observation, or assembly record reported `valid`;
2. over-invalidation: the exact-two unselected `WithdrawAccount` requirement edit retiring or requalifying any record; custody refresh alone is correct;
3. class flattening: a requalified `runtime-checked` record reported as kernel-proven, structurally derived, or merged into one passed value; `assumed-truthful` producer entries must survive verbatim;
4. a missing recorded material: typed `material-missing` before verdicts, no stdout report, no byte change;
5. cosmetic package change: reordered theory-package JSON keeping every verdict `valid` with refreshed custody, while one flipped semantic field retires dependents;
6. an unsafe or unknown assembly identity: typed `selection` failure;
7. injected internal divergence: the same typed `parity` failure as the exported verifier;
8. failed requalification: a strengthened invariant that contradicts the staged probe producing a typed `requalification` failure that names the retired records; every prior byte remains.

Fixtures 1 through 3 and 5 assert verdict behavior. Fixtures 4, 6, 7, and 8 are command failures. Every failing run leaves persistent bytes unchanged.

# Falsifiers

M034 fails if:

1. the audit accepts a record whose opaque recorded material changed;
2. the audit retires or requalifies evidence for an edit outside its recorded closure;
3. the audit merges distinct evidence classes into one verdict value;
4. the audit continues past a missing recorded material;
5. a cosmetic byte change retires any record;
6. a semantic field change passes as cosmetic;
7. two identical runs produce different verdict tables or different report text;
8. the post-audit closure differs from the clean-rebuild closure;
9. requalification consumes a retired payload instead of fresh evidence;
10. the audit derives a dependency edge that no record states;
11. a failed audit leaves mixed old and new bytes;
12. requalification upgrades an evidence class or drops an assumption, weakening, or invalidator;
13. an unchanged-input run of `bang plan` or `bang assemble` produces different bytes than before M034.

# Non-goals

M034 does not add:

- a Core construct, surface form, theory, obligation, or evidence class;
- a daemon, watcher, or automatic trigger; the audit runs on demand;
- a distributed cache, action graph, or build scheduler;
- a general plugin protocol or external invalidation API;
- a semantic-version policy change; M028 cutover rules stay unchanged;
- invalidation for evidence families outside one published M033 closure;
- a persisted audit-history artifact; the audit report is standard output only;
- a registry, attestation envelope, upload, or deployment effect;
- performance claims for graph sizes beyond the exercised closure.

# Acceptance

1. From a clean checkout, run `bang assemble examples/tiny-bank/assemblies/supervised-exact-one.json`, then `bang audit tiny-bank-supervised-exact-one`; observe every record `valid` and zero requalifications.
2. Change `nix/gleam.nix` bytes; observe retirement limited to the compiled artifact, staged observation, and assembly record; observe a fresh export and observation with plan and qualification payloads byte-identical.
3. Flip one theory package semantic field; observe retirement through the theory lock, semantic artifact, both target evidence records, the plan, and the assembly record; observe requalification through the staged chain.
4. Change the entry module bytes; observe the same limited retirement as step 2.
5. Change `manifest.toml` bytes; observe the same limited retirement.
6. Reorder theory-package JSON properties; observe every verdict `valid`, refreshed custody digests, and unchanged qualification payloads.
7. Apply the exact-two unselected realization edit; observe every verdict `valid` with refreshed source custody.
8. Strengthen the Account invariant until the staged probe contradicts; observe the typed `requalification` failure and unchanged bytes; restore the source; observe recovery to every record `valid`.
9. Delete one recorded material; observe the `material-missing` failure with no publication.
10. Run the audit twice after any successful audit; observe identical report text and no second publication.
11. Compare the post-audit closure with a clean rebuild; observe byte equality.
12. Confirm per-record evidence classes, producers, scopes, assumptions, weakenings, and invalidators survived requalification with unchanged classes.
13. Run focused audit, schema, parity, and CLI tests.
14. Run `just verify`.

# Sources

- `BANG-PROJECT-DIRECTION.md`;
- `decisions/0007-modular-propositions-providers-and-realizations.md`;
- `decisions/0010-surface-inference-and-full-compiler-horizon.md`;
- `decisions/0012-semantic-process-architecture-and-reuse-boundary.md`;
- `design-specs/M021-construct-addressed-normalization.md`;
- `design-specs/M022-versioned-theory-explanation.md`;
- `design-specs/M028-versioned-semantic-evolution.md`;
- `design-specs/M030-local-theory-package-consumption.md`;
- `design-specs/M031-two-target-exact-one-qualification.md`;
- `design-specs/M032-objective-relative-realization-planning.md`;
- `design-specs/M033-selected-realization-assembly.md`;
- `apps/bang/src/publication.ts`;
- `apps/bang/src/assemble.ts`;
- `apps/bang/src/command.ts`.
