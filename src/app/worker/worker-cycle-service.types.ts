export interface WorkerCycleResult {
  processedEvents: number;
  processedBatches: number;
  scannedToBlock: number | null;
}

export interface WorkerCycleService {
  runOnce(): Promise<WorkerCycleResult>;
}
