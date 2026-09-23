import type { TelemetryData, FlightRoute } from '../flight/types';
import { escapeHtml } from './LiveFlightView';

/** Fixed scripts for the four fictional flights. No external AI or live data is used. */
export const demoCommentary: Record<string, string> = {
  'hnd-cts': '【デモ用の仮のAI解説】羽田を離れたSR 511便は、東京湾を抜けて東北地方の上空を北上し、新千歳へ向かう想定です。離陸後は千葉沿岸から茨城付近にかけて高度を上げ、仙台・盛岡方面で巡航する航路を描いています。画面で高度が上がり、速度が安定していく様子から、上昇段階から巡航段階への移り変わりを観察できます。終盤は津軽海峡を越え、苫小牧方面から新千歳へ向けて降下します。実際の便は風向きや航空管制の指示によって経路も高度も変わります。この説明と航路は演出用の仮データで、現在の運航や気象を示すものではありません。',
  'hnd-itm': '【デモ用の仮のAI解説】SR 115便は羽田から大阪国際空港へ向かう短距離便を想定しています。東京湾で進路を変え、三浦半島、相模湾、駿河湾の近くを通って西へ進みます。富士山周辺を通過した後、浜松、三河湾方面で巡航し、鈴鹿から奈良盆地付近で降下に移る構成です。飛行時間が比較的短いため、画面上では上昇、巡航、降下の切り替わりが続けて見られます。伊丹への最終進入では高度と速度の変化に注目してください。地名や経路はデモを分かりやすくするために設定したもので、実便の飛行計画、現在位置や気象を取得した結果ではありません。',
  'hnd-fuk': '【デモ用の仮のAI解説】SR 317便は羽田から福岡へ向かう飛行を再現しています。東京湾を出て小田原付近から西へ進み、東海地方を経て瀬戸内海側へ向かう想定の航路です。巡航中は一定に近い高度と速度を保ち、福岡に近づくにつれて段階的に降下します。航路の青い線と機体の位置を見比べると、再生の進捗に応じた移動や旋回が分かります。到着前には北九州方面を通過し、福岡空港へ進入する構成です。ただし、ここに表示する地点、高度、速度はアプリ内で設定したシミュレーションです。実際の航空管制、空域の制約、天候を反映した案内ではありません。',
  'hnd-oka': '【デモ用の仮のAI解説】SR 903便は羽田から那覇へ向かう南西方向の飛行を想定しています。東京湾から伊豆諸島方面を経て太平洋上を進み、沖縄本島に近づくと高度を下げる設定です。長い海上区間では画面上の巡航高度や速度が比較的安定し、到着が近づくと降下と進路変更が見られます。機体の向きとカメラの追従を切り替えながら、離陸から着陸までの動きを確認してください。海上の経路は実際の航空路や飛行計画を保証するものではありません。この文章も説明用に用意した仮の解説で、AIが運航情報や気象を取得・分析した結果ではありません。',
};

/** Simulated departures use the same flight information layout as LIVE. */
export class FlightInfo {
  private currentRoute: FlightRoute | null = null;
  constructor(private container: HTMLElement) {}

  setRoute(route: FlightRoute): void {
    this.currentRoute = route;
    const flight = escapeHtml(route.flightNumber);
    const origin = escapeHtml(route.origin.code);
    const destination = escapeHtml(route.destination.code);
    const aircraft = escapeHtml(route.aircraftType);
    this.container.innerHTML = `<div class="flight-info-hud live-info">
      <div class="hud-top-bar"><span class="hud-route-text">${flight} · ${origin} → ${destination}</span><span class="phase-pill">DEMO</span></div>
      <div class="live-airports">${escapeHtml(route.origin.name)} → ${escapeHtml(route.destination.name)}</div>
      <div class="live-metadata">Operated by ${escapeHtml(route.airline)} · Simulated flight<br>Aircraft: ${aircraft}</div>
      <div class="hud-grid"><div><div class="metric-label">ALTITUDE</div><div class="metric-value luminous" id="hud-altitude">--</div></div>
      <div><div class="metric-label">GROUND SPEED</div><div class="metric-value" id="hud-speed">--</div></div>
      <div><div class="metric-label">HEADING</div><div class="metric-value" id="hud-heading">--</div></div>
      <div><div class="metric-label">ROUTE</div><div id="demo-route-type">DEMO</div></div></div>
      <div class="live-flight-actions"><button id="demo-live">LIVE</button><button id="demo-position">現在位置</button><button id="demo-preview">Preview Flight</button><button id="demo-replay">Replay demo</button><button id="demo-ai">AI解説</button><button id="live-speak">🔊 音声</button><button id="live-stop-speak">■ 停止</button></div>
      <div class="live-ai-commentary" id="live-ai-commentary"><div class="live-ai-text">${escapeHtml(demoCommentary[route.id] ?? '')}</div></div>
      <div class="live-ai-model-note" id="live-ai-model-note">AI解説サンプル · 仮の文章（AIによる取得・生成結果ではありません）</div>
      <div class="live-message" id="live-message" role="status">DEMO · Simulated flight</div>
    </div>`;
  }

  updateTelemetry(telemetry: TelemetryData): void {
    if (!this.currentRoute) return;
    const set = (id: string, text: string) => { const node = this.container.querySelector('#' + id); if (node) node.textContent = text; };
    set('hud-altitude', `${Math.round(telemetry.altitude).toLocaleString()} m (est.)`);
    set('hud-speed', `${Math.round(telemetry.speedKmh)} km/h`);
    set('hud-heading', `${Math.round(telemetry.heading)}°`);
  }
}
