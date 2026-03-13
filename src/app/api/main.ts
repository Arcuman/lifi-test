import { createLogger } from "../../shared/logger/create-logger";
import { startApiRuntime } from "../bootstrap/runtime";

const bootstrapLogger = createLogger();

void main().catch((error) => {
  bootstrapLogger.error({ error }, "API startup failed");
  process.exit(1);
});

async function main(): Promise<void> {
  const runtime = await startApiRuntime(process.env);
  const shutdown = installShutdown(runtime.close, runtime.logger);

  runtime.server.on("close", shutdown.dispose);
}

function installShutdown(
  close: () => Promise<void>,
  logger: ReturnType<typeof createLogger>
): { dispose(): void } {
  let shuttingDown = false;

  const handleSignal = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.info({ signal }, "Shutting down API");

    try {
      await close();
      process.exit(0);
    } catch (error) {
      logger.error({ error }, "API shutdown failed");
      process.exit(1);
    }
  };

  const sigintHandler = (): void => {
    void handleSignal("SIGINT");
  };
  const sigtermHandler = (): void => {
    void handleSignal("SIGTERM");
  };

  process.once("SIGINT", sigintHandler);
  process.once("SIGTERM", sigtermHandler);

  return {
    dispose: () => {
      process.removeListener("SIGINT", sigintHandler);
      process.removeListener("SIGTERM", sigtermHandler);
    }
  };
}
