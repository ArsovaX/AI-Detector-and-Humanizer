import { tokenize, splitSentences, extractWords, lowercaseWords, syllableCount, posTag, isStopWord } from '../nlp/tokenizer.js';
import { generateNgrams, ngramFrequencyProfile, repetitionScore, findRepeatedPhrases, sharedPrefixCount } from '../nlp/ngrams.js';
import { mean, standardDeviation, coefficientOfVariation, entropy, yulesK, clamp, smoothStep } from '../nlp/statistics.js';
import { AI_PHRASES, SENTENCE_STARTERS_AI } from '../nlp/wordlists.js';

function analyzePerplexity(tokens) {
  const { lowerWords, sentences } = tokens;
  if (lowerWords.length < 10) return { score: 0.5, label: 'Perplexity', detail: 'Text too short' };

  const unigramCounts = new Map();
  const bigramCounts = new Map();

  for (const w of lowerWords) {
    unigramCounts.set(w, (unigramCounts.get(w) || 0) + 1);
  }

  for (let i = 0; i < lowerWords.length - 1; i++) {
    const bigram = lowerWords[i] + ' ' + lowerWords[i + 1];
    bigramCounts.set(bigram, (bigramCounts.get(bigram) || 0) + 1);
  }

  const vocabSize = unigramCounts.size;

  const sentencePerplexities = [];
  for (const s of sentences) {
    const words = lowercaseWords(extractWords(s.text));
    if (words.length < 3) continue;

    let totalSurprise = 0;
    let count = 0;

    for (let i = 1; i < words.length; i++) {
      const bigram = words[i - 1] + ' ' + words[i];
      const bigramCount = bigramCounts.get(bigram) || 0;
      const unigramCount = unigramCounts.get(words[i - 1]) || 0;

      const prob = (bigramCount + 1) / (unigramCount + vocabSize);
      totalSurprise += -Math.log2(prob);
      count++;
    }

    if (count > 0) {
      const avgSurprise = totalSurprise / count;
      sentencePerplexities.push(Math.pow(2, avgSurprise));
    }
  }

  if (sentencePerplexities.length === 0) return { score: 0.5, label: 'Perplexity', detail: 'Insufficient data' };

  const avgPerplexity = mean(sentencePerplexities);
  const perplexityCV = coefficientOfVariation(sentencePerplexities);

  let score = 0;
  score += smoothStep(50, 10, avgPerplexity) * 0.6;
  score += smoothStep(0.5, 0.1, perplexityCV) * 0.4;

  return {
    score: clamp(score),
    label: 'Perplexity',
    detail: `Avg: ${avgPerplexity.toFixed(1)}, CV: ${perplexityCV.toFixed(2)}`,
    perSentence: sentencePerplexities
  };
}

function analyzeBurstiness(tokens) {
  const { sentences } = tokens;
  if (sentences.length < 3) return { score: 0.5, label: 'Burstiness', detail: 'Too few sentences' };

  const lengths = sentences.map(s => s.wordCount);
  const cv = coefficientOfVariation(lengths);
  const m = mean(lengths);
  const rangeRatio = m > 0 ? (Math.max(...lengths) - Math.min(...lengths)) / m : 0;

  let transitions = 0;
  for (let i = 1; i < lengths.length; i++) {
    const diff = Math.abs(lengths[i] - lengths[i - 1]);
    if (diff / Math.max(lengths[i], lengths[i - 1], 1) > 0.5) transitions++;
  }
  const transitionRate = transitions / (lengths.length - 1);

  let score = 0;
  score += smoothStep(0.5, 0.15, cv) * 0.5;
  score += smoothStep(0.4, 0.1, transitionRate) * 0.3;
  score += smoothStep(2.5, 0.8, rangeRatio) * 0.2;

  return {
    score: clamp(score),
    label: 'Burstiness',
    detail: `CV: ${cv.toFixed(2)}, Transitions: ${(transitionRate * 100).toFixed(0)}%`,
    sentenceLengths: lengths
  };
}

function analyzeVocabulary(tokens) {
  const { lowerWords } = tokens;
  if (lowerWords.length < 20) return { score: 0.5, label: 'Vocabulary', detail: 'Text too short' };

  const wordFreq = new Map();
  for (const w of lowerWords) {
    wordFreq.set(w, (wordFreq.get(w) || 0) + 1);
  }

  const uniqueWords = wordFreq.size;
  const totalWords = lowerWords.length;
  const ttr = uniqueWords / Math.sqrt(totalWords);

  let hapax = 0;
  for (const count of wordFreq.values()) {
    if (count === 1) hapax++;
  }
  const hapaxRatio = hapax / uniqueWords;

  const yk = yulesK(lowerWords);

  let score = 0;
  score += smoothStep(9, 4, ttr) * 0.3;
  score += smoothStep(0.65, 0.35, hapaxRatio) * 0.35;
  score += smoothStep(60, 160, yk) * 0.35;

  return {
    score: clamp(score),
    label: 'Vocabulary',
    detail: `TTR: ${ttr.toFixed(2)}, Hapax: ${(hapaxRatio * 100).toFixed(0)}%, Yule's K: ${yk.toFixed(0)}`
  };
}

