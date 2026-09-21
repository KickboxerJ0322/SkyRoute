import { ApiError } from './cache.mjs';

export const DEFAULT_TTS_VOICE = 'ja-JP-Wavenet-A';

export function createTts({
  fetcher = fetch,
  voice = process.env.TTS_VOICE || DEFAULT_TTS_VOICE,
} = {}) {
  let token = '';
  let tokenExpiresAt = 0;

  async function accessToken() {
    if (token && Date.now() < tokenExpiresAt - 60000) return token;
    let response;
    try {
      response = await fetcher(
        'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
        { headers: { 'Metadata-Flavor': 'Google' }, signal: AbortSignal.timeout(5000) }
      );
    } catch {
      throw new ApiError(503, 'TTS_AUTH_UNAVAILABLE');
    }
    if (!response.ok) throw new ApiError(503, 'TTS_AUTH_UNAVAILABLE');
    const json = await response.json();
    token = json.access_token || '';
    tokenExpiresAt = Date.now() + Math.max(60, Number(json.expires_in || 300)) * 1000;
    if (!token) throw new ApiError(503, 'TTS_AUTH_UNAVAILABLE');
    return token;
  }

  return async function synthesize(text) {
    if (typeof text !== 'string' || !text.trim()) throw new ApiError(400, 'TTS_TEXT_REQUIRED');
    const clean = text.trim().slice(0, 1600);
    const bearer = await accessToken();
    let response;
    try {
      response = await fetcher('https://texttospeech.googleapis.com/v1/text:synthesize', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${bearer}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input: { text: clean },
          voice: { languageCode: 'ja-JP', name: voice },
          audioConfig: { audioEncoding: 'MP3', speakingRate: 1.02 },
        }),
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new ApiError(504, 'TTS_UNAVAILABLE');
    }
    if (!response.ok) throw new ApiError(response.status >= 500 ? 503 : response.status, 'TTS_UNAVAILABLE');
    const json = await response.json();
    if (!json.audioContent) throw new ApiError(502, 'TTS_INVALID_RESPONSE');
    return { audio: Buffer.from(json.audioContent, 'base64'), voice };
  };
}
