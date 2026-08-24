---
id: M035
title: External extension boundary
status: active
timebox: 1 focused session
vision_claims:
  - versioned-schema-publication
  - out-of-workspace-consumer
  - typed-verdict-without-internals
  - digest-verified-publication
depends_on:
  - M022
  - M030
  - M031
  - M034
---

# Mission

BANG publishes its public semantic interchange as versioned artifacts and proves an external tool author can use them.

One consumer process outside the BANG workspace imports only published JSON Schema documents and generated TypeScript types. It decodes a published M030 theory lock and an M031 target evidence record, verifies their recorded SHA-256 digests against supplied material bytes, and returns one typed verdict.

This mission freezes the Checked-Core extension boundary node: external tools can consume versioned checked or normalized Core; they cannot redefine Core semantics or erase evidence qualifications.

# User claim

> As an external tool author I can consume BANG's published semantic artifacts with only the published schemas — no compiler internals — and receive one typed verdict I can trust.

# Primary uncertainty

Can one process outside the workspace reach one typed verdict over a theory lock and a target evidence record using only published schema documents and generated types — with every failure typed and no silent drift between the published schemas and the producing Schemas?

# Stable boundary

## What ships

`bang export-schemas` publishes one immutable, self-describing schema set:

```text
dist/schemas/<publicationVersion>/
  manifest.json
  schemas/bang-semantic-artifact-1.schema.json
  schemas/bang-theory-lock-1.schema.json
  schemas/bang-target-evidence-1.schema.json
  types/consumer.d.ts
  types/consumer.js
```

The three schema documents cover the existing public interchange artifacts: the M022/M030 semantic artifact (`bangSemanticArtifact: 1`), the M030 theory lock (`bangTheoryLock: 1`), and the M031 target qualification evidence (`bangTargetQualificationEvidence: 1`). Each document is generated from the same live producer Schema the compiler decodes and encodes with, through Effect's JSON Schema document generation. The `types/` entry re-exports only the three decoded types, their strict JSON decoders, and the consumption verdict type. Nothing else under `dist/` is part of the published boundary.

The manifest is strict JSON with no timestamp, machine value, or absolute path:

```json
{
  "bangSchemaPublication": 1,
  "version": 1,
  "documents": [
    {
      "id": "semantic-artifact",
      "format": "bangSemanticArtifact:1",
      "file": "schemas/bang-semantic-artifact-1.schema.json",
      "sha256": "sha256:..."
    },
    {
      "id": "theory-lock",
      "format": "bangTheoryLock:1",
      "file": "schemas/bang-theory-lock-1.schema.json",
      "sha256": "sha256:..."
    },
    {
      "id": "target-evidence",
      "format": "bangTargetQualificationEvidence:1",
      "file": "schemas/bang-target-evidence-1.schema.json",
      "sha256": "sha256:..."
    }
  ],
  "types": { "entry": "types/consumer.js", "sha256": "sha256:..." }
}
```

## Versioning

Two version levels exist, and neither is a workspace package version:

1. Document format tags stay the decode authority. `bangSemanticArtifact: 1`, `bangTheoryLock: 1`, and `bangTargetQualificationEvidence: 1` already identify each document's format; they continue to gate strict decoding exactly as the producers do.
2. The manifest carries one publication-level integer `version`. It names the published set and the directory `dist/schemas/<version>/`. It increments only when the exported schema set changes shape: a document added, removed, or regenerated under a new format tag. Consumers declare the publication versions they support; an unsupported value is a typed rejection, not a best-effort decode.

Reusing workspace package versions was rejected. Every package is `"private": true` at `0.0.0`; none is published to a registry. M030 already rejects letting npm or filesystem package versions define semantic compatibility implicitly. The publication version is caller-declared intent, like the M030 selection's expected identity, version, and digest.

The publication lives under `dist/` because generated output is disposable and reproducible; a clean checkout reproduces it with `bun run build && bun run bang export-schemas`. It is never committed.

## Inputs

The consumer journey exercises one completed M030-plus-M031 closure from the workspace:

- the theory lock at `.bang/theory-locks/tiny-bank-packaged-exact-one.json`;
- the Effect target evidence record at `.bang/qualifications/tiny-bank-two-qualified-exact-one/effect-typescript/evidence.json`;
- the material bytes that evidence record names by path and SHA-256 digest.

M035 adds no Core construct, surface form, theory, obligation, target, provider, planning demand, or evidence class. It changes no M022, M028, M030, M031, M032, M033, or M034 output for unchanged inputs.

# Canonical command

The producer command is:

```sh
bang export-schemas
```

