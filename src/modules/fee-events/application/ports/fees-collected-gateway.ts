export interface CollectedFeeEvent {
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
  syncedAt: Date;
  rawTopics?: string[];
  rawData?: string;
}

export interface FeesCollectedGateway {
  getSafeHead(): Promise<number>;
  getFeesCollectedEvents(
    fromBlock: number,
    toBlock: number
  ): Promise<CollectedFeeEvent[]>;
}
