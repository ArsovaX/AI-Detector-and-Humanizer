// app.js — Main orchestrator
import { analyzeText } from './engines/ai-detector.js';
import { analyzePlagiarism, compareTexts } from './engines/plagiarism.js';
import { humanizeText } from './engines/humanizer.js';
import { createGauge, scoreColor } from './ui/gauges.js';
import { renderHeatmap, renderPlagiarismHighlight, renderFlaggedPhrases } from './ui/highlights.js';
import { renderDiff } from './ui/diff.js';
import { renderSentenceLengthChart, renderVocabDistribution, destroyCharts } from './ui/charts.js';
import { exportReport } from './ui/pdf-export.js';
import { extractWords } from './nlp/tokenizer.js';

// ===== DOM Cache =====
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// Theme
const themeToggle = $('#themeToggle');

// Tabs
const tabBtns = $$('.tab-btn');
const tabPanels = $$('.tab-panel');
const tabIndicator = $('.tab-indicator');

// Detector
const detectorInput = $('#detectorInput');
const detectorAnalyze = $('#detectorAnalyze');
const detectorClear = $('#detectorClear');
const detectorSample = $('#detectorSample');
const detectorLoading = $('#detectorLoading');
const detectorResults = $('#detectorResults');
const detectorProgress = $('#detectorProgress');

// Plagiarism
const plagCompareBtn = $('#plagCompareBtn');
const plagSelfBtn = $('#plagSelfBtn');
const plagInputA = $('#plagInputA');
const plagInputB = $('#plagInputB');
const plagInputSelf = $('#plagInputSelf');
const plagLoading = $('#plagLoading');
const plagResults = $('#plagResults');
const plagSelfResults = $('#plagSelfResults');
const plagSample = $('#plagSample');
const plagSwap = $('#plagSwap');

// Humanizer
const humanizerInput = $('#humanizerInput');
const humanizerRun = $('#humanizerRun');
const humanizerClear = $('#humanizerClear');
const humanizerSample = $('#humanizerSample');
const humanizerLoading = $('#humanizerLoading');
const humanizerResults = $('#humanizerResults');
const copyHumanized = $('#copyHumanized');

// ===== Sample Texts =====
const SAMPLE_AI = `Artificial intelligence has become an increasingly important topic in today's digital age. It is important to note that the rapid advancement of AI technology plays a crucial role in shaping various industries across the globe. Furthermore, the integration of machine learning algorithms into everyday applications has fundamentally transformed how businesses operate and deliver value to their customers.

The landscape of artificial intelligence encompasses a wide range of technologies, from natural language processing to computer vision. Moreover, these technologies have demonstrated remarkable capabilities in automating complex tasks that were previously thought to require human intelligence. Additionally, the development of large language models has underscored the importance of responsible AI development and deployment.

In conclusion, the multifaceted nature of artificial intelligence presents both unprecedented opportunities and significant challenges. It is essential to navigate the complexities of AI governance while fostering innovation that benefits society as a whole. The ever-evolving field of AI continues to push the boundaries of what is technologically possible, serving as a testament to human ingenuity and the relentless pursuit of progress.`;

const SAMPLE_HUMAN = `I've been messing around with AI tools for about six months now, and honestly? They're weird. Like, really weird. Some days the chatbot writes better emails than I do — and other days it confidently tells me that Napoleon won World War II.

My friend Sarah tried using one to plan her wedding. It suggested serving "deconstructed cake molecules" at the reception. We still laugh about that.

But here's the thing that bugs me. When I read something written by AI, I can usually tell. Not always! Sometimes it fools me completely. But there's this... flatness to it? Every sentence is about the same length. The vocabulary is weirdly consistent. It never makes the kind of bizarre tangents that real people make when they're writing.

You know what I mean? Like right now — I just went off on a tangent about wedding cakes. An AI wouldn't do that. It would stay relentlessly on-topic, hitting every talking point like a well-rehearsed presentation.`;

const SAMPLE_PLAG_A = `Machine learning is a subset of artificial intelligence that focuses on building systems that learn from data. These systems improve their performance over time without being explicitly programmed. The key idea behind machine learning is that computers can learn patterns from data and make decisions with minimal human intervention. Deep learning, a subset of machine learning, uses neural networks with many layers to analyze various factors of data.`;

const SAMPLE_PLAG_B = `Machine learning is a subset of artificial intelligence that focuses on building systems that learn from data. These systems get better over time without being explicitly coded. The core concept of machine learning is that computers can identify patterns in data and make decisions with little human involvement. Deep learning, which is part of machine learning, uses neural networks with multiple layers to analyze various aspects of data.`;

