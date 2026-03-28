// humanizer.js — Text humanization engine with 8-step transform pipeline
import { splitSentences, extractWords, lowercaseWords } from '../nlp/tokenizer.js';
import { mean, coefficientOfVariation, clamp } from '../nlp/statistics.js';
import { AI_PHRASES, AI_PHRASE_REPLACEMENTS, DISCOURSE_MARKERS, FILLER_PHRASES, FORMAL_TO_CASUAL, CONTRACTION_MAP, SENTENCE_STARTERS_AI } from '../nlp/wordlists.js';

// Step 1: Replace AI phrases with natural alternatives (context-safe)
function replaceAIPhrases(text, changes) {
  let result = text;

  for (const [phrase, replacements] of AI_PHRASE_REPLACEMENTS) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Capture optional trailing punctuation so we can handle it
    const regex = new RegExp(escaped + '([,.:;]?)', 'gi');
    result = result.replace(regex, (fullMatch, trailingPunct) => {
      let replacement = replacements[Math.floor(Math.random() * replacements.length)];
      // Strip any accidental trailing punctuation from the replacement itself
      replacement = replacement.replace(/[,.:;]+$/, '');
      // Re-attach the original trailing punctuation (if any) exactly once
      if (trailingPunct) {
        replacement += trailingPunct;
      }
      changes.push({ type: 'ai-phrase', original: fullMatch, replacement, step: 1 });
      return replacement;
    });
  }

  return result;
}

// Step 2: Vary sentence lengths
function varySentenceLengths(text, intensity, changes) {
  const sentences = splitSentences(text);
  if (sentences.length < 3) return text;

  const lengths = sentences.map(s => s.wordCount);
  const cv = coefficientOfVariation(lengths);

  // Only modify if too uniform
  if (cv > 0.4) return text;

  const modified = [];
  let i = 0;

  while (i < sentences.length) {
    const s = sentences[i];
    const words = extractWords(s.text);

    // Split long sentences at natural break points
    if (words.length > 25 && intensity !== 'light') {
      const conjIdx = findSplitPoint(s.text);
      if (conjIdx > 10) {
        const part1 = s.text.substring(0, conjIdx).trim();
        const part2 = s.text.substring(conjIdx).trim()
          .replace(/^(,\s*|;\s*)(and|but|or|so|because|which|that|while)\s*/i, (m, punct, conj) => {
            return conj.charAt(0).toUpperCase() + conj.slice(1) + ' ';
          });

        if (part1.length > 10 && part2.length > 10) {
          modified.push(ensureEnding(part1));
          modified.push(ensureEnding(part2));
          changes.push({ type: 'split', original: s.text, replacement: `${part1} | ${part2}`, step: 2 });
          i++;
          continue;
        }
      }
    }

    // Merge short adjacent sentences
    if (words.length < 8 && i + 1 < sentences.length && sentences[i + 1].wordCount < 8 && intensity !== 'light') {
      const conjunctions = [' and ', ' but ', ' so ', ', and ', ' — '];
      const conj = conjunctions[Math.floor(Math.random() * conjunctions.length)];
      const merged = s.text.replace(/[.!?]+$/, '') + conj + sentences[i + 1].text.charAt(0).toLowerCase() + sentences[i + 1].text.slice(1);
      modified.push(merged);
      changes.push({ type: 'merge', original: `${s.text} + ${sentences[i + 1].text}`, replacement: merged, step: 2 });
      i += 2;
      continue;
    }

    modified.push(s.text);
    i++;
  }

  return modified.join(' ');
}

function findSplitPoint(text) {
  // Look for comma + conjunction or semicolon
  const patterns = [
    /,\s*(and|but|or|so|because|which|while)\s/gi,
    /;\s/g,
    /\s—\s/g
  ];

  let bestIdx = -1;
  const mid = text.length / 2;

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      if (bestIdx === -1 || Math.abs(match.index - mid) < Math.abs(bestIdx - mid)) {
        bestIdx = match.index;
      }
    }
  }

  return bestIdx;
}

function ensureEnding(text) {
  const trimmed = text.trim();
  if (/[.!?]$/.test(trimmed)) return trimmed;
  return trimmed + '.';
}

