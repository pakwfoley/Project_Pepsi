# Project Pepsi — Instructions for AI Coding Agents

This file defines operating rules for AI coding agents working in the Project Pepsi repository.

Read `ARCHITECTURE.md` before making substantial changes.

---

## 1. Primary Rule

Do not invent architecture.

Implement the architecture described in `ARCHITECTURE.md`.

If implementation requires changing an architectural boundary, make that change explicit rather than silently introducing a new pattern.

---

## 2. System Responsibility Boundaries

Canonical model:

```text
Chrome Extension = capture and transport
Backend          = orchestration, persistence, deterministic policy
OpenAI           = semantic reasoning and visual understanding
Human            = authorization and transaction execution
```

Preserve these boundaries.

---

## 3. Chrome Extension Rules

The extension MUST remain intentionally dumb.

It MAY:

* Read marketplace listing information visible in the authenticated browser.
* Capture listing images.
* Perform transport-oriented normalization.
* Resize/compress images.
* Send listing data to Project Pepsi.

It MUST NOT:

* Contain `OPENAI_API_KEY`.
* Call OpenAI directly.
* Perform semantic image classification.
* Perform valuation.
* Determine authenticity.
* Compute maximum acquisition price.
* Determine whether a trade should occur.
* Commit to transactions.

Do not move backend or AI responsibilities into the extension for convenience.

---

## 4. Backend Rules

The backend owns deterministic system behavior.

Implement deterministic code for:

```text
financial calculations
offer ceilings
trade alpha
fees
transaction friction
risk adjustments
authorization limits
state transitions
input validation
output validation
```

Do NOT use an LLM for calculations or enforcement that can be reliably implemented in normal code.

Example:

```text
Correct:
model estimates condition = "very good"
backend maps condition into valuation policy

Incorrect:
model decides whether $3,000 is an acceptable purchase price
```

---

## 5. OpenAI Usage

Use OpenAI for semantic tasks such as:

```text
watch identification
reference inference
description parsing
image understanding
condition observations
authenticity-risk observations
seller-message interpretation
negotiation language generation
```

Prefer structured outputs.

Validate model responses server-side.

Model responses are evidence/input to Project Pepsi logic.

They are not authority.

---

## 6. Human-in-the-Loop Requirement

Human approval is required before Project Pepsi commits the user to a transaction.

Do not implement functionality that autonomously:

```text
sends payment
accepts a binding deal
claims physical inspection occurred
claims definitive authentication
commits to meeting or transaction terms
```

Future constrained seller messaging must still preserve deterministic authority limits and human approval before commitment.

---

## 7. Secrets

`OPENAI_API_KEY` MUST remain server-side.

Never:

```text
hard-code it
commit it
log it
return it
persist it in D1
place it in browser code
place it in the Chrome extension
include it in test fixtures
```

Read the key from the FastAPI runtime environment.

Missing configuration should fail explicitly and safely.

Do not ask a developer to paste production secrets into source code or agent conversation context when a runtime secret facility exists.

Browser and extension authentication uses managed OAuth/OIDC Authorization Code + PKCE. Public clients must not contain a client secret. FastAPI must validate access-token signature, issuer, audience, expiration, subject, and required scopes, and must scope persisted resources by the authenticated subject.

---

## 8. Image Pipeline

Current policy:

```text
maximum images per listing: 6
maximum long edge: ~2048 px
compression: JPEG/WebP approximately 85–90
semantic selection: OpenAI/backend, not extension
```

The extension should not attempt to determine whether an image is:

```text
dial
caseback
clasp
movement
papers
serial
etc.
```

Capture available evidence and allow the vision model to interpret it.

Do not assume source image order indicates importance.

One broken/undecodable image should not necessarily fail analysis if other usable images remain.

Do not unnecessarily log raw image data.

---

## 9. Authentication Claims

Never present AI/photo analysis as definitive watch authentication.

Allowed language/concepts:

```text
no obvious visual concerns
suspicious visual indicators
reference inconsistency
insufficient evidence
authentication recommended
```

Disallowed system behavior:

```text
"Authentic"
"Guaranteed genuine"
"Confirmed real"
```

unless backed by an actual trusted authentication source outside photographic model inference.

---

## 10. Valuation Rules

Do not treat listing asking price as market value.

Project Pepsi distinguishes among concepts such as:

```text
dealer ask
private ask
estimated private clearing value
quick liquidation value
dealer buy estimate
```

Quick Liquidation Value (QLV) is the primary conservative portfolio accounting metric.

Trade economics should eventually resemble:

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

Keep valuation assumptions inspectable.

Avoid opaque "AI says this is worth $X" logic.

---

## 11. Transaction Friction

Do not ignore real-world transaction costs.

Potential costs include:

```text
travel distance
human time
fuel
shipping
insurance
platform fees
payment fees
authentication
deal complexity
```

These may materially change whether an opportunity is attractive.

---

## 12. Data Model Philosophy

Prefer simple schemas that preserve useful raw evidence.

