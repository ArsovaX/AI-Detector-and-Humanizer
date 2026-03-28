// statistics.js — Statistical utility functions

export function mean(arr) {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

export function standardDeviation(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const variance = arr.reduce((sum, val) => sum + (val - m) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

export function coefficientOfVariation(arr) {
  const m = mean(arr);
  if (m === 0) return 0;
  return standardDeviation(arr) / Math.abs(m);
}

export function entropy(frequencyMap) {
  const total = Array.from(frequencyMap.values()).reduce((a, b) => a + b, 0);
  if (total === 0) return 0;

  let h = 0;
  for (const count of frequencyMap.values()) {
    if (count > 0) {
      const p = count / total;
      h -= p * Math.log2(p);
    }
  }
  return h;
}

export function zipfCorrelation(frequencyMap) {
  // Sort by frequency descending
  const sorted = Array.from(frequencyMap.entries())
    .sort((a, b) => b[1] - a[1]);

  if (sorted.length < 5) return 0;

  const logRanks = [];
  const logFreqs = [];

  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i][1] > 0) {
      logRanks.push(Math.log(i + 1));
      logFreqs.push(Math.log(sorted[i][1]));
    }
  }

  return pearsonCorrelation(logRanks, logFreqs);
}

export function pearsonCorrelation(x, y) {
  const n = x.length;
  if (n < 3) return 0;

  const mx = mean(x);
  const my = mean(y);

  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx;
    const dy = y[i] - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }

  const denom = Math.sqrt(dx2 * dy2);
  return denom === 0 ? 0 : num / denom;
}

export function yulesK(words) {
  // Frequency of frequencies
  const wordFreq = new Map();
  for (const w of words) {
    wordFreq.set(w, (wordFreq.get(w) || 0) + 1);
  }

  const freqOfFreq = new Map();
  for (const count of wordFreq.values()) {
    freqOfFreq.set(count, (freqOfFreq.get(count) || 0) + 1);
  }

  const N = words.length;
  if (N === 0) return 0;

  let sum = 0;
  for (const [i, vi] of freqOfFreq.entries()) {
    sum += i * i * vi;
  }

  const k = 10000 * (sum - N) / (N * N);
  return Math.max(0, k);
}

export function zScore(value, m, std) {
  if (std === 0) return 0;
  return (value - m) / std;
}

export function clamp(val, min = 0, max = 1) {
  return Math.min(max, Math.max(min, val));
}

export function lerp(a, b, t) {
  return a + (b - a) * clamp(t);
}

export function smoothStep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}
