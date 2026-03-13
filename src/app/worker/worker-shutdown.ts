import type { Logger } from "pino";

interface InstallWorkerShutdownOptions {
  abortController: AbortController;
  logger: Logger;
}

export const installWorkerShutdown = ({
  abortController,
  logger
}: InstallWorkerShutdownOptions): (() => void) => {
  let shuttingDown = false;

  const handleSignal = (signal: NodeJS.Signals): void => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    logger.info({ signal }, "Shutting down worker");
    abortController.abort();
  };

  const sigintHandler = (): void => {
    handleSignal("SIGINT");
  };
  const sigtermHandler = (): void => {
    handleSignal("SIGTERM");
  };

  process.once("SIGINT", sigintHandler);
  process.once("SIGTERM", sigtermHandler);

  return () => {
    process.removeListener("SIGINT", sigintHandler);
    process.removeListener("SIGTERM", sigtermHandler);
  };
};
