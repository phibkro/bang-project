import { Effect, Graph, HashMap, Option, Schema, SchemaIssue, SchemaTransformation } from "effect";

const Identifier = Schema.String.pipe(Schema.check(Schema.isPattern(/^[A-Za-z][A-Za-z0-9]*$/)));
const TypeReference = Schema.String;
const PositiveDecimalInteger = Schema.String.pipe(Schema.check(Schema.isPattern(/^[1-9][0-9]*$/)));
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

export interface DataBuiltinType {
  readonly kind: "builtin";
  readonly name: "Identifier";
}

export interface DataReferenceType {
  readonly kind: "reference";
  readonly id: string;
}

export interface DataListType {
  readonly kind: "list";
  readonly element: DataType;
}

export interface DataRecordType {
  readonly kind: "record";
  readonly fields: ReadonlyArray<DataField>;
}

export type DataType = DataBuiltinType | DataReferenceType | DataListType | DataRecordType;

export interface DataField {
  readonly id: string;
  readonly type: DataType;
}

export interface DataConstructor {
  readonly tag: string;
  readonly fields: ReadonlyArray<DataField>;
}

const DataTypeReference = Schema.suspend((): Schema.Codec<DataType> => DataTypeSchema);
const DataFieldSchema: Schema.Codec<DataField> = Schema.Struct({
  id: Identifier,
  type: DataTypeReference,
});
const DataBuiltinTypeSchema: Schema.Codec<DataBuiltinType> = Schema.Struct({
  kind: Schema.Literal("builtin"),
  name: Schema.Literal("Identifier"),
});
const DataReferenceTypeSchema: Schema.Codec<DataReferenceType> = Schema.Struct({
  kind: Schema.Literal("reference"),
  id: Identifier,
});
const DataListTypeSchema: Schema.Codec<DataListType> = Schema.Struct({
  kind: Schema.Literal("list"),
  element: DataTypeReference,
});
const DataRecordTypeSchema: Schema.Codec<DataRecordType> = Schema.Struct({
  kind: Schema.Literal("record"),
  fields: Schema.Array(DataFieldSchema),
});
const DataTypeSchema: Schema.Codec<DataType> = Schema.Union([
  DataBuiltinTypeSchema,
  DataReferenceTypeSchema,
  DataListTypeSchema,
  DataRecordTypeSchema,
]);
const DataConstructorSchema: Schema.Codec<DataConstructor> = Schema.Struct({
  tag: Identifier,
  fields: Schema.Array(DataFieldSchema),
});
const DataDeclaration = Schema.Struct({
  kind: Schema.Literal("data"),
  id: Identifier,
  discriminator: Identifier,
  constructors: Schema.NonEmptyArray(DataConstructorSchema),
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

const QualifiedTheorySort = Schema.Struct({
  participant: Identifier,
  sort: Identifier,
});

export interface BridgeVariableTerm {
  readonly kind: "variable";
  readonly id: string;
}

export interface BridgeApplicationTerm {
  readonly kind: "application";
  readonly operation: {
    readonly participant: string;
    readonly operation: string;
  };
  readonly arguments: ReadonlyArray<BridgeTerm>;
}

export type BridgeTerm = BridgeVariableTerm | BridgeApplicationTerm;

const BridgeTermReference = Schema.suspend((): Schema.Codec<BridgeTerm> => BridgeTermSchema);
const BridgeVariableTermSchema: Schema.Codec<BridgeVariableTerm> = Schema.Struct({
  kind: Schema.Literal("variable"),
  id: Identifier,
});
const BridgeApplicationTermSchema: Schema.Codec<BridgeApplicationTerm> = Schema.Struct({
  kind: Schema.Literal("application"),
  operation: Schema.Struct({
    participant: Identifier,
    operation: Identifier,
  }),
  arguments: Schema.Array(BridgeTermReference),
});
const BridgeTermSchema: Schema.Codec<BridgeTerm> = Schema.Union([
  BridgeVariableTermSchema,
  BridgeApplicationTermSchema,
]);
export const decodeBridgeTerm = Schema.decodeUnknownEffect(BridgeTermSchema);

const TheoryBridgeLaw = Schema.Struct({
  id: Identifier,
  parameters: Schema.Array(
    Schema.Struct({
      id: Identifier,
      sort: Identifier,
    }),
  ),
  proposition: Schema.Struct({
    kind: Schema.Literal("equal"),
    left: BridgeTermSchema,
    right: BridgeTermSchema,
  }),
});

const TheoryBridgeDeclaration = Schema.Struct({
  kind: Schema.Literal("theoryBridge"),
  id: Identifier,
  participants: Schema.Array(
    Schema.Struct({
      id: Identifier,
      theory: Identifier,
    }),
  ),
  sharedSorts: Schema.Array(
    Schema.Struct({
      id: Identifier,
      members: Schema.Array(QualifiedTheorySort),
    }),
  ),
  laws: Schema.Array(TheoryBridgeLaw),
});

export interface StateParameterValue {
  readonly kind: "parameter";
  readonly id: string;
}

export interface StateFieldValue {
  readonly kind: "stateField";
  readonly field: string;
}

export interface StateIntegerLiteralValue {
  readonly kind: "integerLiteral";
  readonly value: string;
}

export type StateValue = StateParameterValue | StateFieldValue | StateIntegerLiteralValue;

const StateParameterValueSchema: Schema.Codec<StateParameterValue> = Schema.Struct({
  kind: Schema.Literal("parameter"),
  id: Identifier,
});
const StateFieldValueSchema: Schema.Codec<StateFieldValue> = Schema.Struct({
  kind: Schema.Literal("stateField"),
  field: Identifier,
});
const StateIntegerLiteralValueSchema: Schema.Codec<StateIntegerLiteralValue> = Schema.Struct({
  kind: Schema.Literal("integerLiteral"),
  value: DecimalInteger,
});
const StateValueSchema: Schema.Codec<StateValue> = Schema.Union([
  StateParameterValueSchema,
  StateFieldValueSchema,
  StateIntegerLiteralValueSchema,
]);
const StatePredicate = Schema.Struct({
  kind: Schema.Literal("greaterThanOrEqual"),
  left: StateValueSchema,
  right: StateValueSchema,
});
const StateOperation = Schema.Struct({
  id: Identifier,
  parameters: Schema.Array(Parameter),
  requires: Schema.Array(StatePredicate),
});
const StateMachineDeclaration = Schema.Struct({
  kind: Schema.Literal("stateMachine"),
  id: Identifier,
  state: Schema.Struct({
    id: Identifier,
    fields: Schema.Array(Parameter),
  }),
  initializers: Schema.Array(StateOperation),
  transitions: Schema.Array(StateOperation),
  invariants: Schema.Array(
    Schema.Struct({
      id: Identifier,
      proposition: StatePredicate,
    }),
  ),
});

export interface UnboundedCapabilityQuantity {
  readonly kind: "unbounded";
}

export interface ExactCapabilityQuantity {
  readonly kind: "exactly";
  readonly uses: string;
}

export type CapabilityQuantity = UnboundedCapabilityQuantity | ExactCapabilityQuantity;

export interface CapabilityRequirement {
  readonly capability: string;
  readonly quantity: CapabilityQuantity;
}

const CapabilityQuantitySchema: Schema.Codec<CapabilityQuantity> = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("unbounded") }),
  Schema.Struct({ kind: Schema.Literal("exactly"), uses: PositiveDecimalInteger }),
]);
const CapabilityRequirementSchema: Schema.Codec<CapabilityRequirement> = Schema.Struct({
  capability: Identifier,
  quantity: CapabilityQuantitySchema,
});

