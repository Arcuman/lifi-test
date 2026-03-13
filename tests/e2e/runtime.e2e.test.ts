import os from "node:os";

import { afterAll, describe, expect, test } from "vitest";
import { GenericContainer, Wait } from "testcontainers";
import { MongoMemoryReplSet, MongoMemoryServer } from "mongodb-memory-server";

const workspacePath = "/Users/arcuman/Education/homeworks/lifi";
const baseEnv = {
  LOG_LEVEL: "info",
  PORT: "3000",
  CHAIN_KEYS: "polygon",
  CHAIN_POLYGON_RPC_URLS: "https://polygon-rpc.com",
  CHAIN_POLYGON_START_BLOCK: "78600000",
  CHAIN_POLYGON_FEE_COLLECTOR_ADDRESS:
    "0xbD6C7B0d2f68c2b7805d88388319cfB6EcB50eA9",
  WORKER_CHAIN_KEY: "polygon",
  WORKER_MODULE: "fee-events",
  WORKER_EVENT: "fees-collected",
  WORKER_POLL_INTERVAL_MS: "250",
  WORKER_LEASE_DURATION_MS: "30000",
  WORKER_LEASE_RENEW_INTERVAL_MS: "5000",
  WORKER_INITIAL_BATCH_SIZE: "5000",
  WORKER_MIN_BATCH_SIZE: "100",
  WORKER_MAX_BATCH_SIZE: "10000",
  WORKER_CONFIRMATIONS_FALLBACK: "64",
  WORKER_REORG_LOOKBACK: "32",
  WORKER_STARTUP_TIMEOUT_MS: "5000",
  FEE_EVENTS_GATEWAY_MODE: "fixture",
  FIXTURE_SAFE_HEAD: "78600000",
  FIXTURE_EVENTS_FILE: "/app/tests/fixtures/fee-events.json"
};

describe("runtime e2e", () => {
  const startedContainers: Array<
    Awaited<ReturnType<GenericContainer["start"]>>
  > = [];
  const startedReplicaSets: MongoMemoryReplSet[] = [];
  const startedStandaloneMongo: MongoMemoryServer[] = [];

  afterAll(async () => {
    for (const container of startedContainers.reverse()) {
      await container.stop().catch(() => undefined);
    }
    for (const replset of startedReplicaSets.reverse()) {
      await replset.stop().catch(() => undefined);
    }
    for (const mongo of startedStandaloneMongo.reverse()) {
      await mongo.stop().catch(() => undefined);
    }
  });

  test("fails fast when transaction support is unavailable", async () => {
    const mongo = await MongoMemoryServer.create({
      instance: { ip: "0.0.0.0" }
    });
    startedStandaloneMongo.push(mongo);

    await expect(
      startNodeContainer({
        env: {
          ...baseEnv,
          MONGODB_URI: toContainerMongoUri(mongo.getUri("lifi"), hostIp)
        },
        command: ["node", "dist/src/app/api/main.js"],
        exposeApiPort: true,
        waitForReady: true
      })
    ).rejects.toThrow(/transaction-ready|startup failed|Container exited/i);
  });

  test("indexes through a dedicated single-chain worker and serves data through the API", async () => {
    const replset = await startReplicaSet();
    startedReplicaSets.push(replset);
    const mongoUri = toContainerMongoUri(replset.getUri("lifi"), hostIp);

    const api = await startNodeContainer({
      env: {
        ...baseEnv,
        MONGODB_URI: mongoUri
      },
      command: ["node", "dist/src/app/api/main.js"],
      exposeApiPort: true,
      waitForReady: true
    });
    startedContainers.push(api);

    const worker = await startNodeContainer({
      env: {
        ...baseEnv,
        MONGODB_URI: mongoUri
      },
      command: ["node", "dist/src/app/worker/main.js"]
    });
    startedContainers.push(worker);

    const response = await waitForFees(
      `http://${api.getHost()}:${api.getMappedPort(3000)}`
    );

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]?.integrator).toBe(
      "0x1111111111111111111111111111111111111111"
    );
  });

  test("indexes through the dev-all convenience runtime for one selected chain", async () => {
    const replset = await startReplicaSet();
    startedReplicaSets.push(replset);
    const container = await startNodeContainer({
      env: {
        ...baseEnv,
        MONGODB_URI: toContainerMongoUri(replset.getUri("lifi"), hostIp)
      },
      command: ["node", "dist/src/app/bootstrap/dev-all.js"],
      exposeApiPort: true,
      waitForReady: true
    });
    startedContainers.push(container);

    const response = await waitForFees(
      `http://${container.getHost()}:${container.getMappedPort(3000)}`
    );

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]?.integrator).toBe(
      "0x1111111111111111111111111111111111111111"
    );
  });
});

