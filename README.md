# Flinks Bank Connect Demo

Minimal Node/Express app demonstrating the Flinks Connect flow: embed the Connect
iframe, capture the `loginId` it returns after a user authenticates with their bank,
then call the Flinks API server-side to retrieve account details.

## Setup

1. `cp .env.example .env` and fill in your values (see below).
2. `npm install`
3. `npm start`
4. Open http://localhost:3000

## Required credentials (.env)

These come from your Flinks dashboard: https://dashboard.flinks.com/en/9a67f484-5300-4d20-a1fa-ea9a4e374318/home

| Variable | Where to find it |
|---|---|
| `FLINKS_CUSTOMER_ID` | The GUID in your dashboard URL (e.g. `9a67f484-5300-4d20-a1fa-ea9a4e374318`), pre-filled in `.env.example`. |
| `FLINKS_SUBDOMAIN` | Dashboard → Configuration/API settings — the subdomain assigned to your instance for API calls. |
| `FLINKS_ENV` | `sandbox` for testing with fake institutions, `production` for real bank connections. |
| `FLINKS_API_BASE_URL` | Sandbox: `https://toolbox-api.private.fin.ag/v3`. Production: `https://<your-subdomain>-api.private.fin.ag/v3` (confirm exact value in the dashboard, it can vary per account). |
| `PORT` | Local server port, defaults to 3000. |

No API key/secret is needed for the Connect iframe itself in sandbox mode — the
`customerId` is enough. Production deployments may require additional
authentication/IP allowlisting per your Flinks agreement; check the dashboard's
API documentation section for your account's specifics.

## How it works

1. `public/index.html` loads the Flinks Connect iframe using your `customerId`.
2. The user searches for and logs into a bank (in sandbox mode, use Flinks' test
   institutions/credentials, e.g. institution "Flinks Capital" with any username/password).
3. Flinks posts a `message` event to the parent window containing a `loginId`.
4. The frontend sends that `loginId` to `POST /api/accounts` on our server.
5. The server calls Flinks' `GetAccountsDetail` API and returns account/balance data.

## Notes

- This is a demo only: no persistence, no auth on the Express routes, and it logs
  raw account data. Do not use as-is in production.
- Double-check the exact sandbox/demo institution credentials and API base URL
  in your Flinks dashboard, as these can differ slightly per account setup.
# flinks-bank-accout
