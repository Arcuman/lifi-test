import { describe, expect, test } from "vitest";

import { createWorkerInstanceId } from "../../../src/app/worker/create-worker-instance-id";

describe("createWorkerInstanceId", () => {
  test("builds globally unique identifiers for worker processes", () => {
    const first = createWorkerInstanceId();
    const second = createWorkerInstanceId();

    expect(first).not.toBe(second);
    expect(first).toContain(String(process.pid));
    expect(second).toContain(String(process.pid));
  });
});
