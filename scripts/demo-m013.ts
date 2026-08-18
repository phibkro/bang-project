import { CoreDocumentFromJson, SemanticError, validateCore } from "@bang/core";
import { SourceParseError, sourceToCore } from "@bang/surface";
import { BunRuntime, BunServices } from "@effect/platform-bun";
import { Console, Effect, FileSystem, Layer, Schema } from "effect";

const sourcePath = "examples/tiny-bank/account.bang";

class DemoError extends Schema.TaggedError<DemoError>()("DemoError", {
  message: Schema.String,
}) {}

const parseCore = (source: string) => Effect.fromResult(sourceToCore(source));

const program = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const source = yield* fileSystem.readFileString(sourcePath);

  const document = yield* parseCore(source);
  const checked = yield* validateCore(document);
  const identities = checked.declarations.map(({ kind, id }) => `${kind}:${id}`);
  const expectedIdentities = [
    "stateMachine:Account",
    "capability:DebitAccount",
    "operationRealization:WithdrawAccount",
    "operationRealization:WithdrawAccountOnce",
  ];
  if (identities.join("\n") !== expectedIdentities.join("\n")) {
    return yield* new DemoError({
      message: `unexpected lowered declaration identities: ${identities.join(", ")}`,
    });
  }
  yield* Console.log(`PASS parsed ${sourcePath} through the generalized Pratt rule table`);
  yield* Console.log(`PASS lowered stable Core identities: ${identities.join(", ")}`);
  yield* Console.log("PASS existing Core validation accepted the lowered Account bundle");

  const missingBrace = source.slice(0, source.lastIndexOf("}"));
  const syntaxFailure = yield* Effect.flip(parseCore(missingBrace));
  if (
    !(syntaxFailure instanceof SourceParseError) ||
    syntaxFailure.found !== "end of input" ||
    !syntaxFailure.expected.includes("}") ||
    syntaxFailure.span.start.offset !== missingBrace.length ||
    syntaxFailure.span.end.offset !== missingBrace.length
  ) {
    return yield* new DemoError({
      message: `unexpected missing-brace rejection: ${String(syntaxFailure)}`,
    });
  }
  yield* Console.log(
    `PASS missing brace rejected at ${syntaxFailure.span.start.line}:${syntaxFailure.span.start.column} expecting }`,
  );

  const invalidSource = source.replace("requires balance >= amount", "requires missing >= amount");
  if (invalidSource === source) {
    return yield* new DemoError({
      message: "semantic rejection fixture did not change the source",
    });
  }
  const invalidCore = yield* parseCore(invalidSource);
  const semanticFailure = yield* Effect.flip(validateCore(invalidCore));
  if (
    !(semanticFailure instanceof SemanticError) ||
    !semanticFailure.message.includes("references unknown state field missing")
  ) {
    return yield* new DemoError({
      message: `unexpected semantic rejection: ${String(semanticFailure)}`,
    });
  }
  yield* Console.log("PASS well-formed source retained Core-owned unknown-field rejection");

  const secondDocument = yield* parseCore(source);
  const firstJson = yield* Schema.encodeEffect(CoreDocumentFromJson)(document);
  const secondJson = yield* Schema.encodeEffect(CoreDocumentFromJson)(secondDocument);
  if (firstJson !== secondJson) {
    return yield* new DemoError({ message: "source lowering was not byte-deterministic" });
  }
  yield* Console.log("PASS repeated parsing produced byte-identical canonical Core JSON");
});

const MainLayer = Layer.mergeAll(BunServices.layer);
// @effect-diagnostics-next-line strictEffectProvide:off
BunRuntime.runMain(program.pipe(Effect.provide(MainLayer)));