const CapabilityDeclaration = Schema.Struct({
  kind: Schema.Literal("capability"),
  id: Identifier,
});

const OperationRealizationDeclaration = Schema.Struct({
  kind: Schema.Literal("operationRealization"),
  id: Identifier,
  operation: Schema.Struct({
    stateMachine: Identifier,
    operation: Identifier,
  }),
  requires: Schema.Array(CapabilityRequirementSchema),
  disabled: Schema.Struct({
    kind: Schema.Literal("failure"),
    id: Identifier,
  }),
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
  DataDeclaration,
  ServiceDeclaration,
  RefinementDeclaration,
  TheoryDeclaration,
  TheoryBridgeDeclaration,
  StateMachineDeclaration,
  CapabilityDeclaration,
  OperationRealizationDeclaration,
  FiniteModelDeclaration,
]);

export const CoreDocument = Schema.Struct({
  bangCore: Schema.Literal(1),
  declarations: Schema.Array(Declaration),
}).annotate({
  parseOptions: { onExcessProperty: "preserve" },
});
export const CoreDocumentFromJson = Schema.fromJsonString(CoreDocument);

export type CoreDocument = typeof CoreDocument.Type;
const CheckedCoreDocumentSchema = CoreDocument.pipe(Schema.brand("CheckedCoreDocument"));
export type CheckedCoreDocument = typeof CheckedCoreDocumentSchema.Type;

