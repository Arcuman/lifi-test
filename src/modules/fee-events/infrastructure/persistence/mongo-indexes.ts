import { getFeeEventModel } from "./models/fee-event.model";
import { getSyncStateModel } from "./models/sync-state.model";

export const ensureMongoIndexes = async (): Promise<void> => {
  // In stricter production, prefer migration-driven index rollout over syncIndexes().
  await getFeeEventModel().syncIndexes();
  await getSyncStateModel().syncIndexes();
};
