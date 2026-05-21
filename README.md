# 🚀 GitHub → Cloudflare Workers Deploy Guide
### MoonVault / Flask → Workers Conversion

---

## Repo Structure (jo kaam aai)

```
moonvault-worker/
├── worker.js          ← Poora backend (Flask replace, HTML embedded)
├── wrangler.toml      ← Cloudflare config
├── package.json       ← Wrangler dependency
└── .github/
    └── workflows/
        └── main.yml   ← Auto-deploy on git push
```

---

## wrangler.toml (sahi wala)

```toml
name = "moonvault"
main = "worker.js"
compatibility_date = "2024-01-01"

[vars]
TMDB_API_KEY = "tumhari_tmdb_key"
```

> ❌ `[site]` block bilkul mat daalna — KV Storage issues aate hain

---

## .github/workflows/main.yml (sahi wala)

```yaml
name: Deploy to Cloudflare Workers

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install Wrangler 4
        run: npm install -g wrangler@4

      - name: Deploy
        run: wrangler deploy
        env:
          CLOUDFLARE_EMAIL: ${{ secrets.CF_EMAIL }}
          CLOUDFLARE_API_KEY: ${{ secrets.CF_API_KEY }}
```

> ❌ `cloudflare/wrangler-action` use mat karo — secrets upload pe Authentication error deta hai  
> ❌ `CLOUDFLARE_API_TOKEN` (custom token) use mat karo — permissions issues aate hain  
> ✅ `CF_EMAIL` + `CF_API_KEY` (Global API Key) use karo — guaranteed kaam karta hai

---

## GitHub Secrets (jo set karne padte hain)

| Secret Name | Value | Kahan se milega |
|-------------|-------|----------------|
| `CF_EMAIL` | tumhara cloudflare email | Jo account banaya tha |
| `CF_API_KEY` | Global API Key | Cloudflare → My Profile → API Tokens → Global API Key → View |
| ~~`CLOUDFLARE_API_TOKEN`~~ | ~~Custom token~~ | ~~Kaam nahi karta~~ |

### GitHub mein kaise add karein:
**Repo → Settings → Secrets and variables → Actions → New repository secret**

---

## Cloudflare Global API Key kahan milegi

```
Cloudflare Dashboard
  → My Profile (top right avatar)
  → API Tokens
  → Global API Key
  → View
  → Password confirm karo
  → Key copy karo
```

---

## index.html ka issue aur fix

Flask mein `render_template('index.html')` hota hai.  
Workers mein koi template system nahi — HTML directly `worker.js` mein embed karna padta hai:

```javascript
// worker.js mein HTML directly string mein daalo
const INDEX_HTML = `<!DOCTYPE html>...poora html...</p>`;

async function handleIndex(env) {
  return new Response(INDEX_HTML, {
    headers: { 'Content-Type': 'text/html;charset=utf-8' }
  });
}
```

> ❌ `[site] bucket` wala approach mat use karo — KV namespace maangta hai  
> ✅ HTML directly worker.js mein embed karo

---

## Galtiyan jo hui aur unka fix

| Galti | Symptom | Fix |
|-------|---------|-----|
| `[site]` block in wrangler.toml | Authentication error on KV endpoints | `[site]` block hatao |
| `wrangler-action@v3` with `secrets:` | "Failed to upload secrets" | `secrets:` block hatao ya Global API Key use karo |
| Custom API Token | `Authentication error [code: 10000]` | Global API Key use karo |
| Wrangler 3 | `/workers/services/` auth bug | `wrangler@4` install karo |
| HTML not embedded in worker | "index.html not found" | HTML ko worker.js mein directly embed karo |

---

## Deploy ke baad Security

Yeh keys **rotate/regenerate** karo deploy hone ke baad:

1. **Global API Key** → Cloudflare → My Profile → API Tokens → Global API Key → **Regenerate**
2. **TMDB Key** → themoviedb.org → Settings → API → **Regenerate**
3. **GitHub Secrets** mein naye values update karo

---

## Agle baar naya project deploy karna ho to

1. `worker.js` banao (HTML embed karo agar frontend hai)
2. `wrangler.toml` banao (`[site]` block nahi)
3. `.github/workflows/main.yml` banao (Global API Key wala)
4. GitHub Secrets set karo: `CF_EMAIL` + `CF_API_KEY`
5. `git push` karo — auto deploy! ✅
