// highlights.js — Heatmap, plagiarism highlight, and AI phrase rendering

import { scoreColorHex } from './gauges.js';

// Render sentence heatmap (AI detector)
export function renderHeatmap(container, sentenceScores) {
  container.innerHTML = '';

  for (const s of sentenceScores) {
    const span = document.createElement('span');
    span.className = 'heatmap-sentence';
    span.textContent = s.text + ' ';

    // Color: green (human) → yellow → red (AI)
    const hue = (1 - s.score) * 120; // 120=green, 0=red
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const lightness = isDark ? '20%' : '88%';
    const saturation = '70%';

    span.style.background = `hsl(${hue}, ${saturation}, ${lightness})`;
    span.style.color = isDark
      ? `hsl(${hue}, 60%, 75%)`
      : `hsl(${hue}, 70%, 25%)`;

    // Tooltip
    const tooltip = document.createElement('span');
    tooltip.className = 'heatmap-tooltip';
    tooltip.textContent = `AI: ${Math.round(s.score * 100)}%`;
    span.appendChild(tooltip);

    container.appendChild(span);
  }
}

// Render plagiarism highlights (comparison mode)
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

// Render flagged AI phrases list
export function renderFlaggedPhrases(container, flaggedPhrases) {
  container.innerHTML = '';

  // Deduplicate by phrase
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
