import mongoose from "mongoose";

export interface WaitForMongoTransactionReadyOptions {
  timeoutMs: number;
  intervalMs?: number;
}

export const waitForMongoTransactionReady = async ({
  timeoutMs,
  intervalMs = 250
}: WaitForMongoTransactionReadyOptions): Promise<void> => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await isMongoTransactionReady()) {
      return;
    }

    await sleep(intervalMs);
  }

  throw new Error("MongoDB is not transaction-ready");
};

export const isMongoTransactionReady = async (): Promise<boolean> => {
  if (!mongoose.connection.db) {
    return false;
  }

  try {
    const hello = (await mongoose.connection.db
      .admin()
      .command({ hello: 1 })) as {
      setName?: string;
      isWritablePrimary?: boolean;
    };
    return Boolean(hello.setName && hello.isWritablePrimary);
  } catch {
    return false;
  }
};

const sleep = async (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));
