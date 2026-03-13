import { describe, expect, test } from "vitest";

import { planScanWindow } from "../../../src/modules/fee-events/application/scan-window";

describe("planScanWindow", () => {
  test("clamps fromBlock to startBlock", () => {
    expect(
      planScanWindow({
        startBlock: 100,
        lastFinalizedScannedBlock: 80,
        reorgLookback: 32,
        safeHead: 120
      })
    ).toEqual({ fromBlock: 100, toBlock: 120 });
  });

  test("rewinds by lookback when possible", () => {
    expect(
      planScanWindow({
        startBlock: 100,
        lastFinalizedScannedBlock: 150,
        reorgLookback: 10,
        safeHead: 170
      })
    ).toEqual({ fromBlock: 141, toBlock: 170 });
  });

  test("returns null when there is nothing to process", () => {
    expect(
      planScanWindow({
        startBlock: 100,
        lastFinalizedScannedBlock: 170,
        reorgLookback: 0,
        safeHead: 170
      })
    ).toBeNull();
  });

  test("can continue from the next unseen block without replaying lookback", () => {
    expect(
      planScanWindow({
        startBlock: 100,
        lastFinalizedScannedBlock: 170,
        reorgLookback: 32,
        safeHead: 175,
        replayLookback: false
      })
    ).toEqual({ fromBlock: 171, toBlock: 175 });
  });
});
