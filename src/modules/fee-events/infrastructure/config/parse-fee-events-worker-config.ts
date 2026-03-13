import { z } from "zod";

import type { ChainConfig } from "../../../../shared/config/parse-config";
import {
  parseAddress,
  parseNonNegativeInt,
  toChainEnvSuffix
} from "../../../../shared/config/env-parsers";
import type { FeeEventsWorkerConfig } from "../../application/fee-events-worker-config.types";

const feeEventsWorkerEnvSchema = z.object({
  FEE_EVENTS_GATEWAY_MODE: z.enum(["ethers", "fixture"]).default("ethers"),
  FIXTURE_SAFE_HEAD: z.coerce.number().int().nonnegative().optional(),
  FIXTURE_EVENTS_FILE: z.string().min(1).optional(),
  WORKER_REORG_LOOKBACK: z.coerce.number().int().nonnegative().default(32),
  WORKER_INITIAL_BATCH_SIZE: z.coerce.number().int().positive().default(5_000),
  WORKER_MIN_BATCH_SIZE: z.coerce.number().int().positive().default(100),
  WORKER_MAX_BATCH_SIZE: z.coerce.number().int().positive().default(10_000)
});

export const parseFeeEventsWorkerConfig = (
  env: NodeJS.ProcessEnv,
  chain: ChainConfig
): FeeEventsWorkerConfig => {
  const parsed = feeEventsWorkerEnvSchema.parse(env);
  const envSuffix = toChainEnvSuffix(chain.key);

  return {
    indexer: {
      chain,
      feeCollectorAddress: parseAddress(
        env[`CHAIN_${envSuffix}_FEE_COLLECTOR_ADDRESS`],
        `CHAIN_${envSuffix}_FEE_COLLECTOR_ADDRESS`
      ),
      startBlock: parseNonNegativeInt(
        env[`CHAIN_${envSuffix}_START_BLOCK`],
        `CHAIN_${envSuffix}_START_BLOCK`
      ),
      reorgLookback: parsed.WORKER_REORG_LOOKBACK,
      initialBatchSize: parsed.WORKER_INITIAL_BATCH_SIZE,
      minBatchSize: parsed.WORKER_MIN_BATCH_SIZE,
      maxBatchSize: parsed.WORKER_MAX_BATCH_SIZE
    },
    gateway:
      parsed.FEE_EVENTS_GATEWAY_MODE === "fixture"
        ? {
            mode: "fixture",
            fixture: {
              ...(parsed.FIXTURE_SAFE_HEAD === undefined
                ? {}
                : { safeHead: parsed.FIXTURE_SAFE_HEAD }),
              eventsFile:
                parsed.FIXTURE_EVENTS_FILE ?? "./tests/fixtures/fee-events.json"
            }
          }
        : {
            mode: "ethers"
          }
  };
};
