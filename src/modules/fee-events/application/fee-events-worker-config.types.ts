import type { ChainConfig } from "../../../shared/config/parse-config";

export interface FeeEventsGatewayConfig {
  mode: "ethers" | "fixture";
  fixture?: {
    safeHead?: number;
    eventsFile: string;
  };
}

export interface FeeEventsIndexerConfig {
  chain: ChainConfig;
  feeCollectorAddress: string;
  startBlock: number;
  reorgLookback: number;
  initialBatchSize: number;
  minBatchSize: number;
  maxBatchSize: number;
}

export interface FeeEventsWorkerConfig {
  indexer: FeeEventsIndexerConfig;
  gateway: FeeEventsGatewayConfig;
}
