---
id: M028
title: Versioned semantic-service evolution
status: complete
timebox: 5 focused sessions
vision_claims:
  - versioned-semantic-evolution
  - dependency-scoped-compatibility
  - evidence-invalidation-and-reuse
  - atomic-semantic-version-cutover
  - clean-run-parity
depends_on:
  - M021
  - M022
  - M025
  - M027
---

# Mission

BANG evolves one M027 TinyBank transfer service from semantic version 1 to version 2.

The candidate changes one unselected realization requirement. BANG reuses the unchanged transfer-service closure, target artifacts, persisted rows, and qualified evidence.

A second candidate changes the selected Account invariant. BANG rejects that candidate before the semantic-version cutover. The version 1 rows and metadata remain unchanged.

# User claim

> I can change one TinyBank construct and see whether my persistent transfer service can move to the next semantic version. BANG shows which conclusions remain reusable, which conclusions become invalid, and why. A rejected change leaves the prior service usable.

# Primary uncertainty

Can stable construct identities and typed dependency closure support one safe semantic-service evolution without a general migration framework?

# Shipped journey

The canonical command is:

```sh
bang evolve examples/tiny-bank/evolution/transfer-compatible.json
```

The acceptance command is:

```sh
bun run demo:m028
```

The canonical journey is:

```text
load the strict M028 evolution selection
 -> compile the baseline M027 project
 -> compile the candidate M027 project
 -> derive both normalized Core values
 -> compare them by stable construct address
 -> derive the selected transfer-service closure
 -> observe one changed construct outside that closure
 -> retain reused selected constructs and evidence
 -> derive the unchanged SQLite schema and Effect boundary
 -> create a version 1 transfer database
 -> run the accepted M027 transfer and persist balances 6 and 6
 -> record semantic version 1 and its material digests
 -> close the version 1 provider
 -> check the stored version and candidate compatibility
 -> update only the semantic-version metadata in one SQLite transaction
 -> reopen the same database with the version 2 plan
 -> observe balances 6 and 6 with total 12
 -> transfer 1 from account-a to account-b
 -> observe balances 5 and 7 with total 12
 -> close and reopen the version 2 provider
 -> observe clean parity and semantic version 2
 -> emit one deterministic evolution report
```

The breaking fixture changes `Account.nonnegativeBalance` from `balance >= 0` to `balance >= 1`.

The breaking journey is:

```text
compile the baseline and candidate projects
 -> compare normalized Core
 -> observe the changed selected invariant and dependent obligations
 -> classify the candidate as incompatible
 -> reject before target generation or semantic-version cutover
 -> retain semantic version 1 and balances 6 and 6
 -> emit one typed failure and no partial success report
```

# Stable inputs

M028 reuses these completed capabilities:

- M021 stable construct addresses, fingerprints, dependency closure, and clean parity;
- M022 version-one semantic artifacts and strict external consumption;
- M025 project-owned source composition and evidence policy;
- M027 transfer selection, target plan, SQLite schema, Effect boundary, independent handler, and reactive observations;
- M016 transfer-preservation evidence consumed by M027;
- M018 exact-one evidence consumed by the project.

M028 does not change Core semantics. It adds one mission-local compatibility judgment over two valid checked projects.

# Selection boundary

The strict selection contains:

```text
bangSemanticEvolution: 1
id: one public evolution identity
service: one repository-relative M027 selection path
baselineVersion: 1
candidateVersion: 2
candidate:
  project: one repository-relative M025 project path
  accountSource: one repository-relative BANG source path
compatibility:
  kind: selected-service-closure
migration:
  kind: reuse-schema
scenario:
  postEvolutionTransferAmount: one positive decimal integer
```

The service selection remains the only source for entity, bridge, obligation, API, target, and initial scenario choices.

The candidate project must retain the baseline project identity. It can change project source material.

The candidate source path is explicit because provenance is part of the compatibility check.

Unknown fields fail strict Schema decoding.

# Compatibility judgment

Let `B` be the baseline normalized Core value. Let `C` be the candidate normalized Core value.

Let `compare(B, C)` be the M021 construct comparison with clean-run parity.

Let `S` be the selected service closure. M028 derives `S` from the baseline M027 plan.

`S` contains these normalized addresses:

- the selected Account state machine;
- the selected initializer;
- the selected Account state;
- each selected state field;
- the selected Account invariant;
- the selected Balance refinement;
- the selected AccountLedger bridge;
- the selected shared Balance sort.

The candidate is compatible only when all these conditions hold:

