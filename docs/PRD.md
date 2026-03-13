# PRD: FeeCollector Event Indexing Service

## 1. Overview

This project provides a production-oriented service that indexes `FeesCollected` events emitted by LI.FI's `FeeCollector` smart contract, stores normalized events in MongoDB via Typegoose, and exposes collected fee history by `integrator`.

The initial runtime scope covers Polygon only, but the design must be extensible to additional EVM chains without structural changes. The service is intended to run in Docker by default.

## 2. Problem Statement

The `FeeCollector` contract emits `FeesCollected` whenever fees are collected for a LI.FI transaction. Those events are currently available on-chain, but not persisted in an application-owned datastore optimized for querying, pagination, filtering, and downstream analytics.

We need a service that can:

- backfill historical events starting from block `78600000`
- continue ingesting newly emitted events over time
- avoid full rescans
- recover safely after restarts or partial failures
- provide query access by `integrator`

## 3. Goals

- Reliably ingest `FeesCollected` events from Polygon `FeeCollector`.
- Persist canonical event data and operational sync state in MongoDB.
- Make ingestion resumable and idempotent.
- Minimize redundant block scanning while still remaining safe against short reorgs and boundary failures.
- Provide a simple REST API to query events by `integrator`.
- Keep the architecture ready for multi-chain support.

## 4. Non-Goals

- Computing current withdrawable balances.
- Indexing `FeesWithdrawn` or `LiFiFeesWithdrawn` in the first iteration.
- Token metadata enrichment (`symbol`, `decimals`, fiat valuation) in the ingestion path.
- Real-time websocket subscriptions.
- General-purpose blockchain indexing beyond the required event.

## 5. Users and Use Cases

### Primary users

- Internal LI.FI backend services
- Internal analytics or finance workflows
- Future partner-facing APIs

### Primary use cases

- Query all collected fee events for a given integrator.
- Backfill and continuously sync events for a supported chain.
- Inspect sync progress and operational health.

## 6. Product Requirements

### Functional requirements

1. The system must index `FeesCollected` events for Polygon.
2. The system must start ingesting from block `78600000`.
3. The system must be restart-safe and continue from persisted progress.
4. The system must avoid full historical rescans on every run.
5. The system must tolerate short chain reorganizations by rescanning a bounded lookback window.
6. The system must write events idempotently to MongoDB using Typegoose models.
7. The system must store enough metadata to audit and investigate indexed events.
8. The system should expose `GET /fees` filtered by `integrator`.
9. The system should support future addition of more EVM chains via configuration.
10. The system must ship with Docker as the default local and deployment runtime.
11. The default runtime must provide MongoDB transaction support for atomic event persistence and cursor advancement.

### Non-functional requirements

- Correctness over raw throughput
- Idempotent writes
- Reorg-aware ingestion
- Observability through logs, health signals, and metrics
- Graceful degradation when RPC providers fail or rate-limit
- Clear operational documentation
- Docker-first operability
- Transactional persistence in the default runtime path

## 7. Key Product Decisions

### 7.1 Indexer service instead of a periodic script

The solution is designed as a small indexing service rather than a cron-only script. This provides stronger guarantees around:

- resumability
- idempotency
- operational visibility
- future multi-chain expansion

### 7.2 Bounded rescan instead of strict "never re-read a block"

The acceptance criterion "should not scan the same blocks again" is interpreted as "must not perform wasteful full rescans." The service intentionally rescans a small configurable lookback window on every sync cycle to protect against:

- short reorgs
- partial failures between event persistence and cursor update
- edge cases at batch boundaries

### 7.3 Canonical raw data first

The ingestion layer stores raw, canonical blockchain data first. Token enrichment and balance-like derivations are explicitly deferred to follow-up work.

### 7.4 `FeesCollected` is not a balance API

The indexed dataset represents fee collection events, not current balances or withdrawal state. Any future balance endpoint would require additional event indexing or on-chain state reads.

## 8. Release Scope

### Current release

- Polygon chain support
- `FeesCollected` event ingestion
- MongoDB persistence with Typegoose
- cursor-based sync state
- idempotent upserts
- REST query endpoint by `integrator`
- Dockerized runtime as the default way to run the service
- MongoDB transactions available by default via replica-set deployment

### Planned hardening and next versions

- multi-chain registry
- multiple RPC endpoints with fallback
- explicit block tracking for stronger reorg handling
- metrics endpoint
- leader election / lease-based worker ownership
- horizontal scaling by indexer partition

## 9. High-Level Solution

The system consists of four logical components:

1. `ChainConfigRegistry`
   Stores per-chain runtime configuration such as RPC URLs, contract address, start block, lookback, batch size, and polling interval.
2. `IndexerWorker`
   Reads the safe block head, scans event logs in batches, parses events, persists them, and advances sync state.
3. `PersistenceLayer`
   Stores normalized fee events and sync progress in MongoDB via Typegoose.
4. `QueryAPI`
   Serves indexed data from MongoDB without querying the blockchain in the request path.

## 10. Data Requirements

Each indexed event should store at minimum:

- `chainId`
- `contractAddress`
- `eventName`
- `blockNumber`
- `blockHash`
- `blockTimestamp`
- `transactionHash`
- `transactionIndex`
- `logIndex`
- `token`
- `integrator`
- `integratorFee` as string
- `lifiFee` as string
- `removed` or `orphaned` flag
- `syncedAt`

Important domain notes:

- `token` may be the zero address for native-fee collection.
- `integratorFee` and `lifiFee` must not be stored as JavaScript numbers.
- Addresses should be normalized consistently before persistence and querying.

## 11. API Requirements

### `GET /fees`

Required query parameters:

- `integrator`

Optional query parameters:

- `chainId`
- `fromBlock`
- `toBlock`
- `limit`
- `cursor`

Response requirements:

- deterministic ordering
- cursor-based pagination
- amounts returned as strings
- raw blockchain identifiers preserved in the payload

## 12. Operational Requirements

### Observability

Minimum production signals:

- structured logs
- ingestion lag
- latest safe head
- latest committed synced block
- batch duration
- RPC retry count
- write failures

### Reliability

- bounded retry with backoff for RPC calls
- graceful shutdown on `SIGTERM`
- no cursor advancement before successful event persistence

## 13. Acceptance Criteria Mapping

### Must-have criteria

- Scrape `FeesCollected` events on Polygon: covered by `IndexerWorker`.
- Retrieve new events when restarted later: covered by persisted `sync_state`.
- Avoid rescanning the entire chain: covered by cursor + bounded lookback.
- Store events in MongoDB using Typegoose: covered by `fee_events` model.
- REST endpoint by `integrator`: covered by `GET /fees`.
- Dockerized deployment: covered by the default container runtime.

## 14. Risks and Mitigations

### RPC instability or rate limiting

Mitigation:

- multiple RPC URLs
- retries with backoff
- adaptive batch sizing

### Reorg-related duplication or stale data

Mitigation:

- bounded rescans
- idempotent upserts
- block-aware identity and optional processed block tracking

### Cursor corruption or partial batch persistence

Mitigation:

- advance cursor only after successful write
- use Mongo transactions in production deployments

## 15. Future Enhancements

- support additional EVM chains through configuration only
- index withdrawal events
- token metadata enrichment pipeline
- summary endpoint by integrator and token
- Prometheus metrics
- admin endpoint for sync status

## 16. Deliverables

- TypeScript service
- MongoDB/Typegoose persistence
- Dockerfile and Docker-first runtime instructions
- local run instructions
- architecture documentation
- tests for parser, persistence behavior, sync loop, and API
