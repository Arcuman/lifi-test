import type { FeeEventsIndexerConfig } from "../../fee-events-worker-config.types";
import type { EmptyCycleResult, IndexerPartition } from "./indexer.types";

export const createEmptyCycleResult = (): EmptyCycleResult => ({
  processedEvents: 0,
  processedBatches: 0,
  scannedToBlock: null
});

export const buildIndexerPartition = (
  config: FeeEventsIndexerConfig,
  key: string
): IndexerPartition => ({
  key,
  chainId: config.chain.chainId,
  contractAddress: config.feeCollectorAddress,
  eventName: "FeesCollected",
  startBlock: config.startBlock,
  reorgLookback: config.reorgLookback,
  initialBatchSize: config.initialBatchSize,
  minBatchSize: config.minBatchSize,
  maxBatchSize: config.maxBatchSize
});
