import { MongoMemoryReplSet } from "mongodb-memory-server";

export const createMongoMemoryReplicaSet =
  async (): Promise<MongoMemoryReplSet> =>
    MongoMemoryReplSet.create({
      replSet: { count: 1, storageEngine: "wiredTiger" }
    });
