import { Crypto, Effect, Encoding, Schema } from "effect";
import type {
  CheckedCoreDocument,
  CoreDocument,
  DataType,
  StateInvariantRelation,
} from "./index.ts";

const Identifier = Schema.String.pipe(Schema.check(Schema.isPattern(/^[A-Za-z][A-Za-z0-9]*$/u)));
const RepositoryRelativePath = Schema.String.pipe(Schema.check(Schema.isNonEmpty()));

/** A declaration-to-source mapping used by Core normalization. */
export const NormalizationProvenanceEntrySchema = Schema.Struct({
  declaration: Identifier,
  path: RepositoryRelativePath,
});

/** The complete material provenance supplied to one normalization run. */
export const NormalizationProvenanceSchema = Schema.Array(NormalizationProvenanceEntrySchema);
export type NormalizationProvenance = typeof NormalizationProvenanceSchema.Type;

export type NormalizedDependencyType =
  | "type-reference"
  | "data-reference"
  | "theory-reference"
  | "participant-theory"
  | "shared-sort-member"
  | "state-operation"
  | "capability-requirement"
  | "construct-member"
  | "model-theory"
  | "obligation-machine"
  | "obligation-operation"
  | "obligation-invariant";

export interface NormalizedDependency {
  readonly type: NormalizedDependencyType;
  readonly target: string;
}

/** The schema for the normalized dependency vocabulary. */
export const NormalizedDependencyTypeSchema = Schema.Literals([
  "type-reference",
  "data-reference",
  "theory-reference",
  "participant-theory",
  "shared-sort-member",
  "state-operation",
  "capability-requirement",
  "construct-member",
  "model-theory",
  "obligation-machine",
  "obligation-operation",
  "obligation-invariant",
]);

/** The checked shape of one typed normalized dependency edge. */
export const NormalizedDependencySchema: Schema.Codec<NormalizedDependency> = Schema.Struct({
  type: NormalizedDependencyTypeSchema,
  target: Schema.String,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});
export const NormalizedDependencyFromJson = Schema.fromJsonString(NormalizedDependencySchema);

export interface NormalizedConstruct {
  readonly address: string;
  readonly kind: string;
  readonly fingerprint: string;
  readonly directDependencies: ReadonlyArray<NormalizedDependency>;
  readonly dependencyClosure: ReadonlyArray<NormalizedDependency>;
  readonly materialProvenance: ReadonlyArray<string>;
}

/** The checked shape of one normalized construct node. */
export const NormalizedConstructSchema: Schema.Codec<NormalizedConstruct> = Schema.Struct({
  address: Schema.String,
  kind: Schema.String,
  fingerprint: Schema.String,
  directDependencies: Schema.Array(NormalizedDependencySchema),
  dependencyClosure: Schema.Array(NormalizedDependencySchema),
  materialProvenance: Schema.Array(Schema.String),
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});
export const NormalizedConstructFromJson = Schema.fromJsonString(NormalizedConstructSchema);
/** Alternate terminology for callers that refer to normalized constructs as nodes. */
export const NormalizedNodeSchema = NormalizedConstructSchema;
export const NormalizedNodeFromJson = NormalizedConstructFromJson;

export interface NormalizedCore {
  readonly nodes: ReadonlyArray<NormalizedConstruct>;
}

