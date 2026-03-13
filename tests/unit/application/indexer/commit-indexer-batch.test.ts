import { describe, expect, test, vi } from "vitest";

import type { FeeEventWriteRepository } from "../../../../src/modules/fee-events/application/ports/fee-event-write-repository";
import type { SyncStateRepository } from "../../../../src/modules/fee-events/application/ports/sync-state-repository";
import type {
  TransactionContext,
  TransactionManager
} from "../../../../src/modules/fee-events/application/ports/transaction-manager";
import { commitIndexerBatch } from "../../../../src/modules/fee-events/application/services/indexer/commit-indexer-batch";
import type { IndexerPartition } from "../../../../src/modules/fee-events/application/services/indexer/indexer.types";
import { makeSampleFeeEvent } from "../../../helpers/sample-fee-event";

const partition: IndexerPartition = {
  key: "137:collector:FeesCollected",
  chainId: 137,
  contractAddress: "0xcollector",
  eventName: "FeesCollected",
  startBlock: 78600000,
  reorgLookback: 32,
  initialBatchSize: 100,
  minBatchSize: 10,
  maxBatchSize: 500
};

describe("commitIndexerBatch", () => {
  test("writes fee events and sync progress in the same transaction", async () => {
    const transaction = {} as TransactionContext;
    const replaceRange = vi.fn(async () => undefined);
    const updateProgress = vi.fn(async () => undefined);
    const transactionManager: TransactionManager = {
      withTransaction: async (work) => work(transaction)
    };
    const feeEventRepository: FeeEventWriteRepository = {
      replaceRange
    };
    const syncStateRepository: SyncStateRepository = {
      acquireLease: async () => null,
      renewLease: async () => true,
      updateProgress,
      getByKey: async () => null
    };
    const assertLeaseActive = vi.fn();
    const event = makeSampleFeeEvent();

    await commitIndexerBatch({
      transactionManager,
      feeEventRepository,
      syncStateRepository,
      partition,
      fromBlock: event.blockNumber,
      toBlock: event.blockNumber,
      events: [event],
      assertLeaseActive
    });

    expect(assertLeaseActive).toHaveBeenCalledTimes(2);
    expect(replaceRange).toHaveBeenCalledWith(
      {
        chainId: partition.chainId,
        contractAddress: partition.contractAddress,
        eventName: partition.eventName,
        fromBlock: event.blockNumber,
        toBlock: event.blockNumber,
        events: [event]
      },
      transaction
    );
    expect(updateProgress).toHaveBeenCalledWith(
      {
        key: partition.key,
        chainId: partition.chainId,
        contractAddress: partition.contractAddress,
        eventName: partition.eventName,
        lastFinalizedScannedBlock: event.blockNumber,
        reorgLookback: partition.reorgLookback,
        status: "running",
        lastError: null
      },
      transaction
    );
  });
});
