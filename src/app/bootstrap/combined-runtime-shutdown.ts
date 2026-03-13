interface CloseCombinedRuntimeOptions {
  abortController: AbortController;
  closeServer(): Promise<void>;
  workerPromise: Promise<void>;
  closeRuntime(): Promise<void>;
}

export const closeCombinedRuntime = async ({
  abortController,
  closeServer,
  workerPromise,
  closeRuntime
}: CloseCombinedRuntimeOptions): Promise<void> => {
  abortController.abort();
  await closeServer();
  await workerPromise.catch(() => undefined);
  await closeRuntime();
};
