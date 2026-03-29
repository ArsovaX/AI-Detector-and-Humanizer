import { scoreColorHex } from './gauges.js';

let sentenceChart = null;
let vocabChart = null;

export function renderSentenceLengthChart(canvas, sentenceLengths, sentenceScores) {
  const ctx = canvas.getContext('2d');

  if (sentenceChart) sentenceChart.destroy();

  const colors = sentenceScores
    ? sentenceScores.map(s => scoreColorHex(s.score))
    : sentenceLengths.map(() => '#6366f1');

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

  sentenceChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: sentenceLengths.map((_, i) => `S${i + 1}`),
      datasets: [{
        label: 'Words per Sentence',
        data: sentenceLengths,
        backgroundColor: colors.map(c => c + '80'),
        borderColor: colors,
        borderWidth: 1,
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const score = sentenceScores ? sentenceScores[ctx.dataIndex] : null;
              let label = `${ctx.parsed.y} words`;
              if (score) label += ` | AI: ${Math.round(score.score * 100)}%`;
              return label;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: isDark ? '#55556a' : '#9999aa',
            font: { size: 10, family: "'JetBrains Mono', monospace" },
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 30
          }
        },
        y: {
          grid: { color: isDark ? '#1e1e2a' : '#e8e8f0' },
          ticks: {
            color: isDark ? '#55556a' : '#9999aa',
            font: { size: 10 }
          }
        }
      }
    }
  });
}

export function renderVocabDistribution(canvas, words) {
  const ctx = canvas.getContext('2d');

  if (vocabChart) vocabChart.destroy();

  const freq = new Map();
  for (const w of words) {
    const lw = w.toLowerCase();
    freq.set(lw, (freq.get(lw) || 0) + 1);
  }

  const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1]);
  const ranks = sorted.map((_, i) => i + 1);
  const frequencies = sorted.map(([, f]) => f);

  const C = frequencies[0] || 1;
  const zipfLine = ranks.map(r => C / r);

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

  vocabChart = new Chart(ctx, {
    type: 'scatter',
    data: {
      datasets: [
        {
          label: 'Actual',
          data: ranks.slice(0, 100).map((r, i) => ({
            x: Math.log10(r),
            y: Math.log10(frequencies[i])
          })),
          backgroundColor: '#6366f180',
          borderColor: '#6366f1',
          pointRadius: 3,
          pointHoverRadius: 5
        },
        {
          label: "Zipf's Law (Ideal)",
          data: ranks.slice(0, 100).map((r, i) => ({
            x: Math.log10(r),
            y: Math.log10(zipfLine[i])
          })),
          type: 'line',
          borderColor: '#ef444480',
          borderDash: [5, 5],
          borderWidth: 2,
          pointRadius: 0,
          fill: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          labels: {
            color: isDark ? '#8888a0' : '#666680',
            font: { size: 11 }
          }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const rank = Math.round(Math.pow(10, ctx.parsed.x));
              const frequency = Math.round(Math.pow(10, ctx.parsed.y));
              if (ctx.datasetIndex === 0) {
                const word = sorted[rank - 1] ? sorted[rank - 1][0] : '';
                return `"${word}" — rank ${rank}, freq ${frequency}`;
              }
              return `Zipf expected: ${frequency}`;
            }
          }
        }
      },
      scales: {
        x: {
          title: {
            display: true,
            text: 'log₁₀(Rank)',
            color: isDark ? '#55556a' : '#9999aa',
            font: { size: 11 }
          },
          grid: { color: isDark ? '#1e1e2a' : '#e8e8f0' },
          ticks: { color: isDark ? '#55556a' : '#9999aa', font: { size: 10 } }
        },
        y: {
          title: {
            display: true,
            text: 'log₁₀(Frequency)',
            color: isDark ? '#55556a' : '#9999aa',
            font: { size: 11 }
          },
          grid: { color: isDark ? '#1e1e2a' : '#e8e8f0' },
          ticks: { color: isDark ? '#55556a' : '#9999aa', font: { size: 10 } }
        }
      }
    }
  });
}

export function destroyCharts() {
  if (sentenceChart) { sentenceChart.destroy(); sentenceChart = null; }
  if (vocabChart) { vocabChart.destroy(); vocabChart = null; }
}
