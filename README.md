# BANG

BANG specifies software systems as networks of related theories and projects their accumulated contracts into executable conformance boundaries.

## Exploratory direction

BANG now explores one concrete product path: compile a checked domain model into a persistent reactive semantic data service.

The output can include a logical schema, database constraints, typed commands, queries, subscriptions, provider ports, client bindings, and evidence.

An existing database and runtime own storage and execution. BANG owns the domain meaning, derivation provenance, implementation obligations, and qualified evidence.

Underdetermined business behavior remains an independent checked handler. BANG does not claim that it can generate arbitrary programs or decide arbitrary logic.

This path tests whether the BANG model is feasible and useful. It does not remove programming-language, build-system, or theory-distribution work from the ecosystem.

See [decision 0011](decisions/0011-semantic-data-service-exploration.md) for the boundary and first tracer candidate.

## Completed missions

The completed vertical missions are listed below. See the [capability dependency map](CAPABILITIES.md) for their scheduling relations.

- [M000 executable specification spine](design-specs/M000-executable-specification-spine.md).
- [M001 refined domain value](design-specs/M001-refined-domain-value.md).
- [M002 one theory and one finite model](design-specs/M002-one-theory-one-model.md).
- [M003 generated algebraic law suite](design-specs/M003-generated-law-suite.md).
- [M004 state transition and invariant preservation](design-specs/M004-state-transition-invariant.md).
- [M005 two related theories](design-specs/M005-two-related-theories.md).
- [M005A first useful Core dogfood](design-specs/M005A-first-core-dogfood.md).
- [M006 effectful capability boundary](design-specs/M006-effectful-capability-boundary.md).
- [M007 graded evidence report](design-specs/M007-graded-evidence-report.md).
- [M008 runtime trace observation](design-specs/M008-runtime-trace-observation.md).
- [M009 Rust portability projection](design-specs/M009-rust-portability-projection.md).
- [M010 replayable evidence manifest](design-specs/M010-replayable-evidence-manifest.md).
- [M011 solver-backed relational obligation](design-specs/M011-solver-backed-relational-obligation.md).
- [M012 accumulated system report](design-specs/M012-accumulated-system-report.md).
- [M013 Account source notation](design-specs/M013-account-source-notation.md).
- [M014 cohesive system CLI](design-specs/M014-cohesive-system-cli.md).
- [M015 entity ownership and typed messages](design-specs/M015-entity-ownership-and-messages.md).
- [M016 kernel-proof provider](design-specs/M016-kernel-proof-provider.md).
- [M017 Gleam and BEAM actor realization](design-specs/M017-gleam-beam-actor-realization.md).
- [M018 single-use capability](design-specs/M018-single-use-capability.md).
- [M019 real BANG self-check](design-specs/M019-real-bang-self-check.md).
- [M020 family ledger prototype](design-specs/M020-family-ledger-prototype.md).
- [M021 construct-addressed normalization](design-specs/M021-construct-addressed-normalization.md).
- [M022 versioned theory explanation](design-specs/M022-versioned-theory-explanation.md).
- [M023 realization classification](design-specs/M023-realization-classification.md).
- [M024 bounded two-owner channel trace](design-specs/M024-bounded-channel-trace.md).
- [M025 single-authority project composition](design-specs/M025-single-authority-project.md).
- [M026 persistent reactive semantic database](design-specs/M026-semantic-database.md).
- [M027 cross-entity atomic transfer](design-specs/M027-cross-entity-transfer.md).
- [M028 versioned semantic-service evolution](design-specs/M028-versioned-semantic-evolution.md).
- [M029 second-domain reusable theory portability](design-specs/M029-second-domain-theory-portability.md).
- [M030 local versioned theory package consumption](design-specs/M030-local-theory-package-consumption.md).
- [M031 fresh two-target exact-one qualification](design-specs/M031-two-target-exact-one-qualification.md).
- [M032 objective-relative realization planning](design-specs/M032-objective-relative-realization-planning.md).
- [M033 selected realization assembly](design-specs/M033-selected-realization-assembly.md).
- [M034 continuous evidence invalidation](design-specs/M034-evidence-invalidation.md).
- [M035 external extension boundary](design-specs/M035-external-extension-boundary.md).

