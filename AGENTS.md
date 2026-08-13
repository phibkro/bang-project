# BANG project instructions

Read in this order before changing the project:

1. `BANG-PROJECT-DIRECTION.md`
2. the single active contract under `design-specs/`
3. `references/prior-attempts.md` only when historical context is relevant

Effect v4 is the primary BANG compiler implementation language; TypeScript is its substrate. Use the official sibling repository `../effect` as the primary source. Start with `../effect/LLMS.md`, then follow its links into source and reference guides. See `docs/effect-development.md` for local routing; never let copied or remembered Effect guidance outrank the official checkout.

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
- Use Schema for encoded/public/domain boundaries and named staged transformations. Keep decoded, checked, and normalized Core phases explicit.
- Make reasoning providers and target adapters consume checked or normalized Core, not arbitrary decoded declarations.
- Treat Effect as the application language and standard library. Search `../effect` core, platform, and unstable modules before defining a project abstraction; reuse native services such as FileSystem, Path, ChildProcessSpawner, and platform Runtime/Services Layers when they already express the capability.
- Keep portable programs open over Services, confine concrete runtime and vendor imports to Layer implementations, and select Layers plus execute the runtime only at composition roots. A project Service must add a domain contract or policy; a total dependency-free leaf remains a direct function.
- Effect, TypeScript, solvers, and targets implement or evaluate Core; none defines Core semantics.
- Research needs an activation condition tied to a mission blocker.

Run `just verify` before claiming the active mission is complete.