It writes the complete publication for the current publication version in one transaction and prints the publication directory. An existing publication for the same version is replaced atomically. The command follows the one-verb-per-user-journey pattern of `explain`, `classify`, `assemble`, and `audit`.

The consumer invocation is decided as a plain script run in a foreign directory:

```sh
bun run consumer.mjs \
  --publication ./publication \
  --lock inputs/tiny-bank-packaged-exact-one.lock.json \
  --evidence inputs/effect-typescript.evidence.json \
  --materials inputs/materials
```

It prints exactly one JSON verdict object on standard output and exits nonzero unless the verdict is `valid`.

# User journey

The focused test performs these operations:

1. builds the publication with the canonical command;
2. creates one fresh temporary directory outside the workspace;
3. copies the publication directory and the input bytes — lock, evidence record, and the recorded material files under their recorded relative names — into that directory and nothing else;
4. writes the consumer script inside that directory; the script imports only files inside the copied publication plus host built-ins;
5. runs the consumer with its working directory set to the temporary directory;
6. parses one verdict from standard output and observes `valid` with every recorded material verified;
7. repeats the run and observes identical verdict bytes.

The sandbox is the isolation proof. Relative imports reaching toward workspace sources fail because those files do not exist in the temporary directory. The test also asserts the consumer source contains no absolute workspace path.

# Consumer contract rules

The consumer process:

- imports only entries inside the copied publication directory and host built-in modules;
- reads only the paths passed as arguments;
- treats every input as opaque bytes until a published decoder accepts them;
- applies strict excess-property decoding, matching producer behavior;
- recomputes SHA-256 over supplied bytes with the host crypto primitive;
- emits one typed verdict and nothing else.

The consumer process:

- does not import workspace-relative paths such as `packages/*`, `apps/*`, or unbundled `dist/*` entries outside the publication;
- does not read `.bang/` or any workspace state directly; all inputs arrive as passed artifact bytes;
- does not write, move, or delete any input, publication, or other file;
- does not evaluate, interpret, or extend Core semantics; it owns no judgment, lattice, or obligation vocabulary.

# Consumption model

The consumer performs these checks in order, failing fast into a typed verdict:

1. loads the manifest and verifies each recorded file exists and matches its manifest SHA-256 digest;
2. checks the publication version against the supported set declared by the consumer;
3. decodes the theory lock and the evidence record with the published strict decoders; each document's format tag must be one the published decoder supports;
4. recomputes the SHA-256 of every material the evidence record names, against the bytes supplied under the recorded relative path;
5. compares the lock and evidence records for agreement on theory identity, theory version, and package semantic digest;
6. emits `valid` only when every check passes.

The consumer verifies byte custody. It does not recompute the canonical semantic digest of a decoded theory package; that canonicalization stays producer-owned, and the M034 audit remains its internal verifier. The consumer instead checks that the two records agree on the recorded semantic digest, so a package swap that both records did not record cannot pass silently.

# Typed failures

Every rejection is one typed verdict:

| Stage         | Reason                  | Situation                                                         |
| ------------- | ----------------------- | ----------------------------------------------------------------- |
| `publication` | `schema-unavailable`    | the manifest or a recorded schema or types file is missing        |
| `publication` | `version-unsupported`   | publication version or document format tag is not supported       |
| `publication` | `digest-mismatch`       | published file bytes differ from the manifest digest              |
| `decode`      | `decode-failed`         | a strict decoder rejects document bytes                           |
| `custody`     | `material-missing`      | a recorded material has no supplied bytes                         |
| `custody`     | `digest-mismatch`       | a recomputed material digest differs from the recorded digest     |
| `agreement`   | `identity-disagreement` | lock and evidence disagree on theory identity, version, or digest |

A rejected verdict carries the stage, reason, the offending path or identity when available, expected and observed values when available, and one concise message. The verdict is data, not an exception path; the exit code distinguishes `valid` from every rejection.

# Evidence statement

A `valid` verdict can establish:

- the publication files matched the manifest digests;
- the lock and evidence record decoded under the published strict schemas;
- every supplied material byte matched its recorded SHA-256 digest;
- the two records agreed on theory identity, version, and package semantic digest;
- the whole journey used only published schemas and generated types.

It cannot establish:

- that the supplied material bytes are the bytes any producer once wrote; a digest match is custody, not authenticity;
- that the recorded semantic digest is correctly computed over the package; canonicalization stays producer-owned;
- conformance of any implementation, or truth of the qualified obligations;
- anything about closures, formats, or document versions outside the published set;
- deployment readiness, security, performance, or operational suitability.

# Negative fixtures

M035 includes fixtures for:

