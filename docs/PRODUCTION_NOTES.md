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

## Traceability

Current state:

- the API assigns a per-request `traceId`
- structured logging is enabled through `pino` and `pino-http`
- correlation across request logs, runtime errors, and worker-side events is still limited

Stricter production setup:

- accept or propagate incoming correlation IDs where appropriate instead of always generating a local-only trace identifier
- include correlation identifiers consistently in request logs, API error logs, startup/shutdown logs, and worker logs
- improve error serialization so stack and message data remain reliable during incident investigation

## CI / Release Automation

Current state:

- the repo provides local `build`, `lint`, and `test` scripts
- there is no checked-in CI workflow yet, so release verification still depends on local/manual execution

Stricter production setup:

- add GitHub Actions as the default CI path
- run `build`, `lint`, unit tests, integration tests, and the Docker-oriented smoke or e2e gate where practical
- optionally add image build and deployment-readiness checks so releases are not validated only by manual discipline

## Not Done Yet

- index rollout still depends on `syncIndexes()` at startup; add migration-driven or deploy-time index management
- there is no explicit retry/backoff layer for RPC calls beyond provider fallback and adaptive batch shrinking
- there is no `/metrics` endpoint, metrics export, or alerting for lag, cursor progress, and batch failures
- traceability is still partial; propagate correlation IDs across API and worker logs and improve production error serialization for incident debugging
- there is no checked-in CI pipeline yet; add GitHub Actions to run the documented build, lint, and test gates automatically
- secrets management is still just env injection; add deployment-level secret storage and rotation practices
- there is no explicit processed-block audit trail or stronger reorg bookkeeping beyond bounded replay and range replacement
- Docker Compose ships only the `worker-polygon` template; add multi-worker or multi-chain deployment templates before scaling out
- architecture guidance is documented for humans, but agent guidance is not yet specialized for enforcing boundaries during review; add more architecture-focused agent skills, describe module boundaries more explicitly in agent-facing docs, and move toward agent checks that can flag architecture rule violations
