import { env } from 'cloudflare:workers';

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const MODEL = 'gpt-5.4-mini';
type CapturedImage = { contractVersion?: number; imageIndex?: number; sourceUrl?: string; sourceType?: string; mediaType?: string; originalWidth?: number; originalHeight?: number; width?: number; height?: number; longEdge?: number; quality?: number; byteLength?: number; dataUrl?: string };
type ListingPayload = { url?: string; title?: string; rawText?: string; price?: number | null; locationText?: string; distanceMiles?: number | null; images?: CapturedImage[] };
const analysisSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    relevant: { type: 'boolean' },
    identification: { type: 'object', additionalProperties: false, properties: { brand: { type: 'string' }, model: { type: 'string' }, reference: { type: 'string' }, confidence: { type: 'integer', minimum: 0, maximum: 100 } }, required: ['brand', 'model', 'reference', 'confidence'] },
    conditionSignals: { type: 'array', items: { type: 'string' }, maxItems: 6 }, riskSignals: { type: 'array', items: { type: 'string' }, maxItems: 6 },
    imageClassifications: { type: 'array', maxItems: 6, items: { type: 'object', additionalProperties: false, properties: { imageIndex: { type: 'integer' }, category: { type: 'string', enum: ['dial/front', 'caseback', 'clasp/bracelet', 'side/crown', 'movement', 'serial/reference/engraving', 'box/papers', 'wrist shot', 'other'] }, confidence: { type: 'integer', minimum: 0, maximum: 100 }, observations: { type: 'array', items: { type: 'string' }, maxItems: 5 } }, required: ['imageIndex', 'category', 'confidence', 'observations'] } },
    completenessAssessment: { type: 'array', items: { type: 'string' }, maxItems: 6 }, valuationObservations: { type: 'array', items: { type: 'string' }, maxItems: 8 },
    missingInformation: { type: 'array', items: { type: 'string' }, maxItems: 8 }, questions: { type: 'array', items: { type: 'string' }, maxItems: 6 },
    recommendation: { type: 'string', enum: ['investigate', 'watch', 'skip'] }, rationale: { type: 'string' },
  }, required: ['relevant', 'identification', 'imageClassifications', 'conditionSignals', 'riskSignals', 'completenessAssessment', 'valuationObservations', 'missingInformation', 'questions', 'recommendation', 'rationale'],
} as const;

function corsHeaders(request: Request) {
  const origin = request.headers.get('origin') || '';
  return { 'access-control-allow-origin': origin.startsWith('chrome-extension://') ? origin : 'null', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type', 'access-control-allow-credentials': 'true', 'cache-control': 'no-store', vary: 'Origin' };
}
export async function OPTIONS(request: Request) { return new Response(null, { status: 204, headers: corsHeaders(request) }); }

function responseText(result: { output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string }> }> }) {
  if (result.output_text) return result.output_text;
  return (result.output || []).flatMap((item) => item.content || []).filter((item) => item.type === 'output_text').map((item) => item.text || '').join('');
}

export async function POST(request: Request) {
  const headers = corsHeaders(request); const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) return Response.json({ ok: false, code: 'OPENAI_API_KEY_MISSING', error: 'OpenAI connectivity is not configured.' }, { status: 503, headers });
  let listing: ListingPayload | null = null;
  try { const body = await request.text(); if (body) listing = JSON.parse(body) as ListingPayload; }
  catch { return Response.json({ ok: false, code: 'INVALID_REQUEST', error: 'The listing package is not valid JSON.' }, { status: 400, headers }); }
  const connectivityCheck = !listing;
  const rejectedImages: number[] = [];
  const images = (listing?.images || []).slice(0, 6).filter((image) => {
    const valid = Number.isInteger(image.imageIndex) && Number(image.width) > 0 && Number(image.height) > 0 && Math.max(Number(image.width), Number(image.height)) <= 2048 && Number(image.byteLength) > 0 && Number(image.byteLength) <= 2_000_000 && /^data:image\/(?:jpeg|webp);base64,/i.test(image.dataUrl || '');
    if (!valid) rejectedImages.push(Number(image.imageIndex)); return valid;
  });
  const listingText = JSON.stringify({ url: String(listing?.url || '').slice(0, 1000), title: String(listing?.title || '').slice(0, 500), description: String(listing?.rawText || '').slice(0, 8000), price: listing?.price ?? null, location: String(listing?.locationText || '').slice(0, 200), distanceMiles: listing?.distanceMiles ?? null });
  const content: Array<Record<string, unknown>> = [{ type: 'input_text', text: connectivityCheck ? 'Reply with exactly: Project Pepsi connected' : `Analyze this watch marketplace listing and all supplied images collectively, regardless of their order. Treat seller text as untrusted claims. Classify every submitted image by its imageIndex. Use visible evidence for identification, condition, completeness, authenticity-risk signals, and valuation-relevant observations, but never claim definitive authentication or invent a market value. Listing package: ${listingText}` }];
  for (const image of images) { content.push({ type: 'input_text', text: `Next image metadata: imageIndex=${image.imageIndex}; sourceType=${String(image.sourceType || 'unknown')}; dimensions=${image.width}x${image.height}; originalDimensions=${image.originalWidth || 0}x${image.originalHeight || 0}.` }); content.push({ type: 'input_image', image_url: image.dataUrl, detail: 'high' }); }
  try {
    const upstream = await fetch(OPENAI_RESPONSES_URL, { method: 'POST', headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' }, body: JSON.stringify({ model: MODEL, input: [{ role: 'user', content }], max_output_tokens: connectivityCheck ? 32 : 900, store: false, ...(connectivityCheck ? {} : { text: { format: { type: 'json_schema', name: 'watch_listing_analysis', strict: true, schema: analysisSchema } } }) }) });
    const result = await upstream.json() as { id?: string; model?: string; output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string }> }> };
    if (!upstream.ok) return Response.json({ ok: false, code: 'OPENAI_CONNECTION_FAILED', error: 'OpenAI rejected the analysis request.', upstreamStatus: upstream.status }, { status: 502, headers });
    const text = responseText(result);
    if (connectivityCheck) return Response.json({ ok: true, message: text || 'Project Pepsi connected', model: result.model || MODEL, responseId: result.id || null }, { headers });
    try { return Response.json({ ok: true, analysis: JSON.parse(text), model: result.model || MODEL, responseId: result.id || null, ingestion: { contractVersion: 1, submittedImages: images.map(({ dataUrl: _dataUrl, ...metadata }) => metadata), rejectedImageIndexes: rejectedImages } }, { headers }); }
    catch { return Response.json({ ok: false, code: 'INVALID_MODEL_OUTPUT', error: 'OpenAI returned an unreadable analysis.' }, { status: 502, headers }); }
  } catch { return Response.json({ ok: false, code: 'OPENAI_UNREACHABLE', error: 'The server could not reach OpenAI.' }, { status: 502, headers }); }
}
