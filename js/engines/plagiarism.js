import { extractWords, lowercaseWords, isStopWord, getContentWords } from '../nlp/tokenizer.js';
import { splitSentences } from '../nlp/tokenizer.js';
import { clamp, smoothStep } from '../nlp/statistics.js';

const BASE = 257;
const MOD = 1000000007;
const WINDOW_SIZE = 5;

function computeFingerprints(words, windowSize = WINDOW_SIZE) {
  if (words.length < windowSize) return new Map();

  const fingerprints = new Map();

  let basePow = 1;
  for (let i = 0; i < windowSize - 1; i++) {
    basePow = (basePow * BASE) % MOD;
  }

  let hash = 0;
  for (let i = 0; i < windowSize; i++) {
    hash = (hash * BASE + hashWord(words[i])) % MOD;
  }

  const key = hash.toString();
  fingerprints.set(key, [{ pos: 0, text: words.slice(0, windowSize).join(' ') }]);

  for (let i = 1; i <= words.length - windowSize; i++) {
    hash = (hash - hashWord(words[i - 1]) * basePow % MOD + MOD) % MOD;
    hash = (hash * BASE + hashWord(words[i + windowSize - 1])) % MOD;

    const k = hash.toString();
    if (!fingerprints.has(k)) {
      fingerprints.set(k, []);
    }
    fingerprints.get(k).push({ pos: i, text: words.slice(i, i + windowSize).join(' ') });
  }

  return fingerprints;
}

function hashWord(word) {
  let h = 0;
  for (let i = 0; i < word.length; i++) {
    h = (h * 31 + word.charCodeAt(i)) % MOD;
  }
  return h;
}

function cosineSimilarity(vecA, vecB) {
  const allTerms = new Set([...vecA.keys(), ...vecB.keys()]);
  let dot = 0, magA = 0, magB = 0;

  for (const term of allTerms) {
    const a = vecA.get(term) || 0;
    const b = vecB.get(term) || 0;
    dot += a * b;
    magA += a * a;
    magB += b * b;
  }

  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

function buildTFVector(text) {
  const words = getContentWords(lowercaseWords(extractWords(text)));
  const tf = new Map();
  for (const w of words) {
    tf.set(w, (tf.get(w) || 0) + 1);
  }
  return tf;
}

function longestCommonSubstring(wordsA, wordsB, minLength = 8) {
  if (wordsA.length === 0 || wordsB.length === 0) return [];

  const maxLen = 2000;
  const a = wordsA.slice(0, maxLen);
  const b = wordsB.slice(0, maxLen);

  const matches = [];
  let prev = new Array(b.length + 1).fill(0);
  let curr = new Array(b.length + 1).fill(0);

  const found = [];

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        curr[j] = prev[j - 1] + 1;
        if (curr[j] >= minLength) {
          found.push({
            length: curr[j],
            posA: i - curr[j],
            posB: j - curr[j],
            text: a.slice(i - curr[j], i).join(' ')
          });
        }
      } else {
        curr[j] = 0;
      }
    }
    [prev, curr] = [curr, prev];
    curr.fill(0);
  }

  found.sort((a, b) => b.length - a.length);
  const used = new Set();
  for (const match of found) {
    const key = `${match.posA}-${match.posB}`;
    let overlap = false;
    for (const u of used) {
      const [ua, ub] = u.split('-').map(Number);
      if (Math.abs(match.posA - ua) < match.length && Math.abs(match.posB - ub) < match.length) {
        overlap = true;
        break;
      }
    }
    if (!overlap) {
      matches.push(match);
      used.add(key);
    }
  }

  return matches.slice(0, 20);
}

function mergeSpans(spans) {
  if (spans.length === 0) return [];
  spans.sort((a, b) => a[0] - b[0]);
  const merged = [spans[0].slice()];
  for (let i = 1; i < spans.length; i++) {
    const last = merged[merged.length - 1];
    if (spans[i][0] <= last[1]) {
      last[1] = Math.max(last[1], spans[i][1]);
    } else {
      merged.push(spans[i].slice());
    }
  }
  return merged;
}

function spanCoverage(spans) {
  return mergeSpans(spans).reduce((sum, s) => sum + (s[1] - s[0]), 0);
}

