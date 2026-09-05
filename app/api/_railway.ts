import { env } from 'cloudflare:workers';

const RAILWAY_ORIGIN = 'https://projectpepsi-production.up.railway.app';

export async function railway(request: Request, pathname: string) {
  const token = env.RAILWAY_API_TOKEN?.trim();
  if (!token) return Response.json({ error: 'Railway backend authentication is not configured.', code: 'RAILWAY_API_TOKEN_MISSING' }, { status: 503 });
  const upstream = await fetch(`${RAILWAY_ORIGIN}${pathname}`, {
    method: request.method,
    headers: { authorization: `Bearer ${token}`, 'content-type': request.headers.get('content-type') || 'application/json' },
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.arrayBuffer(),
  });
  const headers = new Headers();
  headers.set('content-type', upstream.headers.get('content-type') || 'application/json');
  headers.set('cache-control', 'no-store');
  return new Response(upstream.body, { status: upstream.status, headers });
}
