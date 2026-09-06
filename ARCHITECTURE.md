# Project Pepsi Architecture

## 1. Purpose

Project Pepsi is a human-in-the-loop watch trading intelligence system.

Its goal is to discover, evaluate, and eventually negotiate watch trade opportunities that increase portfolio value over time, with the long-term objective of trading toward a Rolex GMT-Master II.

Project Pepsi is not intended to autonomously complete financial transactions. Human approval and physical transaction execution remain mandatory.

---

## 2. Core Design Principle

Project Pepsi separates data collection, deterministic business rules, LLM reasoning, and human authorization.

Canonical responsibility model:

```text
Chrome Extension = capture and transport
Backend          = orchestration, persistence, policy, deterministic rules
OpenAI           = semantic reasoning and visual understanding
Human            = final authority and transaction execution
```

No component should take on responsibilities belonging to another layer without an explicit architectural decision.

---

## 3. Current System Architecture

```text
Facebook Marketplace
        │
        │ authenticated browser session
        ▼
Chrome Extension
        │
        │ listing metadata + images
        ▼
Private Sites Worker (authenticated gateway only)
        │
        ▼
Python FastAPI backend
        ├──────────────► PostgreSQL (system of record)
        └──────────────► OpenAI Responses API
                          semantic and visual analysis
```

Current production environment:

```text
Hosting:
OpenAI Sites

Gateway runtime:
Cloudflare Workers (transport/authentication only)

Backend runtime:
Python FastAPI on Railway

Database:
PostgreSQL on Railway

Marketplace ingestion:
Chrome extension running in the user's authenticated browser

AI:
OpenAI Responses API

Secrets:
OPENAI_API_KEY in the FastAPI runtime only; OAuth clients contain public configuration only
```

The production Site is private.

---

## 4. Trust Boundaries

### Chrome Extension

The Chrome extension operates inside the user's authenticated Facebook session.

Its responsibility is limited to collecting information already visible to the user and transporting that information to Project Pepsi.

The extension MUST:

* Capture supported listing metadata.
* Capture listing images.
* Normalize basic transport-level fields where practical.
* Send data to Project Pepsi backend endpoints.

The extension MUST NOT:

* Contain `OPENAI_API_KEY`.
* Call OpenAI directly.
* Perform watch valuation.
* Perform semantic image analysis.
* Determine authenticity.
* Make financial decisions.
* Decide whether a trade is economically acceptable.
* Commit to transactions.
* Autonomously negotiate unless explicitly introduced in a future architecture phase.

The extension should remain intentionally dumb.

---

## 5. Backend Responsibilities

The Project Pepsi backend is the system authority for orchestration and deterministic policy.

It MUST handle:

* Input validation.
* Listing normalization.
* Persistence.
* OpenAI API orchestration.
* Structured analysis validation.
* Valuation calculations.
* Risk calculations.
* Trade economics.
* Portfolio state.
* Human approval state.
* Rate limiting and abuse controls.
* Failure handling.
* Secret isolation.

The backend MUST NOT delegate deterministic financial constraints to an LLM when those constraints can be implemented directly in code.

Example:

```text
GOOD:
LLM estimates likely reference and visible condition.
Backend computes allowable offer using stored valuation rules.

BAD:
"Ask the model whether paying $3,100 is financially acceptable."
```

LLMs provide evidence and semantic interpretation.

Code enforces policy.

---

## 6. Data Ingestion

### Facebook Marketplace

Facebook ingestion currently occurs through the user's authenticated browser.

Project Pepsi servers do not need access to the user's Facebook credentials or session.

Canonical flow:

```text
Facebook
   ↓
User's browser
   ↓
Chrome extension
   ↓
Project Pepsi backend
```

The backend should not depend on direct Facebook access for images or listing content captured by the extension.

Marketplace-specific ingestion should remain an adapter layer.

Future marketplaces should be able to implement the same canonical listing contract.

Examples:

```text
Facebook Adapter ─┐
Reddit Adapter ───┼──► Canonical Listing
eBay Adapter ─────┤
Other Adapter ────┘
```

