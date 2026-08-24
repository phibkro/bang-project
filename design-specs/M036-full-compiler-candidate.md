---
id: M036
title: Full compiler candidate
status: active
timebox: 3 focused sessions
vision_claims:
  - clean-checkout-candidate
  - author-independent-domain
  - six-family-composition
  - honest-unsupported-reporting
depends_on:
  - M017
  - M021
  - M026
  - M030
  - M031
  - M032
  - M033
  - M034
  - M035
---

# Mission

BANG demonstrates the full compiler candidate node on one fresh domain.

[Decision 0010](../decisions/0010-surface-inference-and-full-compiler-horizon.md) defines the node:

> A full compiler candidate demonstrates this complete path from a clean checkout:
>
> ```text
> small BANG project
>   -> parsed source and libraries
>   -> checked and normalized Core
>   -> derived theories and obligations
>   -> selected realization plan
>   -> target artifacts
>   -> functioning implementation
>   -> conformance execution
>   -> qualified evidence report
> ```
>
> The candidate also provides a versioned Core boundary and one external extension. It reports unsupported properties and does not claim universal synthesis.

M036 composes existing capability only. The fresh domain is a clinic appointment booking system under `examples/clinic/`. It is authored from the published documentation alone, carried through the shipped normalization, explanation, qualification, planning, assembly, and audit journeys, and handed to the M035 external consumer. The accumulated report preserves every evidence distinction and names at least one property as unsupported.

# User claim

> Starting from a fresh clone and the published documentation alone, I can author one small clinic domain, run it through the shipped commands to one assembled artifact and a valid audit, hand the published artifacts to an external consumer, and receive one accumulated report that tells me what is warranted and what remains unsupported.

# Primary uncertainty

Three capabilities have never been tested together:

1. **Author independence.** A contributor can author a complete domain strictly from README and docs without reading compiler source, using only documented surface and selection formats.
2. **Six-family composition pressure.** One domain can exercise refined data algebra, coalgebraic transition behavior, logic laws with provider evidence, graded quantity, two-owner concurrency splitting, and capability authority at once.
3. **Clean-checkout integrity.** The complete path runs from a fresh clone through documented commands only, with deterministic bytes.

Any failed hypothesis produces a typed gap report or a falsifier. Neither hypothesis may be repaired by an undocumented compiler change inside this mission.

# Stable boundary

M036 composes the capability that M017, M021, M026, M030, M031, M032, M033, M034, and M035 shipped. It may not change it.

- No new Core construct, surface form, theory, obligation kind, evidence class, or provider. The semantic privilege rule in `BANG-PROJECT-DIRECTION.md` governs: nothing in this mission makes a construct normative.
- No new verb. The shipped verbs are `check`, `report`, `trace`, `normalize`, `explain`, `project`, `database`, `evolve`, `classify`, `plan`, `assemble`, and `audit`.
- No producer behavior change. Every `packages/` and `apps/` producer behaves exactly as M034 left it. If implementation pressure demands a producer change, this design-spec is revised explicitly before that change; an unrevised change falsifies the mission.
- TinyBank and Inventory outputs remain byte-identical. Existing journeys keep their published behavior.
- One selected realization path. The candidate follows `classify` → `plan` → `assemble` (one Gleam/BEAM escript) → `audit`. The M026 database journey stays exercised by its own missions; no Effect-side assembly is produced.
- The M035 external-extension boundary lands before M036 activates. It supplies the external-consumer acceptance item; decision 0010's checked-Core extension boundary defines its shape: one external consumer reads a versioned checked or normalized Core value, one provider returns a typed result, and neither imports compiler internals.

## Third domain

The third domain is clinic appointment booking. Inventory already owns warehouse reservation, so the clinic is genuinely new domain pressure.

```text
AppointmentBook
  state: bookedSlots, freeSlots
  initializer: initialize(bookedSlots, freeSlots)
    requires bookedSlots >= 0, freeSlots >= 0
  transitions: book(count), cancel(count)
    book   requires count >= 1 and freeSlots >= count
    cancel requires count >= 1 and bookedSlots >= count
  invariants: nonnegativeBooked, nonnegativeFree

ConfirmBooking capability
  BookAppointment      requires ConfirmBooking unbounded
                       when disabled fail BookingRejected
  BookAppointmentOnce  requires ConfirmBooking exactly 1
                       when disabled fail BookingRejectedOnce

SlotCount refinement    { self : Integer | self >= 0 }
SlotArithmetic theory   commutative slot-count addition over a finite model
BookLedger bridge       AppointmentRecord and ClinicLedger participants share
                        SlotCount; law bookedAgree
cancelPreservesCapacity bookedBefore + freeBefore = bookedAfter + freeAfter
                        under cancel, with bounded variables and lawful and
                        faulty variants

FrontDesk/Clinician     two-owner protocol: offer, confirm, acknowledgement
channel                 with causal parents, under ordered, duplicated,
                        reordered, and dropped delivery schedules
```

