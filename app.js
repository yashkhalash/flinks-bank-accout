const resultEl = document.getElementById('result');
const statusEl = document.getElementById('status');
const accountsEl = document.getElementById('accounts');
const successBanner = document.getElementById('success-banner');
const successSub = document.getElementById('success-sub');
const iframeEl = document.getElementById('flinks-connect');
const iframeWrap = document.getElementById('iframe-wrap');
const iframeLoader = document.getElementById('iframe-loader');
const loaderText = document.getElementById('loader-text');
const stepEls = Object.fromEntries(
  [...document.querySelectorAll('#steps li')].map((el) => [el.dataset.step, el])
);
const STEP_ORDER = ['consent', 'institution', 'auth', 'mfa', 'selection', 'confirmation'];

const FLINKS_ORIGIN_RE = /(^|\.)(private\.fin\.ag|flinks\.com)$/i;

let completed = false;
let loadingAccounts = false;

function money(value, currency = 'CAD') {
  if (value == null || Number.isNaN(Number(value))) return '—';
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency || 'CAD',
    }).format(Number(value));
  } catch {
    return `${Number(value).toFixed(2)} ${currency || ''}`.trim();
  }
}

function setStep(step, status = 'active') {
  const index = STEP_ORDER.indexOf(step);
  STEP_ORDER.forEach((s, i) => {
    stepEls[s].classList.remove('active', 'done', 'error');
    if (i < index) stepEls[s].classList.add('done');
  });
  if (stepEls[step]) stepEls[step].classList.add(status);
}

function showLoader(message) {
  iframeWrap.classList.remove('hidden');
  iframeLoader.classList.remove('hidden');
  iframeEl.classList.remove('visible');
  if (message) loaderText.textContent = message;
}

function hideLoader() {
  iframeLoader.classList.add('hidden');
  iframeEl.classList.add('visible');
}

function showIframe() {
  iframeWrap.classList.remove('hidden');
}

function clearIframe() {
  iframeEl.classList.remove('visible');
  iframeEl.removeAttribute('src');
}

function loginIdFromRedirect(data) {
  if (data.loginId) return data.loginId;
  if (!data.url) return null;
  try {
    return new URL(data.url).searchParams.get('loginId');
  } catch {
    const match = String(data.url).match(/[?&]loginId=([^&]+)/i);
    return match ? decodeURIComponent(match[1]) : null;
  }
}

function accountIdFromRedirect(data) {
  if (data.accountId) {
    return Array.isArray(data.accountId) ? data.accountId : [data.accountId];
  }
  if (!data.url) return null;
  try {
    const raw = new URL(data.url).searchParams.get('accountId');
    return raw ? raw.split(',').filter(Boolean) : null;
  } catch {
    return null;
  }
}

