---
id: M036
title: Second-domain realization boundary portability
status: complete
timebox: 5 focused sessions
vision_claims:
  - second-domain-realization-portability
  - checked-core-selected-target-shape
  - tiny-bank-clean-output-parity
  - domain-neutral-external-consumption
depends_on:
  - M029
  - M030
  - M031
  - M032
  - M033
  - M034
  - M035
---

# Revision record

The prior M036 contract was a full compiler candidate for a Clinic domain. Preflight found a contradiction in that contract.

The candidate required Clinic identities through M031, M032, M033, M034, and M035. The same contract prohibited changes to producers that required TinyBank identities.

Thus, the candidate had no path to pass its own acceptance boundary. M036 now tests the missing realization portability boundary first.

The full compiler candidate moved to M037 only after M036 passed. This record preserves the original sequencing decision.

Protected integration completed on 2026-08-27. M036 is `complete` at protected revision `5e45b1242c74c6a5306b0817ddd08814b68292a9`.

# Mission

BANG carries one minimal Clinic exact-one operation through the completed M031 through M035 path.

The path starts with fresh two-target qualification. It continues through planning, selected Gleam assembly, audit, and an external M035 consumer.

Checked Core supplies all domain identities and the accepted operation and state shape. TinyBank constants do not supply Clinic meaning.

All existing TinyBank outputs remain byte-identical to clean outputs from protected revision `f2673c1b74726adcbf6b56a8655d5efee505b1b2`.

M036 does not add a new semantic capability. It tests whether the existing realization boundary works for two structurally equivalent domains.

# User claim

> I can replace TinyBank withdrawal with one Clinic booking operation. The same two targets qualify it, planning selects Gleam, assembly runs, audit stays clean, and an external consumer accepts the closure. BANG takes Clinic identities from checked Core and does not change TinyBank output.

# Primary uncertainty

M031 through M035 completed one target path for `Account.withdraw` and `WithdrawAccountOnce`. That path contains TinyBank-specific identity assumptions.

The primary uncertainty is whether these assumptions are removable representation choices or required semantic meaning. Clinic success alone does not answer this question.

M036 answers the question only if Clinic succeeds and TinyBank clean-output parity remains exact.

# Stable boundary

M036 accepts one narrow checked-Core profile:

1. One state machine.
2. One state declaration.
3. One `Integer` state field.
4. One initializer with one `Integer` parameter.
5. One transition with one `Integer` parameter.
6. One transition requirement that the parameter is nonnegative.
7. One transition requirement that the state field is not less than the parameter.
8. One invariant that the state field is nonnegative.
9. One operation realization that binds the transition.
10. One capability requirement with quantity `exactly 1`.
11. One disabled `failure` identity.
12. Two fresh targets in the existing order: `effect-typescript`, then `gleam-beam`.
13. One existing supervised planning objective.
14. One selected Gleam escript assembly.
15. One clean audit and one external M035 consumption result.

The initializer requirement states that its parameter is nonnegative. This requirement completes the accepted initializer shape.

A target must reject a checked shape outside this profile with its existing typed `unsupported-target` result. The target must not silently accept a larger service shape.

The selected realization identity must agree across these records:

- the classification selection;
- the applicable theory result;
- the checked operation realization;
- the exact-one requirement address;
- each target projection;
- each target evidence record;
- the planning objective and candidate;
- the selected assembly material;
- the assembly observation.

The checked operation realization selects the machine, operation, capability, failure, state, field, and parameters. A selection file cannot redefine those checked identities.

## Target-owned behavior

The existing probes use a decrement-like implementation. On success, each probe subtracts the operation parameter from the selected state field.

This subtraction is target-owned behavior. Core does not contain a postcondition or state-update construct that warrants it as domain truth.

The fixed probe cases, numeric values, target order, Effect lifetime, and Gleam supervision remain target-owned behavior. M036 does not change their evidence strength.

