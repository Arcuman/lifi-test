import { describe, expect, test } from "vitest";

import {
  decodeCursor,
  encodeCursor
} from "../../../src/modules/fee-events/application/cursor-codec";

describe("cursor codec", () => {
  test("encodes and decodes cursor values without loss", () => {
    const original = {
      blockNumber: 78600001,
      logIndex: 4,
      chainId: 137,
      id: "507f1f77bcf86cd799439011"
    };

    expect(decodeCursor(encodeCursor(original))).toEqual(original);
  });
});
