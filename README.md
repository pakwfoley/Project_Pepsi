# Project Pepsi

A human-in-the-loop watch intelligence system with browser-assisted capture, structured visual analysis, and provisional valuation.

## Run locally

```powershell
pnpm install
pnpm dev
```

The production authority is the Python FastAPI service backed by PostgreSQL. The private Sites Worker is an authenticated gateway only: it forwards `/api/*` requests and contains no persistence, valuation, normalization, or OpenAI logic. Cloudflare D1 and its Worker-era schema are retained temporarily as **LEGACY/BRIDGE** migration artifacts and are not an active or equal persistence path.

Scanner valuations currently use the versioned `ai_provisional_v1` method. They are conservative semantic estimates with ranges, confidence, basis, and uncertainty—not authoritative market facts or permission to transact. Each analysis is retained historically in PostgreSQL so later comparable-based methods can replace the provider without changing the downstream valuation contract.

For an identified watch family or likely reference, missing verification evidence lowers confidence and widens the provisional range rather than automatically suppressing valuation. The service falls back from exact reference to reference family, model, or a narrow watch category. New successful analyses use `valuationStatus: estimated`; legacy `available` rows remain readable. `insufficient_evidence` is reserved for listings that cannot be identified to a commercially meaningful family, mix multiple possible sale items, or contain evidence too contradictory for even a broad responsible range.

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