// Step 3: Introduce contractions
function introduceContractions(text, changes) {
  let result = text;

  for (const [full, contraction] of CONTRACTION_MAP) {
    const regex = new RegExp('\\b' + full.replace(/\s+/g, '\\s+') + '\\b', 'gi');
    result = result.replace(regex, (match) => {
      // Apply to ~60% of opportunities
      if (Math.random() > 0.6) return match;

      // Match case
      let replacement = contraction;
      if (match[0] === match[0].toUpperCase()) {
        replacement = contraction.charAt(0).toUpperCase() + contraction.slice(1);
      }

      changes.push({ type: 'contraction', original: match, replacement, step: 3 });
      return replacement;
    });
  }

  return result;
}

// Step 4: Passive to active voice (basic)
function passiveToActive(text, changes) {
  // Pattern: was/were/is/are + past participle + by + agent
  const regex = /\b(was|were|is|are|has been|have been)\s+(\w+ed)\s+by\s+([\w\s]+?)([.,;!?]|$)/gi;

  return text.replace(regex, (match, aux, verb, agent, end) => {
    // Only transform clear cases
    if (agent.trim().split(/\s+/).length > 4) return match; // Agent too long, likely complex

    const baseVerb = verb.replace(/ed$/, '');
    let tense = 'past';
    if (['is', 'are'].includes(aux.toLowerCase())) tense = 'present';

    const activeVerb = tense === 'present' ? verb.replace(/ed$/, 's') : verb;
    const replacement = `${agent.trim()} ${activeVerb}${end}`;

    changes.push({ type: 'active-voice', original: match.trim(), replacement: replacement.trim(), step: 4 });
    return replacement;
  });
}

// Step 5: Inject discourse markers
function injectDiscourseMarkers(text, intensity, changes) {
  const sentences = splitSentences(text);
  if (sentences.length < 4) return text;

  const frequency = intensity === 'heavy' ? 3 : intensity === 'moderate' ? 6 : 10;
  const result = [];

  for (let i = 0; i < sentences.length; i++) {
    if (i > 0 && i % frequency === 0 && Math.random() > 0.3) {
      const marker = DISCOURSE_MARKERS[Math.floor(Math.random() * DISCOURSE_MARKERS.length)];
      const original = sentences[i].text;
      const modified = marker + ' ' + original.charAt(0).toLowerCase() + original.slice(1);
      result.push(modified);
      changes.push({ type: 'discourse-marker', original, replacement: modified, step: 5 });
    } else {
      result.push(sentences[i].text);
    }
  }

  return result.join(' ');
}

// Step 6: Controlled imperfections
function addImperfections(text, intensity, changes) {
  let result = text;

  // Replace formal words with casual equivalents
  for (const [formal, casual] of FORMAL_TO_CASUAL) {
    const regex = new RegExp('\\b' + formal + '\\b', 'gi');
    result = result.replace(regex, (match) => {
      if (Math.random() > (intensity === 'heavy' ? 0.8 : 0.5)) return match;

      let replacement = casual;
      if (match[0] === match[0].toUpperCase()) {
        replacement = casual.charAt(0).toUpperCase() + casual.slice(1);
      }
      changes.push({ type: 'simplify', original: match, replacement, step: 6 });
      return replacement;
    });
  }

  // Start some sentences with "And" or "But"
  if (intensity !== 'light') {
    const sentences = splitSentences(result);
    const modified = sentences.map((s, i) => {
      if (i > 2 && Math.random() < 0.1) {
        const starters = ['And ', 'But '];
        const starter = starters[Math.floor(Math.random() * starters.length)];
        const mod = starter + s.text.charAt(0).toLowerCase() + s.text.slice(1);
        changes.push({ type: 'imperfection', original: s.text, replacement: mod, step: 6 });
        return mod;
      }
      return s.text;
    });
    result = modified.join(' ');
  }

  return result;
}

