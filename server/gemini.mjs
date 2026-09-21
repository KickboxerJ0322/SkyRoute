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
      'あなたはSkyRouteの航空データ解説AIです。専門知識のない人が、そのまま音声で聞いて理解できる自然な日本語で説明してください。',
      '入力はAeroAPIなどの公開データです。入力にない事実は作らないでください。',
      '予定通りかどうかは予定/推定/実績時刻や遅延値がある場合だけ評価してください。コードや略語をそのまま読まず、意味を日本語に言い換えてください。たとえば ENROUTE は「飛行中」、C は「上昇中」、D は「下降中」、A は可能なら位置情報源の意味を説明してください。',
      'ルート逸脱の有無は評価・言及しないでください。Filed Route座標や textualRoute は、取得できている内容を事実として紹介するだけにしてください。',
      '事故・緊急事態・安全性は、このデータだけでは確認できません。事故が起きていないと断定しないでください。',
      '以下12項目を必ず順番に触れてください。値がない項目は「取得できず」と明記してください。単なる数値の読み上げで終わらず、一般の人向けの意味も添えてください。',
      '1. 現在緯度・経度。緯度経度だけでなく、おおまかにどの都道府県・湾・地域の上空かを推定し、確信が弱ければ「付近」と表現する。2. 高度。旅客機として上昇中・巡航前・巡航高度付近など意味も説明する。3. 対地速度。一般的な旅客機の速度感と比べた意味も簡潔に説明する。4. 方位。度数だけでなく「南西方向」など8方位で説明する。5. 上昇/下降情報。コードは日本語に直す。6. 位置情報ソース。コードだけを読まず、分かる範囲で意味を説明する。7. 目的地までのおおよその残距離。8. Filed Route座標。9. Filed Route文字列。10. Actual Track。何地点記録され、どの程度の実航跡があるかを説明する。11. 出発/到着予定・実績・遅延。時刻は可能なら日本時間として読みやすく説明する。12. 出発空港・到着空港の天候。METARの略語をそのまま読まず、雨・視程・気温・風向・風速を平易に説明する。',
      'weather は空港METAR観測として説明し、航空機現在位置の天候と誤認しないでください。',
      '位置更新停止、欠損、推定高度だけを事故の兆候と扱わないでください。',
      '出力は650〜1100文字程度。「現在の状況」「飛行データ」「天候」「安全に関する注意」の順でまとめてください。「飛行データ」では12項目を番号付きで示してください。Markdownの太字記号など読み上げに不要な装飾記号は使わないでください。文の途中で終わらず、必ず最後まで完結させてください。',
    ].join('\n');

    const body = {
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents: [{
        role: 'user',
        parts: [{ text: '次のフライトデータを解説してください。\n' + JSON.stringify(payload) }],
      }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 1400,
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