This monorepo contains the BANG specification language, Core, compilers, target projections, conformance tools, build tools, theories, and future realization packages. See the [repository map](docs/repository-map.md). A frozen mission must create pressure before a subsystem becomes a package.

## Current frontier

M036 is the active mission. Its local acceptance evidence is complete, but delivery awaits protected integration.

The Clinic journey reuses the M031–M035 path. Checked Core supplies its identities and accepted shape, while each target owns its runtime behavior.

## Experience the current capability

```sh
just install
just preview
./node_modules/.bin/bang report examples/tiny-bank/system/account-ledger.json
./node_modules/.bin/bang check examples/bang-core/self-check/bridge-term.json
./node_modules/.bin/bang trace examples/tiny-bank/channels/two-owner.json
./node_modules/.bin/bang project examples/tiny-bank/project.json
./node_modules/.bin/bang database examples/tiny-bank/database/account.json
./node_modules/.bin/bang evolve examples/tiny-bank/evolution/transfer-compatible.json
./node_modules/.bin/bang explain examples/inventory/theories/exact-one-reservation.json
./node_modules/.bin/bang explain examples/inventory/theories/packaged-exact-one.json
./node_modules/.bin/bang classify examples/tiny-bank/realizations/two-qualified-exact-one.json
./node_modules/.bin/bang plan examples/tiny-bank/plans/supervised-exact-one.json
./node_modules/.bin/bang assemble examples/tiny-bank/assemblies/supervised-exact-one.json
./node_modules/.bin/bang audit tiny-bank-supervised-exact-one
./node_modules/.bin/bang classify examples/clinic/realizations/two-qualified-exact-one.json
./node_modules/.bin/bang plan examples/clinic/plans/supervised-exact-one.json
./node_modules/.bin/bang assemble examples/clinic/assemblies/supervised-exact-one.json
./node_modules/.bin/bang audit clinic-supervised-exact-one
./node_modules/.bin/bang export-schemas
bun run evidence:m036
```

The `bang report <selection>` command loads the selected sources and six evidence records, validates the merged Core document, and prints one deterministic accumulated report. Typed failures retain the input stage and path. BANG source failures also retain the span, found token, and expected syntax. The earlier demonstrations carry unchanged Core through Effect TypeScript and Rust conformance boundaries, independent implementations, graded evidence, one real runtime trace, replayable property-test evidence, and one bounded solver-reported relational question. M009 reports Rust's `i128` weakening instead of claiming arbitrary-precision target equivalence. M010 verifies a deterministic four-file SHA-256 closure before replay. M011 reports bounded Z3 results without claiming proof. M012 preserves six typed evidence payloads. M013 lowers one Account source file to the four checked declarations used by six downstream journeys.
The M016 journey is available as `bun run demo:m016`. It reports the same normalized transfer obligation through bounded Z3 evidence and unbounded Lean kernel evidence without flattening their grades or claiming implementation conformance.
The M017 journey is available as `bun run demo:m017`. It runs a typed Account actor under a real BEAM supervisor, observes a restart with state reset, and reports BEAM ordering, delivery, persistence, foreign-function, and resource limits without moving those policies into Core.

The completed M018 journey is available as `bun run demo:m018`. It checks one exact-use capability and one atomic target consumption. The completed M019 `bang check <selection>` path generates a disposable Effect boundary, checks the real recursive `@bang/core` decoder, and reports fresh sampled evidence with material digests.

