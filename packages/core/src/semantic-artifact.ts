import { type Crypto, Effect, Schema } from "effect";
import { CoreDocument, validateCore } from "./index.ts";
import type { CheckedCoreDocument, CoreDocument as CoreDocumentValue } from "./index.ts";
import {
  NormalizationProvenanceSchema,
  type NormalizationProvenance,
  NormalizedCoreSchema,
  type NormalizationError,
  encodeCanonicalJson,
  normalizeCore,
  verifyCleanParity,
} from "./normalization.ts";

const CoreDocumentReference = Schema.suspend((): Schema.Codec<CoreDocumentValue> => CoreDocument);

const ArtifactIdentity = Schema.String.pipe(Schema.check(Schema.isNonEmpty()));

/** Version one of the portable semantic artifact interchange boundary. */
export const SemanticArtifact = Schema.Struct({
  bangSemanticArtifact: Schema.Literal(1),
  id: ArtifactIdentity,
  core: CoreDocumentReference,
  normalized: NormalizedCoreSchema,
  provenance: NormalizationProvenanceSchema,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});
export type SemanticArtifact = typeof SemanticArtifact.Type;
export const SemanticArtifactSchema = SemanticArtifact;
/** The JSON string codec for versioned semantic artifacts. */
export const SemanticArtifactFromJson = Schema.fromJsonString(SemanticArtifact);

export type SemanticArtifactFailureReason = "schema" | "core" | "normalization" | "parity";

/** A typed failure at one of the artifact boundary's independent validation stages. */
export class SemanticArtifactError extends Schema.TaggedError<SemanticArtifactError>()(
  "SemanticArtifactError",
  {
    reason: Schema.Literals(["schema", "core", "normalization", "parity"]),
    message: Schema.String,
    address: Schema.optional(Schema.String),
    target: Schema.optional(Schema.String),
  },
) {}

const semanticArtifactError = (
  reason: SemanticArtifactFailureReason,
  message: string,
  address?: string,
  target?: string,
): SemanticArtifactError =>
  new SemanticArtifactError({
    reason,
    message,
    ...(address === undefined ? {} : { address }),
    ...(target === undefined ? {} : { target }),
  });

const normalizationFailure = (
  reason: "normalization" | "parity",
  error: NormalizationError,
): SemanticArtifactError =>
  semanticArtifactError(reason, error.message, error.address, error.target);

/** Decode a versioned artifact with strict excess-property handling. */
export const decodeSemanticArtifact = Effect.fn("decodeSemanticArtifact")(function* (
  encoded: string,
): Effect.fn.Return<SemanticArtifact, SemanticArtifactError> {
  return yield* Schema.decodeUnknownEffect(SemanticArtifactFromJson)(encoded, {
    onExcessProperty: "error",
  }).pipe(Effect.mapError((issue) => semanticArtifactError("schema", String(issue))));
});

/**
 * Build a version-one artifact from checked Core and its complete material provenance.
 * Normalization remains an explicit Crypto requirement at this library boundary.
 */
export const produceSemanticArtifact = Effect.fn("produceSemanticArtifact")(function* (
  core: CheckedCoreDocument,
  provenance: NormalizationProvenance,
  id: string,
): Effect.fn.Return<SemanticArtifact, SemanticArtifactError, Crypto.Crypto> {
  const normalized = yield* normalizeCore(core, provenance).pipe(
    Effect.mapError((error) => normalizationFailure("normalization", error)),
  );
  return {
    bangSemanticArtifact: 1,
    id,
    core,
    normalized,
    provenance,
  };
});

/** Encode an artifact with canonical object-key ordering and semantic array ordering. */
export const encodeSemanticArtifact = (artifact: SemanticArtifact): string =>
  encodeCanonicalJson(artifact);

/**
 * Consume an encoded artifact through the independent Core boundary.
 * The embedded Core is checked again, then normalized from embedded provenance, and only
 * accepted when that clean normalization is exactly equal to the embedded normalization.
 */
export const consumeSemanticArtifact = Effect.fn("consumeSemanticArtifact")(function* (
  encoded: string,
): Effect.fn.Return<CheckedSemanticArtifact, SemanticArtifactError, Crypto.Crypto> {
  const artifact = yield* decodeSemanticArtifact(encoded);
  const checkedCore = yield* validateCore(artifact.core).pipe(
    Effect.mapError((error) => semanticArtifactError("core", error.message)),
  );
  const clean = yield* normalizeCore(checkedCore, artifact.provenance).pipe(
    Effect.mapError((error) => normalizationFailure("normalization", error)),
  );
  yield* verifyCleanParity(artifact.normalized, clean).pipe(
    Effect.mapError((error) => normalizationFailure("parity", error)),
  );
  return { ...artifact, core: checkedCore };
});

/** Alias emphasizing that consumption is a complete artifact validation operation. */
export const validateSemanticArtifact = consumeSemanticArtifact;

export type CheckedSemanticArtifact = Omit<SemanticArtifact, "core"> & {
  readonly core: CheckedCoreDocument;
};

/** Encode a freshly normalized artifact in one deterministic operation. */
export const produceEncodedSemanticArtifact = Effect.fn("produceEncodedSemanticArtifact")(
  function* (
    core: CheckedCoreDocument,
    provenance: NormalizationProvenance,
    id: string,
  ): Effect.fn.Return<string, SemanticArtifactError, Crypto.Crypto> {
    const artifact = yield* produceSemanticArtifact(core, provenance, id);
    return encodeSemanticArtifact(artifact);
  },
);
