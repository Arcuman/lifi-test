export class LeaseLostError extends Error {
  constructor(
    message = "Indexer lease was lost while processing",
    options?: { cause?: unknown }
  ) {
    super(message, options);
    this.name = "LeaseLostError";
  }
}
