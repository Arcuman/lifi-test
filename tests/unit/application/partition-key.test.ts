import { describe, expect, test } from "vitest";

import { buildFeeCollectorPartitionKey } from "../../../src/modules/fee-events/application/partition-key";

describe("buildFeeCollectorPartitionKey", () => {
  test("returns the same key for the same partition input", () => {
    const first = buildFeeCollectorPartitionKey({
      chainId: 137,
      contractAddress: "0xbd6c7b0d2f68c2b7805d88388319cfb6ecb50ea9",
      eventName: "FeesCollected"
    });
    const second = buildFeeCollectorPartitionKey({
      chainId: 137,
      contractAddress: "0xbd6c7b0d2f68c2b7805d88388319cfb6ecb50ea9",
      eventName: "FeesCollected"
    });

    expect(first).toBe(second);
    expect(first).toBe(
      "137:0xbd6c7b0d2f68c2b7805d88388319cfb6ecb50ea9:FeesCollected"
    );
  });
});