The Gleam assembly remains the existing `escript` artifact with entry `main`. M036 does not add Effect assembly.

## Evidence meaning

M036 keeps the M031 evidence model unchanged:

- each target owns its evidence;
- one target record cannot support the other target;
- the probe is fresh;
- the grant has exactly one use;
- invalid destination does not consume the grant;
- valid use consumes the grant before implementation success or failure;
- reuse is rejected;
- competing calls produce one success and one rejection;
- implementation failure after consumption does not restore the grant;
- the recorded state and remaining-use traces stay bounded runtime observations.

The evidence classes, scopes, assumptions, weakenings, lifetime, invalidators, and four exact-one obligation identities remain unchanged.

# Clinic input

The Clinic source is `examples/clinic/clinic.bang`.

```bang
machine AppointmentBook {
  state AppointmentBookState {
    available: Integer
  }

  initializer open(initialAvailable: Integer) {
    requires initialAvailable >= 0
  }

  transition book(count: Integer) {
    requires count >= 0
    requires available >= count
  }

  invariant nonnegativeAvailable {
    available >= 0
  }
}

capability ConfirmBooking

realization BookAppointmentOnce binds AppointmentBook.book {
  requires ConfirmBooking exactly 1
  when disabled fail BookingRejectedOnce
}
```

The exact semantic identities are:

| Role                  | Identity                                                              |
| --------------------- | --------------------------------------------------------------------- |
| Machine               | `AppointmentBook`                                                     |
| State                 | `AppointmentBookState`                                                |
| State field           | `available`                                                           |
| Initializer           | `open`                                                                |
| Initializer parameter | `initialAvailable`                                                    |
| Transition            | `book`                                                                |
| Transition parameter  | `count`                                                               |
| Invariant             | `nonnegativeAvailable`                                                |
| Capability            | `ConfirmBooking`                                                      |
| Realization           | `BookAppointmentOnce`                                                 |
| Disabled failure      | `BookingRejectedOnce`                                                 |
| Requirement address   | `operationRealization:BookAppointmentOnce.requirement:ConfirmBooking` |

The probe entity is target-owned and domain-relative. Its exact observation identity is `appointment-book-1`.

The generated Gleam module path is `src/bang/appointment_book_entity.gleam`. TinyBank keeps `src/bang/account_entity.gleam` exactly.

# Input layout

M036 adds only these positive domain inputs:

```text
examples/clinic/
  clinic.bang
  theories/
    packaged-exact-one.json
  realizations/
    two-qualified-exact-one.json
  plans/
    supervised-exact-one.json
  assemblies/
    supervised-exact-one.json
```

The packaged theory selection has these exact values:

| Field             | Value                                                                     |
| ----------------- | ------------------------------------------------------------------------- |
| `bangExplanation` | `1`                                                                       |
| `id`              | `clinic-packaged-exact-one`                                               |
| source path       | `examples/clinic/clinic.bang`                                             |
| source format     | `bang-source`                                                             |
| `requirement`     | `operationRealization:BookAppointmentOnce.requirement:ConfirmBooking`     |
| theory path       | `packages/theories/theory-packages/exact-one-capability.json`             |
| theory id         | `ExactOneCapabilityExecution`                                             |
| theory version    | `1`                                                                       |
| semantic digest   | `sha256:f5688125437b19929b78f813b74a6595e09d92fdfd8ac6005066ff1cb3557071` |

The qualification selection has these exact values:

| Field                  | Value                                               |
| ---------------------- | --------------------------------------------------- |
| `bangClassification`   | `2`                                                 |
| `id`                   | `clinic-two-qualified-exact-one`                    |
| `explanationSelection` | `examples/clinic/theories/packaged-exact-one.json`  |
| first target           | `effect-typescript`, `BookAppointmentOnce`, `fresh` |
| second target          | `gleam-beam`, `BookAppointmentOnce`, `fresh`        |

The planning selection has these exact values:

