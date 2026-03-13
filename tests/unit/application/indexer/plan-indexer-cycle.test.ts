import { describe, expect, test, vi } from "vitest";

import type { FeesCollectedGateway } from "../../../../src/modules/fee-events/application/ports/fees-collected-gateway";
import type { SyncStateRepository } from "../../../../src/modules/fee-events/application/ports/sync-state-repository";
import type { IndexerLogger } from "../../../../src/modules/fee-events/application/services/indexer/indexer-logger";
import { planIndexerCycle } from "../../../../src/modules/fee-events/application/services/indexer/plan-indexer-cycle";
import type { IndexerPartition } from "../../../../src/modules/fee-events/application/services/indexer/indexer.types";

const partition: IndexerPartition = {
  key: "137:collector:FeesCollected",
  chainId: 137,
  contractAddress: "0xcollector",
  eventName: "FeesCollected",
  startBlock: 78600000,
  reorgLookback: 32,
  initialBatchSize: 100,
  minBatchSize: 10,
  maxBatchSize: 500
};

describe("planIndexerCycle", () => {
  test("plans an initial replay with lookback from the configured start block", async () => {
    const syncStateRepository = createSyncStateRepository({
      getByKey: async () => ({
        key: partition.key,
        chainId: partition.chainId,
        contractAddress: partition.contractAddress,
        eventName: partition.eventName,
        lastFinalizedScannedBlock: 78600010,
        reorgLookback: partition.reorgLookback,
        status: "idle",
        updatedAt: new Date()
      })
    });
    const gateway = createGateway(78600012);

    const result = await planIndexerCycle({
      partition,
      gateway,
      syncStateRepository,
      hasCompletedInitialReplay: false,
      logger: createLogger(),
      lease: {
        throwIfLost: vi.fn()
      }
    });

    expect(result.kind).toBe("planned");
    if (result.kind === "planned") {
      expect(result.cycle.replayLookback).toBe(true);
      expect(result.cycle.window).toEqual({
        fromBlock: 78600000,
        toBlock: 78600012
      });
    }
  });

  test("returns an idle result when the indexer is already up to date", async () => {
    const syncStateRepository = createSyncStateRepository({
      getByKey: async () => ({
        key: partition.key,
        chainId: partition.chainId,
        contractAddress: partition.contractAddress,
        eventName: partition.eventName,
        lastFinalizedScannedBlock: 78600012,
        reorgLookback: partition.reorgLookback,
        status: "idle",
        updatedAt: new Date()
      })
    });
    const gateway = createGateway(78600012);

    const result = await planIndexerCycle({
      partition,
      gateway,
      syncStateRepository,
      hasCompletedInitialReplay: true,
      logger: createLogger(),
      lease: {
        throwIfLost: vi.fn()
      }
    });

    expect(result).toEqual({
      kind: "idle",
      result: {
        processedEvents: 0,
        processedBatches: 0,
        scannedToBlock: null
      }
    });
  });

  test("returns an idle result when no safe block window exists", async () => {
    const gateway = createGateway(50);

    const result = await planIndexerCycle({
      partition: {
        ...partition,
        startBlock: 100
      },
      gateway,
      syncStateRepository: createSyncStateRepository(),
      hasCompletedInitialReplay: false,
      logger: createLogger(),
      lease: {
        throwIfLost: vi.fn()
      }
    });

    expect(result.kind).toBe("idle");
  });
});

const createGateway = (safeHead: number): FeesCollectedGateway => ({
  getSafeHead: async () => safeHead,
  getFeesCollectedEvents: async () => []
});

const createSyncStateRepository = (
  overrides: Partial<SyncStateRepository> = {}
): SyncStateRepository => ({
  acquireLease: async () => null,
  renewLease: async () => true,
  updateProgress: async () => undefined,
  getByKey: async () => null,
  ...overrides
});

const createLogger = (): IndexerLogger => ({
  info: vi.fn(),
  warn: vi.fn()
});
