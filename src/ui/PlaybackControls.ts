/**
 * Playback Controls Component
 * Controls Play Forward, Reverse Playback, Restart, Continuous Speed (1x to 60x), and Seek slider.
 */

import { PLAYBACK_SPEED_PRESETS, DEFAULT_PLAYBACK_SPEED } from '../config';

export interface PlaybackHandlers {
  onTogglePlay: () => void;
  onToggleReverse: () => void;
  onRestart: () => void;
  onSpeedChange: (speed: number) => void;
  onSeek: (progress: number) => void;
}

export class PlaybackControls {
  private container: HTMLElement;
  private handlers: PlaybackHandlers;
  private isPlaying = false;
  private currentDirection: 1 | -1 = 1;
  private currentSpeed: number = DEFAULT_PLAYBACK_SPEED;
  private isDraggingSlider = false;

  constructor(container: HTMLElement, handlers: PlaybackHandlers) {
    this.container = container;
    this.handlers = handlers;
    this.render();
  }

  public setPlayingState(playing: boolean, direction: 1 | -1 = 1): void {
    if (this.isPlaying === playing && this.currentDirection === direction) return;
    this.isPlaying = playing;
    this.currentDirection = direction;

    const playBtn = this.container.querySelector('#play-pause-btn');
    const revBtn = this.container.querySelector('#reverse-play-btn');

    if (playBtn) {
      if (this.isPlaying && this.currentDirection === 1) {
        playBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
        playBtn.classList.add('active-play');
        playBtn.setAttribute('title', 'Pause (一時停止)');
      } else {
        playBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
        playBtn.classList.remove('active-play');
        playBtn.setAttribute('title', 'Play Forward (順再生)');
      }
    }

    if (revBtn) {
      if (this.isPlaying && this.currentDirection === -1) {
        revBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
        revBtn.classList.add('active-reverse');
        revBtn.setAttribute('title', 'Pause Reverse (逆再生一時停止)');
      } else {
        revBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="19 3 5 12 19 21 19 3"/></svg>`;
        revBtn.classList.remove('active-reverse');
        revBtn.setAttribute('title', 'Reverse Play (逆再生)');
      }
    }
  }

  public setSpeed(speed: number): void {
    this.currentSpeed = Math.round(Math.min(60, Math.max(1, speed)) * 10) / 10;

    // Update speed slider
    const speedSlider = this.container.querySelector<HTMLInputElement>('#speed-slider');
    if (speedSlider) {
      speedSlider.value = this.currentSpeed.toString();
    }

    // Update speed text display
    const speedDisplay = this.container.querySelector('#speed-display');
    if (speedDisplay) {
      speedDisplay.textContent = `${this.currentSpeed}×`;
    }

    // Highlight preset pill if matches
    const buttons = this.container.querySelectorAll('.speed-pill');
    buttons.forEach((btn) => {
      const btnSpeed = Number(btn.getAttribute('data-speed'));
      if (btnSpeed === this.currentSpeed) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  public setProgress(progress: number): void {
    if (this.isDraggingSlider) return;

    const slider = this.container.querySelector<HTMLInputElement>('#seek-slider');
    const fillBar = this.container.querySelector<HTMLElement>('#slider-fill-bar');
    const timeDisplay = this.container.querySelector('#playback-percentage');

    const pct = Math.round(progress * 100);
    if (slider) slider.value = (progress * 100).toString();
    if (fillBar) fillBar.style.width = `${progress * 100}%`;
    if (timeDisplay) timeDisplay.textContent = `${pct}%`;
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="playback-bar-wrapper">
        <div class="seek-bar-container">
          <div class="slider-track-bg">
            <div class="slider-fill-bar" id="slider-fill-bar" style="width: 0%"></div>
          </div>
          <input
            type="range"
            id="seek-slider"
            class="seek-slider"
            min="0"
            max="100"
            step="0.1"
            value="0"
            aria-label="Flight timeline progress"
          />
        </div>

        <div class="playback-controls-row">
          <div class="playback-actions">
            <!-- Reverse Play Button -->
            <button id="reverse-play-btn" class="ctrl-btn reverse-btn" title="Reverse Play (逆再生)">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="19 3 5 12 19 21 19 3"/>
              </svg>
            </button>

            <!-- Play / Pause Button -->
            <button id="play-pause-btn" class="ctrl-btn play-btn" title="Play Forward (順再生)">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3"/>
              </svg>
            </button>

            <!-- Restart Button -->
            <button id="restart-btn" class="ctrl-btn restart-btn" title="Restart Flight (最初から)">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                <path d="M3 3v5h5"/>
              </svg>
            </button>

            <div class="timeline-percentage" id="playback-percentage">0%</div>
          </div>

          <!-- Speed Controls: Continuous Slider + Presets -->
          <div class="speed-control-group">
            <div class="speed-slider-wrap">
              <span class="speed-label">SPEED</span>
              <span class="speed-display" id="speed-display">${this.currentSpeed}×</span>
              <input
                type="range"
                id="speed-slider"
                class="speed-slider"
                min="1"
                max="60"
                step="0.1" aria-label="????"
                value="${this.currentSpeed}"
                title="再生速度つまみ (1×〜60×)"
              />
            </div>

            <div class="speed-presets desktop-only">
              ${PLAYBACK_SPEED_PRESETS.map(
                (s) => `
                <button class="speed-btn speed-pill ${s === this.currentSpeed ? 'active' : ''}" data-speed="${s}">
                  ${s}×
                </button>
              `
              ).join('')}
            </div>
          </div>
        </div>
      </div>
    `;

    this.attachEventListeners();
  }

  private attachEventListeners(): void {
    const playBtn = this.container.querySelector('#play-pause-btn');
    const revBtn = this.container.querySelector('#reverse-play-btn');
    const restartBtn = this.container.querySelector('#restart-btn');
    const seekSlider = this.container.querySelector<HTMLInputElement>('#seek-slider');
    const fillBar = this.container.querySelector<HTMLElement>('#slider-fill-bar');
    const speedSlider = this.container.querySelector<HTMLInputElement>('#speed-slider');
    const speedPills = this.container.querySelectorAll('.speed-pill');

    if (playBtn) {
      playBtn.addEventListener('click', () => {
        this.handlers.onTogglePlay();
      });
    }

    if (revBtn) {
      revBtn.addEventListener('click', () => {
        this.handlers.onToggleReverse();
      });
    }

    if (restartBtn) {
      restartBtn.addEventListener('click', () => {
        this.handlers.onRestart();
      });
    }

    if (seekSlider) {
      seekSlider.addEventListener('pointerdown', (event) => {
        seekSlider.setPointerCapture(event.pointerId);
        this.isDraggingSlider = true;
      });
      seekSlider.addEventListener('touchstart', () => {
        this.isDraggingSlider = true;
      });

      const handleSeek = () => {
        const val = parseFloat(seekSlider.value) / 100;
        if (fillBar) fillBar.style.width = `${seekSlider.value}%`;
        const timeDisplay = this.container.querySelector('#playback-percentage');
        if (timeDisplay) timeDisplay.textContent = `${Math.round(val * 100)}%`;
        this.handlers.onSeek(val);
      };

      seekSlider.addEventListener('input', handleSeek);

      seekSlider.addEventListener('pointerup', () => {
        this.isDraggingSlider = false;
      });
      seekSlider.addEventListener('lostpointercapture', () => {
        this.isDraggingSlider = false;
      });
    }

    if (speedSlider) {
      speedSlider.addEventListener('input', () => {
        const speed = Number(speedSlider.value);
        this.setSpeed(speed);
        this.handlers.onSpeedChange(speed);
      });
    }

    speedPills.forEach((pill) => {
      pill.addEventListener('click', () => {
        const spd = Number(pill.getAttribute('data-speed'));
        if (spd) {
          this.setSpeed(spd);
          this.handlers.onSpeedChange(spd);
        }
      });
    });
  }
}
