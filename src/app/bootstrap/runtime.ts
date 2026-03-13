import { createServer, type Server } from "node:http";

import type { Logger } from "pino";

import { createHttpRouters } from "./create-http-routers";
import { closeCombinedRuntime } from "./combined-runtime-shutdown";
import { createWorkerTargetDefinitions } from "./create-worker-target-definitions";
import { createHttpApp } from "./http/create-http-app";
import { resolveWorkerTarget } from "./resolve-worker-target";
import { createWorkerInstanceId } from "../worker/create-worker-instance-id";
import { runWorkerLoop } from "../worker/run-worker-loop";
import type { WorkerCycleService } from "../worker/worker-cycle-service.types";
import type { ResolvedWorkerTarget } from "../worker/worker-target.types";
import {
  closeMongoConnection,
  connectMongo
} from "../../modules/fee-events/infrastructure/persistence/mongo-connection";
import { ensureMongoIndexes } from "../../modules/fee-events/infrastructure/persistence/mongo-indexes";
import {
  isMongoTransactionReady,
  waitForMongoTransactionReady
} from "../../modules/fee-events/infrastructure/persistence/mongo-readiness";
import {
  parseApiConfig,
  parseWorkerConfig,
  type ApiConfig,
  type SharedRuntimeConfig,
  type WorkerConfig
} from "../../shared/config/parse-config";
import { createLogger } from "../../shared/logger/create-logger";
import { ReadinessState } from "../../shared/readiness/readiness-state";

interface SharedRuntimeContext {
  logger: Logger;
  readiness: ReadinessState;
  close(): Promise<void>;
}

export interface WorkerRuntimeContext extends SharedRuntimeContext {
  config: WorkerConfig;
  workerInstanceId: string;
  target: ResolvedWorkerTarget;
  service: WorkerCycleService;
}

export interface ApiRuntimeContext extends SharedRuntimeContext {
  config: ApiConfig;
}

export interface StartedApiRuntime extends ApiRuntimeContext {
  server: Server;
  close(): Promise<void>;
}

export const startWorkerRuntime = async (
  env: NodeJS.ProcessEnv = process.env
): Promise<WorkerRuntimeContext> => {
  const config = parseWorkerConfig(env);
  const runtime = await initializeSharedRuntime(config);
  const workerRuntime = await createWorkerRuntime(runtime, config, env);

  return {
    ...runtime,
    ...workerRuntime
  };
};

export const startApiRuntime = async (
  env: NodeJS.ProcessEnv = process.env
): Promise<StartedApiRuntime> => {
  const config = parseApiConfig(env);
  const runtime = await initializeSharedRuntime(config);
  const server = await startApiServer(runtime, config);

  return {
    ...runtime,
    config,
    server,
    close: async () => {
      await closeServer(server);
      await runtime.close();
    }
  };
};

export const startAllRuntime = async (
  env: NodeJS.ProcessEnv = process.env
): Promise<
  StartedApiRuntime & {
    workerConfig: WorkerConfig;
    workerInstanceId: string;
    target: ResolvedWorkerTarget;
    service: WorkerCycleService;
    workerPromise: Promise<void>;
    abortController: AbortController;
  }
> => {
  const apiConfig = parseApiConfig(env);
  const workerConfig = parseWorkerConfig(env);
  const runtime = await initializeSharedRuntime(apiConfig);
  const server = await startApiServer(runtime, apiConfig);
  const workerRuntime = await createWorkerRuntime(runtime, workerConfig, env);
  const abortController = new AbortController();
  const workerPromise = runWorkerLoop({
    logger: runtime.logger,
    service: workerRuntime.service,
    pollIntervalMs: workerConfig.worker.pollIntervalMs,
    once: false,
    signal: abortController.signal
  });

  return {
    ...runtime,
    config: apiConfig,
    server,
    workerConfig: workerRuntime.config,
    workerInstanceId: workerRuntime.workerInstanceId,
    target: workerRuntime.target,
    service: workerRuntime.service,
    abortController,
    workerPromise,
    close: async () => {
      await closeCombinedRuntime({
        abortController,
        closeServer: async () => {
          await closeServer(server);
        },
        workerPromise,
        closeRuntime: runtime.close
      });
    }
  };
};

const initializeSharedRuntime = async (
  config: SharedRuntimeConfig
): Promise<SharedRuntimeContext> => {
  const logger = createLogger(config.logLevel);
  const readiness = new ReadinessState();
  readiness.markConfigValidated();

  try {
    await connectMongo(config.mongoUri);
    readiness.markMongoReachable();

    await waitForMongoTransactionReady({
      timeoutMs: config.worker.startupTimeoutMs
    });
    readiness.markMongoTransactionReady();

    await ensureMongoIndexes();
    readiness.markIndexesReady();
    readiness.registerCheck(isMongoTransactionReady);

    return {
      logger,
      readiness,
      close: async () => {
        await closeMongoConnection();
      }
    };
  } catch (error) {
    await closeMongoConnection();
    logger.error({ error }, "Runtime initialization failed");
    throw error;
  }
};

const createWorkerRuntime = async (
  runtime: SharedRuntimeContext,
  config: WorkerConfig,
  env: NodeJS.ProcessEnv
): Promise<
  Pick<
    WorkerRuntimeContext,
    "config" | "workerInstanceId" | "target" | "service"
  >
> => {
  const workerInstanceId = createWorkerInstanceId();
  const target = await resolveWorkerTarget({
    definitions: createWorkerTargetDefinitions(),
    workerTarget: config.workerTarget,
    context: {
      env,
      logger: runtime.logger,
      workerConfig: config,
      workerInstanceId
    }
  });

  return {
    config,
    workerInstanceId,
    target,
    service: target.service
  };
};

const startApiServer = async (
  runtime: SharedRuntimeContext,
  config: ApiConfig
): Promise<Server> => {
  const app = createHttpApp({
    logger: runtime.logger,
    readiness: runtime.readiness,
    routers: createHttpRouters()
  });
  const server = createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(config.port, resolve);
  });

  runtime.logger.info({ port: config.port }, "API server started");
  return server;
};

const closeServer = async (server: Server): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
};
