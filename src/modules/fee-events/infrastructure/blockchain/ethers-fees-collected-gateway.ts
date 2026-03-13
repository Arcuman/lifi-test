import { ethers } from "ethers";

import { parseFeesCollectedLog, type RawLogLike } from "./fee-collector-parser";
import {
  resolveFeeCollectorContractDefinition,
  type FeeCollectorContractDefinition
} from "./fee-collector-contract-definition";
import { resolveSafeHead, type SafeHeadProvider } from "./safe-head-resolver";
import type { FeeEventsIndexerConfig } from "../../application/fee-events-worker-config.types";
import type {
  CollectedFeeEvent,
  FeesCollectedGateway
} from "../../application/ports/fees-collected-gateway";

export class EthersFeesCollectedGateway implements FeesCollectedGateway {
  private readonly safeHeadProvider: SafeHeadProvider;
  private readonly provider:
    | ethers.providers.JsonRpcProvider
    | ethers.providers.FallbackProvider;
  private readonly contract: ethers.Contract;
  private readonly filter: ethers.EventFilter;
  private readonly contractDefinition: FeeCollectorContractDefinition;

  constructor(private readonly config: FeeEventsIndexerConfig) {
    const providers = config.chain.rpcUrls.map(
      (rpcUrl) =>
        new ethers.providers.JsonRpcProvider(rpcUrl, {
          chainId: config.chain.chainId,
          name: config.chain.name
        })
    );

    const primaryProvider = providers[0];
    if (!primaryProvider) {
      throw new Error(
        `No RPC providers configured for chain ${config.chain.chainId}`
      );
    }

    this.provider =
      providers.length === 1
        ? primaryProvider
        : new ethers.providers.FallbackProvider(
            providers.map((provider, index) => ({
              provider,
              priority: index + 1,
              weight: 1,
              stallTimeout: 1_000
            })),
            1
          );
    this.safeHeadProvider = this.provider;
    this.contractDefinition = resolveFeeCollectorContractDefinition(
      config.chain.key
    );

    this.contract = new ethers.Contract(
      config.feeCollectorAddress,
      this.contractDefinition.abi,
      this.provider
    );
    const filterFactory = this.contract.filters[
      this.contractDefinition.eventName
    ] as (() => ethers.EventFilter) | undefined;
    if (!filterFactory) {
      throw new Error(
        `FeeCollector ABI does not expose ${this.contractDefinition.eventName} filter`
      );
    }
    this.filter = filterFactory();
  }

  async getSafeHead(): Promise<number> {
    return resolveSafeHead({
      provider: this.safeHeadProvider,
      confirmationsFallback: this.config.chain.confirmationsFallback
    });
  }

  async getFeesCollectedEvents(
    fromBlock: number,
    toBlock: number
  ): Promise<CollectedFeeEvent[]> {
    const events = await this.contract.queryFilter(
      this.filter,
      fromBlock,
      toBlock
    );
    if (events.length === 0) {
      return [];
    }

    const blockNumbers = [
      ...new Set(
        events
          .map((event) => event.blockNumber)
          .filter((value): value is number => typeof value === "number")
      )
    ];
    const blocks = await Promise.all(
      blockNumbers.map(
        async (blockNumber) =>
          [blockNumber, await this.provider.getBlock(blockNumber)] as const
      )
    );
    const blockByNumber = new Map(blocks);

    return events.map((event) => {
      const rawLog = toRawLog(event);
      const block = blockByNumber.get(rawLog.blockNumber);
      if (!block) {
        throw new Error(
          `Missing block ${rawLog.blockNumber} for event parsing`
        );
      }

      const parsed = parseFeesCollectedLog(
        rawLog,
        new Date(block.timestamp * 1_000),
        this.config.chain.chainId,
        this.contractDefinition
      );

      return {
        ...parsed,
        syncedAt: new Date(),
        removed: event.removed === true
      };
    });
  }
}

const toRawLog = (event: ethers.Event): RawLogLike => {
  if (
    typeof event.address !== "string" ||
    !Array.isArray(event.topics) ||
    typeof event.data !== "string" ||
    typeof event.blockNumber !== "number" ||
    typeof event.blockHash !== "string" ||
    typeof event.transactionHash !== "string" ||
    typeof event.transactionIndex !== "number" ||
    typeof event.logIndex !== "number"
  ) {
    throw new Error("Incomplete FeesCollected event returned by provider");
  }

  return {
    address: event.address,
    topics: [...event.topics],
    data: event.data,
    blockNumber: event.blockNumber,
    blockHash: event.blockHash,
    transactionHash: event.transactionHash,
    transactionIndex: event.transactionIndex,
    logIndex: event.logIndex
  };
};
