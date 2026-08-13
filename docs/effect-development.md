# Effect development authority

Use the official [Effect repository](https://github.com/Effect-TS/effect) as the authority for Effect APIs and idioms. When the sibling checkout `../effect` exists, read its source and documentation directly instead of relying on model memory or copied guides.

The baseline inspected while establishing this repository was official Effect commit `2e1ddbebd9dd5cf0738ea08b2e832a7c39ae990f`.

## Read by concern

| Concern                          | Official source                                             |
| -------------------------------- | ----------------------------------------------------------- |
| Current coding style and routing | `../effect/LLMS.md`                                         |
| Schema and domain modeling       | `../effect/packages/effect/SCHEMA.md`                       |
| Configuration                    | `../effect/packages/effect/CONFIG.md`                       |
| Services and Layers              | `../effect/ai-docs/src/01_effect/03_services/`              |
| Errors                           | `../effect/ai-docs/src/01_effect/04_errors/`                |
| Resources and Scope              | `../effect/ai-docs/src/01_effect/05_resources/`             |
| Bun entrypoints                  | `../effect/ai-docs/src/01_effect/06_running/10_run-main.ts` |
| Effect tests                     | `../effect/ai-docs/src/09_testing/`                         |

## Current repository rules

- Prefer `Effect.gen` for one computation and named `Effect.fn` for functions returning Effects.
- Model external data and domain validation with Schema rather than manual parsing.
- Use `Schema.TaggedError` for public error contracts.
- Use `Context.Service` and Layers for capabilities.
- Keep reusable Effect programs open over requirements and run them only at composition roots.
- Treat `@effect/tsgo` diagnostics as development evidence, not BANG semantic authority.

Update code and this routing note when the selected Effect version changes materially. Do not copy the official reference guides into this repository.