export function analyzePlagiarism(text) {
  if (!text || text.trim().length === 0) return null;

  const sentences = splitSentences(text);
  const words = lowercaseWords(extractWords(text));

  if (words.length < 10) {
    return {
      overallScore: 0,
      duplicateMatches: [],
      similarSentences: [],
      stats: { sentences: sentences.length, words: words.length }
    };
  }

  const sentTextMap = new Map();
  for (let i = 0; i < sentences.length; i++) {
    const norm = sentences[i].text.trim().toLowerCase();
    if (!sentTextMap.has(norm)) sentTextMap.set(norm, []);
    sentTextMap.get(norm).push(i);
  }

  const duplicateMatches = [];
  const dupSpans = [];
  let exactDupSentences = 0;

  for (const [norm, indices] of sentTextMap) {
    if (indices.length < 2) continue;
    exactDupSentences += indices.length;
    duplicateMatches.push({
      text: sentences[indices[0]].text,
      positions: indices,
      type: 'exact-sentence',
      count: indices.length
    });
    for (const idx of indices) {
      const s = sentences[idx];
      const sentWords = extractWords(s.text);
      let wordPos = 0;
      for (let k = 0; k < idx; k++) wordPos += sentences[k].wordCount;
      dupSpans.push([wordPos, wordPos + sentWords.length]);
    }
  }
  const exactSentRatio = sentences.length > 0 ? exactDupSentences / sentences.length : 0;

  const paragraphs = text.split(/\n\s*\n/).map(p => p.trim()).filter(p => p.length > 0);
  if (paragraphs.length >= 2) {
    const paraMap = new Map();
    for (let i = 0; i < paragraphs.length; i++) {
      const norm = paragraphs[i].toLowerCase();
      if (!paraMap.has(norm)) paraMap.set(norm, []);
      paraMap.get(norm).push(i);
    }
    for (const [norm, indices] of paraMap) {
      if (indices.length < 2) continue;
      const paraText = paragraphs[indices[0]];
      const alreadyCovered = duplicateMatches.some(
        m => m.type === 'exact-sentence' && paraText.includes(m.text)
      );
      if (!alreadyCovered) {
        duplicateMatches.push({
          text: paraText,
          positions: indices,
          type: 'exact-paragraph',
          count: indices.length
        });
      }
    }
  }

  const fingerprints = computeFingerprints(words);

  for (const [hash, positions] of fingerprints) {
    if (positions.length < 2) continue;
    let hasNonOverlap = false;
    for (let i = 0; i < positions.length && !hasNonOverlap; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        if (Math.abs(positions[j].pos - positions[i].pos) >= WINDOW_SIZE) {
          hasNonOverlap = true;
          break;
        }
      }
    }
    if (hasNonOverlap) {
      for (const p of positions) {
        dupSpans.push([p.pos, p.pos + WINDOW_SIZE]);
      }
    }
  }

  const dupCoverage = words.length > 0 ? spanCoverage(dupSpans) / words.length : 0;

  const similarSentences = [];
  const tfVectors = sentences.map(s => buildTFVector(s.text));

  for (let i = 0; i < sentences.length; i++) {
    for (let j = i + 2; j < sentences.length; j++) {
      const sim = cosineSimilarity(tfVectors[i], tfVectors[j]);
      if (sim > 0.7) {
        similarSentences.push({
          sentenceA: { index: i, text: sentences[i].text },
          sentenceB: { index: j, text: sentences[j].text },
          similarity: sim
        });
      }
    }
  }
  const simRatio = similarSentences.length / Math.max(sentences.length, 1);

  const overallScore = clamp(
    dupCoverage * 0.40 +
    exactSentRatio * 0.35 +
    simRatio * 0.25
  );

  return {
    overallScore,
    duplicateMatches: duplicateMatches.slice(0, 50),
    similarSentences: similarSentences.slice(0, 20),
    stats: {
      sentences: sentences.length,
      words: words.length,
      duplicateFragments: duplicateMatches.length,
      similarPairs: similarSentences.length
    }
  };
}

export function compareTexts(textA, textB) {
  if (!textA || !textB || textA.trim().length === 0 || textB.trim().length === 0) return null;

  const sentencesA = splitSentences(textA);
  const sentencesB = splitSentences(textB);
  const wordsA = lowercaseWords(extractWords(textA));
  const wordsB = lowercaseWords(extractWords(textB));

  const fpA = computeFingerprints(wordsA);
  const fpB = computeFingerprints(wordsB);

  const hashesA = new Set(fpA.keys());
  const hashesB = new Set(fpB.keys());

  let intersection = 0;
  for (const h of hashesA) {
    if (hashesB.has(h)) intersection++;
  }
  const union = new Set([...hashesA, ...hashesB]).size;
  const jaccardSimilarity = union > 0 ? intersection / union : 0;

  const tfVectorsA = sentencesA.map(s => buildTFVector(s.text));
  const tfVectorsB = sentencesB.map(s => buildTFVector(s.text));

  const matchedSentences = [];
  const matchedA = new Set();
  const matchedB = new Set();

  const allPairs = [];
  for (let i = 0; i < sentencesA.length; i++) {
    for (let j = 0; j < sentencesB.length; j++) {
      const sim = cosineSimilarity(tfVectorsA[i], tfVectorsB[j]);
      if (sim > 0.6) {
        allPairs.push({ i, j, similarity: sim });
      }
    }
  }

  allPairs.sort((a, b) => b.similarity - a.similarity);

  for (const pair of allPairs) {
    if (!matchedA.has(pair.i) && !matchedB.has(pair.j)) {
      matchedSentences.push({
        sentenceA: { index: pair.i, text: sentencesA[pair.i].text },
        sentenceB: { index: pair.j, text: sentencesB[pair.j].text },
        similarity: pair.similarity
      });
      matchedA.add(pair.i);
      matchedB.add(pair.j);
    }
  }

  const lcsMatches = longestCommonSubstring(wordsA, wordsB);

  const shorterLen = Math.min(wordsA.length, wordsB.length);
  const exactMatchedWords = lcsMatches.reduce((sum, m) => sum + m.length, 0);
  const exactCoverage = shorterLen > 0 ? Math.min(exactMatchedWords / shorterLen, 1) : 0;

  const longestMatch = lcsMatches.length > 0
    ? Math.max(...lcsMatches.map(m => m.length)) / shorterLen
    : 0;

  const sentenceMatchRatio = matchedSentences.length / Math.max(sentencesA.length, sentencesB.length, 1);
  const overallScore = clamp(
    jaccardSimilarity * 0.25 +
    sentenceMatchRatio * 0.35 +
    exactCoverage * 0.25 +
    longestMatch * 0.15
  );

  return {
    overallScore,
    jaccardSimilarity,
    matchedSentences,
    lcsMatches,
    stats: {
      sentencesA: sentencesA.length,
      sentencesB: sentencesB.length,
      wordsA: wordsA.length,
      wordsB: wordsB.length,
      matchedPairs: matchedSentences.length,
      exactMatches: lcsMatches.length
    },
    matchedIndicesA: [...matchedA],
    matchedIndicesB: [...matchedB],
    sentencesA,
    sentencesB
  };
}
