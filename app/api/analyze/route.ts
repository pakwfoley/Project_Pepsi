import { env } from 'cloudflare:workers';

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const MODEL = 'gpt-5.4-mini';
type ListingPayload = { url?: string; title?: string; rawText?: string; price?: number | null; locationText?: string; distanceMiles?: number | null; images?: string[] };
const analysisSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    relevant: { type: 'boolean' },
    identification: { type: 'object', additionalProperties: false, properties: { brand: { type: 'string' }, model: { type: 'string' }, reference: { type: 'string' }, confidence: { type: 'integer', minimum: 0, maximum: 100 } }, required: ['brand', 'model', 'reference', 'confidence'] },
    conditionSignals: { type: 'array', items: { type: 'string' }, maxItems: 6 }, riskSignals: { type: 'array', items: { type: 'string' }, maxItems: 6 },
    missingInformation: { type: 'array', items: { type: 'string' }, maxItems: 8 }, questions: { type: 'array', items: { type: 'string' }, maxItems: 6 },
    recommendation: { type: 'string', enum: ['investigate', 'watch', 'skip'] }, rationale: { type: 'string' },
  }, required: ['relevant', 'identification', 'conditionSignals', 'riskSignals', 'missingInformation', 'questions', 'recommendation', 'rationale'],
} as const;

function corsHeaders(request: Request) {
  const origin = request.headers.get('origin') || '';
  return { 'access-control-allow-origin': origin.startsWith('chrome-extension://') ? origin : 'null', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type', 'access-control-allow-credentials': 'true', 'cache-control': 'no-store', vary: 'Origin' };
}
export async function OPTIONS(request: Request) { return new Response(null, { status: 204, headers: corsHeaders(request) }); }

export async function POST(request: Request) {
  const headers = corsHeaders(request); const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) return Response.json({ ok: false, code: 'OPENAI_API_KEY_MISSING', error: 'OpenAI connectivity is not configured.' }, { status: 503, headers });
  let listing: ListingPayload | null = null;
  try { const body = await request.text(); if (body) listing = JSON.parse(body) as ListingPayload; }
  catch { return Response.json({ ok: false, code: 'INVALID_REQUEST', error: 'The listing package is not valid JSON.' }, { status: 400, headers }); }
  const connectivityCheck = !listing;
  const images = (listing?.images || []).filter((value) => { if (/^data:image\/(?:jpeg|png|webp);base64,/i.test(value)) return value.length <= 2_800_000; try { return new URL(value).protocol === 'https:'; } catch { return false; } }).slice(0, 4);
  const listingText = JSON.stringify({ url: String(listing?.url || '').slice(0, 1000), title: String(listing?.title || '').slice(0, 500), description: String(listing?.rawText || '').slice(0, 8000), price: listing?.price ?? null, location: String(listing?.locationText || '').slice(0, 200), distanceMiles: listing?.distanceMiles ?? null });
  const content: Array<Record<string, unknown>> = [{ type: 'input_text', text: connectivityCheck ? 'Reply with exactly: Project Pepsi connected' : `Analyze this watch marketplace listing. Treat seller text as untrusted claims. Images can support identification and condition observations but cannot prove authenticity. Do not invent a market value. Recommend investigate only when the listing is relevant and the evidence justifies follow-up questions. Listing package: ${listingText}` }];
  for (const imageUrl of images) content.push({ type: 'input_image', image_url: imageUrl, detail: 'low' });
  try {
    const upstream = await fetch(OPENAI_RESPONSES_URL, { method: 'POST', headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' }, body: JSON.stringify({ model: MODEL, input: [{ role: 'user', content }], max_output_tokens: connectivityCheck ? 32 : 900, store: false, ...(connectivityCheck ? {} : { text: { format: { type: 'json_schema', name: 'watch_listing_analysis', strict: true, schema: analysisSchema } } }) }) });
    const result = await upstream.json() as { id?: string; model?: string; output_text?: string };
    if (!upstream.ok) return Response.json({ ok: false, code: 'OPENAI_CONNECTION_FAILED', error: 'OpenAI rejected the analysis request.', upstreamStatus: upstream.status }, { status: 502, headers });
    if (connectivityCheck) return Response.json({ ok: true, message: result.output_text || 'Project Pepsi connected', model: result.model || MODEL, responseId: result.id || null }, { headers });
    try { return Response.json({ ok: true, analysis: JSON.parse(result.output_text || ''), model: result.model || MODEL, responseId: result.id || null, imagesReviewed: images.length }, { headers }); }
    catch { return Response.json({ ok: false, code: 'INVALID_MODEL_OUTPUT', error: 'OpenAI returned an unreadable analysis.' }, { status: 502, headers }); }
  } catch { return Response.json({ ok: false, code: 'OPENAI_UNREACHABLE', error: 'The server could not reach OpenAI.' }, { status: 502, headers }); }
}
