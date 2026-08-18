import type {
  CapabilityDeclaration,
  CoreDocument,
  OperationRealizationDeclaration,
  StateMachineDeclaration,
  StateOperation,
  StatePredicate,
  StateValue,
} from "@bang/core";
import { Result, Schema } from "effect";

export interface SourcePosition {
  readonly offset: number;
  readonly line: number;
  readonly column: number;
}

export interface SourceSpan {
  readonly start: SourcePosition;
  readonly end: SourcePosition;
}

const SourcePositionSchema = Schema.Struct({
  offset: Schema.Natural,
  line: Schema.Natural.check(Schema.isGreaterThan(0)),
  column: Schema.Natural.check(Schema.isGreaterThan(0)),
});

const SourceSpanSchema = Schema.Struct({
  start: SourcePositionSchema,
  end: SourcePositionSchema,
}).check(
  Schema.makeFilter(({ start, end }) => start.offset <= end.offset, {
    expected: "a source span whose start offset is at most its end offset",
  }),
);

export class SourceParseError extends Schema.TaggedError<SourceParseError>()("SourceParseError", {
  reason: Schema.Literals([
    "unexpected-token",
    "unexpected-end",
    "invalid-character",
    "rule-table",
  ]),
  span: SourceSpanSchema,
  found: Schema.String,
  expected: Schema.NonEmptyArray(Schema.String),
  message: Schema.String,
}) {}

interface SurfaceValueIdentifier {
  readonly kind: "identifier";
  readonly id: string;
  readonly span: SourceSpan;
}

interface SurfaceValueInteger {
  readonly kind: "integerLiteral";
  readonly value: string;
  readonly span: SourceSpan;
}

type SurfaceValue = SurfaceValueIdentifier | SurfaceValueInteger;

interface SurfacePredicate {
  readonly kind: "greaterThanOrEqual";
  readonly left: SurfaceValue;
  readonly right: SurfaceValue;
  readonly span: SourceSpan;
}

interface SurfaceParameter {
  readonly kind: "parameter";
  readonly id: string;
  readonly type: string;
  readonly span: SourceSpan;
}

interface SurfaceField {
  readonly kind: "field";
  readonly id: string;
  readonly type: string;
  readonly span: SourceSpan;
}
interface SurfaceState {
  readonly kind: "state";
  readonly id: string;
  readonly fields: ReadonlyArray<SurfaceField>;
  readonly span: SourceSpan;
}

interface SurfaceCapabilityQuantityUnbounded {
  readonly kind: "unbounded";
}

interface SurfaceCapabilityQuantityExactly {
  readonly kind: "exactly";
  readonly uses: string;
}

type SurfaceCapabilityQuantity =
  | SurfaceCapabilityQuantityUnbounded
  | SurfaceCapabilityQuantityExactly;

interface SurfaceCapabilityRequirement {
  readonly kind: "capabilityRequirement";
  readonly capability: string;
  readonly quantity: SurfaceCapabilityQuantity;
  readonly span: SourceSpan;
}

interface SurfaceRequirement {
  readonly kind: "requirement";
  readonly predicate: SurfacePredicate;
  readonly span: SourceSpan;
}

interface SurfaceOperation {
  readonly kind: "operation";
  readonly operationKind: "initializer" | "transition";
  readonly id: string;
  readonly parameters: ReadonlyArray<SurfaceParameter>;
  readonly requires: ReadonlyArray<SurfaceRequirement>;
  readonly span: SourceSpan;
}

interface SurfaceInvariant {
  readonly kind: "invariant";
  readonly id: string;
  readonly proposition: SurfacePredicate;
  readonly span: SourceSpan;
}

interface SurfaceMachine {
  readonly kind: "machine";
  readonly id: string;
  readonly state: SurfaceState;
  readonly initializers: ReadonlyArray<SurfaceOperation>;
  readonly transitions: ReadonlyArray<SurfaceOperation>;
  readonly invariants: ReadonlyArray<SurfaceInvariant>;
  readonly span: SourceSpan;
}

interface SurfaceFailureReference {
  readonly kind: "failureReference";
  readonly id: string;
  readonly span: SourceSpan;
}

interface SurfaceOperationReference {
  readonly kind: "operationReference";
  readonly stateMachine: string;
  readonly operation: string;
  readonly span: SourceSpan;
}

interface SurfaceCapability {
  readonly kind: "capability";
  readonly id: string;
  readonly span: SourceSpan;
}

interface SurfaceRealization {
  readonly kind: "realization";
  readonly id: string;
  readonly operation: SurfaceOperationReference;
  readonly requires: ReadonlyArray<SurfaceCapabilityRequirement>;
  readonly disabled: SurfaceFailureReference;
  readonly span: SourceSpan;
}

type SurfaceDeclaration = SurfaceMachine | SurfaceCapability | SurfaceRealization;

export interface SurfaceDocument {
  readonly kind: "document";
  readonly declarations: ReadonlyArray<SurfaceDeclaration>;
  readonly span: SourceSpan;
}
type TokenKind = "word" | "integer" | "symbol" | "eof";

interface Token {
  readonly kind: TokenKind;
  readonly value: string;
  readonly span: SourceSpan;
}

const reservedWords = new Set([
  "machine",
  "state",
  "initializer",
  "transition",
  "invariant",
  "requires",
  "capability",
  "realization",
  "operation",
  "disabled",
  "binds",
  "when",
  "fail",
  "unbounded",
  "exactly",
]);

const isAsciiLetter = (character: string | undefined): boolean =>
  character !== undefined && /[A-Za-z]/u.test(character);

const isAsciiDigit = (character: string | undefined): boolean =>
  character !== undefined && /[0-9]/u.test(character);

