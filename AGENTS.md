# BANG project instructions

Read in this order before changing the project:

1. `BANG-PROJECT-DIRECTION.md`
2. the single active contract under `design-specs/`
3. `references/prior-attempts.md` only when historical context is relevant

For Effect code, use the official sibling repository `../effect` as the primary source. Start with `../effect/LLMS.md`, then follow its links into source and reference guides. See `docs/effect-development.md` for local routing; never let copied or remembered Effect guidance outrank the official checkout.

The active design-spec freezes the observable problem. Implementation may vary beneath that boundary. If implementation pressure changes the contract, revise the design-spec explicitly before continuing.

## Authority

1. The future formal Core specification controls normative language semantics.
2. `BANG-PROJECT-DIRECTION.md` controls product scope and delivery.
3. The active design-spec controls the current mission.
4. Tests and evidence report observations; they do not silently redefine semantics.
5. Prior attempts and research notes are references, never implicit authority.

## Work rules

- Keep exactly one active mission.
- Carry each mission through input, Core, validation, projection, implementation, and honestly classified evidence.
- Do not add a Core construct without a current mission, precise judgment, and positive and negative fixtures.
- Keep generated artifacts disposable and deterministic.
- Preserve stable declaration identities through diagnostics, projections, and evidence.
- Record unsupported claims and assumptions instead of treating a green build as proof.
- Effect, TypeScript, solvers, and targets implement or evaluate Core; none defines Core semantics.
- Research needs an activation condition tied to a mission blocker.

Run `just verify` before claiming the active mission is complete.