/** The checked normalized Core graph. */
export const NormalizedCoreSchema: Schema.Codec<NormalizedCore> = Schema.Struct({
  nodes: Schema.Array(NormalizedConstructSchema),
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

/** The JSON string codec for normalized Core. */
export const NormalizedCoreFromJson = Schema.fromJsonString(NormalizedCoreSchema);

export type NormalizationFailureReason =
  | "missing-provenance"
  | "duplicate-provenance"
  | "unknown-provenance-declaration"
  | "duplicate-address"
  | "missing-dependency-target"
  | "clean-parity"
  | "digest-failure";

export class NormalizationError extends Schema.TaggedError<NormalizationError>()(
  "NormalizationError",
  {
    reason: Schema.Literals([
      "missing-provenance",
      "duplicate-provenance",
      "unknown-provenance-declaration",
      "duplicate-address",
      "missing-dependency-target",
      "clean-parity",
      "digest-failure",
    ]),
    message: Schema.String,
    address: Schema.optional(Schema.String),
    target: Schema.optional(Schema.String),
  },
) {}

export type NormalizationStatus = "changed" | "added" | "removed" | "reused";

export interface ComparisonResult {
  readonly address: string;
  readonly status: NormalizationStatus;
  readonly baselineFingerprint?: string;
  readonly candidateFingerprint?: string;
  readonly invalidatedBy: ReadonlyArray<NormalizedDependency>;
}

export interface NormalizedCoreComparison {
  readonly results: ReadonlyArray<ComparisonResult>;
  readonly incrementalCandidate: NormalizedCore;
  readonly cleanCandidate: NormalizedCore;
  readonly cleanParity: boolean;
}

type CoreDeclaration = CoreDocument["declarations"][number];
type NormalizationDraft = {
  readonly address: string;
  readonly kind: string;
  readonly semantic: unknown;
  readonly declaration: string;
  readonly directDependencies: ReadonlyArray<NormalizedDependency>;
  readonly path: string;
};

type ObligationRecord = {
  readonly id: string;
  readonly stateMachine: string;
  readonly operation: string;
  readonly relation: StateInvariantRelation;
  readonly invariant: string;
};

const dependencyTypeOrder: ReadonlyArray<NormalizedDependencyType> = [
  "type-reference",
  "data-reference",
  "theory-reference",
  "participant-theory",
  "shared-sort-member",
  "state-operation",
  "capability-requirement",
  "construct-member",
  "model-theory",
  "obligation-machine",
  "obligation-operation",
  "obligation-invariant",
];

const dependencyTypeRank = (type: NormalizedDependencyType): number =>
  dependencyTypeOrder.indexOf(type);

const addressFor = (kind: string, id: string): string => `${kind}:${id}`;
const nestedAddressFor = (kind: string, id: string, segment: string): string =>
  `${kind}:${id}.${segment}`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export type CanonicalJson =
  | null
  | boolean
  | number
  | string
  | ReadonlyArray<CanonicalJson>
  | {
      readonly [key: string]: CanonicalJson;
    };

/** Recursively sort object keys while preserving the semantic order of arrays. */
export const canonicalizeSemanticJson = (value: unknown): CanonicalJson => {
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) return value.map(canonicalizeSemanticJson);
  if (isRecord(value)) {
    const result: Record<string, CanonicalJson> = {};
    for (const key of Object.keys(value).toSorted()) {
      result[key] = canonicalizeSemanticJson(value[key]);
    }
    return result;
  }
  return String(value);
};

/** Encode any semantic JSON value with deterministic object-key ordering. */
export const encodeCanonicalJson = (value: unknown): string =>
  JSON.stringify(canonicalizeSemanticJson(value));

/** Backward-compatible short name for the canonical JSON encoder. */
export const canonicalJson = encodeCanonicalJson;

const semanticJson = encodeCanonicalJson;

const sortedDependencies = (
  dependencies: ReadonlyArray<NormalizedDependency>,
): ReadonlyArray<NormalizedDependency> =>
  [
    ...new Map(
      dependencies.map((dependency) => [
        `${dependency.type}\u0000${dependency.target}`,
        dependency,
      ]),
    ).values(),
  ].toSorted(
    (left, right) =>
      dependencyTypeRank(left.type) - dependencyTypeRank(right.type) ||
      (left.target < right.target ? -1 : left.target > right.target ? 1 : 0),
  );

const dependency = (type: NormalizedDependencyType, target: string): NormalizedDependency => ({
  type,
  target,
});

const addDependencies = (
  output: Array<NormalizedDependency>,
  dependencies: ReadonlyArray<NormalizedDependency>,
): void => {
  output.push(...dependencies);
};

const typeDependency = (
  id: string,
  declarationById: ReadonlyMap<string, CoreDeclaration>,
): NormalizedDependency | undefined => {
  if (id === "String" || id === "Integer") return undefined;
  const declaration = declarationById.get(id);
  if (declaration?.kind === "data") return dependency("data-reference", addressFor("data", id));
  if (declaration?.kind === "refinement") {
    return dependency("type-reference", addressFor("refinement", id));
  }
  return dependency("type-reference", `type:${id}`);
};

const dataTypeDependencies = (
  type: DataType,
  declarationById: ReadonlyMap<string, CoreDeclaration>,
): ReadonlyArray<NormalizedDependency> => {
  if (type.kind === "builtin") return [];
  if (type.kind === "reference") {
    const result = typeDependency(type.id, declarationById);
    return result === undefined ? [] : [result];
  }
  if (type.kind === "list") return dataTypeDependencies(type.element, declarationById);
  return type.fields.flatMap((field) => dataTypeDependencies(field.type, declarationById));
};

const stateValueDependencies = (
  stateMachine: string,
  stateId: string,
  value: { readonly kind: string; readonly field?: string },
): ReadonlyArray<NormalizedDependency> =>
  value.kind === "stateField" && value.field !== undefined
    ? [
        dependency(
          "state-operation",
          nestedAddressFor("stateMachine", stateMachine, `state:${stateId}.field:${value.field}`),
        ),
      ]
    : [];

const statePredicateDependencies = (
  stateMachine: string,
  stateId: string,
  predicate: {
    readonly left: { readonly kind: string; readonly field?: string };
    readonly right: { readonly kind: string; readonly field?: string };
  },
): ReadonlyArray<NormalizedDependency> => [
  ...stateValueDependencies(stateMachine, stateId, predicate.left),
  ...stateValueDependencies(stateMachine, stateId, predicate.right),
];

const theoryTermDependencies = (
  theory: string,
  term: unknown,
): ReadonlyArray<NormalizedDependency> => {
  if (!isRecord(term)) return [];
  if (term.kind === "variable") return [];
  if (term.kind !== "application" || typeof term.operation !== "string") return [];
  return [
    dependency(
      "theory-reference",
      nestedAddressFor("theory", theory, `operation:${term.operation}`),
    ),
    ...(Array.isArray(term.arguments)
      ? term.arguments.flatMap((argument) => theoryTermDependencies(theory, argument))
      : []),
  ];
};

const bridgeTermDependencies = (
  participantTheories: ReadonlyMap<string, string>,
  term: unknown,
): ReadonlyArray<NormalizedDependency> => {
  if (!isRecord(term)) return [];
  if (term.kind === "variable") return [];
  if (term.kind !== "application" || !isRecord(term.operation)) return [];
  const participant =
    typeof term.operation.participant === "string" ? term.operation.participant : "";
  const operation = typeof term.operation.operation === "string" ? term.operation.operation : "";
  const theory = participantTheories.get(participant) ?? participant;
  return [
    dependency("theory-reference", nestedAddressFor("theory", theory, `operation:${operation}`)),
    ...(Array.isArray(term.arguments)
      ? term.arguments.flatMap((argument) => bridgeTermDependencies(participantTheories, argument))
      : []),
  ];
};

const deriveObligationRecords = (
  document: CheckedCoreDocument,
): ReadonlyArray<ObligationRecord> => {
  const result: Array<ObligationRecord> = [];
  for (const declaration of document.declarations) {
    if (declaration.kind !== "stateMachine") continue;
    for (const operation of declaration.initializers) {
      for (const invariant of declaration.invariants) {
        result.push({
          id: `${declaration.id}.${operation.id}.establishes.${invariant.id}`,
          stateMachine: declaration.id,
          operation: operation.id,
          relation: "establishes",
          invariant: invariant.id,
        });
      }
    }
    for (const operation of declaration.transitions) {
      for (const invariant of declaration.invariants) {
        result.push({
          id: `${declaration.id}.${operation.id}.preserves.${invariant.id}`,
          stateMachine: declaration.id,
          operation: operation.id,
          relation: "preserves",
          invariant: invariant.id,
        });
      }
    }
  }
  return result;
};

const buildDrafts = (
  document: CheckedCoreDocument,
  paths: ReadonlyMap<string, string>,
): ReadonlyArray<NormalizationDraft> => {
  const declarations = document.declarations;
  const declarationById = new Map(declarations.map((declaration) => [declaration.id, declaration]));
  const drafts: Array<NormalizationDraft> = [];
  const add = (
    address: string,
    kind: string,
    semantic: unknown,
    declaration: string,
    directDependencies: ReadonlyArray<NormalizedDependency> = [],
  ): void => {
    drafts.push({
      address,
      kind,
      semantic,
      declaration,
      directDependencies: sortedDependencies(directDependencies),
      path: paths.get(declaration) ?? "",
    });
  };

  for (const declaration of declarations) {
    const rootAddress = addressFor(declaration.kind, declaration.id);
    const rootDependencies: Array<NormalizedDependency> = [];
    if (declaration.kind === "data") {
      for (const constructor of declaration.constructors) {
        const constructorAddress = nestedAddressFor(
          "data",
          declaration.id,
          `constructor:${constructor.tag}`,
        );
        add(constructorAddress, "constructor", constructor, declaration.id);
        for (const field of constructor.fields) {
          add(
            `${constructorAddress}.field:${field.id}`,
            "field",
            field,
            declaration.id,
            dataTypeDependencies(field.type, declarationById),
          );
          addDependencies(rootDependencies, dataTypeDependencies(field.type, declarationById));
        }
      }
      addDependencies(
        rootDependencies,
        declaration.constructors.flatMap((constructor) =>
          constructor.fields.flatMap((field) => dataTypeDependencies(field.type, declarationById)),
        ),
      );
    } else if (declaration.kind === "service") {
      for (const operation of declaration.operations) {
        const operationAddress = nestedAddressFor(
          "service",
          declaration.id,
          `operation:${operation.id}`,
        );
        const operationDependencies = operation.parameters.flatMap((parameter) => {
          const result = typeDependency(parameter.type, declarationById);
          return result === undefined ? [] : [result];
        });
        const resultDependency = typeDependency(operation.result, declarationById);
        if (resultDependency !== undefined) operationDependencies.push(resultDependency);
        add(operationAddress, "operation", operation, declaration.id, operationDependencies);
        for (const parameter of operation.parameters) {
          const parameterDependency = typeDependency(parameter.type, declarationById);
          add(
            `${operationAddress}.parameter:${parameter.id}`,
            "parameter",
            parameter,
            declaration.id,
            parameterDependency === undefined ? [] : [parameterDependency],
          );
        }
        addDependencies(rootDependencies, operationDependencies);
      }
    } else if (declaration.kind === "refinement") {
      add(
        nestedAddressFor("refinement", declaration.id, "predicate"),
        "predicate",
        declaration.predicate,
        declaration.id,
      );
    } else if (declaration.kind === "theory") {
      for (const sort of declaration.sorts) {
        add(
          nestedAddressFor("theory", declaration.id, `sort:${sort.id}`),
          "sort",
          sort,
          declaration.id,
        );
      }
      for (const operation of declaration.operations) {
        const operationAddress = nestedAddressFor(
          "theory",
          declaration.id,
          `operation:${operation.id}`,
        );
        const operationDependencies: Array<NormalizedDependency> = [];
        for (const parameter of operation.parameters) {
          operationDependencies.push(
            dependency(
              "theory-reference",
              nestedAddressFor("theory", declaration.id, `sort:${parameter.sort}`),
            ),
          );
          add(
            `${operationAddress}.parameter:${parameter.id}`,
            "parameter",
            parameter,
            declaration.id,
            [
              dependency(
                "theory-reference",
                nestedAddressFor("theory", declaration.id, `sort:${parameter.sort}`),
              ),
            ],
          );
        }
        operationDependencies.push(
          dependency(
            "theory-reference",
            nestedAddressFor("theory", declaration.id, `sort:${operation.result}`),
          ),
        );
        add(operationAddress, "operation", operation, declaration.id, operationDependencies);
      }
      for (const law of declaration.laws) {
        const lawDependencies = [
          ...law.parameters.map((parameter) =>
            dependency(
              "theory-reference",
              nestedAddressFor("theory", declaration.id, `sort:${parameter.sort}`),
            ),
          ),
          ...theoryTermDependencies(declaration.id, law.proposition.left),
          ...theoryTermDependencies(declaration.id, law.proposition.right),
        ];
        const lawAddress = nestedAddressFor("theory", declaration.id, `law:${law.id}`);
        add(lawAddress, "law", law, declaration.id, lawDependencies);
        for (const parameter of law.parameters) {
          add(`${lawAddress}.parameter:${parameter.id}`, "parameter", parameter, declaration.id, [
            dependency(
              "theory-reference",
              nestedAddressFor("theory", declaration.id, `sort:${parameter.sort}`),
            ),
          ]);
        }
      }
    } else if (declaration.kind === "theoryBridge") {
      const participantTheories = new Map(
        declaration.participants.map((participant) => [participant.id, participant.theory]),
      );
      for (const participant of declaration.participants) {
        const target = addressFor("theory", participant.theory);
        add(
          nestedAddressFor("theoryBridge", declaration.id, `participant:${participant.id}`),
          "participant",
          participant,
          declaration.id,
          [dependency("participant-theory", target)],
        );
        rootDependencies.push(dependency("participant-theory", target));
      }
      for (const sharedSort of declaration.sharedSorts) {
        const sharedSortAddress = nestedAddressFor(
          "theoryBridge",
          declaration.id,
          `sharedSort:${sharedSort.id}`,
        );
        const sharedSortDependencies = sharedSort.members.map((member) => {
          const theory = participantTheories.get(member.participant) ?? member.participant;
          return dependency(
            "shared-sort-member",
            nestedAddressFor("theory", theory, `sort:${member.sort}`),
          );
        });
        add(sharedSortAddress, "sharedSort", sharedSort, declaration.id, sharedSortDependencies);
        addDependencies(rootDependencies, sharedSortDependencies);
        for (const member of sharedSort.members) {
          const theory = participantTheories.get(member.participant) ?? member.participant;
          add(
            `${sharedSortAddress}.member:${member.participant}.${member.sort}`,
            "sharedSortMember",
            member,
            declaration.id,
            [
              dependency(
                "shared-sort-member",
                nestedAddressFor("theory", theory, `sort:${member.sort}`),
              ),
            ],
          );
        }
      }
      for (const law of declaration.laws) {
        const lawDependencies = [
          ...law.parameters.map((parameter) =>
            dependency(
              "shared-sort-member",
              nestedAddressFor("theoryBridge", declaration.id, `sharedSort:${parameter.sort}`),
            ),
          ),
          ...bridgeTermDependencies(participantTheories, law.proposition.left),
          ...bridgeTermDependencies(participantTheories, law.proposition.right),
        ];
        const lawAddress = nestedAddressFor("theoryBridge", declaration.id, `law:${law.id}`);
        add(lawAddress, "law", law, declaration.id, lawDependencies);
        for (const parameter of law.parameters) {
          add(`${lawAddress}.parameter:${parameter.id}`, "parameter", parameter, declaration.id, [
            dependency(
              "shared-sort-member",
              nestedAddressFor("theoryBridge", declaration.id, `sharedSort:${parameter.sort}`),
            ),
          ]);
        }
        addDependencies(rootDependencies, lawDependencies);
      }
    } else if (declaration.kind === "stateMachine") {
      const stateAddress = nestedAddressFor(
        "stateMachine",
        declaration.id,
        `state:${declaration.state.id}`,
      );
      add(stateAddress, "state", declaration.state, declaration.id);
      for (const field of declaration.state.fields) {
        const fieldDependency = typeDependency(field.type, declarationById);
        add(
          `${stateAddress}.field:${field.id}`,
          "field",
          field,
          declaration.id,
          fieldDependency === undefined ? [] : [fieldDependency],
        );
        if (fieldDependency !== undefined) rootDependencies.push(fieldDependency);
      }
      const operations = [
        ...declaration.initializers.map((operation) => ["initializer", operation] as const),
        ...declaration.transitions.map((operation) => ["transition", operation] as const),
      ];
      for (const [relation, operation] of operations) {
        const operationAddress = nestedAddressFor(
          "stateMachine",
          declaration.id,
          `${relation}:${operation.id}`,
        );
        const operationDependencies = operation.parameters.flatMap((parameter) => {
          const result = typeDependency(parameter.type, declarationById);
          return result === undefined ? [] : [result];
        });
        operationDependencies.push(
          ...operation.requires.flatMap((predicate) =>
            statePredicateDependencies(declaration.id, declaration.state.id, predicate),
          ),
        );
        add(operationAddress, "stateOperation", operation, declaration.id, operationDependencies);
        for (const parameter of operation.parameters) {
          const parameterDependency = typeDependency(parameter.type, declarationById);
          add(
            `${operationAddress}.parameter:${parameter.id}`,
            "parameter",
            parameter,
            declaration.id,
            parameterDependency === undefined ? [] : [parameterDependency],
          );
        }
        for (const requirement of operation.requires) {
          const requirementAddress = `${operationAddress}.requirement:${semanticJson(requirement)}`;
          add(
            requirementAddress,
            "requirement",
            requirement,
            declaration.id,
            statePredicateDependencies(declaration.id, declaration.state.id, requirement),
          );
        }
        addDependencies(rootDependencies, operationDependencies);
      }
      for (const invariant of declaration.invariants) {
        const invariantAddress = nestedAddressFor(
          "stateMachine",
          declaration.id,
          `invariant:${invariant.id}`,
        );
        const invariantDependencies = statePredicateDependencies(
          declaration.id,
          declaration.state.id,
          invariant.proposition,
        );
        add(invariantAddress, "invariant", invariant, declaration.id, invariantDependencies);
        addDependencies(rootDependencies, invariantDependencies);
      }
    } else if (declaration.kind === "capability") {
      // Capabilities have no nested semantic constructs.
    } else if (declaration.kind === "operationRealization") {
      const operationAddress = nestedAddressFor(
        "operationRealization",
        declaration.id,
        "operation",
      );
      const stateOperationAddress = nestedAddressFor(
        "stateMachine",
        declaration.operation.stateMachine,
        `transition:${declaration.operation.operation}`,
      );
      add(operationAddress, "operation", declaration.operation, declaration.id, [
        dependency("state-operation", stateOperationAddress),
      ]);
      rootDependencies.push(dependency("construct-member", operationAddress));
      for (const requirement of declaration.requires) {
        const requirementAddress = nestedAddressFor(
          "operationRealization",
          declaration.id,
          `requirement:${requirement.capability}`,
        );
        const requirementDependency = dependency(
          "capability-requirement",
          addressFor("capability", requirement.capability),
        );
        add(requirementAddress, "capabilityRequirement", requirement, declaration.id, [
          requirementDependency,
        ]);
        rootDependencies.push(dependency("construct-member", requirementAddress));
      }
      const disabledAddress = nestedAddressFor(
        "operationRealization",
        declaration.id,
        `disabled:${declaration.disabled.id}`,
      );
      add(disabledAddress, "disabled", declaration.disabled, declaration.id);
      rootDependencies.push(dependency("construct-member", disabledAddress));
      const {
        operation: _operation,
        requires: _requires,
        disabled: _disabled,
        ...rootSemantic
      } = declaration;
      add(rootAddress, declaration.kind, rootSemantic, declaration.id, rootDependencies);
      continue;
    } else if (declaration.kind === "finiteModel") {
      const theoryDependency = dependency("model-theory", addressFor("theory", declaration.theory));
      rootDependencies.push(theoryDependency);
      for (const carrier of declaration.carriers) {
        const carrierAddress = nestedAddressFor(
          "finiteModel",
          declaration.id,
          `carrier:${carrier.sort}`,
        );
        const carrierDependency = dependency(
          "theory-reference",
          nestedAddressFor("theory", declaration.theory, `sort:${carrier.sort}`),
        );
        add(carrierAddress, "carrier", carrier, declaration.id, [carrierDependency]);
        for (const element of carrier.elements) {
          add(`${carrierAddress}.element:${element}`, "element", element, declaration.id, [
            carrierDependency,
          ]);
        }
      }
      for (const operation of declaration.operations) {
        const operationAddress = nestedAddressFor(
          "finiteModel",
          declaration.id,
          `operation:${operation.operation}`,
        );
        const operationDependency = dependency(
          "theory-reference",
          nestedAddressFor("theory", declaration.theory, `operation:${operation.operation}`),
        );
        add(operationAddress, "operation", operation, declaration.id, [operationDependency]);
        for (const row of operation.rows) {
          add(
            `${operationAddress}.row:${semanticJson(row.arguments)}`,
            "row",
            row,
            declaration.id,
            [operationDependency],
          );
        }
      }
    }
    add(rootAddress, declaration.kind, declaration, declaration.id, rootDependencies);
  }

  for (const obligation of deriveObligationRecords(document)) {
    const machine = declarationById.get(obligation.stateMachine);
    if (machine?.kind !== "stateMachine") continue;
    const operation = [...machine.initializers, ...machine.transitions].find(
      ({ id }) => id === obligation.operation,
    );
    const invariant = machine.invariants.find(({ id }) => id === obligation.invariant);
    if (operation === undefined || invariant === undefined) continue;
    const operationAddress = nestedAddressFor(
      "stateMachine",
      obligation.stateMachine,
      `${obligation.relation === "establishes" ? "initializer" : "transition"}:${obligation.operation}`,
    );
    const invariantAddress = nestedAddressFor(
      "stateMachine",
      obligation.stateMachine,
      `invariant:${obligation.invariant}`,
    );
    add(
      addressFor("obligation", obligation.id),
      "obligation",
      {
        kind: "obligation",
        id: obligation.id,
        stateMachine: obligation.stateMachine,
        operation: obligation.operation,
        relation: obligation.relation,
        invariant: obligation.invariant,
        operationDefinition: operation,
        invariantDefinition: invariant,
      },
      obligation.stateMachine,
      [
        dependency("obligation-machine", addressFor("stateMachine", obligation.stateMachine)),
        dependency("obligation-operation", operationAddress),
        dependency("obligation-invariant", invariantAddress),
      ],
    );
  }

  return drafts;
};

const closureFor = (
  address: string,
  draftsByAddress: ReadonlyMap<string, NormalizationDraft>,
): ReadonlyArray<NormalizedDependency> => {
  const found = draftsByAddress.get(address);
  if (found === undefined) return [];
  const expandedTargets = new Set<string>([address]);
  const closure: Array<NormalizedDependency> = [];
  const visit = (current: string): void => {
    const draft = draftsByAddress.get(current);
    if (draft === undefined) return;
    for (const currentDependency of draft.directDependencies) {
      if (currentDependency.target === address) continue;
      closure.push(currentDependency);
      if (expandedTargets.has(currentDependency.target)) continue;
      expandedTargets.add(currentDependency.target);
      visit(currentDependency.target);
    }
  };
  visit(address);
  return sortedDependencies(closure);
};

const equalDependencies = (
  left: ReadonlyArray<NormalizedDependency>,
  right: ReadonlyArray<NormalizedDependency>,
): boolean =>
  left.length === right.length &&
  left.every(
    (dependencyValue, index) =>
      dependencyValue.type === right[index]?.type &&
      dependencyValue.target === right[index]?.target,
  );

const equalStrings = (left: ReadonlyArray<string>, right: ReadonlyArray<string>): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index]);

