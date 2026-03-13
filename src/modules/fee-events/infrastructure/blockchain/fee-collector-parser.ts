import type { ethers } from "ethers";

import { normalizeAddress } from "../../domain/address";
import type { CollectedFeeEvent } from "../../application/ports/fees-collected-gateway";
import {
  createFeeCollectorInterfaceFromDefinition,
  defaultFeeCollectorContractDefinition,
  type FeeCollectorContractDefinition
} from "./fee-collector-contract-definition";

export class InvalidCollectedEventError extends Error {
  constructor(message = "Invalid FeesCollected log") {
    super(message);
    this.name = "InvalidCollectedEventError";
  }
}

export interface RawLogLike {
  address: string;
  topics: string[];
  data: string;
  blockNumber: number;
  blockHash: string;
  transactionHash: string;
  transactionIndex: number;
  logIndex: number;
}

export const createFeeCollectorInterface = (
  definition: FeeCollectorContractDefinition = defaultFeeCollectorContractDefinition
): ethers.utils.Interface =>
  createFeeCollectorInterfaceFromDefinition(definition);

export const parseFeesCollectedLog = (
  log: RawLogLike,
  blockTimestamp: Date,
  chainId: number,
  definition: FeeCollectorContractDefinition = defaultFeeCollectorContractDefinition
): CollectedFeeEvent => {
  const iface = createFeeCollectorInterface(definition);
  const eventTopic = iface.getEventTopic(definition.eventName);
  if (log.topics[0] !== eventTopic) {
    throw new InvalidCollectedEventError();
  }

  try {
    const parsed = iface.parseLog({ data: log.data, topics: log.topics });
    const [token, integrator, integratorFee, lifiFee] = parsed.args as [
      string,
      string,
      ethers.BigNumber,
      ethers.BigNumber
    ];

    return {
      chainId,
      contractAddress: normalizeAddress(log.address),
      eventName: "FeesCollected",
      blockNumber: log.blockNumber,
      blockHash: log.blockHash,
      blockTimestamp,
      transactionHash: log.transactionHash,
      transactionIndex: log.transactionIndex,
      logIndex: log.logIndex,
      token: normalizeAddress(token),
      integrator: normalizeAddress(integrator),
      integratorFee: integratorFee.toString(),
      lifiFee: lifiFee.toString(),
      removed: false,
      orphaned: false,
      syncedAt: new Date(),
      rawTopics: [...log.topics],
      rawData: log.data
    };
  } catch (error) {
    if (error instanceof InvalidCollectedEventError) {
      throw error;
    }
    throw new InvalidCollectedEventError();
  }
};
