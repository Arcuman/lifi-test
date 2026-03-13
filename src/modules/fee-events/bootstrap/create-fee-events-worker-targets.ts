import { IndexerService } from "../application/services/indexer/indexer-service";
import type { WorkerTargetDefinition } from "../../../app/worker/worker-target.types";
import { EthersFeesCollectedGateway } from "../infrastructure/blockchain/ethers-fees-collected-gateway";
import { parseFeeEventsWorkerConfig } from "../infrastructure/config/parse-fee-events-worker-config";
import { JsonFixtureFeesCollectedGateway } from "../infrastructure/dev/json-fixture-fees-collected-gateway";
import { MongoTransactionManager } from "../infrastructure/persistence/transaction-manager";
import { MongoFeeEventRepository } from "../infrastructure/persistence/repositories/fee-event-repository";
import { MongoSyncStateRepository } from "../infrastructure/persistence/repositories/sync-state-repository";

export const createFeeEventsWorkerTargets = (): WorkerTargetDefinition[] => [
  {
    moduleKey: "fee-events",
    eventKey: "fees-collected",
    createService: async ({
      env,
      logger,
      workerConfig,
      workerInstanceId
    }) => {
      const feeEventsConfig = parseFeeEventsWorkerConfig(env, workerConfig.chain);
      const gateway = await createFeesCollectedGateway(feeEventsConfig);

      return new IndexerService({
        workerInstanceId,
        indexerConfig: feeEventsConfig.indexer,
        gateway,
        feeEventRepository: new MongoFeeEventRepository(),
        syncStateRepository: new MongoSyncStateRepository(),
        transactionManager: new MongoTransactionManager(),
        logger,
        leaseDurationMs: workerConfig.worker.leaseDurationMs,
        leaseRenewIntervalMs: workerConfig.worker.leaseRenewIntervalMs
      });
    }
  }
];

const createFeesCollectedGateway = async (
  config: ReturnType<typeof parseFeeEventsWorkerConfig>
) => {
  if (config.gateway.mode === "fixture") {
    return JsonFixtureFeesCollectedGateway.fromFile(
      config.gateway.fixture?.eventsFile ?? "./tests/fixtures/fee-events.json",
      config.gateway.fixture?.safeHead ?? config.indexer.startBlock
    );
  }

  return new EthersFeesCollectedGateway(config.indexer);
};
