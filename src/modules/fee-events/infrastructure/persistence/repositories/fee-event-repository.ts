import { Types, type ClientSession } from "mongoose";

import {
  decodeCursor,
  encodeCursor,
  type FeeEventsCursor
} from "../../../application/cursor-codec";
import type {
  FeeEventWriteRepository,
  ReplaceFeeEventRangeInput
} from "../../../application/ports/fee-event-write-repository";
import type {
  FeeEventListItem,
  FeeEventsQueryService,
  FindFeesByIntegratorQuery,
  FindFeesByIntegratorResult
} from "../../../application/ports/fee-events-query-service";
import type { CollectedFeeEvent } from "../../../application/ports/fees-collected-gateway";
import type { TransactionContext } from "../../../application/ports/transaction-manager";
import {
  getFeeEventModel,
  type FeeEventModelClass
} from "../models/fee-event.model";

type PersistedFeeEvent = FeeEventModelClass & { _id: { toString(): string } };

export class MongoFeeEventRepository
  implements FeeEventWriteRepository, FeeEventsQueryService
{
  async replaceRange(
    input: ReplaceFeeEventRangeInput,
    transaction: TransactionContext
  ): Promise<void> {
    const session = transaction as unknown as ClientSession;
    const model = getFeeEventModel();
    const existing = await model
      .find(
        {
          chainId: input.chainId,
          contractAddress: input.contractAddress,
          eventName: input.eventName,
          orphaned: false,
          blockNumber: {
            $gte: input.fromBlock,
            $lte: input.toBlock
          }
        },
        {
          _id: 1,
          chainId: 1,
          blockHash: 1,
          logIndex: 1
        },
        { session }
      )
      .lean();

    const incomingKeys = new Set(input.events.map(buildEventStorageKey));
    const orphanedIds = existing
      .filter((item) => !incomingKeys.has(buildEventStorageKey(item)))
      .map((item) => item._id);

    if (input.events.length === 0 && orphanedIds.length === 0) {
      return;
    }

    const operations = [
      ...input.events.map((event) => ({
        updateOne: {
          filter: {
            chainId: event.chainId,
            blockHash: event.blockHash,
            logIndex: event.logIndex
          },
          update: {
            $set: {
              ...event,
              orphaned: false
            }
          },
          upsert: true
        }
      })),
      ...orphanedIds.map((id) => ({
        updateOne: {
          filter: { _id: id },
          update: {
            $set: {
              orphaned: true
            }
          }
        }
      }))
    ];

    await model.bulkWrite(operations, { session });
  }

  async getFeesByIntegrator(
    query: FindFeesByIntegratorQuery
  ): Promise<FindFeesByIntegratorResult> {
    const model = getFeeEventModel();
    const filter: Record<string, unknown> = {
      integrator: query.integrator,
      orphaned: false
    };

    if (query.chainId !== undefined) {
      filter.chainId = query.chainId;
    }
    if (query.fromBlock !== undefined || query.toBlock !== undefined) {
      const blockNumberFilter: { $gte?: number; $lte?: number } = {};
      if (query.fromBlock !== undefined) {
        blockNumberFilter.$gte = query.fromBlock;
      }
      if (query.toBlock !== undefined) {
        blockNumberFilter.$lte = query.toBlock;
      }
      filter.blockNumber = blockNumberFilter;
    }
    if (query.cursor) {
      const cursor = decodeCursor(query.cursor);
      filter.$or = buildCursorFilter(cursor);
    }

    const items = (await model
      .find(filter)
      .sort({
        blockNumber: -1,
        logIndex: -1,
        chainId: -1,
        _id: -1
      })
      .limit(query.limit + 1)
      .lean()) as PersistedFeeEvent[];

    const hasMore = items.length > query.limit;
    const pageItems = hasMore ? items.slice(0, query.limit) : items;
    const last = pageItems.at(-1);

    return {
      items: pageItems.map(toFeeEventListItem),
      nextCursor:
        hasMore && last
          ? encodeCursor({
              blockNumber: last.blockNumber,
              logIndex: last.logIndex,
              chainId: last.chainId,
              id: last._id.toString()
            })
          : null
    };
  }
}

const buildCursorFilter = (cursor: FeeEventsCursor) => [
  { blockNumber: { $lt: cursor.blockNumber } },
  {
    blockNumber: cursor.blockNumber,
    logIndex: { $lt: cursor.logIndex }
  },
  {
    blockNumber: cursor.blockNumber,
    logIndex: cursor.logIndex,
    chainId: { $lt: cursor.chainId }
  },
  {
    blockNumber: cursor.blockNumber,
    logIndex: cursor.logIndex,
    chainId: cursor.chainId,
    _id: { $lt: new Types.ObjectId(cursor.id) }
  }
];

const buildEventStorageKey = (
  event: Pick<CollectedFeeEvent, "chainId" | "blockHash" | "logIndex">
): string => [event.chainId, event.blockHash, event.logIndex].join(":");

const toFeeEventListItem = (item: PersistedFeeEvent): FeeEventListItem => ({
  id: item._id.toString(),
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
