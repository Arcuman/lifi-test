# Production Notes

## Mongo Indexes

Current state:

- indexes are declared in Typegoose models
- startup applies them via `syncIndexes()`

Stricter production setup:

- keep index definitions in code
- roll out index changes through migrations or deploy-time `createIndexes()`

## RPC Providers

RPC endpoints are configured per chain through `CHAIN_<CHAIN>_RPC_URLS` as full URLs. This works well for providers whose credentials are embedded in the URL, but separate credential fields or header-based auth are not supported yet.

When multiple URLs are configured, the worker builds an `ethers` `FallbackProvider`. That gives basic failover, but priority, weight, and stall timeout values are still hardcoded. Resilience currently relies mostly on provider fallback plus adaptive batch shrinking on retryable RPC failures.

For production deployments, private RPC URLs should come from deployment secrets rather than repo-managed env files.

## Not Done Yet

- index rollout still depends on `syncIndexes()` at startup; add migration-driven or deploy-time index management
- there is no explicit retry/backoff layer for RPC calls beyond provider fallback and adaptive batch shrinking
- there is no `/metrics` endpoint, metrics export, or alerting for lag, cursor progress, and batch failures
- secrets management is still just env injection; add deployment-level secret storage and rotation practices
- there is no explicit processed-block audit trail or stronger reorg bookkeeping beyond bounded replay and range replacement
- Docker Compose ships only the `worker-polygon` template; add multi-worker or multi-chain deployment templates before scaling out
