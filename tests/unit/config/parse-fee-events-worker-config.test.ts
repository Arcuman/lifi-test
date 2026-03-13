import { describe, expect, test } from "vitest";

import { parseChainCatalog } from "../../../src/shared/config/parse-config";
import { parseFeeEventsWorkerConfig } from "../../../src/modules/fee-events/infrastructure/config/parse-fee-events-worker-config";
import { makeDefaultEnv } from "../../helpers/default-env";

describe("fee events worker config parsing", () => {
  test("builds a fee events worker config from feature-specific env vars", () => {
    const env = makeDefaultEnv({
      CHAIN_KEYS: "polygon",
      CHAIN_POLYGON_RPC_URLS:
        "https://polygon.drpc.org,https://polygon-bor-rpc.publicnode.com",
      CHAIN_POLYGON_START_BLOCK: "78600000",
      CHAIN_POLYGON_FEE_COLLECTOR_ADDRESS:
        "0xbD6C7B0d2f68c2b7805d88388319cfB6EcB50eA9",
      FEE_EVENTS_GATEWAY_MODE: "fixture",
      FIXTURE_SAFE_HEAD: "78600123",
      FIXTURE_EVENTS_FILE: "./tests/fixtures/fee-events.json",
      WORKER_REORG_LOOKBACK: "42",
      WORKER_INITIAL_BATCH_SIZE: "4000",
      WORKER_MIN_BATCH_SIZE: "100",
      WORKER_MAX_BATCH_SIZE: "8000"
    });
    const [chain] = parseChainCatalog(env);

    const config = parseFeeEventsWorkerConfig(env, chain!);

    expect(config.indexer.chain.key).toBe("polygon");
    expect(config.indexer.chain.chainId).toBe(137);
    expect(config.indexer.chain.name).toBe("polygon");
    expect(config.indexer.chain.rpcUrls).toEqual([
      "https://polygon.drpc.org",
      "https://polygon-bor-rpc.publicnode.com"
    ]);
    expect(config.indexer.feeCollectorAddress).toBe(
      "0xbd6c7b0d2f68c2b7805d88388319cfb6ecb50ea9"
    );
    expect(config.indexer.startBlock).toBe(78600000);
    expect(config.indexer.reorgLookback).toBe(42);
    expect(config.indexer.initialBatchSize).toBe(4000);
    expect(config.indexer.minBatchSize).toBe(100);
    expect(config.indexer.maxBatchSize).toBe(8000);
    expect(config.gateway).toEqual({
      mode: "fixture",
      fixture: {
        safeHead: 78600123,
        eventsFile: "./tests/fixtures/fee-events.json"
      }
    });
  });

  test("rejects an invalid fee collector address", () => {
    const env = makeDefaultEnv({
      CHAIN_POLYGON_FEE_COLLECTOR_ADDRESS: "not-an-address"
    });
    const [chain] = parseChainCatalog(env);

    expect(() => parseFeeEventsWorkerConfig(env, chain!)).toThrow(
      /CHAIN_POLYGON_FEE_COLLECTOR_ADDRESS/i
    );
  });
});
