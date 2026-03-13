# TDD: Technical Design for FeeCollector Event Indexer

## 1. Purpose

This document describes the technical design of a production-oriented event indexer for LI.FI's `FeeCollector` contract. The focus is correctness, resumability, idempotency, and observability rather than raw indexing speed.

## 2. Design Principles

- Prefer correctness over lowest-latency ingestion.
- Treat blockchain reads as unreliable external I/O.
- Make every write idempotent.
- Persist enough metadata to recover from failures and reason about reorgs.
- Keep read and write paths separate.
- Keep the initial release Polygon-specific in runtime scope but multi-chain in structure.

## 3. Architecture

### 3.1 Components

1. `ChainConfigRegistry`
   Provides per-chain configuration:

- `chainId`
- `name`
- `rpcUrls[]`
- `feeCollectorAddress`
- `startBlock`
- `reorgLookback`
- `initialBatchSize`
- `minBatchSize`
- `maxBatchSize`
- `pollIntervalMs`
- `confirmationsFallback`

2. `RpcProviderFactory`
   Creates an ethers v5 provider using multiple endpoints where available. A `FallbackProvider` is preferred in production.
3. `SafeHeadResolver`
   Computes the highest block that is safe to index:

- first try `eth_getBlockByNumber("finalized", false)`
- if unsupported, fall back to `latest - confirmationsFallback`

4. `IndexerWorker`
   Owns one logical partition: `(chainId, contractAddress, eventName)`.
   Responsibilities:

- acquire lease
- load sync state
- compute scan window
- fetch logs
- parse logs
- persist events
- update sync cursor
- renew lease while active

5. `PersistenceLayer`
   Encapsulates Typegoose models and Mongo write operations.
6. `QueryAPI`
   Reads normalized data from MongoDB and exposes REST endpoints.

## 4. Data Model

### 4.1 `fee_events`

Stores normalized business events.

Suggested fields:

- `chainId: number`
- `contractAddress: string`
- `eventName: 'FeesCollected'`
- `blockNumber: number`
- `blockHash: string`
- `blockTimestamp: Date`
- `transactionHash: string`
- `transactionIndex: number`
- `logIndex: number`
- `token: string`
- `integrator: string`
- `integratorFee: string`
- `lifiFee: string`
- `removed: boolean`
- `orphaned: boolean`
- `rawTopics?: string[]`
- `rawData?: string`
- `syncedAt: Date`

Recommended indexes:

- unique: `(chainId, blockHash, logIndex)`
- read path: `(chainId, integrator, blockNumber desc, logIndex desc)`
- maintenance: `(chainId, blockNumber)`

Rationale:

- `blockHash + logIndex` identifies an exact log in an exact block.
- `transactionHash + logIndex` is insufficient if the same transaction is re-included after a reorg or if old orphaned records must be distinguished from canonical ones.

### 4.2 `sync_state`

Stores progress and worker coordination state per indexer partition.

Suggested fields:

- `key: string` where key = `chainId:contractAddress:FeesCollected`
- `chainId: number`
- `contractAddress: string`
- `eventName: string`
- `lastFinalizedScannedBlock: number`
- `reorgLookback: number`
- `status: 'idle' | 'running' | 'error'`
- `leaseOwner?: string`
- `leaseUntil?: Date`
- `lastHeartbeatAt?: Date`
- `lastError?: string`
- `updatedAt: Date`

Recommended indexes:

- unique: `(key)`
- lease lookup: `(leaseUntil)`

### 4.3 `processed_blocks` (recommended)

Stores per-block processing metadata.

Suggested fields:

- `chainId: number`
- `blockNumber: number`
- `blockHash: string`
- `processedAt: Date`
- `finalized: boolean`

Recommended indexes:

- unique: `(chainId, blockNumber, blockHash)`
- lookup: `(chainId, blockNumber)`

Rationale:

- enables explicit reorg detection
- helps orphan cleanup
- improves audits and incident debugging

This collection can be deferred in the initial release if the implementation only indexes finalized blocks with bounded rescans, but it should be added once explicit reorg auditing and orphan management are required.

## 5. Event Semantics

The target event is:

`FeesCollected(address indexed token, address indexed integrator, uint256 integratorFee, uint256 lifiFee)`

Important implications:

- `token` and `integrator` can be filtered at log level because they are indexed.
- `token` may be the zero address for native-asset fee collection.
- `integratorFee` and `lifiFee` must be handled as big integers and persisted as strings.
- This event represents fee collection, not available balances.

## 6. Sync Algorithm

### 6.1 Safe head

`safeHead` is the highest block considered stable enough to ingest.

Resolution strategy:

1. attempt finalized head
2. if unavailable, use `latest - confirmationsFallback`

### 6.2 Scan window

Given:

- `startBlock`
- `lastFinalizedScannedBlock`
- `reorgLookback`
- `safeHead`

Compute:

- `from = max(startBlock, lastFinalizedScannedBlock + 1 - reorgLookback)`
- `to = safeHead`

If `from > to`, there is nothing new to process.

### 6.3 Batch loop

Process `[from, to]` in chunks:

1. choose current batch size
2. fetch logs for `[batchFrom, batchTo]`
3. parse logs into normalized events
4. fetch block timestamps if needed
5. persist events idempotently
6. optionally persist processed block metadata
7. advance cursor to `batchTo`
8. adjust batch size based on success/failure

### 6.4 Adaptive chunking

Initial chunk size can start at `5000`.

If a batch fails because of timeout or provider limits:

- halve batch size until reaching `minBatchSize`

If several consecutive batches succeed:

- gradually increase toward `maxBatchSize`

This keeps the worker resilient across providers with different `eth_getLogs` limits.

