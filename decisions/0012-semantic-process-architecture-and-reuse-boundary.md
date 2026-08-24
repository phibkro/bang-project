# 0012 — Semantic process architecture and reuse boundary

- **Status:** accepted
- **Date:** 2026-08-16
- **Scope:** process architecture after M028
- **Extends:** decisions 0007, 0010, and 0011

## Decision

BANG owns semantic meaning, translation correspondence, realization planning, and evidence qualification.

BANG reuses existing systems for transport, search, proof checking, model checking, compilation, execution, storage, and artifact distribution.

A custom adapter connects each reused system to a typed BANG boundary. The adapter records the exact translation, configuration, assumptions, materials, and result scope.

This rule keeps the semantic compiler small. It also keeps external tools replaceable without making their logic or runtime authoritative for Core.

## Process model

The compiler is a braided process graph. It is not one sequential pipeline.

```text
one shared semantic prefix
          |
          +-- target projections
          +-- evidence providers
          +-- implementation production
          +-- runtime observation
                    |
                    v
        one qualification boundary
```

The following labels classify each process:

```text
[BANG]    BANG owns the semantic process
[ADAPTER] BANG owns an adapter around an external system
[REUSE]   an existing system supplies the mechanism
```

An immutable semantic artifact can feed multiple independent processes. An exact-use capability or owned mutable resource cannot be copied implicitly.

Evidence classes also remain separate. A proof, bounded model check, runtime trace, test, benchmark, and assumption do not become one Boolean result.

## User inputs

A project can contain these user-controlled inputs:

- domain modules.
- custom theory modules.
- reusable theory requirements.
- project roots and selected interfaces.
- target and environment profiles.
- capability, quantity, lifetime, and resource declarations.
- persistence and publication choices.
- realization objectives.
- evidence policy.
- independent implementation modules.

The project configuration states each choice that BANG cannot derive. BANG does not infer one choice when several choices remain valid.

## Acquisition and elaboration

```text
theory requirement
      |
      v
[BANG semantic resolution]
      |
      v
[REUSE registry transport and content store]
      |
      v
[BANG package validation and theory linking] ---------+
                                                       |
domain source -> [REUSE parser runtime] -> syntax ----+
                         |                             |
                         +-- BANG owns the grammar     v
project configuration ----------------------> [BANG elaboration]
                                                       |
                                                       v
                                                 decoded Core
                                                       |
                                                       v
                                               [BANG Core check]
                                                       |
                                 +---------------------+------------------+
                                 v                                        v
                            checked Core                         typed diagnostics
```

BANG owns the following parts:

- the project configuration schema.
- package identity and semantic version rules.
- the BANG grammar.
- surface elaboration and Core lowering.
- name and relation resolution.
- Core judgments and rejection rules.
- source spans and semantic provenance.

BANG can reuse the following parts:

- incremental parser runtimes.
- registry servers and download clients.
- content-addressed byte stores.
- hash and signature implementations.
- archive and compression formats.

A registry digest identifies bytes. It does not establish theory compatibility or semantic equivalence.

## Normalization and derivation

```text
checked Core
     |
     v
[BANG normalization]
     |
     +-- stable construct addresses
     +-- semantic fingerprints
     +-- typed dependency edges
     +-- material provenance
     +-- canonical semantic digest
     |
     v
normalized semantic graph
     |
     +-------------------------------+
     v                               v
[BANG theory application]     [BANG change comparison]
     |                               |
     +-- satisfied premises          +-- changed constructs
     +-- failed premises             +-- affected closure
     +-- derived claims              +-- reusable closure
     +-- obligations                 +-- clean-run parity
```

These processes remain BANG-owned. A graph engine, rule engine, or solver can execute a derived search problem.

The external engine does not define these meanings:

- theory applicability.
- dependency.
- refinement.
- representation.
- stable identity.
- provenance.
- clean-run parity.

## Reusable theory modes

BANG supports three distinct theory modes.

### BANG-native theory package

A BANG-native package directly participates in BANG semantics. It contains these semantic parts:

