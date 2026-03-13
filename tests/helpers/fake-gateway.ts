import type {
  CollectedFeeEvent,
  FeesCollectedGateway
} from "../../src/modules/fee-events/application/ports/fees-collected-gateway";

export class FakeFeesCollectedGateway implements FeesCollectedGateway {
  public ranges: Array<{ fromBlock: number; toBlock: number }> = [];
  public safeHead = 0;
  public events: CollectedFeeEvent[] = [];
  public throwOnRange: Map<string, Error> = new Map();
  public delayMs = 0;
  public finalizedMode = true;

  async getSafeHead(): Promise<number> {
    return this.safeHead;
  }

  async getFeesCollectedEvents(
    fromBlock: number,
    toBlock: number
  ): Promise<CollectedFeeEvent[]> {
    this.ranges.push({ fromBlock, toBlock });
    const key = `${fromBlock}-${toBlock}`;
    const error = this.throwOnRange.get(key);
    if (error) {
      this.throwOnRange.delete(key);
      throw error;
    }
    if (this.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    }
    return this.events.filter(
      (event) => event.blockNumber >= fromBlock && event.blockNumber <= toBlock
    );
  }
}
