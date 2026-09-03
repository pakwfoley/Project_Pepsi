import { getDb } from '@/db';

type ListingInput = {
  url: string; rawText?: string; brand: string; model: string; reference: string;
  ask: number; receivedQlv: number; givenQlv: number; cashPaid: number;
  costs: number; riskPenalty: number; liquidityBonus: number;
};

const sourceFromUrl = (url: string) => {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes('reddit')) return 'reddit';
    if (host.includes('ebay')) return 'ebay';
    if (host.includes('facebook')) return 'facebook';
  } catch { /* validated below */ }
  return 'manual';
};

const cents = (value: unknown) => Math.round(Number(value) * 100);

export async function GET() {
  const db = getDb();
  const result = await db.prepare(`
    SELECT l.id, l.url, l.source, l.brand, l.model, l.reference, l.ask_cents AS askCents,
      l.normalization_confidence AS confidence, l.created_at AS createdAt,
      v.economic_alpha_cents AS economicAlphaCents, v.strategic_score_cents AS strategicScoreCents
    FROM listings l JOIN valuations v ON v.listing_id = l.id
    ORDER BY l.created_at DESC LIMIT 8
  `).all();
  return Response.json({ listings: result.results });
}

export async function POST(request: Request) {
  const input = await request.json() as ListingInput;
  if (!input.url || !input.brand?.trim() || !input.model?.trim() || !input.reference?.trim()) {
    return Response.json({ error: 'URL, brand, model, and reference are required.' }, { status: 400 });
  }
  try { new URL(input.url); } catch { return Response.json({ error: 'Enter a valid listing URL.' }, { status: 400 }); }
  const amounts = [input.ask, input.receivedQlv, input.givenQlv, input.cashPaid, input.costs, input.riskPenalty, input.liquidityBonus];
  if (amounts.some((value) => !Number.isFinite(Number(value)) || Number(value) < 0)) {
    return Response.json({ error: 'Valuation inputs must be non-negative numbers.' }, { status: 400 });
  }

  const db = getDb();
  const listingId = crypto.randomUUID();
  const valuationId = crypto.randomUUID();
  const now = new Date().toISOString();
  const received = cents(input.receivedQlv); const given = cents(input.givenQlv);
  const cash = cents(input.cashPaid); const costs = cents(input.costs); const risk = cents(input.riskPenalty);
  const liquidity = cents(input.liquidityBonus);
  const alpha = received - given - cash - costs - risk;
  const strategic = alpha + liquidity;
  const confidence = /^\d{3,}(?:\.\d+){1,}$/.test(input.reference.trim()) || /^[A-Z]\d{4,}/i.test(input.reference.trim()) ? 0.96 : 0.78;

  await db.batch([
    db.prepare(`INSERT INTO listings (id, url, source, raw_text, brand, model, reference, ask_cents, normalization_confidence, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(listingId, input.url, sourceFromUrl(input.url), input.rawText ?? '', input.brand.trim(), input.model.trim(), input.reference.trim().toUpperCase(), cents(input.ask), confidence, now),
    db.prepare(`INSERT INTO valuations (id, listing_id, policy_version, received_qlv_cents, given_qlv_cents, cash_paid_cents, cost_cents, expected_risk_loss_cents, liquidity_adjustment_cents, economic_alpha_cents, strategic_score_cents, created_at)
      VALUES (?, ?, 'mvp-1', ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(valuationId, listingId, received, given, cash, costs, risk, liquidity, alpha, strategic, now),
  ]);
  return Response.json({ id: listingId, economicAlpha: alpha / 100, strategicScore: strategic / 100, confidence }, { status: 201 });
}