const isWhitespace = (character: string | undefined): boolean =>
  character !== undefined && /\s/u.test(character);

const initialPosition = (offset: number, line: number, column: number): SourcePosition => ({
  offset,
  line,
  column,
});

const advanceCharacter = (
  source: string,
  offset: number,
  line: number,
  column: number,
): SourcePosition => {
  const character = source[offset];
  if (character === "\r") {
    return source[offset + 1] === "\n"
      ? initialPosition(offset + 2, line + 1, 1)
      : initialPosition(offset + 1, line + 1, 1);
  }
  if (character === "\n") {
    return initialPosition(offset + 1, line + 1, 1);
  }
  return initialPosition(offset + 1, line, column + 1);
};

const tokenSpan = (
  startOffset: number,
  startLine: number,
  startColumn: number,
  endOffset: number,
  endLine: number,
  endColumn: number,
): SourceSpan => ({
  start: initialPosition(startOffset, startLine, startColumn),
  end: initialPosition(endOffset, endLine, endColumn),
});

const eofSpan = (source: string, offset: number, line: number, column: number): SourceSpan => ({
  start: initialPosition(offset, line, column),
  end: initialPosition(source.length, line, column),
});

const foundLabel = (token: Token): string => (token.kind === "eof" ? "end of input" : token.value);

const nonEmptyLabels = (labels: ReadonlyArray<string>): readonly [string, ...string[]] => [
  labels[0] ?? "syntax",
  ...labels.slice(1),
];

const makeError = (
  reason: SourceParseError["reason"],
  token: Token,
  expected: ReadonlyArray<string>,
  message?: string,
): SourceParseError => {
  const labels = nonEmptyLabels(expected);
  return new SourceParseError({
    reason,
    span: token.span,
    found: foundLabel(token),
    expected: labels,
    message: message ?? `expected ${labels.join(" or ")}, found ${foundLabel(token)}`,
  });
};

const makeSpanError = (
  reason: SourceParseError["reason"],
  span: SourceSpan,
  found: string,
  expected: ReadonlyArray<string>,
  message?: string,
): SourceParseError => {
  const labels = nonEmptyLabels(expected);
  return new SourceParseError({
    reason,
    span,
    found,
    expected: labels,
    message: message ?? `expected ${labels.join(" or ")}, found ${found}`,
  });
};

const tokenize = (source: string): Result.Result<ReadonlyArray<Token>, SourceParseError> => {
  const tokens: Array<Token> = [];
  let offset = 0;
  let line = 1;
  let column = 1;

  while (offset < source.length) {
    const character = source[offset]!;

    if (isWhitespace(character)) {
      const next = advanceCharacter(source, offset, line, column);
      offset = next.offset;
      line = next.line;
      column = next.column;
      continue;
    }

    if (character === "/" && source[offset + 1] === "/") {
      const first = advanceCharacter(source, offset, line, column);
      offset = first.offset;
      line = first.line;
      column = first.column;
      while (offset < source.length && source[offset] !== "\r" && source[offset] !== "\n") {
        const next = advanceCharacter(source, offset, line, column);
        offset = next.offset;
        line = next.line;
        column = next.column;
      }
      continue;
    }

    const startOffset = offset;
    const startLine = line;
    const startColumn = column;

    if (isAsciiLetter(character)) {
      while (isAsciiLetter(source[offset]) || isAsciiDigit(source[offset])) {
        const next = advanceCharacter(source, offset, line, column);
        offset = next.offset;
        line = next.line;
        column = next.column;
      }
      tokens.push({
        kind: "word",
        value: source.slice(startOffset, offset),
        span: tokenSpan(startOffset, startLine, startColumn, offset, line, column),
      });
      continue;
    }

    if (isAsciiDigit(character)) {
      while (isAsciiDigit(source[offset])) {
        const next = advanceCharacter(source, offset, line, column);
        offset = next.offset;
        line = next.line;
        column = next.column;
      }
      const value = source.slice(startOffset, offset);
      const span = tokenSpan(startOffset, startLine, startColumn, offset, line, column);
      if (value.length > 1 && value.startsWith("0")) {
        return Result.fail(
          makeSpanError(
            "unexpected-token",
            span,
            value,
            ["decimal integer"],
            "decimal integer cannot contain leading zeroes",
          ),
        );
      }
      tokens.push({ kind: "integer", value, span });
      continue;
    }

    const punctuation = character === ">" && source[offset + 1] === "=" ? ">=" : character;
    const isPunctuation = punctuation === ">=" || "{}(),:.".includes(punctuation);
    if (isPunctuation) {
      const width = punctuation === ">=" ? 2 : 1;
      for (let index = 0; index < width; index += 1) {
        const next = advanceCharacter(source, offset, line, column);
        offset = next.offset;
        line = next.line;
        column = next.column;
      }
      tokens.push({
        kind: "symbol",
        value: punctuation,
        span: tokenSpan(startOffset, startLine, startColumn, offset, line, column),
      });
      continue;
    }

    const end = advanceCharacter(source, offset, line, column);
    return Result.fail(
      makeSpanError(
        "invalid-character",
        tokenSpan(startOffset, startLine, startColumn, end.offset, end.line, end.column),
        character ?? "end of input",
        ["token"],
        `invalid character ${JSON.stringify(character)}`,
      ),
    );
  }

  const end = eofSpan(source, offset, line, column);
  tokens.push({ kind: "eof", value: "", span: end });
  return Result.succeed(tokens);
};

type SyntaxKind =
  | "document"
  | "declaration"
  | "machine"
  | "machineNonStateMember"
  | "state"
  | "field"
  | "initializer"
  | "transition"
  | "parameters"
  | "parameter"
  | "requirement"
  | "capabilityRequirement"
  | "invariant"
  | "capability"
  | "realization"
  | "operationReference"
  | "qualifiedIdentifier"
  | "failureReference"
  | "predicate"
  | "value";

