export interface FeeCollectorPartitionKeyInput {
  chainId: number;
  contractAddress: string;
  eventName: string;
}

export const buildFeeCollectorPartitionKey = ({
  chainId,
  contractAddress,
  eventName
}: FeeCollectorPartitionKeyInput): string =>
  `${chainId}:${contractAddress}:${eventName}`;