// ===== Theme =====
function initTheme() {
  const saved = localStorage.getItem('textforge-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('textforge-theme', next);
  lucide.createIcons();
}

// ===== Tabs =====
function initTabs() {
  updateIndicator();

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;

      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      tabPanels.forEach(p => p.classList.remove('active'));
      $(`#panel-${tab}`).classList.add('active');

      updateIndicator();
      history.replaceState(null, '', `#${tab}`);
    });
  });

  // Hash routing
  const hash = location.hash.replace('#', '');
  if (hash) {
    const btn = $(`.tab-btn[data-tab="${hash}"]`);
    if (btn) btn.click();
  }

  window.addEventListener('resize', updateIndicator);
}

function updateIndicator() {
  const active = $('.tab-btn.active');
  if (!active || !tabIndicator) return;
  tabIndicator.style.left = active.offsetLeft + 'px';
  tabIndicator.style.width = active.offsetWidth + 'px';
}

// ===== Text Stats =====
function updateWordCount(textarea, wordEl, charEl, sentEl) {
  const text = textarea.value;
  const words = text.trim() ? extractWords(text).length : 0;
  const chars = text.length;
  const sents = text.trim() ? (text.match(/[.!?]+(\s|$)/g) || []).length || (words > 0 ? 1 : 0) : 0;

  if (wordEl) wordEl.textContent = `${words} words`;
  if (charEl) charEl.textContent = `${chars} chars`;
  if (sentEl) sentEl.textContent = `${sents} sentences`;
}

function initTextStats() {
  detectorInput.addEventListener('input', () => {
    updateWordCount(detectorInput, $('#detectorWords'), $('#detectorChars'), $('#detectorSentences'));
  });

  plagInputA.addEventListener('input', () => {
    const words = plagInputA.value.trim() ? extractWords(plagInputA.value).length : 0;
    $('#plagWordsA').textContent = `${words} words`;
  });
  plagInputB.addEventListener('input', () => {
    const words = plagInputB.value.trim() ? extractWords(plagInputB.value).length : 0;
    $('#plagWordsB').textContent = `${words} words`;
  });
  plagInputSelf.addEventListener('input', () => {
    const words = plagInputSelf.value.trim() ? extractWords(plagInputSelf.value).length : 0;
    $('#plagWordsSelf').textContent = `${words} words`;
  });
  humanizerInput.addEventListener('input', () => {
    const words = humanizerInput.value.trim() ? extractWords(humanizerInput.value).length : 0;
    $('#humanizerWords').textContent = `${words} words`;
  });
}

// ===== Plagiarism Mode Toggle =====
function initPlagModes() {
  $$('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const mode = btn.dataset.mode;
      if (mode === 'compare') {
        $('#plagCompare').classList.remove('hidden');
        $('#plagSelf').classList.add('hidden');
        plagResults.classList.add('hidden');
        plagSelfResults.classList.add('hidden');
      } else {
        $('#plagCompare').classList.add('hidden');
        $('#plagSelf').classList.remove('hidden');
        plagResults.classList.add('hidden');
        plagSelfResults.classList.add('hidden');
      }
    });
  });
}

// ===== AI Detector =====
let lastDetectorResults = null;

async function runDetector() {
  const text = detectorInput.value.trim();
  if (!text) return;

  detectorResults.classList.add('hidden');
  detectorLoading.classList.remove('hidden');
  destroyCharts();

  // Simulate progress
  let progress = 0;
  const progressInterval = setInterval(() => {
    progress = Math.min(progress + Math.random() * 15, 90);
    detectorProgress.style.width = `${progress}%`;
  }, 100);

  // Run analysis async
  await delay(300);
  const results = analyzeText(text);
  lastDetectorResults = results;

  clearInterval(progressInterval);
  detectorProgress.style.width = '100%';
  await delay(200);

  detectorLoading.classList.add('hidden');

  if (!results) return;
  renderDetectorResults(results);
  detectorResults.classList.remove('hidden');
}