## 7. Write Path and Atomicity

### 7.1 Idempotent writes

Persist events with `bulkWrite` and `updateOne(..., { upsert: true })`.

This guarantees:

- rerunning a batch does not create duplicates
- lookback rescans are safe
- restarts after partial progress are recoverable

### 7.2 Cursor advancement

Never advance the cursor before all event writes for the batch succeed.

Production default:

1. wrap event writes and `sync_state` update in one Mongo transaction
2. run Mongo in replica-set mode, including local Docker environments where transactions must be exercised
3. fail fast at startup if transaction support is unavailable in the default runtime mode

### 7.3 Mongo transaction requirement

Multi-document transactions require a replica set or sharded cluster because MongoDB needs session and commit coordination backed by replication internals. A standalone deployment cannot provide full transaction guarantees across multiple documents or collections.

A single-node replica set is enough for local development if transactions are needed.

### 7.4 Why not `Promise.all()` inside one transaction

MongoDB transactions are session-scoped and the driver does not support running parallel operations inside the same transaction reliably. Even if attempted, the work still serializes around one session/connection and can produce undefined behavior. Transactional operations should be awaited sequentially.

## 8. Lease and Worker Ownership

### 8.1 Why a lease exists

`sync_state` is not only a cursor store. It also prevents two workers from processing the same partition simultaneously.

### 8.2 Acquisition model

Acquire ownership with an atomic conditional update such as:

- match on `key`
- require `leaseUntil < now` or `leaseOwner == self`
- set `leaseOwner = self`
- set `leaseUntil = now + leaseDuration`

Only one worker should acquire the lease for the same partition at a time.

### 8.3 Heartbeats

Long-running workers periodically renew `leaseUntil`.

If a worker crashes:

- the lease expires
- another worker can resume from the persisted cursor

### 8.4 Scaling model

The intended scale unit is one logical worker per partition, not one global worker for all chains forever.

Examples:

- one worker for Polygon `FeesCollected`
- one worker per chain
- multiple workers across many chains, each claiming different partitions

## 9. API Design

### 9.1 Endpoint

`GET /fees`

Parameters:

- `integrator` required
- `chainId` optional
- `fromBlock` optional
- `toBlock` optional
- `limit` optional
- `cursor` optional

### 9.2 Query behavior

- normalize `integrator` before querying
- sort by `(blockNumber desc, logIndex desc)`
- return cursor-based pagination token
- return amounts as strings

## 10. Failure Modes

### 10.1 RPC timeout

Behavior:

- retry with backoff
- reduce batch size
- preserve cursor

### 10.2 Partial batch write failure

Behavior:

- do not advance cursor
- retry later
- rely on upsert idempotency

### 10.3 Reorg affecting recently scanned range

Behavior:

- rescan lookback window
- if `processed_blocks` is enabled, compare stored `blockHash`
- mark or replace orphaned data as needed

### 10.4 Duplicate worker start

Behavior:

- only one worker acquires the lease
- other instances remain idle or retry later

## 11. Latency Expectations

Steady-state end-to-end freshness is:

`finality delay + poll interval + one batch processing time`

Examples:

- if finalized head is available and poll interval is `10s`, practical freshness can be on the order of `10-20s`
- if fallback is `latest - 64 confirmations` on Polygon, freshness is roughly `64 * block_time + polling + processing`

Latency is therefore a deliberate tradeoff against correctness at the chain tip.

## 12. Deployment Model

The application is Docker-first by default.

Recommended runtime artifacts:

- `Dockerfile` for the service image
- `docker-compose.yml` for local orchestration
- MongoDB configured as a single-node replica set in Docker so transaction support is available by default

Recommended container modes:

- `worker`
- `api`
- `all` for local development or demo environments

Operational requirements:

- non-root container user
- environment-driven configuration
- healthchecks
- graceful shutdown on `SIGTERM`

## 13. Testing Strategy

### 13.1 Unit tests

- event parser converts ethers logs into normalized documents
- address normalization logic
- batch range computation from `startBlock`, cursor, lookback, and safe head
- adaptive chunk size behavior
- cursor token encoding and decoding

### 13.2 Repository tests

- unique index prevents duplicate logical inserts
- upsert path is idempotent
- transaction path updates events and cursor atomically
- lease acquisition works and rejects concurrent ownership

### 13.3 Worker integration tests

- backfill from empty state
- resume after restart
- partial write failure does not advance cursor
- lookback rescan does not create duplicates
- lease expiration allows takeover by a second worker

### 13.4 API tests

- `GET /fees` requires `integrator`
- query filtering by `integrator`
- sorting and pagination
- amount serialization as strings

### 13.5 Reorg simulation tests

- same block number with different block hash is detected when block tracking is enabled
- orphaned event handling is correct
- transaction hash reuse across re-inclusion does not corrupt canonical identity

## 14. Release Plan

### Current release

- Polygon only
- one indexer worker
- `fee_events` + `sync_state`
- bounded lookback
- Docker-first runtime
- Mongo replica set enabled by default
- idempotent upsert
- transactional event write plus cursor update
- `GET /fees`
- tests covering parser, sync window, idempotency, and API

### Planned hardening

- `processed_blocks`
- lease-based ownership
- multi-provider RPC
- metrics endpoint

## 15. Open Tradeoffs

### Should `processed_blocks` be included immediately?

Recommendation:

- not mandatory on day one if only finalized blocks plus bounded rescans are indexed
- recommended once explicit reorg auditing and orphan cleanup are needed

### Should transactions be required from day one?

Recommendation:

- yes as the default design
- local Docker should run a single-node replica set so the default path matches production behavior
- the service should fail fast rather than silently downgrade when transactions are unavailable
