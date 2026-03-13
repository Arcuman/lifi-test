import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test
} from "vitest";
import request, { type Response } from "supertest";

import { createHttpApp } from "../../../src/app/bootstrap/http/create-http-app";
import {
  closeMongoConnection,
  connectMongo
} from "../../../src/modules/fee-events/infrastructure/persistence/mongo-connection";
import { createFeeEventsRouter } from "../../../src/modules/fee-events/infrastructure/http/create-fee-events-router";
import type { FeeEventResponse } from "../../../src/modules/fee-events/infrastructure/http/present-fee-event";
import { ensureMongoIndexes } from "../../../src/modules/fee-events/infrastructure/persistence/mongo-indexes";
import { MongoTransactionManager } from "../../../src/modules/fee-events/infrastructure/persistence/transaction-manager";
import { MongoFeeEventRepository } from "../../../src/modules/fee-events/infrastructure/persistence/repositories/fee-event-repository";
import { ReadinessState } from "../../../src/shared/readiness/readiness-state";
import { createLogger } from "../../../src/shared/logger/create-logger";
import { getFeeEventModel } from "../../../src/modules/fee-events/infrastructure/persistence/models/fee-event.model";
import { createMongoMemoryReplicaSet } from "../../helpers/mongo-replset";
import { makeSampleFeeEvent } from "../../helpers/sample-fee-event";
import { persistFeeEvents } from "../../helpers/persist-fee-events";

let replset: Awaited<ReturnType<typeof createMongoMemoryReplicaSet>>;
let repository: MongoFeeEventRepository;
let txManager: MongoTransactionManager;
let readiness: ReadinessState;

