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
    const base = makeSampleFeeEvent();
    const first = makeSampleFeeEvent({
      blockNumber: 102,
      logIndex: 3,
      transactionHash: `0x${"e".repeat(63)}5`,
      blockHash: `0x${"f".repeat(63)}6`
    });
    const second = makeSampleFeeEvent({
      blockNumber: 101,
      logIndex: 2,
      transactionHash: `0x${"1".repeat(63)}7`,
      blockHash: `0x${"2".repeat(63)}8`
    });
    const third = makeSampleFeeEvent({
      blockNumber: 100,
      logIndex: 1,
      transactionHash: `0x${"3".repeat(63)}9`,
      blockHash: `0x${"4".repeat(63)}a`
    });

    await persistFeeEvents(repository, txManager, [base, first, second, third]);

    const page1 = await repository.getFeesByIntegrator({
      integrator: base.integrator,
      limit: 2
    });

    expect(page1.items).toHaveLength(2);
    expect(page1.nextCursor).toBeTruthy();

    const page2 = await repository.getFeesByIntegrator(
      page1.nextCursor
        ? {
            integrator: base.integrator,
            limit: 2,
            cursor: page1.nextCursor
          }
        : {
            integrator: base.integrator,
            limit: 2
          }
    );

    expect(page2.items).toHaveLength(2);
    expect(decodeCursor(page1.nextCursor ?? "")).toBeTruthy();
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
