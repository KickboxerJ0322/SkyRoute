import { CATEGORIES, CATEGORY_LABELS, CATEGORY_COLORS, type BuildingFeature, type BuildingCategory } from '../plateau/types';

export class PlateauInsightPanel {
  readonly root = document.createElement('section');
  private status: HTMLElement;
  private card: HTMLElement;
  constructor(onFilter: (category: BuildingCategory, checked: boolean) => void, onCloseCard: () => void, onClose: () => void) {
    this.root.id = 'plateau-insight-panel'; this.root.hidden = true;
    this.root.setAttribute('aria-label', 'PLATEAU INSIGHT');
    this.root.innerHTML = `<header><strong>PLATEAU INSIGHT</strong><button type="button" aria-label="Close PLATEAU">×</button></header>
      <div class="plateau-body"><div class="plateau-scope">羽田周辺 · 建物属性</div><div class="plateau-categories"></div>
      <div class="plateau-status" role="status"></div><div class="plateau-card" hidden></div>
      </div><footer><a href="https://www.mlit.go.jp/plateau/" target="_blank" rel="noopener noreferrer">Source: Project PLATEAU / MLIT</a></footer>`;
    const filters = this.root.querySelector('.plateau-categories')!;
    for (const category of CATEGORIES) {
      const label = document.createElement('label'), input = document.createElement('input');
      input.type = 'checkbox'; input.checked = category !== 'OTHER'; input.dataset.category = category;
      input.setAttribute('aria-label', CATEGORY_LABELS[category]); input.style.accentColor = CATEGORY_COLORS[category];
      input.onchange = () => onFilter(category, input.checked);
      const swatch = document.createElement('span'); swatch.className = 'plateau-swatch'; swatch.style.backgroundColor = CATEGORY_COLORS[category];
      label.append(input, swatch, document.createTextNode(CATEGORY_LABELS[category])); filters.append(label);
    }
    this.status = this.root.querySelector('.plateau-status')!; this.card = this.root.querySelector('.plateau-card')!;
    this.root.querySelector('header button')!.addEventListener('click', onClose);
    this.card.addEventListener('click', event => { if ((event.target as HTMLElement).closest('[data-close-card]')) onCloseCard(); });
    document.getElementById('app')!.append(this.root);
  }
  show(enabled: boolean) { this.root.hidden = !enabled; }
  setStatus(message: string) { this.status.textContent = message; }
  showFeature(feature: BuildingFeature | null) {
    this.card.replaceChildren(); this.card.hidden = !feature; this.root.classList.toggle('plateau-selected', !!feature);
    if (!feature) return;
    const p = feature.properties;
    const close = document.createElement('button'); close.textContent = '×'; close.dataset.closeCard = ''; close.setAttribute('aria-label', 'Close building details');
    this.card.append(close);
    if (p.name) { const name = document.createElement('h3'); name.textContent = p.name; this.card.append(name); }
    const list = document.createElement('dl');
    const rows = [['カテゴリ', CATEGORY_LABELS[p.category]], ['用途', p.usage || (p.usageCode ? `コード: ${p.usageCode}（未解決）` : '--')],
      ['主要用途', p.majorUsage || (p.majorUsageCode ? `コード: ${p.majorUsageCode}（未解決）` : '--')],
      ['高さ', p.measuredHeight === null ? '--' : `${p.measuredHeight} m`], ['地上階数', p.storeysAboveGround === null ? '--' : String(p.storeysAboveGround)],
      ['PLATEAU ID', p.gmlId], ['データ年度', p.dataYear === null ? '--' : String(p.dataYear)], ['自治体', p.city || '--']];
    for (const [label, value] of rows) { const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = label; dd.textContent = value; list.append(dt, dd); }
    this.card.append(list);
    const note = document.createElement('p'); note.className = 'plateau-note'; note.textContent = 'カテゴリは属性に基づく表示分類です。欠損値は補完していません。'; this.card.append(note);
  }
}
