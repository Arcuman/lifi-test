import { describe, expect, test } from "vitest";

import {
  InvalidCursorError,
  parseFeesQuery
} from "../../../src/modules/fee-events/infrastructure/http/fees-query-schema";

describe("parseFeesQuery", () => {
  test("returns a normalized query contract", () => {
    expect(
      parseFeesQuery({
        integrator: "0x1111111111111111111111111111111111111111",
        chainId: "137",
        fromBlock: "10",
        toBlock: "20",
        limit: "25"
      })
    ).toEqual({
      integrator: "0x1111111111111111111111111111111111111111",
      chainId: 137,
      fromBlock: 10,
      toBlock: 20,
      limit: 25
    });
  });

  test("rejects invalid integrator", () => {
    expect(() => parseFeesQuery({ integrator: "abc" })).toThrow(/integrator/i);
  });

  test("rejects a limit above max", () => {
    expect(() =>
      parseFeesQuery({
        integrator: "0x1111111111111111111111111111111111111111",
        limit: "999"
      })
    ).toThrow(/limit/i);
  });

  test("rejects malformed cursors with a dedicated error", () => {
    expect(() =>
      parseFeesQuery({
        integrator: "0x1111111111111111111111111111111111111111",
        cursor: "***"
      })
    ).toThrow(InvalidCursorError);
  });
});