describe("API", () => {
  beforeAll(async () => {
    replset = await createMongoMemoryReplicaSet();
    await connectMongo(replset.getUri("api"));
    await ensureMongoIndexes();
    repository = new MongoFeeEventRepository();
    txManager = new MongoTransactionManager();
    readiness = new ReadinessState();
    readiness.markConfigValidated();
    readiness.markMongoReachable();
    readiness.markMongoTransactionReady();
    readiness.markIndexesReady();
  });

  beforeEach(async () => {
    await getFeeEventModel().deleteMany({});
  });

  afterAll(async () => {
    await closeMongoConnection();
    await replset.stop();
  });

  test("returns 400 when integrator is missing", async () => {
    const app = createApp();
    const response = await request(app).get("/v1/fees");
    expect(response.status).toBe(400);
  });

  test("returns 400 when integrator is invalid", async () => {
    const app = createApp();
    const response = await request(app)
      .get("/v1/fees")
      .query({ integrator: "abc" });
    expect(response.status).toBe(400);
    expect(asProblemDetails(response)).toMatchObject({
      type: "validation_error",
      status: 400
    });
  });

  test("returns matching fee events", async () => {
    await persistFeeEvents(repository, txManager, [makeSampleFeeEvent()]);

    const app = createApp();
    const response = await request(app)
      .get("/v1/fees")
      .query({ integrator: "0x1111111111111111111111111111111111111111" });
    const body = asFeeListResponse(response);

    expect(response.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(typeof body.data[0]?.id).toBe("string");
    expect(body.data[0]?.chainId).toBe(137);
    expect(body.data[0]?.eventName).toBe("FeesCollected");
    expect(body.data[0]).not.toHaveProperty("_id");
  });

  test("filters by chainId", async () => {
    await persistFeeEvents(repository, txManager, [
      makeSampleFeeEvent({ chainId: 137 }),
      makeSampleFeeEvent({
        chainId: 42161,
        blockHash: `0x${"1".repeat(63)}f`,
        transactionHash: `0x${"2".repeat(63)}f`
      })
    ]);

    const app = createApp();
    const response = await request(app).get("/v1/fees").query({
      integrator: "0x1111111111111111111111111111111111111111",
      chainId: "137"
    });
    const body = asFeeListResponse(response);

    expect(response.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0]?.chainId).toBe(137);
  });

  test("filters by block range", async () => {
    await persistFeeEvents(repository, txManager, [
      makeSampleFeeEvent({ blockNumber: 100 }),
      makeSampleFeeEvent({
        blockNumber: 200,
        blockHash: `0x${"3".repeat(63)}f`,
        transactionHash: `0x${"4".repeat(63)}f`
      })
    ]);

    const app = createApp();
    const response = await request(app).get("/v1/fees").query({
      integrator: "0x1111111111111111111111111111111111111111",
      fromBlock: "150",
      toBlock: "250"
    });
    const body = asFeeListResponse(response);

    expect(response.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0]?.blockNumber).toBe(200);
  });

  test("supports pagination and returns an opaque cursor", async () => {
    await persistFeeEvents(repository, txManager, [
      makeSampleFeeEvent({ blockNumber: 102 }),
      makeSampleFeeEvent({
        blockNumber: 101,
        blockHash: `0x${"5".repeat(63)}f`,
        transactionHash: `0x${"6".repeat(63)}f`
      }),
      makeSampleFeeEvent({
        blockNumber: 100,
        blockHash: `0x${"7".repeat(63)}f`,
        transactionHash: `0x${"8".repeat(63)}f`
      })
    ]);

    const app = createApp();
    const page1 = await request(app).get("/v1/fees").query({
      integrator: "0x1111111111111111111111111111111111111111",
      limit: "2"
    });
    const firstPage = asFeeListResponse(page1);

    expect(page1.status).toBe(200);
    expect(firstPage.page.nextCursor).toBeTruthy();

    const page2 = await request(app).get("/v1/fees").query({
      integrator: "0x1111111111111111111111111111111111111111",
      limit: "2",
      cursor: firstPage.page.nextCursor ?? undefined
    });
    const secondPage = asFeeListResponse(page2);

    expect(page2.status).toBe(200);
    expect(secondPage.data).toHaveLength(1);
  });

  test("returns fees as strings", async () => {
    await persistFeeEvents(repository, txManager, [
      makeSampleFeeEvent({
        integratorFee: "123456789012345678901234567890",
        lifiFee: "999999999999999999999999999999"
      })
    ]);

    const app = createApp();
    const response = await request(app)
      .get("/v1/fees")
      .query({ integrator: "0x1111111111111111111111111111111111111111" });
    const body = asFeeListResponse(response);

    expect(typeof body.data[0]?.integratorFee).toBe("string");
    expect(typeof body.data[0]?.lifiFee).toBe("string");
  });

  test("returns an empty data array when no events exist", async () => {
    const app = createApp();
    const response = await request(app)
      .get("/v1/fees")
      .query({ integrator: "0x1111111111111111111111111111111111111111" });
    const body = asFeeListResponse(response);

    expect(response.status).toBe(200);
    expect(body.data).toEqual([]);
  });

  test("returns 400 for malformed cursors", async () => {
    const app = createApp();
    const response = await request(app).get("/v1/fees").query({
      integrator: "0x1111111111111111111111111111111111111111",
      cursor: "***"
    });
    const body = asProblemDetails(response);

    expect(response.status).toBe(400);
    expect(body.type).toBe("invalid_cursor");
  });

  test("returns 400 when the cursor shape is valid but the cursor payload is tampered", async () => {
    const app = createApp();
    const cursor = Buffer.from(
      JSON.stringify({
        blockNumber: 1,
        logIndex: 0,
        chainId: 137,
        id: "x"
      }),
      "utf8"
    ).toString("base64url");

    const response = await request(app).get("/v1/fees").query({
      integrator: "0x1111111111111111111111111111111111111111",
      cursor
    });
    const body = asProblemDetails(response);

    expect(response.status).toBe(400);
    expect(body.type).toBe("invalid_cursor");
  });

  test("returns 400 when fromBlock is greater than toBlock", async () => {
    const app = createApp();
    const response = await request(app).get("/v1/fees").query({
      integrator: "0x1111111111111111111111111111111111111111",
      fromBlock: "200",
      toBlock: "100"
    });
    const body = asProblemDetails(response);

    expect(response.status).toBe(400);
    expect(body.type).toBe("validation_error");
  });

  test("returns cross-chain results when chainId is omitted", async () => {
    await persistFeeEvents(repository, txManager, [
      makeSampleFeeEvent({ chainId: 137, blockNumber: 100 }),
      makeSampleFeeEvent({
        chainId: 42161,
        blockNumber: 101,
        blockHash: `0x${"9".repeat(63)}f`,
        transactionHash: `0x${"a".repeat(63)}f`
      })
    ]);

    const app = createApp();
    const response = await request(app)
      .get("/v1/fees")
      .query({ integrator: "0x1111111111111111111111111111111111111111" });
    const body = asFeeListResponse(response);

    expect(response.status).toBe(200);
    expect(body.data).toHaveLength(2);
  });

  test("hides orphaned rows from API responses", async () => {
    const original = makeSampleFeeEvent({ blockNumber: 100 });
    const replacement = makeSampleFeeEvent({
      blockNumber: 100,
      blockHash: `0x${"b".repeat(63)}f`,
      transactionHash: `0x${"c".repeat(63)}f`
    });

    await persistFeeEvents(repository, txManager, [original]);
    await persistFeeEvents(repository, txManager, [replacement]);

    const app = createApp();
    const response = await request(app)
      .get("/v1/fees")
      .query({ integrator: original.integrator });
    const body = asFeeListResponse(response);

    expect(response.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0]?.blockHash).toBe(replacement.blockHash);
  });

  test("returns 200 for readiness when startup requirements are satisfied", async () => {
    const app = createApp();
    const response = await request(app).get("/health/ready");
    expect(response.status).toBe(200);
  });

  test("returns 503 when a dynamic readiness check fails after startup", async () => {
    readiness.registerCheck(async () => false);

    const app = createApp();
    const response = await request(app).get("/health/ready");
    const body = asProblemDetails(response);

    expect(response.status).toBe(503);
    expect(body.type).toBe("service_unavailable");
  });

  test("returns standard validation error shape", async () => {
    const app = createApp();
    const response = await request(app)
      .get("/v1/fees")
      .query({ integrator: "abc" });
    const body = asProblemDetails(response);

    expect(body.type).toBe("validation_error");
    expect(typeof body.title).toBe("string");
    expect(body.status).toBe(400);
    expect(typeof body.detail).toBe("string");
    expect(typeof body.traceId).toBe("string");
  });

  test("does not leak internal errors", async () => {
    const app = createHttpApp({
      logger: createLogger(),
      readiness,
      routers: [
        createFeeEventsRouter({
          feeQueryService: {
            getFeesByIntegrator: async () => {
              throw new Error("internal details");
            }
          }
        })
      ]
    });

    const response = await request(app)
      .get("/v1/fees")
      .query({ integrator: "0x1111111111111111111111111111111111111111" });
    const body = asProblemDetails(response);

    expect(response.status).toBe(500);
    expect(body.type).toBe("internal_error");
    expect(body.detail).not.toMatch(/internal details/i);
  });
});

const createApp = () =>
  createHttpApp({
    logger: createLogger(),
    readiness,
    routers: [
      createFeeEventsRouter({
        feeQueryService: repository
      })
    ]
  });

interface FeeListResponseBody {
  data: FeeEventResponse[];
  page: {
    nextCursor: string | null;
  };
}

interface ProblemDetailsBody {
  type: string;
  title: string;
  status: number;
  detail: string;
  traceId?: string;
}

const asFeeListResponse = (response: Response): FeeListResponseBody =>
  response.body as FeeListResponseBody;

const asProblemDetails = (response: Response): ProblemDetailsBody =>
  response.body as ProblemDetailsBody;