function renderDetectorResults(results) {
  // Main gauge
  createGauge($('#mainGauge'), results.overallScore);

  // Confidence
  $('#confidenceFill').style.width = `${results.confidence * 100}%`;
  $('#confidenceValue').textContent = `${Math.round(results.confidence * 100)}%`;

  // Verdict
  const verdict = $('#scoreVerdict');
  if (results.overallScore > 0.7) {
    verdict.textContent = 'Likely AI-Generated';
    verdict.className = 'score-verdict verdict-ai';
  } else if (results.overallScore > 0.4) {
    verdict.textContent = 'Mixed / Uncertain';
    verdict.className = 'score-verdict verdict-mixed';
  } else {
    verdict.textContent = 'Likely Human-Written';
    verdict.className = 'score-verdict verdict-human';
  }

  // Stats
  const statsRow = $('#textStats');
  statsRow.innerHTML = [
    { value: results.stats.words, label: 'Words' },
    { value: results.stats.sentences, label: 'Sentences' },
    { value: results.stats.paragraphs, label: 'Paragraphs' },
    { value: results.stats.avgSentenceLength, label: 'Avg Length' },
    { value: results.stats.vocabularySize, label: 'Vocab Size' }
  ].map(s => `
    <div class="stat-card">
      <div class="stat-value">${s.value}</div>
      <div class="stat-label">${s.label}</div>
    </div>
  `).join('');

  // Breakdown
  const grid = $('#breakdownGrid');
  grid.innerHTML = results.breakdown.map((item, i) => {
    const pct = Math.round(item.score * 100);
    const color = scoreColor(item.score);
    return `
      <div class="breakdown-card" style="animation-delay: ${i * 0.08}s">
        <div class="breakdown-header">
          <span class="breakdown-label">${item.label}</span>
          <span class="breakdown-score" style="color: ${color}">${pct}%</span>
        </div>
        <div class="breakdown-bar">
          <div class="breakdown-fill" style="width: ${pct}%; background: ${color}"></div>
        </div>
        <div class="breakdown-detail">${item.detail}</div>
        <div class="breakdown-weight">Weight: ${Math.round(item.weight * 100)}%</div>
      </div>
    `;
  }).join('');

  // Heatmap
  renderHeatmap($('#heatmapContainer'), results.sentenceScores);

  // Charts
  if (results.sentenceLengths.length > 0) {
    renderSentenceLengthChart($('#sentenceLengthChart'), results.sentenceLengths, results.sentenceScores);
  }
  if (results.stats.words > 10) {
    const words = detectorInput.value.trim().split(/\s+/).map(w => w.replace(/^[^\w]+|[^\w]+$/g, '')).filter(w => w);
    renderVocabDistribution($('#vocabChart'), words);
  }

  // Flagged phrases
  const flaggedSection = $('#flaggedSection');
  if (results.flaggedPhrases.length > 0) {
    flaggedSection.classList.remove('hidden');
    renderFlaggedPhrases($('#flaggedList'), results.flaggedPhrases);
  } else {
    flaggedSection.classList.add('hidden');
  }

  lucide.createIcons();
}

// ===== Plagiarism =====
async function runCompare() {
  const textA = plagInputA.value.trim();
  const textB = plagInputB.value.trim();
  if (!textA || !textB) return;

  plagResults.classList.add('hidden');
  plagSelfResults.classList.add('hidden');
  plagLoading.classList.remove('hidden');

  await delay(300);
  const results = compareTexts(textA, textB);
  await delay(200);

  plagLoading.classList.add('hidden');
  if (!results) return;

  renderCompareResults(results);
  plagResults.classList.remove('hidden');
}

function renderCompareResults(results) {
  createGauge($('#plagGauge'), results.overallScore);

  const verdict = $('#plagVerdict');
  if (results.overallScore > 0.7) {
    verdict.textContent = 'High Similarity — Likely Plagiarized';
    verdict.className = 'score-verdict verdict-ai';
  } else if (results.overallScore > 0.3) {
    verdict.textContent = 'Moderate Similarity — Some Overlap';
    verdict.className = 'score-verdict verdict-mixed';
  } else {
    verdict.textContent = 'Low Similarity — Likely Original';
    verdict.className = 'score-verdict verdict-human';
  }

  // Stats
  $('#plagStats').innerHTML = [
    { value: results.stats.sentencesA, label: 'Sentences A' },
    { value: results.stats.sentencesB, label: 'Sentences B' },
    { value: results.stats.matchedPairs, label: 'Matched Pairs' },
    { value: results.stats.exactMatches, label: 'Exact Matches' },
    { value: `${Math.round(results.jaccardSimilarity * 100)}%`, label: 'Jaccard Index' }
  ].map(s => `
    <div class="stat-card">
      <div class="stat-value">${s.value}</div>
      <div class="stat-label">${s.label}</div>
    </div>
  `).join('');

  // Highlights
  renderPlagiarismHighlight($('#plagHighlightA'), results.sentencesA, results.matchedIndicesA);
  renderPlagiarismHighlight($('#plagHighlightB'), results.sentencesB, results.matchedIndicesB);

  // Match list
  const matchSection = $('#matchListSection');
  const matchList = $('#matchList');

  if (results.matchedSentences.length > 0) {
    matchSection.classList.remove('hidden');
    matchList.innerHTML = results.matchedSentences.map((m, i) => `
      <div class="match-pair" style="animation-delay: ${i * 0.1}s">
        <div class="match-pair-header">
          <span>Match #${i + 1}</span>
          <span class="match-similarity">${Math.round(m.similarity * 100)}% similar</span>
        </div>
        <div class="match-text-label">Text A (Sentence ${m.sentenceA.index + 1})</div>
        <div class="match-text">${escapeHtml(m.sentenceA.text)}</div>
        <div class="match-text-label">Text B (Sentence ${m.sentenceB.index + 1})</div>
        <div class="match-text">${escapeHtml(m.sentenceB.text)}</div>
      </div>
    `).join('');
  } else {
    matchSection.classList.add('hidden');
  }

  lucide.createIcons();
}