| Field                    | Value                                                                 |
| ------------------------ | --------------------------------------------------------------------- |
| `bangPlanning`           | `1`                                                                   |
| `id`                     | `clinic-supervised-exact-one`                                         |
| `qualificationSelection` | `examples/clinic/realizations/two-qualified-exact-one.json`           |
| `requirementAddress`     | `operationRealization:BookAppointmentOnce.requirement:ConfirmBooking` |
| `runtime-model`          | `supervised-actor`                                                    |
| `restart`                | `supervised-restart`                                                  |
| `grant-restart`          | `invalidated-on-restart`                                              |

The assembly selection has these exact values:

| Field           | Value                                             |
| --------------- | ------------------------------------------------- |
| `bangAssembly`  | `1`                                               |
| `id`            | `clinic-supervised-exact-one`                     |
| `planSelection` | `examples/clinic/plans/supervised-exact-one.json` |
| artifact kind   | `escript`                                         |
| artifact entry  | `main`                                            |

# Published layout

A successful journey publishes this Clinic closure:

```text
.bang/
  artifacts/
    clinic-packaged-exact-one.json
  theory-locks/
    clinic-packaged-exact-one.json
  qualifications/
    clinic-two-qualified-exact-one/
      effect-typescript/
        boundary.ts
        evidence.json
      gleam-beam/
        src/bang/appointment_book_entity.gleam
        evidence.json
      report.json
  plans/
    clinic-supervised-exact-one/
      report.json
  assemblies/
    clinic-supervised-exact-one/
      gleam.toml
      manifest.toml
      canonicalize_escript.escript
      src/bang/appointment_book_entity.gleam
      src/main.gleam
      bin/exact_one
      report.json
```

Output paths contain no temporary directory, timestamp, process identity, random value, or machine-specific cache path.

# Journey

1. From clean inputs, `bang classify examples/clinic/realizations/two-qualified-exact-one.json` runs both fresh target probes.
2. The command publishes two independent `Qualified` evidence records and one qualification report.
3. `bang plan examples/clinic/plans/supervised-exact-one.json` uses current qualification evidence.
4. The planning result selects the qualified `gleam-beam` candidate for the existing supervised objective.
5. `bang assemble examples/clinic/assemblies/supervised-exact-one.json` binds the selected generated bytes by digest.
6. The assembler runs the staged escript as a separate process and records the matching Clinic observation.
7. The published escript runs without BANG and without the Gleam compiler.
8. `bang audit clinic-supervised-exact-one` reports each record as `valid` and performs zero requalifications.
9. The external M035 consumer reads the Clinic theory lock, one target evidence record, and its supplied material bytes.
10. The consumer returns `valid` without a BANG workspace and without compiler-internal imports.

Every command keeps atomic publication. A failed command leaves all prior persistent bytes unchanged.

# Public schema compatibility

The external consumer must accept the Clinic identifiers in a valid M031 evidence record. Strict decoding, material custody, and identity agreement remain mandatory.

The consumer must still reject these inputs:

- an unknown or excess property;
- an invalid document format tag;
- an unsupported publication version;
- a missing material;
- a material with a different digest;
- disagreement between the theory lock and evidence record;
- disagreement inside the evidence record.

Local acceptance changed the accepted encoded shape. The target evidence schema now accepts checked-Core-selected realization and entity identifiers instead of two TinyBank-only literals.

Therefore, `bang export-schemas` publishes major 2. The acceptance sandbox preserved all six version-one publication paths byte for byte.

The domain name alone did not cause the new major. The change from fixed literals to non-empty identifiers required it under the M035 rules.

# Typed failures

M036 adds no failure class, stage, or reason. It reuses the existing typed vocabulary of each boundary.

