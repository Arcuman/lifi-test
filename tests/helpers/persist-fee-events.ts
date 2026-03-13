import type {
  FeeEventWriteRepository,
  ReplaceFeeEventRangeInput
} from "../../src/modules/fee-events/application/ports/fee-event-write-repository";
import type { CollectedFeeEvent } from "../../src/modules/fee-events/application/ports/fees-collected-gateway";
import type { TransactionContext } from "../../src/modules/fee-events/application/ports/transaction-manager";
import type { MongoTransactionManager } from "../../src/modules/fee-events/infrastructure/persistence/transaction-manager";

interface FeeEventRangeGroup extends ReplaceFeeEventRangeInput {
  events: CollectedFeeEvent[];
}

export const persistFeeEvents = async (
  repository: FeeEventWriteRepository,
  transactionManager: MongoTransactionManager,
  events: CollectedFeeEvent[]
): Promise<void> => {
  const groups = new Map<string, FeeEventRangeGroup>();

  for (const event of events) {
    const key = [
      event.chainId,
      event.contractAddress,
      event.eventName
    ].join(":");
    const existing = groups.get(key);

    if (existing) {
      existing.events.push(event);
      existing.fromBlock = Math.min(existing.fromBlock, event.blockNumber);
      existing.toBlock = Math.max(existing.toBlock, event.blockNumber);
      continue;
    }

    groups.set(key, {
      chainId: event.chainId,
      contractAddress: event.contractAddress,
      eventName: event.eventName,
      fromBlock: event.blockNumber,
      toBlock: event.blockNumber,
      events: [event]
    });
  }

  await transactionManager.withTransaction(async (session) => {
    for (const group of groups.values()) {
      await repository.replaceRange(group, session);
    }
  });
};

export const replaceFeeEventRange = async (
  repository: FeeEventWriteRepository,
  transactionManager: MongoTransactionManager,
  input: ReplaceFeeEventRangeInput,
  sessionWork?: (session: TransactionContext) => Promise<void>
): Promise<void> => {
  await transactionManager.withTransaction(async (session) => {
    await repository.replaceRange(input, session);
    await sessionWork?.(session);
  });
};
