export interface FindFeesByIntegratorQuery {
  integrator: string;
  chainId?: number;
  fromBlock?: number;
  toBlock?: number;
  limit: number;
  cursor?: string;
}

export interface FeeEventListItem {
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

export interface FindFeesByIntegratorResult {
  items: FeeEventListItem[];
  nextCursor: string | null;
}

export interface FeeEventsQueryService {
  getFeesByIntegrator(
    query: FindFeesByIntegratorQuery
  ): Promise<FindFeesByIntegratorResult>;
}
