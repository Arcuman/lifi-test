import type { FeeEventWriteRepository } from "../../ports/fee-event-write-repository";
import type { CollectedFeeEvent } from "../../ports/fees-collected-gateway";
import type { SyncStateRepository } from "../../ports/sync-state-repository";
import type { TransactionManager } from "../../ports/transaction-manager";
import type { IndexerPartition } from "./indexer.types";

interface CommitIndexerBatchOptions {
  transactionManager: TransactionManager;
  feeEventRepository: FeeEventWriteRepository;
  syncStateRepository: SyncStateRepository;
  partition: IndexerPartition;
  fromBlock: number;
  toBlock: number;
  events: CollectedFeeEvent[];
  assertLeaseActive(): void;
}

export const commitIndexerBatch = async ({
  transactionManager,
  feeEventRepository,
  syncStateRepository,
  partition,
  fromBlock,
  toBlock,
  events,
  assertLeaseActive
}: CommitIndexerBatchOptions): Promise<void> => {
  assertLeaseActive();

  await transactionManager.withTransaction(async (transaction) => {
    assertLeaseActive();
    await feeEventRepository.replaceRange(
      {
        chainId: partition.chainId,
        contractAddress: partition.contractAddress,
        eventName: partition.eventName,
        fromBlock,
        toBlock,
        events
      },
      transaction
    );
    await syncStateRepository.updateProgress(
      {
        key: partition.key,
        chainId: partition.chainId,
        contractAddress: partition.contractAddress,
        eventName: partition.eventName,
        lastFinalizedScannedBlock: toBlock,
        reorgLookback: partition.reorgLookback,
        status: "running",
        lastError: null
      },
      transaction
    );
  });
};