export type StateInvariantRelation = "establishes" | "preserves";

export interface StateInvariantObligation {
  readonly id: string;
  readonly stateMachine: string;
  readonly operation: string;
  readonly relation: StateInvariantRelation;
  readonly invariant: string;
}

export const stateInvariantObligationId = (
  stateMachine: string,
  operation: string,
  relation: StateInvariantRelation,
  invariant: string,
): string => `${stateMachine}.${operation}.${relation}.${invariant}`;

export const deriveStateInvariantObligations = (
  document: CheckedCoreDocument,
): ReadonlyArray<StateInvariantObligation> => {
  const obligations: Array<StateInvariantObligation> = [];
  for (const declaration of document.declarations) {
    if (declaration.kind !== "stateMachine") continue;
    for (const operation of declaration.initializers) {
      for (const invariant of declaration.invariants) {
        obligations.push({
          id: stateInvariantObligationId(declaration.id, operation.id, "establishes", invariant.id),
          stateMachine: declaration.id,
          operation: operation.id,
          relation: "establishes",
          invariant: invariant.id,
        });
      }
    }
    for (const operation of declaration.transitions) {
      for (const invariant of declaration.invariants) {
        obligations.push({
          id: stateInvariantObligationId(declaration.id, operation.id, "preserves", invariant.id),
          stateMachine: declaration.id,
          operation: operation.id,
          relation: "preserves",
          invariant: invariant.id,
        });
      }
    }
  }
  return obligations;
};

export type ServiceDeclaration = typeof ServiceDeclaration.Type;
export type DataDeclaration = typeof DataDeclaration.Type;
export type RefinementDeclaration = typeof RefinementDeclaration.Type;
export type TheoryDeclaration = typeof TheoryDeclaration.Type;
export type FiniteModelDeclaration = typeof FiniteModelDeclaration.Type;
export type StateMachineDeclaration = typeof StateMachineDeclaration.Type;
export type CapabilityDeclaration = typeof CapabilityDeclaration.Type;
export type OperationRealizationDeclaration = typeof OperationRealizationDeclaration.Type;
export type StatePredicate = typeof StatePredicate.Type;
export type StateOperation = typeof StateOperation.Type;
export type TheoryOperation = typeof TheoryOperation.Type;
export type TheoryLaw = typeof TheoryLaw.Type;
export type TheoryBridgeDeclaration = typeof TheoryBridgeDeclaration.Type;
export type TheoryBridgeLaw = typeof TheoryBridgeLaw.Type;

const builtInTypes = new Set(["String", "Integer"]);

export class SemanticError extends Schema.TaggedError<SemanticError>()("SemanticError", {
  message: Schema.String,
}) {}

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

const validateDataType = (
  scope: string,
  type: DataType,
  dataDeclarations: ReadonlyMap<string, DataDeclaration>,
): Effect.Effect<void, SemanticError> =>
  Effect.gen(function* () {
    if (type.kind === "reference") {
      if (!dataDeclarations.has(type.id)) {
        return yield* new SemanticError({
          message: `${scope} references unknown data ${type.id}`,
        });
      }
      return;
    }
    if (type.kind === "list") {
      yield* validateDataType(`${scope} list element`, type.element, dataDeclarations);
      return;
    }
    if (type.kind === "record") {
      yield* validateUnique(
        `${scope} record fields`,
        type.fields.map(({ id }) => id),
      );
      for (const field of type.fields) {
        yield* validateDataType(`${scope} record field ${field.id}`, field.type, dataDeclarations);
      }
    }
  });