type BuildKind =
  | "document"
  | "declarationMachine"
  | "declarationCapability"
  | "declarationRealization"
  | "memberInitializer"
  | "memberTransition"
  | "memberInvariant"
  | "machine"
  | "state"
  | "field"
  | "initializer"
  | "transition"
  | "parameters"
  | "parameter"
  | "requirement"
  | "capabilityRequirement"
  | "invariant"
  | "capability"
  | "realization"
  | "operationReference"
  | "qualifiedIdentifier"
  | "failureReference"
  | "predicate";

type TokenClass = "identifier" | "integer" | "word";

type StartMatcher =
  | { readonly kind: "token"; readonly value: string }
  | { readonly kind: "class"; readonly value: TokenClass };

type Choice =
  | { readonly kind: "token"; readonly value: string; readonly capture?: string }
  | { readonly kind: "tokenClass"; readonly value: TokenClass; readonly capture?: string }
  | { readonly kind: "reference"; readonly syntax: SyntaxKind; readonly capture: string }
  | {
      readonly kind: "repeat";
      readonly syntax: SyntaxKind;
      readonly capture: string;
      readonly minimum: number;
      readonly separator?: string;
    }
  | { readonly kind: "end"; readonly build: BuildKind };

interface SequenceRule {
  readonly mode: "sequence";
  readonly starts: ReadonlyArray<StartMatcher>;
  readonly alternatives: ReadonlyArray<ReadonlyArray<Choice>>;
}

interface PrattRule {
  readonly mode: "pratt";
  readonly starts: ReadonlyArray<StartMatcher>;
}

type Rule = SequenceRule | PrattRule;

const token = (value: string, capture?: string): Choice =>
  capture === undefined ? { kind: "token", value } : { kind: "token", value, capture };

const tokenClass = (value: TokenClass, capture?: string): Choice =>
  capture === undefined ? { kind: "tokenClass", value } : { kind: "tokenClass", value, capture };

const reference = (syntax: SyntaxKind, capture: string): Choice => ({
  kind: "reference",
  syntax,
  capture,
});

const repeat = (
  syntax: SyntaxKind,
  capture: string,
  minimum: number,
  separator?: string,
): Choice =>
  separator === undefined
    ? { kind: "repeat", syntax, capture, minimum }
    : { kind: "repeat", syntax, capture, minimum, separator };

const end = (build: BuildKind): Choice => ({ kind: "end", build });

const rules: Readonly<Record<SyntaxKind, Rule>> = {
  document: {
    mode: "sequence",
    starts: [
      { kind: "token", value: "machine" },
      { kind: "token", value: "capability" },
      { kind: "token", value: "realization" },
    ],
    alternatives: [[repeat("declaration", "declarations", 0), end("document")]],
  },
  declaration: {
    mode: "sequence",
    starts: [
      { kind: "token", value: "machine" },
      { kind: "token", value: "capability" },
      { kind: "token", value: "realization" },
    ],
    alternatives: [
      [reference("machine", "machine"), end("declarationMachine")],
      [reference("capability", "capability"), end("declarationCapability")],
      [reference("realization", "realization"), end("declarationRealization")],
    ],
  },
  machine: {
    mode: "sequence",
    starts: [{ kind: "token", value: "machine" }],
    alternatives: [
      [
        token("machine"),
        tokenClass("identifier", "id"),
        token("{"),
        repeat("machineNonStateMember", "beforeState", 0),
        reference("state", "state"),
        repeat("machineNonStateMember", "afterState", 0),
        token("}"),
        end("machine"),
      ],
    ],
  },
  machineNonStateMember: {
    mode: "sequence",
    starts: [
      { kind: "token", value: "initializer" },
      { kind: "token", value: "transition" },
      { kind: "token", value: "invariant" },
    ],
    alternatives: [
      [reference("initializer", "initializer"), end("memberInitializer")],
      [reference("transition", "transition"), end("memberTransition")],
      [reference("invariant", "invariant"), end("memberInvariant")],
    ],
  },
  state: {
    mode: "sequence",
    starts: [{ kind: "token", value: "state" }],
    alternatives: [
      [
        token("state"),
        tokenClass("identifier", "id"),
        token("{"),
        repeat("field", "fields", 0),
        token("}"),
        end("state"),
      ],
    ],
  },
  field: {
    mode: "sequence",
    starts: [{ kind: "class", value: "identifier" }],
    alternatives: [
      [tokenClass("identifier", "id"), token(":"), tokenClass("identifier", "type"), end("field")],
    ],
  },
  initializer: {
    mode: "sequence",
    starts: [{ kind: "token", value: "initializer" }],
    alternatives: [
      [
        token("initializer"),
        tokenClass("identifier", "id"),
        reference("parameters", "parameters"),
        token("{"),
        repeat("requirement", "requires", 0),
        token("}"),
        end("initializer"),
      ],
    ],
  },
  transition: {
    mode: "sequence",
    starts: [{ kind: "token", value: "transition" }],
    alternatives: [
      [
        token("transition"),
        tokenClass("identifier", "id"),
        reference("parameters", "parameters"),
        token("{"),
        repeat("requirement", "requires", 0),
        token("}"),
        end("transition"),
      ],
    ],
  },
  parameters: {
    mode: "sequence",
    starts: [{ kind: "token", value: "(" }],
    alternatives: [
      [token("("), repeat("parameter", "parameters", 0, ","), token(")"), end("parameters")],
    ],
  },
  parameter: {
    mode: "sequence",
    starts: [{ kind: "class", value: "identifier" }],
    alternatives: [
      [
        tokenClass("identifier", "id"),
        token(":"),
        tokenClass("identifier", "type"),
        end("parameter"),
      ],
    ],
  },
  requirement: {
    mode: "sequence",
    starts: [{ kind: "token", value: "requires" }],
    alternatives: [[token("requires"), reference("predicate", "predicate"), end("requirement")]],
  },
  invariant: {
    mode: "sequence",
    starts: [{ kind: "token", value: "invariant" }],
    alternatives: [
      [
        token("invariant"),
        tokenClass("identifier", "id"),
        token("{"),
        reference("predicate", "proposition"),
        token("}"),
        end("invariant"),
      ],
    ],
  },
  capability: {
    mode: "sequence",
    starts: [{ kind: "token", value: "capability" }],
    alternatives: [[token("capability"), tokenClass("identifier", "id"), end("capability")]],
  },
  realization: {
    mode: "sequence",
    starts: [{ kind: "token", value: "realization" }],
    alternatives: [
      [
        token("realization"),
        tokenClass("identifier", "id"),
        token("binds"),
        reference("operationReference", "operation"),
        token("{"),
        repeat("capabilityRequirement", "requires", 1),
        token("when"),
        token("disabled"),
        token("fail"),
        reference("failureReference", "disabled"),
        token("}"),
        end("realization"),
      ],
    ],
  },
  operationReference: {
    mode: "sequence",
    starts: [{ kind: "class", value: "identifier" }],
    alternatives: [[reference("qualifiedIdentifier", "qualified"), end("operationReference")]],
  },
  capabilityRequirement: {
    mode: "sequence",
    starts: [{ kind: "token", value: "requires" }],
    alternatives: [
      [
        token("requires"),
        tokenClass("identifier", "capability"),
        token("unbounded", "quantityKind"),
        end("capabilityRequirement"),
      ],
      [
        token("requires"),
        tokenClass("identifier", "capability"),
        token("exactly", "quantityKind"),
        tokenClass("integer", "uses"),
        end("capabilityRequirement"),
      ],
    ],
  },
  qualifiedIdentifier: {
    mode: "sequence",
    starts: [{ kind: "class", value: "identifier" }],
    alternatives: [
      [
        tokenClass("identifier", "stateMachine"),
        token("."),
        tokenClass("identifier", "operation"),
        end("qualifiedIdentifier"),
      ],
    ],
  },
  failureReference: {
    mode: "sequence",
    starts: [{ kind: "class", value: "identifier" }],
    alternatives: [[tokenClass("identifier", "id"), end("failureReference")]],
  },
  predicate: {
    mode: "pratt",
    starts: [
      { kind: "class", value: "identifier" },
      { kind: "class", value: "integer" },
    ],
  },
  value: {
    mode: "sequence",
    starts: [
      { kind: "class", value: "identifier" },
      { kind: "class", value: "integer" },
    ],
    alternatives: [
      [tokenClass("identifier", "id"), end("predicate")],
      [tokenClass("integer", "value"), end("predicate")],
    ],
  },
};

