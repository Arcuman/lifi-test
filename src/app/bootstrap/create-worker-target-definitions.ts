import type { WorkerTargetDefinition } from "../worker/worker-target.types";
import { createFeeEventsWorkerTargets } from "../../modules/fee-events/bootstrap/create-fee-events-worker-targets";

export const createWorkerTargetDefinitions = (): WorkerTargetDefinition[] => [
  ...createFeeEventsWorkerTargets()
];
