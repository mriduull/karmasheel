# Workforce Matching frontend

React 19 + TypeScript + Vite client for the Workforce Matching Django API.
This is the canonical user interface; the older Django-rendered page at the
backend root is retained only as a local debug/demo interface.

## Local development

```bash
cp .env.example .env
npm ci
npm run dev
```

Open `http://localhost:5173`. The local environment points to Django at
`http://127.0.0.1:8000`.

## Checks

```bash
npm run lint
npm test
npm run build
```

`VITE_API_BASE_URL` is required for a production build and must be an HTTP(S)
origin without a trailing `/api` or other path. The build fails early if the
value is missing or malformed.

## Static deployment

```bash
VITE_API_BASE_URL=https://api.example.com npm run build
```

Publish `dist/` and configure the host to rewrite unknown browser routes to
`/index.html`. The files in `public/_redirects` and `public/_headers` provide a
compatible SPA fallback and baseline headers for providers that recognize
those formats. See [`../docs/DEPLOYMENT.md`](../docs/DEPLOYMENT.md) for the
complete backend/frontend release sequence.
