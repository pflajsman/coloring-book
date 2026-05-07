// AI coloring-page generator. Calls our same-origin Azure Function
// (`/api/generate`) which proxies to Pollinations.ai with the secret API key
// attached server-side. The key is never present in the client bundle.
//
// Style suffix and provider-specific URL construction live in the function
// (`api/src/functions/generate.ts`). The client just sends the user's words.

const API_ENDPOINT = '/api/generate';

export class GenerateError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'GenerateError';
  }
}

// Resolves to a decoded ImageBitmap of the AI-generated coloring page, ready
// to letterbox onto the line-art layer.
//
// Throws GenerateError on network failure, non-200 response, or decode
// failure — caller maps these to a friendly retry UI.
export async function generateColoringImage(
  userPrompt: string,
  signal?: AbortSignal,
): Promise<ImageBitmap> {
  const trimmed = userPrompt.trim();
  if (!trimmed) throw new GenerateError('Tell me what to draw.');

  const url = `${API_ENDPOINT}?prompt=${encodeURIComponent(trimmed)}`;

  let res: Response;
  try {
    res = await fetch(url, { signal });
  } catch (e) {
    if (signal?.aborted) throw new GenerateError('Cancelled.');
    throw new GenerateError("Couldn't reach the picture maker. Try again.", e);
  }

  if (!res.ok) {
    // Try to lift the human-friendly error message the function returns.
    let serverMessage: string | undefined;
    try {
      const body = await res.clone().json();
      if (typeof body?.error === 'string') serverMessage = body.error;
    } catch { /* non-JSON; fall back to status-based message */ }

    if (res.status === 429) {
      throw new GenerateError(serverMessage ?? 'Slow down a tiny bit and try again.');
    }
    throw new GenerateError(
      serverMessage ?? `The picture maker said no (${res.status}). Try again.`,
    );
  }

  let blob: Blob;
  try {
    blob = await res.blob();
  } catch (e) {
    throw new GenerateError("Couldn't read the picture. Try again.", e);
  }

  try {
    return await createImageBitmap(blob);
  } catch (e) {
    throw new GenerateError("Couldn't open the picture. Try again.", e);
  }
}
