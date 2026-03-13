export interface AdaptiveBatchControllerOptions {
  initialSize: number;
  minSize: number;
  maxSize: number;
}

export class AdaptiveBatchController {
  public currentSize: number;
  private consecutiveSuccesses = 0;
  private readonly minSize: number;
  private readonly maxSize: number;

  constructor({
    initialSize,
    minSize,
    maxSize
  }: AdaptiveBatchControllerOptions) {
    this.currentSize = initialSize;
    this.minSize = minSize;
    this.maxSize = maxSize;
  }

  onTimeout(): number {
    this.consecutiveSuccesses = 0;
    this.currentSize = Math.max(this.minSize, Math.floor(this.currentSize / 2));
    return this.currentSize;
  }

  onSuccess(): number {
    this.consecutiveSuccesses += 1;
    if (this.consecutiveSuccesses >= 3) {
      this.currentSize = Math.min(
        this.maxSize,
        this.currentSize + Math.max(1, Math.floor(this.currentSize / 2))
      );
      this.consecutiveSuccesses = 0;
    }
    return this.currentSize;
  }
}
