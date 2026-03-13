import type { CollectedFeeEvent } from "./fees-collected-gateway";
import type { TransactionContext } from "./transaction-manager";

export interface ReplaceFeeEventRangeInput {
  chainId: number;
  contractAddress: string;
  eventName: "FeesCollected";
  fromBlock: number;
  toBlock: number;
  events: CollectedFeeEvent[];
}

export interface FeeEventWriteRepository {
  replaceRange(
    input: ReplaceFeeEventRangeInput,
    transaction: TransactionContext
  ): Promise<void>;
}
