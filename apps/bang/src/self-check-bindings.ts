export interface SelfCheckBinding {
  readonly id: string;
  readonly declarationId: "BridgeTerm";
  readonly implementationSourcePath: string;
  readonly adapterPath: string;
}

const canonicalBinding: SelfCheckBinding = {
  id: "bang-core-bridge-term",
  declarationId: "BridgeTerm",
  implementationSourcePath: "packages/core/src/index.ts",
  adapterPath: "apps/bang/src/self-check-bridge-term.ts",
};

const driftedBinding: SelfCheckBinding = {
  id: "bang-core-bridge-term-drifted",
  implementationSourcePath: "packages/core/src/index.ts",
  declarationId: "BridgeTerm",
  adapterPath: "apps/bang/src/self-check-bridge-term-drifted.ts",
};

const materialChangeBinding: SelfCheckBinding = {
  id: "bang-core-bridge-term-material-change",
  implementationSourcePath: "packages/core/src/index.ts",
  adapterPath: "apps/bang/src/self-check-bridge-term-material-change.ts",
  declarationId: "BridgeTerm",
};

/** Resolve one application-owned implementation binding. */
export const resolveSelfCheckBinding = (id: string): SelfCheckBinding | undefined => {
  switch (id) {
    case canonicalBinding.id:
      return canonicalBinding;
    case driftedBinding.id:
      return driftedBinding;
    case materialChangeBinding.id:
      return materialChangeBinding;
    default:
      return undefined;
  }
};