| Boundary                 | Existing typed result used by M036                                                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Classification selection | `ClassificationFailure` with `selection` and `invalid-target-selection`                                                                                 |
| Target projection        | target projection failure with `unsupported-target`, `missing-declaration`, `inconsistent-declaration`, `invalid-identifier`, or `identifier-collision` |
| M031 evidence            | `M031TargetQualificationEvidenceError` with existing identity, target, Core, result, observation, material, or package reasons                          |
| Planning                 | `PlanFailure` with the existing selection, qualification, objective, contribution, or publication stage and reason                                      |
| Assembly                 | `AssemblyFailure` with the existing selection, planning, material, staging, execution, or publication stage and reason                                  |
| Audit                    | `AuditFailure` with the existing M034 stage and reason vocabulary                                                                                       |
| External consumer        | `rejected` with existing publication, decode, custody, or agreement stage and reason                                                                    |

The CLI prints no success report to standard output after a typed failure. It publishes no partial closure.

# Negative fixtures

M036 adds these tracked negative inputs:

```text
examples/clinic/
  unsupported/
    two-state-fields.bang
  theories/
    unsupported-two-state-fields.json
  realizations/
    foreign-realization.json
    unsupported-two-state-fields.json
```

## Foreign realization

`foreign-realization.json` uses the valid Clinic theory selection. Both fresh targets select `WithdrawAccountOnce` instead of `BookAppointmentOnce`.

Classification returns stage `target`, reason `missing-declaration`, and address `operationRealization:WithdrawAccountOnce` before probe execution. No Clinic output changes.

## Unsupported state shape

`two-state-fields.bang` copies the valid Clinic source and adds this state field:

```bang
reserved: Integer
```

Its theory selection uses the same versioned exact-one package and selects the Clinic exact-one requirement. Its qualification selection uses `BookAppointmentOnce` for both fresh targets.

Theory applicability succeeds. Target projection returns stage `target`, reason `unsupported-target`, and address `stateMachine:AppointmentBook`. No output changes.

## Evidence identity mismatch

A negative evidence case changes the observed realization or entity. The M031 evidence boundary returns reason `target-mismatch` for identity `observations`.

A second case changes the capability suffix. The boundary returns reason `identity-mismatch` for identity `requirementAddress`.

## External custody and decode

One consumer case changes one supplied Clinic material byte. The consumer returns `custody` and `digest-mismatch`.

One consumer case adds an excess evidence property. The consumer returns `decode` and `decode-failed`.

## Publication failure

A late publication failure leaves every prior Clinic and TinyBank byte unchanged. The command returns stage `publication` and reason `publication-failed`.

# TinyBank clean-output parity

The parity baseline comes from clean generated output at protected revision `f2673c1b74726adcbf6b56a8655d5efee505b1b2`. Dirty working-tree output is not a baseline.

The candidate comparison uses a separate clean checkout, the same dependency lock, and the same canonical TinyBank commands.

At minimum, the comparison covers these 15 affected closure files:

```text
.bang/artifacts/tiny-bank-packaged-exact-one.json
.bang/theory-locks/tiny-bank-packaged-exact-one.json
.bang/qualifications/tiny-bank-two-qualified-exact-one/effect-typescript/boundary.ts
.bang/qualifications/tiny-bank-two-qualified-exact-one/effect-typescript/evidence.json
.bang/qualifications/tiny-bank-two-qualified-exact-one/gleam-beam/src/bang/account_entity.gleam
.bang/qualifications/tiny-bank-two-qualified-exact-one/gleam-beam/evidence.json
.bang/qualifications/tiny-bank-two-qualified-exact-one/report.json
.bang/plans/tiny-bank-supervised-exact-one/report.json
.bang/assemblies/tiny-bank-supervised-exact-one/gleam.toml
.bang/assemblies/tiny-bank-supervised-exact-one/manifest.toml
.bang/assemblies/tiny-bank-supervised-exact-one/canonicalize_escript.escript
.bang/assemblies/tiny-bank-supervised-exact-one/src/bang/account_entity.gleam
.bang/assemblies/tiny-bank-supervised-exact-one/src/main.gleam
.bang/assemblies/tiny-bank-supervised-exact-one/bin/exact_one
.bang/assemblies/tiny-bank-supervised-exact-one/report.json
```

