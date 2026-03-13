import { readFile } from "node:fs/promises";

import { normalizeAddress } from "../../domain/address";
import type {
  CollectedFeeEvent,
  FeesCollectedGateway
} from "../../application/ports/fees-collected-gateway";

interface FixtureEventRecord {
  chainId: number;
  contractAddress: string;
  eventName?: "FeesCollected";
  blockNumber: number;
  blockHash: string;
  blockTimestamp: string;
  transactionHash: string;
  transactionIndex: number;
  logIndex: number;
  token: string;
  integrator: string;
  integratorFee: string;
  lifiFee: string;
  removed?: boolean;
  orphaned?: boolean;
  syncedAt?: string;
  rawTopics?: string[];
  rawData?: string;
}

export interface JsonFixtureFeesCollectedGatewayOptions {
  safeHead: number;
  events: CollectedFeeEvent[];
}

export class JsonFixtureFeesCollectedGateway implements FeesCollectedGateway {
  constructor(
    private readonly options: JsonFixtureFeesCollectedGatewayOptions
  ) {}

  static async fromFile(
    filePath: string,
    safeHead: number
  ): Promise<JsonFixtureFeesCollectedGateway> {
    const content = await readFile(filePath, "utf8");
    const parsed = JSON.parse(content) as FixtureEventRecord[];

    return new JsonFixtureFeesCollectedGateway({
      safeHead,
      events: parsed.map((event) => {
        const collected: CollectedFeeEvent = {
          chainId: event.chainId,
          contractAddress: normalizeAddress(event.contractAddress),
          eventName: event.eventName ?? "FeesCollected",
          blockNumber: event.blockNumber,
          blockHash: event.blockHash,
          blockTimestamp: new Date(event.blockTimestamp),
          transactionHash: event.transactionHash,
          transactionIndex: event.transactionIndex,
          logIndex: event.logIndex,
          token: normalizeAddress(event.token),
          integrator: normalizeAddress(event.integrator),
          integratorFee: event.integratorFee,
          lifiFee: event.lifiFee,
          removed: event.removed ?? false,
          orphaned: event.orphaned ?? false,
          syncedAt: event.syncedAt ? new Date(event.syncedAt) : new Date()
        };

        if (event.rawTopics) {
          collected.rawTopics = [...event.rawTopics];
        }
        if (event.rawData) {
          collected.rawData = event.rawData;
        }

        return collected;
      })
    });
  }

  async getSafeHead(): Promise<number> {
    return this.options.safeHead;
  }

  async getFeesCollectedEvents(
    fromBlock: number,
    toBlock: number
  ): Promise<CollectedFeeEvent[]> {
    return this.options.events
      .filter(
        (event) =>
          event.blockNumber >= fromBlock && event.blockNumber <= toBlock
      )
      .map((event) => {
        const cloned: CollectedFeeEvent = {
          ...event,
          blockTimestamp: new Date(event.blockTimestamp),
          syncedAt: new Date(event.syncedAt)
        };

        if (event.rawTopics) {
          cloned.rawTopics = [...event.rawTopics];
        }

        return cloned;
      });
  }
}
