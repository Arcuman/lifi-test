import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test
} from "vitest";

import {
  closeMongoConnection,
  connectMongo
} from "../../../src/modules/fee-events/infrastructure/persistence/mongo-connection";
import { ensureMongoIndexes } from "../../../src/modules/fee-events/infrastructure/persistence/mongo-indexes";
import { MongoTransactionManager } from "../../../src/modules/fee-events/infrastructure/persistence/transaction-manager";
import { MongoFeeEventRepository } from "../../../src/modules/fee-events/infrastructure/persistence/repositories/fee-event-repository";
import { MongoSyncStateRepository } from "../../../src/modules/fee-events/infrastructure/persistence/repositories/sync-state-repository";
import { getFeeEventModel } from "../../../src/modules/fee-events/infrastructure/persistence/models/fee-event.model";
import { createMongoMemoryReplicaSet } from "../../helpers/mongo-replset";
import { makeSampleFeeEvent } from "../../helpers/sample-fee-event";

let replset: Awaited<ReturnType<typeof createMongoMemoryReplicaSet>>;
let txManager: MongoTransactionManager;
let feeEvents: MongoFeeEventRepository;
let syncState: MongoSyncStateRepository;

describe("MongoTransactionManager", () => {
  beforeAll(async () => {
    replset = await createMongoMemoryReplicaSet();
    await connectMongo(replset.getUri("transactions"));
    await ensureMongoIndexes();
    txManager = new MongoTransactionManager();
    feeEvents = new MongoFeeEventRepository();
    syncState = new MongoSyncStateRepository();
  });

  beforeEach(async () => {
    await getFeeEventModel().deleteMany({});
    await syncState.deleteAll();
  });

  afterAll(async () => {
    await closeMongoConnection();
    await replset.stop();
  });

  test("commits fee events and sync state atomically", async () => {
    const event = makeSampleFeeEvent();

    await txManager.withTransaction(async (session) => {
      await feeEvents.replaceRange(
        {
          chainId: event.chainId,
          contractAddress: event.contractAddress,
          eventName: event.eventName,
          fromBlock: event.blockNumber,
          toBlock: event.blockNumber,
          events: [event]
        },
        session
      );
      await syncState.updateProgress(
        {
          key: "137:collector:FeesCollected",
          chainId: 137,
          contractAddress: "0xbd6c7b0d2f68c2b7805d88388319cfb6ecb50ea9",
          eventName: "FeesCollected",
          lastFinalizedScannedBlock: 78600000,
          reorgLookback: 32,
          status: "running"
        },
        session
      );
    });

    expect(await getFeeEventModel().countDocuments({})).toBe(1);
    expect(
      (await syncState.getByKey("137:collector:FeesCollected"))
        ?.lastFinalizedScannedBlock
    ).toBe(78600000);
  });

  test("rolls back both event writes and cursor updates when the transaction fails", async () => {
    const event = makeSampleFeeEvent();

    await expect(
      txManager.withTransaction(async (session) => {
        await feeEvents.replaceRange(
          {
            chainId: event.chainId,
            contractAddress: event.contractAddress,
            eventName: event.eventName,
            fromBlock: event.blockNumber,
            toBlock: event.blockNumber,
            events: [event]
          },
          session
        );
        await syncState.updateProgress(
          {
            key: "137:collector:FeesCollected",
            chainId: 137,
            contractAddress: "0xbd6c7b0d2f68c2b7805d88388319cfb6ecb50ea9",
            eventName: "FeesCollected",
            lastFinalizedScannedBlock: 78600000,
            reorgLookback: 32,
            status: "running"
          },
          session
        );
        throw new Error("force rollback");
      })
    ).rejects.toThrow(/force rollback/i);

    expect(await getFeeEventModel().countDocuments({})).toBe(0);
    expect(await syncState.getByKey("137:collector:FeesCollected")).toBeNull();
  });
});
