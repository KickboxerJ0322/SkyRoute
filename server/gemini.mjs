import { ApiError } from './cache.mjs';

export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite';

export function createFlightCommentator({
  key = process.env.GEMINI_API_KEY,
  model = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL,
  fetcher = fetch,
} = {}) {
  return async function comment(payload) {
    if (!key || key === 'YOUR_GEMINI_API_KEY') throw new ApiError(503, 'AI_NOT_CONFIGURED');

    const systemInstruction = [
      'あなたはSkyRouteの航空データ解説AIです。日本語で簡潔に説明してください。',
      '入力はAeroAPIなどの公開データです。入力にない事実は作らないでください。',
      '「事実」「推測」を明確に分け、予定通りかどうかは予定/推定/実績時刻や遅延値がある場合だけ評価してください。',
      'ルート逸脱の有無は評価・言及しないでください。Filed Route座標や textualRoute は、取得できている内容を事実として紹介するだけにしてください。',
      '事故・緊急事態・安全性は、このデータだけでは確認できません。事故が起きていないと断定しないでください。',
      '以下12項目を必ず順番に触れてください。値がない項目は「取得できず」と明記してください。',
      '1. 現在緯度・経度、2. 高度、3. 対地速度、4. 方位、5. 上昇/下降情報、6. 位置情報ソース、7. 目的地までのおおよその残距離、8. Filed Route座標、9. Filed Route文字列、10. Actual Track、11. 出発/到着予定・実績・遅延、12. 出発空港・到着空港の天候。',
      'weather は空港METAR観測として説明し、航空機現在位置の天候と誤認しないでください。',
      '位置更新停止、欠損、推定高度だけを事故の兆候と扱わないでください。',
      '出力は420〜700文字程度。「現在の状況」「飛行データ」「天候」「安全に関する注意」の順で簡潔にまとめてください。「飛行データ」では12項目を番号付きで示してください。',
    ].join('\n');

    const body = {
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents: [{
        role: 'user',
        parts: [{ text: '次のフライトデータを解説してください。\n' + JSON.stringify(payload) }],
      }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 420,
      },
    };

    let response;
    try {
      response = await fetcher(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(15000),
        }
      );
    } catch {
      throw new ApiError(504, 'AI_UNAVAILABLE');
    }

    if (!response.ok) {
      if ([401, 403].includes(response.status)) throw new ApiError(response.status, 'AI_KEY_ERROR');
      if (response.status === 429) throw new ApiError(429, 'AI_RATE_LIMIT');
      throw new ApiError(response.status >= 500 ? 503 : 502, 'AI_UNAVAILABLE');
    }

    let json;
    try { json = await response.json(); }
    catch { throw new ApiError(502, 'AI_INVALID_RESPONSE'); }

    const text = (json.candidates?.[0]?.content?.parts || [])
      .map(part => typeof part.text === 'string' ? part.text : '')
      .join('')
      .trim();

    if (!text) throw new ApiError(502, 'AI_INVALID_RESPONSE');
    return { text, model };
  };
}
