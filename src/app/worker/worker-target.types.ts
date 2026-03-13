import type { Logger } from "pino";

import type { WorkerConfig } from "../../shared/config/parse-config";
import type { WorkerCycleService } from "./worker-cycle-service.types";

export interface WorkerTargetDefinition {
  moduleKey: string;
  eventKey: string;
  createService(context: WorkerTargetContext): Promise<WorkerCycleService>;
}

export interface WorkerTargetContext {
  env: NodeJS.ProcessEnv;
  logger: Logger;
  workerConfig: WorkerConfig;
  workerInstanceId: string;
}

export interface ResolvedWorkerTarget {
  name: string;
  service: WorkerCycleService;
}
