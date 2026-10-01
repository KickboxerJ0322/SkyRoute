type UsagePayload = {
  total_calls?: number;
  total_pages?: number;
  total_cost?: number;
  total_discount_cost?: number;
  total_successful_calls?: number;
  total_failed_calls?: number;
  resource_details?: Array<{
    operation?: string;
    total_resource_calls?: number;
    num_pages?: number;
    resource_cost?: number;
  }>;
  skyroute_period?: {
    timezone?: string;
    start?: string;
    end?: string;
    label?: string;
  };
};

export class InfoView {
  constructor(private root: HTMLElement) {}

  public async show(): Promise<void> {
    this.root.hidden = false;
    this.root.innerHTML = `
      <div class="info-stack" aria-label="SkyRoute information">
        <section class="info-card">
          <div class="info-card-title">SkyRouteについて</div>
          <div class="info-card-body">
            <div class="info-kicker">INFO</div>
            <h2>航空情報を3Dで見る</h2>
            <p>SkyRouteは、航空機の現在位置・高度・速度・航跡と航空気象情報を、Google Photorealistic 3D Maps上で分かりやすく確認する個人開発アプリです。</p>
          </div>
        </section>

        <section class="info-card">
          <div class="info-card-title">使い方</div>
          <div class="info-card-body">
            <div class="info-grid">
              <div><strong>ROUTE</strong><span>主要空港を選び、飛行中便と今後3時間の出発予定便を確認します。</span></div>
              <div><strong>飛行情報</strong><span>便を選ぶと現在位置、高度、速度、航跡、残距離などを表示します。</span></div>
              <div><strong>3D気象</strong><span>SIGMETと、出発・到着空港周辺の雨・雷・竜巻発生確度NOWCASTを表示します。</span></div>
              <div><strong>AI解説</strong><span>METAR、TAF、SIGMET、NOWCASTを含め、現在の飛行状況を日本語で解説します。</span></div>
              <div><strong>更新</strong><span>AeroAPIの利用料を抑えるため、便一覧と位置情報は原則として手動更新です。</span></div>
            </div>
          </div>
        </section>

        <section class="info-card">
          <div class="info-card-title">航空気象データ</div>
          <div class="info-card-body">
            <div class="info-source-list">
              <div><strong>METAR / TAF</strong><span>FlightAware AeroAPI</span></div>
              <div><strong>SIGMET</strong><span>NOAA Aviation Weather Center（日本RJJJはJMA発表）</span></div>
              <div><strong>NOWCAST</strong><span>気象庁（降水・雷・竜巻発生確度）</span></div>
            </div>
            <p class="info-note">気象表示は可視化・学習用途です。実際の航空運航判断には使用しないでください。</p>
          </div>
        </section>

        <section class="info-card">
          <div class="info-card-title">AeroAPI 今月の利用状況</div>
          <div class="info-card-body">
            <div id="aero-usage" class="aero-usage-card">利用状況を取得しています…</div>
            <p class="info-note">SkyRouteは日本時間の月初から現在までを指定して取得します。FlightAware側の利用統計は約10分ごとに更新されます。</p>
          </div>
        </section>
      </div>
    `;
    await this.loadUsage();
  }

  public hide(): void {
    this.root.hidden = true;
  }

  private async loadUsage(): Promise<void> {
    const node = this.root.querySelector<HTMLElement>('#aero-usage');
    if (!node) return;
    try {
      const response = await fetch('/api/account/usage');
      const body = await response.json();
      if (!response.ok) throw new Error(`HTTP ${response.status} / ${body.error || 'USAGE_UNAVAILABLE'}`);
      const usage = ((body.data && typeof body.data === 'object') ? body.data : body) as UsagePayload;
      const cost = Number(usage.total_cost || 0);
      const discounted = Number(usage.total_discount_cost || cost);
      const calls = Number(usage.total_calls || 0);
      const pages = Number(usage.total_pages || 0);
      const freeRemaining = Math.max(0, 5 - cost);
      const periodLabel = usage.skyroute_period?.label || '今月';
      const top = (usage.resource_details || [])
        .slice()
        .sort((a,b)=>Number(b.resource_cost||0)-Number(a.resource_cost||0))
        .slice(0,5);

      node.innerHTML = `
        <div class="usage-period">${escapeHtml(periodLabel)}・日本時間</div>
        <div class="usage-total"><span>参考利用額</span><strong>$${cost.toFixed(3)}</strong></div>
        <div class="usage-stats">
          <span>API呼出 ${calls.toLocaleString()} 回</span>
          <span>Result pages ${pages.toLocaleString()}</span>
          ${discounted !== cost ? '<span>割引後 $' + discounted.toFixed(3) + '</span>' : ''}
        </div>
        <div class="usage-free">Personalプランの月$5無料枠を目安にすると、残りは <strong>$${freeRemaining.toFixed(2)}</strong> です。</div>
        ${top.length ? '<details><summary>利用額が大きいAPI</summary><div class="usage-breakdown">' + top.map(item=>'<div><span>'+escapeHtml(item.operation||'API')+'</span><span>'+Number(item.total_resource_calls||0)+'回 / $'+Number(item.resource_cost||0).toFixed(3)+'</span></div>').join('') + '</div></details>' : ''}
      `;
    } catch (error) {
      const message=error instanceof Error?error.message:'USAGE_UNAVAILABLE';
      node.innerHTML = `
        <div class="usage-error-title">AeroAPIの利用状況を取得できませんでした。</div>
        <div class="usage-error-code">${escapeHtml(message)}</div>
        <div class="usage-error-help">Cloud Runログの <code>aeroapi-upstream</code> を確認すると、FlightAware側のHTTPステータスと理由を確認できます。</div>
      `;
    }
  }
}

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
}
