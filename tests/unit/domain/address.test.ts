import { describe, expect, test } from "vitest";

import {
  InvalidAddressError,
  normalizeAddress
} from "../../../src/modules/fee-events/domain/address";

describe("normalizeAddress", () => {
  test("returns lowercase canonical address", () => {
    expect(normalizeAddress("0xbD6C7B0d2f68c2b7805d88388319cfB6EcB50eA9")).toBe(
      "0xbd6c7b0d2f68c2b7805d88388319cfb6ecb50ea9"
    );
  });

  test("throws for invalid address", () => {
    expect(() => normalizeAddress("abc")).toThrow(InvalidAddressError);
  });
});