function analyzeStructure(tokens) {
  const { sentences } = tokens;
  if (sentences.length < 3) return { score: 0.5, label: 'Structure', detail: 'Too few sentences' };

  const starters = sentences.map(s => s.text.split(/\s+/)[0].toLowerCase());
  const uniqueStarters = new Set(starters).size;
  const starterDiversity = uniqueStarters / sentences.length;

  let aiStarterCount = 0;
  for (const s of starters) {
    if (SENTENCE_STARTERS_AI.has(s)) aiStarterCount++;
  }
  const aiStarterRatio = aiStarterCount / sentences.length;

  const clauseCounts = sentences.map(s => {
    return (s.text.match(/[,;:\-—]/g) || []).length;
  });
  const clauseCV = coefficientOfVariation(clauseCounts);

  let declarative = 0, interrogative = 0, exclamatory = 0;
  for (const s of sentences) {
    const trimmed = s.text.trim();
    if (trimmed.endsWith('?')) interrogative++;
    else if (trimmed.endsWith('!')) exclamatory++;
    else declarative++;
  }
  const declarativeRatio = declarative / sentences.length;

  const paragraphSentenceCounts = [];
  let currentCount = 0;
  for (const s of sentences) {
    currentCount++;
    if (s.text.includes('\n\n') || s === sentences[sentences.length - 1]) {
      paragraphSentenceCounts.push(currentCount);
      currentCount = 0;
    }
  }
  const paraCV = paragraphSentenceCounts.length > 1 ? coefficientOfVariation(paragraphSentenceCounts) : 0.3;

  let score = 0;
  score += smoothStep(0.7, 0.3, starterDiversity) * 0.2;
  score += smoothStep(0.3, 0.7, aiStarterRatio) * 0.25;
  score += smoothStep(0.5, 0.1, clauseCV) * 0.2;
  score += smoothStep(0.85, 0.98, declarativeRatio) * 0.2;
  score += smoothStep(0.5, 0.1, paraCV) * 0.15;

  return {
    score: clamp(score),
    label: 'Structure',
    detail: `Starter diversity: ${(starterDiversity * 100).toFixed(0)}%, Declarative: ${(declarativeRatio * 100).toFixed(0)}%`
  };
}

function analyzeRepetition(tokens) {
  const { lowerWords, sentences } = tokens;
  if (lowerWords.length < 20) return { score: 0.5, label: 'Repetition', detail: 'Text too short' };

  const repScore = repetitionScore(lowerWords);
  const repeatedPhrases = findRepeatedPhrases(lowerWords);
  const shared = sharedPrefixCount(sentences);
  const sharedRatio = sentences.length > 0 ? shared / sentences.length : 0;

  let score = 0;
  score += clamp(repScore * 3) * 0.4;
  score += clamp(repeatedPhrases.length / 5) * 0.3;
  score += clamp(sharedRatio) * 0.3;

  return {
    score: clamp(score),
    label: 'Repetition',
    detail: `Rep score: ${(repScore * 100).toFixed(0)}%, Shared prefixes: ${shared}`,
    repeatedPhrases
  };
}

function analyzeAIPhrases(tokens) {
  const { sentences } = tokens;
  const fullTextLower = sentences.map(s => s.text).join(' ').toLowerCase();

  const flaggedPhrases = [];
  let totalWeightedDensity = 0;

  for (const { phrase, weight } of AI_PHRASES) {
    const regex = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    let match;
    while ((match = regex.exec(fullTextLower)) !== null) {
      totalWeightedDensity += weight;
      flaggedPhrases.push({
        phrase: match[0],
        position: match.index,
        weight,
        original: phrase
      });
    }
  }

  const density = sentences.length > 0 ? totalWeightedDensity / sentences.length : 0;
  let score = smoothStep(0.05, 0.4, density);

  return {
    score: clamp(score),
    label: 'AI Phrases',
    detail: `Found ${flaggedPhrases.length} phrases, density: ${density.toFixed(2)}`,
    flaggedPhrases
  };
}

function analyzeTone(tokens) {
  const { sentences } = tokens;
  if (sentences.length < 3) return { score: 0.5, label: 'Tone', detail: 'Too few sentences' };

  const formalityScores = sentences.map(s => {
    const words = extractWords(s.text);
    const lower = lowercaseWords(words);

    let formality = 0.5;

    const hasContraction = /n't|'s|'re|'ve|'ll|'d|'m/.test(s.text);
    if (!hasContraction) formality += 0.1;

    const firstPerson = lower.filter(w => ['i', 'me', 'my', 'mine', 'we', 'us', 'our'].includes(w));
    if (firstPerson.length === 0) formality += 0.1;

    const multiSyl = words.filter(w => syllableCount(w) >= 3).length;
    formality += (multiSyl / Math.max(words.length, 1)) * 0.3;

    if (!s.text.trim().endsWith('?') && !s.text.trim().endsWith('!')) formality += 0.05;

    return clamp(formality);
  });

  const formalityCV = coefficientOfVariation(formalityScores);
  const avgFormality = mean(formalityScores);

  let score = smoothStep(0.35, 0.08, formalityCV) * 0.6;
  score += smoothStep(0.5, 0.8, avgFormality) * 0.4;

  return {
    score: clamp(score),
    label: 'Tone',
    detail: `Formality CV: ${formalityCV.toFixed(2)}, Avg: ${avgFormality.toFixed(2)}`,
    perSentence: formalityScores
  };
}

