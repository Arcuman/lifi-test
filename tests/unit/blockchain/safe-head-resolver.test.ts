import { describe, expect, test } from "vitest";

import { resolveSafeHead } from "../../../src/modules/fee-events/infrastructure/blockchain/safe-head-resolver";

describe("resolveSafeHead", () => {
  test("uses finalized block when provider supports it", async () => {
    const provider = {
      getBlock: async () => ({ number: 100 }),
      getBlockNumber: async () => 200
    };

    await expect(
      resolveSafeHead({ provider, confirmationsFallback: 64 })
    ).resolves.toBe(100);
  });

  test("falls back to latest minus confirmations when finalized is unavailable", async () => {
    const provider = {
      getBlock: async () => {
        throw new Error("unsupported");
      },
      getBlockNumber: async () => 200
    };

    await expect(
      resolveSafeHead({ provider, confirmationsFallback: 64 })
    ).resolves.toBe(136);
  });
});
