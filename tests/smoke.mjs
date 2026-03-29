#!/usr/bin/env node

import { analyzeText } from '../js/engines/ai-detector.js';
import { analyzePlagiarism, compareTexts } from '../js/engines/plagiarism.js';
import { humanizeText } from '../js/engines/humanizer.js';

let passed = 0;
let failed = 0;

function assert(condition, name) {
  if (condition) {
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
    passed++;
  } else {
    console.log(`  \x1b[31m✗\x1b[0m ${name}`);
    failed++;
  }
}

const AI_TEXT = `Artificial intelligence has become an increasingly important topic in today's digital age. It is important to note that the rapid advancement of AI technology plays a crucial role in shaping various industries across the globe. Furthermore, the integration of machine learning algorithms into everyday applications has fundamentally transformed how businesses operate and deliver value to their customers. The landscape of artificial intelligence encompasses a wide range of technologies, from natural language processing to computer vision. Moreover, these technologies have demonstrated remarkable capabilities in automating complex tasks that were previously thought to require human intelligence. Additionally, the development of large language models has underscored the importance of responsible AI development and deployment. In conclusion, the multifaceted nature of artificial intelligence presents both unprecedented opportunities and significant challenges. It is essential to navigate the complexities of AI governance while fostering innovation that benefits society as a whole.`;

const HUMAN_TEXT = `I've been messing around with AI tools for about six months now, and honestly? They're weird. Like, really weird. Some days the chatbot writes better emails than I do — and other days it confidently tells me that Napoleon won World War II. My friend Sarah tried using one to plan her wedding. It suggested serving "deconstructed cake molecules" at the reception. We still laugh about that. But here's the thing that bugs me. When I read something written by AI, I can usually tell. Not always! Sometimes it fools me completely. But there's this... flatness to it? Every sentence is about the same length. You know what I mean? Like right now — I just went off on a tangent about wedding cakes. An AI wouldn't do that.`;

const SHORT_TEXT = `AI is interesting. It does stuff.`;

const PARA = `The quick brown fox jumped over the lazy dog near the riverbank on a sunny afternoon.`;
const DUPLICATED_PARA = `${PARA} Something else happened. ${PARA} And then more stuff. ${PARA}`;

const TEXT_A = `Machine learning is a subset of artificial intelligence that focuses on building systems that learn from data. These systems improve their performance over time without being explicitly programmed.`;
const TEXT_B = `Machine learning is a subset of artificial intelligence that focuses on building systems that learn from data. These systems get better over time without being explicitly coded.`;
const TEXT_UNRELATED = `The weather forecast for tomorrow predicts scattered showers in the morning with clearing skies by afternoon. Temperatures will reach a high of 72 degrees.`;

const TEXT_BIG_A = `Artificial intelligence is transforming how companies approach customer service. Many organizations are investing in chatbot technology to handle routine inquiries. This allows human agents to focus on complex problems that require empathy and creative thinking.`;
const TEXT_BIG_B = `The local bakery has expanded its menu to include gluten-free options. Customers have responded positively to the new sourdough bread. Many organizations are investing in sustainable packaging to reduce waste.`;

console.log('\n\x1b[1m1. Self-plagiarism detection\x1b[0m');

const selfDup = analyzePlagiarism(DUPLICATED_PARA);
assert(selfDup !== null, 'returns result for duplicated text');
assert(selfDup.overallScore > 0.3, `duplicated paragraph scores high (${selfDup.overallScore.toFixed(2)} > 0.3)`);
assert(selfDup.duplicateMatches.length > 0,
  `duplicateMatches is non-empty (${selfDup.duplicateMatches.length} entries)`);
assert(selfDup.stats.duplicateFragments > 0,
  `duplicateFragments > 0 (${selfDup.stats.duplicateFragments})`);
assert(selfDup.duplicateMatches[0].text.length > 0,
  `first duplicate match has readable text ("${selfDup.duplicateMatches[0].text.slice(0, 40)}...")`);

const selfUnique = analyzePlagiarism(AI_TEXT);
assert(selfUnique.overallScore < 0.3, `unique text scores low self-plag (${selfUnique.overallScore.toFixed(2)} < 0.3)`);

