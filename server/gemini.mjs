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
      '入力には多くの項目がありますが、重要なものを優先して説明してください。すべての項目を必ず列挙する必要はありません。単なる数値の読み上げで終わらず、一般の人向けの意味も添えてください。',
      '優先順位は、現在地とおおまかな地域、高度、速度、進行方向、上昇・下降、目的地までの残距離、実際の航跡、出発・到着時刻と遅延、METAR、TAF、SIGMET、出発・到着空港のNOWCASTです。Filed Route座標やFiled Route文字列が空・null・取得不能なら、その欠損自体を説明する必要はありません。取得できている場合だけ短く触れてください。',
      'weather.origin / weather.destination には metar（空港の現在観測）と taf（空港の予報）が入ります。METARとTAFを混同せず、TAFは予報として説明してください。航空機現在位置の天候と誤認しないでください。',
      'sigmet は現在有効で航路周辺に抽出された航空向け危険気象情報です。count が0なら「航路周辺に現在有効なSIGMETは確認されていません」と表現できますが、安全を保証する意味にはしないでください。SIGMETがある場合は現象、有効時間、高度帯を簡潔に説明してください。',
      'nowcast は気象庁の降水・雷・竜巻発生確度ナウキャストを出発・到着空港について構造化した情報です。current は現在、forecast60 は約60分後、center は空港直上、nearbyMax は周辺約10kmの最大値です。thunder.level は雷活動度1〜4、tornado.level は竜巻など激しい突風の発生確度1〜2です。竜巻発生確度を竜巻の実際の観測や発生確定と表現しないでください。航空機の巡航高度の天候とはみなさないでください。',
      'NOWCASTの status が available でない場合は雨がないと断定せず、「判定できません」または「明瞭な降水階級を確認できません」としてください。',
      'demo=true の場合、機体位置・高度・速度・航路はシミュレーションですが、sigmet と nowcast は現在の実世界データです。この区別を短く明示し、シミュレーション位置の天候を実測と断定しないでください。',
      '位置更新停止、欠損、推定高度だけを事故の兆候と扱わないでください。',
      '出力はおおむね450〜800文字以内。「現在の状況」「飛行データ」「天候」「安全に関する注意」の順で、重要な点だけを簡潔にまとめてください。番号付きの全項目列挙は不要です。Markdownの太字記号など読み上げに不要な装飾記号は使わないでください。文の途中で終わらず、必ず最後まで完結させてください。',
    ].join('\n');

    const body = {
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents: [{
        role: 'user',
        parts: [{ text: '次のフライトデータを解説してください。\n' + JSON.stringify(payload) }],
      }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 950,
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
    const compact = text.length <= 800 ? text : (() => {
      const slice = text.slice(0, 800);
      const end = Math.max(slice.lastIndexOf('。'), slice.lastIndexOf('！'), slice.lastIndexOf('？'));
      return end >= 520 ? slice.slice(0, end + 1) : slice;
    })();
    return { text: compact, model };
  };
}
