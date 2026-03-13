export interface ScanWindowParams {
  startBlock: number;
  lastFinalizedScannedBlock: number;
  reorgLookback: number;
  safeHead: number;
  replayLookback?: boolean;
}

export interface ScanWindow {
  fromBlock: number;
  toBlock: number;
}

export const planScanWindow = ({
  startBlock,
  lastFinalizedScannedBlock,
  reorgLookback,
  safeHead,
  replayLookback = true
}: ScanWindowParams): ScanWindow | null => {
  const rewindBlocks = replayLookback ? reorgLookback : 0;
  const fromBlock = Math.max(
    startBlock,
    lastFinalizedScannedBlock + 1 - rewindBlocks
  );
  if (fromBlock > safeHead) {
    return null;
  }
  return { fromBlock, toBlock: safeHead };
};
