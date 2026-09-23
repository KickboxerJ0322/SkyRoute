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
};

export class InfoView {
  constructor(private root: HTMLElement) {}

  public async show(): Promise<void> {
    this.root.hidden = false;
    this.root.innerHTML = `
      <section class="info-panel">
        <div class="info-kicker">INFO</div>
        <h2>SkyRouteについて</h2>
        <p>SkyRouteは、航空機の現在位置・高度・速度・航跡などを、Google Photorealistic 3D Maps上で確認できる個人開発の航空可視化アプリです。</p>

        <h3>使い方</h3>
        <div class="info-grid">
          <div><strong>ROUTE</strong><span>主要空港を選び、飛行中便と今後3時間の出発予定便を確認します。</span></div>
          <div><strong>飛行情報</strong><span>便を選ぶと現在位置、航跡、AI解説、音声読み上げを利用できます。</span></div>
          <div><strong>更新</strong><span>AeroAPIの利用料を抑えるため、便一覧と位置情報は原則として手動更新です。</span></div>
        </div>

        <h3>AeroAPI 今月の利用状況</h3>
        <div id="aero-usage" class="aero-usage-card">利用状況を取得しています…</div>
        <p class="info-note">FlightAwareの利用統計は約10分ごとに更新されます。表示額は参考値で、最終請求額とは異なる場合があります。</p>
      </section>
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
      if (!response.ok) throw new Error(body.error || 'USAGE_UNAVAILABLE');
      const usage = ((body.data && typeof body.data === 'object') ? body.data : body) as UsagePayload;
      const cost = Number(usage.total_cost || 0);
      const discounted = Number(usage.total_discount_cost || cost);
      const calls = Number(usage.total_calls || 0);
      const pages = Number(usage.total_pages || 0);
      const freeRemaining = Math.max(0, 5 - cost);
      const top = (usage.resource_details || [])
        .slice()
        .sort((a,b)=>Number(b.resource_cost||0)-Number(a.resource_cost||0))
        .slice(0,5);
      node.innerHTML = `
        <div class="usage-total"><span>参考利用額</span><strong>$${cost.toFixed(3)}</strong></div>
        <div class="usage-stats">
          <span>API呼出 ${calls.toLocaleString()} 回</span>
          <span>Result pages ${pages.toLocaleString()}</span>
          ${discounted !== cost ? '<span>割引後 $' + discounted.toFixed(3) + '</span>' : ''}
        </div>
        <div class="usage-free">Personalプランの月$5無料枠を前提にすると、残り目安は <strong>$${freeRemaining.toFixed(2)}</strong> です。</div>
        ${top.length ? '<details><summary>利用額が大きいAPI</summary><div class="usage-breakdown">' + top.map(item=>'<div><span>'+escapeHtml(item.operation||'API')+'</span><span>'+Number(item.total_resource_calls||0)+'回 / $'+Number(item.resource_cost||0).toFixed(3)+'</span></div>').join('') + '</div></details>' : ''}
      `;
    } catch {
      node.textContent = 'AeroAPIの利用状況を取得できませんでした。時間をおいてINFOを開き直してください。';
    }
  }
}

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
}