console.log('\n\x1b[1m2. Two-text plagiarism comparison\x1b[0m');

const similar = compareTexts(TEXT_A, TEXT_B);
const unrelated = compareTexts(TEXT_A, TEXT_UNRELATED);
assert(similar.overallScore > unrelated.overallScore,
  `similar texts score higher (${similar.overallScore.toFixed(2)}) than unrelated (${unrelated.overallScore.toFixed(2)})`);

const tinyOverlap = compareTexts(TEXT_BIG_A, TEXT_BIG_B);
assert(tinyOverlap.overallScore < 0.4,
  `tiny shared phrase does not spike score (${tinyOverlap.overallScore.toFixed(2)} < 0.4)`);

const identical = compareTexts(TEXT_A, TEXT_A);
assert(identical.overallScore > 0.7,
  `identical texts score high (${identical.overallScore.toFixed(2)} > 0.7)`);

console.log('\n\x1b[1m3. Humanizer output quality\x1b[0m');

const PUNCT_PATTERNS = /,\.|,\s*,|\.\s*,|:\s*\.|;\.|\.\./;
let punctOk = true;
for (let i = 0; i < 5; i++) {
  const result = humanizeText(AI_TEXT, { intensity: 'heavy', imperfections: true, lengthVariation: true });
  if (PUNCT_PATTERNS.test(result.humanized)) {
    console.log(`    Bad punctuation found in run ${i}: ${result.humanized.match(PUNCT_PATTERNS)[0]}`);
    punctOk = false;
    break;
  }
}
assert(punctOk, 'no broken punctuation in 5 humanizer runs (,.  ,,  .:  etc.)');

const humResult = humanizeText(AI_TEXT, { intensity: 'moderate' });
assert(humResult !== null, 'humanizer returns a result');
assert(humResult.humanized.length > 0, 'humanized text is non-empty');
assert(humResult.changeCount > 0, `changes were made (${humResult.changeCount} changes)`);

const AWKWARD_OPENERS = /(?:right now|these days|currently|nowadays|today)[,:]?\s+(?:worth mentioning|one thing to know|something to note|keep in mind that|note that|remember that|it turns out that|notice that|notably)/i;
let openerOk = true;
for (let i = 0; i < 10; i++) {
  const r = humanizeText(AI_TEXT, { intensity: 'heavy', imperfections: true, lengthVariation: true });
  const match = r.humanized.match(AWKWARD_OPENERS);
  if (match) {
    console.log(`    Awkward opener found in run ${i}: "${match[0]}"`);
    openerOk = false;
    break;
  }
}
assert(openerOk, 'no awkward stacked openers in 10 humanizer runs');

console.log('\n\x1b[1m4. AI detector calibration\x1b[0m');

const aiResult = analyzeText(AI_TEXT);
const humanResult = analyzeText(HUMAN_TEXT);
assert(aiResult.overallScore > humanResult.overallScore,
  `AI text scores higher (${aiResult.overallScore.toFixed(2)}) than human (${humanResult.overallScore.toFixed(2)})`);
assert(aiResult.overallScore > 0.45,
  `AI text has meaningful score (${aiResult.overallScore.toFixed(2)} > 0.45)`);
assert(humanResult.overallScore < 0.55,
  `human text scores below 0.55 (${humanResult.overallScore.toFixed(2)})`);

console.log('\n\x1b[1m5. Short text confidence\x1b[0m');

const shortResult = analyzeText(SHORT_TEXT);
assert(shortResult.confidence < 0.35,
  `short text gets low confidence (${shortResult.confidence.toFixed(2)} < 0.35)`);
assert(aiResult.confidence > shortResult.confidence,
  `long text has higher confidence (${aiResult.confidence.toFixed(2)}) than short (${shortResult.confidence.toFixed(2)})`);

console.log(`\n\x1b[1mResults: ${passed} passed, ${failed} failed\x1b[0m`);
if (failed > 0) {
  console.log('\x1b[31mSome tests failed!\x1b[0m');
  process.exit(1);
} else {
  console.log('\x1b[32mAll tests passed!\x1b[0m');
}