const equalNodes = (left: NormalizedCore, right: NormalizedCore): boolean =>
  left.nodes.length === right.nodes.length &&
  left.nodes.every((leftNode, index) => {
    const rightNode = right.nodes[index];
    return (
      rightNode !== undefined &&
      leftNode.address === rightNode.address &&
      leftNode.kind === rightNode.kind &&
      leftNode.fingerprint === rightNode.fingerprint &&
      equalDependencies(leftNode.directDependencies, rightNode.directDependencies) &&
      equalDependencies(leftNode.dependencyClosure, rightNode.dependencyClosure) &&
      equalStrings(leftNode.materialProvenance, rightNode.materialProvenance)
    );
  });

export const normalizeCore = Effect.fn("normalizeCore")(function* (
  document: CheckedCoreDocument,
  provenance: NormalizationProvenance,
): Effect.fn.Return<NormalizedCore, NormalizationError, Crypto.Crypto> {
  const paths = new Map<string, string>();
  for (const entry of provenance) {
    if (paths.has(entry.declaration)) {
      return yield* new NormalizationError({
        reason: "duplicate-provenance",
        message: `normalization provenance repeats declaration ${entry.declaration}`,
        address: entry.declaration,
      });
    }
    paths.set(entry.declaration, entry.path);
  }
  const declarationById = new Map(
    document.declarations.map((declaration) => [declaration.id, declaration]),
  );
  for (const entry of provenance) {
    if (!declarationById.has(entry.declaration)) {
      return yield* new NormalizationError({
        reason: "unknown-provenance-declaration",
        message: `normalization provenance names unknown declaration ${entry.declaration}`,
        address: entry.declaration,
      });
    }
  }
  for (const declaration of document.declarations) {
    if (!paths.has(declaration.id)) {
      return yield* new NormalizationError({
        reason: "missing-provenance",
        message: `normalization provenance omits declaration ${declaration.id}`,
        address: addressFor(declaration.kind, declaration.id),
      });
    }
  }

  const drafts = buildDrafts(document, paths);
  const draftsByAddress = new Map<string, NormalizationDraft>();
  for (const draft of drafts) {
    if (draftsByAddress.has(draft.address)) {
      return yield* new NormalizationError({
        reason: "duplicate-address",
        message: `normalization produced duplicate construct address ${draft.address}`,
        address: draft.address,
      });
    }
    draftsByAddress.set(draft.address, draft);
  }
  for (const draft of drafts) {
    for (const currentDependency of draft.directDependencies) {
      if (!draftsByAddress.has(currentDependency.target)) {
        return yield* new NormalizationError({
          reason: "missing-dependency-target",
          message: `${draft.address} depends on absent ${currentDependency.target}`,
          address: draft.address,
          target: currentDependency.target,
        });
      }
    }
  }

  const crypto = yield* Crypto.Crypto;
  const fingerprints = new Map<string, string>();
  for (const draft of drafts) {
    const bytes = new TextEncoder().encode(semanticJson(draft.semantic));
    const digest = yield* crypto.digest("SHA-256", bytes).pipe(
      Effect.mapError(
        () =>
          new NormalizationError({
            reason: "digest-failure",
            message: `could not compute SHA-256 for ${draft.address}`,
            address: draft.address,
          }),
      ),
    );
    fingerprints.set(draft.address, Encoding.encodeHex(digest));
  }

  const nodes = drafts
    .map((draft): NormalizedConstruct => {
      const closure = closureFor(draft.address, draftsByAddress);
      const materialProvenance =
        draft.kind === "obligation"
          ? [
              ...new Set([
                draft.path,
                ...closure.flatMap(
                  (currentDependency) => draftsByAddress.get(currentDependency.target)?.path ?? "",
                ),
              ]),
            ]
              .filter((path) => path.length > 0)
              .toSorted()
          : [draft.path];
      return {
        address: draft.address,
        kind: draft.kind,
        fingerprint: fingerprints.get(draft.address) ?? "",
        directDependencies: draft.directDependencies,
        dependencyClosure: closure,
        materialProvenance: materialProvenance,
      };
    })
    .toSorted((left, right) =>
      left.address < right.address ? -1 : left.address > right.address ? 1 : 0,
    );

  return { nodes };
});