function mapFlinksStep(step) {
  switch (step) {
    case 'APP_MOUNTED':
    case 'COMPONENT_LOAD_CONSENT':
    case 'COMPONENT_ACCEPT_CONSENT':
    case 'COMPONENT_ACCEPT_PROVIDER_CONSENT':
      return 'consent';
    case 'COMPONENT_LOAD_INSTITUTION_SELECTOR':
    case 'INSTITUTION_SELECTED':
      return 'institution';
    case 'COMPONENT_LOAD_CREDENTIAL':
    case 'COMPONENT_LOAD_CREDENTIAL_RETRY':
    case 'SUBMIT_CREDENTIAL':
      return 'auth';
    case 'COMPONENT_LOAD_MFA':
    case 'COMPONENT_LOAD_MFA_RETRY':
    case 'SUBMIT_MFA':
    case 'INVALID_SECURITY_RESPONSE':
      return 'mfa';
    case 'COMPONENT_LOAD_ACCOUNT_SELECTION':
    case 'ACCOUNT_SELECTED':
      return 'selection';
    case 'REDIRECT':
      return 'confirmation';
    default:
      return null;
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderAccounts(payload) {
  accountsEl.innerHTML = '';
  const list = payload.Accounts || payload.accounts || [];
  const institution =
    payload.InstitutionName ||
    payload.Institution ||
    payload._meta?.institution ||
    '—';
  const loginId = payload.Login?.Id || payload._meta?.loginId || '—';

  if (!list.length) {
    accountsEl.innerHTML =
      '<p class="hint">No Accounts array in the response. Open “Raw API response” below.</p>';
    return;
  }

  for (const acct of list) {
    const currency = acct.Currency || acct.Balance?.Currency || 'CAD';
    const balance = acct.Balance || {};
    const holder =
      acct.Holder?.Name ||
      acct.Holder?.Email ||
      (Array.isArray(acct.Holders) && acct.Holders[0]?.Name) ||
      '—';
    const card = document.createElement('article');
    card.className = 'account-card';
    card.innerHTML = `
      <h3>${escapeHtml(acct.Title || acct.Type || 'Account')}</h3>
      <dl class="account-meta">
        <dt>Institution</dt><dd>${escapeHtml(institution)}</dd>
        <dt>Account #</dt><dd>${escapeHtml(acct.AccountNumber || acct.TransitNumber || '—')}</dd>
        <dt>Type</dt><dd>${escapeHtml(acct.Category || acct.Type || '—')}</dd>
        <dt>Holder</dt><dd>${escapeHtml(holder)}</dd>
        <dt>Current balance</dt><dd>${escapeHtml(money(balance.Current ?? balance.available ?? balance.Available, currency))}</dd>
        <dt>Available</dt><dd>${escapeHtml(money(balance.Available ?? balance.available, currency))}</dd>
        <dt>Account Id</dt><dd><code>${escapeHtml(acct.Id || '—')}</code></dd>
        <dt>Login Id</dt><dd><code>${escapeHtml(loginId)}</code></dd>
        <dt>Transactions</dt><dd>${Array.isArray(acct.Transactions) ? acct.Transactions.length : 0} returned</dd>
      </dl>
    `;
    accountsEl.appendChild(card);
  }
}

async function fetchAccounts(loginId, institution, accountIds) {
  if (loadingAccounts) return;
  loadingAccounts = true;

  setStep('selection');
  statusEl.textContent = 'Bank connected. Fetching account details (this can take up to a minute)…';
  resultEl.textContent = 'Fetching account details…';
  accountsEl.innerHTML = '';
  successBanner.classList.remove('visible');

  try {
    const res = await fetch('/api/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ loginId, accountIds }),
    });
    const accounts = await res.json();
    if (institution && !accounts.Institution && !accounts.InstitutionName) {
      accounts.Institution = institution;
    }

    if (res.ok) {
      setStep('confirmation', 'done');
      stepEls.confirmation.classList.add('active');
      statusEl.textContent =
        'Done — Confirmation (same as Dashboard preview). Account details are below.';
      successSub.textContent = institution
        ? `Connected to ${institution}. Details from GetAccountsDetail:`
        : 'Account details from GetAccountsDetail:';
      successBanner.classList.add('visible');
      renderAccounts(accounts);
    } else {
      setStep('selection', 'error');
      statusEl.textContent = 'Failed to fetch account details.';
    }

    resultEl.textContent = JSON.stringify(accounts, null, 2);
  } catch (err) {
    setStep('selection', 'error');
    statusEl.textContent = 'Error fetching accounts.';
    resultEl.textContent = 'Error: ' + err.message;
  } finally {
    loadingAccounts = false;
  }
}

function isTrustedFlinksOrigin(origin) {
  try {
    const host = new URL(origin).hostname;
    return FLINKS_ORIGIN_RE.test(host);
  } catch {
    return false;
  }
}

function onFlinksMessage(event) {
  if (!isTrustedFlinksOrigin(event.origin)) return;

  const data = event.data;
  if (!data || typeof data !== 'object') return;

  const step = data.step;
  if (step) {
    hideLoader();
    statusEl.textContent = `Flinks: ${step}`;
    const mapped = mapFlinksStep(step);
    if (mapped && !completed) setStep(mapped);
  }

  if (data.flinksCode) {
    statusEl.textContent = `Flinks error: ${data.flinksCode}`;
    if (
      data.flinksCode === 'INVALID_USERNAME' ||
      data.flinksCode === 'INVALID_PASSWORD' ||
      data.flinksCode === 'INVALID_LOGIN'
    ) {
      setStep('auth');
    }
  }

  if (step === 'COMPONENT_CLOSE_SESSION') {
    statusEl.textContent = 'Connect closed. Click Connect to try again.';
    clearIframe();
    showLoader('Click “Connect to Flinks” to start again');
    return;
  }

  if (step === 'TOKEN_INVALID') {
    statusEl.textContent = 'Authorize token expired. Reloading…';
    loadConnect();
    return;
  }

  if (step !== 'REDIRECT' || completed) return;

  const loginId = loginIdFromRedirect(data);
  if (!loginId) {
    statusEl.textContent = 'REDIRECT received but no loginId — keep the widget open.';
    resultEl.textContent = JSON.stringify(data, null, 2);
    return;
  }

  completed = true;
  hideLoader();
  setStep('confirmation', 'done');
  stepEls.confirmation.classList.add('active');
  statusEl.textContent =
    'Confirmation — success screen in the iframe (like Dashboard). Loading account details…';
  resultEl.textContent = JSON.stringify(
    { loginId, institution: data.institution, accountId: data.accountId },
    null,
    2
  );
  fetchAccounts(loginId, data.institution, accountIdFromRedirect(data));
}

async function loadConnect() {
  completed = false;
  loadingAccounts = false;
  showIframe();
  showLoader('Loading Flinks Connect…');
  setStep('consent');
  statusEl.textContent = 'Loading Flinks Connect…';
  resultEl.textContent = 'Waiting for bank connection…';
  accountsEl.innerHTML = '';
  successBanner.classList.remove('visible');
  clearIframe();
  showLoader('Loading Flinks Connect…');

  try {
    const [configRes, tokenRes] = await Promise.all([
      fetch('/api/config'),
      fetch('/api/authorize-token'),
    ]);
    const config = await configRes.json();
    const tokenPayload = await tokenRes.json();

    if (!tokenRes.ok || !tokenPayload.token) {
      showLoader('Failed to get authorize token — check Vercel env vars');
      statusEl.textContent = 'Failed to get authorize token.';
      resultEl.textContent = JSON.stringify(tokenPayload, null, 2);
      return;
    }

    const params = new URLSearchParams();
    params.set('authorizeToken', tokenPayload.token);
    params.set('innerRedirect', 'true');
    params.set('jsRedirect', 'true');
    params.set('closeEnable', 'true');
    params.set('accountSelectorEnable', 'true');
    params.set('showAllOperationsAccounts', 'true');
    if (config.demo) params.set('demo', 'true');

    const base = config.iframeBaseUrl.endsWith('/')
      ? config.iframeBaseUrl
      : config.iframeBaseUrl + '/';

    loaderText.textContent = 'Opening Flinks Connect…';
    iframeEl.onload = () => {
      setTimeout(() => {
        if (!iframeLoader.classList.contains('hidden')) hideLoader();
      }, 1500);
    };
    iframeEl.src = `${base}?${params.toString()}`;
    statusEl.textContent =
      'Flinks Connect (Toolbox) ready — select Flinks Capital, then Greatday / Everyday.';
  } catch (err) {
    showLoader('Failed to load Connect — is the API running?');
    statusEl.textContent = 'Failed to load Connect.';
    resultEl.textContent = 'Error: ' + err.message;
  }
}

window.addEventListener('message', onFlinksMessage);
document.getElementById('reconnect-btn').addEventListener('click', loadConnect);

loadConnect();