Do not prematurely construct an elaborate generalized marketplace ontology.

Persist historical observations where they may become strategically useful, including:

```text
listing observations
price changes
valuation history
analysis history
negotiation outcomes
completed trades
```

Do not delete useful source context merely because normalized fields exist.

---

## 13. Marketplace Adapter Design

Marketplace-specific code should remain isolated.

Target conceptual interface:

```text
Marketplace Adapter
        ↓
Canonical Listing
        ↓
Project Pepsi
```

Facebook-specific DOM structure should not leak deeply into valuation/business logic.

Future sources may include Reddit, eBay, watch forums, or others.

Do not build those integrations until required.

---

## 14. Avoid Premature Infrastructure

Project Pepsi is an early-stage system.

Prefer:

```text
simple functions
clear modules
explicit contracts
boring infrastructure
few moving parts
```

over:

```text
microservices
event buses
complex queues
generic plugin frameworks
unnecessary abstraction layers
premature distributed architecture
```

Do not introduce infrastructure merely because it could be useful eventually.

Build for the current product phase.

---

## 15. Current Product Phase

Current target is V1 Trade Intelligence.

Primary workflow:

```text
listing ingestion
      ↓
watch identification
      ↓
image analysis
      ↓
valuation
      ↓
risk analysis
      ↓
offer recommendation
```

Do not prioritize autonomous negotiation, portfolio graph optimization, or generalized marketplace crawling until V1 analysis quality is demonstrated.

---

## 16. Backend Rewrite Guidance

If replacing existing backend code:

1. Preserve useful public contracts only where they still make sense.
2. Do not preserve bad abstractions solely to avoid rewriting code.
3. Keep the extension/backend boundary explicit.
4. Keep OpenAI integration server-side.
5. Keep deterministic economics outside model prompts.
6. Keep storage simple.
7. Prefer understandable modules over generalized frameworks.
8. Add tests around contracts and financial calculations.
9. Do not expand scope during the rewrite.

A clean rewrite is preferable to preserving unnecessary complexity at this stage.

---

## 17. Testing Priorities

Prioritize tests for deterministic behavior.

High-value tests include:

```text
listing contract validation
valuation calculations
trade-alpha calculations
transaction friction
risk adjustments
offer ceilings
state transitions
malformed OpenAI output
missing OPENAI_API_KEY
partial image failure
database persistence
duplicate listing handling
```

Do not rely exclusively on snapshotting model-generated prose.

Where model calls are involved, test the application's behavior around them.

---

## 18. Error Handling

Prefer explicit failures.

Examples:

```text
OPENAI_API_KEY_MISSING
INVALID_LISTING
NO_USABLE_IMAGES
AI_RESPONSE_INVALID
VALUATION_UNAVAILABLE
DATABASE_ERROR
```

Avoid swallowing failures and producing apparently valid financial recommendations from incomplete data.

If confidence is insufficient, represent uncertainty.

---

## 19. Observability

Log operationally useful metadata.

Examples:

```text
request ID
listing ID
source
model used
latency
token usage
analysis status
failure category
```

Do not log:

```text
secrets
full API keys
unnecessarily large raw image payloads
sensitive authenticated browser/session information
```

Cost visibility should eventually be measurable per listing analysis.

---

## 20. Code Quality

Optimize for code that another engineer—or another agent—can understand quickly.

Prefer:

```text
explicit names
small modules
typed contracts
documented boundaries
deterministic functions
few hidden side effects
```

Avoid cleverness.

Do not introduce wrappers around APIs unless they provide an actual architectural benefit.

---

## 21. Documentation Requirement

When an implementation changes an architectural decision, update `ARCHITECTURE.md`.

Examples:

```text
database changes
image policy changes
new marketplace adapters
new trust boundaries
new negotiation authority
new external services
new persistence model
```

Do not allow documentation and implementation to diverge silently.

---

## 22. Before Implementing a Significant Feature

Check:

```text
1. Is this part of the current product phase?
2. Which component owns this responsibility?
3. Can this be deterministic instead of LLM-based?
4. Does this introduce a new trust boundary?
5. Does it expose credentials or authenticated session data?
6. Does it change the human approval boundary?
7. Does ARCHITECTURE.md need updating?
8. Are we adding infrastructure we do not yet need?
```

If the answer exposes an architectural conflict, resolve it explicitly before implementation.

---

## 23. Definition of Done

A feature is not complete merely because it works on the happy path.

Where relevant, completion includes:

```text
typed/validated input
typed/validated output
failure handling
security boundary preserved
tests for deterministic logic
no secrets exposed
reasonable logging
documentation updated if architecture changed
```

---

## 24. Project Philosophy

Project Pepsi should be:

```text
conservative with money
skeptical about authenticity
explicit about uncertainty
simple in architecture
aggressive about eliminating tedious human work
strict about transaction authority
```

The system exists to improve human decision-making and execution efficiency.

It should not create confidence where the evidence does not justify it.

