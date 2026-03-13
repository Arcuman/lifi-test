import mongoose from "mongoose";

import type {
  TransactionContext,
  TransactionManager
} from "../../application/ports/transaction-manager";

export class MongoTransactionManager implements TransactionManager {
  async withTransaction<T>(
    work: (context: TransactionContext) => Promise<T>
  ): Promise<T> {
    const session = await mongoose.startSession();
    try {
      let result!: T;
      await session.withTransaction(async () => {
        result = await work(session as unknown as TransactionContext);
      });
      return result;
    } finally {
      await session.endSession();
    }
  }
}