interface Fragment {
  readonly value: unknown;
  readonly span: SourceSpan;
}

interface ParsedRule {
  readonly value: unknown;
  readonly span: SourceSpan;
}

interface PrattValue {
  readonly value: SurfaceValue | SurfacePredicate;
  readonly operators: number;
}

interface OperatorInfo {
  readonly leftBindingPower: number;
  readonly rightBindingPower: number;
  readonly build: "greaterThanOrEqual";
}

const predicateOperators: ReadonlyMap<string, OperatorInfo> = new Map([
  [
    ">=",
    {
      leftBindingPower: 1,
      rightBindingPower: 2,
      build: "greaterThanOrEqual",
    },
  ],
]);

const isIdentifierToken = (tokenValue: Token): boolean =>
  tokenValue.kind === "word" && !reservedWords.has(tokenValue.value);

const matcherMatches = (matcher: StartMatcher, tokenValue: Token): boolean => {
  if (matcher.kind === "token") return tokenValue.value === matcher.value;
  if (matcher.value === "integer") return tokenValue.kind === "integer";
  if (matcher.value === "word") return tokenValue.kind === "word";
  return isIdentifierToken(tokenValue);
};

const matcherLabel = (matcher: StartMatcher): string =>
  matcher.kind === "token"
    ? matcher.value
    : matcher.value === "integer"
      ? "decimal integer"
      : matcher.value;

const uniqueLabels = (values: ReadonlyArray<string>): ReadonlyArray<string> => [...new Set(values)];

const isSourcePosition = (value: unknown): value is SourcePosition => {
  if (typeof value !== "object" || value === null) return false;
  if (!("offset" in value && "line" in value && "column" in value)) return false;
  return (
    typeof value.offset === "number" &&
    typeof value.line === "number" &&
    typeof value.column === "number"
  );
};

const isSourceSpan = (value: unknown): value is SourceSpan => {
  if (typeof value !== "object" || value === null) return false;
  if (!("start" in value) || !("end" in value)) return false;
  return isSourcePosition(value.start) && isSourcePosition(value.end);
};

const nodeSpan = (value: unknown, fallback: SourceSpan): SourceSpan => {
  if (typeof value === "object" && value !== null && "span" in value && isSourceSpan(value.span)) {
    return value.span;
  }
  return fallback;
};

const isFragment = (value: Fragment | ReadonlyArray<Fragment>): value is Fragment =>
  !Array.isArray(value);

const fragmentAt = (
  captures: ReadonlyMap<string, Fragment | ReadonlyArray<Fragment>>,
  name: string,
): Fragment | undefined => {
  const value = captures.get(name);
  return value !== undefined && isFragment(value) ? value : undefined;
};