The domain layout mirrors TinyBank and Inventory:

```text
examples/clinic/
  clinic.bang
  core/slot-count.json
  core/slot-arithmetic.json
  core/book-ledger-bridge.json
  theories/packaged-confirm-once.json
  channels/frontdesk-clinician.json
  normalization/unrelated-realization-change.json
  realizations/two-qualified-book-once.json
  plans/supervised-book-once.json
  assemblies/supervised-book-once.json
  authoring-log.json
```

Key identities:

- the exact-one requirement address is `operationRealization:BookAppointmentOnce.requirement:ConfirmBooking`;
- the packaged theory is `ExactOneCapabilityExecution` version 1 at the existing canonical package path and semantic digest;
- the planning selection carries the same three demand families as M032 — `runtime-model = supervised-actor`, `restart = supervised-restart`, `grant-restart = invalidated-on-restart`;
- the plan and assembly identity is `clinic-supervised-book-once`.

# User journey

1. Clone the repository fresh. Run `just install`.
2. `bang normalize examples/clinic/normalization/unrelated-realization-change.json` — the clinic baseline against a changed unrelated realization; the report ends `Clean parity: match`.
3. `bang trace examples/clinic/channels/frontdesk-clinician.json` — six schedules report `Satisfied`, `Violated`, or `Unresolved` with logical-message, delivery-attempt, causality, and coordination distinctions intact.
4. `bang explain examples/clinic/theories/packaged-confirm-once.json` — the packaged exact-one theory is `Applicable` with four satisfied premises and four obligations carrying the same identities as TinyBank and Inventory; the deterministic lock is written.
5. `bang classify examples/clinic/realizations/two-qualified-book-once.json` — fresh Effect TypeScript and supervised Gleam/BEAM probes execute the clinic requirement; two independent `Qualified` evidence records publish.
6. `bang plan examples/clinic/plans/supervised-book-once.json` — the supervised objective selects the Gleam/BEAM candidate.
7. `bang assemble examples/clinic/assemblies/supervised-book-once.json` — one escript binds the qualified boundary by digest and runs once as a separate process; the published artifact then runs through `escript` without BANG or the Gleam compiler.
8. `bang audit clinic-supervised-book-once` — every record `valid`, zero requalifications.
9. The external M035 consumer reads the published clinic semantic artifact and assembly closure through the versioned boundary and returns one typed result without importing compiler internals.
10. The accumulated report composes the clinic journey outputs with preserved evidence classes, scopes, assumptions, weakenings, and invalidators, and classifies at least one property `unsupported`.

Every step uses a documented command. No step depends on hidden state from an earlier run beyond the publications the shipped commands themselves produce.

# Author-independence protocol

The authoring session proves that documentation suffices.

Allowed inputs:

- `README.md`, `BANG-PROJECT-DIRECTION.md`, `CAPABILITIES.md`;
- `docs/**`, `decisions/**`, `design-specs/**`;
- `examples/**` as fixture-data references for selection formats.

Forbidden inputs:

- `packages/**` and `apps/**` source trees;
- `dist/**`, `generated/**`, and other build output.

Enforcement and evidence:

1. The authoring session records every repository path it opens in `examples/clinic/authoring-log.json` — path and the documented section it came from. The log is strict JSON; unknown fields fail.
2. One mission-local checker validates the log. A forbidden-prefix path fails with typed `forbidden-input`. A missing or malformed log fails with typed `log-invalid` before any journey evidence counts.
3. Git history is the mechanical backstop: every authoring-window commit touches only `examples/clinic/**`. Any implementation-tree edit in the window falsifies the mission.
4. The log is `assumed-truthful` under the same producer-trust model as M015 evidence. The commit-scope check bounds that assumption; neither check proves the author saw nothing else.

Gap discipline: when an authored fact finds no documented expression, the author records a typed gap report — subject, attempted declaration, documented capability relied upon, observed failure — instead of reading compiler source for a workaround. Gap reports feed the accumulated report. A silenced or worked-around gap falsifies the mission.

If a gap blocks a downstream journey, the session ends at that station with the typed failure of the owning command. Repairing the blocker requires a revised mission contract, never an undocumented `packages/` edit inside M036.

