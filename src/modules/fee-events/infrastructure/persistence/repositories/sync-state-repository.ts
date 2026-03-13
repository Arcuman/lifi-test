import type { ClientSession } from "mongoose";

import type {
  AcquireLeaseInput,
  SyncStateRecord,
  SyncStateRepository,
  UpdateProgressInput
} from "../../../application/ports/sync-state-repository";
import type { TransactionContext } from "../../../application/ports/transaction-manager";
import {
  getSyncStateModel,
  type SyncStateModelClass
} from "../models/sync-state.model";

export class MongoSyncStateRepository implements SyncStateRepository {
  async acquireLease(input: AcquireLeaseInput): Promise<SyncStateRecord | null> {
    const now = new Date();
    const leaseUntil = new Date(now.getTime() + input.leaseDurationMs);
    const model = getSyncStateModel();

    try {
      const lease = await model.findOneAndUpdate(
        {
          key: input.key,
          $or: [
            { leaseUntil: { $exists: false } },
            { leaseUntil: { $lt: now } },
            { leaseOwner: input.owner }
          ]
        },
        {
          $set: {
            leaseOwner: input.owner,
            leaseUntil,
            lastHeartbeatAt: now,
            updatedAt: now,
            status: "running"
          },
          $unset: {
            lastError: 1
          },
          $setOnInsert: {
            key: input.key,
            chainId: input.chainId,
            contractAddress: input.contractAddress,
            eventName: input.eventName,
            lastFinalizedScannedBlock: 0,
            reorgLookback: input.reorgLookback
          }
        },
        {
          upsert: true,
          returnDocument: "after"
        }
      );

      return toSyncStateRecord(lease.toObject() as SyncStateModelClass);
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        return null;
      }
      throw error;
    }
  }

  async renewLease(input: AcquireLeaseInput): Promise<boolean> {
    const now = new Date();
    const leaseUntil = new Date(now.getTime() + input.leaseDurationMs);
    const model = getSyncStateModel();
    const updated = await model.updateOne(
      {
        key: input.key,
        leaseOwner: input.owner
      },
      {
        $set: {
          leaseUntil,
          lastHeartbeatAt: now,
          updatedAt: now
        }
      }
    );
    return updated.modifiedCount > 0;
  }

  async updateProgress(
    input: UpdateProgressInput,
    transaction?: TransactionContext
  ): Promise<void> {
    const session = transaction as unknown as ClientSession | undefined;
    const model = getSyncStateModel();
    const { leaseOwner, lastError, ...progress } = input;
    const options = session
      ? { upsert: leaseOwner === undefined, session }
      : { upsert: leaseOwner === undefined };
    const filter = leaseOwner
      ? {
          key: input.key,
          leaseOwner
        }
      : { key: input.key };
    const update: {
      $set: typeof progress & { updatedAt: Date; lastError?: string };
      $unset?: { lastError: 1 };
    } = {
      $set: {
        ...progress,
        updatedAt: new Date()
      }
    };

    if (lastError === null) {
      update.$unset = { lastError: 1 };
    } else if (lastError !== undefined) {
      update.$set.lastError = lastError;
    }

    await model.updateOne(
      filter,
      update,
      options
    );
  }

  async getByKey(key: string): Promise<SyncStateRecord | null> {
    const item = (await getSyncStateModel().findOne({ key }).lean()) as
      | SyncStateModelClass
      | null;
    if (!item) {
      return null;
    }
    return toSyncStateRecord(item);
  }

  async deleteAll(): Promise<void> {
    await getSyncStateModel().deleteMany({});
  }
}

const isDuplicateKeyError = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  error.code === 11000;

const toSyncStateRecord = (item: SyncStateModelClass): SyncStateRecord => ({
  key: item.key,
  chainId: item.chainId,
  contractAddress: item.contractAddress,
  eventName: item.eventName,
  lastFinalizedScannedBlock: item.lastFinalizedScannedBlock,
  reorgLookback: item.reorgLookback,
  status: item.status,
  updatedAt: item.updatedAt,
  ...(item.leaseOwner ? { leaseOwner: item.leaseOwner } : {}),
  ...(item.leaseUntil ? { leaseUntil: item.leaseUntil } : {}),
  ...(item.lastHeartbeatAt ? { lastHeartbeatAt: item.lastHeartbeatAt } : {}),
  ...(item.lastError ? { lastError: item.lastError } : {})
});
