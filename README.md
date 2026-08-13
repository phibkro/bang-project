# BANG

BANG specifies software systems as networks of related theories and projects their accumulated contracts into executable conformance boundaries.

The first completed vertical mission is [M000 executable specification spine](design-specs/M000-executable-specification-spine.md). The next mission has not yet been activated.

## Experience the current capability

```sh
bun install --frozen-lockfile
bun run demo:m000
```

The command decodes one Core JSON service, rejects an invalid reference, generates an Effect service port, compiles an independent implementation, and writes a scoped evidence manifest to `.bang/evidence/M000.json`.

Read [BANG-PROJECT-DIRECTION.md](BANG-PROJECT-DIRECTION.md) for the project constitution. The three previous attempts remain external historical references; they are not merged into this repository.

## Repository identity

`bang` is the provisional local repository name. Remote naming and publication are deferred until M000 produces a durable checkpoint worth pushing. The existing `phibkro/bang`, `phibkro/bang-lang`, and `phibkro/semantic-systems` remotes remain attached to earlier attempts.
