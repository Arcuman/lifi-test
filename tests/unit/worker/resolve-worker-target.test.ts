import { describe, expect, test, vi } from "vitest";

import { resolveWorkerTarget } from "../../../src/app/bootstrap/resolve-worker-target";
import type {
  WorkerCycleService
} from "../../../src/app/worker/worker-cycle-service.types";
import type { WorkerTargetDefinition } from "../../../src/app/worker/worker-target.types";

describe("resolveWorkerTarget", () => {
  test("resolves a single worker target by module, event, and chain", async () => {
    const service: WorkerCycleService = {
      runOnce: vi.fn(async () => ({
        processedEvents: 0,
        processedBatches: 0,
        scannedToBlock: null
      }))
    };
    const createService = vi.fn(async () => service);
    const target = createTargetDefinition({
      moduleKey: "fee-events",
      eventKey: "fees-collected",
      createService
    });

    const resolved = await resolveWorkerTarget({
      definitions: [target],
      workerTarget: {
        moduleKey: "fee-events",
        eventKey: "fees-collected",
        chainKey: "polygon"
      },
      context: {
        env: {},
        logger: {} as never,
        workerConfig: {} as never,
        workerInstanceId: "worker-a"
      }
    });

    expect(resolved).toEqual({
      name: "fee-events:fees-collected:polygon",
      service
    });
    expect(createService).toHaveBeenCalledOnce();
  });

  test("throws a readable error when the target is not registered", async () => {
    await expect(
      resolveWorkerTarget({
        definitions: [],
        workerTarget: {
          moduleKey: "withdrawal-events",
          eventKey: "withdrawal-created",
          chainKey: "polygon"
        },
        context: {
          env: {},
          logger: {} as never,
          workerConfig: {} as never,
          workerInstanceId: "worker-a"
        }
      })
    ).rejects.toThrow(/withdrawal-events:withdrawal-created/i);
  });
});

const createTargetDefinition = (
  overrides: Partial<WorkerTargetDefinition>
): WorkerTargetDefinition => ({
  moduleKey: "fee-events",
  eventKey: "fees-collected",
  createService: async () => ({
    runOnce: async () => ({
      processedEvents: 0,
      processedBatches: 0,
      scannedToBlock: null
    })
  }),
  ...overrides
});
