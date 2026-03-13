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

  test("keeps the batch size stable until the third consecutive success", () => {
    const controller = new AdaptiveBatchController({
      initialSize: 1000,
      minSize: 100,
      maxSize: 5000
    });

    expect(controller.onSuccess()).toBe(1000);
    expect(controller.onSuccess()).toBe(1000);
    expect(controller.onSuccess()).toBe(1500);

    expect(controller.currentSize).toBe(1500);
  });

  test("caps growth at the configured maximum size", () => {
    const controller = new AdaptiveBatchController({
      initialSize: 4000,
      minSize: 100,
      maxSize: 5000
    });

    expect(controller.onSuccess()).toBe(4000);
    expect(controller.onSuccess()).toBe(4000);
    expect(controller.onSuccess()).toBe(5000);
    expect(controller.onSuccess()).toBe(5000);
    expect(controller.onSuccess()).toBe(5000);
    expect(controller.onSuccess()).toBe(5000);

    expect(controller.currentSize).toBe(5000);
  });

  test("resets the success streak after a timeout", () => {
    const controller = new AdaptiveBatchController({
      initialSize: 1000,
      minSize: 100,
      maxSize: 5000
    });

    expect(controller.onSuccess()).toBe(1000);
    expect(controller.onSuccess()).toBe(1000);
    expect(controller.onTimeout()).toBe(500);
    expect(controller.onSuccess()).toBe(500);
    expect(controller.onSuccess()).toBe(500);
    expect(controller.onSuccess()).toBe(750);

    expect(controller.currentSize).toBe(750);
  });
});