- identity, version, and semantic digest.
- signature and parameters.
- premises and derivation rules.
- obligation schemas.
- satisfaction meaning.
- stable identities for derived results.
- relations to other theories.
- provenance and optional provider mappings.

The package transport remains separate from the package meaning.

### External library as provider support

This mode is the preferred initial role for Lean and mathlib.

```text
BANG obligation O -----------------------------+
                                                v
                                      [ADAPTER Lean projection]
                                                |
mathlib definitions and lemmas ----------------+
                                                v
                                          Lean theorem O-L
                                                |
                                                v
                                        [REUSE Lean kernel]
                                                |
                                                v
                                      checked Lean result
                                                |
                                                v
                                     [BANG qualification]
```

BANG owns the correspondence between `O` and `O-L`. Lean checks the formal Lean statement.

The evidence record includes imported axioms and declarations. The record also includes all source and proof digests.

A Lean proof does not establish implementation conformance unless a separate relation connects the proof to the implementation.

### Imported external institution

An external formalism can supply a proposition family that BANG cannot state.

This mode requires an explicit typed translation. The translation records these parts:

- signature mapping.
- sentence translation.
- model translation.
- satisfaction-preservation claim.
- unsupported constructs.
- assumptions and weakening.
- identity and provenance.

This mode expands the semantic boundary. A mission must state why the external logic supplies required meaning.

## Realization planning

Derived claims constrain a set of admissible implementations. They do not select one implementation automatically.

```text
derived claims and obligations -----------+
target profiles --------------------------+
environment facts ------------------------+
resource and capability constraints ------+
user objective ---------------------------+
                                          v
                              [BANG realization planner]
                                          |
                    +---------------------+--------------------+
                    v                     v                    v
                 no plan             one plan          incomparable plans
                 + reason            + premises        + trade-offs
```

BANG owns the planning vocabulary, constraints, objectives, and explanations.

An SMT or constraint solver can search the encoded plan space. BANG checks each returned model against the canonical planning judgment.

## Parallel realization and evidence

```text
                                  selected plan
                                       |
        +------------------------------+-----------------------------+
        v                              v                             v
[ADAPTER target projection]   [BANG obligation routing]   [BANG implementation graph]
        |                              |                             |
        v                         +----+----+                        v
 target-specific IR              v         v                 human, agent, or
        |                   provider A  provider B             code generator
        v                       |           |                         |
[REUSE host printer]            v           v                         v
        |                  native input native input          [REUSE host build]
        v                       |           |                         |
 generated boundary            v           v                         v
                          [REUSE checker or solver]          executable artifact
                                  |           |
                                  v           v
                             raw provider results
                                  |
                                  v
                       [ADAPTER decode and replay]
                                  |
                                  v
                         typed evidence records
```

BANG target adapters own these parts:

- Core-to-target representation mappings.
- target capability checks.
- generated conformance boundaries.
- target assumptions and weakening.
- source-to-artifact traceability.

BANG reuses host compilers, printers, formatters, databases, and runtimes.

Generated code has no semantic privilege. Generated code and independent code use the same conformance boundary.

## Evidence provider boundary

Each provider uses two BANG adapters:

```text
normalized BANG obligation
          |
          v
[ADAPTER semantic encoding]
          |
          v
[REUSE external reasoning engine]
          |
          v
[ADAPTER result decode and witness replay]
          |
          v
typed and scoped BANG evidence
```

A provider request contains these fields:

- obligation identity and canonical statement digest.
- source encoding identity and digest.
- provider and toolchain identities.
- exact invocation and configuration.
- bounds, horizons, finite domains, and fuel.
- assumptions and imported axioms.
- material inputs and expected output kinds.

A provider result contains these fields:

- status.
- raw output artifact.
- model, trace, counterexample, core, or certificate.
- replay checker and replay status.
- trust boundary.
- evidence class and scope.
- provenance, lifetime, and invalidators.

BANG classifies `sat`, `unsat`, `unknown`, bounded success, a found counterexample, and a checked proof separately.

## External evidence systems

