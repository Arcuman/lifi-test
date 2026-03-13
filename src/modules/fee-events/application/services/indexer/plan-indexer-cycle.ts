import { planScanWindow } from "../../scan-window";
import type { FeesCollectedGateway } from "../../ports/fees-collected-gateway";
import type { SyncStateRepository } from "../../ports/sync-state-repository";
import type { IndexerLogger } from "./indexer-logger";
import type { IndexerLease } from "./indexer-lease";
import { createEmptyCycleResult } from "./indexer-cycle";
import {
  type IndexerCyclePlan,
  type IndexerPartition
} from "./indexer.types";

interface PlanIndexerCycleOptions {
  partition: IndexerPartition;
  gateway: FeesCollectedGateway;
  syncStateRepository: SyncStateRepository;
  hasCompletedInitialReplay: boolean;
  logger: IndexerLogger;
  lease: Pick<IndexerLease, "throwIfLost">;
}

export const planIndexerCycle = async ({
  partition,
  gateway,
  syncStateRepository,
  hasCompletedInitialReplay,
  logger,
  lease
}: PlanIndexerCycleOptions): Promise<IndexerCyclePlan> => {
  lease.throwIfLost();
  const currentSync = await syncStateRepository.getByKey(partition.key);
  const lastScanned =
    currentSync?.lastFinalizedScannedBlock ?? partition.startBlock - 1;

  lease.throwIfLost();
  const safeHead = await gateway.getSafeHead();
  const replayLookback = !hasCompletedInitialReplay;

  if (!replayLookback && currentSync && safeHead <= lastScanned) {
    logger.info(
      {
        partitionKey: partition.key,
        safeHead,
        lastScanned
      },
      "Indexer is up to date"
    );
    return {
      kind: "idle",
      result: createEmptyCycleResult()
    };
  }

  const window = planScanWindow({
    startBlock: partition.startBlock,
    lastFinalizedScannedBlock: lastScanned,
    reorgLookback: partition.reorgLookback,
    safeHead,
    replayLookback
  });

  if (!window) {
    logger.info(
      {
        partitionKey: partition.key,
        safeHead,
        lastScanned
      },
      "Indexer has no safe block window to scan"
    );
    return {
      kind: "idle",
      result: createEmptyCycleResult()
    };
  }

  logger.info(
    {
      partitionKey: partition.key,
      safeHead,
      lastScanned,
      fromBlock: window.fromBlock,
      toBlock: window.toBlock,
      initialBatchSize: partition.initialBatchSize,
      replayLookback
    },
    "Indexer cycle started"
  );

  return {
    kind: "planned",
    cycle: {
      partition,
      currentSync,
      lastScanned,
      safeHead,
      replayLookback,
      window
    }
  };
};
