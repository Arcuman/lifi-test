import { createLogger } from "../../shared/logger/create-logger";
import { startAllRuntime } from "./runtime";

const bootstrapLogger = createLogger();

void main().catch((error) => {
  bootstrapLogger.error({ error }, "Combined runtime startup failed");
  process.exit(1);
});

async function main(): Promise<void> {
  const runtime = await startAllRuntime(process.env);
  const dispose = installShutdown(runtime);

  runtime.workerPromise.catch(async (error) => {
    runtime.logger.error({ error }, "Worker loop crashed");
    await runtime.close().catch((closeError) => {
      runtime.logger.error(
        { error: closeError },
        "Combined runtime shutdown failed"
      );
    });
    process.exit(1);
  });

  runtime.server.on("close", dispose);
}

function installShutdown(
  runtime: Awaited<ReturnType<typeof startAllRuntime>>
): () => void {
  let shuttingDown = false;

  const handleSignal = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    runtime.logger.info({ signal }, "Shutting down combined runtime");
    runtime.abortController.abort();

    try {
      await runtime.close();
      process.exit(0);
    } catch (error) {
      runtime.logger.error({ error }, "Combined runtime shutdown failed");
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

  return () => {
    process.removeListener("SIGINT", sigintHandler);
    process.removeListener("SIGTERM", sigtermHandler);
  };
}