If a changed shared boundary produces another TinyBank file, that file also enters the clean comparison. All existing TinyBank command output remains part of the compatibility boundary.

The acceptance record stores paths and digests from both clean runs. It does not copy digest values from an existing `.bang` directory.

Local acceptance compared two clean worktrees. The protected revision was `f2673c1b74726adcbf6b56a8655d5efee505b1b2`.

The integrated candidate revision is `d2fa7ea4575e6b4e026e369435a21c1d0897d5e6`. Both worktrees used this `bun.lock` SHA-256:

```text
e7514199ff3c158fbf561bad227248ab4d28e21c142d63ea087beda0882ef8aa
```

Each worktree ran these setup commands:

```sh
just install
bun run build
```

Each worktree then ran these commands in order:

```sh
bun run bang classify examples/tiny-bank/realizations/two-qualified-exact-one.json
bun run bang plan examples/tiny-bank/plans/supervised-exact-one.json
bun run bang assemble examples/tiny-bank/assemblies/supervised-exact-one.json
```

All 15 required files matched byte for byte. Run `bun run evidence:m036` to repeat both clean runs.

[`tests/m036-tiny-bank-protected-baseline.json`](../tests/m036-tiny-bank-protected-baseline.json) stores the revisions, commands, paths, and digest pairs. [`scripts/m036-clean-parity.ts`](../scripts/m036-clean-parity.ts) re-observes both runs and verifies that record.

# Evidence statement

M036 can establish these claims:

- the same versioned exact-one theory package applies to the checked Clinic requirement;
- two independent targets execute fresh bounded probes for the Clinic realization;
- each target produces separate evidence with the existing M031 meaning;
- the existing objective selects the qualified Gleam candidate;
- the assembly binds and runs the selected qualified bytes;
- a clean audit preserves the current closure without requalification;
- an external consumer strictly decodes the Clinic record and checks its supplied material custody;
- two clean Clinic runs produce identical bytes;
- candidate TinyBank output equals clean protected-base output byte for byte.

M036 cannot establish these claims:

- Core specifies the state update `available := available - count`;
- booking behavior is correct for a clinical system;
- exact-one execution is distributed or durable;
- delivery is fair, live, productive, or bounded outside the recorded probes;
- the target profile supports multiple fields, operations, parameters, or non-Integer values;
- the result generalizes to a third realization shape or an arbitrary domain;
- M035 consumer validity proves implementation conformance or evidence truth;
- the full compiler candidate is complete.

## Local acceptance observations

The local Phase 3 journey observed this bounded result:

- Checked Core selected `AppointmentBook`, `AppointmentBookState`, `available`, `open(initialAvailable)`, `book(count)`, and `nonnegativeAvailable`.
- Checked Core also selected `ConfirmBooking`, `BookingRejectedOnce`, and `BookAppointmentOnce`.
- Both targets selected those identities and the `Integer` parameter and state shapes.
- The decrement remained target-owned behavior. No Core state-update law was added.
- Effect TypeScript and Gleam/BEAM ran fresh probes and wrote separate qualification evidence.
- Planning selected `gleam-beam` for the existing supervised objective.
- Assembly copied the selected qualified Gleam boundary byte for byte and retained its digest.
- The copied escript ran with an Erlang-only `PATH`. It had no BANG workspace or Gleam compiler.
- Audit inspected 18 materials. It reported 10 unchanged, 8 deferred, 0 changed, and 0 records to retire.
- The clean audit requested zero requalifications.
- The external consumer strictly decoded the Clinic lock and Effect evidence. It verified `core-source` and `generated-effect-boundary` custody.
- Its loader observed only `consumer.mjs`, `publication/types/consumer.js`, `node:crypto`, `node:fs/promises`, and `node:path`.
- All four tracked negative input files ran. The target outcomes were `target/missing-declaration` and `target/unsupported-target`.
- Runtime-mutated negatives returned `target-mismatch`, `identity-mismatch`, `custody/digest-mismatch`, and `decode/decode-failed`.
- A late assembly failure returned `publication/publication-failed` and changed no persistent byte.
- A second clean Clinic sandbox matched all 21 published file digests and all command observations.
- Schema publication major 2 contained six files. All six seeded major-1 files retained their original bytes.
- The clean TinyBank comparison matched 15 of 15 files.
- `just verify` exited zero at clean HEAD `0f68e5d28d130653ba8ecde530096b8d5fdee551`.