function scoreSentences(tokens, results) {
  const { sentences } = tokens;
  const perplexities = results.perplexity.perSentence || [];
  const formalities = results.tone.perSentence || [];
  const burstLengths = results.burstiness.sentenceLengths || [];
  const avgLength = mean(burstLengths);
  const stdLength = standardDeviation(burstLengths);

  return sentences.map((s, i) => {
    let score = 0;
    let factors = 0;

    if (perplexities[i] !== undefined) {
      score += smoothStep(50, 10, perplexities[i]) * 0.3;
      factors += 0.3;
    }

    if (stdLength > 0 && burstLengths[i] !== undefined) {
      const lenZ = Math.abs(burstLengths[i] - avgLength) / stdLength;
      score += smoothStep(2, 0, lenZ) * 0.2;
      factors += 0.2;
    }

    const sText = s.text.toLowerCase();
    let hasAIPhrase = false;
    for (const { phrase } of AI_PHRASES) {
      if (sText.includes(phrase)) { hasAIPhrase = true; break; }
    }
    if (hasAIPhrase) {
      score += 0.2;
      factors += 0.2;
    }

    if (formalities[i] !== undefined) {
      const avgFormality = mean(formalities);
      score += smoothStep(0.3, 0, Math.abs(formalities[i] - avgFormality)) * 0.15;
      factors += 0.15;
    }

    const firstWord = s.text.split(/\s+/)[0].toLowerCase();
    if (SENTENCE_STARTERS_AI.has(firstWord)) {
      score += 0.1;
      factors += 0.1;
    }

    return {
      text: s.text,
      start: s.start,
      end: s.end,
      score: factors > 0 ? clamp(score / factors * (factors + 0.3)) : 0.5
    };
  });
}

export function analyzeText(text) {
  if (!text || text.trim().length === 0) {
    return null;
  }

  const tokens = tokenize(text);

  if (tokens.words.length < 5) {
    return {
      overallScore: 0,
      confidence: 0,
      breakdown: [],
      sentenceScores: [],
      flaggedPhrases: [],
      stats: { words: tokens.words.length, sentences: tokens.sentences.length, paragraphs: tokens.paragraphs.length }
    };
  }

  const weights = {
    perplexity: 0.20,
    burstiness: 0.20,
    vocabulary: 0.15,
    structure: 0.15,
    repetition: 0.10,
    aiPhrases: 0.10,
    tone: 0.10
  };

  const results = {
    perplexity: analyzePerplexity(tokens),
    burstiness: analyzeBurstiness(tokens),
    vocabulary: analyzeVocabulary(tokens),
    structure: analyzeStructure(tokens),
    repetition: analyzeRepetition(tokens),
    aiPhrases: analyzeAIPhrases(tokens),
    tone: analyzeTone(tokens)
  };

  let overallScore = 0;
  const scores = [];
  const breakdown = [];

  for (const [key, weight] of Object.entries(weights)) {
    const result = results[key];
    overallScore += result.score * weight;
    scores.push(result.score);
    breakdown.push({
      label: result.label,
      score: result.score,
      weight,
      detail: result.detail
    });
  }

  overallScore = 0.5 + (overallScore - 0.5) * 0.85;

  const scoreStd = standardDeviation(scores);
  const agreementConf = clamp(1 - scoreStd * 2.0);

  const extremity = Math.abs(overallScore - 0.5) * 2;
  const evidenceConf = smoothStep(0, 0.6, extremity);

  const wordCount = tokens.words.length;
  const lengthConf = clamp((wordCount - 30) / 220);

  const sentCount = tokens.sentences.length;
  const sentConf = clamp((sentCount - 2) / 8);

  let confidence = agreementConf * 0.35 + evidenceConf * 0.25 + lengthConf * 0.25 + sentConf * 0.15;

  if (wordCount < 50) confidence = Math.min(confidence, 0.3);
  else if (wordCount < 100) confidence = Math.min(confidence, 0.6);

  const sentenceScores = scoreSentences(tokens, results);

  return {
    overallScore: clamp(overallScore),
    confidence: clamp(confidence),
    breakdown,
    sentenceScores,
    flaggedPhrases: results.aiPhrases.flaggedPhrases || [],
    stats: {
      words: tokens.words.length,
      sentences: tokens.sentences.length,
      paragraphs: tokens.paragraphs.length,
      avgSentenceLength: mean(tokens.sentences.map(s => s.wordCount)).toFixed(1),
      vocabularySize: new Set(tokens.lowerWords).size
    },
    sentenceLengths: results.burstiness.sentenceLengths || [],
    repeatedPhrases: results.repetition.repeatedPhrases || []
  };
}
