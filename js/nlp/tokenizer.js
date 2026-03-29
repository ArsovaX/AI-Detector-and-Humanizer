const ABBREVIATIONS = new Set([
  'mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'st', 'ave', 'blvd',
  'dept', 'est', 'fig', 'govt', 'inc', 'ltd', 'corp', 'vs', 'etc',
  'approx', 'vol', 'no', 'gen', 'sgt', 'cpl', 'pvt', 'capt', 'maj',
  'e.g', 'i.e', 'u.s', 'u.k', 'a.m', 'p.m'
]);

const FUNCTION_WORDS = new Set([
  'the', 'a', 'an', 'this', 'that', 'these', 'those', 'my', 'your', 'his',
  'her', 'its', 'our', 'their', 'some', 'any', 'no', 'every', 'all', 'both',
  'each', 'few', 'more', 'most', 'other', 'such', 'what', 'which', 'who',
  'whom', 'whose', 'in', 'on', 'at', 'by', 'for', 'with', 'about', 'against',
  'between', 'through', 'during', 'before', 'after', 'above', 'below', 'to',
  'from', 'up', 'down', 'out', 'off', 'over', 'under', 'again', 'further',
  'then', 'once', 'and', 'but', 'or', 'nor', 'not', 'so', 'yet', 'both',
  'either', 'neither', 'if', 'when', 'while', 'because', 'since', 'until',
  'although', 'though', 'unless', 'whereas', 'i', 'me', 'we', 'us', 'you',
  'he', 'him', 'she', 'it', 'they', 'them', 'myself', 'yourself', 'himself',
  'herself', 'itself', 'ourselves', 'themselves', 'is', 'am', 'are', 'was',
  'were', 'be', 'been', 'being', 'have', 'has', 'had', 'having', 'do', 'does',
  'did', 'will', 'would', 'shall', 'should', 'may', 'might', 'must', 'can',
  'could', 'need', 'dare', 'ought', 'used', 'of', 'into', 'as', 'than',
  'just', 'also', 'very', 'often', 'however', 'too', 'usually', 'really',
  'already', 'always', 'never', 'sometimes', 'still', 'here', 'there', 'where',
  'how', 'why', 'now', 'only', 'even', 'much', 'many', 'well', 'back',
  'also', 'like', 'just', 'quite', 'rather', 'enough', 'almost', 'perhaps'
]);

export function splitSentences(text) {
  const sentences = [];
  let current = '';
  let startIndex = 0;

  for (let i = 0; i < text.length; i++) {
    current += text[i];

    if (/[.!?]/.test(text[i])) {
      const nextChar = text[i + 1] || '';

      const wordBefore = current.trim().split(/\s+/).pop().replace(/[.!?]+$/, '').toLowerCase();
      const isAbbrev = ABBREVIATIONS.has(wordBefore) || /^\d+$/.test(wordBefore);
      const isEllipsis = text[i] === '.' && (text[i + 1] === '.' || text[i - 1] === '.');

      if (!isAbbrev && !isEllipsis && (/\s/.test(nextChar) || nextChar === '' || /[A-Z"'\u201C]/.test(nextChar))) {
        while (i + 1 < text.length && text[i + 1] === ' ') {
          current += text[++i];
        }

        const trimmed = current.trim();
        if (trimmed.length > 0) {
          sentences.push({
            text: trimmed,
            start: startIndex,
            end: startIndex + trimmed.length,
            wordCount: trimmed.split(/\s+/).filter(w => w.length > 0).length
          });
        }
        current = '';
        startIndex = i + 1;
      }
    }
  }

  const trimmed = current.trim();
  if (trimmed.length > 0) {
    sentences.push({
      text: trimmed,
      start: startIndex,
      end: startIndex + trimmed.length,
      wordCount: trimmed.split(/\s+/).filter(w => w.length > 0).length
    });
  }

  return sentences;
}

export function extractWords(text) {
  return text
    .split(/\s+/)
    .map(w => w.replace(/^[^\w]+|[^\w]+$/g, ''))
    .filter(w => w.length > 0);
}

export function lowercaseWords(words) {
  return words.map(w => w.toLowerCase());
}

export function syllableCount(word) {
  word = word.toLowerCase().replace(/[^a-z]/g, '');
  if (word.length <= 2) return 1;

  let count = 0;
  let prevVowel = false;
  const vowels = 'aeiouy';

  for (let i = 0; i < word.length; i++) {
    const isVowel = vowels.includes(word[i]);
    if (isVowel && !prevVowel) count++;
    prevVowel = isVowel;
  }

  if (word.endsWith('e') && count > 1) count--;
  if (word.endsWith('le') && word.length > 2 && !vowels.includes(word[word.length - 3])) count++;

  return Math.max(1, count);
}

export function posTag(word) {
  const w = word.toLowerCase();

  if (FUNCTION_WORDS.has(w)) {
    if (['is', 'am', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
      'do', 'does', 'did', 'will', 'would', 'shall', 'should', 'may', 'might',
      'must', 'can', 'could'].includes(w)) return 'VERB';
    if (['i', 'me', 'we', 'us', 'you', 'he', 'him', 'she', 'her', 'it', 'they', 'them',
      'myself', 'yourself', 'himself', 'herself', 'itself', 'ourselves', 'themselves'].includes(w)) return 'PRON';
    if (['the', 'a', 'an', 'this', 'that', 'these', 'those', 'my', 'your', 'his',
      'her', 'its', 'our', 'their', 'some', 'any', 'no', 'every', 'all'].includes(w)) return 'DET';
    if (['in', 'on', 'at', 'by', 'for', 'with', 'about', 'against', 'between', 'through',
      'during', 'before', 'after', 'above', 'below', 'to', 'from', 'up', 'down',
      'out', 'off', 'over', 'under', 'of', 'into', 'as'].includes(w)) return 'PREP';
    if (['and', 'but', 'or', 'nor', 'so', 'yet', 'both', 'either', 'neither',
      'if', 'when', 'while', 'because', 'since', 'until', 'although', 'though',
      'unless', 'whereas'].includes(w)) return 'CONJ';
    return 'ADV';
  }

  if (w.endsWith('ly')) return 'ADV';
  if (w.endsWith('tion') || w.endsWith('sion') || w.endsWith('ment') || w.endsWith('ness') ||
    w.endsWith('ity') || w.endsWith('ence') || w.endsWith('ance')) return 'NOUN';
  if (w.endsWith('ing')) return 'VERB';
  if (w.endsWith('ed')) return 'VERB';
  if (w.endsWith('ful') || w.endsWith('ous') || w.endsWith('ive') || w.endsWith('ical') ||
    w.endsWith('able') || w.endsWith('ible') || w.endsWith('al') || w.endsWith('ent') ||
    w.endsWith('ant')) return 'ADJ';
  if (w.endsWith('er') || w.endsWith('or')) return 'NOUN';
  if (w.endsWith('ist') || w.endsWith('ism')) return 'NOUN';

  return 'NOUN';
}

export function tokenize(text) {
  const sentences = splitSentences(text);
  const words = extractWords(text);
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);

  return {
    sentences,
    words,
    paragraphs,
    chars: text.length,
    lowerWords: lowercaseWords(words)
  };
}

export function isStopWord(word) {
  return FUNCTION_WORDS.has(word.toLowerCase());
}

export function getContentWords(words) {
  return words.filter(w => !FUNCTION_WORDS.has(w.toLowerCase()));
}
