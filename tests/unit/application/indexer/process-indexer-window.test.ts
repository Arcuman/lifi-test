import { describe, expect, test, vi } from "vitest";

import type {
  CollectedFeeEvent,
  FeesCollectedGateway
} from "../../../../src/modules/fee-events/application/ports/fees-collected-gateway";
import type { SyncStateRepository } from "../../../../src/modules/fee-events/application/ports/sync-state-repository";
import type {
  TransactionContext,
  TransactionManager
} from "../../../../src/modules/fee-events/application/ports/transaction-manager";
import type { IndexerLogger } from "../../../../src/modules/fee-events/application/services/indexer/indexer-logger";
import { processIndexerWindow } from "../../../../src/modules/fee-events/application/services/indexer/process-indexer-window";
import type { PlannedCycle } from "../../../../src/modules/fee-events/application/services/indexer/indexer.types";
import { RpcTimeoutError } from "../../../../src/modules/fee-events/application/errors/rpc-timeout-error";
import { makeSampleFeeEvent } from "../../../helpers/sample-fee-event";

describe("processIndexerWindow", () => {
  test("processes the planned window and accumulates progress", async () => {
    const ranges: string[] = [];
    const event = makeSampleFeeEvent({ blockNumber: 10 });
    const gateway = createGateway(ranges, {
      "10-19": [event],
      "20-20": []
    });
    const replaceRange = vi.fn(async () => undefined);
    const updateProgress = vi.fn(async () => undefined);

    const result = await processIndexerWindow({
      cycle: createCycle(),
      gateway,
      feeEventRepository: {
        replaceRange
      },
      syncStateRepository: createSyncStateRepository({
        updateProgress
      }),
      transactionManager: createTransactionManager(),
      logger: createLogger(),
      assertLeaseActive: vi.fn()
    });

    expect(result).toEqual({
      processedEvents: 1,
      processedBatches: 2,
      scannedToBlock: 20
    });
    expect(ranges).toEqual(["10-19", "20-20"]);
    expect(replaceRange).toHaveBeenCalledTimes(2);
    expect(updateProgress).toHaveBeenCalledTimes(2);
  });

  test("shrinks the batch when a retryable RPC error occurs", async () => {
    const ranges: string[] = [];
    const gateway = createGateway(ranges, {
      "10-19": new RpcTimeoutError("timeout"),
      "10-14": [],
      "15-19": []
    });
    const logger = createLogger();

    const result = await processIndexerWindow({
      cycle: createCycle({
        partition: {
          ...createCycle().partition,
          initialBatchSize: 10,
          minBatchSize: 5
        },
        window: {
          fromBlock: 10,
          toBlock: 19
        }
      }),
      gateway,
      feeEventRepository: {
        replaceRange: vi.fn(async () => undefined)
      },
      syncStateRepository: createSyncStateRepository(),
      transactionManager: createTransactionManager(),
      logger,
      assertLeaseActive: vi.fn()
    });

    expect(result.processedBatches).toBe(2);
    expect(ranges).toEqual(["10-19", "10-14", "15-19"]);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  test("throws non-retryable gateway errors without persisting", async () => {
    const replaceRange = vi.fn(async () => undefined);

    await expect(
      processIndexerWindow({
        cycle: createCycle(),
        gateway: createGateway([], {
          "10-19": new Error("boom")
        }),
        feeEventRepository: {
          replaceRange
        },
        syncStateRepository: createSyncStateRepository(),
        transactionManager: createTransactionManager(),
        logger: createLogger(),
        assertLeaseActive: vi.fn()
      })
    ).rejects.toThrow(/boom/i);

    expect(replaceRange).not.toHaveBeenCalled();
  });
});

const createCycle = (
  overrides: Partial<PlannedCycle> = {}
): PlannedCycle => ({
  partition: {
    key: "137:collector:FeesCollected",
    chainId: 137,
    contractAddress: "0xcollector",
    eventName: "FeesCollected",
    startBlock: 10,
    reorgLookback: 32,
    initialBatchSize: 10,
    minBatchSize: 5,
    maxBatchSize: 20
  },
  currentSync: null,
  lastScanned: 9,
  safeHead: 20,
  replayLookback: true,
  window: {
    fromBlock: 10,
    toBlock: 20
  },
  ...overrides
});

const createGateway = (
  ranges: string[],
  responses: Record<string, CollectedFeeEvent[] | Error>
): FeesCollectedGateway => ({
  getSafeHead: async () => 0,
  getFeesCollectedEvents: async (fromBlock, toBlock) => {
    const key = `${fromBlock}-${toBlock}`;
    ranges.push(key);
    const response = responses[key] ?? [];
    if (response instanceof Error) {
      throw response;
    }
    return response;
  }
});

const createSyncStateRepository = (
  overrides: Partial<SyncStateRepository> = {}
): SyncStateRepository => ({
  acquireLease: async () => null,
  renewLease: async () => true,
  updateProgress: async () => undefined,
  getByKey: async () => null,
  ...overrides
});

const createTransactionManager = (): TransactionManager => ({
  withTransaction: async (work) => work({} as TransactionContext)
});

const createLogger = (): IndexerLogger => ({
  info: vi.fn(),
  warn: vi.fn()
});