# Composition matrix

Each of the six families has concrete clinic declarations and a shipped command that exercises it.

| Family                            | Clinic declaration                                                                                                                                     | Existing capability exercised                                 | Exercising command                                      |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- | ------------------------------------------------------- |
| Refined data algebra              | `refinement:SlotCount`; `theory:SlotArithmetic` with commutative addition; representation links into `AppointmentBook` state fields                    | M001 refinement projection; M002 finite model; M003 law suite | `bang normalize`, `bang explain`                        |
| Coalgebraic transition behavior   | `stateMachine:AppointmentBook` transitions `book` and `cancel`; invariants `nonnegativeBooked`, `nonnegativeFree`                                      | M004 invariant preservation; M015 sequential ownership        | compilation inside every clinic command                 |
| Logic laws with provider evidence | `theoryBridge:BookLedger.law:bookedAgree`; normalized `BookLedger.cancelPreservesCapacity` obligation with bounds, timeout, lawful and faulty variants | M005 bridge law; M011 bounded Z3 provider                     | mission-local runner over the existing provider Service |
| Graded quantity                   | `operationRealization:BookAppointmentOnce` requires `ConfirmBooking` exactly 1                                                                         | M018 single-use capability; M022/M030 packaged theory         | `bang explain`, `bang classify`                         |
| Two-owner concurrency splitting   | `frontdesk-clinician` protocol with causal parents and ordered, duplicated, reordered, dropped schedules                                               | M024 bounded two-owner channel trace                          | `bang trace`                                            |
| Capability authority              | `capability:ConfirmBooking`; disabled failures `BookingRejected`, `BookingRejectedOnce`                                                                | M006 effectful capability boundary                            | `bang classify`, `bang assemble`                        |

The provider-evidence row composes existing providers with authored data. It introduces no new provider. If the provider boundary refuses the clinic obligation, the refusal is a typed gap report, not a producer change.

# Typed failures

M036 adds no compiler failure vocabulary. Every clinic command failure surfaces through the existing stage and reason vocabularies of `normalize`, `trace`, `explain`, `classify`, `plan`, `assemble`, and `audit`. CLI failures print no report to standard output and leave persistent bytes unchanged.

M036 adds one mission-local failure class for authoring integrity and gaps:

| Stage        | Reason                      | Meaning                                                                       |
| ------------ | --------------------------- | ----------------------------------------------------------------------------- |
| `authoring`  | `forbidden-input`           | the authoring log records an implementation-tree path                         |
| `authoring`  | `log-invalid`               | the authoring log is missing, malformed, or incomplete for its declared scope |
| `gap-report` | `documented-capability-gap` | an authored fact found no documented expression; recorded, not worked around  |

The checker owns these reasons. It is mission-local tooling and adds no compiler-facing behavior.

# Evidence statement

The accumulated clinic report can establish:

- the complete documented path ran from a clean checkout through install and documented commands only;
- one fresh domain exercised all six families without a Core or producer change;
- identical theory, package, premise, and obligation identities served TinyBank, Inventory, and Clinic;
- fresh two-target qualification, objective-relative planning, assembly, and audit behaved on the clinic realization with preserved evidence classes;
- the external consumer returned one typed result and rejected tampered candidate bytes;
- repeated clean runs produced identical bytes.

The report cannot establish:

- production readiness, security, performance, recovery, or operational suitability;
- author independence beyond the logged session — the log is assumed-truthful;
- Core, theory, or provider soundness, or collision resistance beyond the SHA-256 assumption;
- that composition generalizes to a fourth domain or to unseen declaration shapes;
- durable delivery, distributed exactly-once execution, fairness, liveness, or recovery;
- that a reported unsupported property is false — only that no shipped producer warrants it.

At least these properties appear as `unsupported`:

1. grant restoration — `cancel` restoring a consumed `ConfirmBooking` grant; quantity is not lifetime;
2. durable clinic-message redelivery — the bounded deterministic scheduler is not a network.

# Negative fixtures

1. Authoring gap: a needed fact with no documented expression produces a recorded typed gap report, and no undocumented workaround appears in the domain or the compiler.
2. Unsupported claimed as supported: any report or fixture that labels grant restoration or durable redelivery with an evidence class stronger than `unsupported` fails.
3. Clean-run divergence: a second clean run producing different published bytes fails.
4. Tampered candidate artifact: modified published clinic bytes cause the external consumer to return its typed rejection, and the corresponding audit retires the affected records. Silent acceptance fails.
5. Forbidden authoring input: a log naming a `packages/` or `apps/` path fails integrity checking with `forbidden-input`.
6. Missing authoring log: fails with `log-invalid` before any journey evidence counts.