1. Every address in `S` exists in both normalized values.
2. Every address in `S` has status `reused`.
3. The candidate M027 plan resolves the same service identities and selected addresses.
4. The baseline and candidate SQL artifacts have equal bytes.
5. The baseline and candidate Effect boundary artifacts have equal bytes.
6. The declared M016 obligation evidence remains valid for its unchanged material closure.
7. The candidate project accepts its declared evidence policy.
8. The comparison has clean-run parity.

A changed construct outside `S` does not invalidate the service by itself.

This judgment does not establish general backward compatibility. It applies only to this selected service closure and target plan.

# Canonical compatible edit

The compatible candidate changes this requirement:

```text
operationRealization:WithdrawAccount.requirement:DebitAccount
unbounded -> exactly 2
```

The M027 service does not select `WithdrawAccount`. It retains its selected transfer relation and independent transfer handler.

The parent `operationRealization:WithdrawAccount` and its changed requirement are outside `S`.

The selected Account state, invariant, Balance refinement, bridge, transfer obligation, schema, and Effect boundary remain reusable.

# Canonical breaking edit

The breaking candidate changes this invariant:

```text
stateMachine:Account.invariant:nonnegativeBalance
balance >= 0 -> balance >= 1
```

The selected Account state machine and its generated preservation obligations become invalid.

The candidate is incompatible even when all persisted rows happen to satisfy the stronger invariant.

M028 does not infer a migration or transition law from current row values.

# Evidence invalidation and reuse

The report classifies each relevant result as `reused` or `invalidated`.

The report includes:

- each changed normalized construct;
- each selected service address;
- each invalidating dependency edge;
- the M016 evidence identity and disposition;
- the M018 project-evidence identity and disposition;
- the baseline and candidate project-artifact disposition;
- the generated SQL disposition;
- the generated Effect boundary disposition;
- the runtime transfer and reopen evidence disposition.

The compatible journey rebuilds the candidate project artifact because its source material changed.

It reuses the selected service conclusions, generated target artifacts, M016 evidence, M018 evidence, and persisted rows.

The breaking journey invalidates selected Account conclusions and M027 runtime evidence. It can retain unrelated proof evidence when its own material closure is unchanged.

No report can use one undifferentiated `passed` value for these dispositions.

# Semantic-version metadata

M028 adds one target-owned metadata table:

```text
bang_semantic_service_version
  service_id TEXT PRIMARY KEY
  semantic_version INTEGER NOT NULL
  artifact_sha256 TEXT NOT NULL
  normalized_sha256 TEXT NOT NULL
```

The metadata table does not define domain meaning. It records the selected service material at the target boundary.

The version 1 row is inserted after the baseline service and persisted rows are valid.

The version 2 cutover uses one SQLite transaction. The transaction checks all expected version 1 values before it updates the row.

A version mismatch, digest mismatch, or incompatible candidate causes rollback.

The `reuse-schema` migration changes no Account row and no Account table definition.

# Runtime journey

M028 uses the same SQLite file before and after cutover.

The version 1 journey uses the M027 independent handler and atomic transfer transaction.

The version 2 journey reopens the database with the candidate plan. It reads both existing accounts before a new transfer.

The version 2 transfer changes these observations:

```text
before: account-a revision 1 balance 6
before: account-b revision 1 balance 6
before: TotalFunds revision 1 total 12

after: account-a revision 2 balance 5
after: account-b revision 2 balance 7
after: TotalFunds revision 2 total 12
```

A final reopen must equal clean queries over the committed version 2 state.

M028 does not claim durable subscription delivery across provider closure.

# Generated artifacts

The command writes deterministic artifacts under:

```text
.bang/semantic-evolution/tiny-bank-transfer-evolution/
  schema.sql
  bindings.ts
  report.json
```

The SQL and Effect boundary bytes equal the selected candidate M027 artifacts.

The SQLite database is a scoped runtime artifact. Its bytes are not deterministic evidence.

Unchanged inputs produce byte-identical generated artifacts and standard output.

The command writes generated artifacts only after the compatible runtime journey succeeds.

# Report

The strict report contains:

```text
bangSemanticEvolutionReport: 1
evolution identity
service identity
baseline and candidate versions
baseline and candidate project paths
baseline and candidate semantic-artifact digests
baseline and candidate normalized digests
changed constructs
selected service closure
compatibility classification
reused and invalidated results
generated artifact paths and digests
stored version before and after cutover
observations before and after cutover
final reopen observations
clean parity
limitations
```

