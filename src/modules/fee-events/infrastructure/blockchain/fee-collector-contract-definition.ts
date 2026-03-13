import { ethers } from "ethers";

import feeCollectorAbi from "../abi/FeeCollector.abi.json";

export interface FeeCollectorContractDefinition {
  key: string;
  eventName: "FeesCollected";
  abi: typeof feeCollectorAbi;
}

export const defaultFeeCollectorContractDefinition: FeeCollectorContractDefinition =
  {
    key: "fee-collector-v1",
    eventName: "FeesCollected",
    abi: feeCollectorAbi
  };

const definitionsByChainKey = new Map<string, FeeCollectorContractDefinition>([
  ["polygon", defaultFeeCollectorContractDefinition],
  ["ethereum", defaultFeeCollectorContractDefinition],
  ["arbitrum", defaultFeeCollectorContractDefinition],
  ["optimism", defaultFeeCollectorContractDefinition],
  ["base", defaultFeeCollectorContractDefinition],
  ["gnosis", defaultFeeCollectorContractDefinition],
  ["bsc", defaultFeeCollectorContractDefinition],
  ["avalanche", defaultFeeCollectorContractDefinition]
]);

export const resolveFeeCollectorContractDefinition = (
  chainKey: string
): FeeCollectorContractDefinition =>
  definitionsByChainKey.get(chainKey.toLowerCase()) ??
  defaultFeeCollectorContractDefinition;

export const createFeeCollectorInterfaceFromDefinition = (
  definition: FeeCollectorContractDefinition
): ethers.utils.Interface => new ethers.utils.Interface(definition.abi);
