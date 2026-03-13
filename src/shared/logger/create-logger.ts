import pino, { type Logger } from "pino";

export const createLogger = (level = process.env.LOG_LEVEL ?? "info"): Logger =>
  pino({
    level
  });
