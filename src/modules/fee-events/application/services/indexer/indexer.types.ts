import type { ScanWindow } from "../../scan-window";
import type { SyncStateRecord } from "../../ports/sync-state-repository";

export interface RunOnceResult {
  processedEvents: number;
  processedBatches: number;
  scannedToBlock: number | null;
}

export interface EmptyCycleResult extends RunOnceResult {
  processedEvents: 0;
  processedBatches: 0;
  scannedToBlock: null;
}

export interface IndexerPartition {
  key: string;
  chainId: number;
  contractAddress: string;
  eventName: "FeesCollected";
  startBlock: number;
  reorgLookback: number;
  initialBatchSize: number;
  minBatchSize: number;
  maxBatchSize: number;
}

export interface PlannedCycle {
  partition: IndexerPartition;
  currentSync: SyncStateRecord | null;
  lastScanned: number;
  safeHead: number;
  replayLookback: boolean;
  window: ScanWindow;
}

export interface BatchProgress extends RunOnceResult {}

export type IndexerCyclePlan =
  | {
      kind: "idle";
      result: EmptyCycleResult;
    }
  | {
      kind: "planned";
      cycle: PlannedCycle;
    };
