import { splitSentences, extractWords, lowercaseWords } from '../nlp/tokenizer.js';
import { mean, coefficientOfVariation, clamp } from '../nlp/statistics.js';
import { AI_PHRASES, AI_PHRASE_REPLACEMENTS, DISCOURSE_MARKERS, FILLER_PHRASES, FORMAL_TO_CASUAL, CONTRACTION_MAP, SENTENCE_STARTERS_AI } from '../nlp/wordlists.js';

function replaceAIPhrases(text, changes) {
  let result = text;

  for (const [phrase, replacements] of AI_PHRASE_REPLACEMENTS) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped + '([,.:;]?)', 'gi');
    result = result.replace(regex, (fullMatch, trailingPunct) => {
      let replacement = replacements[Math.floor(Math.random() * replacements.length)];
      replacement = replacement.replace(/[,.:;]+$/, '');
      if (trailingPunct) {
        replacement += trailingPunct;
      }
      changes.push({ type: 'ai-phrase', original: fullMatch, replacement, step: 1 });
      return replacement;
    });
  }

  return result;
}

function varySentenceLengths(text, intensity, changes) {
  const sentences = splitSentences(text);
  if (sentences.length < 3) return text;

  const lengths = sentences.map(s => s.wordCount);
  const cv = coefficientOfVariation(lengths);

  if (cv > 0.4) return text;

  const modified = [];
  let i = 0;

  while (i < sentences.length) {
    const s = sentences[i];
    const words = extractWords(s.text);

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

function introduceContractions(text, changes) {
  let result = text;

  for (const [full, contraction] of CONTRACTION_MAP) {
    const regex = new RegExp('\\b' + full.replace(/\s+/g, '\\s+') + '\\b', 'gi');
    result = result.replace(regex, (match) => {
      if (Math.random() > 0.6) return match;

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

function passiveToActive(text, changes) {
  const regex = /\b(was|were|is|are|has been|have been)\s+(\w+ed)\s+by\s+([\w\s]+?)([.,;!?]|$)/gi;

  return text.replace(regex, (match, aux, verb, agent, end) => {
    if (agent.trim().split(/\s+/).length > 4) return match;

    const baseVerb = verb.replace(/ed$/, '');
    let tense = 'past';
    if (['is', 'are'].includes(aux.toLowerCase())) tense = 'present';

    const activeVerb = tense === 'present' ? verb.replace(/ed$/, 's') : verb;
    const replacement = `${agent.trim()} ${activeVerb}${end}`;

    changes.push({ type: 'active-voice', original: match.trim(), replacement: replacement.trim(), step: 4 });
    return replacement;
  });
}

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

function addImperfections(text, intensity, changes) {
  let result = text;

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

function diversifyStarters(text, changes) {
  const sentences = splitSentences(text);
  if (sentences.length < 3) return text;

  const modified = [...sentences.map(s => s.text)];

  for (let i = 1; i < modified.length; i++) {
    const prevStart = modified[i - 1].split(/\s+/)[0].toLowerCase();
    const currStart = modified[i].split(/\s+/)[0].toLowerCase();

    if (prevStart === currStart && SENTENCE_STARTERS_AI.has(currStart)) {
      const rewrites = [
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

const INTRO_PHRASES = [
  'note that', 'keep in mind that', 'remember that',
  'it turns out that', 'notice that', 'notably',
  'these days', 'nowadays', 'today',
  'with how fast things move',
  'you really need to', 'the key is to', 'make sure to',
  'all in all', 'in the end', 'at the end of the day',
  'what matters here is that',
  'on top of that', 'what\'s more',
  'so', 'because of this', 'as a result',
  'also', 'plus', 'and',
];

function fixStackedOpeners(text, changes) {
  const sentences = splitSentences(text);
  if (sentences.length === 0) return text;

  const modified = sentences.map(s => {
    let t = s.text;

    for (const intro of INTRO_PHRASES) {
      const escapedIntro = intro.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(
        '^([A-Z][a-z\']+(?:\\s+[a-z\']+)*[,:])\\s+(' + escapedIntro + ')\\s+',
        'i'
      );
      const match = t.match(pattern);
      if (match) {
        const marker = match[1];
        const introHit = match[2];
        const afterIntro = t.slice(match[0].length);

        const temporals = ['these days', 'nowadays', 'today', 'with how fast things move'];
        let fixed;
        if (temporals.includes(introHit.toLowerCase())) {
          fixed = introHit.charAt(0).toUpperCase() + introHit.slice(1) + ', ' + afterIntro;
        } else {
          const rest = afterIntro.charAt(0).toUpperCase() + afterIntro.slice(1);
          fixed = marker + ' ' + rest;
        }
        changes.push({ type: 'stacked-opener', original: t, replacement: fixed, step: 8 });
        t = fixed;
        break;
      }
    }
    return t;
  });

  return modified.join(' ');
}

function finalPolish(text) {
  let result = text;

  result = result.replace(/  +/g, ' ');
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

  result = result.replace(/\s+([.,;:!?])/g, '$1');
  result = result.replace(/([.,;:!?])([A-Za-z])/g, '$1 $2');

  result = result.replace(/([.!?])\s+([a-z])/g, (m, punct, letter) => {
    return punct + ' ' + letter.toUpperCase();
  });

  result = result.replace(/^\s*[a-z]/, m => m.toUpperCase());
  result = result.replace(/'\s+(?=[a-z])/g, "'");
  result = result.trim();

  return result;
}

export function humanizeText(text, options = {}) {
  if (!text || text.trim().length === 0) return null;

  const {
    intensity = 'moderate',
    imperfections = true,
    lengthVariation = true
  } = options;

  const changes = [];
  let result = text;

  const paragraphs = result.split(/\n\s*\n/);
  const processedParagraphs = paragraphs.map(para => {
    let processed = para;

    processed = replaceAIPhrases(processed, changes);

    if (lengthVariation) {
      processed = varySentenceLengths(processed, intensity, changes);
    }

    processed = introduceContractions(processed, changes);
    processed = passiveToActive(processed, changes);
    processed = injectDiscourseMarkers(processed, intensity, changes);

    if (imperfections) {
      processed = addImperfections(processed, intensity, changes);
    }

    processed = diversifyStarters(processed, changes);
    processed = fixStackedOpeners(processed, changes);
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