| System             | Reused capability                                      | BANG-owned adapter work                                                        |
| ------------------ | ------------------------------------------------------ | ------------------------------------------------------------------------------ |
| Lean 4 and mathlib | theorem library, proof terms, kernel checking          | statement mapping, axiom audit, digest custody, correspondence record          |
| Alloy 6            | relational and temporal model finding                  | encoding, exact scopes, result decode, witness replay, bounded classification  |
| TLA+ and TLC       | explicit-state safety and liveness checks              | specification mapping, model configuration, finite-domain record, trace replay |
| Apalache           | symbolic bounded checks and inductive-invariant checks | TLA mapping, bounds, invariant decomposition, ITF trace replay                 |
| Z3 or cvc5         | satisfiability, models, cores, and proof objects       | SMT encoding, option record, model replay, certificate check and trust audit   |
| TLAPS              | TLA+ proof-obligation checking                         | statement correspondence, backend record, obligation and assumption custody    |

No external result directly changes Core semantics.

## Qualification

All realization branches join at one BANG-owned qualification process.

```text
checked Core ------------------------------+
realization plan --------------------------+
target kit --------------------------------+
implementation artifact ------------------+
provider evidence -------------------------+
runtime observations ---------------------+
material digests --------------------------+
                                            v
                              [BANG qualification calculus]
                                            |
                    +-----------------------+----------------------+
                    v                       v                      v
              qualified result         rejected result      unresolved result
              + assumptions            + counterexample     + missing evidence
```

The qualification process decides which claims the collected evidence warrants. It preserves every evidence class, scope, assumption, and invalidator.

A successful tool process is not sufficient evidence by itself.

## Artifact assembly and transport

The BANG bundle can contain these artifacts:

- checked and normalized Core.
- a theory lock and package digests.
- a derivation and dependency graph.
- selected or incomparable realization plans.
- generated conformance kits.
- implementation source or binaries.
- provider requests, raw outputs, and replay results.
- a qualified evidence manifest.
- a canonical accumulated report.

BANG owns each artifact kind and its semantic fields. BANG also owns canonical encoding and semantic digest rules.

BANG can reuse OCI for byte-addressed transport. BANG can reuse in-toto for subject-digest attestation envelopes.

OCI and in-toto do not define BANG predicates, theory compatibility, or evidence acceptance.

## Runtime observation

```text
qualified bundle
      |
      v
operator-selected composition
      |
      v
[REUSE database, runtime, and infrastructure]
      |
      v
running implementation
      |
      v
[ADAPTER semantic observation]
      |
      v
runtime evidence
      |
      v
[BANG qualification update]
```

BANG can reuse logs, traces, metrics, and OpenTelemetry transport. A semantic adapter maps each observation to a Core operation, law, protocol event, or obligation.

Deployment remains an operator-authorized effect. Compilation does not grant deployment authority.

## Incremental evolution

```text
old normalized graph ----+
new normalized graph ----+
                          v
                 [BANG semantic comparison]
                          |
              +-----------+-----------+
              v                       v
       reusable closure        invalidated closure
              |                       |
              |                       v
              |             rerun affected processes
              +-----------+-----------+
                          v
                 clean-run parity check
                          |
                          v
                 new qualified bundle
```

BANG owns semantic invalidation. A build system or content store can execute and cache the resulting work graph.

Build-system dependencies do not become semantic dependencies.

## Implementation boundary

BANG must build these processes:

- project and theory semantics.
- elaboration and Core checking.
- normalization and dependency closure.
- theory composition and application.
- realization planning semantics.
- provider and target correspondence adapters.
- witness replay and evidence classification.
- qualification and invalidation.
- canonical artifact and evidence schemas.

BANG must reuse established systems for these mechanisms:

- parser tree maintenance.
- artifact transport and byte caching.
- SAT, SMT, model checking, and proof checking.
- host code printing and compilation.
- databases and runtimes.
- build execution and cache storage.
- signing and attestation envelopes.
- language-server transport.
- plugin isolation when third-party plugins require it.

## Effect on future implementation

