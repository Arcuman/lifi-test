import { describe, expect, test } from "vitest";

import {
  parseApiConfig,
  parseChainCatalog,
  parseWorkerConfig
} from "../../../src/shared/config/parse-config";
import { makeDefaultEnv } from "../../helpers/default-env";

describe("runtime config parsing", () => {
  test("parses multiple configured chains from generic chain env vars", () => {
    const env = makeDefaultEnv({
      CHAIN_KEYS: "polygon,ethereum",
      CHAIN_POLYGON_RPC_URLS:
        "https://polygon.drpc.org,https://polygon-bor-rpc.publicnode.com",
      CHAIN_POLYGON_START_BLOCK: "78600000",
      CHAIN_POLYGON_FEE_COLLECTOR_ADDRESS:
        "0xbD6C7B0d2f68c2b7805d88388319cfB6EcB50eA9",
      CHAIN_ETHEREUM_RPC_URLS: "https://eth.llamarpc.com",
      CHAIN_ETHEREUM_START_BLOCK: "21000000",
      CHAIN_ETHEREUM_FEE_COLLECTOR_ADDRESS:
        "0x1111111111111111111111111111111111111111"
    });

    const chains = parseChainCatalog(env);

    expect(chains).toEqual([
      expect.objectContaining({
        key: "polygon",
        chainId: 137,
        name: "polygon",
        rpcUrls: [
          "https://polygon.drpc.org",
          "https://polygon-bor-rpc.publicnode.com"
        ],
        confirmationsFallback: 64
      }),
      expect.objectContaining({
        key: "ethereum",
        chainId: 1,
        name: "ethereum",
        rpcUrls: ["https://eth.llamarpc.com"],
        confirmationsFallback: 64
      })
    ]);
  });

  test("parseApiConfig does not require worker chain selection", () => {
    const config = parseApiConfig(
      makeDefaultEnv({
        WORKER_CHAIN_KEY: undefined,
        WORKER_MODULE: undefined,
        WORKER_EVENT: undefined
      })
    );

    expect(config.appMode).toBe("api");
    expect(config.port).toBe(3000);
  });

  test("parseWorkerConfig requires WORKER_CHAIN_KEY", () => {
    const env = makeDefaultEnv({
      WORKER_CHAIN_KEY: undefined
    });

    expect(() => parseWorkerConfig(env)).toThrow(/WORKER_CHAIN_KEY/i);
  });

  test("parseWorkerConfig requires WORKER_MODULE", () => {
    const env = makeDefaultEnv({
      WORKER_MODULE: undefined
    });

    expect(() => parseWorkerConfig(env)).toThrow(/WORKER_MODULE/i);
  });

  test("parseWorkerConfig requires WORKER_EVENT", () => {
    const env = makeDefaultEnv({
      WORKER_EVENT: undefined
    });

    expect(() => parseWorkerConfig(env)).toThrow(/WORKER_EVENT/i);
  });

  test("parseWorkerConfig rejects a worker chain outside the configured catalog", () => {
    const env = makeDefaultEnv({
      CHAIN_KEYS: "polygon",
      CHAIN_POLYGON_RPC_URLS: "https://polygon.drpc.org",
      CHAIN_POLYGON_START_BLOCK: "78600000",
      CHAIN_POLYGON_FEE_COLLECTOR_ADDRESS:
        "0xbD6C7B0d2f68c2b7805d88388319cfB6EcB50eA9",
      WORKER_CHAIN_KEY: "ethereum"
    });

    expect(() => parseWorkerConfig(env)).toThrow(/WORKER_CHAIN_KEY/i);
  });

  test("parseWorkerConfig resolves a single target chain", () => {
    const env = makeDefaultEnv({
      CHAIN_KEYS: "polygon,ethereum",
      CHAIN_POLYGON_RPC_URLS: "https://polygon.drpc.org",
      CHAIN_POLYGON_START_BLOCK: "78600000",
      CHAIN_POLYGON_FEE_COLLECTOR_ADDRESS:
        "0xbD6C7B0d2f68c2b7805d88388319cfB6EcB50eA9",
      CHAIN_ETHEREUM_RPC_URLS: "https://eth.llamarpc.com",
      CHAIN_ETHEREUM_START_BLOCK: "21000000",
      CHAIN_ETHEREUM_FEE_COLLECTOR_ADDRESS:
        "0x1111111111111111111111111111111111111111",
      WORKER_CHAIN_KEY: "ethereum"
    });

    const config = parseWorkerConfig(env);

    expect(config.appMode).toBe("worker");
    expect(config.workerTarget.moduleKey).toBe("fee-events");
    expect(config.workerTarget.eventKey).toBe("fees-collected");
    expect(config.chain).toEqual(
      expect.objectContaining({
        key: "ethereum",
        chainId: 1,
        name: "ethereum"
      })
    );
  });

  test("fails when required MongoDB URI is missing", () => {
    const env = makeDefaultEnv({ MONGODB_URI: undefined });
    expect(() => parseApiConfig(env)).toThrow(/MONGODB_URI/i);
  });

  test("fails when an unknown chain is missing an explicit chain id", () => {
    const env = makeDefaultEnv({
      CHAIN_KEYS: "customl2",
      CHAIN_CUSTOML2_RPC_URLS: "https://rpc.customl2.example",
      CHAIN_CUSTOML2_START_BLOCK: "1",
      CHAIN_CUSTOML2_FEE_COLLECTOR_ADDRESS:
        "0x1111111111111111111111111111111111111111"
    });

    expect(() => parseChainCatalog(env)).toThrow(/CHAIN_CUSTOML2_ID/i);
  });

  test("fails when chain config is missing required rpc urls", () => {
    const env = makeDefaultEnv({
      CHAIN_KEYS: "ethereum",
      CHAIN_ETHEREUM_RPC_URLS: undefined
    });

    expect(() => parseChainCatalog(env)).toThrow(/CHAIN_ETHEREUM_RPC_URLS/i);
  });

  test("fails when CHAIN_KEYS is missing", () => {
    expect(() =>
      parseChainCatalog(
        makeDefaultEnv({
          CHAIN_KEYS: undefined
        })
      )
    ).toThrow(/CHAIN_KEYS/i);
  });
});
