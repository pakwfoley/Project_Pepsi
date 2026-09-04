import { env } from 'cloudflare:workers';

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';

type OpenAIResponse = {
  id?: string;
  model?: string;
  output_text?: string;
  error?: { message?: string };
};

export async function POST() {
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return Response.json(
      {
        ok: false,
        code: 'OPENAI_API_KEY_MISSING',
        error: 'OpenAI connectivity is not configured. Add the OPENAI_API_KEY server-side secret to the Sites runtime.',
      },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    );
  }

  try {
    const upstream = await fetch(OPENAI_RESPONSES_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-5.4-mini',
        input: 'Reply with exactly: Project Pepsi connected',
        max_output_tokens: 32,
        store: false,
      }),
    });

    const result = (await upstream.json()) as OpenAIResponse;
    if (!upstream.ok) {
      return Response.json(
        {
          ok: false,
          code: 'OPENAI_CONNECTION_FAILED',
          error: 'OpenAI rejected the connectivity check. Verify the server-side key, project access, and API billing.',
          upstreamStatus: upstream.status,
        },
        { status: 502, headers: { 'cache-control': 'no-store' } },
      );
    }

    return Response.json(
      {
        ok: true,
        message: result.output_text || 'Project Pepsi connected',
        model: result.model || 'gpt-5.4-mini',
        responseId: result.id || null,
      },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch {
    return Response.json(
      {
        ok: false,
        code: 'OPENAI_UNREACHABLE',
        error: 'The server could not reach OpenAI. Try the connectivity check again shortly.',
      },
      { status: 502, headers: { 'cache-control': 'no-store' } },
    );
  }
}
