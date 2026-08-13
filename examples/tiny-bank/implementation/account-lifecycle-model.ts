import type { AccountLifecycleModel } from "../../../generated/effect/AccountLifecycleModel.ts";

export const accountLifecycleModel = {
  freeze: (status) => (status === "Open" ? "Frozen" : status),
} satisfies AccountLifecycleModel;
