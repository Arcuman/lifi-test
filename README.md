# LI.FI Fee Events Indexer

This service indexes `FeesCollected` events from the `FeeCollector` contract, stores them in MongoDB, and exposes a read API for querying data by `integrator`.

The project is `Docker-first`: API, single-chain worker, and MongoDB start together, with local overrides loaded from `.env` on top of `.env.example` defaults.

## How I Solved The Task

1. I first asked ChatGPT 5.4 Pro Mode to build a solution plan.
2. I reviewed that plan and wrote down open questions, unfamiliar concepts, and unclear parts.
3. Based on the assignment and the plan, I prepared a `PRD`, and after that a `TDD` as the technical design document.
4. I reviewed the available skills and selected the ones that were most useful for architecture and backend work: `architecture-patterns`, `api-design-principles`, and `nodejs-backend-patterns`.
5. Before implementation, I locked down the architecture and test plan, and captured the key runtime and dependency decisions.
6. Then I built the actual project: dependencies, runtime, worker, API, and tests.
7. After the base version was working, I refined the parts I did not like:
   - prepared configuration for scaling to multiple networks
   - moved API output to a DTO/presenter instead of returning raw MongoDB documents
   - moved the runtime to `1 worker = 1 chain`
   - kept bounded replay on startup, transactional range replacement, and canonical-only reads so restarts and short reorgs are handled more safely

## Production Notes

See [Production notes](docs/PRODUCTION_NOTES.md) for the current production hardening gaps and deployment caveats.

## Run

Copy the example env and update the Polygon RPC URL in `.env`. For historical indexing, prefer your own archive-capable RPC endpoint such as Alchemy.

```bash
cp .env.example .env
```

Example:

```env
CHAIN_POLYGON_RPC_URLS=https://polygon-mainnet.g.alchemy.com/v2/YOUR_ALCHEMY_API_KEY
```

If `.env` is missing, Docker Compose falls back to `.env.example`.

```bash
docker compose up --build
```

## Check

Example integrator:

```bash
export INTEGRATOR=0xb563d0dd1ebbdaed8d2d6afc767981aa53d56605
```

List available integrators from local MongoDB:

```bash
./scripts/curl/find-integrators.sh
```

```bash
./scripts/curl/health-live.sh
./scripts/curl/health-ready.sh
INTEGRATOR=$INTEGRATOR ./scripts/curl/fees-by-integrator.sh
INTEGRATOR=$INTEGRATOR CHAIN_ID=137 ./scripts/curl/fees-by-chain.sh
INTEGRATOR=$INTEGRATOR FROM_BLOCK=78600000 TO_BLOCK=78605000 ./scripts/curl/fees-by-range.sh
INTEGRATOR=$INTEGRATOR LIMIT=2 ./scripts/curl/fees-first-page.sh
INTEGRATOR=$INTEGRATOR CURSOR='<cursor-from-previous-response>' LIMIT=2 ./scripts/curl/fees-next-page.sh
./scripts/curl/fees-invalid-integrator.sh
```

Expected:

- `health-live.sh` -> `HTTP 200`
- `health-ready.sh` -> `HTTP 200`
- `fees-by-*.sh` -> `HTTP 200`, response has `data` and `page.nextCursor`
- `fees-invalid-integrator.sh` -> `HTTP 400`, response type is `validation_error`

## Stop

```bash
docker compose down
```

## Documents

- [PRD](docs/PRD.md)
- [TDD](docs/TDD.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Test cases](docs/TEST_CASES.md)
- [Production notes](docs/PRODUCTION_NOTES.md)

## Stack

For runtime topology and architectural boundaries, see [Architecture](docs/ARCHITECTURE.md).

- Node.js 24
- TypeScript
- Express 5
- ethers v5
- MongoDB + Typegoose
- Vitest + Supertest + Testcontainers
