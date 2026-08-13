import { Data, Effect, Schema } from "effect";

const Identifier = Schema.String.pipe(Schema.check(Schema.isPattern(/^[A-Za-z][A-Za-z0-9]*$/)));

const TypeReference = Schema.String;

const Parameter = Schema.Struct({
  id: Identifier,
  type: TypeReference,
});

const Operation = Schema.Struct({
  id: Identifier,
  parameters: Schema.Array(Parameter),
  result: TypeReference,
});

const ServiceDeclaration = Schema.Struct({
  kind: Schema.Literal("service"),
  id: Identifier,
  operations: Schema.Array(Operation),
});

export const CoreDocument = Schema.Struct({
  bangCore: Schema.Literal(1),
  declarations: Schema.Array(ServiceDeclaration),
});

export const CoreDocumentFromJson = Schema.fromJsonString(CoreDocument);

export type CoreDocument = typeof CoreDocument.Type;
export type ServiceDeclaration = typeof ServiceDeclaration.Type;

const builtInTypes = new Set(["String", "Integer"]);

export class SemanticError extends Data.TaggedError("SemanticError")<{
  readonly message: string;
}> {}

const validateUnique = (scope: string, values: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const seen = new Set<string>();
    for (const value of values) {
      if (seen.has(value)) {
        return yield* Effect.fail(
          new SemanticError({ message: `${scope} contains duplicate identity ${value}` }),
        );
      }
      seen.add(value);
    }
  });

export const validateCore = (document: CoreDocument) =>
  Effect.gen(function* () {
    yield* validateUnique(
      "document",
      document.declarations.map(({ id }) => id),
    );

    for (const declaration of document.declarations) {
      yield* validateUnique(
        `service ${declaration.id}`,
        declaration.operations.map(({ id }) => id),
      );

      for (const operation of declaration.operations) {
        yield* validateUnique(
          `operation ${declaration.id}.${operation.id}`,
          operation.parameters.map(({ id }) => id),
        );
        const references = [...operation.parameters.map(({ type }) => type), operation.result];
        for (const reference of references) {
          if (!builtInTypes.has(reference)) {
            return yield* Effect.fail(
              new SemanticError({
                message: `operation ${declaration.id}.${operation.id} references unknown type ${reference}`,
              }),
            );
          }
        }
      }
    }

    return document;
  });
