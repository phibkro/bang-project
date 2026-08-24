# Research note 0001 — Algebra–coalgebra compatibility law

- **Status:** parked
- **Date:** 2026-08-24
- **Scope:** non-normative exploration; activation tied to the M034 evidence-invalidation mission blocker

This note explores one mathematical obligation. It is not a decision, not a spec change, and not an authority for any Core construct. Decision records state accepted choices; this note only states when and why this idea would become actionable.

## Activation condition

This note becomes actionable only if a concrete mission blocker appears after M034 (continuous evidence invalidation). The blocker: the invalidation report must decide whether a changed source file changed meaning or only bytes. Digest comparison cannot make that call. It either over-invalidates on cosmetic edits or under-invalidates on semantic edits that preserve digests.

If that pressure materializes, a compatibility proof would let the report classify change semantics — which obligations an edit preserves or breaks — instead of over-invalidating every byte difference. Absent that blocker, this note stays parked. Curiosity about bialgebraic semantics is not an activation trigger.

## Proposal

The exact-one theory carries equational laws: algebra-side claims about constructed values. The generated Gleam actor carries transition behavior: coalgebra-side observations of evolving state. Today M031/M033 qualify their agreement with `runtime-checked` evidence — one bounded observation of one assembled escript.

The proposal is an explicit compatibility obligation between those two sides, shaped as a distributive law λ : BF ⇒ FB in the sense of Turi and Plotkin's bialgebraic operational semantics: the behavioral functor applied to the algebraic structure factors through the observational structure, so the actor's transition behavior respects the equational laws by construction rather than by spot check.

Discharging it would be the job of the existing Lean kernel-proof provider (M016 lineage): prove once, per theory, that the actor's transition relation preserves the equational laws. The goal is to upgrade part of the qualification from `runtime-checked` toward `kernel-proven`, keeping the runtime probe as corroboration. This adds an evidence class; it discards none. The evidence manifest keeps both grades with distinct scope.

## Boundary conditions

- Pure data abstractions stay purely algebraic. Initial-algebra semantics suffices where nothing evolves; no forced trivial coalgebra side.
- Modules and packages remain theory morphisms à la Goguen and Burstall. M022/M030 already treat packages that way; this proposal changes no package semantics.
- Abstraction means the family-appropriate compatibility condition, not one universal coalgebraic mold. Each theory relation keeps its own meaning. This avoids the "one generic morphism" mistake decision 0006 rejects.

## Non-authority

This note authorizes no Core construct, no code, no spec change. Promotion requires a future mission contract with positive and negative fixtures per the semantic privilege rule. Until then, no implementation may cite this file as evidence or authority.

## Sources

- Turi and Plotkin, _Towards a Mathematical Operational Semantics_
- Rutten, _Universal Coalgebra: A Theory of Systems_
- Goguen and Burstall, _Institutions: Abstract Model Theory for Specification and Programming_
