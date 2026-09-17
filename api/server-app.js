require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();

const {
  FLINKS_CUSTOMER_ID,
  FLINKS_DASHBOARD_CUSTOMER_ID,
  FLINKS_API_BASE_URL,
  FLINKS_AUTH_KEY,
  FLINKS_API_KEY,
  FLINKS_ENV = 'sandbox',
  FLINKS_IFRAME_BASE_URL,
  FLINKS_SUBDOMAIN,
  FLINKS_DEMO,
  APP_URL = 'http://localhost:3000',
  PORT = 3000,
} = process.env;

// Prefer explicit FLINKS_IFRAME_BASE_URL. Fallback: subdomain → toolbox.
// Dashboard "demo.flinks.com" preview is NOT the Toolbox API iframe — mixing
// a toolbox authorizeToken with demo.flinks.com breaks the widget.
function resolveIframeBaseUrl() {
  const raw = (FLINKS_IFRAME_BASE_URL || '').trim();
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    return raw.endsWith('/') ? raw : `${raw}/`;
  }
  const sub = (FLINKS_SUBDOMAIN || '').trim();
  if (sub && !sub.includes('/') && !sub.includes('.')) {
    return `https://${sub}-iframe.private.fin.ag/v2/`;
  }
  return 'https://toolbox-iframe.private.fin.ag/v2/';
}

const iframeBaseUrl = resolveIframeBaseUrl();
const isToolboxIframe = /toolbox-iframe\.private\.fin\.ag/i.test(iframeBaseUrl);
// Toolbox sandbox needs demo=true to show FlinksCapital.
const useDemoParam =
  FLINKS_DEMO === 'true' ||
  (FLINKS_DEMO !== 'false' && isToolboxIframe);

const allowedOrigins = new Set(
  [
    APP_URL,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
    'https://flinks-bank-accout-ll2s.vercel.app',
  ].filter(Boolean)
);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin) || /\.vercel\.app$/i.test(origin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
  })
);
app.use(express.json());

const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));

// Explicit root → public/index.html (local + any host that hits Express for /)
app.get(['/', '/index.html'], (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// Non-secret config the frontend needs to build the Connect iframe URL
app.get('/api/config', (req, res) => {
  res.json({
    customerId: FLINKS_DASHBOARD_CUSTOMER_ID || FLINKS_CUSTOMER_ID,
    iframeBaseUrl,
    demo: useDemoParam,
    env: FLINKS_ENV,
    appUrl: APP_URL,
  });
});

// Step 1: BankingServices/GenerateAuthorizeToken — returns a Token used as the
// 'flinks-auth-key' header on subsequent calls, OR as authorizeToken on the iframe.
async function generateAuthorizeToken() {
  const response = await axios.post(
    `${FLINKS_API_BASE_URL}/${FLINKS_CUSTOMER_ID}/BankingServices/GenerateAuthorizeToken`,
    {},
    {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'flinks-auth-key': FLINKS_AUTH_KEY,
      },
    }
  );
  return response.data.Token;
}

app.get('/api/authorize-token', async (req, res) => {
  try {
    const token = await generateAuthorizeToken();
    res.json({ token });
  } catch (err) {
    console.error('GenerateAuthorizeToken error:', err.response?.data || err.message);
    res.status(err.response?.status || 500).json({
      error: 'Failed to generate authorize token',
      details: err.response?.data || err.message,
    });
  }
});

// Known answers for FlinksCapital's randomized (Canada-region) test security
// questions. Docs: https://docs.flinks.com/guides/connect/flinks-connect/test-users.md
const FLINKS_CAPITAL_SECURITY_ANSWERS = [
  { match: /city.*born/i, answer: 'Montreal' },
  { match: /best country/i, answer: 'Canada' },
  { match: /shape.*like/i, answer: 'Triangle' },
  { match: /\d+\s*\+\s*\d+/i, answer: '4' },
];

function answerFor(prompt) {
  const found = FLINKS_CAPITAL_SECURITY_ANSWERS.find((a) => a.match.test(prompt));
  return found ? found.answer : null;
}

async function authorizeRequest(body) {
  const authKey = await generateAuthorizeToken();
  const response = await axios.post(
    `${FLINKS_API_BASE_URL}/${FLINKS_CUSTOMER_ID}/BankingServices/Authorize`,
    body,
    {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'flinks-auth-key': authKey,
      },
    }
  );
  return response.data;
}

