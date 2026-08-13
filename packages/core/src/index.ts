import { Data, Effect, Schema } from "effect";

const Identifier = Schema.String.pipe(Schema.check(Schema.isPattern(/^[A-Za-z][A-Za-z0-9]*$/)));
const TypeReference = Schema.String;
const DecimalInteger = Schema.String.pipe(Schema.check(Schema.isPattern(/^-?(?:0|[1-9][0-9]*)$/)));

const Parameter = Schema.Struct({ id: Identifier, type: TypeReference });
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

const RefinementDeclaration = Schema.Struct({
  kind: Schema.Literal("refinement"),
  id: Identifier,
  base: TypeReference,
  predicate: Schema.Struct({
    kind: Schema.Literal("greaterThanOrEqual"),
    left: Schema.Struct({ kind: Schema.Literal("self") }),
    right: Schema.Struct({
      kind: Schema.Literal("integerLiteral"),
      value: DecimalInteger,
    }),
  }),
});

export interface VariableTerm {
  readonly kind: "variable";
  readonly id: string;
}

export interface ApplicationTerm {
  readonly kind: "application";
  readonly operation: string;
  readonly arguments: ReadonlyArray<Term>;
}

export type Term = VariableTerm | ApplicationTerm;

const TermReference = Schema.suspend((): Schema.Codec<Term> => TermSchema);
const VariableTermSchema: Schema.Codec<VariableTerm> = Schema.Struct({
  kind: Schema.Literal("variable"),
  id: Identifier,
});
const ApplicationTermSchema: Schema.Codec<ApplicationTerm> = Schema.Struct({
  kind: Schema.Literal("application"),
  operation: Identifier,
  arguments: Schema.Array(TermReference),
});
const TermSchema: Schema.Codec<Term> = Schema.Union([VariableTermSchema, ApplicationTermSchema]);

const TheoryParameter = Schema.Struct({ id: Identifier, sort: Identifier });
const TheoryOperation = Schema.Struct({
  id: Identifier,
  parameters: Schema.Array(TheoryParameter),
  result: Identifier,
});
const TheoryLaw = Schema.Struct({
  id: Identifier,
  parameters: Schema.Array(TheoryParameter),
  proposition: Schema.Struct({
    kind: Schema.Literal("equal"),
    left: TermSchema,
    right: TermSchema,
  }),
});
const TheorySort = Schema.Struct({
  id: Identifier,
  representation: Schema.optional(
    Schema.Struct({
      kind: Schema.Literal("builtin"),
      type: TypeReference,
    }),
  ),
});
const TheoryDeclaration = Schema.Struct({
  kind: Schema.Literal("theory"),
  id: Identifier,
  sorts: Schema.Array(TheorySort),
  operations: Schema.Array(TheoryOperation),
  laws: Schema.Array(TheoryLaw),
});

const FiniteModelDeclaration = Schema.Struct({
  kind: Schema.Literal("finiteModel"),
  id: Identifier,
  theory: Identifier,
  carriers: Schema.Array(
    Schema.Struct({
      sort: Identifier,
      elements: Schema.Array(Identifier),
    }),
  ),
  operations: Schema.Array(
    Schema.Struct({
      operation: Identifier,
      rows: Schema.Array(
        Schema.Struct({
          arguments: Schema.Array(Identifier),
          result: Identifier,
        }),
      ),
    }),
  ),
});

const Declaration = Schema.Union([
  ServiceDeclaration,
  RefinementDeclaration,
  TheoryDeclaration,
  FiniteModelDeclaration,
]);

export const CoreDocument = Schema.Struct({
  bangCore: Schema.Literal(1),
  declarations: Schema.Array(Declaration),
});
export const CoreDocumentFromJson = Schema.fromJsonString(CoreDocument);

export type CoreDocument = typeof CoreDocument.Type;
export type ServiceDeclaration = typeof ServiceDeclaration.Type;
export type RefinementDeclaration = typeof RefinementDeclaration.Type;
export type TheoryDeclaration = typeof TheoryDeclaration.Type;
export type FiniteModelDeclaration = typeof FiniteModelDeclaration.Type;
export type TheoryOperation = typeof TheoryOperation.Type;
export type TheoryLaw = typeof TheoryLaw.Type;

const builtInTypes = new Set(["String", "Integer"]);