async function runSelfAnalysis() {
  const text = plagInputSelf.value.trim();
  if (!text) return;

  plagResults.classList.add('hidden');
  plagSelfResults.classList.add('hidden');
  plagLoading.classList.remove('hidden');

  await delay(300);
  const results = analyzePlagiarism(text);
  await delay(200);

  plagLoading.classList.add('hidden');
  if (!results) return;

  renderSelfResults(results);
  plagSelfResults.classList.remove('hidden');
}

function renderSelfResults(results) {
  createGauge($('#plagSelfGauge'), results.overallScore);

  const verdict = $('#plagSelfVerdict');
  if (results.overallScore > 0.5) {
    verdict.textContent = 'Significant Internal Duplication';
    verdict.className = 'score-verdict verdict-ai';
  } else if (results.overallScore > 0.2) {
    verdict.textContent = 'Some Repetition Detected';
    verdict.className = 'score-verdict verdict-mixed';
  } else {
    verdict.textContent = 'Minimal Duplication';
    verdict.className = 'score-verdict verdict-human';
  }

  $('#plagSelfStats').innerHTML = [
    { value: results.stats.sentences, label: 'Sentences' },
    { value: results.stats.words, label: 'Words' },
    { value: results.stats.duplicateFragments, label: 'Duplicates' },
    { value: results.stats.similarPairs, label: 'Similar Pairs' }
  ].map(s => `
    <div class="stat-card">
      <div class="stat-value">${s.value}</div>
      <div class="stat-label">${s.label}</div>
    </div>
  `).join('');

  const matchList = $('#selfMatchList');
  if (results.similarSentences.length > 0) {
    matchList.innerHTML = results.similarSentences.map((m, i) => `
      <div class="match-pair" style="animation-delay: ${i * 0.1}s">
        <div class="match-pair-header">
          <span>Similar Pair #${i + 1}</span>
          <span class="match-similarity">${Math.round(m.similarity * 100)}% similar</span>
        </div>
        <div class="match-text-label">Sentence ${m.sentenceA.index + 1}</div>
        <div class="match-text">${escapeHtml(m.sentenceA.text)}</div>
        <div class="match-text-label">Sentence ${m.sentenceB.index + 1}</div>
        <div class="match-text">${escapeHtml(m.sentenceB.text)}</div>
      </div>
    `).join('');
  } else {
    matchList.innerHTML = '<p style="color: var(--text-muted); padding: 16px;">No significant internal duplication found.</p>';
  }

  lucide.createIcons();
}

