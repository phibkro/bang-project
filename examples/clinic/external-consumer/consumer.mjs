import { verifyBangConsumption } from "./publication/types/consumer.js";

const verdict = await verifyBangConsumption({
  manifestPath: "publication/manifest.json",
  lockPath: "inputs/clinic.lock.json",
  evidencePath: "inputs/effect-typescript.evidence.json",
  materialsDirectory: "inputs/materials",
});
process.stdout.write(JSON.stringify(verdict));
if (verdict.verdict !== "valid") process.exitCode = 1;