export class SemanticError extends Data.TaggedError("SemanticError")<{
  readonly message: string;
}> {}

const validateUnique = (scope: string, values: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const seen = new Set<string>();
    for (const value of values) {
      if (seen.has(value)) {
        return yield* new SemanticError({
          message: `${scope} contains duplicate identity ${value}`,
        });
      }
      seen.add(value);
    }
  });

const cartesianProduct = (sets: ReadonlyArray<ReadonlyArray<string>>): Array<Array<string>> =>
  sets.reduce<Array<Array<string>>>(
    (products, elements) =>
      products.flatMap((product) => elements.map((element) => [...product, element])),
    [[]],
  );

const inferTermSort = (
  theory: TheoryDeclaration,
  law: TheoryLaw,
  term: Term,
): Effect.Effect<string, SemanticError> =>
  Effect.gen(function* () {
    if (term.kind === "variable") {
      const parameter = law.parameters.find(({ id }) => id === term.id);
      if (parameter === undefined) {
        return yield* new SemanticError({
          message: `law ${theory.id}.${law.id} references unknown variable ${term.id}`,
        });
      }
      return parameter.sort;
    }

    const operation = theory.operations.find(({ id }) => id === term.operation);
    if (operation === undefined) {
      return yield* new SemanticError({
        message: `law ${theory.id}.${law.id} references unknown operation ${term.operation}`,
      });
    }
    if (term.arguments.length !== operation.parameters.length) {
      return yield* new SemanticError({
        message: `law ${theory.id}.${law.id} applies ${operation.id} with ${term.arguments.length} arguments; expected ${operation.parameters.length}`,
      });
    }
    for (const [index, argument] of term.arguments.entries()) {
      const actual = yield* inferTermSort(theory, law, argument);
      const expected = operation.parameters[index]?.sort;
      if (actual !== expected) {
        return yield* new SemanticError({
          message: `law ${theory.id}.${law.id} gives ${operation.id} argument ${index + 1} sort ${actual}; expected ${expected}`,
        });
      }
    }
    return operation.result;
  });

const validateTheory = (theory: TheoryDeclaration) =>
  Effect.gen(function* () {
    yield* validateUnique(
      `theory ${theory.id} sorts`,
      theory.sorts.map(({ id }) => id),
    );
    yield* validateUnique(
      `theory ${theory.id} operations`,
      theory.operations.map(({ id }) => id),
    );
    yield* validateUnique(
      `theory ${theory.id} laws`,
      theory.laws.map(({ id }) => id),
    );
    const sorts = new Set(theory.sorts.map(({ id }) => id));

    for (const sort of theory.sorts) {
      if (sort.representation !== undefined && !builtInTypes.has(sort.representation.type)) {
        return yield* new SemanticError({
          message: `theory ${theory.id} sort ${sort.id} references unknown built-in representation ${sort.representation.type}`,
        });
      }
    }

    for (const operation of theory.operations) {
      yield* validateUnique(
        `operation ${theory.id}.${operation.id}`,
        operation.parameters.map(({ id }) => id),
      );
      for (const referencedSort of [
        ...operation.parameters.map(({ sort: parameterSort }) => parameterSort),
        operation.result,
      ]) {
        if (!sorts.has(referencedSort)) {
          return yield* new SemanticError({
            message: `operation ${theory.id}.${operation.id} references unknown sort ${referencedSort}`,
          });
        }
      }
    }

    for (const law of theory.laws) {
      yield* validateUnique(
        `law ${theory.id}.${law.id}`,
        law.parameters.map(({ id }) => id),
      );
      for (const parameter of law.parameters) {
        if (!sorts.has(parameter.sort)) {
          return yield* new SemanticError({
            message: `law ${theory.id}.${law.id} references unknown sort ${parameter.sort}`,
          });
        }
      }
      const left = yield* inferTermSort(theory, law, law.proposition.left);
      const right = yield* inferTermSort(theory, law, law.proposition.right);
      if (left !== right) {
        return yield* new SemanticError({
          message: `law ${theory.id}.${law.id} compares sort ${left} with ${right}`,
        });
      }
    }
  });

