export interface IndexerLogger {
  info(payload: Record<string, unknown>, message: string): void;
  warn(payload: Record<string, unknown>, message: string): void;
}

export const noopIndexerLogger: IndexerLogger = {
  info: () => undefined,
  warn: () => undefined
};