const startReplicaSet = async (): Promise<MongoMemoryReplSet> => {
  const replset = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: "wiredTiger", ip: "0.0.0.0" }
  });
  await reconfigureReplicaSetHost(replset, hostIp);
  return replset;
};

interface StartNodeContainerOptions {
  env: Record<string, string>;
  command: string[];
  exposeApiPort?: boolean;
  waitForReady?: boolean;
}

const startNodeContainer = async ({
  env,
  command,
  exposeApiPort = false,
  waitForReady = false
}: StartNodeContainerOptions): Promise<
  Awaited<ReturnType<GenericContainer["start"]>>
> => {
  let container = new GenericContainer("node:24.11.0-alpine")
    .withWorkingDir("/app")
    .withBindMounts([{ source: workspacePath, target: "/app", mode: "rw" }])
    .withEnvironment(env)
    .withStartupTimeout(60_000)
    .withCommand(command);

  if (exposeApiPort) {
    container = container.withExposedPorts(3000);
  }

  if (waitForReady) {
    container = container.withWaitStrategy(
      Wait.forHttp("/health/ready", 3000, {
        abortOnContainerExit: true
      }).forStatusCode(200)
    );
  }

  return container.start();
};

const toContainerMongoUri = (uri: string, targetHost: string): string =>
  uri.replaceAll("127.0.0.1", targetHost).replaceAll("localhost", targetHost);

const getHostIpv4 = (): string => {
  const entries = Object.values(os.networkInterfaces())
    .flat()
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
  const ipv4 = entries.find(
    (entry) => entry.family === "IPv4" && entry.internal === false
  );

  if (!ipv4) {
    throw new Error(
      "Could not determine a host IPv4 address for container E2E tests"
    );
  }

  return ipv4.address;
};

const reconfigureReplicaSetHost = async (
  replset: MongoMemoryReplSet,
  targetHost: string
): Promise<void> => {
  const server = replset.servers[0];
  const port = server?.instanceInfo?.port;

  if (!port) {
    throw new Error("Replica set server port is not available");
  }

  const { createConnection } = await import("mongoose");
  const connection = await createConnection(
    replset.getUri("admin")
  ).asPromise();

  try {
    const admin = connection.db?.admin();
    if (!admin) {
      throw new Error("Replica set admin connection is not ready");
    }

    const config = (await admin.command({ replSetGetConfig: 1 })) as {
      config: {
        version: number;
        members: Array<{ host: string }>;
      };
    };

    config.config.members[0]!.host = `${targetHost}:${port}`;
    config.config.version += 1;

    await admin.command({
      replSetReconfig: config.config,
      force: true
    });
  } finally {
    await connection.close();
  }
};

const waitForFees = async (
  baseUrl: string,
  attempts = 30
): Promise<{
  status: number;
  body: {
    data: Array<{ integrator: string }>;
  };
}> => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const response = await fetch(
      `${baseUrl}/v1/fees?integrator=0x1111111111111111111111111111111111111111`
    );
    const body = (await response.json()) as {
      data: Array<{ integrator: string }>;
    };

    if (response.ok && body.data.length > 0) {
      return { status: response.status, body };
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error("Indexed fees were not served before timeout");
};

const hostIp = getHostIpv4();
