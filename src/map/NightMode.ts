export type NightMode = 'auto' | 'on' | 'off';

export function isJapanNight(timestamp: number): boolean {
  if (!Number.isFinite(timestamp)) return false;
  const hour = new Date(timestamp + 9 * 3600000).getUTCHours();
  return hour >= 18 || hour < 5;
}

/** CSS film sits above the complete map renderer, below panels; never intercepts input. */
export class NightOverlay {
  private film: HTMLDivElement;
  private mode: NightMode = 'auto';
  private timestamp = Date.now();
  private lastState = '';
  constructor(container: HTMLElement, private onChange: (mode: NightMode, dark: boolean, time: number) => void) {
    this.film = document.createElement('div');
    this.film.className = 'night-film';
    this.film.setAttribute('aria-hidden', 'true');
    container.append(this.film);
  }
  setMode(mode: NightMode): void { this.mode = mode; this.update(); }
  setTime(timestamp: number): void {
    this.timestamp = Number.isFinite(timestamp) ? timestamp : Date.now();
    this.update();
  }
  private update(): void {
    const dark = this.mode === 'on' || (this.mode === 'auto' && isJapanNight(this.timestamp));
    const state = `${this.mode}:${dark}:${Math.floor(this.timestamp / 60000)}`;
    if (state === this.lastState) return;
    this.lastState = state;
    this.film.classList.toggle('active', dark);
    this.onChange(this.mode, dark, this.timestamp);
  }
}
