export interface SafeHeadProvider {
  getBlock(blockTag: string): Promise<{ number: number } | null>;
  getBlockNumber(): Promise<number>;
}

export interface ResolveSafeHeadOptions {
  provider: SafeHeadProvider;
  confirmationsFallback: number;
}

export const resolveSafeHead = async ({
  provider,
  confirmationsFallback
}: ResolveSafeHeadOptions): Promise<number> => {
  try {
    const finalized = await provider.getBlock("finalized");
    if (typeof finalized?.number === "number") {
      return finalized.number;
    }
  } catch {
    // Fall through to the confirmations-based strategy.
  }

  const latest = await provider.getBlockNumber();
  return Math.max(0, latest - confirmationsFallback);
};
