import { Effect, FileSystem, Path, Schema } from "effect";

const parseOptions = { onExcessProperty: "error" } as const;

const isRepositoryRelativePath = (value: string): boolean => {
  if (
    value.length === 0 ||
    value.includes("\\") ||
    value.includes("\u0000") ||
    value.startsWith("/") ||
    /^[A-Za-z]:/.test(value)
  ) {
    return false;
  }
  return value
    .split("/")
    .every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
};

const RepositoryRelativePath = Schema.String.pipe(
  Schema.check(
    Schema.makeFilter(isRepositoryRelativePath, {
      expected: "a repository-relative path without traversal segments",
    }),
  ),
);

/** One deterministic repository-relative file to publish. */
export const PublicationEntrySchema = Schema.Struct({
  path: RepositoryRelativePath,
  bytes: Schema.Uint8Array,
}).annotate({ parseOptions });
export type PublicationEntry = typeof PublicationEntrySchema.Type;

const PublicationEntriesSchema = Schema.Array(PublicationEntrySchema).annotate({ parseOptions });

/** A typed failure raised while publishing a staged file set. */
export class PublicationFailure extends Schema.TaggedError<PublicationFailure>()(
  "PublicationFailure",
  {
    stage: Schema.Literal("publication"),
    path: Schema.String,
    reason: Schema.String,
    message: Schema.String,
  },
) {}

const makePublicationFailure = (
  path: string,
  reason: string,
  message: string,
): PublicationFailure =>
  new PublicationFailure({
    stage: "publication",
    path,
    reason,
    message,
  });

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

interface PublicationState {
  readonly relativePath: string;
  readonly finalPath: string;
  readonly stagedPath: string;
  readonly custodyPath: string;
  readonly prior: boolean;
}

const rollback = (
  fileSystem: FileSystem.FileSystem,
  path: Path.Path,
  states: ReadonlyArray<PublicationState>,
): Effect.Effect<void, PublicationFailure> =>
  Effect.gen(function* () {
    let rollbackFailure: PublicationFailure | undefined;
    for (const state of [...states].toReversed()) {
      const restore = state.prior
        ? Effect.gen(function* () {
            yield* fileSystem.makeDirectory(path.dirname(state.finalPath), { recursive: true });
            yield* fileSystem.copyFile(state.custodyPath, state.finalPath);
          })
        : fileSystem.remove(state.finalPath, { force: true });
      yield* restore.pipe(
        Effect.mapError((error) =>
          makePublicationFailure(
            state.finalPath,
            "rollback-failed",
            `could not restore ${state.relativePath}: ${errorMessage(error)}`,
          ),
        ),
        Effect.catch((error) => {
          rollbackFailure ??= error;
          return Effect.void;
        }),
      );
    }
    if (rollbackFailure !== undefined) return yield* Effect.fail(rollbackFailure);
  });