1. tampered material bytes: one flipped byte in a supplied material with the recorded digest unchanged, returning `custody` `digest-mismatch`;
2. an unsupported publication version in the manifest, returning `publication` `version-unsupported`;
3. a deleted published schema file, returning `publication` `schema-unavailable`;
4. a malformed evidence record — wrong format tag, missing field, wrong field type, or an excess property — returning `decode` `decode-failed`;
5. tampered published schema bytes with the original manifest, returning `publication` `digest-mismatch`;
6. a missing material file, returning `custody` `material-missing`;
7. a consumer script containing a workspace-relative import: the sandbox lacks the target file, the run fails, and the test asserts the consumer source never names the workspace root;
8. a lock and evidence record from different selections, returning `agreement` `identity-disagreement`.

Every failing fixture leaves the publication, the inputs, and the workspace unchanged, and prints no partial verdict.

# Falsifiers

M035 fails if:

1. the consumer completes any run while importing a workspace-relative path or reading workspace state directly;
2. the consumer assigns any meaning beyond "these bytes decode under the published schemas and their recorded digests match" — it upgrades an evidence class, derives an obligation, or treats rejection data as applicability. By construction the consumer owns no semantic vocabulary; a verdict claiming more than custody and decodability is a violation;
3. schema drift between the published version and producer output goes undetected — the publication is regenerated from the live producer Schemas on every export, the manifest pins each document's digest, and a focused fixture rejects publication bytes that no longer match a fresh export;
4. repeated exports of unchanged inputs produce different publication bytes, or a publication contains a timestamp, random value, or absolute path;
5. a failing run prints a partial verdict or mutates any file;
6. distinct failure situations collapse into one boolean or one untyped error;
7. a decoder accepts unknown fields or a foreign document format tag;
8. a `valid` verdict issues while any recorded material is missing or mismatched;
9. any existing M022, M028, M030, M031, M032, M033, or M034 journey output changes.

# Non-goals

M035 does not add:

- a Core construct, surface form, theory, obligation, target, provider, or evidence class;
- a public registry, server, upload, or download protocol; the publication is a local directory;
- an attestation envelope, signature, publisher identity, or trust framework;
- a new surface syntax or source-language change;
- any producer behavior change; `explain`, `classify`, `plan`, `assemble`, `audit`, and the M021-through-M033 outputs stay byte-identical;
- npm publication of workspace packages or registry metadata;
- canonical semantic-digest recomputation in the published surface;
- a plugin API, version-negotiation protocol, or compatibility matrix beyond supported version sets;
- audit integration; M034 keeps its internal recomputation rules.

# Acceptance

1. Run `bun run build && bun run bang export-schemas`; observe one publication under `dist/schemas/<publicationVersion>/` with manifest, three schema documents, and generated types.
2. Run the export twice; observe byte-identical publications.
3. Run the focused external-consumer journey; observe one `valid` verdict from a temporary directory containing only the publication copy and input bytes.
4. Confirm the consumer source imports only publication entries and host built-ins and names no workspace path.
5. Run the tampered-material fixture; observe `custody` `digest-mismatch`.
6. Run the unsupported-version fixture; observe `publication` `version-unsupported`.
7. Run the deleted-schema fixture; observe `publication` `schema-unavailable`.
8. Run the malformed-record fixture; observe `decode` `decode-failed`.
9. Run the tampered-schema, missing-material, foreign-import, and disagreeing-records fixtures; observe the typed rejections above.
10. Confirm every failing run left the publication, inputs, and workspace unchanged.
11. Confirm `git status` shows no tracked file changed by any journey step.
12. Run focused extension-boundary tests.
13. Run `just verify`.

# Sources

- `AGENTS.md`;
- `BANG-PROJECT-DIRECTION.md`;
- `decisions/0007-modular-propositions-providers-and-realizations.md`;
- `decisions/0010-surface-inference-and-full-compiler-horizon.md`;
- `decisions/0012-semantic-process-architecture-and-reuse-boundary.md`;
- `design-specs/M022-versioned-theory-explanation.md`;
- `design-specs/M028-versioned-semantic-evolution.md`;
- `design-specs/M030-local-theory-package-consumption.md`;
- `design-specs/M031-two-target-exact-one-qualification.md`;
- `design-specs/M033-selected-realization-assembly.md`;
- `design-specs/M034-evidence-invalidation.md`;
- `docs/effect-development.md`;
- `scripts/build.ts`;
- `Justfile`;
- `package.json`;
- `packages/core/package.json`;
- `packages/theories/package.json`;
- `apps/bang/package.json`;
- `apps/bang/src/command.ts`;
- `tests/m034-audit.test.ts`;
- `../effect/packages/effect/src/JsonSchema.ts`;
- `../effect/packages/effect/SCHEMA.md`.
