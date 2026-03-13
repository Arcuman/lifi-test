import crypto from "node:crypto";

import type { RequestHandler } from "express";

declare module "express-serve-static-core" {
  interface Request {
    traceId?: string;
  }
}

export const requestTraceId: RequestHandler = (req, _res, next) => {
  req.traceId = crypto.randomUUID();
  next();
};
