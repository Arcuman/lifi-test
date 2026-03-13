export class RpcTimeoutError extends Error {
  constructor(message = "RPC request timed out") {
    super(message);
    this.name = "RpcTimeoutError";
  }
}
