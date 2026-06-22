const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export async function fetchHtml(url, { timeout = 15000, retries = 1 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeout);
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': UA,
          'Accept-Language': 'ca,es;q=0.9,en;q=0.8',
          Accept: 'text/html,application/xhtml+xml'
        },
        signal: controller.signal
      });
      clearTimeout(t);
      if (!res.ok) throw new Error(`HTTP ${res.status} a ${url}`);
      return await res.text();
    } catch (err) {
      clearTimeout(t);
      if (attempt === retries) throw err;
    }
  }
  throw new Error('fetch failed');
}

// Petit limitador de concurrència per no saturar fcf.cat ni la funció serverless
export function createLimiter(concurrency) {
  let active = 0;
  const queue = [];

  const next = () => {
    if (active >= concurrency || queue.length === 0) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    fn()
      .then(resolve, reject)
      .finally(() => {
        active--;
        next();
      });
  };

  return function limit(fn) {
    return new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      next();
    });
  };
}

export function abs(href) {
  if (!href) return null;
  try {
    return new URL(href, 'https://www.fcf.cat').href;
  } catch {
    return null;
  }
}

export function sampleArray(arr, n) {
  if (arr.length <= n) return arr;
  if (n <= 1) return [arr[0]];
  const idxs = new Set();
  for (let i = 0; i < n; i++) {
    idxs.add(Math.round((i * (arr.length - 1)) / (n - 1)));
  }
  return Array.from(idxs)
    .sort((a, b) => a - b)
    .map((i) => arr[i]);
}

export function normName(s) {
  return (s || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
