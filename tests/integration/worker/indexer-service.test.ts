import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test
} from "vitest";

import type { FeeEventWriteRepository } from "../../../src/modules/fee-events/application/ports/fee-event-write-repository";
import type { SyncStateRepository } from "../../../src/modules/fee-events/application/ports/sync-state-repository";
import { RpcTimeoutError } from "../../../src/modules/fee-events/application/errors/rpc-timeout-error";
import type { FeeEventsIndexerConfig } from "../../../src/modules/fee-events/application/fee-events-worker-config.types";
import { IndexerService } from "../../../src/modules/fee-events/application/services/indexer/indexer-service";
import {
  closeMongoConnection,
  connectMongo
} from "../../../src/modules/fee-events/infrastructure/persistence/mongo-connection";
import { ensureMongoIndexes } from "../../../src/modules/fee-events/infrastructure/persistence/mongo-indexes";
import { MongoTransactionManager } from "../../../src/modules/fee-events/infrastructure/persistence/transaction-manager";
import { MongoFeeEventRepository } from "../../../src/modules/fee-events/infrastructure/persistence/repositories/fee-event-repository";
import { MongoSyncStateRepository } from "../../../src/modules/fee-events/infrastructure/persistence/repositories/sync-state-repository";
import { getFeeEventModel } from "../../../src/modules/fee-events/infrastructure/persistence/models/fee-event.model";
import { getSyncStateModel } from "../../../src/modules/fee-events/infrastructure/persistence/models/sync-state.model";
import { createMongoMemoryReplicaSet } from "../../helpers/mongo-replset";
import { FakeFeesCollectedGateway } from "../../helpers/fake-gateway";
import { makeSampleFeeEvent } from "../../helpers/sample-fee-event";

let replset: Awaited<ReturnType<typeof createMongoMemoryReplicaSet>>;
let feeEvents: MongoFeeEventRepository;
let syncState: MongoSyncStateRepository;
let txManager: MongoTransactionManager;

const indexerConfig: FeeEventsIndexerConfig = {
  chain: {
    key: "polygon",
    chainId: 137,
    name: "polygon",
    rpcUrls: ["https://polygon-rpc.com"],
    confirmationsFallback: 64
  },
  feeCollectorAddress: "0xbd6c7b0d2f68c2b7805d88388319cfb6ecb50ea9",
  startBlock: 78600000,
  reorgLookback: 32,
  initialBatchSize: 5000,
  minBatchSize: 100,
  maxBatchSize: 10000
};