const validateFiniteModel = (model: FiniteModelDeclaration, theory: TheoryDeclaration) =>
  Effect.gen(function* () {
    yield* validateUnique(
      `model ${model.id} carriers`,
      model.carriers.map(({ sort }) => sort),
    );
    yield* validateUnique(
      `model ${model.id} operations`,
      model.operations.map(({ operation }) => operation),
    );

    const expectedSorts = new Set(theory.sorts.map(({ id }) => id));
    const actualSorts = new Set(model.carriers.map(({ sort }) => sort));
    for (const sort of expectedSorts) {
      if (!actualSorts.has(sort)) {
        return yield* new SemanticError({
          message: `model ${model.id} has no carrier for sort ${sort}`,
        });
      }
    }
    for (const sort of actualSorts) {
      if (!expectedSorts.has(sort)) {
        return yield* new SemanticError({
          message: `model ${model.id} has unknown carrier ${sort}`,
        });
      }
    }

    const carriers = new Map<string, ReadonlyArray<string>>();
    for (const carrier of model.carriers) {
      if (carrier.elements.length === 0) {
        return yield* new SemanticError({
          message: `model ${model.id} carrier ${carrier.sort} is empty`,
        });
      }
      yield* validateUnique(`model ${model.id} carrier ${carrier.sort}`, carrier.elements);
      carriers.set(carrier.sort, carrier.elements);
    }

    const interpretations = new Map(
      model.operations.map((operation) => [operation.operation, operation]),
    );
    for (const operation of theory.operations) {
      const interpretation = interpretations.get(operation.id);
      if (interpretation === undefined) {
        return yield* new SemanticError({
          message: `model ${model.id} has no interpretation for operation ${operation.id}`,
        });
      }
      const argumentCarriers = operation.parameters.map(({ sort }) => carriers.get(sort) ?? []);
      const expectedTuples = cartesianProduct(argumentCarriers);
      const rows = new Map<string, string>();
      for (const row of interpretation.rows) {
        if (row.arguments.length !== operation.parameters.length) {
          return yield* new SemanticError({
            message: `model ${model.id} operation ${operation.id} row has ${row.arguments.length} arguments; expected ${operation.parameters.length}`,
          });
        }
        for (const [index, element] of row.arguments.entries()) {
          const sort = operation.parameters[index]?.sort;
          if (sort === undefined || !carriers.get(sort)?.includes(element)) {
            return yield* new SemanticError({
              message: `model ${model.id} operation ${operation.id} argument ${element} is outside carrier ${sort}`,
            });
          }
        }
        if (!carriers.get(operation.result)?.includes(row.result)) {
          return yield* new SemanticError({
            message: `model ${model.id} operation ${operation.id} result ${row.result} is outside carrier ${operation.result}`,
          });
        }
        const key = JSON.stringify(row.arguments);
        if (rows.has(key)) {
          return yield* new SemanticError({
            message: `model ${model.id} operation ${operation.id} duplicates arguments ${key}`,
          });
        }
        rows.set(key, row.result);
      }
      for (const tuple of expectedTuples) {
        const key = JSON.stringify(tuple);
        if (!rows.has(key)) {
          return yield* new SemanticError({
            message: `model ${model.id} operation ${operation.id} is incomplete at arguments ${key}`,
          });
        }
      }
    }
    for (const interpretation of model.operations) {
      if (!theory.operations.some(({ id }) => id === interpretation.operation)) {
        return yield* new SemanticError({
          message: `model ${model.id} interprets unknown operation ${interpretation.operation}`,
        });
      }
    }
  });