const fragmentsAt = (
  captures: ReadonlyMap<string, Fragment | ReadonlyArray<Fragment>>,
  name: string,
): ReadonlyArray<Fragment> | undefined => {
  const value = captures.get(name);
  return Array.isArray(value) ? value : undefined;
};

const stringAt = (
  captures: ReadonlyMap<string, Fragment | ReadonlyArray<Fragment>>,
  name: string,
): string | undefined => {
  const value = fragmentAt(captures, name)?.value;
  return typeof value === "string" ? value : undefined;
};

const valueAt = <A>(
  captures: ReadonlyMap<string, Fragment | ReadonlyArray<Fragment>>,
  name: string,
): A | undefined => fragmentAt(captures, name)?.value as A | undefined;

const internalRuleError = (span: SourceSpan, build: BuildKind): SourceParseError =>
  makeSpanError(
    "rule-table",
    span,
    "rule fragment mismatch",
    [build],
    `rule ${build} received an invalid fragment sequence`,
  );

const buildRule = (
  build: BuildKind,
  captures: ReadonlyMap<string, Fragment | ReadonlyArray<Fragment>>,
  span: SourceSpan,
): Result.Result<unknown, SourceParseError> => {
  switch (build) {
    case "document": {
      const declarations = fragmentsAt(captures, "declarations");
      if (declarations === undefined) return Result.fail(internalRuleError(span, build));
      return Result.succeed({
        kind: "document",
        declarations: declarations.map(({ value }) => value as SurfaceDeclaration),
        span,
      } satisfies SurfaceDocument);
    }
    case "declarationMachine": {
      const machine = valueAt<SurfaceMachine>(captures, "machine");
      return machine === undefined
        ? Result.fail(internalRuleError(span, build))
        : Result.succeed(machine);
    }
    case "declarationCapability": {
      const capability = valueAt<SurfaceCapability>(captures, "capability");
      return capability === undefined
        ? Result.fail(internalRuleError(span, build))
        : Result.succeed(capability);
    }
    case "declarationRealization": {
      const realization = valueAt<SurfaceRealization>(captures, "realization");
      return realization === undefined
        ? Result.fail(internalRuleError(span, build))
        : Result.succeed(realization);
    }
    case "memberInitializer":
    case "memberTransition":
    case "memberInvariant": {
      const capture =
        build === "memberInitializer"
          ? "initializer"
          : build === "memberTransition"
            ? "transition"
            : "invariant";
      const member = fragmentAt(captures, capture)?.value;
      return member === undefined
        ? Result.fail(internalRuleError(span, build))
        : Result.succeed(member);
    }
    case "machine": {
      const id = stringAt(captures, "id");
      const state = valueAt<SurfaceState>(captures, "state");
      const beforeState = fragmentsAt(captures, "beforeState");
      const afterState = fragmentsAt(captures, "afterState");
      if (
        id === undefined ||
        state === undefined ||
        beforeState === undefined ||
        afterState === undefined
      ) {
        return Result.fail(internalRuleError(span, build));
      }
      const initializers: Array<SurfaceOperation> = [];
      const transitions: Array<SurfaceOperation> = [];
      const invariants: Array<SurfaceInvariant> = [];
      for (const member of [...beforeState, ...afterState]) {
        const value = member.value as SurfaceOperation | SurfaceInvariant;
        switch (value.kind) {
          case "operation":
            if (value.operationKind === "initializer") initializers.push(value);
            else transitions.push(value);
            break;
          case "invariant":
            invariants.push(value);
            break;
        }
      }
      return Result.succeed({
        kind: "machine",
        id,
        state,
        initializers,
        transitions,
        invariants,
        span,
      } satisfies SurfaceMachine);
    }
    case "state": {
      const id = stringAt(captures, "id");
      const fields = fragmentsAt(captures, "fields");
      if (id === undefined || fields === undefined)
        return Result.fail(internalRuleError(span, build));
      return Result.succeed({
        kind: "state",
        id,
        fields: fields.map(({ value }) => value as SurfaceField),
        span,
      } satisfies SurfaceState);
    }
    case "field": {
      const id = stringAt(captures, "id");
      const type = stringAt(captures, "type");
      return id === undefined || type === undefined
        ? Result.fail(internalRuleError(span, build))
        : Result.succeed({ kind: "field", id, type, span } satisfies SurfaceField);
    }
    case "initializer":
    case "transition": {
      const id = stringAt(captures, "id");
      const parameters = valueAt<ReadonlyArray<SurfaceParameter>>(captures, "parameters");
      const requirements = fragmentsAt(captures, "requires");
      if (id === undefined || parameters === undefined || requirements === undefined) {
        return Result.fail(internalRuleError(span, build));
      }
      return Result.succeed({
        kind: "operation",
        operationKind: build,
        id,
        parameters,
        requires: requirements.map(({ value }) => value as SurfaceRequirement),
        span,
      });
    }
    case "parameters": {
      const parameters = fragmentsAt(captures, "parameters");
      return parameters === undefined
        ? Result.fail(internalRuleError(span, build))
        : Result.succeed(parameters.map(({ value }) => value as SurfaceParameter));
    }
    case "parameter": {
      const id = stringAt(captures, "id");
      const type = stringAt(captures, "type");
      return id === undefined || type === undefined
        ? Result.fail(internalRuleError(span, build))
        : Result.succeed({ kind: "parameter", id, type, span } satisfies SurfaceParameter);
    }
    case "requirement": {
      const predicate = valueAt<SurfacePredicate>(captures, "predicate");
      return predicate === undefined
        ? Result.fail(internalRuleError(span, build))
        : Result.succeed({ kind: "requirement", predicate, span } satisfies SurfaceRequirement);
    }
    case "capabilityRequirement": {
      const capability = stringAt(captures, "capability");
      const quantityKind = stringAt(captures, "quantityKind");
      if (capability === undefined || quantityKind === undefined) {
        return Result.fail(internalRuleError(span, build));
      }
      if (quantityKind === "unbounded") {
        return Result.succeed({
          kind: "capabilityRequirement",
          capability,
          quantity: { kind: "unbounded" },
          span,
        } satisfies SurfaceCapabilityRequirement);
      }
      if (quantityKind !== "exactly") {
        return Result.fail(internalRuleError(span, build));
      }
      const uses = stringAt(captures, "uses");
      const usesFragment = fragmentAt(captures, "uses");
      if (uses === undefined || usesFragment === undefined) {
        return Result.fail(internalRuleError(span, build));
      }
      if (!/^[1-9][0-9]*$/u.test(uses)) {
        return Result.fail(
          makeSpanError(
            "unexpected-token",
            usesFragment.span,
            uses,
            ["positive decimal integer"],
            "exactly quantity must be a positive decimal integer",
          ),
        );
      }
      return Result.succeed({
        kind: "capabilityRequirement",
        capability,
        quantity: { kind: "exactly", uses },
        span,
      } satisfies SurfaceCapabilityRequirement);
    }
    case "invariant": {
      const id = stringAt(captures, "id");
      const proposition = valueAt<SurfacePredicate>(captures, "proposition");
      return id === undefined || proposition === undefined
        ? Result.fail(internalRuleError(span, build))
        : Result.succeed({ kind: "invariant", id, proposition, span } satisfies SurfaceInvariant);
    }
    case "capability": {
      const id = stringAt(captures, "id");
      return id === undefined
        ? Result.fail(internalRuleError(span, build))
        : Result.succeed({ kind: "capability", id, span } satisfies SurfaceCapability);
    }
    case "realization": {
      const id = stringAt(captures, "id");
      const operation = valueAt<SurfaceOperationReference>(captures, "operation");
      const requires = fragmentsAt(captures, "requires");
      const disabled = valueAt<SurfaceFailureReference>(captures, "disabled");
      if (
        id === undefined ||
        operation === undefined ||
        requires === undefined ||
        disabled === undefined
      ) {
        return Result.fail(internalRuleError(span, build));
      }
      return Result.succeed({
        kind: "realization",
        id,
        operation,
        requires: requires.map(({ value }) => value as SurfaceCapabilityRequirement),
        disabled,
        span,
      } satisfies SurfaceRealization);
    }
    case "operationReference": {
      const qualified = valueAt<{
        readonly stateMachine: string;
        readonly operation: string;
        readonly span: SourceSpan;
      }>(captures, "qualified");
      return qualified === undefined
        ? Result.fail(internalRuleError(span, build))
        : Result.succeed({
            kind: "operationReference",
            stateMachine: qualified.stateMachine,
            operation: qualified.operation,
            span,
          } satisfies SurfaceOperationReference);
    }
    case "qualifiedIdentifier": {
      const stateMachine = stringAt(captures, "stateMachine");
      const operation = stringAt(captures, "operation");
      return stateMachine === undefined || operation === undefined
        ? Result.fail(internalRuleError(span, build))
        : Result.succeed({ stateMachine, operation, span });
    }
    case "failureReference": {
      const id = stringAt(captures, "id");
      return id === undefined
        ? Result.fail(internalRuleError(span, build))
        : Result.succeed({ kind: "failureReference", id, span } satisfies SurfaceFailureReference);
    }
    case "predicate": {
      const id = stringAt(captures, "id");
      if (id !== undefined) {
        return Result.succeed({ kind: "identifier", id, span } satisfies SurfaceValueIdentifier);
      }
      const integer = stringAt(captures, "value");
      return integer === undefined
        ? Result.fail(internalRuleError(span, build))
        : Result.succeed({
            kind: "integerLiteral",
            value: integer,
            span,
          } satisfies SurfaceValueInteger);
    }
    default: {
      const exhaustive: never = build;
      return Result.fail(internalRuleError(span, exhaustive));
    }
  }
};

