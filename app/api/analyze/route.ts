import { railway } from '@/app/api/_railway';

function corsHeaders(request: Request) {
  const origin = request.headers.get('origin') || '';
  return {
    'access-control-allow-origin': origin.startsWith('chrome-extension://') ? origin : 'null',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-allow-credentials': 'true',
    vary: 'Origin',
  };
}

function withCors(response: Response, request: Request) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders(request))) headers.set(key, value);
  return new Response(response.body, { status: response.status, headers });
}

export async function OPTIONS(request: Request) { return new Response(null, { status: 204, headers: corsHeaders(request) }); }
export async function GET(request: Request) { return withCors(await railway(request, '/api/analyze'), request); }
export async function POST(request: Request) { return withCors(await railway(request, '/api/analyze'), request); }
