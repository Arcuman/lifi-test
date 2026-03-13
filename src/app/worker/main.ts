import { createLogger } from "../../shared/logger/create-logger";
import { startWorkerRuntime } from "../bootstrap/runtime";
import { runWorkerLoop } from "./run-worker-loop";
import { installWorkerShutdown } from "./worker-shutdown";

const bootstrapLogger = createLogger();

void main().catch((error) => {
  bootstrapLogger.error({ error }, "Worker startup failed");
  process.exit(1);
});

async function main(): Promise<void> {
  const once = process.argv.includes("--once");
  const runtime = await startWorkerRuntime(process.env);
  const abortController = new AbortController();
  const dispose = installWorkerShutdown({
    abortController,
    logger: runtime.logger
  });

  try {
    await runWorkerLoop({
      logger: runtime.logger,
      service: runtime.service,
      pollIntervalMs: runtime.config.worker.pollIntervalMs,
      once,
      signal: abortController.signal
    });
  } finally {
    dispose();
    await runtime.close();
  }
}
