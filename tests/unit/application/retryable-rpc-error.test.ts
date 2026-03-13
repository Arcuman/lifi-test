import { describe, expect, test } from "vitest";

import { RpcTimeoutError } from "../../../src/modules/fee-events/application/errors/rpc-timeout-error";
import { isRetryableRpcError } from "../../../src/modules/fee-events/application/is-retryable-rpc-error";

describe("isRetryableRpcError", () => {
  test("returns true for timeout errors", () => {
    expect(isRetryableRpcError(new RpcTimeoutError("timeout"))).toBe(true);
  });

  test("returns true for quorum failures caused by provider range limits", () => {
    const error = Object.assign(new Error("failed to meet quorum"), {
      reason: "failed to meet quorum",
      method: "getLogs",
      results: [
        {
          error: {
            body: JSON.stringify({
              error: {
                code: -32001,
                message: "Block range too large: maximum allowed is 500 blocks"
              }
            })
          }
        },
        {
          error: {
            body: JSON.stringify({
              error: {
                code: 35,
                message:
                  "ranges over 10000 blocks are not supported on freetier"
              }
            })
          }
        }
      ]
    });

    expect(isRetryableRpcError(error)).toBe(true);
  });

  test("returns false when providers only report pruned history", () => {
    const error = Object.assign(new Error("failed to meet quorum"), {
      reason: "failed to meet quorum",
      method: "getLogs",
      results: [
        {
          error: {
            body: JSON.stringify({
              error: {
                code: -32701,
                message: "History has been pruned for this block"
              }
            })
          }
        }
      ]
    });

    expect(isRetryableRpcError(error)).toBe(false);
  });
});