---

## 7. Canonical Listing Model

Marketplace listings should normalize into a common representation.

Conceptually:

```json
{
  "source": "facebook_marketplace",
  "source_listing_id": "...",
  "url": "...",
  "title": "...",
  "description": "...",
  "asking_price": 2700,
  "currency": "USD",
  "location": "...",
  "seller": {
    "display_name": "...",
    "available_metadata": {}
  },
  "images": [],
  "captured_at": "...",
  "raw_payload": {}
}
```

The exact schema may evolve.

Important requirement:

The original/raw captured representation SHOULD be retained where practical so parsing or normalization mistakes can be investigated later.

---

## 8. Image Pipeline

Watch analysis depends heavily on listing photography.

### Extension behavior

The extension MUST NOT attempt semantic image classification.

It should:

* Capture up to 6 listing images per candidate.
* Preserve aspect ratio.
* Resize each image to a maximum long edge of approximately 2048 pixels.
* Use reasonable JPEG/WebP compression, approximately quality 85–90.
* Maintain a per-image payload ceiling.
* Preserve image index/source metadata.
* Avoid assuming that Facebook image order represents importance.

The extension sends available images to the backend.

### Backend/OpenAI behavior

OpenAI vision performs semantic interpretation.

The model should classify images where possible into categories such as:

```text
dial/front
caseback
clasp
bracelet
side profile
crown
movement
serial/reference engraving
box
papers
wrist shot
other
```

Visual analysis may contribute to:

* Brand identification.
* Model identification.
* Reference identification.
* Visible condition.
* Bracelet/case completeness.
* Box/papers detection.
* Suspicious authenticity indicators.
* Reference inconsistencies.
* Valuation inputs.

Use high-detail visual processing for serious watch analysis where supported and appropriate.

### Authentication Limitation

Project Pepsi MUST NOT represent photographic analysis as definitive authentication.

Output should distinguish:

```text
No obvious issues visible
Suspicious indicators detected
Insufficient evidence
Requires physical/professional authentication
```

A listing photo analysis is a risk assessment, not a certificate of authenticity.

---

## 9. AI Analysis

OpenAI is used for tasks requiring semantic reasoning.

Likely responsibilities include:

* Parsing messy marketplace descriptions.
* Identifying watches from titles, descriptions, and photos.
* Estimating likely reference numbers.
* Understanding box/papers/service-history statements.
* Interpreting seller responses.
* Detecting inconsistencies.
* Identifying useful visual evidence.
* Generating negotiation language.
* Summarizing risk.
* Extracting structured fields.

AI responses should use structured output wherever feasible.

The backend should validate model output before using it.

No model output should directly authorize a transaction.

---

## 10. Valuation Philosophy

Project Pepsi must avoid treating asking prices as market value.

For each watch/configuration, the system should eventually model multiple price bands.

Example:

```text
Dealer asking price
Private-party asking price
Estimated private clearing price
Quick liquidation value
Dealer buy estimate
```

### Primary Economic Metric

Quick Liquidation Value, abbreviated QLV, is the preferred conservative portfolio accounting metric.

QLV represents approximately what the watch could reasonably be converted into without requiring an unusually patient or optimistic sale.

This protects the system from fictional profits created by inflated marketplace asks.

Example:

```text
Chrono-style ask:          $3,800
Likely private sale:       $3,200
Quick liquidation value:  $2,900
```

Project Pepsi should reason economically around approximately $2,900 rather than $3,800.

---

## 11. Trade Economics

Basic trade alpha should be computed deterministically.

Conceptually:

```text
Expected Trade Alpha
=
QLV(received)
- QLV(given)
- cash_added
- transaction_cost
- risk_penalty
- transaction_friction
```

Transaction friction may include:

```text
travel
shipping
insurance
platform fees
payment fees
authentication costs
time cost
deal complexity
```

A 9-hour round-trip drive is not economically free.

Travel and human time SHOULD be included when evaluating opportunities.

---

## 12. Risk Model

