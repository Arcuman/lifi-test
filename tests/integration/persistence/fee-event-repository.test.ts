import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test
} from "vitest";

import { decodeCursor } from "../../../src/modules/fee-events/application/cursor-codec";
import {
  closeMongoConnection,
  connectMongo
} from "../../../src/modules/fee-events/infrastructure/persistence/mongo-connection";
import { ensureMongoIndexes } from "../../../src/modules/fee-events/infrastructure/persistence/mongo-indexes";
import { MongoTransactionManager } from "../../../src/modules/fee-events/infrastructure/persistence/transaction-manager";
import { MongoFeeEventRepository } from "../../../src/modules/fee-events/infrastructure/persistence/repositories/fee-event-repository";
import { getFeeEventModel } from "../../../src/modules/fee-events/infrastructure/persistence/models/fee-event.model";
import { createMongoMemoryReplicaSet } from "../../helpers/mongo-replset";
import { makeSampleFeeEvent } from "../../helpers/sample-fee-event";
import {
  persistFeeEvents,
  replaceFeeEventRange
} from "../../helpers/persist-fee-events";

let replset: Awaited<ReturnType<typeof createMongoMemoryReplicaSet>>;
let repository: MongoFeeEventRepository;
let txManager: MongoTransactionManager;

describe("MongoFeeEventRepository", () => {
  beforeAll(async () => {
    replset = await createMongoMemoryReplicaSet();
    await connectMongo(replset.getUri("fees"));
    await ensureMongoIndexes();
    repository = new MongoFeeEventRepository();
    txManager = new MongoTransactionManager();
  });

  beforeEach(async () => {
    await getFeeEventModel().deleteMany({});
  });

  afterAll(async () => {
    await closeMongoConnection();
    await replset.stop();
  });

  test("enforces canonical uniqueness", async () => {
    const event = makeSampleFeeEvent();

    await replaceFeeEventRange(repository, txManager, {
      chainId: event.chainId,
      contractAddress: event.contractAddress,
      eventName: event.eventName,
      fromBlock: event.blockNumber,
      toBlock: event.blockNumber,
      events: [event, event]
    });

    expect(await getFeeEventModel().countDocuments({})).toBe(1);
  });

  test("is idempotent when a lookback replay writes the same event again", async () => {
    const event = makeSampleFeeEvent();

    await replaceFeeEventRange(repository, txManager, {
      chainId: event.chainId,
      contractAddress: event.contractAddress,
      eventName: event.eventName,
      fromBlock: event.blockNumber,
      toBlock: event.blockNumber,
      events: [event]
    });
    await replaceFeeEventRange(repository, txManager, {
      chainId: event.chainId,
      contractAddress: event.contractAddress,
      eventName: event.eventName,
      fromBlock: event.blockNumber,
      toBlock: event.blockNumber,
      events: [event]
    });

    expect(await getFeeEventModel().countDocuments({})).toBe(1);
  });

  test("stores large integer amounts as exact strings", async () => {
    const event = makeSampleFeeEvent({
      integratorFee: "123456789012345678901234567890",
      lifiFee: "999999999999999999999999999999"
    });

    await replaceFeeEventRange(repository, txManager, {
      chainId: event.chainId,
      contractAddress: event.contractAddress,
      eventName: event.eventName,
      fromBlock: event.blockNumber,
      toBlock: event.blockNumber,
      events: [event]
    });

    const stored = await getFeeEventModel().findOne().lean();
    expect(stored?.integratorFee).toBe(event.integratorFee);
    expect(stored?.lifiFee).toBe(event.lifiFee);
  });

  test("returns deterministically sorted query results", async () => {
    const older = makeSampleFeeEvent({ blockNumber: 100, logIndex: 5 });
    const newer = makeSampleFeeEvent({
      blockNumber: 101,
      logIndex: 1,
      transactionHash: `0x${"c".repeat(63)}3`,
      blockHash: `0x${"d".repeat(63)}4`
    });

    await persistFeeEvents(repository, txManager, [older, newer]);

    const result = await repository.getFeesByIntegrator({
      integrator: older.integrator,
      limit: 10
    });

    expect(result.items.map((item) => item.blockNumber)).toEqual([101, 100]);
  });

  test("supports cursor pagination", async () => {
    const newest = makeSampleFeeEvent({
      blockNumber: 103,
      logIndex: 3,
      transactionHash: `0x${"e".repeat(63)}5`,
      blockHash: `0x${"f".repeat(63)}6`
    });
    const newer = makeSampleFeeEvent({
      blockNumber: 102,
      logIndex: 2,
      transactionHash: `0x${"1".repeat(63)}7`,
      blockHash: `0x${"2".repeat(63)}8`
    });
    const older = makeSampleFeeEvent({
      blockNumber: 101,
      logIndex: 1,
      transactionHash: `0x${"3".repeat(63)}9`,
      blockHash: `0x${"4".repeat(63)}a`
    });
    const oldest = makeSampleFeeEvent({
      blockNumber: 100,
      logIndex: 0,
      transactionHash: `0x${"5".repeat(63)}b`,
      blockHash: `0x${"6".repeat(63)}c`
    });

    await persistFeeEvents(repository, txManager, [
      older,
      oldest,
      newest,
      newer
    ]);

    const expectedOrder = [newest, newer, older, oldest].map(toEventKey);
    const pages: string[][] = [];
    const traversed: string[] = [];
    let cursor: string | undefined;

    while (true) {
      const page = await repository.getFeesByIntegrator({
        integrator: newest.integrator,
        limit: 2,
        ...(cursor ? { cursor } : {})
      });
      const pageKeys = page.items.map(toFeeListItemKey);

      pages.push(pageKeys);
      traversed.push(...pageKeys);

      if (!page.nextCursor) {
        expect(page.items).toHaveLength(2);
        break;
      }

      expect(decodeCursor(page.nextCursor)).toBeTruthy();
      cursor = page.nextCursor;
    }

    expect(pages).toEqual([
      expectedOrder.slice(0, 2),
      expectedOrder.slice(2)
    ]);
    expect(traversed).toEqual(expectedOrder);
    expect(new Set(traversed).size).toBe(expectedOrder.length);
  });

  test("supports merged cross-chain reads when chainId is omitted", async () => {
    const polygon = makeSampleFeeEvent({ chainId: 137, blockNumber: 110 });
    const arbitrum = makeSampleFeeEvent({
      chainId: 42161,
      blockNumber: 111,
      blockHash: `0x${"5".repeat(63)}b`,
      transactionHash: `0x${"6".repeat(63)}c`
    });

    await persistFeeEvents(repository, txManager, [polygon, arbitrum]);

    const result = await repository.getFeesByIntegrator({
      integrator: polygon.integrator,
      limit: 10
    });

    expect(result.items.map((item) => item.chainId)).toEqual([42161, 137]);
  });

  test("filters by chainId when requested", async () => {
    const polygon = makeSampleFeeEvent({ chainId: 137, blockNumber: 110 });
    const arbitrum = makeSampleFeeEvent({
      chainId: 42161,
      blockNumber: 111,
      blockHash: `0x${"7".repeat(63)}d`,
      transactionHash: `0x${"8".repeat(63)}e`
    });

    await persistFeeEvents(repository, txManager, [polygon, arbitrum]);

    const result = await repository.getFeesByIntegrator({
      integrator: polygon.integrator,
      chainId: 137,
      limit: 10
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.chainId).toBe(137);
  });

  test("marks missing rows in a replaced range as orphaned", async () => {
    const original = makeSampleFeeEvent({ blockNumber: 78600000 });

    await replaceFeeEventRange(repository, txManager, {
      chainId: original.chainId,
      contractAddress: original.contractAddress,
      eventName: original.eventName,
      fromBlock: original.blockNumber,
      toBlock: original.blockNumber,
      events: [original]
    });

    await replaceFeeEventRange(repository, txManager, {
      chainId: original.chainId,
      contractAddress: original.contractAddress,
      eventName: original.eventName,
      fromBlock: original.blockNumber,
      toBlock: original.blockNumber,
      events: []
    });

    const stored = await getFeeEventModel().findOne().lean();
    expect(stored?.orphaned).toBe(true);
  });

  test("hides orphaned rows from canonical reads", async () => {
    const canonical = makeSampleFeeEvent({ blockNumber: 78600000 });
    const reorgReplacement = makeSampleFeeEvent({
      blockNumber: 78600000,
      blockHash: `0x${"b".repeat(63)}1`,
      transactionHash: `0x${"c".repeat(63)}2`
    });

    await replaceFeeEventRange(repository, txManager, {
      chainId: canonical.chainId,
      contractAddress: canonical.contractAddress,
      eventName: canonical.eventName,
      fromBlock: canonical.blockNumber,
      toBlock: canonical.blockNumber,
      events: [canonical]
    });

    await replaceFeeEventRange(repository, txManager, {
      chainId: canonical.chainId,
      contractAddress: canonical.contractAddress,
      eventName: canonical.eventName,
      fromBlock: canonical.blockNumber,
      toBlock: canonical.blockNumber,
      events: [reorgReplacement]
    });

    const result = await repository.getFeesByIntegrator({
      integrator: canonical.integrator,
      limit: 10
    });
    const stored = await getFeeEventModel()
      .find({})
      .sort({ orphaned: 1, blockHash: 1 })
      .lean();

    expect(stored).toHaveLength(2);
    expect(stored.filter((item) => item.orphaned)).toHaveLength(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.blockHash).toBe(reorgReplacement.blockHash);
  });
});

const toEventKey = (
  event: Pick<
    ReturnType<typeof makeSampleFeeEvent>,
    "chainId" | "blockNumber" | "logIndex" | "blockHash"
  >
): string =>
  [event.chainId, event.blockNumber, event.logIndex, event.blockHash].join(":");

const toFeeListItemKey = (
  item: Awaited<
    ReturnType<MongoFeeEventRepository["getFeesByIntegrator"]>
  >["items"][number]
): string =>
  [item.chainId, item.blockNumber, item.logIndex, item.blockHash].join(":");