M020 remains the shipped persistent family-ledger reference journey. Run `bun run demo:m020` for its deterministic multi-process path. M021 is complete: run `bun run demo:m021`, or `bang normalize examples/tiny-bank/normalization/selected-realization-change.json`, to compare checked Core source sets by stable construct address, semantic fingerprint, typed dependency closure, provenance, invalidation reason, and clean-run parity. M022 is complete: run `bun run demo:m022`, or `bang explain examples/tiny-bank/theories/exact-one-capability.json`, to pass a deterministic version-one semantic artifact through the independent `@bang/theories` consumer. M023 is complete: run `bun run demo:m023`, or `bang classify examples/tiny-bank/realizations/exact-one.json`, to classify the Effect realization as qualified and the Gleam realization as rejected with explicit evidence and limitations.

M024 is complete: run `bun run demo:m024`, or `bang trace examples/tiny-bank/channels/two-owner.json`, to execute one bounded two-owner protocol under ordered, duplicated, reordered, and dropped delivery attempts. The report keeps logical-message identity, delivery-attempt identity, observed order, causality, loss, and coordination distinct. It makes no real-network, recovery, fairness, liveness, or distributed exactly-once claim.

M025 is complete. Run `bun run demo:m025`, or `bang project examples/tiny-bank/project.json`. The command selects TinyBank sources, theories, realization candidates, targets, channel analysis, and evidence policy once. The report preserves theory, realization, channel, and evidence distinctions through one project-owned composition root.

M026 is complete. Run `bun run demo:m026`, or `bang database examples/tiny-bank/database/account.json`. The command derives, type-checks, runs, reopens, and reports one persistent reactive service.

M027 is complete. Run `bun run demo:m027`, or `bang database examples/tiny-bank/database/transfer.json`, for the atomic two-Account transfer and reactive TotalFunds journey.

M028 is complete. Run `bun run demo:m028`, or `bang evolve examples/tiny-bank/evolution/transfer-compatible.json`. The command compares normalized Core, classifies the selected service closure, confirms byte-identical SQL and Effect projections, cuts version metadata from 1 to 2 atomically, exercises the candidate service, and reopens the same SQLite file. The breaking fixture at `examples/tiny-bank/evolution/transfer-breaking.json` reports its invalidating addresses and emits no generated artifacts.

M029 is complete. Run `bun run demo:m029`, or `bang explain examples/inventory/theories/exact-one-reservation.json`, to observe domain-neutral applicability across TinyBank and Inventory.

M030 is complete. Run `bun run demo:m030`, or `bang explain examples/inventory/theories/packaged-exact-one.json`. The selection resolves and verifies the local versioned package, checks evaluator agreement, and publishes `.bang/theory-locks/inventory-packaged-exact-one.json` deterministically. Negative fixtures cover digest and version mismatch, missing packages, unsupported evaluators, and evaluator disagreement.

M031 is complete. Run `bun run demo:m031`, or `bang classify examples/tiny-bank/realizations/two-qualified-exact-one.json`. The command runs fresh Effect and supervised Gleam/BEAM exact-one probes, verifies separate target evidence, reports two qualified profiles, and publishes the artifact, lock, projections, evidence, and report deterministically only after all checks succeed.

M032 is complete. Run `bun run demo:m032`, or `bang plan examples/tiny-bank/plans/supervised-exact-one.json`. The command stages fresh M031 qualification, derives target-owned planning contributions from checked evidence, and publishes one atomic closure. The four fixtures select Gleam, select Effect, return incomparable plans, and return no plan.

M033 is complete. Run `bun run demo:m033`, or `bang assemble examples/tiny-bank/assemblies/supervised-exact-one.json`. The command reruns the staged plan, binds the M031-qualified Gleam boundary by digest, exports one canonical escript under the pinned toolchain, executes it once as a separate process, and compares the observation with M031 evidence. One transaction publishes the qualification, plan, project materials, artifact, and assembly record. `escript .bang/assemblies/tiny-bank-supervised-exact-one/bin/exact_one` runs without BANG or the Gleam compiler. Seven negative selection fixtures plus focused unit failure cases cover non-selected plans, malformed selections, material mismatch, failed execution, and late publication restoration.

