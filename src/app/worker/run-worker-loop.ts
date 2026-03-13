import { setTimeout as sleep } from "node:timers/promises";

import type { Logger } from "pino";

import type { WorkerCycleService } from "./worker-cycle-service.types";

export interface RunWorkerLoopOptions {
  logger: Logger;
  service: WorkerCycleService;
  pollIntervalMs: number;
  once: boolean;
  signal?: AbortSignal;
}

export const runWorkerLoop = async ({
  logger,
  service,
  pollIntervalMs,
  once,
  signal
}: RunWorkerLoopOptions): Promise<void> => {
  do {
    if (signal?.aborted) {
      return;
    }

    const result = await service.runOnce();
    logger.info(
      {
        scannedToBlock: result.scannedToBlock,
        processedBatches: result.processedBatches,
        processedEvents: result.processedEvents
      },
      "Worker cycle completed"
    );

    if (once || signal?.aborted) {
      return;
    }

    await sleep(
      pollIntervalMs,
      undefined,
      signal ? { signal } : undefined
    ).catch((error: unknown) => {
      if (isAbortError(error)) {
        return;
      }
      throw error;
    });
  } while (!signal?.aborted);
};

const isAbortError = (error: unknown): boolean =>
  error instanceof Error && error.name === "AbortError";
