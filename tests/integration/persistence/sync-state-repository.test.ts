import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi
} from "vitest";

import {
  closeMongoConnection,
  connectMongo
} from "../../../src/modules/fee-events/infrastructure/persistence/mongo-connection";
import { ensureMongoIndexes } from "../../../src/modules/fee-events/infrastructure/persistence/mongo-indexes";
import { MongoTransactionManager } from "../../../src/modules/fee-events/infrastructure/persistence/transaction-manager";
import { MongoSyncStateRepository } from "../../../src/modules/fee-events/infrastructure/persistence/repositories/sync-state-repository";
import { getSyncStateModel } from "../../../src/modules/fee-events/infrastructure/persistence/models/sync-state.model";
import { createMongoMemoryReplicaSet } from "../../helpers/mongo-replset";

let replset: Awaited<ReturnType<typeof createMongoMemoryReplicaSet>>;
let repository: MongoSyncStateRepository;
let txManager: MongoTransactionManager;

describe("MongoSyncStateRepository", () => {
  beforeAll(async () => {
    replset = await createMongoMemoryReplicaSet();
    await connectMongo(replset.getUri("sync"));
    await ensureMongoIndexes();
    repository = new MongoSyncStateRepository();
    txManager = new MongoTransactionManager();
  });

  beforeEach(async () => {
    await getSyncStateModel().deleteMany({});
  });

  afterAll(async () => {
    await closeMongoConnection();
    await replset.stop();
  });

  test("acquires a lease for the first worker", async () => {
    const now = new Date("2026-03-12T10:00:00.000Z");
    vi.setSystemTime(now);

    const lease = await repository.acquireLease({
      key: "137:collector:FeesCollected",
      chainId: 137,
      contractAddress: "0xbd6c7b0d2f68c2b7805d88388319cfb6ecb50ea9",
      eventName: "FeesCollected",
      reorgLookback: 32,
      owner: "worker-a",
      leaseDurationMs: 30_000
    });

    expect(lease?.leaseOwner).toBe("worker-a");
    expect(lease?.chainId).toBe(137);
    expect(lease?.contractAddress).toBe(
      "0xbd6c7b0d2f68c2b7805d88388319cfb6ecb50ea9"
    );
    expect(lease?.eventName).toBe("FeesCollected");
    expect(lease?.reorgLookback).toBe(32);
  });

  test("prevents a second worker from acquiring a healthy lease", async () => {
    vi.setSystemTime(new Date("2026-03-12T10:00:00.000Z"));

    await repository.acquireLease({
      key: "137:collector:FeesCollected",
      chainId: 137,
      contractAddress: "0xbd6c7b0d2f68c2b7805d88388319cfb6ecb50ea9",
      eventName: "FeesCollected",
      reorgLookback: 32,
      owner: "worker-a",
      leaseDurationMs: 30_000
    });

    const lease = await repository.acquireLease({
      key: "137:collector:FeesCollected",
      chainId: 137,
      contractAddress: "0xbd6c7b0d2f68c2b7805d88388319cfb6ecb50ea9",
      eventName: "FeesCollected",
      reorgLookback: 32,
      owner: "worker-b",
      leaseDurationMs: 30_000
    });

    expect(lease).toBeNull();
  });

  test("allows takeover after lease expiration", async () => {
    vi.setSystemTime(new Date("2026-03-12T10:00:00.000Z"));

    await repository.acquireLease({
      key: "137:collector:FeesCollected",
      chainId: 137,
      contractAddress: "0xbd6c7b0d2f68c2b7805d88388319cfb6ecb50ea9",
      eventName: "FeesCollected",
      reorgLookback: 32,
      owner: "worker-a",
      leaseDurationMs: 1_000
    });

    vi.setSystemTime(new Date("2026-03-12T10:00:02.000Z"));

    const lease = await repository.acquireLease({
      key: "137:collector:FeesCollected",
      chainId: 137,
      contractAddress: "0xbd6c7b0d2f68c2b7805d88388319cfb6ecb50ea9",
      eventName: "FeesCollected",
      reorgLookback: 32,
      owner: "worker-b",
      leaseDurationMs: 30_000
    });

    expect(lease?.leaseOwner).toBe("worker-b");
  });

  test("commits progress updates atomically inside a transaction", async () => {
    await txManager.withTransaction(async (session) => {
      await repository.updateProgress(
        {
          key: "137:collector:FeesCollected",
          chainId: 137,
          contractAddress: "0xbd6c7b0d2f68c2b7805d88388319cfb6ecb50ea9",
          eventName: "FeesCollected",
          lastFinalizedScannedBlock: 78600042,
          reorgLookback: 32,
          status: "running"
        },
        session
      );
    });

    const stored = await repository.getByKey("137:collector:FeesCollected");
    expect(stored?.lastFinalizedScannedBlock).toBe(78600042);
  });
});
