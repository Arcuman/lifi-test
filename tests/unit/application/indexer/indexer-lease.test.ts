import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { SyncStateRepository } from "../../../../src/modules/fee-events/application/ports/sync-state-repository";
import { IndexerLease } from "../../../../src/modules/fee-events/application/services/indexer/indexer-lease";
import type { IndexerPartition } from "../../../../src/modules/fee-events/application/services/indexer/indexer.types";

const partition: IndexerPartition = {
  key: "137:collector:FeesCollected",
  chainId: 137,
  contractAddress: "0xcollector",
  eventName: "FeesCollected",
  startBlock: 100,
  reorgLookback: 32,
  initialBatchSize: 10,
  minBatchSize: 5,
  maxBatchSize: 20
};

describe("IndexerLease", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("returns null when lease cannot be acquired", async () => {
    const syncStateRepository = createSyncStateRepository({
      acquireLease: vi.fn(async () => null)
    });

    const lease = await IndexerLease.acquire({
      syncStateRepository,
      partition,
      workerInstanceId: "worker-a",
      leaseDurationMs: 30_000,
      leaseRenewIntervalMs: 5_000
    });

    expect(lease).toBeNull();
  });

  test("marks the lease as lost when renewal returns false", async () => {
    const syncStateRepository = createSyncStateRepository({
      renewLease: vi.fn(async () => false)
    });

    const lease = await IndexerLease.acquire({
      syncStateRepository,
      partition,
      workerInstanceId: "worker-a",
      leaseDurationMs: 30_000,
      leaseRenewIntervalMs: 5_000
    });

    expect(lease).not.toBeNull();
    await vi.advanceTimersByTimeAsync(5_000);

    expect(() => lease?.throwIfLost()).toThrow(/lease/i);
  });

  test("marks the lease as lost when renewal throws", async () => {
    const syncStateRepository = createSyncStateRepository({
      renewLease: vi.fn(async () => {
        throw new Error("renew failed");
      })
    });

    const lease = await IndexerLease.acquire({
      syncStateRepository,
      partition,
      workerInstanceId: "worker-a",
      leaseDurationMs: 30_000,
      leaseRenewIntervalMs: 5_000
    });

    expect(lease).not.toBeNull();
    await vi.advanceTimersByTimeAsync(5_000);

    expect(() => lease?.throwIfLost()).toThrow(/renewal failed/i);
  });

  test("stops renewing after stop is called", async () => {
    const renewLease = vi.fn(async () => true);
    const syncStateRepository = createSyncStateRepository({
      renewLease
    });

    const lease = await IndexerLease.acquire({
      syncStateRepository,
      partition,
      workerInstanceId: "worker-a",
      leaseDurationMs: 30_000,
      leaseRenewIntervalMs: 5_000
    });

    expect(lease).not.toBeNull();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(renewLease).toHaveBeenCalledTimes(1);

    lease?.stop();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(renewLease).toHaveBeenCalledTimes(1);
  });
});

const createSyncStateRepository = (
  overrides: Partial<SyncStateRepository> = {}
): SyncStateRepository => ({
  acquireLease: async () => ({
    key: partition.key,
    chainId: partition.chainId,
    contractAddress: partition.contractAddress,
    eventName: partition.eventName,
    lastFinalizedScannedBlock: 0,
    reorgLookback: partition.reorgLookback,
    status: "idle",
    updatedAt: new Date()
  }),
  renewLease: async () => true,
  updateProgress: async () => undefined,
  getByKey: async () => null,
  ...overrides
});
