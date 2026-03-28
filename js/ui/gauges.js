// gauges.js — Animated SVG donut gauge components

export function createGauge(container, score, opts = {}) {
  const {
    size = container.classList.contains('gauge-sm') ? 100 : 160,
    strokeWidth = size > 120 ? 10 : 8,
    animate = true,
    label = true
  } = opts;

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - score);
  const color = scoreColor(score);
  const pct = Math.round(score * 100);

  container.innerHTML = `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" class="gauge-svg">
      <circle
        cx="${size / 2}" cy="${size / 2}" r="${radius}"
        fill="none"
        stroke="var(--gauge-bg)"
        stroke-width="${strokeWidth}"
      />
      <circle
        class="gauge-arc"
        cx="${size / 2}" cy="${size / 2}" r="${radius}"
        fill="none"
        stroke="${color}"
        stroke-width="${strokeWidth}"
        stroke-linecap="round"
        stroke-dasharray="${circumference}"
        stroke-dashoffset="${animate ? circumference : offset}"
        transform="rotate(-90 ${size / 2} ${size / 2})"
        style="transition: stroke-dashoffset 1.2s cubic-bezier(0.4, 0, 0.2, 1), stroke 0.3s;"
      />
      ${label ? `
        <text x="${size / 2}" y="${size / 2 - 6}" text-anchor="middle" fill="var(--text)" font-family="'JetBrains Mono', monospace" font-size="${size > 120 ? 28 : 20}" font-weight="700">
          <tspan class="gauge-number">0</tspan><tspan font-size="${size > 120 ? 14 : 10}">%</tspan>
        </text>
        <text x="${size / 2}" y="${size / 2 + 14}" text-anchor="middle" fill="var(--text-muted)" font-family="Inter, sans-serif" font-size="${size > 120 ? 11 : 9}">
          ${score > 0.7 ? 'AI Generated' : score > 0.4 ? 'Mixed' : 'Human Written'}
        </text>
      ` : ''}
    </svg>
  `;

  if (animate) {
    requestAnimationFrame(() => {
      const arc = container.querySelector('.gauge-arc');
      if (arc) arc.style.strokeDashoffset = offset;

      // Count up number
      if (label) {
        animateNumber(container.querySelector('.gauge-number'), 0, pct, 1200);
      }
    });
  }
}

export function scoreColor(score) {
  if (score <= 0.3) return 'var(--success)';
  if (score <= 0.5) return '#84cc16'; // lime
  if (score <= 0.7) return 'var(--warning)';
  if (score <= 0.85) return '#f97316'; // orange
  return 'var(--danger)';
}

export function scoreColorHex(score) {
  if (score <= 0.3) return '#10b981';
  if (score <= 0.5) return '#84cc16';
  if (score <= 0.7) return '#f59e0b';
  if (score <= 0.85) return '#f97316';
  return '#ef4444';
}

function animateNumber(el, from, to, duration) {
  if (!el) return;
  const start = performance.now();
  const update = (now) => {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    // Ease out
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(from + (to - from) * eased);
    if (progress < 1) requestAnimationFrame(update);
  };
  requestAnimationFrame(update);
}
