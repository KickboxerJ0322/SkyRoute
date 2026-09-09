import { PlateauDataProvider } from './PlateauDataProvider';
import { PlateauInsightRenderer } from '../map/PlateauInsightRenderer';
import { PlateauInsightPanel } from '../ui/PlateauInsightPanel';
import type { Maps3DLibrary } from '../map/initMap3D';
import type { BuildingFeature, BuildingCategory } from './types';

export function mountPlateauInsight(lib: Maps3DLibrary, map: HTMLElement): () => void {
  const toggle = document.getElementById('plateau-toggle') as HTMLButtonElement;
  const provider = new PlateauDataProvider();
  const categories = new Set<BuildingCategory>(['PUBLIC_TRANSPORT', 'COMMERCIAL', 'MEDICAL']);
  let enabled = false, generation = 0, features: BuildingFeature[] | null = null;
  const renderer = new PlateauInsightRenderer(lib, map, feature => panel.showFeature(feature));
  const panel = new PlateauInsightPanel((category, checked) => {
    checked ? categories.add(category) : categories.delete(category); void refresh();
  }, () => { renderer.select(null); panel.showFeature(null); }, () => setEnabled(false));
  async function refresh() {
    const current = ++generation; renderer.clear(); panel.showFeature(null);
    if (!enabled) return;
    panel.setStatus('Loading PLATEAU…');
    try {
      features = await provider.load();
      if (!enabled || current !== generation) return;
      const count = await renderer.render(features, categories);
      if (!enabled || current !== generation) return;
      const total = features.filter(f => categories.has(f.properties.category)).length;
      panel.setStatus(`${count} / ${total} 棟表示 · 最大400棟`);
    } catch (error) {
      if (import.meta.env.DEV) console.warn('PLATEAU INSIGHT:', error);
      if (!enabled || current !== generation) return;
      renderer.clear(); panel.setStatus('PLATEAU data unavailable');
    }
  }
  function setEnabled(value: boolean) {
    enabled = value; toggle.setAttribute('aria-pressed', String(value)); toggle.classList.toggle('active', value); panel.show(value); void refresh();
  }
  toggle.onclick = () => setEnabled(!enabled);
  const controls = document.getElementById('map-controls-container')!;
  const position = () => {
    const top = controls.getBoundingClientRect().bottom + 10;
    const playback = document.getElementById('playback-container')!;
    const info = document.getElementById('flight-info-root')!;
    let bottom = playback.hidden ? window.innerHeight - 12 : playback.getBoundingClientRect().top - 10;
    if (window.innerWidth <= 768 && !info.hidden && info.getBoundingClientRect().height) bottom = Math.min(bottom, info.getBoundingClientRect().top - 10);
    panel.root.style.setProperty('--insight-top', top + 'px');
    panel.root.style.maxHeight = Math.max(0, bottom - top) + 'px';
  };
  const observer = new ResizeObserver(position); observer.observe(controls); observer.observe(document.getElementById('flight-info-root')!); observer.observe(document.getElementById('playback-container')!);
  window.addEventListener('resize', position); position();
  const dispose = () => { enabled = false; generation++; renderer.clear(); panel.root.remove(); observer.disconnect(); window.removeEventListener('resize', position); toggle.onclick = null; };
  window.addEventListener('pagehide', dispose, { once: true });
  return dispose;
}
