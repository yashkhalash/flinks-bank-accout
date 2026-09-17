# Flinks Bank Connect — Project Documentation

Demo app that embeds **Flinks Connect**, lets a user log into a bank (sandbox: FlinksCapital), then fetches account details from the Flinks Banking Services API.

This is a demo only: no user auth, no database, no persistence. Do not ship it as-is to production.

---

## What this app does

1. Opens the Flinks Connect widget inside an iframe.
2. The user consents, picks a bank, logs in, completes MFA if asked, and selects accounts.
3. Flinks posts a `loginId` back to the page via `window.postMessage`.
4. The Node server exchanges that `loginId` for a Flinks `RequestId`, then calls **GetAccountsDetail**.
5. The UI shows balances, holder, account numbers, and the raw JSON response.

Sandbox only lists the dummy bank **FlinksCapital**. Real banks (RBC, TD, Chase, etc.) appear only on a production Flinks instance.

---

## Tech stack

| Layer | Technology | Role |
|---|---|---|
| Runtime | Node.js (CommonJS) | Server and Vercel function |
| HTTP server | Express `^4.19` | Routes, static files, JSON API |
| HTTP client | Axios `^1.7` | Calls Flinks Banking Services |
| CORS | `cors` `^2.8` | Allows the frontend origin to call `/api/*` |
| Config | `dotenv` `^16.4` | Loads `.env` locally |
| Frontend | Vanilla HTML / CSS / JS | No React, no bundler |
| Bank widget | Flinks Connect iframe | Hosted by Flinks (`toolbox-iframe.private.fin.ag`) |
| Bank data API | Flinks Banking Services v3 | Authorize + GetAccountsDetail |
| Hosting | Vercel serverless | `api/index.js` wraps the Express app |
| Local watch | `node --watch` | `npm run dev` restarts on file change |
| Dev tooling | Playwright (devDependency) | Installed; not used by the demo runtime |

**Not in this project:** database, auth, React/Vue, TypeScript, tests, background workers.

---

## Repository layout

```
Flinks_Bank_connect/
├── api/
│   ├── index.js          # Vercel entry — re-exports the Express app
│   └── server-app.js     # All routes + Flinks API logic
├── public/
│   ├── index.html        # UI (served at /)
│   └── app.js            # Connect iframe + postMessage + account fetch
├── index.html            # Duplicate of public/index.html (not served locally)
├── app.js                # Duplicate of public/app.js (not served locally)
├── vercel.json           # Rewrites /api/* to the serverless function
├── package.json
├── .env.example          # Template — copy to .env
├── .env                  # Local secrets (gitignored)
├── env.txt               # Local notes/secrets (gitignored)
└── PROJECT.md            # This file
```

Local `npm start` serves **`public/`**, not the root `index.html` / `app.js`. Keep `public/` as the source of truth.

---

## How it works (end to end)

```
Browser                         Your server                      Flinks
──────                          ───────────                      ──────
GET /
  ← public/index.html + app.js

GET /api/config
  ← customerId, iframe URL, demo flag

GET /api/authorize-token
  ─────────────────────────────────────────► GenerateAuthorizeToken
  ← { token }

Set iframe src =
  toolbox-iframe?authorizeToken=...&demo=true&jsRedirect=true...

User walks Connect:
  Consent → Institution → Login → MFA → Account select → Confirmation

postMessage { step: "REDIRECT", loginId, accountId, institution }
  (only accepted from *.private.fin.ag or *.flinks.com)

POST /api/accounts { loginId, accountIds }
  ─────────────────────────────────────────► Authorize (LoginId, MostRecentCached)
  ← RequestId
  ─────────────────────────────────────────► GetAccountsDetail
  (HTTP 202 → poll GetAccountsDetailAsync every 10s, up to 10 times)
  ← accounts, balances, transactions
  ← JSON + _meta { loginId, requestId }

UI renders account cards + raw JSON
```

### Step tracker (UI)

`public/app.js` maps Flinks iframe events to the six-step bar:

