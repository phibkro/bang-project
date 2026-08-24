import { describe, expect, test } from "bun:test";
import { CoreDocumentFromJson, validateCore } from "@bang/core";
import {
  projectGleamEntityOperationRealization,
  projectGleamExactOneOperationRealization,
  type GleamTargetProjectionReason,
  type GleamTargetProjectionResult,
} from "@bang/target-gleam";
import { sourceToCore } from "@bang/surface";
import { Effect, Result, Schema } from "effect";

const checkedDocument = async () => {
  const source = await Bun.file("examples/tiny-bank/account.bang").text();
  const parsed = sourceToCore(source);
  if (Result.isFailure(parsed)) throw parsed.failure;
  return Effect.runSync(validateCore(parsed.success));
};

const mutateCheckedDocument = async (mutate: (json: string) => string) => {
  const document = await checkedDocument();
  const mutated = Schema.decodeSync(CoreDocumentFromJson)(mutate(JSON.stringify(document)));
  Object.assign(document, mutated);
  return document;
};

const expectFailure = (
  result: GleamTargetProjectionResult,
  reason: GleamTargetProjectionReason,
): void => {
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.error.reason).toBe(reason);
};

describe("M017 Gleam BEAM actor projection", () => {
  test("emits deterministic Account source", async () => {
    const document = await checkedDocument();
    const first = projectGleamEntityOperationRealization(document, "Account", "WithdrawAccount");
    const second = projectGleamEntityOperationRealization(document, "Account", "WithdrawAccount");
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    expect(first.value).toBe(second.value);
    expect(first.value).toContain("pub opaque type DebitAccount");
    expect(first.value).toContain("pub fn debit_account() -> DebitAccount");
    expect(first.value).toContain("pub opaque type Account");
    expect(first.value).toContain("process.Name(Message)");
    expect(first.value).toContain("static_supervisor.OneForOne");
    expect(first.value).toContain("supervision.restart(supervision.Transient)");
    expect(first.value).toContain("supervision.significant(True)");
    expect(first.value).toContain("static_supervisor.AnySignificant");
    expect(first.value).toContain("pub fn withdraw(");
    expect(first.value).toContain("_capability: DebitAccount");
    expect(first.value).toContain("pub fn balance(account: Account) -> Int");
    expect(first.value).toContain("decode.run(value, decoder)");
    expect(first.value).toContain("Error(ExternalMessageRejected)");
    expect(first.value).toContain('core_state_machine_id = "Account"');
    expect(first.value).toContain('core_operation_id = "withdraw"');
    expect(first.value).toContain('core_realization_id = "WithdrawAccount"');
    expect(first.value).toContain('core_capability_id = "DebitAccount"');
    expect(first.value).toContain('core_failure_id = "WithdrawalRejected"');
  });
  test("rejects the exact-one realization instead of treating it as reusable", async () => {
    const document = await checkedDocument();
    expectFailure(
      projectGleamEntityOperationRealization(document, "Account", "WithdrawAccountOnce"),
      "unsupported-target",
    );
  });

  test("rejects selectors that do not identify checked declarations", async () => {
    const document = await checkedDocument();
    expectFailure(
      projectGleamEntityOperationRealization(document, "MissingAccount", "WithdrawAccount"),
      "inconsistent-declaration",
    );
    expectFailure(
      projectGleamEntityOperationRealization(document, "Account", "MissingWithdrawAccount"),
      "missing-declaration",
    );
  });

  test("rejects a state field that Gleam cannot represent", async () => {
    const document = await mutateCheckedDocument((json) =>
      json.replace('"id":"balance","type":"Integer"', '"id":"balance","type":"String"'),
    );
    expectFailure(
      projectGleamEntityOperationRealization(document, "Account", "WithdrawAccount"),
      "unsupported-target",
    );
  });

  test("rejects malformed initializer and transition shapes", async () => {
    const missingInitializer = structuredClone(await checkedDocument());
    const machine = missingInitializer.declarations.find(
      (declaration) => declaration.kind === "stateMachine" && declaration.id === "Account",
    );
    if (machine === undefined) throw new Error("Account state machine fixture is missing");
    Reflect.set(machine, "initializers", []);
    expectFailure(
      projectGleamEntityOperationRealization(missingInitializer, "Account", "WithdrawAccount"),
      "missing-declaration",
    );

    const wrongOperationParameter = await mutateCheckedDocument((json) =>
      json.replace(
        '"parameters":[{"id":"amount","type":"Integer"}]',
        '"parameters":[{"id":"amount","type":"String"}]',
      ),
    );
    expectFailure(
      projectGleamEntityOperationRealization(wrongOperationParameter, "Account", "WithdrawAccount"),
      "unsupported-target",
    );
  });

  test("rejects unsupported requirements and predicates", async () => {
    const wrongRequirement = structuredClone(await checkedDocument());
    const realization = wrongRequirement.declarations.find(
      (declaration) =>
        declaration.kind === "operationRealization" && declaration.id === "WithdrawAccount",
    );
    if (realization === undefined || realization.kind !== "operationRealization") {
      throw new Error("WithdrawAccount fixture is missing");
    }
    Reflect.set(realization, "requires", [
      { capability: "DebitAccount", quantity: { kind: "exactly", uses: "1" } },
    ]);
    expectFailure(
      projectGleamEntityOperationRealization(wrongRequirement, "Account", "WithdrawAccount"),
      "unsupported-target",
    );

    const wrongStateIdentity = await mutateCheckedDocument((json) =>
      json.replace('"id":"AccountState"', '"id":"type"'),
    );
    expectFailure(
      projectGleamEntityOperationRealization(wrongStateIdentity, "Account", "WithdrawAccount"),
      "invalid-identifier",
    );
  });

  test("rejects an unprojected additional invariant", async () => {
    const document = structuredClone(await checkedDocument());
    const machine = document.declarations.find(
      (declaration) => declaration.kind === "stateMachine" && declaration.id === "Account",
    );
    if (machine === undefined || machine.kind !== "stateMachine") {
      throw new Error("Account state machine fixture is missing");
    }
    const invariant = machine.invariants[0];
    if (invariant === undefined) throw new Error("Account invariant fixture is missing");
    Reflect.set(machine, "invariants", [
      invariant,
      { ...invariant, id: "additionalAccountInvariant" },
    ]);
    expectFailure(
      projectGleamEntityOperationRealization(document, "Account", "WithdrawAccount"),
      "unsupported-target",
    );
  });

  test("rejects collisions with generated Gleam identifiers", async () => {
    const collidingDocument = await mutateCheckedDocument((json) =>
      json.replace(/\]\}$/, ',{"kind":"capability","id":"Reply"}]}'),
    );
    expectFailure(
      projectGleamEntityOperationRealization(collidingDocument, "Account", "WithdrawAccount"),
      "identifier-collision",
    );
  });
});