Fixtures 1 through 4 assert journey or report behavior. Fixtures 5 and 6 are checker failures. Every failing run leaves persistent bytes unchanged.

# Falsifiers

M036 fails if:

1. any `packages/` or `apps/` source edit occurs during the authoring session;
2. any new Core construct, surface form, theory, obligation kind, or evidence class appears;
3. any journey step is exercised only by a demo wrapper and not by focused tests;
4. the clean-checkout run needs a command or input that the published documentation does not describe;
5. the authoring log is absent, incomplete for the session's declared scope, or names a forbidden path;
6. an authoring gap is silenced or worked around instead of reported;
7. a designated unsupported property carries a stronger evidence class anywhere in the accumulated report;
8. any report flattens or upgrades evidence classes, scopes, assumptions, weakenings, or invalidators;
9. repeated clean runs produce different bytes;
10. the external consumer accepts tampered candidate bytes;
11. existing TinyBank or Inventory journey outputs change;
12. the assembled clinic artifact cannot run without BANG or the Gleam compiler;
13. clinic audit retirement or requalification violates M034 invalidation rules.

# Non-goals

M036 does not provide:

- production readiness, performance, security, recovery, or deployment claims;
- new surface syntax or notation;
- a registry, publication, signing, upload, or attestation envelope;
- an Effect-side assembly or a clinic database service; one selected Gleam/BEAM realization is the full target breadth;
- a general authoring-enforcement framework beyond the mission-local checker;
- a fourth domain;
- HTTP, authentication, browsers, schema migration, or concurrency beyond the bounded traces;
- a usable clinical software product; the clinic domain is compiler pressure, not a deliverable application;
- changes to TinyBank or Inventory fixtures or outputs.

# Acceptance

1. From a clean clone, run `just install` and the documented clinic journey; observe success at every step.
2. Run the mission-local checker over `authoring-log.json`; observe no forbidden path and no missing scope.
3. Observe `Clean parity: match` for the clinic normalization journey.
4. Observe the clinic channel schedules with distinct `Satisfied`, `Violated`, and `Unresolved` results and preserved message, attempt, causal, and coordination relations.
5. Observe the packaged exact-one result `Applicable` with four premises and four obligations sharing the TinyBank and Inventory identities.
6. Observe two fresh `Qualified` target evidence records for `BookAppointmentOnce`.
7. Observe the supervised objective selecting the Gleam/BEAM plan.
8. Assemble the escript and run it as a separate process without BANG; observe the observation matching qualification evidence.
9. Observe the clinic audit reporting every record `valid` with zero requalifications.
10. Exercise the external M035 consumer; observe one typed result and the typed rejection of tampered bytes.
11. Compose the accumulated report; observe preserved evidence distinctions and at least one `unsupported` classification.
12. Repeat the clean run and compare all published bytes for equality.
13. Exercise every negative fixture; observe typed failures with unchanged bytes.
14. Run focused tests covering every exercised journey step.
15. Run `just verify`.

# Sources

- `BANG-PROJECT-DIRECTION.md`;
- `decisions/0006-semantic-tower-and-composition-frontier.md`;
- `decisions/0010-surface-inference-and-full-compiler-horizon.md`;
- `decisions/0011-semantic-data-service-exploration.md`;
- `README.md`;
- `design-specs/M006-effectful-capability-boundary.md`;
- `design-specs/M011-solver-backed-relational-obligation.md`;
- `design-specs/M015-entity-ownership-and-messages.md`;
- `design-specs/M018-single-use-capability.md`;
- `design-specs/M021-construct-addressed-normalization.md`;
- `design-specs/M024-bounded-channel-trace.md`;
- `design-specs/M029-second-domain-theory-portability.md`;
- `design-specs/M030-local-theory-package-consumption.md`;
- `design-specs/M031-two-target-exact-one-qualification.md`;
- `design-specs/M032-objective-relative-realization-planning.md`;
- `design-specs/M033-selected-realization-assembly.md`;
- `design-specs/M034-evidence-invalidation.md`;
- `design-specs/M035-external-extension-boundary.md` (lands before M036 activates);
- `examples/tiny-bank/account.bang`;
- `examples/tiny-bank/project.json`;
- `examples/tiny-bank/channels/two-owner.json`;
- `examples/inventory/inventory.bang`;
- `examples/inventory/theories/packaged-exact-one.json`.
