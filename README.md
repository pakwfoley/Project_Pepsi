# Project Pepsi

An initial vertical slice for conservative watch valuation and supervised negotiation.

## Run locally

```powershell
pnpm install
pnpm dev
```

The dashboard currently runs entirely in the browser with representative data. The production-oriented Postgres model is in `db/schema.sql`; ingestion and API wiring are the next implementation slice.

## Enforced economics

```text
economic alpha = received QLV + cash received - given QLV - cash paid - costs - expected risk loss
strategic score = economic alpha + liquidity adjustment
```

The offer ceiling preserves a minimum $200 economic alpha. Human approval is mandatory in both the interface and database model.
