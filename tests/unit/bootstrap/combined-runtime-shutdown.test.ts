import { describe, expect, test } from "vitest";

import { closeCombinedRuntime } from "../../../src/app/bootstrap/combined-runtime-shutdown";

describe("closeCombinedRuntime", () => {
  test("waits for the worker loop before closing shared runtime resources", async () => {
    const abortController = new AbortController();
    const order: string[] = [];
    let resolveWorker!: () => void;
    const workerPromise = new Promise<void>((resolve) => {
      resolveWorker = resolve;
    });

    const closing = closeCombinedRuntime({
      abortController,
      closeServer: async () => {
        order.push("server");
      },
      workerPromise,
      closeRuntime: async () => {
        order.push("runtime");
      }
    });

    await Promise.resolve();

    expect(abortController.signal.aborted).toBe(true);
    expect(order).toEqual(["server"]);

    resolveWorker();
    await closing;

    expect(order).toEqual(["server", "runtime"]);
  });

  test("still closes shared runtime resources when the worker loop rejects", async () => {
    const abortController = new AbortController();
    const order: string[] = [];

    await closeCombinedRuntime({
      abortController,
      closeServer: async () => {
        order.push("server");
      },
      workerPromise: Promise.reject(new Error("worker failed")),
      closeRuntime: async () => {
        order.push("runtime");
      }
    });

    expect(abortController.signal.aborted).toBe(true);
    expect(order).toEqual(["server", "runtime"]);
  });
});
