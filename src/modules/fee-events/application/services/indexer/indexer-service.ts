import { buildFeeCollectorPartitionKey } from "../../partition-key";
import type { FeeEventWriteRepository } from "../../ports/fee-event-write-repository";
import type { FeesCollectedGateway } from "../../ports/fees-collected-gateway";
import type { SyncStateRepository } from "../../ports/sync-state-repository";
import type { TransactionManager } from "../../ports/transaction-manager";
import type { FeeEventsIndexerConfig } from "../../fee-events-worker-config.types";
import { IndexerLease } from "./indexer-lease";
import { noopIndexerLogger, type IndexerLogger } from "./indexer-logger";
import { buildIndexerPartition, createEmptyCycleResult } from "./indexer-cycle";
import { planIndexerCycle } from "./plan-indexer-cycle";
import { processIndexerWindow } from "./process-indexer-window";
import type { IndexerPartition, RunOnceResult } from "./indexer.types";

export interface IndexerServiceOptions {
  workerInstanceId: string;
  indexerConfig: FeeEventsIndexerConfig;
  gateway: FeesCollectedGateway;
  feeEventRepository: FeeEventWriteRepository;
  syncStateRepository: SyncStateRepository;
  transactionManager: TransactionManager;
  logger?: IndexerLogger;
  leaseDurationMs: number;
  leaseRenewIntervalMs: number;
}

export class IndexerService {
  private readonly partition: IndexerPartition;
  private hasCompletedInitialReplay = false;

  constructor(private readonly options: IndexerServiceOptions) {
    this.partition = buildIndexerPartition(
      this.options.indexerConfig,
      buildFeeCollectorPartitionKey({
        chainId: this.options.indexerConfig.chain.chainId,
        contractAddress: this.options.indexerConfig.feeCollectorAddress,
        eventName: "FeesCollected"
      })
    );
  }

  async runOnce(): Promise<RunOnceResult> {
    const lease = await IndexerLease.acquire({
      syncStateRepository: this.options.syncStateRepository,
      partition: this.partition,
      workerInstanceId: this.options.workerInstanceId,
      leaseDurationMs: this.options.leaseDurationMs,
      leaseRenewIntervalMs: this.options.leaseRenewIntervalMs
    });

    if (!lease) {
      return createEmptyCycleResult();
    }

    try {
      const cyclePlan = await planIndexerCycle({
        partition: this.partition,
        gateway: this.options.gateway,
        syncStateRepository: this.options.syncStateRepository,
        hasCompletedInitialReplay: this.hasCompletedInitialReplay,
        logger: this.logger,
        lease
      });

      if (cyclePlan.kind === "idle") {
        await this.tryMarkIdle();
        return cyclePlan.result;
      }

      const result = await processIndexerWindow({
        cycle: cyclePlan.cycle,
        gateway: this.options.gateway,
        feeEventRepository: this.options.feeEventRepository,
        syncStateRepository: this.options.syncStateRepository,
        transactionManager: this.options.transactionManager,
        logger: this.logger,
        assertLeaseActive: () => {
          lease.throwIfLost();
        }
      });

      this.hasCompletedInitialReplay = true;
      await this.tryMarkIdle();
      return result;
    } catch (error) {
      await this.tryMarkError(error);
      throw error;
    } finally {
      lease.stop();
    }
  }

  private get logger(): IndexerLogger {
    return this.options.logger ?? noopIndexerLogger;
  }

  private async markIdle(): Promise<void> {
    const currentSync = await this.options.syncStateRepository.getByKey(
      this.partition.key
    );

    if (!currentSync || currentSync.leaseOwner !== this.options.workerInstanceId) {
      return;
    }

    await this.options.syncStateRepository.updateProgress({
      key: this.partition.key,
      chainId: this.partition.chainId,
      contractAddress: this.partition.contractAddress,
      eventName: this.partition.eventName,
      lastFinalizedScannedBlock: currentSync.lastFinalizedScannedBlock,
      reorgLookback: this.partition.reorgLookback,
      status: "idle",
      leaseOwner: this.options.workerInstanceId,
      lastError: null
    });
  }

  private async markError(error: unknown): Promise<void> {
    const currentSync = await this.options.syncStateRepository.getByKey(
      this.partition.key
    );

    if (!currentSync || currentSync.leaseOwner !== this.options.workerInstanceId) {
      return;
    }

    await this.options.syncStateRepository.updateProgress({
      key: this.partition.key,
      chainId: this.partition.chainId,
      contractAddress: this.partition.contractAddress,
      eventName: this.partition.eventName,
      lastFinalizedScannedBlock: currentSync.lastFinalizedScannedBlock,
      reorgLookback: this.partition.reorgLookback,
      status: "error",
      leaseOwner: this.options.workerInstanceId,
      lastError: toErrorMessage(error)
    });
  }

  private async tryMarkIdle(): Promise<void> {
    try {
      await this.markIdle();
    } catch (error) {
      this.logger.warn(
        {
          partitionKey: this.partition.key,
          error
        },
        "Failed to update sync state to idle"
      );
    }
  }

  private async tryMarkError(error: unknown): Promise<void> {
    try {
      await this.markError(error);
    } catch (statusError) {
      this.logger.warn(
        {
          partitionKey: this.partition.key,
          error: statusError
        },
        "Failed to update sync state to error"
      );
    }
  }
}

const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