const validateDataDeclaration = (
  declaration: DataDeclaration,
  dataDeclarations: ReadonlyMap<string, DataDeclaration>,
) =>
  Effect.gen(function* () {
    yield* validateUnique(
      `data ${declaration.id} constructors`,
      declaration.constructors.map(({ tag }) => tag),
    );
    for (const constructor of declaration.constructors) {
      if (constructor.fields.some(({ id }) => id === declaration.discriminator)) {
        return yield* new SemanticError({
          message: `constructor ${declaration.id}.${constructor.tag} field ${declaration.discriminator} conflicts with data discriminator`,
        });
      }
      yield* validateUnique(
        `constructor ${declaration.id}.${constructor.tag} fields`,
        constructor.fields.map(({ id }) => id),
      );
      for (const field of constructor.fields) {
        yield* validateDataType(
          `data ${declaration.id} constructor ${constructor.tag} field ${field.id}`,
          field.type,
          dataDeclarations,
        );
      }
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

const validateTheoryBridge = (
  bridge: TheoryBridgeDeclaration,
  theories: ReadonlyMap<string, TheoryDeclaration>,
) =>
  Effect.gen(function* () {
    if (bridge.participants.length !== 2) {
      return yield* new SemanticError({
        message: `theory bridge ${bridge.id} has ${bridge.participants.length} participants; M005 requires exactly 2`,
      });
    }
    yield* validateUnique(
      `theory bridge ${bridge.id} participants`,
      bridge.participants.map(({ id }) => id),
    );
    yield* validateUnique(
      `theory bridge ${bridge.id} shared sorts`,
      bridge.sharedSorts.map(({ id }) => id),
    );
    yield* validateUnique(
      `theory bridge ${bridge.id} laws`,
      bridge.laws.map(({ id }) => id),
    );

    const participantTheories = new Map<string, TheoryDeclaration>();
    for (const participant of bridge.participants) {
      const theory = theories.get(participant.theory);
      if (theory === undefined) {
        return yield* new SemanticError({
          message: `theory bridge ${bridge.id} participant ${participant.id} references unknown theory ${participant.theory}`,
        });
      }
      participantTheories.set(participant.id, theory);
    }

    for (const sharedSort of bridge.sharedSorts) {
      if (sharedSort.members.length !== bridge.participants.length) {
        return yield* new SemanticError({
          message: `theory bridge ${bridge.id} shared sort ${sharedSort.id} has ${sharedSort.members.length} members; expected one for each participant`,
        });
      }
      yield* validateUnique(
        `theory bridge ${bridge.id} shared sort ${sharedSort.id} participants`,
        sharedSort.members.map(({ participant }) => participant),
      );

      const representations = new Array<string | undefined>();
      for (const participant of bridge.participants) {
        const member = sharedSort.members.find(({ participant: id }) => id === participant.id);
        if (member === undefined) {
          return yield* new SemanticError({
            message: `theory bridge ${bridge.id} shared sort ${sharedSort.id} has no member for participant ${participant.id}`,
          });
        }
        const theory = participantTheories.get(participant.id);
        const sort = theory?.sorts.find(({ id }) => id === member.sort);
        if (sort === undefined) {
          return yield* new SemanticError({
            message: `theory bridge ${bridge.id} shared sort ${sharedSort.id} references unknown sort ${participant.id}.${member.sort}`,
          });
        }
        representations.push(sort.representation?.type);
      }
      if (representations.some((representation) => representation !== representations[0])) {
        return yield* new SemanticError({
          message: `theory bridge ${bridge.id} shared sort ${sharedSort.id} has incompatible participant representations`,
        });
      }
    }

    const sharedSorts = new Map(
      bridge.sharedSorts.map((sharedSort) => [sharedSort.id, sharedSort]),
    );
    const sharingFor = (participant: string, sort: string) =>
      bridge.sharedSorts.find((sharedSort) =>
        sharedSort.members.some(
          (member) => member.participant === participant && member.sort === sort,
        ),
      );

    const inferBridgeTermSort = (
      law: TheoryBridgeLaw,
      term: BridgeTerm,
    ): Effect.Effect<string, SemanticError> =>
      Effect.gen(function* () {
        if (term.kind === "variable") {
          const parameter = law.parameters.find(({ id }) => id === term.id);
          if (parameter === undefined) {
            return yield* new SemanticError({
              message: `bridge law ${bridge.id}.${law.id} references unknown variable ${term.id}`,
            });
          }
          return parameter.sort;
        }

        const theory = participantTheories.get(term.operation.participant);
        if (theory === undefined) {
          return yield* new SemanticError({
            message: `bridge law ${bridge.id}.${law.id} references unknown participant ${term.operation.participant}`,
          });
        }
        const operation = theory.operations.find(({ id }) => id === term.operation.operation);
        if (operation === undefined) {
          return yield* new SemanticError({
            message: `bridge law ${bridge.id}.${law.id} references unknown operation ${term.operation.participant}.${term.operation.operation}`,
          });
        }
        if (term.arguments.length !== operation.parameters.length) {
          return yield* new SemanticError({
            message: `bridge law ${bridge.id}.${law.id} applies ${term.operation.participant}.${operation.id} with ${term.arguments.length} arguments; expected ${operation.parameters.length}`,
          });
        }
        for (const [index, argument] of term.arguments.entries()) {
          const actual = yield* inferBridgeTermSort(law, argument);
          const participantSort = operation.parameters[index]?.sort;
          const expected =
            participantSort === undefined
              ? undefined
              : sharingFor(term.operation.participant, participantSort)?.id;
          if (expected === undefined) {
            return yield* new SemanticError({
              message: `bridge law ${bridge.id}.${law.id} operation ${term.operation.participant}.${operation.id} argument ${index + 1} sort ${participantSort} is not shared by the bridge`,
            });
          }
          if (actual !== expected) {
            return yield* new SemanticError({
              message: `bridge law ${bridge.id}.${law.id} gives ${term.operation.participant}.${operation.id} argument ${index + 1} shared sort ${actual}; expected ${expected}`,
            });
          }
        }
        const result = sharingFor(term.operation.participant, operation.result);
        if (result === undefined) {
          return yield* new SemanticError({
            message: `bridge law ${bridge.id}.${law.id} operation ${term.operation.participant}.${operation.id} result sort ${operation.result} is not shared by the bridge`,
          });
        }
        return result.id;
      });

    for (const law of bridge.laws) {
      yield* validateUnique(
        `bridge law ${bridge.id}.${law.id}`,
        law.parameters.map(({ id }) => id),
      );
      for (const parameter of law.parameters) {
        if (!sharedSorts.has(parameter.sort)) {
          return yield* new SemanticError({
            message: `bridge law ${bridge.id}.${law.id} references unknown shared sort ${parameter.sort}`,
          });
        }
      }
      const left = yield* inferBridgeTermSort(law, law.proposition.left);
      const right = yield* inferBridgeTermSort(law, law.proposition.right);
      if (left !== right) {
        return yield* new SemanticError({
          message: `bridge law ${bridge.id}.${law.id} compares shared sort ${left} with ${right}`,
        });
      }
    }
  });

const inferStateValueType = (
  machine: StateMachineDeclaration,
  scope: string,
  parameters: ReadonlyArray<{ readonly id: string; readonly type: string }>,
  stateAvailable: boolean,
  value: StateValue,
): Effect.Effect<string, SemanticError> =>
  Effect.gen(function* () {
    if (value.kind === "integerLiteral") return "Integer";
    if (value.kind === "parameter") {
      const parameter = parameters.find(({ id }) => id === value.id);
      if (parameter === undefined) {
        return yield* new SemanticError({
          message: `${scope} references unknown parameter ${value.id}`,
        });
      }
      return parameter.type;
    }
    if (!stateAvailable) {
      return yield* new SemanticError({
        message: `${scope} cannot observe state field ${value.field}`,
      });
    }
    const field = machine.state.fields.find(({ id }) => id === value.field);
    if (field === undefined) {
      return yield* new SemanticError({
        message: `${scope} references unknown state field ${value.field}`,
      });
    }
    return field.type;
  });

const validateStatePredicate = (
  machine: StateMachineDeclaration,
  scope: string,
  parameters: ReadonlyArray<{ readonly id: string; readonly type: string }>,
  stateAvailable: boolean,
  predicate: StatePredicate,
) =>
  Effect.gen(function* () {
    const left = yield* inferStateValueType(
      machine,
      scope,
      parameters,
      stateAvailable,
      predicate.left,
    );
    const right = yield* inferStateValueType(
      machine,
      scope,
      parameters,
      stateAvailable,
      predicate.right,
    );
    if (left !== "Integer" || right !== "Integer") {
      return yield* new SemanticError({
        message: `${scope} compares ${left} with ${right}; greaterThanOrEqual requires Integer operands`,
      });
    }
  });

const validateStateMachine = (machine: StateMachineDeclaration, knownTypes: ReadonlySet<string>) =>
  Effect.gen(function* () {
    yield* validateUnique(
      `state machine ${machine.id} fields`,
      machine.state.fields.map(({ id }) => id),
    );
    yield* validateUnique(
      `state machine ${machine.id} operations`,
      [...machine.initializers, ...machine.transitions].map(({ id }) => id),
    );
    yield* validateUnique(
      `state machine ${machine.id} invariants`,
      machine.invariants.map(({ id }) => id),
    );

    for (const field of machine.state.fields) {
      if (!knownTypes.has(field.type)) {
        return yield* new SemanticError({
          message: `state machine ${machine.id} field ${field.id} references unknown type ${field.type}`,
        });
      }
    }

    for (const operation of [...machine.initializers, ...machine.transitions]) {
      yield* validateUnique(
        `state operation ${machine.id}.${operation.id}`,
        operation.parameters.map(({ id }) => id),
      );
      yield* validateUnique(
        `state operation ${machine.id}.${operation.id} requirements`,
        operation.requires.map((requirement) => JSON.stringify(requirement)),
      );
      for (const parameter of operation.parameters) {
        if (!knownTypes.has(parameter.type)) {
          return yield* new SemanticError({
            message: `state operation ${machine.id}.${operation.id} parameter ${parameter.id} references unknown type ${parameter.type}`,
          });
        }
      }
      const stateAvailable = machine.transitions.some(({ id }) => id === operation.id);
      for (const requirement of operation.requires) {
        yield* validateStatePredicate(
          machine,
          `state operation ${machine.id}.${operation.id} requirement`,
          operation.parameters,
          stateAvailable,
          requirement,
        );
      }
    }

    for (const invariant of machine.invariants) {
      yield* validateStatePredicate(
        machine,
        `invariant ${machine.id}.${invariant.id}`,
        [],
        true,
        invariant.proposition,
      );
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

const validateCoreSemantics = (document: CoreDocument) =>
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
    const dataDeclarations = new Map(
      document.declarations
        .filter((declaration) => declaration.kind === "data")
        .map((declaration) => [declaration.id, declaration]),
    );
    const stateMachines = new Map(
      document.declarations
        .filter((declaration) => declaration.kind === "stateMachine")
        .map((declaration) => [declaration.id, declaration]),
    );
    const capabilities = new Set(
      document.declarations
        .filter((declaration) => declaration.kind === "capability")
        .map(({ id }) => id),
    );
    const declarationIdentities = new Set(document.declarations.map(({ id }) => id));
    const realizationFailureIdentities = new Set<string>();

    for (const declaration of document.declarations) {
      if (declaration.kind === "data") {
        yield* validateDataDeclaration(declaration, dataDeclarations);
        continue;
      }
      if (declaration.kind === "theory") {
        yield* validateTheory(declaration);
        continue;
      }
      if (declaration.kind === "theoryBridge") {
        yield* validateTheoryBridge(declaration, theories);
        continue;
      }
      if (declaration.kind === "stateMachine") {
        yield* validateStateMachine(declaration, knownTypes);
        continue;
      }
      if (declaration.kind === "capability") {
        continue;
      }
      if (declaration.kind === "operationRealization") {
        yield* validateUnique(
          `realization ${declaration.id} capabilities`,
          declaration.requires.map(({ capability }) => capability),
        );
        if (declarationIdentities.has(declaration.disabled.id)) {
          return yield* new SemanticError({
            message: `realization ${declaration.id} failure ${declaration.disabled.id} conflicts with a declaration identity`,
          });
        }
        if (realizationFailureIdentities.has(declaration.disabled.id)) {
          return yield* new SemanticError({
            message: `realization ${declaration.id} failure ${declaration.disabled.id} duplicates another realization failure`,
          });
        }
        realizationFailureIdentities.add(declaration.disabled.id);
        const machine = stateMachines.get(declaration.operation.stateMachine);
        if (machine === undefined) {
          return yield* new SemanticError({
            message: `realization ${declaration.id} references unknown state machine ${declaration.operation.stateMachine}`,
          });
        }
        const transition = machine.transitions.find(
          ({ id }) => id === declaration.operation.operation,
        );
        if (transition === undefined) {
          const initializer = machine.initializers.find(
            ({ id }) => id === declaration.operation.operation,
          );
          if (initializer !== undefined) {
            return yield* new SemanticError({
              message: `realization ${declaration.id} binds initializer ${machine.id}.${initializer.id}; expected transition`,
            });
          }
          return yield* new SemanticError({
            message: `realization ${declaration.id} references unknown transition ${machine.id}.${declaration.operation.operation}`,
          });
        }
        for (const requirement of declaration.requires) {
          if (!capabilities.has(requirement.capability)) {
            return yield* new SemanticError({
              message: `realization ${declaration.id} requires unknown capability ${requirement.capability}`,
            });
          }
        }
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

const CheckedCoreDocumentFromDecoded = CoreDocument.pipe(
  Schema.decodeTo(
    CheckedCoreDocumentSchema,
    SchemaTransformation.transformOrFail<CoreDocument, CoreDocument>({
      decode: (document, options) =>
        validateCoreSemantics(document).pipe(
          Effect.mapError(
            (error) => new SchemaIssue.InvalidValue({ message: error.message }, document, options),
          ),
        ),
      encode: (document) => Effect.succeed(document),
    }),
  ),
);

export const CheckedCoreDocumentFromJson = Schema.fromJsonString(CheckedCoreDocumentFromDecoded);

export const validateCore = (document: CoreDocument) =>
  Schema.decodeEffect(CheckedCoreDocumentFromDecoded)(document).pipe(
    Effect.mapError((issue) => new SemanticError({ message: String(issue) })),
  );

export interface TheoryGraphNode {
  readonly kind: "theory";
  readonly theory: string;
}

export interface TheoryGraphEdge {
  readonly kind: "bridge";
  readonly bridge: string;
  readonly sharedSorts: ReadonlyArray<string>;
  readonly laws: ReadonlyArray<string>;
}

export const buildTheoryGraph = Effect.fn("buildTheoryGraph")(function* (
  document: CheckedCoreDocument,
): Effect.fn.Return<Graph.UndirectedGraph<TheoryGraphNode, TheoryGraphEdge>, SemanticError> {
  const mutable = Graph.beginMutation(Graph.undirected<TheoryGraphNode, TheoryGraphEdge>());
  let indices = HashMap.empty<string, Graph.NodeIndex>();

  for (const declaration of document.declarations) {
    if (declaration.kind !== "theory") continue;
    const node: TheoryGraphNode = { kind: "theory", theory: declaration.id };
    const index = Graph.addNode(mutable, node);
    indices = HashMap.set(indices, declaration.id, index);
  }

  for (const declaration of document.declarations) {
    if (declaration.kind !== "theoryBridge") continue;
    const left = declaration.participants[0];
    const right = declaration.participants[1];
    if (left === undefined || right === undefined) {
      return yield* new SemanticError({
        message: `checked theory bridge ${declaration.id} lost its two participants`,
      });
    }
    const leftIndex = HashMap.get(indices, left.theory);
    const rightIndex = HashMap.get(indices, right.theory);
    if (Option.isNone(leftIndex) || Option.isNone(rightIndex)) {
      return yield* new SemanticError({
        message: `checked theory bridge ${declaration.id} lost a participant theory node`,
      });
    }
    Graph.addEdge(mutable, leftIndex.value, rightIndex.value, {
      kind: "bridge",
      bridge: declaration.id,
      sharedSorts: declaration.sharedSorts.map(({ id }) => id),
      laws: declaration.laws.map(({ id }) => id),
    });
  }

  return Graph.endMutation(mutable);
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

export * from "./normalization.ts";
export * from "./semantic-artifact.ts";