| UI step | Flinks `step` events |
|---|---|
| Consent | `APP_MOUNTED`, `COMPONENT_LOAD_CONSENT`, `COMPONENT_ACCEPT_CONSENT`, `COMPONENT_ACCEPT_PROVIDER_CONSENT` |
| Institution Selection | `COMPONENT_LOAD_INSTITUTION_SELECTOR`, `INSTITUTION_SELECTED` |
| Account Authentication | `COMPONENT_LOAD_CREDENTIAL`, `SUBMIT_CREDENTIAL`, … |
| Account Validation — MFA | `COMPONENT_LOAD_MFA`, `SUBMIT_MFA`, `INVALID_SECURITY_RESPONSE`, … |
| Account Selection | `COMPONENT_LOAD_ACCOUNT_SELECTION`, `ACCOUNT_SELECTED` |
| Confirmation | `REDIRECT` |

Other events:

- `COMPONENT_CLOSE_SESSION` — widget closed; user can click Connect again.
- `TOKEN_INVALID` — authorize token expired; frontend reloads Connect.
- `INVALID_USERNAME` / `INVALID_PASSWORD` / `INVALID_LOGIN` — stay on the auth step.

The frontend only trusts `postMessage` origins matching `*.private.fin.ag` or `*.flinks.com`.

---

## Flinks API (server side)

All Banking Services URLs look like:

```
{FLINKS_API_BASE_URL}/{FLINKS_CUSTOMER_ID}/BankingServices/{Endpoint}
```

Sandbox default: `https://toolbox-api.private.fin.ag/v3/<customer-id>/BankingServices/...`

### 1. GenerateAuthorizeToken

- **When:** every time the iframe loads, and before Authorize / GetAccountsDetail.
- **Header:** `flinks-auth-key: FLINKS_AUTH_KEY` (static account API key).
- **Returns:** `{ Token }` — short-lived session key.

That token is:

- passed into the iframe as `authorizeToken` query param, and
- sent as `flinks-auth-key` on later Banking Services calls (replacing the static key).

### 2. Authorize

Used in two ways:

| Mode | Body | Purpose |
|---|---|---|
| Cached (main path) | `{ LoginId, MostRecentCached: true }` | After Connect succeeds — get a `RequestId` |
| Direct login (debug) | `{ Institution, Username, Password, Save }` | Bypass iframe; hits `POST /api/authorize` |

Direct login also answers FlinksCapital Canada-region security questions:

| Question pattern | Answer |
|---|---|
| city … born | Montreal |
| best country | Canada |
| shape … like | Triangle |
| `n + n` math | 4 |

### 3. GetAccountsDetail

- **Headers:** `flinks-auth-key` (fresh token) + `x-api-key: FLINKS_API_KEY`
- **Body:** `{ RequestId }` and optional `AccountsFilter` from the iframe `accountId`s
- **202 Accepted:** Flinks is still aggregating. Server sleeps 10 seconds and retries **GetAccountsDetailAsync** up to 10 times (~100 seconds). That is why the UI says this can take up to a minute.

---

## HTTP API (this app)

| Method | Path | What it does |
|---|---|---|
| `GET` | `/` | Serves `public/index.html` |
| `GET` | `/api/config` | Non-secret iframe config (`customerId`, `iframeBaseUrl`, `demo`, `appUrl`) |
| `GET` | `/api/authorize-token` | Returns `{ token }` from GenerateAuthorizeToken |
| `POST` | `/api/authorize` | Optional direct sandbox login (debug). Default: FlinksCapital / Greatday / Everyday |
| `POST` | `/api/accounts` | Body: `{ loginId }` or `{ requestId }`, optional `accountIds`. Returns GetAccountsDetail JSON plus `_meta` |

There is **no** auth on these routes. Anyone who can reach the server can generate tokens and pull data if they have a `loginId`.

---

## Required credentials from Flinks

