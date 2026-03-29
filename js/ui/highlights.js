import { scoreColorHex } from './gauges.js';

export function renderHeatmap(container, sentenceScores) {
  container.innerHTML = '';

  for (const s of sentenceScores) {
    const span = document.createElement('span');
    span.className = 'heatmap-sentence';
    span.textContent = s.text + ' ';

    const hue = (1 - s.score) * 120;
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const lightness = isDark ? '20%' : '88%';
    const saturation = '70%';

    span.style.background = `hsl(${hue}, ${saturation}, ${lightness})`;
    span.style.color = isDark
      ? `hsl(${hue}, 60%, 75%)`
      : `hsl(${hue}, 70%, 25%)`;

    const tooltip = document.createElement('span');
    tooltip.className = 'heatmap-tooltip';
    tooltip.textContent = `AI: ${Math.round(s.score * 100)}%`;
    span.appendChild(tooltip);

    container.appendChild(span);
  }
}

export function renderPlagiarismHighlight(container, sentences, matchedIndices) {
  container.innerHTML = '';

  for (let i = 0; i < sentences.length; i++) {
    const span = document.createElement('span');
    const isMatch = matchedIndices.includes(i);

    if (isMatch) {
      span.className = 'highlight-match';
    }

    span.textContent = sentences[i].text + ' ';
    container.appendChild(span);
  }
}

export function renderFlaggedPhrases(container, flaggedPhrases) {
  container.innerHTML = '';

  const seen = new Map();
  for (const fp of flaggedPhrases) {
    const key = fp.original.toLowerCase();
    if (!seen.has(key)) {
      seen.set(key, { ...fp, count: 1 });
    } else {
      seen.get(key).count++;
    }
  }

  const sorted = [...seen.values()].sort((a, b) => b.weight - a.weight);

  for (const fp of sorted) {
    const item = document.createElement('div');
    item.className = 'flagged-item';
    item.style.animationDelay = `${sorted.indexOf(fp) * 0.05}s`;

    item.innerHTML = `
      <span>"${fp.original}"</span>
      ${fp.count > 1 ? `<span class="flagged-weight">×${fp.count}</span>` : ''}
      <span class="flagged-weight">${Math.round(fp.weight * 100)}%</span>
    `;

    container.appendChild(item);
  }
}
