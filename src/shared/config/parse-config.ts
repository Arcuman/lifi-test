import { z } from "zod";

import { getKnownChainDefinition } from "./chain-registry";
import {
  parseChainId,
  parseRpcUrls,
  toChainEnvSuffix
} from "./env-parsers";

const sharedEnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.string().default("info"),
  MONGODB_URI: z.string().min(1),
  WORKER_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(10_000),
  WORKER_LEASE_DURATION_MS: z.coerce.number().int().positive().default(30_000),
  WORKER_LEASE_RENEW_INTERVAL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(5_000),
  WORKER_CONFIRMATIONS_FALLBACK: z.coerce
    .number()
    .int()
    .nonnegative()
    .default(64),
  WORKER_STARTUP_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000)
});

const chainCatalogEnvSchema = z.object({
  CHAIN_KEYS: z.string().min(1)
});

const workerSelectionEnvSchema = z.object({
  WORKER_CHAIN_KEY: z.string().min(1),
  WORKER_MODULE: z.string().min(1),
  WORKER_EVENT: z.string().min(1)
});

export interface ChainConfig {
  key: string;
  chainId: number;
  name: string;
  rpcUrls: string[];
  confirmationsFallback: number;
}

export interface SharedRuntimeConfig {
  port: number;
  logLevel: string;
  mongoUri: string;
  worker: {
    pollIntervalMs: number;
    leaseDurationMs: number;
    leaseRenewIntervalMs: number;
    startupTimeoutMs: number;
  };
}

export interface ApiConfig extends SharedRuntimeConfig {
  appMode: "api";
}

export interface WorkerConfig extends SharedRuntimeConfig {
  appMode: "worker";
  workerTarget: {
    moduleKey: string;
    eventKey: string;
    chainKey: string;
  };
  chain: ChainConfig;
}

export const parseApiConfig = (env: NodeJS.ProcessEnv): ApiConfig => ({
  appMode: "api",
  ...parseSharedRuntimeConfig(env)
});

export const parseWorkerConfig = (env: NodeJS.ProcessEnv): WorkerConfig => {
  const shared = parseSharedRuntimeConfig(env);
  const chains = parseChainCatalog(env);
  const parsed = workerSelectionEnvSchema.parse(env);
  const workerChainKey = parsed.WORKER_CHAIN_KEY.trim().toLowerCase();
  const chain = chains.find((item) => item.key === workerChainKey);

  if (!chain) {
    throw new Error(
      `WORKER_CHAIN_KEY "${parsed.WORKER_CHAIN_KEY}" is not configured in the chain catalog`
    );
  }

  return {
    appMode: "worker",
    ...shared,
    workerTarget: {
      moduleKey: parsed.WORKER_MODULE.trim().toLowerCase(),
      eventKey: parsed.WORKER_EVENT.trim().toLowerCase(),
      chainKey: workerChainKey
    },
    chain
  };
};

export const parseChainCatalog = (env: NodeJS.ProcessEnv): ChainConfig[] => {
  const shared = sharedEnvSchema.parse(env);
  const parsed = chainCatalogEnvSchema.parse(env);
  return parseConfiguredChains(env, parsed, shared);
};

const parseSharedRuntimeConfig = (
  env: NodeJS.ProcessEnv
): SharedRuntimeConfig => {
  const parsed = sharedEnvSchema.parse(env);

  return {
    port: parsed.PORT,
    logLevel: parsed.LOG_LEVEL,
    mongoUri: parsed.MONGODB_URI,
    worker: {
      pollIntervalMs: parsed.WORKER_POLL_INTERVAL_MS,
      leaseDurationMs: parsed.WORKER_LEASE_DURATION_MS,
      leaseRenewIntervalMs: parsed.WORKER_LEASE_RENEW_INTERVAL_MS,
      startupTimeoutMs: parsed.WORKER_STARTUP_TIMEOUT_MS
    }
  };
};

const parseConfiguredChains = (
  env: NodeJS.ProcessEnv,
  parsed: z.infer<typeof chainCatalogEnvSchema>,
  shared: z.infer<typeof sharedEnvSchema>
): ChainConfig[] => {
  const chainKeys = parsed.CHAIN_KEYS.split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  if (chainKeys.length === 0) {
    throw new Error("CHAIN_KEYS must contain at least one chain key");
  }

  const uniqueChainKeys = new Set(chainKeys);
  if (uniqueChainKeys.size !== chainKeys.length) {
    throw new Error("CHAIN_KEYS contains duplicate chain keys");
  }

  return chainKeys.map((chainKey) =>
    parseGenericChainConfig(env, shared, chainKey)
  );
};

const parseGenericChainConfig = (
  env: NodeJS.ProcessEnv,
  shared: z.infer<typeof sharedEnvSchema>,
  chainKey: string
): ChainConfig => {
  const envSuffix = toChainEnvSuffix(chainKey);
  const defaults = getKnownChainDefinition(chainKey);
  const chainId = parseChainId(
    env[`CHAIN_${envSuffix}_ID`],
    envSuffix,
    defaults?.chainId
  );
  const name =
    env[`CHAIN_${envSuffix}_NAME`]?.trim() || defaults?.name || chainKey;

  return {
    key: chainKey,
    chainId,
    name,
    rpcUrls: parseRpcUrls(
      env[`CHAIN_${envSuffix}_RPC_URLS`],
      `CHAIN_${envSuffix}_RPC_URLS`
    ),
    confirmationsFallback: shared.WORKER_CONFIRMATIONS_FALLBACK
  };
};