Get these from the [Flinks Dashboard](https://dashboard.flinks.com) → **Settings → API** and **Connect → Embedded → Generate code**. Do not commit real values.

### Must have (API fails without these)

| Flinks credential | Env var | Used for |
|---|---|---|
| **Customer ID (API)** | `FLINKS_CUSTOMER_ID` | Path on every Banking Services call: `{API_BASE}/{id}/BankingServices/...` |
| **Auth Key** | `FLINKS_AUTH_KEY` | Header `flinks-auth-key` on **GenerateAuthorizeToken** |
| **API Key** | `FLINKS_API_KEY` | Header `x-api-key` on **GetAccountsDetail** |
| **API base URL** | `FLINKS_API_BASE_URL` | Sandbox: `https://toolbox-api.private.fin.ag/v3` |

**Two keys, two jobs:** `FLINKS_AUTH_KEY` opens a session (GenerateAuthorizeToken). `FLINKS_API_KEY` is for data (GetAccountsDetail). They are not interchangeable.

### Usually needed (Connect iframe)

| Flinks credential | Env var | Used for |
|---|---|---|
| **Dashboard / instance Customer ID** | `FLINKS_DASHBOARD_CUSTOMER_ID` | Iframe GUID if it is **different** from the API Customer ID |
| **Connect iframe URL** | `FLINKS_IFRAME_BASE_URL` | Sandbox default: `https://toolbox-iframe.private.fin.ag/v2/` |
| **Environment** | `FLINKS_ENV` | `sandbox` or `production` (`sandbox` adds `demo=true` on the iframe) |

**Two customer IDs is normal** on Toolbox: the GUID in the dashboard URL vs the GUID used for API calls. This app uses both. If GenerateAuthorizeToken or Authorize fails, confirm which GUID belongs to API vs dashboard.

### Must set in the Flinks dashboard (not an env var)

- **Allowed domains** — add `http://localhost:3000` and your Vercel URL. Without this, the iframe / `postMessage` flow is blocked.

### Sandbox bank login (test user, not from Settings)

| Field | Value |
|---|---|
| Institution | **FlinksCapital** (only bank listed in sandbox) |
| Username | `Greatday` |
| Password | `Everyday` |

Canada-region MFA / security-question answers:

| Question pattern | Answer |
|---|---|
| city … born | Montreal |
| best country | Canada |
| shape … like | Triangle |
| `n + n` math | 4 |

---

## Environment variables

Copy `.env.example` to `.env` for local runs. On Vercel, set the same names in Project Settings → Environment Variables.

| Variable | Required | Purpose |
|---|---|---|
| `FLINKS_CUSTOMER_ID` | Yes (API) | Customer GUID used in Banking Services URL path |
| `FLINKS_DASHBOARD_CUSTOMER_ID` | Optional | Dashboard/iframe customer GUID if it differs from the API one. `/api/config` prefers this |
| `FLINKS_API_BASE_URL` | Yes | e.g. `https://toolbox-api.private.fin.ag/v3` |
| `FLINKS_AUTH_KEY` | Yes | Static key for GenerateAuthorizeToken (`flinks-auth-key`) |
| `FLINKS_API_KEY` | Yes | `x-api-key` on GetAccountsDetail |
| `FLINKS_ENV` | Recommended | `sandbox` or `production`. Sandbox adds `demo=true` on the iframe |
| `FLINKS_IFRAME_BASE_URL` | Optional | Default: `https://toolbox-iframe.private.fin.ag/v2/` |
| `FLINKS_SUBDOMAIN` | Optional | Documented for your instance; not read by the current server code |
| `APP_URL` | Recommended | App origin, e.g. `http://localhost:3000`. Used for CORS |
| `PORT` | Optional | Local listen port, default `3000` |
| `VERCEL_URL` | Auto on Vercel | Added to CORS allowed origins |

**Never commit** `.env` or `env.txt`. They are gitignored.

---

## Iframe query parameters

Built in `public/app.js` → `loadConnect()`:

| Param | Value | Why |
|---|---|---|
| `authorizeToken` | from `/api/authorize-token` | Authenticates the widget session |
| `innerRedirect` | `true` | Keep completion inside the iframe |
| `jsRedirect` | `true` | Emit `REDIRECT` via postMessage instead of navigating away |
| `closeEnable` | `true` | User can close the widget |
| `accountSelectorEnable` | `true` | Account selection step |
| `showAllOperationsAccounts` | `true` | Include all operable accounts |
| `demo` | `true` if `FLINKS_ENV=sandbox` | Toolbox dummy bank only |

---

## Run locally

Requirements: Node.js 18+ (or any current LTS).

```bash
cp .env.example .env
# Fill FLINKS_CUSTOMER_ID, FLINKS_API_BASE_URL, FLINKS_AUTH_KEY, FLINKS_API_KEY

npm install
npm start          # http://localhost:3000
# or
npm run dev        # restart on file change
```

Whitelist `http://localhost:3000` in Flinks Dashboard → Configuration → Allowed domains so the iframe / postMessage flow is allowed.

### Sandbox login

Use the FlinksCapital test user in [Required credentials from Flinks](#sandbox-bank-login-test-user-not-from-settings): username `Greatday`, password `Everyday`. If MFA appears, use the Canada-region answers from that section.

---

## Deploy on Vercel

`vercel.json`:

- Rewrites `/api/(.*)` → `/api` so every API path hits the serverless function.
- Function `api/index.js` includes `public/**` and `maxDuration: 60` (needed because GetAccountsDetail can poll for a long time).

`api/index.js` is:

```js
module.exports = require('./server-app');
```

`server-app.js` only calls `app.listen` when run as `node api/server-app.js`. On Vercel it exports the Express app and the platform invokes it.

Set all Flinks env vars in the Vercel project. Add the Vercel URL to Flinks allowed domains.

CORS already allows:

- `APP_URL`
- `https://$VERCEL_URL`
- any `*.vercel.app` origin
- a hardcoded preview host in `server-app.js`

---

## CORS

Allowed if:

- there is no `Origin` header (same-origin / curl), or
- origin is in `allowedOrigins` (`APP_URL`, Vercel URL, known preview URL), or
- origin hostname ends with `.vercel.app`

---

## How to use the UI

1. Open the app. Connect loads automatically (and again when you click **Connect to Flinks**).
2. Wait for the spinner to clear and the Flinks widget to appear.
3. Accept consent (if shown).
4. Choose **FlinksCapital**.
5. Log in with `Greatday` / `Everyday`.
6. Complete MFA if prompted.
7. Select accounts → Confirmation.
8. Account cards appear below. Expand **Raw API response** for the full JSON.

Fetching details can take up to ~100 seconds if Flinks returns HTTP 202.

---

## Troubleshooting

| Symptom | Likely cause | What to do |
|---|---|---|
| “Failed to get authorize token” | Missing/wrong `FLINKS_AUTH_KEY` or `FLINKS_CUSTOMER_ID` | Check Vercel/local env. Token endpoint needs `flinks-auth-key` |
| “You must provide a valid auth key” | `FLINKS_AUTH_KEY` not set or not the GenerateAuthorizeToken key | Dashboard → Settings → API |
| Iframe never loads | Wrong `FLINKS_IFRAME_BASE_URL` or token failed | Check `/api/config` and `/api/authorize-token` in the browser |
| No banks except FlinksCapital | Expected in sandbox (`demo=true`) | Use a production Flinks instance for real banks |
| REDIRECT but no loginId | Widget config / `jsRedirect` | Keep the widget open; inspect raw event in the status/pre area |
| GetAccountsDetail 401/403 | Wrong `FLINKS_API_KEY` or customer id on the API path | Confirm Toolbox vs production keys |
| Request hangs ~1–2 min then fails | Aggregation still 202 after 10 polls | Retry; check Flinks dashboard logs |
| postMessage ignored | Origin not `flinks.com` / `private.fin.ag` | Do not wrap Connect in an unexpected domain |
| Connect blocked / blank iframe | App URL not in Flinks allowed domains | Add localhost or Vercel URL in the dashboard |
| UI looks stale after editing HTML | You edited root `index.html` not `public/index.html` | Express serves `public/` |

---

## Security notes (demo limitations)

- API routes are public.
- Server logs and the UI show raw account payloads.
- Secrets live in env vars; `.env` / `env.txt` must stay out of git.
- Production would need: authenticated users, stored `loginId`s encrypted, rate limits, no client-visible PII dumps, production Flinks URLs/keys, and IP allowlisting per your Flinks contract.

---

## Official Flinks docs

- [Flinks Connect — standard integration](https://docs.flinks.com/guides/connect/standard-integration)
- [Flinks Connect test users](https://docs.flinks.com/guides/connect/flinks-connect/test-users.md)
- Dashboard (instance-specific): `https://dashboard.flinks.com`

---

## Scripts

```json
"start": "node api/server-app.js"
"dev":   "node --watch api/server-app.js"
```

Main module: `api/server-app.js`.