Risk should be treated as an economic input rather than a separate afterthought.

Relevant signals may include:

* Suspiciously low price.
* New or sparse seller profile.
* Inconsistent reference details.
* Missing serial/reference evidence.
* Poor photo coverage.
* Known high-counterfeit model.
* Payment method.
* Shipping requirements.
* Seller behavior.
* Geographic friction.
* Lack of provenance.
* Unverified service claims.
* Bracelet/component inconsistencies.

Project Pepsi should prefer conservative uncertainty.

High theoretical profit plus high counterfeit/fraud risk does not automatically constitute a high-quality opportunity.

---

## 13. Portfolio Model

Project Pepsi ultimately optimizes a portfolio, not isolated purchases.

A trade can have strategic value beyond immediate dollar spread.

Relevant factors may include:

```text
QLV
liquidity
brand desirability
trade desirability
counterparty demand
ease of resale
authenticity risk
transaction friction
expected future trade opportunities
```

Conceptually:

```text
Strategic Value
=
economic value
+ liquidity value
+ trade desirability
+ expected future optionality
- risk
- friction
```

This enables Project Pepsi to reason about multi-step trade paths.

Example:

```text
Tudor
  ↓
Omega
  ↓
Rolex Explorer
  ↓
Rolex Submariner
  ↓
GMT-Master II
```

These are not predetermined required steps.

The system should discover advantageous paths rather than hard-code a brand ladder.

---

## 14. Negotiation Architecture

Negotiation is a future capability and should be introduced incrementally.

The LLM may generate natural-language negotiation strategy and messages.

Deterministic code must control authority.

Suggested state model:

```text
DISCOVERED
    ↓
VALUED
    ↓
QUALIFY_SELLER
    ↓
ASK_MISSING_QUESTIONS
    ↓
OPENING_OFFER
    ↓
COUNTER
    ↓
ECONOMICALLY_ACCEPTABLE
    ↓
PENDING_HUMAN_APPROVAL
    ↓
AGREED / REJECTED
```

The LLM may recommend:

```text
opening offer
counteroffer
questions
negotiation wording
walk-away recommendation
```

The backend determines whether numbers violate configured boundaries.

---

## 15. Human Approval Boundary

Human-in-the-loop control is a foundational requirement.

Project Pepsi may eventually:

* Find listings.
* Analyze listings.
* Recommend trades.
* Generate offers.
* Generate counters.
* Conduct constrained negotiation if explicitly enabled.

Project Pepsi MUST NOT autonomously:

* Send money.
* Initiate irreversible payment.
* Represent physical inspection as completed.
* Confirm authenticity as fact.
* Commit the user to a transaction without authorization.
* Arrange final physical transaction without human approval.

Before a binding deal, the user remains the authority.

---

## 16. API Key and Secret Handling

`OPENAI_API_KEY` is server-side only.

It MUST:

* Be stored in the FastAPI hosting runtime's secret/environment facilities.
* Be available only to server-side execution.
* Never enter extension bundles.
* Never enter client JavaScript.
* Never be logged.
* Never be persisted to PostgreSQL, D1, or any application data store.
* Never be returned by an API endpoint.
* Never be committed to Git.

The application should fail clearly when the secret is unavailable.

Current expected missing-secret behavior:

```text
503 OPENAI_API_KEY_MISSING
```

---

## 17. Persistence

PostgreSQL is the production system of record. Cloudflare D1 is **LEGACY/BRIDGE** only: its binding and historical Worker schema remain temporarily for migration/rollback inspection, but production routes do not read from or write to it. New features must not add D1 persistence.

Likely persisted domains include:

```text
listings
listing observations
watch identifications
valuations
image metadata
AI analyses
risk assessments
portfolio assets
trade opportunities
offers
negotiation state
completed trades
```

Schema design should preserve history where useful.

Price changes, repeated listings, valuation changes, and negotiation outcomes may eventually become valuable proprietary data.

Do not prematurely optimize this dataset.

---

## 18. Current State

Currently implemented or selected:

