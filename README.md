# MoonVault – Cloudflare Workers Deployment Guide

## Folder structure

```
moonvault-worker/
├── worker.js        ← All backend logic (replaces Flask app.py)
├── wrangler.toml    ← Cloudflare Workers config
├── package.json
└── public/
    └── index.html   ← Frontend (served as static asset)
```

---

## Step-by-step deploy karo

### 1. Prerequisites install karo

```bash
npm install -g wrangler
```

### 2. Cloudflare account se login karo

```bash
wrangler login
```
Browser mein Cloudflare ka page khulega — allow karo.

### 3. Project folder mein jao

```bash
cd moonvault-worker
npm install
```

### 4. TMDB API Key set karo (secret ke roop mein — safe hai)

```bash
wrangler secret put TMDB_API_KEY
# Enter your key when prompted
```

> TMDB key nahi hai?  
> Free mein banao: https://www.themoviedb.org/settings/api

### 5. Deploy!

```bash
npm run deploy
```

Wrangler ek URL dega jaise:
```
https://moonvault.YOUR-SUBDOMAIN.workers.dev
```

---

## Local testing (optional)

```bash
# .dev.vars file banao (gitignore mein already hai)
echo 'TMDB_API_KEY=your_key_here' > .dev.vars

npm run dev
# Opens at http://localhost:8787
```

---

## Troubleshooting

| Error | Fix |
|-------|-----|
| `Missing script: deploy` | `npm install` pehle chalao |
| `Authentication error` | `wrangler login` dobara chalao |
| TMDB data nahi aa raha | `wrangler secret put TMDB_API_KEY` se key set karo |
| BollyFlix results empty | Site temporarily down ho sakti hai — automatic fallback domains try hote hain |

---

## Notes

- **No Python needed** — pure JavaScript Worker hai
- **Free plan** mein 100,000 requests/day free milte hain
- `wrangler.toml` mein `TMDB_API_KEY` hardcode **mat karo** — `wrangler secret` use karo
