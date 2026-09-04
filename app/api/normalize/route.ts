const brands = ['Rolex', 'Omega', 'Tudor', 'Breitling', 'Cartier', 'IWC', 'Grand Seiko', 'Longines', 'Hamilton', 'Tag Heuer'];
const knownModels: Record<string, string[]> = {
  Rolex: ['GMT-Master II', 'Submariner', 'Explorer', 'Datejust', 'Daytona'],
  Omega: ['Seamaster Diver 300M', 'Seamaster', 'Speedmaster', 'Aqua Terra'],
  Tudor: ['Black Bay 58', 'Black Bay', 'Pelagos', 'Ranger'],
  Breitling: ['Navitimer', 'Superocean'], Cartier: ['Santos', 'Tank'], IWC: ['Pilot', 'Portugieser'],
  'Grand Seiko': ['Heritage', 'Evolution 9'], Longines: ['Spirit', 'HydroConquest'],
  Hamilton: ['Khaki Field'], 'Tag Heuer': ['Carrera', 'Monaco'],
};
const allowedHosts = ['reddit.com', 'ebay.com', 'facebook.com', 'chrono24.com', 'watchuseek.com'];
const hostAllowed = (host: string) => allowedHosts.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
const cleanPrice = (value: string) => Number(value.replace(/[$,\s]/g, ''));
const decodeHtml = (value: string) => value.replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16))).replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)));
const htmlToText = (html: string) => decodeHtml(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')).slice(0, 120_000);

async function limitedText(response: Response) {
  if (!response.body) return '';
  const reader = response.body.getReader(); const decoder = new TextDecoder(); let output = ''; let size = 0;
  while (size < 500_000) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; output += decoder.decode(value, { stream: true }); }
  void reader.cancel(); return output;
}

async function fetchMarketplaceText(rawUrl: string) {
  if (!rawUrl) return { text: '', source: 'manual', fetched: false, warning: '' };
  let url: URL;
  try { url = new URL(rawUrl); } catch { return { text: '', source: 'manual', fetched: false, warning: 'Enter a valid URL.' }; }
  if (url.protocol !== 'https:' || !hostAllowed(url.hostname.toLowerCase())) return { text: '', source: 'unsupported', fetched: false, warning: 'Automatic URL reading supports Reddit, eBay, Facebook, Chrono24, and Watchuseek.' };
  const source = allowedHosts.find((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))?.replace('.com', '') ?? 'marketplace';
  const target = source === 'reddit' && !url.pathname.endsWith('.json') ? new URL(`${url.origin}${url.pathname.replace(/\/$/, '')}.json?raw_json=1`) : url;
  try {
    const options = { redirect: 'manual' as const, headers: { 'user-agent': 'ProjectPepsi/0.1 listing-analyzer', accept: source === 'reddit' ? 'application/json,text/html' : 'text/html,application/xhtml+xml' } };
    let current = target; let response = await fetch(current, options);
    for (let hop = 0; hop < 2 && response.status >= 300 && response.status < 400; hop += 1) {
      const location = response.headers.get('location'); if (!location) break;
      const next = new URL(location, current); if (next.protocol !== 'https:' || !hostAllowed(next.hostname.toLowerCase())) break;
      current = next; response = await fetch(current, options);
    }
    if (!response.ok && source === 'reddit') response = await fetch(new URL(url.pathname, 'https://old.reddit.com'), options);
    if (response.status >= 300 && response.status < 400) return { text: '', source, fetched: false, warning: 'The marketplace redirected outside its supported domain. Paste the listing text instead.' };
    if (!response.ok) return { text: '', source, fetched: false, warning: `${source} blocked automated reading (${response.status}). Paste the listing text instead.` };
    const body = await limitedText(response);
    if (source === 'reddit' && response.headers.get('content-type')?.includes('json')) {
      const data = JSON.parse(body); const post = data?.[0]?.data?.children?.[0]?.data;
      return { text: `${post?.title ?? ''} ${post?.selftext ?? ''}`, source, fetched: true, warning: '' };
    }
    const metadata = [...body.matchAll(/<meta[^>]+(?:property|name)=["'](?:og:title|og:description|description)["'][^>]+content=["']([^"']+)["'][^>]*>/gi)].map((match) => match[1]).join(' ');
    return { text: `${decodeHtml(metadata)} ${htmlToText(body)}`, source, fetched: true, warning: '' };
  } catch { return { text: '', source, fetched: false, warning: `Could not reach ${source}. Paste the listing text instead.` }; }
}

export async function POST(request: Request) {
  const { url = '', text = '' } = await request.json() as { url?: string; text?: string };
  const remote = await fetchMarketplaceText(url);
  const corpus = `${remote.text} ${text} ${decodeURIComponent(url)}`.replace(/[_-]+/g, ' ');
  const brand = brands.find((candidate) => new RegExp(`\\b${candidate.replace(' ', '\\s+')}\\b`, 'i').test(corpus)) ?? '';
  const model = brand ? (knownModels[brand] ?? []).find((candidate) => corpus.toLowerCase().includes(candidate.toLowerCase())) ?? '' : '';
  const referencePatterns = [/\b\d{3}\.\d{2}\.\d{2}\.\d{2}\.\d{2}\.\d{3}\b/, /\bM?\d{4,6}[A-Z]{0,3}(?:-\d{4})?\b/i, /\b[A-Z]{2,4}\d{3,6}[A-Z0-9.-]*\b/i];
  const reference = referencePatterns.map((pattern) => corpus.match(pattern)?.[0]).find(Boolean)?.toUpperCase() ?? '';
  const priceMatches = [...corpus.matchAll(/(?:\$|USD\s*)\s*((?:[1-9]\d{0,2}(?:,\d{3})+)|(?:[1-9]\d{2,5}))/gi)].map((match) => cleanPrice(match[1])).filter((price) => price >= 200 && price <= 250_000);
  const ask = priceMatches.length ? priceMatches[0] : null;
  const found = [brand, model, reference, ask].filter(Boolean).length;
  const evidence = [remote.fetched && `Read ${remote.source} listing page`, brand && `Brand “${brand}” found`, model && `Model “${model}” found`, reference && `Reference pattern “${reference}” found`, ask && `First explicit asking price ${ask}`].filter(Boolean);
  return Response.json({ brand, model, reference, ask, source: remote.source, fetched: remote.fetched, warning: remote.warning, confidence: Number((found / 4).toFixed(2)), evidence, missing: [!brand && 'brand', !model && 'model', !reference && 'reference', !ask && 'asking price'].filter(Boolean) });
}