```text
✓ Private OpenAI Site
✓ Cloudflare Worker authenticated gateway
✓ FastAPI backend on Railway
✓ PostgreSQL system of record
⚠ Cloudflare D1 retained as LEGACY/BRIDGE only
✓ Chrome extension Marketplace ingestion
✓ Authenticated browser-based Facebook capture
✓ Server-side /api/analyze endpoint
✓ OPENAI_API_KEY server-only design
✓ Safe missing-secret behavior
✓ Responses API integration architecture
```

The image transport contract is versioned and validated by FastAPI. Further contract changes should remain backward-aware and must not expose extension-internal state.

Scanner analyses receive a deterministic review-priority score after semantic analysis. This score ranks which records deserve human attention using relevance, identification confidence, photo coverage, locality, risk signals, and missing evidence. It is not a valuation or expected-profit score. Until comparable data produces a defensible QLV, scanner candidates must remain explicitly marked `valuation_required` and must not receive a purchase or trade recommendation.

For P2 verification, each persisted scanner analysis also retains bounded operational metadata: model identifier, OpenAI response identifier, request latency, token usage, usable-image count, and rejected image indexes. Raw image payloads and credentials are not included. This metadata exists to prove repeated end-to-end behavior and inspect partial-image handling; it is not business evidence or valuation input.

---

## 19. Near-Term Target

The first useful Project Pepsi release should do one thing extremely well:

```text
Listing
   ↓
Normalized watch
   ↓
Image analysis
   ↓
Identification
   ↓
Valuation
   ↓
Risk assessment
   ↓
Recommended offer range
```

Example output:

```text
OMEGA RAILMASTER

Likely reference: ...
Identification confidence: 94%

Seller ask:               $2,700
Estimated private value:  $...
Quick liquidation value:  $...
Dealer-buy estimate:       $...

Condition:
...

Authenticity signals:
...

Risk:
MODERATE

Suggested opening offer:
$...

Maximum recommended acquisition:
$...

Expected trade alpha:
$...
```

V1 should prioritize correctness and explainability over automation.

---

## 20. Roadmap

### V1 — Trade Intelligence

```text
Manual/browser-assisted listing capture
Watch identification
Image analysis
Valuation
Risk scoring
Offer recommendation
PostgreSQL persistence
```

Human performs all communication and transactions.

### V2 — Opportunity Discovery

```text
Continuous or semi-automated listing capture
Candidate ranking
Duplicate detection
Price-change detection
Portfolio-aware opportunity scoring
```

### V3 — Negotiation Assistance

```text
Seller-response analysis
Suggested questions
Suggested offers
Suggested counters
Negotiation state tracking
Walk-away limits
```

Human sends messages.

### V4 — Constrained Negotiation Agent

Potential future capability:

```text
Agent communicates with sellers
Deterministic authority limits
Explicit financial boundaries
Human approval before commitment
```

This phase requires additional security and platform-policy review before implementation.

### V5 — Trade Graph Optimization

```text
Portfolio optimization
Liquidity modeling
Counterparty preference modeling
Multi-step trade paths
Expected-value optimization toward target watches
```

Long-term objective:

```text
Starting portfolio
      ↓
Repeated favorable trades
      ↓
Rolex GMT-Master II
```

Internally: Project Pepsi.

---

## 21. Non-Goals

Project Pepsi is currently NOT:

* An autonomous payment system.
* A definitive watch authentication service.
* A generalized financial trading platform.
* A Facebook credential storage system.
* A marketplace spam bot.
* A fully autonomous buying agent.
* A dealer inventory management system.
* A replacement for physical inspection.

Do not expand scope casually.

---

## 22. Architecture Decision Summary

