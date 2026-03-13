export const makeDefaultEnv = (
  overrides: Partial<NodeJS.ProcessEnv> = {}
): NodeJS.ProcessEnv => ({
  PORT: "3000",
  LOG_LEVEL: "info",
  MONGODB_URI: "mongodb://localhost:27017/lifi?replicaSet=rs0",
  CHAIN_KEYS: "polygon",
  WORKER_CHAIN_KEY: "polygon",
  WORKER_MODULE: "fee-events",
  WORKER_EVENT: "fees-collected",
  WORKER_POLL_INTERVAL_MS: "1000",
  WORKER_LEASE_DURATION_MS: "30000",
  WORKER_LEASE_RENEW_INTERVAL_MS: "5000",
  WORKER_INITIAL_BATCH_SIZE: "5000",
  WORKER_MIN_BATCH_SIZE: "100",
  WORKER_MAX_BATCH_SIZE: "10000",
  WORKER_CONFIRMATIONS_FALLBACK: "64",
  WORKER_REORG_LOOKBACK: "32",
  WORKER_STARTUP_TIMEOUT_MS: "5000",
  CHAIN_POLYGON_RPC_URLS: "https://polygon-rpc.com,https://rpc.ankr.com/polygon",
  CHAIN_POLYGON_START_BLOCK: "78600000",
  CHAIN_POLYGON_FEE_COLLECTOR_ADDRESS:
    "0xbD6C7B0d2f68c2b7805d88388319cfB6EcB50eA9",
  ...overrides
});