describe("IndexerService", () => {
  beforeAll(async () => {
    replset = await createMongoMemoryReplicaSet();
    await connectMongo(replset.getUri("worker"));
    await ensureMongoIndexes();
    feeEvents = new MongoFeeEventRepository();
    syncState = new MongoSyncStateRepository();
    txManager = new MongoTransactionManager();
  });

  beforeEach(async () => {
    await getFeeEventModel().deleteMany({});
    await syncState.deleteAll();
  });

  afterAll(async () => {
    await closeMongoConnection();
    await replset.stop();
  });

  test("backfills from startBlock to safeHead", async () => {
    const gateway = new FakeFeesCollectedGateway();
    gateway.safeHead = 78600002;
    gateway.events = [
      makeSampleFeeEvent({ blockNumber: 78600000 }),
      makeSampleFeeEvent({
        blockNumber: 78600002,
        blockHash: `0x${"a".repeat(63)}0`,
        transactionHash: `0x${"b".repeat(63)}0`,
        logIndex: 1
      })
    ];

    const service = new IndexerService({
      workerInstanceId: "worker-a",
      indexerConfig,
      gateway,
      feeEventRepository: feeEvents,
      syncStateRepository: syncState,
      transactionManager: txManager,
      leaseDurationMs: 30_000,
      leaseRenewIntervalMs: 5_000
    });

    const result = await service.runOnce();

    expect(result.processedEvents).toBe(2);
    expect(await getFeeEventModel().countDocuments({})).toBe(2);
  });

  test("does nothing when cursor is already at safeHead after the initial replay", async () => {
    const gateway = new FakeFeesCollectedGateway();
    gateway.safeHead = 78600000;
    await syncState.updateProgress({
      key: serviceKey(),
      chainId: indexerConfig.chain.chainId,
      contractAddress: indexerConfig.feeCollectorAddress,
      eventName: "FeesCollected",
      lastFinalizedScannedBlock: 78600000,
      reorgLookback: 32,
      status: "idle"
    });

    const service = new IndexerService({
      workerInstanceId: "worker-a",
      indexerConfig,
      gateway,
      feeEventRepository: feeEvents,
      syncStateRepository: syncState,
      transactionManager: txManager,
      leaseDurationMs: 30_000,
      leaseRenewIntervalMs: 5_000
    });

    await service.runOnce();
    gateway.ranges = [];

    const result = await service.runOnce();
    expect(result.processedEvents).toBe(0);
    expect(gateway.ranges).toHaveLength(0);
  });

  test("does not advance the cursor when persistence fails", async () => {
    const gateway = new FakeFeesCollectedGateway();
    gateway.safeHead = 78600000;
    gateway.events = [makeSampleFeeEvent()];

    const service = new IndexerService({
      workerInstanceId: "worker-a",
      indexerConfig,
      gateway,
      feeEventRepository: {
        replaceRange: async () => {
          throw new Error("write failed");
        }
      } satisfies FeeEventWriteRepository,
      syncStateRepository: syncState,
      transactionManager: txManager,
      leaseDurationMs: 30_000,
      leaseRenewIntervalMs: 5_000
    });

    await expect(service.runOnce()).rejects.toThrow(/write failed/i);
    const stored = await syncState.getByKey(serviceKey());
    expect(stored?.lastFinalizedScannedBlock ?? 0).toBe(0);
    expect(stored?.status).toBe("error");
    expect(stored?.lastError).toMatch(/write failed/i);
    expect(await getFeeEventModel().countDocuments({})).toBe(0);
  });

  test("retries with a smaller batch when the gateway times out", async () => {
    const gateway = new FakeFeesCollectedGateway();
    gateway.safeHead = 78600020;
    gateway.throwOnRange.set(
      "78600000-78600020",
      new RpcTimeoutError("timeout")
    );
    gateway.events = [makeSampleFeeEvent({ blockNumber: 78600000 })];

    const service = new IndexerService({
      workerInstanceId: "worker-a",
      indexerConfig: {
        ...indexerConfig,
        initialBatchSize: 21,
        minBatchSize: 5
      },
      gateway,
      feeEventRepository: feeEvents,
      syncStateRepository: syncState,
      transactionManager: txManager,
      leaseDurationMs: 30_000,
      leaseRenewIntervalMs: 5_000
    });

    await service.runOnce();

    expect(gateway.ranges.length).toBeGreaterThan(1);
  });

  test("fails fast without persisting when lease renewal is lost mid-batch", async () => {
    const gateway = new FakeFeesCollectedGateway();
    gateway.safeHead = 78600000;
    gateway.delayMs = 30;
    gateway.events = [makeSampleFeeEvent()];

    let renewAttempts = 0;
    const service = new IndexerService({
      workerInstanceId: "worker-a",
      indexerConfig,
      gateway,
      feeEventRepository: feeEvents,
      syncStateRepository: {
        acquireLease: (input) => syncState.acquireLease(input),
        renewLease: async (input) => {
          renewAttempts += 1;
          return input.owner === "worker-a" ? false : true;
        },
        updateProgress: (input, transaction) =>
          syncState.updateProgress(input, transaction),
        getByKey: (key) => syncState.getByKey(key)
      } satisfies SyncStateRepository,
      transactionManager: txManager,
      leaseDurationMs: 30_000,
      leaseRenewIntervalMs: 5
    });

    await expect(service.runOnce()).rejects.toThrow(/lease/i);
    expect(renewAttempts).toBeGreaterThan(0);
    expect(await getFeeEventModel().countDocuments({})).toBe(0);
  });

  test("replays bounded lookback without creating duplicates after restart", async () => {
    const firstGateway = new FakeFeesCollectedGateway();
    firstGateway.safeHead = 78600010;
    firstGateway.events = [makeSampleFeeEvent({ blockNumber: 78600010 })];

    const first = new IndexerService({
      workerInstanceId: "worker-a",
      indexerConfig,
      gateway: firstGateway,
      feeEventRepository: feeEvents,
      syncStateRepository: syncState,
      transactionManager: txManager,
      leaseDurationMs: 30_000,
      leaseRenewIntervalMs: 5_000
    });
    await first.runOnce();
    await expireLease();

    const secondGateway = new FakeFeesCollectedGateway();
    secondGateway.safeHead = 78600012;
    secondGateway.events = [
      makeSampleFeeEvent({ blockNumber: 78600010 }),
      makeSampleFeeEvent({
        blockNumber: 78600012,
        blockHash: `0x${"c".repeat(63)}0`,
        transactionHash: `0x${"d".repeat(63)}0`,
        logIndex: 1
      })
    ];

    const second = new IndexerService({
      workerInstanceId: "worker-b",
      indexerConfig,
      gateway: secondGateway,
      feeEventRepository: feeEvents,
      syncStateRepository: syncState,
      transactionManager: txManager,
      leaseDurationMs: 30_000,
      leaseRenewIntervalMs: 5_000
    });
    await second.runOnce();

    expect(await getFeeEventModel().countDocuments({})).toBe(2);
  });

  test("returns sync state to idle after a successful cycle", async () => {
    const gateway = new FakeFeesCollectedGateway();
    gateway.safeHead = 78600000;
    gateway.events = [makeSampleFeeEvent()];

    const service = new IndexerService({
      workerInstanceId: "worker-a",
      indexerConfig,
      gateway,
      feeEventRepository: feeEvents,
      syncStateRepository: syncState,
      transactionManager: txManager,
      leaseDurationMs: 30_000,
      leaseRenewIntervalMs: 5_000
    });

    await service.runOnce();

    const stored = await syncState.getByKey(serviceKey());
    expect(stored?.status).toBe("idle");
    expect(stored?.lastError).toBeUndefined();
  });

  test("replays the lookback window only on the first successful cycle of a worker instance", async () => {
    const gateway = new FakeFeesCollectedGateway();
    gateway.safeHead = 78600012;
    gateway.events = [
      makeSampleFeeEvent({ blockNumber: 78600010 }),
      makeSampleFeeEvent({
        blockNumber: 78600012,
        blockHash: `0x${"e".repeat(63)}0`,
        transactionHash: `0x${"f".repeat(63)}0`,
        logIndex: 1
      })
    ];

    await syncState.updateProgress({
      key: serviceKey(),
      chainId: indexerConfig.chain.chainId,
      contractAddress: indexerConfig.feeCollectorAddress,
      eventName: "FeesCollected",
      lastFinalizedScannedBlock: 78600010,
      reorgLookback: 32,
      status: "idle"
    });

    const service = new IndexerService({
      workerInstanceId: "worker-a",
      indexerConfig,
      gateway,
      feeEventRepository: feeEvents,
      syncStateRepository: syncState,
      transactionManager: txManager,
      leaseDurationMs: 30_000,
      leaseRenewIntervalMs: 5_000
    });

    await service.runOnce();
    gateway.safeHead = 78600013;
    gateway.events.push(
      makeSampleFeeEvent({
        blockNumber: 78600013,
        blockHash: `0x${"3".repeat(63)}3`,
        transactionHash: `0x${"4".repeat(63)}4`,
        logIndex: 2
      })
    );
    await service.runOnce();

    expect(gateway.ranges[0]).toEqual({
      fromBlock: 78600000,
      toBlock: 78600012
    });
    expect(gateway.ranges[1]).toEqual({
      fromBlock: 78600013,
      toBlock: 78600013
    });
  });

  test("marks reorged rows as orphaned and keeps only the replacement canonical row queryable", async () => {
    const original = makeSampleFeeEvent({ blockNumber: 78600010 });
    const replacement = makeSampleFeeEvent({
      blockNumber: 78600010,
      blockHash: `0x${"1".repeat(63)}1`,
      transactionHash: `0x${"2".repeat(63)}2`
    });

    const firstGateway = new FakeFeesCollectedGateway();
    firstGateway.safeHead = 78600010;
    firstGateway.events = [original];

    const first = new IndexerService({
      workerInstanceId: "worker-a",
      indexerConfig,
      gateway: firstGateway,
      feeEventRepository: feeEvents,
      syncStateRepository: syncState,
      transactionManager: txManager,
      leaseDurationMs: 30_000,
      leaseRenewIntervalMs: 5_000
    });
    await first.runOnce();
    await expireLease();

    const secondGateway = new FakeFeesCollectedGateway();
    secondGateway.safeHead = 78600010;
    secondGateway.events = [replacement];

    const second = new IndexerService({
      workerInstanceId: "worker-b",
      indexerConfig,
      gateway: secondGateway,
      feeEventRepository: feeEvents,
      syncStateRepository: syncState,
      transactionManager: txManager,
      leaseDurationMs: 30_000,
      leaseRenewIntervalMs: 5_000
    });
    await second.runOnce();

    const stored = await getFeeEventModel()
      .find({})
      .sort({ orphaned: 1, blockHash: 1 })
      .lean();
    const canonical = await feeEvents.getFeesByIntegrator({
      integrator: original.integrator,
      limit: 10
    });

    expect(stored).toHaveLength(2);
    expect(stored.filter((item) => item.orphaned)).toHaveLength(1);
    expect(canonical.items).toHaveLength(1);
    expect(canonical.items[0]?.blockHash).toBe(replacement.blockHash);
  });
});

const serviceKey = (): string =>
  `${indexerConfig.chain.chainId}:${indexerConfig.feeCollectorAddress}:FeesCollected`;

const expireLease = async (): Promise<void> => {
  await getSyncStateModel().updateOne(
    { key: serviceKey() },
    {
      $set: {
        leaseUntil: new Date(0)
      }
    }
  );
};
