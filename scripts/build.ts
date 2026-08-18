import { rm } from "node:fs/promises";

const targets = [
  ["packages/core/src/index.ts", "dist/core"],
  ["packages/surface/src/index.ts", "dist/surface"],
  ["packages/evidence/src/index.ts", "dist/evidence"],
  ["packages/obligations/src/index.ts", "dist/obligations"],
  ["packages/target-effect/src/index.ts", "dist/target-effect"],
  ["packages/target-gleam/src/index.ts", "dist/target-gleam"],
  ["packages/target-rust/src/index.ts", "dist/target-rust"],
  ["packages/theories/src/index.ts", "dist/theories"],
  ["apps/bang/src/main.ts", "dist/bang"],
] as const;

await rm("dist", { recursive: true, force: true });

const results = await Promise.all(
  targets.map(([entrypoint, outdir]) =>
    Bun.build({
      entrypoints: [entrypoint],
      outdir,
      target: "bun",
      format: "esm",
      packages: "external",
      sourcemap: "external",
    }),
  ),
);

for (const result of results) {
  if (result.success) continue;
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

console.log(
  "Built @bang/core, @bang/surface, @bang/evidence, @bang/obligations, @bang/target-effect, @bang/target-gleam, @bang/target-rust, @bang/theories, and the bang CLI under dist/.",
);
