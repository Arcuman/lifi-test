import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test
} from "vitest";

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
    rpcUrls: ["https://1rpc.io/matic"],
    confirmationsFallback: 64
  },
  feeCollectorAddress: "0xbd6c7b0d2f68c2b7805d88388319cfb6ecb50ea9",
  startBlock: 78600000,
  reorgLookback: 32,
  initialBatchSize: 21,
  minBatchSize: 5,
  maxBatchSize: 10_000
};

describe("IndexerService provider-limit recovery", () => {
  beforeAll(async () => {
    replset = await createMongoMemoryReplicaSet();
    await connectMongo(replset.getUri("worker-provider-limit"));
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

  test("shrinks the batch when a getLogs quorum error contains provider range-limit failures", async () => {
    const gateway = new FakeFeesCollectedGateway();
    gateway.safeHead = 78600020;
    gateway.throwOnRange.set(
      "78600000-78600020",
      Object.assign(new Error("failed to meet quorum"), {
        reason: "failed to meet quorum",
        method: "getLogs",
        results: [
          {
            error: {
              body: JSON.stringify({
                error: {
                  code: -32001,
                  message:
                    "Block range too large: maximum allowed is 500 blocks"
                }
              })
            }
          },
          {
            error: {
              body: JSON.stringify({
                error: {
                  code: 35,
                  message:
                    "ranges over 10000 blocks are not supported on freetier"
                }
              })
            }
          }
        ]
      })
    );
    gateway.events = [makeSampleFeeEvent({ blockNumber: 78600000 })];

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

    expect(gateway.ranges).toEqual(
      expect.arrayContaining([
        { fromBlock: 78600000, toBlock: 78600020 },
        { fromBlock: 78600000, toBlock: 78600009 }
      ])
    );
    expect(await getFeeEventModel().countDocuments({})).toBe(1);
  });
});