class Parser {
  private index = 0;

  constructor(private readonly tokens: ReadonlyArray<Token>) {}

  private current(): Token {
    return this.tokens[this.index] ?? this.tokens[this.tokens.length - 1]!;
  }

  private isAtEnd(): boolean {
    return this.current().kind === "eof";
  }

  private starts(syntax: SyntaxKind): boolean {
    const rule = rules[syntax];
    return rule.starts.some((matcher) => matcherMatches(matcher, this.current()));
  }

  private expectedStarts(syntax: SyntaxKind): ReadonlyArray<string> {
    return uniqueLabels(rules[syntax].starts.map(matcherLabel));
  }

  private consume(): Token {
    const value = this.current();
    if (!this.isAtEnd()) this.index += 1;
    return value;
  }

  private expectToken(value: string): Result.Result<Token, SourceParseError> {
    const current = this.current();
    if (current.value === value && current.kind !== "eof") {
      this.index += 1;
      return Result.succeed(current);
    }
    return Result.fail(
      makeError(current.kind === "eof" ? "unexpected-end" : "unexpected-token", current, [value]),
    );
  }

  private expectClass(value: TokenClass): Result.Result<Token, SourceParseError> {
    const current = this.current();
    const matches =
      value === "integer"
        ? current.kind === "integer"
        : value === "word"
          ? current.kind === "word"
          : isIdentifierToken(current);
    if (matches) {
      this.index += 1;
      return Result.succeed(current);
    }
    return Result.fail(
      makeError(current.kind === "eof" ? "unexpected-end" : "unexpected-token", current, [
        value === "integer" ? "decimal integer" : value,
      ]),
    );
  }

