import type { WorkerConfig } from "../../shared/config/parse-config";
import type {
  ResolvedWorkerTarget,
  WorkerTargetContext,
  WorkerTargetDefinition
} from "../worker/worker-target.types";

interface ResolveWorkerTargetOptions {
  definitions: WorkerTargetDefinition[];
  workerTarget: WorkerConfig["workerTarget"];
  context: WorkerTargetContext;
}

export const resolveWorkerTarget = async ({
  definitions,
  workerTarget,
  context
}: ResolveWorkerTargetOptions): Promise<ResolvedWorkerTarget> => {
  const definition = definitions.find(
    (candidate) =>
      candidate.moduleKey === workerTarget.moduleKey &&
      candidate.eventKey === workerTarget.eventKey
  );

  if (!definition) {
    throw new Error(
      `Worker target "${workerTarget.moduleKey}:${workerTarget.eventKey}" is not registered`
    );
  }

  const service = await definition.createService(context);

  return {
    name: `${workerTarget.moduleKey}:${workerTarget.eventKey}:${workerTarget.chainKey}`,
    service
  };
};
