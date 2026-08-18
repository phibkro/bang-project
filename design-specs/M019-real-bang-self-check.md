---
id: M019
title: Real BANG self-check
status: complete
timebox: 4 focused sessions
vision_claims:
  - shipped-self-check
  - fresh-conformance-evidence
  - real-compiler-implementation
  - domain-drift-diagnostic
depends_on:
  - M005A
  - M007
  - M014
---

# Mission

BANG can check one real compiler component against one canonical checked Core contract through a shipped command.

The command runs the real `@bang/core` `BridgeTerm` decoder. It produces fresh conformance evidence and does not load prior evidence as its result.

# User claim

> A contributor can run `bang check <selection>` and check one real BANG component without a prepared generated directory or evidence file.

The canonical implementation passes. A deliberately drifted implementation fails with the smallest divergent `BridgeTerm` path.

# User journey

```text
self-check selection
  -> canonical BridgeTerm Core contract
  -> Core decode and semantic checking
  -> recursive data normalization
  -> Effect conformance boundary in a temporary directory
  -> real @bang/core BridgeTerm decoder
  -> deterministic valid and invalid cases
  -> fresh qualified evidence
  -> readable result and process status
```

The positive command is:

```sh
bang check examples/bang-core/self-check/bridge-term.json
```

The command returns status `0`. It reports the checked declaration, implementation binding, evidence class, scope, material inputs, assumptions, and target weakening.

# Negative journey

A second selection uses a deliberately drifted implementation binding.

```sh
bang check examples/bang-core/self-check/bridge-term-drifted.json
```

The command returns a nonzero status. It reports this domain path:

```text
BridgeTerm.Application.arguments[0].Variable.id
```

The command does not report only a TypeScript error, an anonymous Schema path, or a failed process status.

# Difference from M005A

M005A proved that one script-backed generated kit can check the `BridgeTerm` decoder. Its preparation script produced the kit before the conformance suite ran.

M019 moves the same real boundary into the shipped product path. The command performs generation, implementation evaluation, and evidence production in one execution.

M019 does not replace the bootstrap compiler. It checks one part of that compiler through an independently derived boundary.

# Input contract

The selection identifies:

- one canonical Core path.
- one data declaration identity.
- one supported target profile.
- one implementation binding identity.
- one evidence policy with a fixed seed and case count.

The selection does not contain an evidence path. The command produces the evidence for the current execution.

The application composition root supplies the supported implementation bindings. Each binding supplies its function and material source paths.

M019 does not load arbitrary code paths from an untrusted selection. The evidence hashes the current bytes of each material source.

The canonical Core document remains the semantic source. The selection does not copy the `BridgeTerm` shape.

# Command contract

A successful command:

- reads all semantic inputs from the selection.
- creates generated artifacts only in a disposable temporary directory.
- runs the real implementation.
- writes one readable report to standard output.
- writes no report or generated source into the repository.
- returns status `0`.
- produces identical report bytes for identical material inputs.

A failed command:

- writes one readable diagnostic to standard error.
- returns a nonzero status.
- writes no successful report.
- retains the declaration and implementation identities.
- retains the minimized domain path.
- classifies input, generation, implementation, and conformance failures separately.

# Evidence contract

The command produces `property-tested` evidence for the bounded corpus. It does not claim exhaustive or proven decoder equivalence.

The evidence records:

- the declaration identity.
- the implementation binding identity.
- the target profile.
- the seed and case count.
- the shrink path for a failure.
- the maximum observed recursive depth.
- source, generated boundary, implementation source, adapter, and evaluator digests.
- provider and target versions.
- assumptions, target weakening, lifetime, and invalidators.

Each run computes the material closure from current bytes. No prior evidence record can make a changed implementation pass.

# Semantic and application boundaries

Checked Core owns the recursive `BridgeTerm` meaning and stable declaration identities.

`@bang/target-effect` owns the generated Effect representation and conformance port.

`@bang/core` owns the independent decoder implementation.

`apps/bang` owns command parsing, selection loading, temporary artifact custody, dependency composition, and process status.

`@bang/evidence` owns the qualified evidence record and readable classification.

No layer can redefine the recursive data contract.

# Falsifiers

The mission fails for these observations:

1. The command reads a prepared evidence file as the current result.
2. The command requires a prepared generated directory.
3. The conformance path copies the production decoder.
4. The positive command does not call the real `@bang/core` decoder.
5. A changed implementation passes because prior evidence remains valid.
6. The drifted implementation returns status `0`.
7. The negative diagnostic loses the recursive domain path.
8. Generated artifacts remain in the repository after the command exits.
9. Identical material inputs produce different report bytes.
10. The report calls bounded property evidence exhaustive or proven.

# Acceptance path

1. Start from a clean checkout that has no generated M019 artifacts.
2. Run the positive command.
3. Observe the real implementation call and status `0`.
4. Run the positive command again and compare the report bytes.
5. Run the drifted selection.
6. Observe the minimized domain path and nonzero status.
7. Run a fixture whose implementation material differs by one byte.
8. Observe a new material digest.
9. Check that no generated output remains in the repository.
10. Run `just verify`.

# Demonstrated claims

M019 can demonstrate only these claims:

- one shipped command checks one real BANG compiler component.
- the command produces fresh bounded conformance evidence.
- the canonical Core contract remains the semantic source.
- the real implementation stays independent from the generated boundary.
- one recursive drift produces a minimized domain diagnostic.
- material changes invalidate the current evidence result.
- identical material inputs produce deterministic report bytes.

# Unsupported claims

M019 does not demonstrate:

- self-hosting.
- full compiler conformance.
- universal decoder equivalence.
- a stable public plugin API.
- arbitrary implementation loading.
- incremental compilation.
- distributed execution.
- implementation synthesis.
- target equivalence.
- Core soundness.

# Non-goals

- no new Core primitive.
- no new proposition family.
- no general project format.
- no global provider or implementation registry.
- no daemon, watch mode, or remote execution.
- no checked-Core public compatibility promise.
- no replacement of the hand-written `@bang/core` decoder.
- no prepared evidence committed for the command result.

# Primary uncertainty

Can one shipped command produce fresh evidence against a real BANG implementation without copying semantics or hiding the bootstrap boundary?

# Sources

- `BANG-PROJECT-DIRECTION.md`.
- `CAPABILITIES.md`.
- `decisions/0007-modular-propositions-providers-and-realizations.md`.
- `decisions/0010-surface-inference-and-full-compiler-horizon.md`.
- `design-specs/M005A-first-core-dogfood.md`.
- `design-specs/M014-cohesive-system-cli.md`.
