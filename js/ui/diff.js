// diff.js — Word-level diff rendering

export function renderDiff(container, original, modified) {
  const wordsA = original.split(/(\s+)/);
  const wordsB = modified.split(/(\s+)/);

  // Compute LCS for word-level diff
  const lcs = computeLCS(
    wordsA.filter(w => w.trim()),
    wordsB.filter(w => w.trim())
  );

  const diff = buildDiff(
    wordsA.filter(w => w.trim()),
    wordsB.filter(w => w.trim()),
    lcs
  );

  container.innerHTML = '';

  for (const part of diff) {
    const span = document.createElement('span');

    if (part.type === 'equal') {
      span.textContent = part.value + ' ';
    } else if (part.type === 'delete') {
      span.className = 'diff-del';
      span.textContent = part.value + ' ';
    } else if (part.type === 'insert') {
      span.className = 'diff-ins';
      span.textContent = part.value + ' ';
    }

    container.appendChild(span);
  }
}

function computeLCS(a, b) {
  const m = a.length;
  const n = b.length;

  // For very long texts, use a simplified approach
  if (m * n > 1000000) {
    return simplifiedLCS(a, b);
  }

  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1].toLowerCase() === b[j - 1].toLowerCase()) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack
  const result = [];
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1].toLowerCase() === b[j - 1].toLowerCase()) {
      result.unshift({ aIdx: i - 1, bIdx: j - 1 });
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  return result;
}

function simplifiedLCS(a, b) {
  // For long texts, use a greedy matching approach
  const result = [];
  const bMap = new Map();

  for (let j = 0; j < b.length; j++) {
    const key = b[j].toLowerCase();
    if (!bMap.has(key)) bMap.set(key, []);
    bMap.get(key).push(j);
  }

  let lastJ = -1;
  for (let i = 0; i < a.length; i++) {
    const key = a[i].toLowerCase();
    const positions = bMap.get(key);
    if (positions) {
      for (const j of positions) {
        if (j > lastJ) {
          result.push({ aIdx: i, bIdx: j });
          lastJ = j;
          break;
        }
      }
    }
  }

  return result;
}

function buildDiff(a, b, lcs) {
  const diff = [];
  let ai = 0, bi = 0, li = 0;

  while (ai < a.length || bi < b.length) {
    if (li < lcs.length) {
      const { aIdx, bIdx } = lcs[li];

      // Deletions before match
      while (ai < aIdx) {
        diff.push({ type: 'delete', value: a[ai] });
        ai++;
      }

      // Insertions before match
      while (bi < bIdx) {
        diff.push({ type: 'insert', value: b[bi] });
        bi++;
      }

      // Match
      diff.push({ type: 'equal', value: b[bi] });
      ai++;
      bi++;
      li++;
    } else {
      // Remaining deletions
      while (ai < a.length) {
        diff.push({ type: 'delete', value: a[ai] });
        ai++;
      }
      // Remaining insertions
      while (bi < b.length) {
        diff.push({ type: 'insert', value: b[bi] });
        bi++;
      }
    }
  }

  return diff;
}
