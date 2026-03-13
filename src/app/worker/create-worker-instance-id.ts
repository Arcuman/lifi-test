import { randomUUID } from "node:crypto";
import os from "node:os";

export const createWorkerInstanceId = (): string =>
  `worker:${os.hostname()}:${process.pid}:${randomUUID()}`;
