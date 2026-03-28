// plagiarism.js — Plagiarism detection engine
import { extractWords, lowercaseWords, isStopWord, getContentWords } from '../nlp/tokenizer.js';
import { splitSentences } from '../nlp/tokenizer.js';
import { clamp, smoothStep } from '../nlp/statistics.js';

const BASE = 257;
const MOD = 1000000007;
const WINDOW_SIZE = 5;

// Rabin-Karp rolling hash fingerprinting
function computeFingerprints(words, windowSize = WINDOW_SIZE) {
  if (words.length < windowSize) return new Map();

  const fingerprints = new Map();

  // Precompute BASE^(windowSize-1) % MOD
  let basePow = 1;
  for (let i = 0; i < windowSize - 1; i++) {
    basePow = (basePow * BASE) % MOD;
  }

  // Initial hash
  let hash = 0;
  for (let i = 0; i < windowSize; i++) {
    hash = (hash * BASE + hashWord(words[i])) % MOD;
  }

  const key = hash.toString();
  fingerprints.set(key, [{ pos: 0, text: words.slice(0, windowSize).join(' ') }]);

  // Rolling hash
  for (let i = 1; i <= words.length - windowSize; i++) {
    // Remove leading word, add trailing word
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

// Cosine similarity between two term-frequency vectors
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

// Build term-frequency vector for a sentence (excluding stop words)
function buildTFVector(text) {
  const words = getContentWords(lowercaseWords(extractWords(text)));
  const tf = new Map();
  for (const w of words) {
    tf.set(w, (tf.get(w) || 0) + 1);
  }
  return tf;
}

// Longest Common Substring using DP
function longestCommonSubstring(wordsA, wordsB, minLength = 8) {
  if (wordsA.length === 0 || wordsB.length === 0) return [];

  // Limit for performance
  const maxLen = 2000;
  const a = wordsA.slice(0, maxLen);
  const b = wordsB.slice(0, maxLen);

  const matches = [];
  // Use rolling approach instead of full matrix for memory efficiency
  let prev = new Array(b.length + 1).fill(0);
  let curr = new Array(b.length + 1).fill(0);
  let maxLenFound = 0;

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

  // Deduplicate overlapping matches, keep longest
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

  return matches.slice(0, 20); // top 20
}

// Merge an array of [start, end) intervals into non-overlapping spans
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

// Analyze single text for internal duplication
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

  // --- Fingerprint-based duplicate detection with coverage tracking ---
  const fingerprints = computeFingerprints(words);
  const duplicateMatches = [];
  const dupSpans = []; // [start, end) word-index spans that are duplicated

  for (const [hash, positions] of fingerprints) {
    if (positions.length < 2) continue;
    // Collect non-overlapping position pairs
    const nonOverlap = [];
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        if (Math.abs(positions[j].pos - positions[i].pos) >= WINDOW_SIZE) {
          nonOverlap.push([positions[i].pos, positions[j].pos]);
        }
      }
    }
    if (nonOverlap.length > 0) {
      duplicateMatches.push({
        text: positions[0].text,
        positions: positions.map(p => p.pos),
        type: 'fingerprint'
      });
      // Mark every occurrence as a duplicated span
      for (const p of positions) {
        dupSpans.push([p.pos, p.pos + WINDOW_SIZE]);
      }
    }
  }

  const dupCoverage = words.length > 0 ? spanCoverage(dupSpans) / words.length : 0;

  // --- Exact sentence duplication ---
  const sentTextMap = new Map();
  for (let i = 0; i < sentences.length; i++) {
    const norm = sentences[i].text.trim().toLowerCase();
    if (!sentTextMap.has(norm)) sentTextMap.set(norm, []);
    sentTextMap.get(norm).push(i);
  }
  let exactDupSentences = 0;
  for (const indices of sentTextMap.values()) {
    if (indices.length >= 2) exactDupSentences += indices.length;
  }
  const exactSentRatio = sentences.length > 0 ? exactDupSentences / sentences.length : 0;

  // --- Sentence-level similarity (self-comparison, skip adjacent) ---
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

  // --- Overall duplication score (coverage-proportional) ---
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

// Compare two texts
export function compareTexts(textA, textB) {
  if (!textA || !textB || textA.trim().length === 0 || textB.trim().length === 0) return null;

  const sentencesA = splitSentences(textA);
  const sentencesB = splitSentences(textB);
  const wordsA = lowercaseWords(extractWords(textA));
  const wordsB = lowercaseWords(extractWords(textB));

  // Fingerprint Jaccard similarity
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

  // Sentence-level matching
  const tfVectorsA = sentencesA.map(s => buildTFVector(s.text));
  const tfVectorsB = sentencesB.map(s => buildTFVector(s.text));

  const matchedSentences = [];
  const matchedA = new Set();
  const matchedB = new Set();

  // Greedy best-match alignment
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

  // Longest common substrings
  const lcsMatches = longestCommonSubstring(wordsA, wordsB);

  // Exact-overlap coverage: how many words in the shorter text are covered
  // by exact LCS matches?
  const shorterLen = Math.min(wordsA.length, wordsB.length);
  const exactMatchedWords = lcsMatches.reduce((sum, m) => sum + m.length, 0);
  const exactCoverage = shorterLen > 0 ? Math.min(exactMatchedWords / shorterLen, 1) : 0;

  // Longest single match, normalised to shorter text length
  const longestMatch = lcsMatches.length > 0
    ? Math.max(...lcsMatches.map(m => m.length)) / shorterLen
    : 0;

  // Overall similarity score — weighted, no flat bonus
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
    // For highlighting
    matchedIndicesA: [...matchedA],
    matchedIndicesB: [...matchedB],
    sentencesA,
    sentencesB
  };
}
