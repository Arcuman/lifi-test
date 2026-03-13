import { describe, expect, test, vi } from "vitest";

import { installWorkerShutdown } from "../../../src/app/worker/worker-shutdown";

describe("installWorkerShutdown", () => {
  test("aborts the worker on SIGTERM without closing runtime resources directly", () => {
    const abortController = new AbortController();
    const logger = {
      info: vi.fn()
    };

    const dispose = installWorkerShutdown({
      abortController,
      logger: logger as never
    });

    process.emit("SIGTERM");

    expect(abortController.signal.aborted).toBe(true);
    expect(logger.info).toHaveBeenCalledWith(
      { signal: "SIGTERM" },
      "Shutting down worker"
    );

    dispose();
  });
});
