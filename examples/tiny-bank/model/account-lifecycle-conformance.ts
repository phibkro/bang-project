import { AccountLifecycleValidCases } from "../../../generated/effect/AccountLifecycleModel.ts";
import { accountLifecycleModel } from "../implementation/account-lifecycle-model.ts";

let checkedRows = 0;
for (const row of AccountLifecycleValidCases.freeze) {
  const [status] = row.arguments;
  const actual = accountLifecycleModel.freeze(status);
  if (actual !== row.result) {
    throw new Error(`freeze(${status}) returned ${actual}; expected ${row.result}`);
  }
  checkedRows += 1;
}

console.log(`PASS AccountLifecycle realization (${checkedRows} exhaustive rows)`);
