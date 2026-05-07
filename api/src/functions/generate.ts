import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';

// Azure Function proxy for Pollinations.ai image generation. The browser hits
// /api/generate?prompt=<text> on the same origin as the SPA. This handler
// adds the secret API key (read from POLLINATIONS_KEY env var, configured in
// Azure Portal → Static Web App → Application settings) and forwards to
// Pollinations, then streams the PNG back.
//
// The key never leaves the server. The SPA bundle has no idea it exists.

const POLLINATIONS_BASE = 'https://image.pollinations.ai/prompt/';

// Style suffix lives here (server-side) instead of in the client so we can
// tweak the visual style without redeploying the SPA — just change the env
// var or the function and the next image picks it up.
const STYLE_SUFFIX =
  'simple coloring book page, thick black outlines, no shading, white background, line art for kids';

async function handler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  // Accept the prompt either as a query param (simple GET) or in the JSON
  // body (POST). The SPA uses GET; POST is here in case we ever want to send
  // very long prompts that exceed URL length limits.
  let userPrompt: string | null = null;
  if (request.method === 'GET') {
    userPrompt = request.query.get('prompt');
  } else if (request.method === 'POST') {
    try {
      const body = (await request.json()) as { prompt?: string };
      userPrompt = body.prompt ?? null;
    } catch {
      return { status: 400, jsonBody: { error: 'Invalid JSON body.' } };
    }
  } else {
    return { status: 405, jsonBody: { error: 'Use GET or POST.' } };
  }

  if (!userPrompt || !userPrompt.trim()) {
    return { status: 400, jsonBody: { error: 'Missing prompt.' } };
  }
  if (userPrompt.length > 200) {
    // Cap input length so a malicious caller can't push huge prompts through
    // our quota. 200 chars is plenty for "a unicorn riding a fire truck."
    return { status: 400, jsonBody: { error: 'Prompt too long.' } };
  }

  const key = process.env.POLLINATIONS_KEY;
  if (!key) {
    context.error('POLLINATIONS_KEY env var is not set.');
    return {
      status: 500,
      jsonBody: { error: 'Server is missing the picture-maker key.' },
    };
  }

  // Build the upstream URL. Random seed avoids Pollinations' aggressive
  // prompt-level cache so repeat requests don't return the same image.
  const fullPrompt = `${userPrompt.trim()}, ${STYLE_SUFFIX}`;
  const seed = Math.floor(Math.random() * 1_000_000);
  const upstreamUrl =
    POLLINATIONS_BASE +
    encodeURIComponent(fullPrompt) +
    `?width=1024&height=1024&nologo=true&model=flux&seed=${seed}`;

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      headers: { Authorization: `Bearer ${key}` },
    });
  } catch (e) {
    context.error('Pollinations fetch failed:', e);
    return {
      status: 502,
      jsonBody: { error: "Couldn't reach the picture maker. Try again." },
    };
  }

  if (!upstream.ok) {
    // Forward Pollinations' status semantics so the client can react
    // appropriately (429 → "slow down a bit", 5xx → "try again").
    let upstreamMessage = '';
    try {
      upstreamMessage = await upstream.text();
    } catch { /* ignore */ }
    context.warn(`Pollinations ${upstream.status}: ${upstreamMessage.slice(0, 200)}`);
    if (upstream.status === 429) {
      return { status: 429, jsonBody: { error: 'Slow down a tiny bit and try again.' } };
    }
    return {
      status: 502,
      jsonBody: { error: `The picture maker said no (${upstream.status}). Try again.` },
    };
  }

  // Stream the PNG body back unchanged. Buffering keeps the function-call
  // model simple (single invocation, single response); image is ~200-400KB
  // so memory cost is negligible.
  const buf = Buffer.from(await upstream.arrayBuffer());
  return {
    status: 200,
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'image/png',
      // Browser-side, the response is consumed immediately as a Blob; no
      // benefit to caching it. Disable caching so each request actually hits
      // Pollinations and produces a fresh image.
      'Cache-Control': 'no-store',
    },
    body: buf,
  };
}

app.http('generate', {
  methods: ['GET', 'POST'],
  authLevel: 'anonymous',
  route: 'generate',
  handler,
});
