/**
 * MoonVault – Cloudflare Worker
 * Replaces the Python/Flask backend entirely.
 * Routes: GET /search  GET /tmdb  GET /tmdb-details  GET /details  GET /
 */

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.5',
  Referer: 'https://www.google.com/',
};

const BF_DOMAINS = [
  'https://new.bollyflix.gd',
  'https://bollyflix.show',
  'https://www.bollyflix.boats',
  'https://bollyflix.ind.in',
];

const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMG  = 'https://image.tmdb.org/t/p';

// ─── helpers ────────────────────────────────────────────────────────────────

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

function html(body, status = 200) {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/html;charset=utf-8' },
  });
}

async function fetchText(url, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: HEADERS, signal: controller.signal, redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

async function getWorkingDomain() {
  for (const domain of BF_DOMAINS) {
    try {
      const res = await fetch(domain + '/', {
        headers: HEADERS,
        redirect: 'follow',
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) return domain;
    } catch (_) { /* try next */ }
  }
  return BF_DOMAINS[0];
}

function qualityLabel(text) {
  const t = String(text).toLowerCase();
  if (t.includes('2160p') || t.includes('4k')) return '2160p 4K';
  if (t.includes('1080p')) return '1080p';
  if (t.includes('720p'))  return '720p';
  if (t.includes('480p'))  return '480p';
  return 'N/A';
}

// ─── Cloudflare Workers has no built-in DOM parser.
//     We use lightweight regex-based parsing instead of BeautifulSoup.

function extractArticles(htmlText) {
  const results = [];
  // Match <article ...>...</article> blocks
  const articleRe = /<article[\s\S]*?<\/article>/gi;
  let artMatch;
  while ((artMatch = articleRe.exec(htmlText)) !== null) {
    const art = artMatch[0];

    // Get first link from h2/h3 or .entry-title
    const linkRe = /<(?:h[23]|[^>]+class="[^"]*entry-title[^"]*")[^>]*>\s*<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i;
    const altLinkRe = /<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i;
    let href = '', title = '';
    const lm = linkRe.exec(art) || altLinkRe.exec(art);
    if (lm) {
      href  = lm[1];
      title = lm[2].replace(/<[^>]+>/g, '').trim();
    }
    if (!href || !title) continue;

    // Image
    let img = '';
    const imgRe = /<img\s[^>]*>/i;
    const im = imgRe.exec(art);
    if (im) {
      const dSrc = /data-src="([^"]+)"/.exec(im[0]);
      const src  = /\bsrc="([^"]+)"/.exec(im[0]);
      img = (dSrc || src || ['', ''])[1];
    }

    // Meta / date
    let meta = '';
    const metaRe = /<(?:div|span|time)[^>]+class="[^"]*(?:entry-meta|post-meta)[^"]*"[^>]*>([\s\S]*?)<\/(?:div|span|time)>/i;
    const mm = metaRe.exec(art);
    if (mm) meta = mm[1].replace(/<[^>]+>/g, '').trim();

    results.push({ title, href, img, meta, source: 'BollyFlix' });
  }
  return results;
}

function extractDownloads(htmlText) {
  const SKIP = ['how to', 'howto', 'tutorial', 'facebook', 'twitter',
    'instagram', 'telegram', 'whatsapp', 'youtube',
    'category/', '/tag/', '/page/', 'mailto:',
    'privacy', 'contact', 'about', 'dmca'];

  const DL_HOSTS = ['fastdlserver', 'gdflix', 'gofile', 'drive.google',
    'mega.nz', 'mediafire', 'pixeldrain', 'send.cm',
    'uploadhaven', 'filedot', 'buzzheavier', 'driveseed',
    'hubdrive', 'filepress', 'dropbox.com'];

  const QUAL_WORDS = ['480p','720p','1080p','2160p','4k','bluray','webrip','web-dl','hdrip'];

  const results = [];
  const seen    = new Set();
  const linkRe  = /<a\s[^>]*href="([^"#][^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = linkRe.exec(htmlText)) !== null) {
    const href = m[1].trim();
    const raw  = m[2];
    const txt  = raw.replace(/<[^>]+>/g, '').trim();
    const combined = (href + txt).toLowerCase();

    if (!href || href.startsWith('javascript')) continue;
    if (SKIP.some(w => combined.includes(w))) continue;

    const isHost = DL_HOSTS.some(h => href.includes(h));
    const isTextDl = txt.toLowerCase().includes('download') &&
                     txt.length > 8 &&
                     QUAL_WORDS.some(q => txt.toLowerCase().includes(q));

    if (isHost || isTextDl) {
      if (seen.has(href)) continue;
      seen.add(href);
      results.push({
        name:    txt || 'Download',
        url:     href,
        quality: qualityLabel(txt + href),
        size:    'N/A',
      });
    }
  }
  return results;
}