M034 is complete. Run `bang audit tiny-bank-supervised-exact-one` to audit the published assembly closure: the command inventories every recorded material, recomputes each SHA-256 digest from current bytes, and classifies every member by its equality class — decoded materials (checked Core sources, theory package) compare semantically so a cosmetic reorder retires nothing, opaque custody bytes compare exactly, and derived members resolve through their owning producer. Changed materials retire records transitively over recorded citation edges only; requalification reruns only retired producers while preserving evidence classes; closure parity is verified before any commit and the fresh closure republishes atomically. Typed failures cover unsafe or unknown assembly identities, missing or unreadable materials, comparison failures, and failed requalification. Focused fixtures cover stale toolchain acceptance, cosmetic package reorder, strengthened-invariant requalification failure with unchanged bytes, deleted material, and idempotent double runs.

M035 established the public `bang export-schemas` boundary. The current command publishes schema major 2 under `dist/schemas/2/`.

Major 2 accepts checked-Core-selected realization and entity identifiers in target evidence. Major 1 fixed those fields to TinyBank literals.

M036 has complete local acceptance evidence. Protected integration is pending, so the mission remains active.

Checked Core selects `AppointmentBook`, its operation and state shapes, `ConfirmBooking`, `BookingRejectedOnce`, and `BookAppointmentOnce`. Each target owns the decrement.

Effect TypeScript and Gleam/BEAM run fresh probes. Each target writes separate evidence, and planning selects the qualified Gleam candidate.

Assembly retains the selected Gleam boundary byte for byte. The copied escript runs with an Erlang-only `PATH`, without BANG or the Gleam compiler.

Audit checks 18 materials. It reports 10 unchanged, 8 deferred, 0 changed, 0 retirements, and zero requalifications.

The external consumer runs in a sandbox outside the workspace. It strictly decodes the Clinic lock and Effect evidence, then checks both supplied materials.

The loader observes only `consumer.mjs`, `publication/types/consumer.js`, `node:crypto`, `node:fs/promises`, and `node:path`.

The four tracked negative files cover a foreign realization and a two-field state profile. They return `target/missing-declaration` and `target/unsupported-target`.

Changed material bytes return `custody/digest-mismatch`. An excess evidence property returns `decode/decode-failed`, and a late assembly failure returns `publication/publication-failed`.

A second clean Clinic sandbox reproduces all 21 published file digests and command observations. Schema major 2 has six files.

The same journey preserves all six seeded major-1 files. Two clean TinyBank worktrees also match all 15 required files byte for byte.

Run `bun run evidence:m036` for that clean-worktree comparison. The only machine-checkable digest root is [`tests/m036-tiny-bank-protected-baseline.json`](tests/m036-tiny-bank-protected-baseline.json) plus [`scripts/m036-clean-parity.ts`](scripts/m036-clean-parity.ts).

Local `just verify` passes its `check`, completed previews, full test chain, and `build` scope.

M036 does not establish a Core decrement law or clinical correctness. It does not establish durable exact-once execution, liveness, fairness, or broader target shapes.

It also does not generalize to arbitrary domains. External validity does not prove implementation conformance or evidence truth.

The install prepares the pinned `@effect/tsgo` language server. VS Code-family editors use the repository settings under `.vscode/`; other editors should invoke the executable reported by `bunx effect-tsgo get-exe-path`. Run `bun run check:effect-lsp` to observe both the clean project and a deliberately floating Effect counterexample.

Run `just` to list the repository task surface. `just verify` is the same readiness contract used by GitHub Actions. Native Git hooks apply safe fixes and static checks before commits, enforce Conventional Commits, and run tests before pushes.

Read [BANG-PROJECT-DIRECTION.md](BANG-PROJECT-DIRECTION.md) for the project constitution. The three previous attempts remain external historical references; they are not merged into this repository.

## Repository identity

This project is published as [`phibkro/bang-project`](https://github.com/phibkro/bang-project). The existing `phibkro/bang`, `phibkro/bang-lang`, and `phibkro/semantic-systems` repositories remain attached to earlier attempts and serve only as historical references.
