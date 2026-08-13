import { Balance, makeBalance } from "../../../generated/effect/Balance.ts";
import type { Balance as BalanceType } from "../../../generated/effect/Balance.ts";

const lowerBoundary: BalanceType = makeBalance(0n);
if (lowerBoundary !== 0n) throw new Error("Balance changed its represented value");
console.log("PASS Balance lower boundary");

// @ts-expect-error A raw bigint has not crossed the generated constructor boundary.
const unbranded: BalanceType = 0n;
void unbranded;

let negativeRejected = false;
try {
  makeBalance(-1n);
} catch {
  negativeRejected = true;
}
if (!negativeRejected) throw new Error("negative Balance was accepted");
console.log("PASS negative Balance rejection");

let foreignNumberRejected = false;
try {
  Balance.make(0 as never);
} catch {
  foreignNumberRejected = true;
}
if (!foreignNumberRejected) throw new Error("number input crossed the bigint boundary");
console.log("PASS non-bigint boundary rejection");
