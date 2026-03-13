import { afterAll, describe, expect, test } from "vitest";

import {
  startAllRuntime,
  startWorkerRuntime
} from "../../../src/app/bootstrap/runtime";
import { getFeeEventModel } from "../../../src/modules/fee-events/infrastructure/persistence/models/fee-event.model";
import { getSyncStateModel } from "../../../src/modules/fee-events/infrastructure/persistence/models/sync-state.model";
import { createMongoMemoryReplicaSet } from "../../helpers/mongo-replset";
import { makeDefaultEnv } from "../../helpers/default-env";

describe("worker runtime", () => {
  const startedReplicaSets: Array<
    Awaited<ReturnType<typeof createMongoMemoryReplicaSet>>
  > = [];

  afterAll(async () => {
    for (const replset of startedReplicaSets.reverse()) {
      await replset.stop().catch(() => undefined);
    }
  });

  test("builds a single-chain worker runtime for one selected worker target", async () => {
    const replset = await createMongoMemoryReplicaSet();
    startedReplicaSets.push(replset);

    const runtime = await startWorkerRuntime(
      makeDefaultEnv({
        MONGODB_URI: replset.getUri("worker-runtime"),
        FEE_EVENTS_GATEWAY_MODE: "fixture",
        FIXTURE_SAFE_HEAD: "78600000",
        FIXTURE_EVENTS_FILE: "./tests/fixtures/fee-events.json",
        WORKER_CHAIN_KEY: "polygon",
        WORKER_MODULE: "fee-events",
        WORKER_EVENT: "fees-collected"
      })
    );

    try {
      expect(runtime.config.chain.key).toBe("polygon");
      expect(runtime.config.workerTarget).toEqual({
        moduleKey: "fee-events",
        eventKey: "fees-collected",
        chainKey: "polygon"
      });
      expect(runtime.target.name).toBe("fee-events:fees-collected:polygon");
      expect(runtime.service).toBeDefined();
      expect(runtime.workerInstanceId).toContain(String(process.pid));
    } finally {
      await runtime.close();
    }
  });

  test("runs the selected worker service and persists indexed state", async () => {
    const replset = await createMongoMemoryReplicaSet();
    startedReplicaSets.push(replset);

    const runtime = await startWorkerRuntime(
      makeDefaultEnv({
        MONGODB_URI: replset.getUri("worker-runtime-run-once"),
        FEE_EVENTS_GATEWAY_MODE: "fixture",
        FIXTURE_SAFE_HEAD: "78600000",
        FIXTURE_EVENTS_FILE: "./tests/fixtures/fee-events.json",
        WORKER_CHAIN_KEY: "polygon",
        WORKER_MODULE: "fee-events",
        WORKER_EVENT: "fees-collected"
      })
    );

    try {
      const result = await runtime.service.runOnce();
      const storedFeeEvents = await getFeeEventModel().find({}).lean();
      const storedSyncState = await getSyncStateModel().findOne({}).lean();

      expect(result).toEqual({
        processedEvents: 1,
        processedBatches: 1,
        scannedToBlock: 78600000
      });
      expect(storedFeeEvents).toHaveLength(1);
      expect(storedFeeEvents[0]?.blockNumber).toBe(78600000);
      expect(storedSyncState).toMatchObject({
        key: "137:0xbd6c7b0d2f68c2b7805d88388319cfb6ecb50ea9:FeesCollected",
        chainId: 137,
        contractAddress: "0xbd6c7b0d2f68c2b7805d88388319cfb6ecb50ea9",
        eventName: "FeesCollected",
        lastFinalizedScannedBlock: 78600000,
        status: "idle",
        leaseOwner: runtime.workerInstanceId
      });
    } finally {
      await runtime.close();
    }
  });

  test("dev-all requires a complete worker target before startup", async () => {
    await expect(
      startAllRuntime(
        makeDefaultEnv({
          WORKER_EVENT: undefined
        })
      )
    ).rejects.toThrow(/WORKER_EVENT/i);
  });
});
