import { mkdir, rm } from "node:fs/promises";
import { dirname } from "node:path";
import type { TheoryDeclaration } from "@bang/core";
import { CoreDocumentFromJson, validateCore } from "@bang/core";
import { projectEffectPropertySuite } from "@bang/target-effect";
import { Effect, Schema } from "effect";

const fixture = "examples/tiny-bank/core/integer-addition.json";
const generatedPath = "generated/effect/IntegerAdditionProperties.ts";
const snapshotPath = "tests/snapshots/M003-IntegerAdditionProperties.ts";

const document = Schema.decodeSync(CoreDocumentFromJson)(await Bun.file(fixture).text());
const validated = Effect.runSync(validateCore(document));
const theory = validated.declarations.find(
  (declaration): declaration is TheoryDeclaration =>
    declaration.kind === "theory" && declaration.id === "IntegerAddition",
);
if (theory === undefined) throw new Error("IntegerAddition fixture declared no theory");

const generated = projectEffectPropertySuite(theory);
const snapshot = await Bun.file(snapshotPath).text();
if (generated !== snapshot)
  throw new Error(`generated property suite differs from ${snapshotPath}`);

await rm(generatedPath, { force: true });
await mkdir(dirname(generatedPath), { recursive: true });
await Bun.write(generatedPath, generated);
