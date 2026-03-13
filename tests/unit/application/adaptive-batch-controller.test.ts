import { describe, expect, test } from "vitest";

import { AdaptiveBatchController } from "../../../src/modules/fee-events/application/adaptive-batch-controller";

describe("AdaptiveBatchController", () => {
  test("reduces batch size on timeout", () => {
    const controller = new AdaptiveBatchController({
      initialSize: 5000,
      minSize: 100,
      maxSize: 10000
    });

    controller.onTimeout();

    expect(controller.currentSize).toBe(2500);
  });

  test("increases batch size after repeated success", () => {
    const controller = new AdaptiveBatchController({
      initialSize: 1000,
      minSize: 100,
      maxSize: 5000
    });

    controller.onSuccess();
    controller.onSuccess();
    controller.onSuccess();

    expect(controller.currentSize).toBeGreaterThan(1000);
    expect(controller.currentSize).toBeLessThanOrEqual(5000);
  });
});