function extractTitle(htmlText) {
  for (const re of [
    /<h1[^>]+class="[^"]*entry-title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i,
    /<h1[^>]+class="[^"]*post-title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i,
    /<h1[^>]*>([\s\S]*?)<\/h1>/i,
  ]) {
    const m = re.exec(htmlText);
    if (m) return m[1].replace(/<[^>]+>/g, '').trim();
  }
  return '';
}

// ─── TMDB helpers ────────────────────────────────────────────────────────────

async function tmdbSearch(query, apiKey) {
  if (!apiKey || !query) return null;
  try {
    const url = `${TMDB_BASE}/search/movie?api_key=${encodeURIComponent(apiKey)}&query=${encodeURIComponent(query)}&language=en-US`;
    const res  = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const data = await res.json();
    const m    = (data.results || [])[0];
    if (!m) return null;
    return {
      id:       m.id,
      title:    m.title || '',
      overview: m.overview || '',
      poster:   m.poster_path ? `${TMDB_IMG}/w500${m.poster_path}` : '',
      year:     (m.release_date || '').split('-')[0],
      rating:   m.vote_average || 0,
      genres:   [],
    };
  } catch (_) { return null; }
}

async function tmdbDetails(mid, apiKey) {
  if (!apiKey || !mid) return null;
  try {
    const url = `${TMDB_BASE}/movie/${mid}?api_key=${encodeURIComponent(apiKey)}&append_to_response=credits`;
    const res  = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const d = await res.json();
    return {
      overview: d.overview || '',
      rating:   d.vote_average || 0,
      genres:   (d.genres || []).map(g => g.name),
      cast:     ((d.credits || {}).cast || []).slice(0, 5).map(c => c.name),
    };
  } catch (_) { return null; }
}

// ─── Route handlers ──────────────────────────────────────────────────────────

async function handleSearch(searchParams, env) {
  const q = (searchParams.get('q') || '').trim();
  if (!q) return json([]);

  try {
    const base    = await getWorkingDomain();
    const pageUrl = `${base}/?s=${encodeURIComponent(q)}`;
    const pageHtml = await fetchText(pageUrl);
    const results  = extractArticles(pageHtml).slice(0, 30);
    return json(results);
  } catch (e) {
    console.error('[search error]', e);
    return json([]);
  }
}

async function handleTmdb(searchParams, env) {
  const q      = (searchParams.get('q') || '').trim();
  const apiKey = env.TMDB_API_KEY || '';
  if (!q || !apiKey) return json(null);
  return json(await tmdbSearch(q, apiKey));
}

async function handleTmdbDetails(searchParams, env) {
  const mid    = searchParams.get('id');
  const apiKey = env.TMDB_API_KEY || '';
  if (!mid || !apiKey) return json(null);
  return json(await tmdbDetails(parseInt(mid, 10), apiKey));
}

async function handleDetails(searchParams) {
  const url = (searchParams.get('url') || '').trim();
  if (!url) return json({ error: 'missing url' }, 400);

  try {
    const pageHtml = await fetchText(url);
    const title     = extractTitle(pageHtml);
    const downloads = extractDownloads(pageHtml);
    return json({ title, downloads });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
}

async function handleIndex(env) {
  // Read index.html from KV or static asset
  // When deployed with `wrangler pages` or Workers Sites, assets are in __STATIC_CONTENT
  try {
    // Workers Sites binding
    const asset = await env.__STATIC_CONTENT.get('index.html', 'text');
    if (asset) return html(asset);
  } catch (_) {}

  // Fallback: serve inline (only used if KV binding unavailable)
  return html('<p>index.html not found. Deploy with wrangler.</p>', 500);
}

// ─── Entry point ─────────────────────────────────────────────────────────────

export default {
  async fetch(request, env, ctx) {
    const url      = new URL(request.url);
    const { pathname, searchParams } = url;

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
        },
      });
    }

    if (pathname === '/search')       return handleSearch(searchParams, env);
    if (pathname === '/tmdb')         return handleTmdb(searchParams, env);
    if (pathname === '/tmdb-details') return handleTmdbDetails(searchParams, env);
    if (pathname === '/details')      return handleDetails(searchParams);
    if (pathname === '/' || pathname === '/index.html') return handleIndex(env);

    return new Response('Not Found', { status: 404 });
  },
};