  private parseRepeat(
    choice: Extract<Choice, { readonly kind: "repeat" }>,
  ): Result.Result<ReadonlyArray<Fragment>, SourceParseError> {
    const values: Array<Fragment> = [];
    const expected = this.expectedStarts(choice.syntax);

    const parseOne = (): Result.Result<Fragment, SourceParseError> => {
      const parsed = this.parseRule(choice.syntax);
      if (Result.isFailure(parsed)) return Result.fail(parsed.failure);
      return Result.succeed({ value: parsed.success.value, span: parsed.success.span });
    };

    if (choice.separator === undefined) {
      while (this.starts(choice.syntax)) {
        const parsed = parseOne();
        if (Result.isFailure(parsed)) return Result.fail(parsed.failure);
        values.push(parsed.success);
      }
    } else {
      if (this.starts(choice.syntax)) {
        const first = parseOne();
        if (Result.isFailure(first)) return Result.fail(first.failure);
        values.push(first.success);
        while (this.current().value === choice.separator) {
          const separator = this.consume();
          if (!this.starts(choice.syntax)) {
            return Result.fail(
              makeError(
                this.current().kind === "eof" ? "unexpected-end" : "unexpected-token",
                this.current(),
                expected,
                `expected ${expected.join(" or ")} after ${separator.value}`,
              ),
            );
          }
          const next = parseOne();
          if (Result.isFailure(next)) return Result.fail(next.failure);
          values.push(next.success);
        }
      }
    }

    if (values.length < choice.minimum) {
      return Result.fail(
        makeError(
          this.current().kind === "eof" ? "unexpected-end" : "unexpected-token",
          this.current(),
          expected,
        ),
      );
    }
    return Result.succeed(values);
  }

  private parseAlternative(
    choices: ReadonlyArray<Choice>,
  ): Result.Result<ParsedRule, SourceParseError> {
    const captures = new Map<string, Fragment | ReadonlyArray<Fragment>>();
    let firstSpan: SourceSpan | undefined;
    let lastSpan: SourceSpan | undefined;

    const include = (span: SourceSpan): void => {
      firstSpan ??= span;
      lastSpan = span;
    };

    for (const choice of choices) {
      switch (choice.kind) {
        case "token": {
          const parsed = this.expectToken(choice.value);
          if (Result.isFailure(parsed)) return Result.fail(parsed.failure);
          include(parsed.success.span);
          if (choice.capture !== undefined) {
            captures.set(choice.capture, {
              value: parsed.success.value,
              span: parsed.success.span,
            });
          }
          break;
        }
        case "tokenClass": {
          const parsed = this.expectClass(choice.value);
          if (Result.isFailure(parsed)) return Result.fail(parsed.failure);
          include(parsed.success.span);
          if (choice.capture !== undefined) {
            captures.set(choice.capture, {
              value: parsed.success.value,
              span: parsed.success.span,
            });
          }
          break;
        }
        case "reference": {
          const parsed = this.parseRule(choice.syntax);
          if (Result.isFailure(parsed)) return Result.fail(parsed.failure);
          include(parsed.success.span);
          captures.set(choice.capture, { value: parsed.success.value, span: parsed.success.span });
          break;
        }
        case "repeat": {
          const parsed = this.parseRepeat(choice);
          if (Result.isFailure(parsed)) return Result.fail(parsed.failure);
          for (const fragment of parsed.success) include(fragment.span);
          captures.set(choice.capture, parsed.success);
          break;
        }
        case "end": {
          const completeSpan =
            firstSpan === undefined
              ? this.current().span
              : {
                  start: firstSpan.start,
                  end: (lastSpan ?? firstSpan).end,
                };
          const built = buildRule(choice.build, captures, completeSpan);
          if (Result.isFailure(built)) return Result.fail(built.failure);
          return Result.succeed({
            value: built.success,
            span: nodeSpan(built.success, completeSpan),
          });
        }
      }
    }

    return Result.fail(
      makeError(
        this.current().kind === "eof" ? "unexpected-end" : "unexpected-token",
        this.current(),
        ["end of rule"],
        "rule ended without an end choice",
      ),
    );
  }

  private parseRule(syntax: SyntaxKind): Result.Result<ParsedRule, SourceParseError> {
    const rule = rules[syntax];
    if (rule.mode === "pratt") return this.parsePredicateRule();

    const alternatives = rule.alternatives.filter((candidate) => {
      const first = candidate[0];
      if (first === undefined) return false;
      if (first.kind === "token") return this.current().value === first.value;
      if (first.kind === "tokenClass") {
        return matcherMatches({ kind: "class", value: first.value }, this.current());
      }
      if (first.kind === "reference") return this.starts(first.syntax);
      if (first.kind === "repeat") return first.minimum === 0 || this.starts(first.syntax);
      return false;
    });
    if (alternatives.length === 0) {
      const expected = uniqueLabels(
        rule.alternatives.flatMap((candidate) => {
          const first = candidate[0];
          if (first === undefined) return [];
          if (first.kind === "token") return [first.value];
          if (first.kind === "tokenClass")
            return [first.value === "integer" ? "decimal integer" : first.value];
          if (first.kind === "reference" || first.kind === "repeat") {
            return this.expectedStarts(first.syntax);
          }
          return [];
        }),
      );
      return Result.fail(
        makeError(
          this.current().kind === "eof" ? "unexpected-end" : "unexpected-token",
          this.current(),
          expected.length === 0 ? ["syntax"] : expected,
        ),
      );
    }

    let bestFailure: SourceParseError | undefined;
    let bestFailureIndex = -1;
    for (const alternative of alternatives) {
      const startIndex = this.index;
      const parsed = this.parseAlternative(alternative);
      if (Result.isSuccess(parsed)) return parsed;
      if (this.index > bestFailureIndex) {
        bestFailure = parsed.failure;
        bestFailureIndex = this.index;
      }
      this.index = startIndex;
    }
    return bestFailure === undefined
      ? Result.fail(makeError("rule-table", this.current(), ["rule alternative"]))
      : Result.fail(bestFailure);
  }