// ===== Humanizer =====
async function runHumanizer() {
  const text = humanizerInput.value.trim();
  if (!text) return;

  humanizerResults.classList.add('hidden');
  humanizerLoading.classList.remove('hidden');

  const intensity = document.querySelector('input[name="intensity"]:checked')?.value || 'moderate';
  const imperfections = $('#optImperfections').checked;
  const lengthVariation = $('#optLengthVar').checked;

  await delay(300);
  const result = humanizeText(text, { intensity, imperfections, lengthVariation });
  await delay(200);

  humanizerLoading.classList.add('hidden');
  if (!result) return;

  // Before/after AI scores
  const beforeResult = analyzeText(result.original);
  const afterResult = analyzeText(result.humanized);

  const beforeScore = beforeResult ? beforeResult.overallScore : 0;
  const afterScore = afterResult ? afterResult.overallScore : 0;

  createGauge($('#humBeforeGauge'), beforeScore);
  createGauge($('#humAfterGauge'), afterScore);
  $('#humBeforeScore').textContent = `${Math.round(beforeScore * 100)}% AI`;
  $('#humAfterScore').textContent = `${Math.round(afterScore * 100)}% AI`;

  // Output text
  $('#humanizedOutput').textContent = result.humanized;

  // Diff
  renderDiff($('#diffContainer'), result.original, result.humanized);

  // Change count
  $('#changeCount').textContent = result.changeCount;

  // Changes list
  const changesList = $('#changesList');
  changesList.innerHTML = result.changes.slice(0, 50).map((c, i) => `
    <div class="change-item" style="animation-delay: ${i * 0.03}s">
      <span class="change-type change-type-${c.type}">${c.type.replace('-', ' ')}</span>
      <div class="change-detail">
        <span class="change-from">"${escapeHtml(truncate(c.original, 60))}"</span>
        <span class="change-arrow">→</span>
        <span class="change-to">"${escapeHtml(truncate(c.replacement, 60))}"</span>
      </div>
    </div>
  `).join('');

  humanizerResults.classList.remove('hidden');
  lucide.createIcons();
}

// ===== Utility =====
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function truncate(str, len) {
  return str.length > len ? str.substring(0, len - 3) + '...' : str;
}

// ===== Event Listeners =====
function initEvents() {
  // Theme
  themeToggle.addEventListener('click', toggleTheme);

  // Detector
  detectorAnalyze.addEventListener('click', runDetector);
  detectorClear.addEventListener('click', () => {
    detectorInput.value = '';
    detectorResults.classList.add('hidden');
    destroyCharts();
    updateWordCount(detectorInput, $('#detectorWords'), $('#detectorChars'), $('#detectorSentences'));
  });
  detectorSample.addEventListener('click', () => {
    detectorInput.value = SAMPLE_AI;
    updateWordCount(detectorInput, $('#detectorWords'), $('#detectorChars'), $('#detectorSentences'));
  });
  $('#exportPDF').addEventListener('click', () => {
    if (lastDetectorResults) exportReport(lastDetectorResults);
  });

  // Plagiarism
  plagCompareBtn.addEventListener('click', runCompare);
  plagSelfBtn.addEventListener('click', runSelfAnalysis);
  plagSample.addEventListener('click', () => {
    plagInputA.value = SAMPLE_PLAG_A;
    plagInputB.value = SAMPLE_PLAG_B;
    plagInputA.dispatchEvent(new Event('input'));
    plagInputB.dispatchEvent(new Event('input'));
  });
  plagSwap.addEventListener('click', () => {
    const tmp = plagInputA.value;
    plagInputA.value = plagInputB.value;
    plagInputB.value = tmp;
    plagInputA.dispatchEvent(new Event('input'));
    plagInputB.dispatchEvent(new Event('input'));
  });

  // Humanizer
  humanizerRun.addEventListener('click', runHumanizer);
  humanizerClear.addEventListener('click', () => {
    humanizerInput.value = '';
    humanizerResults.classList.add('hidden');
    $('#humanizerWords').textContent = '0 words';
  });
  humanizerSample.addEventListener('click', () => {
    humanizerInput.value = SAMPLE_AI;
    humanizerInput.dispatchEvent(new Event('input'));
  });
  copyHumanized.addEventListener('click', () => {
    const text = $('#humanizedOutput').textContent;
    navigator.clipboard.writeText(text).then(() => {
      copyHumanized.innerHTML = '<i data-lucide="check"></i> Copied!';
      lucide.createIcons();
      setTimeout(() => {
        copyHumanized.innerHTML = '<i data-lucide="copy"></i> Copy';
        lucide.createIcons();
      }, 2000);
    });
  });

  // Keyboard shortcut: Ctrl+Enter to analyze
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'Enter') {
      const activeTab = $('.tab-btn.active')?.dataset.tab;
      if (activeTab === 'detector') runDetector();
      else if (activeTab === 'plagiarism') {
        if (!$('#plagSelf').classList.contains('hidden')) runSelfAnalysis();
        else runCompare();
      }
      else if (activeTab === 'humanizer') runHumanizer();
    }
  });
}

// ===== Init =====
function init() {
  initTheme();
  initTabs();
  initTextStats();
  initPlagModes();
  initEvents();
  lucide.createIcons();
}

document.addEventListener('DOMContentLoaded', init);