const changedPremises = (
  baseline: NormalizedConstruct | undefined,
  candidate: NormalizedConstruct,
  baselineByAddress: ReadonlyMap<string, NormalizedConstruct>,
  candidateByAddress: ReadonlyMap<string, NormalizedConstruct>,
  statuses: ReadonlyMap<string, NormalizationStatus>,
): ReadonlyArray<NormalizedDependency> => {
  const changes = new Map<string, NormalizedDependency>();
  const add = (value: NormalizedDependency): void => {
    changes.set(`${value.type}\u0000${value.target}`, value);
  };
  for (const currentDependency of candidate.directDependencies) {
    const oldDependency = baseline?.directDependencies.find(
      (dependencyValue) =>
        dependencyValue.type === currentDependency.type &&
        dependencyValue.target === currentDependency.target,
    );
    if (oldDependency === undefined || statuses.get(currentDependency.target) !== "reused")
      add(currentDependency);
  }
  for (const currentDependency of candidate.dependencyClosure) {
    const status = statuses.get(currentDependency.target);
    const baselinePremise = baselineByAddress.get(currentDependency.target);
    const candidatePremise = candidateByAddress.get(currentDependency.target);
    if (status !== "reused" || baselinePremise?.fingerprint !== candidatePremise?.fingerprint)
      add(currentDependency);
  }
  if (baseline !== undefined) {
    for (const previousDependency of baseline.dependencyClosure) {
      if (!candidateByAddress.has(previousDependency.target)) add(previousDependency);
    }
  }
  return sortedDependencies([...changes.values()]);
};