describe("M031 Gleam exact-one actor projection", () => {
  test("accepts only the checked exact-one realization and emits deterministic probe API", async () => {
    const document = await checkedDocument();
    const first = projectGleamExactOneOperationRealization(document, "WithdrawAccountOnce");
    const second = projectGleamExactOneOperationRealization(document, "WithdrawAccountOnce");
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    expect(first.value).toBe(second.value);
    expect(first.value).toContain("// Generated by BANG M031");
    expect(first.value).toContain("pub fn run_exact_one_probe() -> String");
    expect(first.value).toContain("pub fn issue_grant(");
    expect(first.value).toContain("pub fn competing(");
    expect(first.value).toContain("pub type CounterMessage");
    expect(first.value).toContain("StaleGrantRejected");
    expect(first.value).toContain("CapabilityUseRejected");
    expect(first.value).toContain("supervision.restart(supervision.Transient)");
    expect(first.value).toContain("actor.stop_abnormal");
    expect(first.value).toContain("BANG_M031_RESULT|");
    expect(first.value).toContain("competingSuccesses");
    expect(first.value).toContain("competingRejections");
    expect(first.value).not.toContain("account_pid");
    const transitionCheck = first.value.indexOf("case transition_enabled(state, amount)");
    const destinationCheck = first.value.indexOf("destination == account_entity_id");
    const consumption = first.value.indexOf("consumed_state(state, grant)");
    const operationTransition = first.value.indexOf("consumed.balance - amount");
    expect(destinationCheck).toBeGreaterThanOrEqual(0);
    expect(transitionCheck).toBeGreaterThan(destinationCheck);
    expect(consumption).toBeGreaterThan(transitionCheck);
    expect(operationTransition).toBeGreaterThan(consumption);
  });

  test("rejects unbounded and wrong-realization declarations", async () => {
    const document = await checkedDocument();
    expectFailure(
      projectGleamExactOneOperationRealization(document, "WithdrawAccount"),
      "unsupported-target",
    );

    const wrongQuantity = await mutateCheckedDocument((json) =>
      json.replace('"quantity":{"kind":"exactly","uses":"1"}', '"quantity":{"kind":"unbounded"}'),
    );
    expectFailure(
      projectGleamExactOneOperationRealization(wrongQuantity, "WithdrawAccountOnce"),
      "unsupported-target",
    );
  });

  test("rejects generated identifier collisions without changing M017 projection", async () => {
    const collidingDocument = await mutateCheckedDocument((json) =>
      json.replace(/\]\}$/, ',{"kind":"capability","id":"Grant"}]}'),
    );
    expectFailure(
      projectGleamExactOneOperationRealization(collidingDocument, "WithdrawAccountOnce"),
      "identifier-collision",
    );

    const unbounded = projectGleamEntityOperationRealization(
      await checkedDocument(),
      "Account",
      "WithdrawAccount",
    );
    expect(unbounded.ok).toBe(true);
  });
});