Future missions extend the semantic graph before they add compiler infrastructure.

A mission must first identify a user-visible claim. The mission then adds only the process boundaries that the claim exercises.

The next generalization pressure is a second domain with one reusable theory package. This journey can expose TinyBank-specific compiler assumptions.

A later mission can add language-neutral theory package transport. It does not require a new registry server.

Objective-relative planning starts when one user journey requires two valid implementation choices. The planner must return one plan or explicit incomparable plans.

A general provider protocol starts when one obligation uses another independent provider. The protocol must preserve provider-specific evidence classes.

Third-party plugin isolation starts when an external provider or target runs untrusted code. Wasm and WASI can supply the runtime mechanism.

A general build engine starts when semantic work exceeds the current direct scheduler. BANG keeps ownership of action identities and invalidation keys.

Continuous evidence starts when one source, theory, target, provider, or implementation change reuses unaffected evidence across a complete user journey.

## Current implementation pressure

M028 proves the process shape for one TinyBank service. Several current boundaries remain mission-specific:

- the project selection has fixed theory, target, channel, and evidence shapes.
- the transfer target names Account, AccountLedger, SQLite, and Effect constructs.
- the evolution journey supports one `reuse-schema` change from version 1 to version 2.
- realization planning is classification, not objective-relative search.
- theory packages do not have a language-neutral resolver.
- provider integration does not use one general external protocol.

These limits identify future mission pressure. They do not authorize horizontal framework work without a user-visible journey.

## Consequences

1. The semantic kernel remains custom and small.
2. External reasoning systems remain replaceable.
3. Provider adapters become load-bearing reviewed components.
4. Evidence records include exact translation and toolchain materials.
5. Theory package meaning remains separate from package transport.
6. Generated implementations receive no semantic privilege.
7. Semantic invalidation drives cache reuse.
8. Operator authority remains explicit for deployment and other external effects.
9. Future missions generalize proven seams instead of creating empty compiler layers.

## Rejected alternatives

BANG does not:

- build a new theorem prover, model checker, solver, database, or package registry.
- treat mathlib declarations as direct BANG domain semantics.
- treat a successful external tool process as qualified evidence.
- use npm, OCI, Bazel, LSP, Protobuf, or WIT semantics as Core semantics.
- flatten proof, model-checking, test, runtime, and assumption evidence.
- let a target adapter define Core meaning.
- infer one realization when several valid plans remain.
- add a universal plugin framework before a mission requires an external extension.
- make deployment an implicit compiler effect.

## Sources

- `BANG-PROJECT-DIRECTION.md`.
- [decision 0007](0007-modular-propositions-providers-and-realizations.md).
- [decision 0010](0010-surface-inference-and-full-compiler-horizon.md).
- [decision 0011](0011-semantic-data-service-exploration.md).
- [Lean elaboration and compilation](https://lean-lang.org/doc/reference/latest/Elaboration-and-Compilation/).
- [Lean proof validation](https://lean-lang.org/doc/reference/latest/ValidatingProofs/).
- [mathlib documentation](https://leanprover-community.github.io/mathlib4_docs/).
- [Alloy 6 documentation](https://alloytools.org/documentation.html).
- [TLA+ tools](https://lamport.azurewebsites.net/tla/tools.html).
- [Apalache bounded model checking](https://apalache-mc.org/docs/apalache/running.html).
- [Apalache ITF trace format](https://apalache-mc.org/docs/adr/015adr-trace.html).
- [Z3 basic commands](https://microsoft.github.io/z3guide/docs/logic/basiccommands/).
- [cvc5 proof objects](https://cvc5.github.io/docs/latest/proofs/proofs.html).
- [Tree-sitter incremental parsing](https://tree-sitter.github.io/tree-sitter/using-parsers/3-advanced-parsing.html).
- [OCI image descriptor](https://github.com/opencontainers/image-spec/blob/v1.1.1/descriptor.md).
- [in-toto Statement v1](https://raw.githubusercontent.com/in-toto/attestation/main/spec/v1/statement.md).