The compatibility classification is `compatible` for the canonical report.

A rejected evolution emits no report on standard output and writes no generated artifacts.

# Typed failures

One M028 failure boundary retains:

- stage;
- reason;
- path;
- message;
- identity when available;
- selected invalidating addresses when available.

Failure stages are:

```text
selection
baseline
candidate
comparison
compatibility
evidence
projection
filesystem
runtime
report
```

# Positive fixtures

M028 includes:

1. the canonical compatible selection;
2. the unchanged baseline M027 selection;
3. the exact-two unselected realization source;
4. deterministic comparison and target artifacts;
5. version 1 seed and transfer observations;
6. atomic version 2 metadata cutover;
7. version 2 transfer and final reopen observations;
8. qualified evidence reuse and invalidation results.

# Negative fixtures

M028 rejects:

- malformed or excess selection fields;
- an unsafe project or source path;
- a candidate version that is not greater than the baseline version;
- a candidate project with a different project identity;
- an unknown candidate source;
- a comparison without clean parity;
- a missing selected service address;
- a changed, added, or removed selected service address;
- changed generated SQL or Effect boundary bytes under `reuse-schema`;
- stale M016 or M018 evidence;
- a stored service identity, version, artifact digest, or normalized digest mismatch;
- a zero or negative post-evolution transfer amount;
- a partial metadata update;
- any failure that emits a partial success report.

The invariant-change fixture must show that version 1 remains readable after rejection.

# Falsifiers

M028 fails if:

1. It classifies the invariant change as compatible.
2. It rejects the unselected exact-two change only because the project artifact changed.
3. It treats equal current rows as proof that the stronger invariant is compatible.
4. It changes an Account row during the semantic-version cutover.
5. It updates metadata before compatibility and evidence checks succeed.
6. It presents M016 proof evidence as Effect or SQLite implementation conformance.
7. It flattens reused and invalidated evidence into one result.
8. It regenerates a different schema or Effect boundary under `reuse-schema`.
9. It runs the candidate handler before the version 2 cutover commits.
10. It leaves a partial generated report after failure.
11. It reports deterministic SQLite database bytes.
12. It weakens any M027 limitation.

# Explicit non-goals

M028 does not add:

- automatic schema migration;
- field rename inference;
- default-value inference;
- arbitrary data transformation;
- general backward or forward compatibility;
- online migration with concurrent clients;
- rollback from version 2 to version 1;
- a migration registry;
- remote package resolution;
- HTTP, RPC, or browser bindings;
- authentication or row-level security;
- replication, sharding, distributed transactions, or consensus;
- crash-proof publication after commit;
- a generic categorical migration language.

# Acceptance

1. Freeze this contract before implementation.
2. Add the strict compatible and breaking selections.
3. Compile both projects through the existing M025 path.
4. Derive both M027 plans without restating transfer semantics.
5. Compare normalized Core with M021 clean parity.
6. Classify the exact-two edit as compatible.
7. Run the version 1 journey and record version 1 metadata.
8. Commit the version 2 metadata cutover atomically.
9. Run the version 2 transfer and final reopen journey.
10. Emit deterministic target artifacts and one qualified report.
11. Reject the invariant edit before cutover.
12. Observe unchanged version 1 metadata and rows after rejection.
13. Run focused Core, CLI, runtime, and fixture checks.
14. Run `just verify`.

# Closure evidence

The shipped compatible journey is:

```sh
bang evolve examples/tiny-bank/evolution/transfer-compatible.json
```

It reports two changed `WithdrawAccount` realization constructs outside the selected service closure. All eight selected service conclusions, M016 evidence, M018 evidence, runtime evidence, SQL bytes, Effect binding bytes, and persisted Account rows remain reusable.

The runtime observes:

```text
version 1 -> version 2
before cutover  6 / 6 / 12
after cutover   6 / 6 / 12
after transfer  5 / 7 / 12
final reopen    5 / 7 / 12
```

The breaking fixture reports `stateMachine:Account` and `stateMachine:Account.invariant:nonnegativeBalance` as invalidating addresses. It emits no generated artifacts. The focused rejection fixture seeds version 1 metadata and rows, performs the compatibility rejection, then observes the same version 1 metadata and `6 / 6 / 12` rows.

`bun run demo:m028` verifies byte-identical standard output and generated artifacts across repeated compatible runs. `bun run test:m028` verifies strict decoding, dependency-scoped reuse, strict report reload, deterministic artifacts, typed rejection, no partial report, and version 1 preservation after rejection.
