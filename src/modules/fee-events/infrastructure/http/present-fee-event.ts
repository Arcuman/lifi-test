import type { FeeEventListItem } from "../../application/ports/fee-events-query-service";

export interface FeeEventResponse {
  id: string;
  chainId: number;
  contractAddress: string;
  eventName: "FeesCollected";
  blockNumber: number;
  blockHash: string;
  blockTimestamp: Date;
  transactionHash: string;
  transactionIndex: number;
  logIndex: number;
  token: string;
  integrator: string;
  integratorFee: string;
  lifiFee: string;
  removed: boolean;
  orphaned: boolean;
  rawTopics?: string[];
  rawData?: string;
  syncedAt: Date;
}

export const presentFeeEvent = (item: FeeEventListItem): FeeEventResponse => ({
  id: item.id,
  chainId: item.chainId,
  contractAddress: item.contractAddress,
  eventName: item.eventName,
  blockNumber: item.blockNumber,
  blockHash: item.blockHash,
  blockTimestamp: item.blockTimestamp,
  transactionHash: item.transactionHash,
  transactionIndex: item.transactionIndex,
  logIndex: item.logIndex,
  token: item.token,
  integrator: item.integrator,
  integratorFee: item.integratorFee,
  lifiFee: item.lifiFee,
  removed: item.removed,
  orphaned: item.orphaned,
  syncedAt: item.syncedAt,
  ...(item.rawTopics ? { rawTopics: item.rawTopics } : {}),
  ...(item.rawData ? { rawData: item.rawData } : {})
});