| Decision                                     | Status               | Rationale                                                    |
| -------------------------------------------- | -------------------- | ------------------------------------------------------------ |
| Chrome extension for Facebook ingestion      | Accepted             | Leverages existing authenticated browser session             |
| Extension remains semantically dumb          | Required             | Keeps intelligence and secrets server-side                   |
| Backend owns deterministic policy            | Required             | Financial/risk boundaries must not rely on LLM judgment      |
| OpenAI performs semantic/visual reasoning    | Accepted             | Appropriate use of LLM capability                            |
| Up to 6 listing images                       | Current policy       | Better evidence coverage without uncontrolled payload growth |
| ~2048 px maximum long edge                   | Current policy       | Preserve useful watch detail while bounding payload          |
| OpenAI API calls server-side only            | Required             | Protect API credentials                                      |
| PostgreSQL for persistence                   | Current architecture | Production system of record behind FastAPI                   |
| D1 persistence                               | LEGACY/BRIDGE        | Retained only for migration/rollback inspection              |
| QLV as primary accounting value              | Accepted             | Avoid inflated asking-price economics                        |
| Risk treated economically                    | Accepted             | Expected value should reflect fraud/authenticity uncertainty |
| Human approval before transaction commitment | Required             | Foundational control boundary                                |
| Autonomous marketplace negotiation           | Future only          | Not required for V1                                          |
| Trade-graph optimization                     | Future               | Long-term Project Pepsi objective                            |

---

## 23. Architectural Change Policy

This document is the canonical description of Project Pepsi architecture.

When implementation conflicts with this document:

1. Determine whether the implementation or architecture is wrong.
2. Do not silently reinterpret the architecture.
3. Record intentional architectural changes here.
4. Update associated agent instructions where necessary.

Architecture should evolve deliberately rather than emerging accidentally from generated code.

---

## 24. Production Backend Decision

Project Pepsi has migrated backend authority from the Sites/Cloudflare Worker implementation to a standalone Python FastAPI service with PostgreSQL.

Production topology:

```text
Chrome Extension ─┐
                  ├──► Private Sites Gateway ──► FastAPI Backend ──► PostgreSQL
Sites Frontend ───┘                                      │
                                                        └──► OpenAI Responses API
```

The existing private Sites frontend remains. The Worker is an authenticated transport gateway, not a second backend. D1 is a **LEGACY/BRIDGE** artifact and must not receive new production writes. The extension remains capture/transport only. FastAPI owns orchestration, validation, persistence, deterministic economics, and secret isolation. PostgreSQL is the durable source of truth.

In production, Auth0 is the managed identity provider. The dashboard and Chrome extension are public OAuth clients using Authorization Code + PKCE and contain no client secret. They send short-lived JWT access tokens to FastAPI, which validates the RS256 signature through the provider JWKS, issuer, audience, expiration, subject, and required scope. PostgreSQL resources are keyed and queried by the authenticated `sub`. The Sites Worker remains a transport gateway for dashboard same-origin requests and forwards the user's bearer token unchanged; the extension calls FastAPI directly. `/health` remains public for deployment monitoring.

This change adds one external trust boundary: the FastAPI hosting provider and managed PostgreSQL service. Production deployment must use HTTPS, a server-side secret manager, restricted CORS, database TLS, and an application authentication mechanism before clients are switched to it.

### FastAPI package boundaries

```text
project_pepsi/app.py           HTTP routing, authentication, error mapping
project_pepsi/contracts.py     versioned external request/response models
project_pepsi/services.py      use-case orchestration and application policy
project_pepsi/economics.py     deterministic financial calculations
project_pepsi/normalization.py deterministic text normalization
project_pepsi/openai_client.py OpenAI transport and structured-output validation
project_pepsi/repository.py    persistence operations
project_pepsi/database.py      SQLAlchemy tables, engine, and sessions
```

`app.py` must remain transport-oriented. Business calculations and persistence construction do not belong in route handlers. `openai_client.py` may produce validated semantic evidence but may not enforce financial decisions.

### Capture contract

The extension-to-backend contract is explicitly versioned with `contractVersion: 1`. The extension constructs this request from an allowlist of canonical capture fields; it must not serialize its internal scoring, notification, or storage record wholesale. Version 1 includes source identity, listing URL/title/text/price/location, and zero to six transport-normalized images. Marketplace-specific DOM details stop at the extension adapter boundary.
