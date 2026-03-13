import express, { type Router } from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";
import type { Logger } from "pino";

import { createApiErrorHandler } from "./api-error-handler";
import { createHealthRouter } from "./health-routes";
import { requestTraceId } from "./request-trace-id";
import type { ReadinessState } from "../../../shared/readiness/readiness-state";

interface CreateHttpAppOptions {
  logger: Logger;
  readiness: ReadinessState;
  routers: Router[];
}

export const createHttpApp = ({
  logger,
  readiness,
  routers
}: CreateHttpAppOptions) => {
  const app = express();

  app.use(helmet());
  app.use(express.json());
  app.use(requestTraceId);
  app.use(
    pinoHttp({
      logger
    })
  );

  app.use(createHealthRouter({ readiness }));
  for (const router of routers) {
    app.use(router);
  }
  app.use(createApiErrorHandler({ logger }));

  return app;
};