// Step 7: Diversify sentence starters
function diversifyStarters(text, changes) {
  const sentences = splitSentences(text);
  if (sentences.length < 3) return text;

  const modified = [...sentences.map(s => s.text)];

  // Find consecutive sentences starting with the same word
  for (let i = 1; i < modified.length; i++) {
    const prevStart = modified[i - 1].split(/\s+/)[0].toLowerCase();
    const currStart = modified[i].split(/\s+/)[0].toLowerCase();

    if (prevStart === currStart && SENTENCE_STARTERS_AI.has(currStart)) {
      const rewrites = [
        // Prepend a transitional phrase
        `What's interesting is that ${modified[i].charAt(0).toLowerCase() + modified[i].slice(1)}`,
        `Looking at it another way, ${modified[i].charAt(0).toLowerCase() + modified[i].slice(1)}`,
        `From a practical standpoint, ${modified[i].charAt(0).toLowerCase() + modified[i].slice(1)}`,
        `On a related note, ${modified[i].charAt(0).toLowerCase() + modified[i].slice(1)}`
      ];
      const rewrite = rewrites[Math.floor(Math.random() * rewrites.length)];
      changes.push({ type: 'starter', original: modified[i], replacement: rewrite, step: 7 });
      modified[i] = rewrite;
    }
  }

  return modified.join(' ');
}

// Step 8: Final polish — aggressive punctuation and spacing cleanup
function finalPolish(text, changes) {
  let result = text;

  // Fix double spaces
  result = result.replace(/  +/g, ' ');

  // Fix malformed punctuation combos: ,. → .  ,, → ,  .: → :  ;. → .  :: → :
  result = result.replace(/[,;:]\s*\./g, '.');
  result = result.replace(/\.\s*,/g, '.');
  result = result.replace(/,,+/g, ',');
  result = result.replace(/\.\.+/g, '.');
  result = result.replace(/::+/g, ':');
  result = result.replace(/;;+/g, ';');
  result = result.replace(/:\s*\./g, '.');
  result = result.replace(/;\s*,/g, ';');
  result = result.replace(/,\s*;/g, ';');
  result = result.replace(/,\s*:/g, ':');

  // Fix spacing around punctuation (remove space before punctuation)
  result = result.replace(/\s+([.,;:!?])/g, '$1');

  // Ensure space after punctuation (except end-of-string)
  result = result.replace(/([.,;:!?])([A-Za-z])/g, '$1 $2');

  // Ensure proper capitalization after sentence endings
  result = result.replace(/([.!?])\s+([a-z])/g, (m, punct, letter) => {
    return punct + ' ' + letter.toUpperCase();
  });

  // Capitalize first character of text
  result = result.replace(/^\s*[a-z]/, m => m.toUpperCase());

  // Fix any broken contractions
  result = result.replace(/'\s+(?=[a-z])/g, "'");

  // Remove leading/trailing whitespace
  result = result.trim();

  return result;
}

// Main humanizer function
export function humanizeText(text, options = {}) {
  if (!text || text.trim().length === 0) return null;

  const {
    intensity = 'moderate', // light, moderate, heavy
    imperfections = true,
    lengthVariation = true
  } = options;

  const changes = [];
  let result = text;

  // Preserve paragraph breaks
  const paragraphs = result.split(/\n\s*\n/);
  const processedParagraphs = paragraphs.map(para => {
    let processed = para;

    // Step 1: AI phrase replacement
    processed = replaceAIPhrases(processed, changes);

    // Step 2: Sentence length variation
    if (lengthVariation) {
      processed = varySentenceLengths(processed, intensity, changes);
    }

    // Step 3: Contractions
    processed = introduceContractions(processed, changes);

    // Step 4: Passive to active voice
    processed = passiveToActive(processed, changes);

    // Step 5: Discourse markers
    processed = injectDiscourseMarkers(processed, intensity, changes);

    // Step 6: Controlled imperfections
    if (imperfections) {
      processed = addImperfections(processed, intensity, changes);
    }

    // Step 7: Diversify starters
    processed = diversifyStarters(processed, changes);

    // Step 8: Final polish
    processed = finalPolish(processed, changes);

    return processed;
  });

  result = processedParagraphs.join('\n\n');

  return {
    original: text,
    humanized: result,
    changes,
    changeCount: changes.length,
    changeSummary: summarizeChanges(changes)
  };
}

function summarizeChanges(changes) {
  const summary = {};
  for (const c of changes) {
    summary[c.type] = (summary[c.type] || 0) + 1;
  }
  return summary;
}
