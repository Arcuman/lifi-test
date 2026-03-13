import { AdaptiveBatchController } from "../../adaptive-batch-controller";
import { isRetryableRpcError } from "../../is-retryable-rpc-error";
import type { FeeEventWriteRepository } from "../../ports/fee-event-write-repository";
import type { FeesCollectedGateway } from "../../ports/fees-collected-gateway";
import type { SyncStateRepository } from "../../ports/sync-state-repository";
import type { TransactionManager } from "../../ports/transaction-manager";
import { commitIndexerBatch } from "./commit-indexer-batch";
import type { IndexerLogger } from "./indexer-logger";
import type { BatchProgress, PlannedCycle } from "./indexer.types";

interface ProcessIndexerWindowOptions {
  cycle: PlannedCycle;
  gateway: FeesCollectedGateway;
  feeEventRepository: FeeEventWriteRepository;
  syncStateRepository: SyncStateRepository;
  transactionManager: TransactionManager;
  logger: IndexerLogger;
  assertLeaseActive(): void;
}

export const processIndexerWindow = async ({
  cycle,
  gateway,
  feeEventRepository,
  syncStateRepository,
  transactionManager,
  logger,
  assertLeaseActive
}: ProcessIndexerWindowOptions): Promise<BatchProgress> => {
  const controller = new AdaptiveBatchController({
    initialSize: cycle.partition.initialBatchSize,
    minSize: cycle.partition.minBatchSize,
    maxSize: cycle.partition.maxBatchSize
  });

  let fromBlock = cycle.window.fromBlock;
  const progress: BatchProgress = {
    processedEvents: 0,
    processedBatches: 0,
    scannedToBlock: null
  };

  while (fromBlock <= cycle.window.toBlock) {
    assertLeaseActive();
    const batchFrom = fromBlock;
    const toBlock = Math.min(
      cycle.window.toBlock,
      fromBlock + controller.currentSize - 1
    );
    const batchSize = controller.currentSize;

    logger.info(
      {
        partitionKey: cycle.partition.key,
        fromBlock,
        toBlock,
        batchSize
      },
      "Indexer batch started"
    );

    try {
      const events = await gateway.getFeesCollectedEvents(fromBlock, toBlock);
      assertLeaseActive();

      await commitIndexerBatch({
        transactionManager,
        feeEventRepository,
        syncStateRepository,
        partition: cycle.partition,
        fromBlock: batchFrom,
        toBlock,
        events,
        assertLeaseActive
      });

      progress.processedEvents += events.length;
      progress.processedBatches += 1;
      progress.scannedToBlock = toBlock;
      fromBlock = toBlock + 1;
      controller.onSuccess();

      logger.info(
        {
          partitionKey: cycle.partition.key,
          fromBlock: batchFrom,
          toBlock,
          batchSize,
          eventsCount: events.length,
          processedBatches: progress.processedBatches,
          processedEvents: progress.processedEvents,
          nextBatchSize: controller.currentSize
        },
        "Indexer batch committed"
      );
    } catch (error) {
      if (
        isRetryableRpcError(error) &&
        controller.currentSize > cycle.partition.minBatchSize
      ) {
        const previousBatchSize = controller.currentSize;
        controller.onTimeout();

        logger.warn(
          {
            partitionKey: cycle.partition.key,
            fromBlock,
            toBlock,
            batchSize: previousBatchSize,
            nextBatchSize: controller.currentSize,
            error
          },
          "Indexer batch failed with retryable RPC error; reducing batch size"
        );
        continue;
      }

      throw error;
    }
  }

  return progress;
};