That `just verify` run took 649.20 seconds on 2026-08-27. It ran `check`, all completed previews, the full test chain, and `build`.

These are local observations, not protected integration evidence. The unsupported claims above remain unchanged.

# Falsifiers

M036 fails if:

1. Any M031 through M035 success decision depends on a TinyBank semantic identity for the Clinic path.
2. A selection identity overrides a conflicting checked-Core identity.
3. Clinic requires a new Core construct, surface form, theory, obligation, evidence class, provider, target, or CLI verb.
4. Clinic requires a domain-specific branch or a separate Clinic target projection.
5. A target accepts a checked shape outside the frozen profile without `unsupported-target`.
6. Target-owned subtraction is reported as a Core state-update law.
7. Effect evidence supports Gleam, or Gleam evidence supports Effect.
8. Evidence classes, scopes, assumptions, weakenings, lifetime, invalidators, or obligation identities change.
9. Planning changes its objective vocabulary, scores a target, or selects a default without current evidence.
10. Assembly regenerates the selected boundary instead of binding recorded bytes.
11. Audit changes an unaffected record or requalifies a clean closure.
12. The external consumer imports compiler internals or interprets new semantic rules.
13. Strict external decoding becomes weaker.
14. A schema publication overwrites an incompatible prior major.
15. Any clean TinyBank output byte differs from the protected-base output.
16. Repeated clean Clinic runs produce different bytes.
17. A failed command publishes a partial closure.
18. The full compiler candidate is claimed before M036 passes.

# Non-goals

M036 does not provide:

- a full compiler candidate;
- a general service synthesizer;
- a generic plugin or adapter protocol;
- a new checked-Core extension boundary;
- a new Core construct or source form;
- a new theory or theory-package version;
- a new obligation or evidence class;
- a new provider or target;
- a new command or option;
- multiple state fields, operations, realizations, or capability requirements;
- Effect assembly;
- a database, bridge, channel, refinement, or solver journey;
- author-independence evidence;
- an accumulated cross-family report;
- deployment, signing, registry, upload, or attestation;
- production Clinic software;
- M037.

# Size

The mission has these maximum counts:

| Item                                                                     | Count |
| ------------------------------------------------------------------------ | ----: |
| New domain source                                                        |     1 |
| Positive selection files                                                 |     4 |
| Tracked negative input files                                             |     4 |
| State machines                                                           |     1 |
| State fields in the accepted profile                                     |     1 |
| Initializers                                                             |     1 |
| Transitions                                                              |     1 |
| Invariants                                                               |     1 |
| Operation realizations                                                   |     1 |
| Capability requirements                                                  |     1 |
| Fresh qualification targets                                              |     2 |
| Selected plans                                                           |     1 |
| Assembled artifacts                                                      |     1 |
| External consumers exercised                                             |     1 |
| New semantic constructs, theories, providers, evidence classes, or verbs |     0 |

If implementation pressure exceeds one accepted operation shape, revise the contract before implementation continues.

# Acceptance

