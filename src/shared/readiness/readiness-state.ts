export type ReadinessCheck = () => boolean | Promise<boolean>;

export class ReadinessState {
  private configValidated = false;
  private mongoReachable = false;
  private mongoTransactionReady = false;
  private indexesReady = false;
  private readonly checks: ReadinessCheck[] = [];

  markConfigValidated(): void {
    this.configValidated = true;
  }

  markMongoReachable(): void {
    this.mongoReachable = true;
  }

  markMongoTransactionReady(): void {
    this.mongoTransactionReady = true;
  }

  markIndexesReady(): void {
    this.indexesReady = true;
  }

  registerCheck(check: ReadinessCheck): void {
    this.checks.push(check);
  }

  async isReady(): Promise<boolean> {
    const startupReady =
      this.configValidated &&
      this.mongoReachable &&
      this.mongoTransactionReady &&
      this.indexesReady;
    if (!startupReady) {
      return false;
    }

    if (this.checks.length === 0) {
      return true;
    }

    const results = await Promise.allSettled(
      this.checks.map((check) => check())
    );
    return results.every(
      (result) => result.status === "fulfilled" && result.value === true
    );
  }
}
