import { describe, expect, test } from "vitest";

import {
  defaultFeeCollectorContractDefinition,
  resolveFeeCollectorContractDefinition
} from "../../../src/modules/fee-events/infrastructure/blockchain/fee-collector-contract-definition";

describe("resolveFeeCollectorContractDefinition", () => {
  test("resolves the default definition for known chains", () => {
    expect(resolveFeeCollectorContractDefinition("polygon")).toBe(
      defaultFeeCollectorContractDefinition
    );
    expect(resolveFeeCollectorContractDefinition("ethereum")).toBe(
      defaultFeeCollectorContractDefinition
    );
  });

  test("falls back to the default definition for custom chains", () => {
    expect(resolveFeeCollectorContractDefinition("customl2")).toBe(
      defaultFeeCollectorContractDefinition
    );
  });
});
