# Project Pepsi

An initial vertical slice for conservative watch valuation and supervised negotiation.

## Run locally

```powershell
pnpm install
pnpm dev
```

The production authority is the Python FastAPI service backed by PostgreSQL. The private Sites Worker is an authenticated gateway only: it forwards `/api/*` requests and contains no persistence, valuation, normalization, or OpenAI logic. Cloudflare D1 and its Worker-era schema are retained temporarily as **LEGACY/BRIDGE** migration artifacts and are not an active or equal persistence path.

## Enforced economics

```text
economic alpha = received QLV + cash received - given QLV - cash paid - costs - expected risk loss
strategic score = economic alpha + liquidity adjustment
```

The offer ceiling preserves a minimum $200 economic alpha. Human approval is mandatory in both the interface and database model.

## OpenAI connectivity

`POST /api/analyze` runs server-side watch and image analysis through the FastAPI service. FastAPI reads `OPENAI_API_KEY` from its server-side runtime only; the private Sites gateway uses a separate sealed service token to authenticate upstream calls. Neither secret enters browser code or the scanner extension. The endpoint returns `503 OPENAI_API_KEY_MISSING` when OpenAI connectivity is not configured.

## Current ingestion contract

The extension submits an explicit versioned capture contract rather than its internal storage object. The contract contains source identity, listing URL/title/text/price/location, and zero to six transport-normalized images. FastAPI validates this boundary before orchestration. Manual dashboard listings use a separate validated contract.