export const validateCore = (document: CoreDocument) =>
  Effect.gen(function* () {
    yield* validateUnique(
      "document",
      document.declarations.map(({ id }) => id),
    );

    const knownTypes = new Set([
      ...builtInTypes,
      ...document.declarations
        .filter((declaration) => declaration.kind === "refinement")
        .map(({ id }) => id),
    ]);
    const theories = new Map(
      document.declarations
        .filter((declaration) => declaration.kind === "theory")
        .map((theory) => [theory.id, theory]),
    );

    for (const declaration of document.declarations) {
      if (declaration.kind === "theory") {
        yield* validateTheory(declaration);
        continue;
      }
      if (declaration.kind === "finiteModel") {
        const theory = theories.get(declaration.theory);
        if (theory === undefined) {
          return yield* new SemanticError({
            message: `model ${declaration.id} references unknown theory ${declaration.theory}`,
          });
        }
        yield* validateFiniteModel(declaration, theory);
        continue;
      }
      if (declaration.kind === "refinement") {
        if (!builtInTypes.has(declaration.base)) {
          return yield* new SemanticError({
            message: `refinement ${declaration.id} references unknown base ${declaration.base}`,
          });
        }
        if (declaration.base !== "Integer") {
          return yield* new SemanticError({
            message: `refinement ${declaration.id} compares self : ${declaration.base} with Integer`,
          });
        }
        continue;
      }

      yield* validateUnique(
        `service ${declaration.id}`,
        declaration.operations.map(({ id }) => id),
      );
      for (const operation of declaration.operations) {
        yield* validateUnique(
          `operation ${declaration.id}.${operation.id}`,
          operation.parameters.map(({ id }) => id),
        );
        for (const reference of [
          ...operation.parameters.map(({ type }) => type),
          operation.result,
        ]) {
          if (!knownTypes.has(reference)) {
            return yield* new SemanticError({
              message: `operation ${declaration.id}.${operation.id} references unknown type ${reference}`,
            });
          }
        }
      }
    }
    return document;
  });

export interface FiniteCounterexample {
  readonly law: string;
  readonly assignment: ReadonlyArray<{ readonly parameter: string; readonly element: string }>;
  readonly left: string;
  readonly right: string;
}

export type FiniteModelEvaluation =
  | {
      readonly satisfies: true;
      readonly theory: string;
      readonly model: string;
      readonly checkedAssignments: number;
    }
  | {
      readonly satisfies: false;
      readonly theory: string;
      readonly model: string;
      readonly checkedAssignments: number;
      readonly counterexample: FiniteCounterexample;
    };

const evaluateTerm = (
  term: Term,
  assignment: ReadonlyMap<string, string>,
  model: FiniteModelDeclaration,
): string => {
  if (term.kind === "variable") {
    const element = assignment.get(term.id);
    if (element === undefined) throw new Error(`validated assignment omitted ${term.id}`);
    return element;
  }
  const argumentValues = term.arguments.map((argument) =>
    evaluateTerm(argument, assignment, model),
  );
  const interpretation = model.operations.find(({ operation }) => operation === term.operation);
  const row = interpretation?.rows.find(
    ({ arguments: expected }) => JSON.stringify(expected) === JSON.stringify(argumentValues),
  );
  if (row === undefined) {
    throw new Error(`validated model omitted ${term.operation}${JSON.stringify(argumentValues)}`);
  }
  return row.result;
};

export const evaluateFiniteModel = (document: CoreDocument, modelId: string) =>
  Effect.gen(function* () {
    const validated = yield* validateCore(document);
    const model = validated.declarations.find(
      (declaration): declaration is FiniteModelDeclaration =>
        declaration.kind === "finiteModel" && declaration.id === modelId,
    );
    if (model === undefined) {
      return yield* new SemanticError({ message: `unknown finite model ${modelId}` });
    }
    const theory = validated.declarations.find(
      (declaration): declaration is TheoryDeclaration =>
        declaration.kind === "theory" && declaration.id === model.theory,
    );
    if (theory === undefined) {
      return yield* new SemanticError({ message: `model ${model.id} has no validated theory` });
    }
    const carriers = new Map(model.carriers.map(({ sort, elements }) => [sort, elements]));
    let checkedAssignments = 0;
    for (const law of theory.laws) {
      const assignments = cartesianProduct(
        law.parameters.map(({ sort }) => carriers.get(sort) ?? []),
      );
      for (const elements of assignments) {
        checkedAssignments += 1;
        const assignment = new Map(
          law.parameters.map(({ id }, index) => [id, elements[index] ?? ""]),
        );
        const left = evaluateTerm(law.proposition.left, assignment, model);
        const right = evaluateTerm(law.proposition.right, assignment, model);
        if (left !== right) {
          return {
            satisfies: false,
            theory: theory.id,
            model: model.id,
            checkedAssignments,
            counterexample: {
              law: law.id,
              assignment: law.parameters.map(({ id }, index) => ({
                parameter: id,
                element: elements[index] ?? "",
              })),
              left,
              right,
            },
          } satisfies FiniteModelEvaluation;
        }
      }
    }
    return {
      satisfies: true,
      theory: theory.id,
      model: model.id,
      checkedAssignments,
    } satisfies FiniteModelEvaluation;
  });
