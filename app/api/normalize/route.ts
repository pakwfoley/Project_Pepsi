const brands = ['Rolex', 'Omega', 'Tudor', 'Breitling', 'Cartier', 'IWC', 'Grand Seiko', 'Longines', 'Hamilton', 'Tag Heuer'];
const knownModels: Record<string, string[]> = {
  Rolex: ['GMT-Master II', 'Submariner', 'Explorer', 'Datejust', 'Daytona'],
  Omega: ['Seamaster Diver 300M', 'Seamaster', 'Speedmaster', 'Aqua Terra'],
  Tudor: ['Black Bay 58', 'Black Bay', 'Pelagos', 'Ranger'],
  Breitling: ['Navitimer', 'Superocean'], Cartier: ['Santos', 'Tank'],
  IWC: ['Pilot', 'Portugieser'], 'Grand Seiko': ['Heritage', 'Evolution 9'],
  Longines: ['Spirit', 'HydroConquest'], Hamilton: ['Khaki Field'], 'Tag Heuer': ['Carrera', 'Monaco'],
};

const cleanPrice = (value: string) => Number(value.replace(/[$,\s]/g, ''));

export async function POST(request: Request) {
  const { url = '', text = '' } = await request.json() as { url?: string; text?: string };
  const corpus = `${decodeURIComponent(url)} ${text}`.replace(/[_-]+/g, ' ');
  const brand = brands.find((candidate) => new RegExp(`\\b${candidate.replace(' ', '\\s+')}\\b`, 'i').test(corpus)) ?? '';
  const model = brand ? (knownModels[brand] ?? []).find((candidate) => corpus.toLowerCase().includes(candidate.toLowerCase())) ?? '' : '';
  const referencePatterns = [
    /\b\d{3}\.\d{2}\.\d{2}\.\d{2}\.\d{2}\.\d{3}\b/,
    /\bM?\d{4,6}[A-Z]{0,3}(?:-\d{4})?\b/i,
    /\b[A-Z]{2,4}\d{3,6}[A-Z0-9.-]*\b/i,
  ];
  const reference = referencePatterns.map((pattern) => corpus.match(pattern)?.[0]).find(Boolean)?.toUpperCase() ?? '';
  const priceMatches = [...text.matchAll(/(?:\$|USD\s*)\s*((?:[1-9]\d{0,2}(?:,\d{3})+)|(?:[1-9]\d{2,5}))/gi)].map((match) => cleanPrice(match[1]));
  const ask = priceMatches.length ? priceMatches[0] : null;
  const found = [brand, model, reference, ask].filter(Boolean).length;
  const evidence = [brand && `Brand “${brand}” found`, model && `Model “${model}” found`, reference && `Reference pattern “${reference}” found`, ask && `First explicit asking price ${ask}`].filter(Boolean);
  return Response.json({ brand, model, reference, ask, confidence: Number((found / 4).toFixed(2)), evidence, missing: [!brand && 'brand', !model && 'model', !reference && 'reference', !ask && 'asking price'].filter(Boolean) });
}
