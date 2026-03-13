import { afterAll, describe, expect, test } from "vitest";

import {
  startAllRuntime,
  startWorkerRuntime
} from "../../../src/app/bootstrap/runtime";
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
