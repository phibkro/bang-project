import { rm } from "node:fs/promises";

const targets = [
  ["packages/core/src/index.ts", "dist/core"],
  ["packages/target-effect/src/index.ts", "dist/target-effect"],
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

console.log("Built @bang/core and @bang/target-effect under dist/.");
