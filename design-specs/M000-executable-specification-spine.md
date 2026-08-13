---
id: M000
title: Executable specification spine
status: complete
timebox: 4 focused sessions
vision_claims:
  - core-interchange
  - effect-projection
  - structural-evidence
---

# Mission

BANG can decode one Core service declaration, reject an invalid declaration, generate one Effect service port, compile a hand-written implementation, and emit an honestly scoped structural evidence record.

## User journey

From a clean checkout, run:

```text
bun run demo:m000
```

The user sees each semantic station pass and can inspect the generated port and evidence manifest.

## Vertical path

```text
Core JSON service
  → runtime schema decode
  → semantic identity/reference validation
  → deterministic Effect port
  → hand-written implementation
  → TypeScript compilation
  → structural evidence
```

## Inputs and transitions

| Input             | Kind                       | Authority                        | Accepted transition           | Rejection                                    |
| ----------------- | -------------------------- | -------------------------------- | ----------------------------- | -------------------------------------------- |
| Core fixture text | observation                | fixture bytes                    | decode to Core value          | malformed shape/type                         |
| decoded service   | assertion under validation | Core schema + semantic validator | validated declaration         | duplicate identity or unknown type reference |
| validated service | command to target adapter  | Effect projection                | deterministic source artifact | unsupported Core type                        |
| compile result    | test observation           | TypeScript 7 process             | structural evidence record    | nonzero compile result                       |

## Acceptance evidence

- the valid fixture decodes;
- the negative fixture is rejected for an unknown type reference;
- generated source is byte-identical to its reviewed snapshot;
- the hand-written implementation type-checks against the generated port;
- the evidence manifest identifies the declaration, source fixture, target, tool versions, and evidence class;
- `bun run check` passes from a clean checkout in under one minute.

## Evidence scope

`structural-conformance` means only that the implementation satisfies the generated TypeScript port at the checked tool versions. No behavioral law is declared or proven. Target soundness across casts, mutation, or foreign JavaScript is unsupported.

## Technology decisions

| Technology                                  | Disposition        | Reason                                                                                 |
| ------------------------------------------- | ------------------ | -------------------------------------------------------------------------------------- |
| TypeScript 7                                | selected           | host and checker for the first target                                                  |
| Bun                                         | selected           | dependency, script, test, and demo runtime                                             |
| Effect v4 RC                                | selected           | runtime decoding, typed failure, and first target vocabulary                           |
| `@phibkro/oxlint-effect-plugin`             | deferred           | published `0.1.0` exactly reviews Effect `4.0.0-beta.102`, not the selected RC         |
| `effx check`                                | deferred           | adopt after a compatible release passes its packed consumer journey                    |
| Reef foundry profile                        | blocked dependency | current useful foundry exports are uncommitted and cannot be exact remote dependencies |
| parser, solver, laws, package registry, LSP | deferred           | not required by this mission                                                           |

`reef.config.ts` remains the repository composition source. M000 uses its empty committed composition until a suitable foundry revision becomes remotely addressable; product files are project-owned meanwhile.

The Effect plugin was exercised during initial scaffolding and correctly exposed untyped semantic failures. Core was repaired to use a typed Effect error channel, but the plugin is not an authoritative gate while its published exact compatibility contract excludes the selected Effect release.

## Non-goals

- surface syntax;
- theories, models, laws, or solvers;
- general target adapter framework;
- business implementation generation;
- runtime monitors;
- package/build/registry design;
- remote repository publication.

## Primary uncertainty

What is the smallest Core service representation that preserves stable identities and enough type information for a useful Effect port without importing Effect semantics into Core?

## Falsifiers

The mission is not complete if the demo skips its invalid fixture, relies on a pre-existing generated file, accepts an unknown type reference, produces nondeterministic output, cannot compile the independent implementation, or labels compilation as behavioral proof.

## Result

`bun run demo:m000` demonstrates the complete path and `bun run check` adds unit, lint, and formatting observations. The generated port is recreated after deleting prior output and checked byte-for-byte against a reviewed snapshot before the independent implementation compiles.

The evidence remains structural only: no behavioral laws are declared. M000 rejected two tempting unsupported dependencies—an uncommitted Reef foundry export and an Effect plugin release whose exact reviewed runtime predates the selected RC.

The next mission is deliberately not activated here. M001 should begin only after reviewing this Core shape and choosing the next user capability.