/** Publish a complete staged closure with custody and rollback. */
export const publishAtomically = Effect.fn("publishAtomically")(function* (
  root: string,
  entries: ReadonlyArray<PublicationEntry>,
): Effect.fn.Return<void, PublicationFailure, FileSystem.FileSystem | Path.Path> {
  const path = yield* Path.Path;
  const fileSystem = yield* FileSystem.FileSystem;
  const decodedEntries = yield* Schema.decodeUnknownEffect(PublicationEntriesSchema)(
    entries,
    parseOptions,
  ).pipe(
    Effect.mapError((issue) =>
      makePublicationFailure(
        "entries",
        "invalid-entry",
        `invalid publication entries: ${String(issue)}`,
      ),
    ),
  );
  const orderedEntries = [...decodedEntries].toSorted((left, right) =>
    left.path.localeCompare(right.path),
  );
  for (let index = 1; index < orderedEntries.length; index++) {
    if (orderedEntries[index - 1]?.path === orderedEntries[index]?.path) {
      return yield* makePublicationFailure(
        orderedEntries[index]!.path,
        "duplicate-entry",
        `publication contains duplicate path ${orderedEntries[index]!.path}`,
      );
    }
  }

  const resolvedRoot = path.resolve(root);
  return yield* Effect.scoped(
    Effect.gen(function* () {
      const temporaryRoot = yield* fileSystem
        .makeTempDirectoryScoped({ directory: resolvedRoot, prefix: ".bang-publication-" })
        .pipe(
          Effect.mapError((error) =>
            makePublicationFailure(
              resolvedRoot,
              "staging-failed",
              `could not create publication staging directory: ${errorMessage(error)}`,
            ),
          ),
        );
      const states: Array<PublicationState> = [];
      for (const [index, entry] of orderedEntries.entries()) {
        const finalPath = path.resolve(resolvedRoot, entry.path);
        const stagedPath = path.join(
          temporaryRoot,
          "staged",
          `${String(index).padStart(6, "0")}.bin`,
        );
        const custodyPath = path.join(
          temporaryRoot,
          "custody",
          `${String(index).padStart(6, "0")}.bin`,
        );
        yield* fileSystem
          .makeDirectory(path.dirname(stagedPath), { recursive: true })
          .pipe(
            Effect.mapError((error) =>
              makePublicationFailure(
                entry.path,
                "staging-failed",
                `could not create publication staging directory: ${errorMessage(error)}`,
              ),
            ),
          );
        yield* fileSystem
          .writeFile(stagedPath, new Uint8Array(entry.bytes))
          .pipe(
            Effect.mapError((error) =>
              makePublicationFailure(
                entry.path,
                "staging-failed",
                `could not stage publication bytes: ${errorMessage(error)}`,
              ),
            ),
          );
        const prior = yield* fileSystem
          .exists(finalPath)
          .pipe(
            Effect.mapError((error) =>
              makePublicationFailure(
                entry.path,
                "custody-failed",
                `could not inspect prior publication: ${errorMessage(error)}`,
              ),
            ),
          );
        if (prior) {
          yield* fileSystem
            .makeDirectory(path.dirname(custodyPath), { recursive: true })
            .pipe(
              Effect.mapError((error) =>
                makePublicationFailure(
                  entry.path,
                  "custody-failed",
                  `could not create prior-state custody directory: ${errorMessage(error)}`,
                ),
              ),
            );
          yield* fileSystem
            .copyFile(finalPath, custodyPath)
            .pipe(
              Effect.mapError((error) =>
                makePublicationFailure(
                  entry.path,
                  "custody-failed",
                  `could not retain prior publication bytes: ${errorMessage(error)}`,
                ),
              ),
            );
        }
        states.push({
          relativePath: entry.path,
          finalPath,
          stagedPath,
          custodyPath,
          prior,
        });
      }

      const committed: Array<PublicationState> = [];
      const commit = Effect.gen(function* () {
        for (const state of states) {
          yield* fileSystem
            .makeDirectory(path.dirname(state.finalPath), { recursive: true })
            .pipe(
              Effect.mapError((error) =>
                makePublicationFailure(
                  state.relativePath,
                  "publication-failed",
                  `could not create publication directory: ${errorMessage(error)}`,
                ),
              ),
            );
          yield* fileSystem
            .rename(state.stagedPath, state.finalPath)
            .pipe(
              Effect.mapError((error) =>
                makePublicationFailure(
                  state.relativePath,
                  "publication-failed",
                  `could not publish ${state.relativePath}: ${errorMessage(error)}`,
                ),
              ),
            );
          committed.push(state);
        }
      });
      yield* commit.pipe(
        Effect.catch((error) =>
          Effect.matchEffect(rollback(fileSystem, path, committed), {
            onFailure: (rollbackError) =>
              Effect.fail(
                makePublicationFailure(
                  error.path,
                  "rollback-failed",
                  `${error.message}; ${rollbackError.message}`,
                ),
              ),
            onSuccess: () => Effect.fail(error),
          }),
        ),
      );
    }),
  );
});
