import { LeaseLostError } from "../../errors/lease-lost-error";
import type { SyncStateRepository } from "../../ports/sync-state-repository";
import type { IndexerPartition } from "./indexer.types";

interface AcquireIndexerLeaseOptions {
  syncStateRepository: SyncStateRepository;
  partition: IndexerPartition;
  workerInstanceId: string;
  leaseDurationMs: number;
  leaseRenewIntervalMs: number;
}

export class IndexerLease {
  private lostError: LeaseLostError | null = null;
  private renewInterval: ReturnType<typeof setInterval> | null = null;

  private constructor(
    private readonly options: AcquireIndexerLeaseOptions
  ) {}

  static async acquire(
    options: AcquireIndexerLeaseOptions
  ): Promise<IndexerLease | null> {
    const acquired = await options.syncStateRepository.acquireLease({
      key: options.partition.key,
      chainId: options.partition.chainId,
      contractAddress: options.partition.contractAddress,
      eventName: options.partition.eventName,
      reorgLookback: options.partition.reorgLookback,
      owner: options.workerInstanceId,
      leaseDurationMs: options.leaseDurationMs
    });

    if (!acquired) {
      return null;
    }

    const lease = new IndexerLease(options);
    lease.startRenewal();
    return lease;
  }

  throwIfLost(): void {
    if (this.lostError) {
      throw this.lostError;
    }
  }

  stop(): void {
    if (this.renewInterval) {
      clearInterval(this.renewInterval);
      this.renewInterval = null;
    }
  }

  private startRenewal(): void {
    this.renewInterval = setInterval(() => {
      void this.options.syncStateRepository
        .renewLease({
          key: this.options.partition.key,
          chainId: this.options.partition.chainId,
          contractAddress: this.options.partition.contractAddress,
          eventName: this.options.partition.eventName,
          reorgLookback: this.options.partition.reorgLookback,
          owner: this.options.workerInstanceId,
          leaseDurationMs: this.options.leaseDurationMs
        })
        .then((renewed) => {
          if (!renewed) {
            this.lostError = new LeaseLostError();
          }
        })
        .catch((error: unknown) => {
          this.lostError = new LeaseLostError(
            "Indexer lease renewal failed",
            {
              cause: error
            }
          );
        });
    }, this.options.leaseRenewIntervalMs);
  }
}