// Direct API login (optional / bypass). Kept for debugging only — the main UI
// uses the Connect iframe and then /api/accounts with a loginId.
app.post('/api/authorize', async (req, res) => {
  const {
    institution = 'FlinksCapital',
    username = 'Greatday',
    password = 'Everyday',
  } = req.body || {};

  try {
    let data = await authorizeRequest({
      Institution: institution,
      Username: username,
      Password: password,
      Save: true,
      MostRecentCached: false,
    });

    for (let i = 0; i < 5 && data.SecurityChallenges?.length; i++) {
      const securityResponses = {};
      for (const challenge of data.SecurityChallenges) {
        const answer = answerFor(challenge.Prompt);
        if (!answer) {
          return res.status(422).json({
            error: `No known answer for security question: "${challenge.Prompt}"`,
            details: data,
          });
        }
        securityResponses[challenge.Prompt] = [answer];
      }

      data = await authorizeRequest({
        Institution: institution,
        Username: username,
        Password: password,
        Save: true,
        RequestId: data.RequestId,
        SecurityResponses: securityResponses,
      });
    }

    res.json(data);
  } catch (err) {
    console.error('Flinks Authorize error:', err.response?.data || err.message);
    res.status(err.response?.status || 500).json({
      error: 'Failed to authorize with Flinks',
      details: err.response?.data || err.message,
    });
  }
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// After the iframe returns a loginId (REDIRECT event), exchange it for a
// RequestId via cached Authorize, then poll GetAccountsDetail.
// Docs: https://docs.flinks.com/guides/connect/standard-integration
app.post('/api/accounts', async (req, res) => {
  const { loginId, requestId: existingRequestId, accountIds } = req.body;

  if (!loginId && !existingRequestId) {
    return res.status(400).json({ error: 'loginId or requestId is required' });
  }

  try {
    let requestId = existingRequestId;

    if (!requestId) {
      const auth = await authorizeRequest({
        LoginId: loginId,
        MostRecentCached: true,
      });
      requestId = auth.RequestId;
      if (!requestId) {
        return res.status(422).json({
          error: 'Authorize did not return a RequestId',
          details: auth,
        });
      }
    }

    const authKey = await generateAuthorizeToken();
    const headers = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'flinks-auth-key': authKey,
      'x-api-key': FLINKS_API_KEY,
    };

    const detailBody = { RequestId: requestId };
    if (Array.isArray(accountIds) && accountIds.length) {
      detailBody.AccountsFilter = accountIds;
    }

    let response = await axios.post(
      `${FLINKS_API_BASE_URL}/${FLINKS_CUSTOMER_ID}/BankingServices/GetAccountsDetail`,
      detailBody,
      { headers, validateStatus: () => true }
    );

    for (let i = 0; i < 10 && response.status === 202; i++) {
      await sleep(10000);
      response = await axios.post(
        `${FLINKS_API_BASE_URL}/${FLINKS_CUSTOMER_ID}/BankingServices/GetAccountsDetailAsync`,
        { RequestId: requestId },
        { headers, validateStatus: () => true }
      );
    }

    res.status(response.status).json({
      ...response.data,
      _meta: { loginId, requestId },
    });
  } catch (err) {
    console.error('Flinks GetAccountsDetail error:', err.response?.data || err.message);
    res.status(err.response?.status || 500).json({
      error: 'Failed to fetch account details from Flinks',
      details: err.response?.data || err.message,
    });
  }
});

// Local `npm start` listens; on Vercel the platform invokes the exported app.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Flinks demo server running at http://localhost:${PORT}`);
  });
}

module.exports = app;
