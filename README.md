# Project Pepsi

An initial vertical slice for conservative watch valuation and supervised negotiation.

## Run locally

```powershell
pnpm install
pnpm dev
```

The dashboard now persists normalized listings and immutable valuation results through Cloudflare D1. `POST /api/listings` validates and stores a listing plus its valuation; `GET /api/listings` returns the eight most recent analyses. The broader production-oriented Postgres model remains in `db/schema.sql` for the later FastAPI service.

## Enforced economics

```text
economic alpha = received QLV + cash received - given QLV - cash paid - costs - expected risk loss
strategic score = economic alpha + liquidity adjustment
```

The offer ceiling preserves a minimum $200 economic alpha. Human approval is mandatory in both the interface and database model.

## OpenAI connectivity

`POST /api/analyze` performs a minimal server-side Responses API check. It reads
`OPENAI_API_KEY` only from the Sites runtime, never from browser code or the
scanner extension. Local development and production builds do not require the
secret; the endpoint returns `503 OPENAI_API_KEY_MISSING` until it is configured.

## Current ingestion contract

The MVP accepts a listing URL, pasted listing text, confirmed brand/model/reference, asking price, and trade inputs. Reference normalization is deliberately human-confirmed for now; marketplace fetching and model-assisted extraction come next.
