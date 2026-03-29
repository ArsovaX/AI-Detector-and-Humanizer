import express from 'express';
import cors from 'cors';
import { load } from 'cheerio';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(__dirname));

function splitIntoSentences(text) {
  const raw = text.match(/[^.!?]+[.!?]+/g) || [text];
  return raw
    .map(s => s.trim())
    .filter(s => s.split(/\s+/).length >= 6);
}

function pickKeySentences(sentences, max = 6) {
  const scored = sentences.map(s => ({
    text: s,
    score: s.split(/\s+/).length
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, max).map(s => s.text);
}

async function searchGoogle(query) {
  const apiKey = process.env.GOOGLE_API_KEY;
  const cx = process.env.GOOGLE_CX;

  if (!apiKey || !cx || apiKey === 'your_google_api_key_here') {
    return null;
  }

  const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent('"' + query + '"')}&num=5`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.items) return [];
    return data.items.map(item => ({
      title: item.title,
      url: item.link,
      snippet: item.snippet || ''
    }));
  } catch {
    return null;
  }
}

async function searchDuckDuckGo(query) {
  const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent('"' + query + '"')}`;

  try {
    const res = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!res.ok) return [];

    const html = await res.text();
    const $ = load(html);
    const results = [];

    $('.result').each((i, el) => {
      if (i >= 5) return false;
      const title = $(el).find('.result__title a').text().trim();
      const url = $(el).find('.result__url').text().trim();
      const snippet = $(el).find('.result__snippet').text().trim();
      if (title && url) {
        results.push({
          title,
          url: url.startsWith('http') ? url : 'https://' + url,
          snippet
        });
      }
    });

    return results;
  } catch {
    return [];
  }
}

async function searchSentence(sentence) {
  let results = await searchGoogle(sentence);

  if (results === null) {
    results = await searchDuckDuckGo(sentence);
  }

  return results || [];
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

app.post('/api/check-plagiarism', async (req, res) => {
  try {
    const { text } = req.body;

    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: 'No text provided' });
    }

    const allSentences = splitIntoSentences(text);
    const keySentences = pickKeySentences(allSentences);

    if (keySentences.length === 0) {
      return res.json({
        originalityScore: 1,
        sentencesChecked: 0,
        matches: [],
        sources: []
      });
    }

    const matches = [];
    const sourceMap = new Map();

    for (let i = 0; i < keySentences.length; i++) {
      const sentence = keySentences[i];

      if (i > 0) await delay(800);

      const results = await searchSentence(sentence);

      if (results.length > 0) {
        matches.push({
          sentence,
          results: results.slice(0, 3)
        });

        for (const r of results) {
          const domain = new URL(r.url).hostname.replace('www.', '');
          if (!sourceMap.has(domain)) {
            sourceMap.set(domain, { url: r.url, title: r.title, hits: 0 });
          }
          sourceMap.get(domain).hits++;
        }
      }
    }

    const matchedCount = matches.length;
    const totalChecked = keySentences.length;
    const plagiarismRatio = totalChecked > 0 ? matchedCount / totalChecked : 0;
    const originalityScore = Math.round((1 - plagiarismRatio) * 100);

    const sources = [...sourceMap.values()]
      .sort((a, b) => b.hits - a.hits)
      .slice(0, 10);

    res.json({
      originalityScore,
      sentencesChecked: totalChecked,
      sentencesMatched: matchedCount,
      matches,
      sources
    });
  } catch (err) {
    console.error('Plagiarism check error:', err.message);
    res.status(500).json({ error: 'Search failed. Try again later.' });
  }
});

app.get('/api/status', (req, res) => {
  const hasGoogleKey = process.env.GOOGLE_API_KEY && process.env.GOOGLE_API_KEY !== 'your_google_api_key_here';
  res.json({
    online: true,
    searchEngine: hasGoogleKey ? 'google' : 'duckduckgo'
  });
});

app.listen(PORT, () => {
  const hasGoogleKey = process.env.GOOGLE_API_KEY && process.env.GOOGLE_API_KEY !== 'your_google_api_key_here';
  console.log(`ArsavoX server running on http://localhost:${PORT}`);
  console.log(`Search engine: ${hasGoogleKey ? 'Google Custom Search' : 'DuckDuckGo (fallback)'}`);
  if (!hasGoogleKey) {
    console.log('Tip: Add GOOGLE_API_KEY and GOOGLE_CX to .env for better results (100 free queries/day)');
  }
});