1. Create the TinyBank baseline from a clean checkout at `f2673c1b74726adcbf6b56a8655d5efee505b1b2`.
2. Run `just install` and `bun run build` in that checkout.
3. Run the canonical TinyBank qualification, planning, and assembly commands.
4. Record the clean baseline paths and digests.
5. Create a separate clean checkout of the M036 candidate with the same dependency lock.
6. Run `just install` and `bun run build` in the candidate checkout.
7. Run the same canonical TinyBank commands and compare all required bytes with the clean baseline.
8. Run `bun run bang classify examples/clinic/realizations/two-qualified-exact-one.json`.
9. Observe two ordered, fresh, independent `Qualified` records for `BookAppointmentOnce`.
10. Run `bun run bang plan examples/clinic/plans/supervised-exact-one.json`.
11. Observe selection of the `gleam-beam` candidate for the existing supervised objective.
12. Run `bun run bang assemble examples/clinic/assemblies/supervised-exact-one.json`.
13. Run `.bang/assemblies/clinic-supervised-exact-one/bin/exact_one` as an escript process.
14. Observe the Clinic realization and `appointment-book-1` in the canonical M031 observation.
15. Run `bun run bang audit clinic-supervised-exact-one`.
16. Observe every record as `valid` and zero requalifications.
17. Generate the public schema publication and record the M035 compatibility decision.
18. Run the M035 consumer outside the BANG workspace with Clinic lock, evidence, and material bytes.
19. Observe `valid` for original bytes and the existing typed rejections for tampered or excess input.
20. Run every negative fixture and observe typed failure with unchanged persistent bytes.
21. Repeat the complete Clinic journey from clean inputs and compare all published bytes.
22. Run the focused M031, M032, M033, M034, M035, target, CLI, and portability checks.
23. Run `just verify`.

Acceptance requires all items. Clinic success without TinyBank parity is a failure.

## Completion status

All 23 acceptance items passed locally before protected integration.

`bun run evidence:m036 --verify-record` validates record structure, revision metadata, lock blobs, commands, and canonical encoding.

The record-only check does not rerun output bytes. Only `bun run evidence:m036` re-observes both clean worktrees and compares all 15 outputs.

[PR 9](https://github.com/phibkro/bang-project/pull/9) rebase-merged M036 at `d2fa7ea4575e6b4e026e369435a21c1d0897d5e6`.

[PR 10](https://github.com/phibkro/bang-project/pull/10) bound parity evidence to that integrated revision. It rebase-merged at `5e45b1242c74c6a5306b0817ddd08814b68292a9`.

The required protected-main `verify` run passed at the final revision. M036 is complete.

M037 activation is a separate contract change.

# Sources

- `AGENTS.md`;
- `BANG-PROJECT-DIRECTION.md`;
- `decisions/0007-modular-propositions-providers-and-realizations.md`;
- `decisions/0010-surface-inference-and-full-compiler-horizon.md`;
- `decisions/0012-semantic-process-architecture-and-reuse-boundary.md`;
- `design-specs/M029-second-domain-theory-portability.md`;
- `design-specs/M030-local-theory-package-consumption.md`;
- `design-specs/M031-two-target-exact-one-qualification.md`;
- `design-specs/M032-objective-relative-realization-planning.md`;
- `design-specs/M033-selected-realization-assembly.md`;
- `design-specs/M034-evidence-invalidation.md`;
- `design-specs/M035-external-extension-boundary.md`;
- `packages/core/src/index.ts`;
- `packages/theories/src/index.ts`;
- `packages/evidence/src/index.ts`;
- `packages/target-effect/src/index.ts`;
- `packages/target-gleam/src/index.ts`;
- `apps/bang/src/classify.ts`;
- `apps/bang/src/plan.ts`;
- `apps/bang/src/assemble.ts`;
- `apps/bang/src/audit.ts`;
- `apps/bang/src/export-schemas.ts`;
- `examples/tiny-bank/account.bang`;
- `examples/tiny-bank/theories/packaged-exact-one.json`;
- `examples/tiny-bank/realizations/two-qualified-exact-one.json`;
- `examples/tiny-bank/plans/supervised-exact-one.json`;
- `examples/tiny-bank/assemblies/supervised-exact-one.json`.
