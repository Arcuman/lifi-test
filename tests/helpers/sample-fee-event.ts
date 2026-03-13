import { randomUUID } from "node:crypto";

export const makeSampleFeeEvent = (
  overrides: Partial<{
    chainId: number;
    contractAddress: string;
    blockNumber: number;
    blockHash: string;
    blockTimestamp: Date;
    transactionHash: string;
    transactionIndex: number;
    logIndex: number;
    token: string;
    integrator: string;
    integratorFee: string;
    lifiFee: string;
    syncedAt: Date;
  }> = {}
) => ({
  chainId: 137,
  contractAddress: "0xbd6c7b0d2f68c2b7805d88388319cfb6ecb50ea9",
  eventName: "FeesCollected" as const,
  blockNumber: 78600000,
  blockHash: `0x${"a".repeat(63)}1`,
  blockTimestamp: new Date("2026-03-12T10:00:00.000Z"),
  transactionHash: `0x${"b".repeat(63)}2`,
  transactionIndex: 0,
  logIndex: 0,
  token: "0x0000000000000000000000000000000000000000",
  integrator: "0x1111111111111111111111111111111111111111",
  integratorFee: "1000000000000000000",
  lifiFee: "500000000000000000",
  removed: false,
  orphaned: false,
  syncedAt: new Date("2026-03-12T10:00:01.000Z"),
  rawTopics: [],
  rawData: `0x${randomUUID().replaceAll("-", "")}`,
  ...overrides
});