  private parsePredicateRule(): Result.Result<ParsedRule, SourceParseError> {
    const parsed = this.parsePratt(0);
    if (Result.isFailure(parsed)) return Result.fail(parsed.failure);
    if (parsed.success.operators !== 1 || parsed.success.value.kind !== "greaterThanOrEqual") {
      return Result.fail(
        makeError(
          this.current().kind === "eof" ? "unexpected-end" : "unexpected-token",
          this.current(),
          [">="],
          "predicate requires exactly one >= operator",
        ),
      );
    }
    const value = parsed.success.value;
    return Result.succeed({ value, span: value.span });
  }

  private parsePratt(minimumBindingPower: number): Result.Result<PrattValue, SourceParseError> {
    const left = this.parseRule("value");
    if (Result.isFailure(left)) return Result.fail(left.failure);
    return this.parsePrattContinuation(minimumBindingPower, left.success.value as SurfaceValue, 0);
  }

  private parsePrattContinuation(
    minimumBindingPower: number,
    left: SurfaceValue,
    operatorCount: number,
  ): Result.Result<PrattValue, SourceParseError> {
    let currentLeft: SurfaceValue | SurfacePredicate = left;
    let operators = operatorCount;
    while (true) {
      const current = this.current();
      const operator = predicateOperators.get(current.value);
      if (operator === undefined || operator.leftBindingPower <= minimumBindingPower) {
        return Result.succeed({ value: currentLeft, operators });
      }
      if (currentLeft.kind === "greaterThanOrEqual") {
        return Result.fail(
          makeError(
            "unexpected-token",
            current,
            ["end of predicate"],
            "predicate requires exactly one >= operator",
          ),
        );
      }

      this.consume();
      const right = this.parsePratt(operator.rightBindingPower);
      if (Result.isFailure(right)) return Result.fail(right.failure);
      if (right.success.value.kind === "greaterThanOrEqual") {
        return Result.fail(
          makeSpanError(
            "unexpected-token",
            right.success.value.span,
            ">=",
            ["value"],
            "predicate operands must be values",
          ),
        );
      }
      currentLeft = {
        kind: operator.build,
        left: currentLeft,
        right: right.success.value,
        span: {
          start: currentLeft.span.start,
          end: right.success.value.span.end,
        },
      };
      operators += right.success.operators + 1;
    }
  }

  parseDocument(): Result.Result<SurfaceDocument, SourceParseError> {
    const parsed = this.parseRule("document");
    if (Result.isFailure(parsed)) return Result.fail(parsed.failure);
    if (!this.isAtEnd()) {
      return Result.fail(makeError("unexpected-token", this.current(), ["end of input"]));
    }
    return Result.succeed(parsed.success.value as SurfaceDocument);
  }
}

export const parseSource = (source: string): Result.Result<SurfaceDocument, SourceParseError> => {
  const tokens = tokenize(source);
  if (Result.isFailure(tokens)) return Result.fail(tokens.failure);
  return new Parser(tokens.success).parseDocument();
};

const lowerValue = (value: SurfaceValue, parameters: ReadonlySet<string>): StateValue => {
  if (value.kind === "integerLiteral") {
    return { kind: "integerLiteral", value: value.value };
  }
  return parameters.has(value.id)
    ? { kind: "parameter", id: value.id }
    : { kind: "stateField", field: value.id };
};

const lowerPredicate = (
  predicate: SurfacePredicate,
  parameters: ReadonlySet<string>,
): StatePredicate => ({
  kind: "greaterThanOrEqual",
  left: lowerValue(predicate.left, parameters),
  right: lowerValue(predicate.right, parameters),
});

const lowerOperation = (operation: SurfaceOperation): StateOperation => {
  const parameters = operation.parameters.map(({ id, type }) => ({ id, type }));
  const parameterNames = new Set(parameters.map(({ id }) => id));
  return {
    id: operation.id,
    parameters,
    requires: operation.requires.map(({ predicate }) => lowerPredicate(predicate, parameterNames)),
  };
};

const lowerMachine = (machine: SurfaceMachine): StateMachineDeclaration => ({
  kind: "stateMachine",
  id: machine.id,
  state: {
    id: machine.state.id,
    fields: machine.state.fields.map(({ id, type }) => ({ id, type })),
  },
  initializers: machine.initializers.map(lowerOperation),
  transitions: machine.transitions.map(lowerOperation),
  invariants: machine.invariants.map(({ id, proposition }) => ({
    id,
    proposition: lowerPredicate(proposition, new Set()),
  })),
});

const lowerDeclaration = (
  declaration: SurfaceDeclaration,
): StateMachineDeclaration | CapabilityDeclaration | OperationRealizationDeclaration => {
  switch (declaration.kind) {
    case "machine":
      return lowerMachine(declaration);
    case "capability":
      return { kind: "capability", id: declaration.id };
    case "realization":
      return {
        kind: "operationRealization",
        id: declaration.id,
        operation: {
          stateMachine: declaration.operation.stateMachine,
          operation: declaration.operation.operation,
        },
        requires: declaration.requires.map(({ capability, quantity }) => ({
          capability,
          quantity,
        })),
        disabled: { kind: "failure", id: declaration.disabled.id },
      };
  }
};

export const lowerSource = (document: SurfaceDocument): CoreDocument => ({
  bangCore: 1,
  declarations: document.declarations.map(lowerDeclaration),
});

export const sourceToCore = (source: string): Result.Result<CoreDocument, SourceParseError> =>
  Result.map(parseSource(source), lowerSource);
