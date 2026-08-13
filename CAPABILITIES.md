# BANG capability dependency map

This is the schedulable dependency projection for near-term product capabilities. It is not the full theory-interaction graph and does not claim that a DAG proves semantic compatibility or evaluator termination. [BANG-PROJECT-DIRECTION.md](BANG-PROJECT-DIRECTION.md) remains the source for the long-term capability set; active mission contracts define observable acceptance.

```mermaid
flowchart LR
    M000["M000 · executable Core → Effect spine<br/>complete"]
    M001["M001 · refined domain value<br/>complete"]
    M002["M002 · one theory + finite model<br/>complete"]
    M003["M003 · generated algebraic law suite<br/>complete"]
    M004["M004 · coalgebraic state preservation<br/>complete"]
    M005["M005 · Account ↔ Ledger bridge law<br/>complete"]
    M005A["M005A · first Core dogfood<br/>complete"]
    M006["M006 · effect + capability boundary"]
    M007["M007 · graded evidence report"]
    M008["M008 · runtime trace observation"]
    M009["M009 · Rust portability projection"]

    M000 --> M001 --> M002 --> M003
    M001 --> M004
    M002 --> M005
    M004 --> M005
    M005 --> M005A
    M000 --> M005A
    M005A --> M006
    M003 --> M007
    M005 --> M007
    M006 --> M007
    M004 --> M008
    M007 --> M008
    M001 --> M009
    M007 --> M009
```

| Capability                     | User-feelable claim                                           | Requires                          | First tracer | Status   |
| ------------------------------ | ------------------------------------------------------------- | --------------------------------- | ------------ | -------- |
| Core-to-target spine           | Generate and type-check one independent Effect port           | —                                 | M000         | complete |
| refined domain value           | Construct `Balance`, reject invalid values                    | Core-to-target spine              | M001         | complete |
| theory and finite model        | Ask whether one finite model satisfies one law                | refined domain value              | M002         | complete |
| algebraic law suite            | Find and minimize a law counterexample                        | theory and finite model           | M003         | complete |
| coalgebraic state preservation | Reject a transition that breaks an invariant                  | refined domain value              | M004         | complete |
| cross-theory bridge            | Expose an Account/Ledger disagreement in domain terms         | theory/model + state preservation | M005         | complete |
| first Core dogfood             | Detect recursive `BridgeTerm` drift in the BANG compiler      | bridge + algebraic data           | M005A        | complete |
| effectful capability boundary  | Require debit authority and typed failure                     | spine + state preservation        | M006         | planned  |
| graded evidence                | Distinguish structure, tests, runtime checks, and assumptions | produced evidence classes         | M007         | planned  |
| runtime observation            | Monitor one operation protocol over a trace                   | state preservation + evidence     | M008         | planned  |
| target portability             | Reuse Core in a Rust conformance boundary                     | stable value Core + evidence      | M009         | planned  |

Only the active mission may refine an edge or add a prerequisite. Later capabilities are hypotheses until a tracer bullet exercises them.

## Dogfood dependency

The first useful self-application is a BANG declaration for one part of `CoreDocument`, projected into a kit that the existing `@bang/core` implementation must conform to. It depends on two capabilities not yet demonstrated together:

```mermaid
flowchart LR
    ADT["recursive product + sum data"]
    BR["cross-theory relations<br/>M005"]
    DF["first useful dogfood slice"]

    ADT --> DF
    BR --> DF
```

M005A completed this slice. It specifies the real recursive `BridgeTerm` shape
and evaluates the existing Core decoder through a generated conformance port.
Merely naming a toy realization “BANG” would be ceremonial self-reference, not
dogfooding.

## North-star pressure test

The sibling Agent Engine / ADLC-OS project is an architectural pressure test, not an MVP dependency or scheduled BANG mission. It asks whether one BANG system contract could eventually compose:

- organization, Project, Worker, Actor, Session, Work, Capability, Grant, Evidence, and Memory theories;
- actor and workflow transitions with ownership, supervision, cancellation, and bounded resources;
- process laws over messages, handoffs, effects, and observable traces;
- policy and capability laws across control, execution, evidence, and infrastructure planes;
- several reasoning projections, including relational model finding, temporal checking, and selective proof;
- Effect service and Layer boundaries whose interpretations may provision or reconcile infrastructure.

This example does not authorize those constructs in Core. A construct still enters only when a current vertical mission needs it and supplies judgments, fixtures, projection behavior, and honest evidence. ADLC-OS succeeds as a north-star case only if its domain meaning stays independent of Effect and infrastructure providers while its selected realization can still be Effect implemented by Effect.
