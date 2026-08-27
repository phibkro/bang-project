import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { BunServices } from "@effect/platform-bun";
import { describe, expect, test } from "bun:test";
import type { FileSystem, Path } from "effect";
import { Crypto, Effect } from "effect";

import { generateSchemaPublication, runExportSchemas } from "../apps/bang/src/export-schemas.ts";

const root = resolve(import.meta.dir, "..");
const publicationRoot = join(root, "dist", "schemas", "2");

const testCrypto = Crypto.make({
  randomBytes: (size) => new Uint8Array(size),
  digest: (_algorithm, data) =>
    Effect.promise(() => crypto.subtle.digest("SHA-256", Uint8Array.from(data).buffer)).pipe(
      Effect.map((hash) => new Uint8Array(hash)),
    ),
});

const provideServices = <A, E>(
  effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path | Crypto.Crypto>,
) =>
  // @effect-diagnostics-next-line strictEffectProvide:off
  Effect.provide(effect, BunServices.layer).pipe(Effect.provideService(Crypto.Crypto, testCrypto));

const expectedFiles = [
  "manifest.json",
  "schemas/bang-semantic-artifact-1.schema.json",
  "schemas/bang-theory-lock-1.schema.json",
  "schemas/bang-target-evidence-1.schema.json",
  "types/consumer.d.ts",
  "types/consumer.js",
] as const;

interface Manifest {
  readonly bangSchemaPublication: number;
  readonly version: number;
  readonly documents: ReadonlyArray<{
    readonly id: string;
    readonly format: string;
    readonly file: string;
    readonly sha256: string;
  }>;
  readonly types: { readonly entry: string; readonly sha256: string };
}

describe("M035 schema publication", () => {
  test("exports a complete publication and prints only its directory", async () => {
    await rm(publicationRoot, { recursive: true, force: true });
    const child = Bun.spawn([join(root, "node_modules/.bin/bang"), "export-schemas"], {
      cwd: root,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [exitCode, stdout] = await Promise.all([child.exited, new Response(child.stdout).text()]);
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe("dist/schemas/2");
    await Promise.all(
      expectedFiles.map(async (relativePath) => {
        const bytes = await readFile(join(publicationRoot, relativePath));
        expect(bytes.byteLength).toBeGreaterThan(0);
      }),
    );
  }, 120_000);

  test("repeated exports are byte-identical", async () => {
    const first = await Effect.runPromise(provideServices(runExportSchemas(root)));
    expect(first).toBe("dist/schemas/2");
    const digestsOf = async (): Promise<Record<string, string>> => {
      const entries: Record<string, string> = {};
      await Promise.all(
        expectedFiles.map(async (relativePath) => {
          const bytes = await readFile(join(root, "dist/schemas/2", relativePath));
          entries[relativePath] = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
        }),
      );
      return entries;
    };
    const before = await digestsOf();
    const second = await Effect.runPromise(provideServices(runExportSchemas(root)));
    expect(second).toBe("dist/schemas/2");
    expect(await digestsOf()).toEqual(before);
  }, 120_000);

  test("manifest digests match published file contents", async () => {
    const manifestBytes = await readFile(join(publicationRoot, "manifest.json"));
    const manifestText = new TextDecoder().decode(manifestBytes);
    const manifest = JSON.parse(manifestText) as Manifest;
    expect(manifest.bangSchemaPublication).toBe(1);
    expect(manifest.version).toBe(2);
    expect(manifest.documents.map((document) => document.id)).toEqual([
      "semantic-artifact",
      "theory-lock",
      "target-evidence",
    ]);
    expect(manifest.documents.map((document) => document.format)).toEqual([
      "bangSemanticArtifact:1",
      "bangTheoryLock:1",
      "bangTargetQualificationEvidence:1",
    ]);
    await Promise.all(
      manifest.documents.map(async (document) => {
        const bytes = await readFile(join(publicationRoot, document.file));
        const observed = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
        expect(document.sha256).toBe(`sha256:${observed}`);
      }),
    );
    const typesBytes = await readFile(join(publicationRoot, manifest.types.entry));
    const typesDigest = new Bun.CryptoHasher("sha256").update(typesBytes).digest("hex");
    expect(manifest.types.sha256).toBe(`sha256:${typesDigest}`);
  });

  test("publication contains no absolute paths or timestamps", async () => {
    await Promise.all(
      expectedFiles.map(async (relativePath) => {
        const text = new TextDecoder().decode(await readFile(join(publicationRoot, relativePath)));
        expect(text).not.toContain("/srv/");
        expect(text).not.toContain("/home/");
        expect(text).not.toContain("/tmp/");
        expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
        expect(text).not.toMatch(/"generatedAt"|"timestamp"|"createdAt"/);
      }),
    );
  });

  test("generation is deterministic across fresh runs in separate directories", async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "m035-export-"));
    try {
      const first = await Effect.runPromise(provideServices(generateSchemaPublication));
      const second = await Effect.runPromise(provideServices(generateSchemaPublication));
      expect(first.entries.length).toBe(second.entries.length);
      for (let index = 0; index < first.entries.length; index++) {
        expect(Buffer.from(first.entries[index]!.bytes).equals(second.entries[index]!.bytes)).toBe(
          true,
        );
      }
      await Promise.all(
        first.entries.map((entry) => Bun.write(join(temporaryRoot, entry.path), entry.bytes)),
      );
      const stagedFiles = await readdir(temporaryRoot, { recursive: true });
      expect(stagedFiles.length).toBeGreaterThan(expectedFiles.length);
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });
});
