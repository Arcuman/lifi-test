import { describe, expect, test } from "vitest";
import { ethers } from "ethers";

import feeCollectorAbi from "../../../src/modules/fee-events/infrastructure/abi/FeeCollector.abi.json";
import {
  InvalidCollectedEventError,
  createFeeCollectorInterface,
  parseFeesCollectedLog
} from "../../../src/modules/fee-events/infrastructure/blockchain/fee-collector-parser";

const contractAddress = "0xbd6c7b0d2f68c2b7805d88388319cfb6ecb50ea9";
const token = "0x0000000000000000000000000000000000000000";
const integrator = "0x1111111111111111111111111111111111111111";

describe("parseFeesCollectedLog", () => {
  const iface = new ethers.utils.Interface(feeCollectorAbi);

  test("parses a valid FeesCollected log", () => {
    const encoded = iface.encodeEventLog(iface.getEvent("FeesCollected"), [
      token,
      integrator,
      ethers.BigNumber.from("123"),
      ethers.BigNumber.from("456")
    ]);

    const parsed = parseFeesCollectedLog(
      {
        address: contractAddress,
        topics: encoded.topics,
        data: encoded.data,
        blockNumber: 78600001,
        blockHash: `0x${"1".repeat(64)}`,
        transactionHash: `0x${"2".repeat(64)}`,
        transactionIndex: 1,
        logIndex: 2
      },
      new Date("2026-03-12T10:00:00.000Z"),
      137
    );

    expect(parsed.token).toBe(token);
    expect(parsed.integrator).toBe(integrator);
    expect(parsed.integratorFee).toBe("123");
    expect(parsed.lifiFee).toBe("456");
  });

  test("accepts the zero address token for native fees", () => {
    const encoded = iface.encodeEventLog(iface.getEvent("FeesCollected"), [
      token,
      integrator,
      ethers.BigNumber.from("1"),
      ethers.BigNumber.from("2")
    ]);

    const parsed = parseFeesCollectedLog(
      {
        address: contractAddress,
        topics: encoded.topics,
        data: encoded.data,
        blockNumber: 78600001,
        blockHash: `0x${"3".repeat(64)}`,
        transactionHash: `0x${"4".repeat(64)}`,
        transactionIndex: 1,
        logIndex: 2
      },
      new Date("2026-03-12T10:00:00.000Z"),
      137
    );

    expect(parsed.token).toBe(token);
  });

  test("returns large fees as decimal strings", () => {
    const encoded = iface.encodeEventLog(iface.getEvent("FeesCollected"), [
      token,
      integrator,
      ethers.BigNumber.from("123456789012345678901234567890"),
      ethers.BigNumber.from("999999999999999999999999999999")
    ]);

    const parsed = parseFeesCollectedLog(
      {
        address: contractAddress,
        topics: encoded.topics,
        data: encoded.data,
        blockNumber: 78600001,
        blockHash: `0x${"5".repeat(64)}`,
        transactionHash: `0x${"6".repeat(64)}`,
        transactionIndex: 1,
        logIndex: 2
      },
      new Date("2026-03-12T10:00:00.000Z"),
      137
    );

    expect(parsed.integratorFee).toBe("123456789012345678901234567890");
    expect(parsed.lifiFee).toBe("999999999999999999999999999999");
  });

  test("uses the provided chain id instead of a polygon-only default", () => {
    const encoded = iface.encodeEventLog(iface.getEvent("FeesCollected"), [
      token,
      integrator,
      ethers.BigNumber.from("3"),
      ethers.BigNumber.from("4")
    ]);

    const parsed = parseFeesCollectedLog(
      {
        address: contractAddress,
        topics: encoded.topics,
        data: encoded.data,
        blockNumber: 78600001,
        blockHash: `0x${"9".repeat(64)}`,
        transactionHash: `0x${"a".repeat(64)}`,
        transactionIndex: 1,
        logIndex: 2
      },
      new Date("2026-03-12T10:00:00.000Z"),
      1
    );

    expect(parsed.chainId).toBe(1);
  });

  test("rejects non-target logs", () => {
    const otherInterface = new ethers.utils.Interface([
      "event OtherEvent(address indexed token)"
    ]);
    const encoded = otherInterface.encodeEventLog(
      otherInterface.getEvent("OtherEvent"),
      [token]
    );

    expect(() =>
      parseFeesCollectedLog(
        {
          address: contractAddress,
          topics: encoded.topics,
          data: encoded.data,
          blockNumber: 78600001,
          blockHash: `0x${"7".repeat(64)}`,
          transactionHash: `0x${"8".repeat(64)}`,
          transactionIndex: 1,
          logIndex: 2
        },
        new Date("2026-03-12T10:00:00.000Z"),
        137
      )
    ).toThrow(InvalidCollectedEventError);
  });

  test("creates an ethers interface from the checked-in ABI", () => {
    expect(createFeeCollectorInterface()).toBeInstanceOf(
      ethers.utils.Interface
    );
  });
});
