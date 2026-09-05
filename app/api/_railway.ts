const RAILWAY_ORIGIN = 'https://projectpepsi-production.up.railway.app';

export async function railway(request: Request, pathname: string) {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return Response.json({ error: 'Sign in to Project Pepsi.', code: 'UNAUTHORIZED' }, { status: 401 });
  const upstream = await fetch(`${RAILWAY_ORIGIN}${pathname}`, {
    method: request.method,
    headers: { authorization, 'content-type': request.headers.get('content-type') || 'application/json' },
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.arrayBuffer(),
  });
  const headers = new Headers();
  headers.set('content-type', upstream.headers.get('content-type') || 'application/json');
  headers.set('cache-control', 'no-store');
  return new Response(upstream.body, { status: upstream.status, headers });
}
