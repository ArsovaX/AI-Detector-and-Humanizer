// ngrams.js — N-gram generation and frequency analysis

export function generateNgrams(words, n) {
  const ngrams = new Map();
  for (let i = 0; i <= words.length - n; i++) {
    const gram = words.slice(i, i + n).join(' ');
    ngrams.set(gram, (ngrams.get(gram) || 0) + 1);
  }
  return ngrams;
}

export function ngramFrequencyProfile(words) {
  return {
    unigrams: generateNgrams(words, 1),
    bigrams: generateNgrams(words, 2),
    trigrams: generateNgrams(words, 3)
  };
}

export function repetitionScore(words) {
  if (words.length < 4) return 0;

  const trigrams = generateNgrams(words, 3);
  const quadgrams = generateNgrams(words, 4);

  let repeatedTri = 0;
  for (const count of trigrams.values()) {
    if (count >= 2) repeatedTri++;
  }

  let repeatedQuad = 0;
  for (const count of quadgrams.values()) {
    if (count >= 2) repeatedQuad++;
  }

  const triTotal = trigrams.size || 1;
  const quadTotal = quadgrams.size || 1;

  return (repeatedTri / triTotal) * 0.4 + (repeatedQuad / quadTotal) * 0.6;
}

export function findRepeatedPhrases(words, minLength = 5) {
  const phrases = [];
  const seen = new Map();

  for (let len = minLength; len <= Math.min(minLength + 5, words.length); len++) {
    for (let i = 0; i <= words.length - len; i++) {
      const phrase = words.slice(i, i + len).join(' ');
      if (seen.has(phrase)) {
        const existing = seen.get(phrase);
        if (!existing.reported) {
          phrases.push({ phrase, positions: [existing.pos, i], length: len });
          existing.reported = true;
        } else {
          const found = phrases.find(p => p.phrase === phrase);
          if (found) found.positions.push(i);
        }
      } else {
        seen.set(phrase, { pos: i, reported: false });
      }
    }
  }

  return phrases;
}

export function sharedPrefixCount(sentences, prefixLength = 3) {
  const prefixes = new Map();
  for (const s of sentences) {
    const words = s.text.split(/\s+/).slice(0, prefixLength).join(' ').toLowerCase();
    prefixes.set(words, (prefixes.get(words) || 0) + 1);
  }

  let shared = 0;
  for (const count of prefixes.values()) {
    if (count >= 2) shared += count;
  }
  return shared;
}