/** Verifies that an incrementally assembled Core equals its authoritative clean normalization. */
export const verifyCleanParity = Effect.fn("verifyCleanParity")(function* (
  incremental: NormalizedCore,
  clean: NormalizedCore,
): Effect.fn.Return<void, NormalizationError> {
  if (!equalNodes(incremental, clean)) {
    return yield* new NormalizationError({
      reason: "clean-parity",
      message: "incremental normalization does not equal the clean candidate",
    });
  }
});

export const compareNormalizedCore = Effect.fn("compareNormalizedCore")(function* (
  baseline: NormalizedCore,
  candidate: NormalizedCore,
): Effect.fn.Return<NormalizedCoreComparison, NormalizationError> {
  const baselineByAddress = new Map(baseline.nodes.map((node) => [node.address, node]));
  const candidateByAddress = new Map(candidate.nodes.map((node) => [node.address, node]));
  const addresses = [
    ...new Set([...baselineByAddress.keys(), ...candidateByAddress.keys()]),
  ].toSorted();
  const preliminaryStatuses = new Map<string, NormalizationStatus>();
  for (const address of addresses) {
    const oldNode = baselineByAddress.get(address);
    const newNode = candidateByAddress.get(address);
    if (oldNode === undefined) preliminaryStatuses.set(address, "added");
    else if (newNode === undefined) preliminaryStatuses.set(address, "removed");
    else if (oldNode.fingerprint !== newNode.fingerprint)
      preliminaryStatuses.set(address, "changed");
    else preliminaryStatuses.set(address, "reused");
  }

  const results: Array<ComparisonResult> = [];
  for (const address of addresses) {
    const baselineNode = baselineByAddress.get(address);
    const candidateNode = candidateByAddress.get(address);
    if (candidateNode === undefined) {
      results.push({
        address,
        status: "removed",
        ...(baselineNode?.fingerprint === undefined
          ? {}
          : { baselineFingerprint: baselineNode.fingerprint }),
        invalidatedBy: [],
      });
      continue;
    }
    if (baselineNode === undefined) {
      results.push({
        address,
        status: "added",
        candidateFingerprint: candidateNode.fingerprint,
        invalidatedBy: [],
      });
      continue;
    }
    const invalidatedBy = changedPremises(
      baselineNode,
      candidateNode,
      baselineByAddress,
      candidateByAddress,
      preliminaryStatuses,
    );
    const reusable =
      baselineNode.fingerprint === candidateNode.fingerprint &&
      equalDependencies(baselineNode.directDependencies, candidateNode.directDependencies) &&
      equalDependencies(baselineNode.dependencyClosure, candidateNode.dependencyClosure) &&
      invalidatedBy.length === 0;
    const status: NormalizationStatus = reusable ? "reused" : "changed";
    results.push({
      address,
      status,
      baselineFingerprint: baselineNode.fingerprint,
      candidateFingerprint: candidateNode.fingerprint,
      invalidatedBy,
    });
  }

  const incrementalCandidate: NormalizedCore = {
    nodes: candidate.nodes.map((candidateNode) => {
      const result = results.find((entry) => entry.address === candidateNode.address);
      const baselineNode = baselineByAddress.get(candidateNode.address);
      if (result?.status !== "reused" || baselineNode === undefined) return candidateNode;
      return {
        ...baselineNode,
        materialProvenance: candidateNode.materialProvenance,
      };
    }),
  };
  yield* verifyCleanParity(incrementalCandidate, candidate);
  return {
    results,
    incrementalCandidate,
    cleanCandidate: candidate,
    cleanParity: true,
  };
});
