'use strict';

// =====================
//  タブ切り替え
// =====================
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    const target = document.getElementById('tab-' + btn.dataset.tab);
    if (target) target.classList.add('active');
  });
});

// =====================
//  状態
// =====================
let parsedCredentials = null;

// =====================
//  ユーティリティ
// =====================
function show(el) { el.classList.remove('hidden'); }
function hide(el) { el.classList.add('hidden'); }

function showError(el, msg) {
  el.textContent = msg;
  show(el);
}

function hideError(el) {
  el.textContent = '';
  hide(el);
}

// =====================
//  DOM 参照
// =====================
const credentialsInput   = document.getElementById('credentials-input');
const parseBtn           = document.getElementById('parse-credentials-btn');
const clearCredBtn       = document.getElementById('clear-credentials-btn');
const credentialsError   = document.getElementById('credentials-error');

const step2Section       = document.getElementById('step2-section');
const authUrlLink        = document.getElementById('auth-url-link');
const copyUrlBtn         = document.getElementById('copy-url-btn');
const copyToast          = document.getElementById('copy-toast');

const step3Section       = document.getElementById('step3-section');
const redirectUrlInput   = document.getElementById('redirect-url-input');
const exchangeBtn        = document.getElementById('exchange-code-btn');
const clearRedirectBtn   = document.getElementById('clear-redirect-btn');
const redirectError      = document.getElementById('redirect-error');

const step4Section       = document.getElementById('step4-section');
const tokenLoading       = document.getElementById('token-loading');
const tokenError         = document.getElementById('token-error');
const tokenResult        = document.getElementById('token-result');

// =====================
//  Step 1: credentials.json のパース
// =====================
parseBtn.addEventListener('click', () => {
  hideError(credentialsError);

  let raw = credentialsInput.value.trim();
  if (!raw) {
    showError(credentialsError, 'credentials.json の内容を貼り付けてください。');
    return;
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    showError(credentialsError, 'JSONのパースに失敗しました: ' + e.message);
    return;
  }

  // "web" または "installed" キーを探す
  const appData = data.web || data.installed;
  if (!appData) {
    showError(credentialsError, '"web" または "installed" キーが見つかりません。credentials.json の形式を確認してください。');
    return;
  }

  const { client_id, client_secret, redirect_uris, auth_uri, token_uri } = appData;

  if (!client_id || !client_secret) {
    showError(credentialsError, 'client_id または client_secret が見つかりません。');
    return;
  }

  if (!redirect_uris || redirect_uris.length === 0) {
    showError(credentialsError, 'redirect_uris が見つかりません。');
    return;
  }

  parsedCredentials = {
    client_id,
    client_secret,
    redirect_uri: redirect_uris[0],
    auth_uri: auth_uri || 'https://accounts.google.com/o/oauth2/v2/auth',
    token_uri: token_uri || 'https://oauth2.googleapis.com/token',
  };

  const authUrl = buildAuthUrl(parsedCredentials);
  authUrlLink.href = authUrl;
  authUrlLink.textContent = authUrl;

  show(step2Section);
  show(step3Section);
  step2Section.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

clearCredBtn.addEventListener('click', () => {
  credentialsInput.value = '';
  hideError(credentialsError);
  hide(step2Section);
  hide(step3Section);
  hide(step4Section);
  parsedCredentials = null;
});

// =====================
//  OAuth 認可URL の構築
// =====================
const FITBIT_SCOPES = [
  'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly',
  'https://www.googleapis.com/auth/googlehealth.sleep.readonly',
  'https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly',
  'https://www.googleapis.com/auth/googlehealth.profile.readonly',
].join(' ');

function generateState() {
  const arr = new Uint8Array(24);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => b.toString(36)).join('').slice(0, 32);
}

function buildAuthUrl(creds) {
  const params = new URLSearchParams({
    client_id:             creds.client_id,
    redirect_uri:          creds.redirect_uri,
    response_type:         'code',
    access_type:           'offline',
    include_granted_scopes:'true',
    prompt:                'consent',
    scope:                 FITBIT_SCOPES,
    state:                 generateState(),
  });
  return `${creds.auth_uri}?${params.toString()}`;
}

// =====================
//  URLコピー
// =====================
copyUrlBtn.addEventListener('click', () => {
  const url = authUrlLink.href;
  navigator.clipboard.writeText(url).then(() => {
    show(copyToast);
    setTimeout(() => hide(copyToast), 2000);
  }).catch(() => {
    // フォールバック
    const ta = document.createElement('textarea');
    ta.value = url;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    show(copyToast);
    setTimeout(() => hide(copyToast), 2000);
  });
});

// =====================
//  Step 3: code の抽出 & トークン取得
// =====================
exchangeBtn.addEventListener('click', async () => {
  hideError(redirectError);

  if (!parsedCredentials) {
    showError(redirectError, 'まず Step 1 で credentials.json を読み込んでください。');
    return;
  }

  const raw = redirectUrlInput.value.trim();
  if (!raw) {
    showError(redirectError, 'リダイレクト先のURLを貼り付けてください。');
    return;
  }

  let code;
  try {
    // URLとして直接パース (例: https://...?code=xxx&scope=...)
    const urlObj = new URL(raw);
    code = urlObj.searchParams.get('code');
    if (!code) {
      // クエリ文字列のみ貼られた場合の対応 (例: ?code=xxx&...)
      throw new Error('code パラメータが見つかりません。');
    }
  } catch (e) {
    // URL オブジェクト生成に失敗した場合は正規表現でフォールバック
    const m = raw.match(/[?&]code=([^&\s]+)/);
    if (m) {
      code = decodeURIComponent(m[1]);
    } else {
      showError(redirectError, 'URLから code を抽出できませんでした。リダイレクト後のURLをそのまま貼り付けてください。\n詳細: ' + e.message);
      return;
    }
  }

  show(step4Section);
  show(tokenLoading);
  hide(tokenError);
  hide(tokenResult);
  step4Section.scrollIntoView({ behavior: 'smooth', block: 'start' });

  try {
    const tokenData = await exchangeCodeForToken(code, parsedCredentials);
    renderTokenResult(tokenData);
  } catch (err) {
    hide(tokenLoading);
    showError(tokenError, 'トークン取得に失敗しました:\n' + err.message);
  }
});

clearRedirectBtn.addEventListener('click', () => {
  redirectUrlInput.value = '';
  hideError(redirectError);
  hide(step4Section);
});

// =====================
//  トークン交換 (POST)
// =====================
async function exchangeCodeForToken(code, creds) {
  const body = new URLSearchParams({
    code:          code,
    client_id:     creds.client_id,
    client_secret: creds.client_secret,
    redirect_uri:  creds.redirect_uri,
    grant_type:    'authorization_code',
  });

  const res = await fetch(creds.token_uri, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    body.toString(),
  });

  const json = await res.json();

  if (!res.ok) {
    const msg = json.error_description || json.error || res.statusText;
    throw new Error(`HTTP ${res.status}: ${msg}`);
  }

  return json;
}

// =====================
//  Step 4: 結果表示
// =====================
function renderTokenResult(data) {
  hide(tokenLoading);
  hideError(tokenError);

  document.getElementById('val-access-token').textContent  = data.access_token  || '(なし)';
  document.getElementById('val-refresh-token').textContent = data.refresh_token || '(なし)';
  document.getElementById('val-scope').textContent         = data.scope         || '(なし)';
  document.getElementById('val-expires-in').textContent    = data.expires_in != null ? `${data.expires_in} 秒` : '(なし)';
  document.getElementById('val-token-type').textContent    = data.token_type    || '(なし)';

  document.getElementById('raw-json-output').textContent = JSON.stringify(data, null, 2);

  show(tokenResult);

  if (parsedCredentials && data.refresh_token) {
    try {
      sessionStorage.setItem('health_api_auth', JSON.stringify({
        client_id:     parsedCredentials.client_id,
        client_secret: parsedCredentials.client_secret,
        refresh_token: data.refresh_token,
      }));
    } catch (_) { /* ignore */ }
    document.getElementById('api-refresh-token').value = data.refresh_token;
    syncRefreshTokenPreview(data.refresh_token);
  }
}

// =====================
//  各トークン値のコピーボタン
// =====================
document.querySelectorAll('.copy-token-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const targetId = btn.dataset.target;
    const text = document.getElementById(targetId).textContent;
    navigator.clipboard.writeText(text).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    });
    const orig = btn.innerHTML;
    btn.innerHTML = '✓';
    btn.style.color = '#2b9348';
    setTimeout(() => { btn.innerHTML = orig; btn.style.color = ''; }, 1500);
  });
});

// ============================================================
//  API実行タブ
// ============================================================

const BASE_URL = 'https://health.googleapis.com';
const DEFAULT_PAGE_SIZE = 1000;
const DEFAULT_RANGE_HOURS = 48;

// ----- フィルター時刻オプション (list API / Endpoints 準拠) -----
// https://developers.google.com/health/reference/rest/v4/users.dataTypes.dataPoints/list
// https://developers.google.com/health/endpoints
const TIME_FILTER_OPTIONS = {
  interval_civil_start: {
    label: '区間開始（現地日時）',
    path: 'interval.civil_start_time',
    inputType: 'civil',
    inputWidget: 'datetime-local',
    hint: 'ISO 8601 日付または日時（例: 2026-03-04 / 2026-03-04T12:00:00）',
    rangeEnd: true,
  },
  interval_start: {
    label: '区間開始（UTC・物理時刻）',
    path: 'interval.start_time',
    inputType: 'utc',
    inputWidget: 'datetime-local',
    hint: 'RFC 3339 UTC（例: 2026-03-04T00:00:00Z）',
    rangeEnd: true,
  },
  sample_civil: {
    label: 'サンプル時刻（現地日時）',
    path: 'sample_time.civil_time',
    inputType: 'civil',
    inputWidget: 'date',
    hint: '体重・心拍などのサンプル観測（現地日時・日付）',
    rangeEnd: true,
  },
  sample_physical: {
    label: 'サンプル時刻（UTC・物理時刻）',
    path: 'sample_time.physical_time',
    inputType: 'utc',
    inputWidget: 'datetime-local',
    hint: '公式推奨の physical_time（例: body_fat）',
    rangeEnd: true,
  },
  daily_date: {
    label: '日次サマリー日付',
    path: 'date',
    inputType: 'date',
    inputWidget: 'date',
    hint: 'YYYY-MM-DD のみ',
    rangeEnd: true,
  },
  session_civil_start: {
    label: 'セッション開始（現地日時）',
    path: 'interval.civil_start_time',
    inputType: 'civil',
    inputWidget: 'datetime-local',
    hint: 'exercise / nutrition-log など',
    rangeEnd: true,
  },
  sleep_civil_end: {
    label: '睡眠終了（現地日時）',
    path: 'interval.civil_end_time',
    inputType: 'civil',
    inputWidget: 'date',
    field: 'sleep',
    hint: 'sleep 専用・civil_end_time',
    rangeEnd: true,
  },
  sleep_end: {
    label: '睡眠終了（UTC・物理時刻）',
    path: 'interval.end_time',
    inputType: 'utc',
    inputWidget: 'datetime-local',
    field: 'sleep',
    hint: 'sleep 専用・end_time（RFC 3339）',
    rangeEnd: true,
  },
  ecg_start: {
    label: 'ECG 開始（UTC）',
    path: 'interval.start_time',
    inputType: 'utc',
    inputWidget: 'datetime-local',
    field: 'electrocardiogram',
    hint: '開始時刻のみ（>=）。終了日フィルターは非対応',
    rangeEnd: false,
  },
};

function kebabToSnake(str) {
  return str.replace(/-/g, '_');
}

/**
 * filter 式の data type 識別子
 * - URL パス: kebab-case（例: daily-resting-heart-rate）
 * - filter: snake_case（例: daily_resting_heart_rate）— Discovery / Endpoints 準拠
 *   https://developers.google.com/health/reference/rest
 */
function getFilterField(item) {
  return item.id.includes('-') ? kebabToSnake(item.id) : item.id;
}

function getFilterFieldForOption(item, option) {
  if (option.field) return option.field;
  return getFilterField(item);
}

const TOKEN_URI = 'https://oauth2.googleapis.com/token';

let cachedAccessToken = null;
let cachedAccessTokenExpiresAt = 0;

function buildCurlCommand(method, url, accessToken) {
  const tokenDisplay = accessToken || 'YOUR_ACCESS_TOKEN';
  return [
    `curl -X ${method} \\`,
    `  -H "Authorization: Bearer ${tokenDisplay}" \\`,
    `  -H "Accept: application/json" \\`,
    `  "${url}"`,
  ].join('\n');
}

function formatResponseBodyDisplay(parsedBody, rawText) {
  if (parsedBody !== undefined && parsedBody !== null) {
    return JSON.stringify(parsedBody, null, 2);
  }
  return rawText || '';
}

function formatResponseDebug(requestInfo, res, rawText, parsedBody, elapsedMs) {
  let parsed = parsedBody;
  if (parsed === undefined && rawText) {
    try { parsed = JSON.parse(rawText); } catch { parsed = rawText; }
  }
  const headers = {};
  res.headers.forEach((value, key) => { headers[key] = value; });
  return JSON.stringify({
    request: requestInfo,
    response: { status: res.status, statusText: res.statusText, ok: res.ok, elapsedMs, headers, bodyRaw: rawText, body: parsed },
  }, null, 2);
}

function setAuthFlowStep(stepNum, state, message) {
  const el = document.getElementById(`auth-flow-step${stepNum}`);
  const statusEl = document.getElementById(`auth-flow-step${stepNum}-status`);
  if (!el || !statusEl) return;
  el.classList.remove('active', 'done', 'error');
  if (state) el.classList.add(state);
  statusEl.textContent = message;
}

function showAuthFlowSection() {
  document.getElementById('api-auth-flow-section').style.display = 'block';
}

function loadApiAuthFromStorage() {
  try {
    const raw = sessionStorage.getItem('health_api_auth');
    if (!raw) return;
    const data = JSON.parse(raw);
    const setIfEmpty = (id, val) => {
      const el = document.getElementById(id);
      if (el && !el.value && val) el.value = val;
    };
    setIfEmpty('api-client-id', data.client_id);
    setIfEmpty('api-client-secret', data.client_secret);
    setIfEmpty('api-refresh-token', data.refresh_token);
    syncRefreshTokenPreview(data.refresh_token);
  } catch (_) { /* ignore */ }
}

loadApiAuthFromStorage();
syncRefreshTokenPreview();

function syncRefreshTokenPreview(token) {
  const preview = document.getElementById('api-cached-refresh-token');
  if (!preview) return;
  const val = token || document.getElementById('api-refresh-token')?.value.trim();
  preview.textContent = val || '（未取得）';
}

function persistAuthToStorage(refreshToken) {
  try {
    const data = {
      client_id:     document.getElementById('api-client-id').value.trim(),
      client_secret: document.getElementById('api-client-secret').value.trim(),
      refresh_token: refreshToken,
    };
    sessionStorage.setItem('health_api_auth', JSON.stringify(data));
  } catch (_) { /* ignore */ }
}

/** Google が refresh 応答で新 refresh_token を返したときに入力欄・表示を更新 */
function applyRefreshTokenRotation(newRefreshToken) {
  if (!newRefreshToken) return false;

  document.getElementById('api-refresh-token').value = newRefreshToken;
  syncRefreshTokenPreview(newRefreshToken);
  persistAuthToStorage(newRefreshToken);

  const fitbitRefresh = document.getElementById('val-refresh-token');
  if (fitbitRefresh) fitbitRefresh.textContent = newRefreshToken;

  const notice = document.getElementById('api-refresh-token-rotated-notice');
  if (notice) show(notice);

  return true;
}

async function refreshAccessToken(force = false) {
  const clientId = document.getElementById('api-client-id').value.trim();
  const clientSecret = document.getElementById('api-client-secret').value.trim();
  const refreshToken = document.getElementById('api-refresh-token').value.trim();

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Client ID、Client Secret、Refresh Token を入力してください。');
  }

  syncRefreshTokenPreview(refreshToken);

  if (!force && cachedAccessToken && Date.now() < cachedAccessTokenExpiresAt - 60_000) {
    setAuthFlowStep(1, 'done', `キャッシュ利用（残り約 ${Math.max(0, Math.floor((cachedAccessTokenExpiresAt - Date.now()) / 1000))} 秒）`);
    return cachedAccessToken;
  }

  showAuthFlowSection();
  setAuthFlowStep(1, 'active', 'トークン取得中...');

  const res = await fetch(TOKEN_URI, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type:    'refresh_token',
    }).toString(),
  });

  const json = await res.json();
  if (!res.ok) {
    const msg = json.error_description || json.error || res.statusText;
    setAuthFlowStep(1, 'error', `失敗: ${msg}`);
    cachedAccessToken = null;
    cachedAccessTokenExpiresAt = 0;
    if (json.error === 'invalid_grant') {
      throw new Error(`トークン更新失敗 (${res.status}): ${msg}\n\nRefresh Token の期限切れの可能性があります。fitbit登録タブから再認可してください。`);
    }
    throw new Error(`トークン更新失敗 (${res.status}): ${msg}`);
  }

  cachedAccessToken = json.access_token;
  cachedAccessTokenExpiresAt = Date.now() + (json.expires_in || 3600) * 1000;
  document.getElementById('api-cached-access-token').textContent = cachedAccessToken;

  let step1Msg = `成功（expires_in: ${json.expires_in} 秒）`;
  if (json.refresh_token) {
    applyRefreshTokenRotation(json.refresh_token);
    step1Msg += ' ・Refresh Token 更新あり';
  } else {
    hide(document.getElementById('api-refresh-token-rotated-notice'));
  }

  setAuthFlowStep(1, 'done', step1Msg);
  if (currentApiItem) updateEndpoint();
  return cachedAccessToken;
}

/** @param {'civil'|'utc'|'date'} inputType */
function formatFilterLiteral(value, inputType, isEnd) {
  if (!value) return '';
  if (inputType === 'date') return value.slice(0, 10);
  if (inputType === 'civil') {
    if (value.length === 10) return value;
    return value.length === 16 ? value + ':00' : value;
  }
  // utc
  if (value.length === 10) {
    return isEnd ? `${value}T23:59:59Z` : `${value}T00:00:00Z`;
  }
  if (value.length === 16) return value + ':00Z';
  return value.endsWith('Z') ? value : value + 'Z';
}

const API_CATEGORIES = {
  user: {
    label: 'ユーザー情報',
    items: [
      { id: 'identity',     label: 'getIdentity (ユーザーID)', method: 'GET', path: '/v4/users/me/identity',     filter: null },
      { id: 'profile',      label: 'getProfile (プロフィール)',  method: 'GET', path: '/v4/users/me/profile',      filter: null },
      { id: 'settings',     label: 'getSettings (設定)',         method: 'GET', path: '/v4/users/me/settings',     filter: null },
      { id: 'pairedDevices',label: 'listPairedDevices (デバイス一覧)', method: 'GET', path: '/v4/users/me/pairedDevices', filter: null },
    ],
  },
  activity: {
    label: 'アクティビティ & フィットネス',
    items: [
      { id: 'steps',               label: '歩数 (steps)',                       method: 'GET', path: '/v4/users/me/dataTypes/steps/dataPoints',                filter: { options: ['interval_civil_start', 'interval_start'], default: 'interval_civil_start' } },
      { id: 'floors',              label: '階数 (floors)',                      method: 'GET', path: '/v4/users/me/dataTypes/floors/dataPoints',               filter: { options: ['interval_civil_start', 'interval_start'], default: 'interval_civil_start' } },
      { id: 'distance',            label: '距離 (distance)',                    method: 'GET', path: '/v4/users/me/dataTypes/distance/dataPoints',             filter: { options: ['interval_civil_start', 'interval_start'], default: 'interval_civil_start' } },
      { id: 'altitude',            label: '高度 (altitude)',                    method: 'GET', path: '/v4/users/me/dataTypes/altitude/dataPoints',             filter: { options: ['interval_civil_start', 'interval_start'], default: 'interval_civil_start' } },
      { id: 'active-zone-minutes', label: 'アクティブゾーン分 (active-zone-minutes)', method: 'GET', path: '/v4/users/me/dataTypes/active-zone-minutes/dataPoints', filter: { options: ['interval_civil_start', 'interval_start'], default: 'interval_civil_start' } },
      { id: 'active-minutes',      label: 'アクティブ分 (active-minutes)',      method: 'GET', path: '/v4/users/me/dataTypes/active-minutes/dataPoints',      filter: { options: ['interval_civil_start', 'interval_start'], default: 'interval_civil_start' } },
      { id: 'active-energy-burned',label: '消費カロリー (active-energy-burned)', method: 'GET', path: '/v4/users/me/dataTypes/active-energy-burned/dataPoints', filter: { options: ['interval_civil_start', 'interval_start'], default: 'interval_civil_start' } },
      { id: 'sedentary-period',    label: '座位時間 (sedentary-period)',        method: 'GET', path: '/v4/users/me/dataTypes/sedentary-period/dataPoints',    filter: { options: ['interval_civil_start', 'interval_start'], default: 'interval_civil_start' } },
      { id: 'swim-lengths-data',   label: '水泳ラップ (swim-lengths-data)',      method: 'GET', path: '/v4/users/me/dataTypes/swim-lengths-data/dataPoints',   filter: { options: ['interval_civil_start', 'interval_start'], default: 'interval_civil_start' } },
      { id: 'time-in-heart-rate-zone', label: '心拍ゾーン時間 (time-in-heart-rate-zone)', method: 'GET', path: '/v4/users/me/dataTypes/time-in-heart-rate-zone/dataPoints', filter: { options: ['interval_civil_start', 'interval_start'], default: 'interval_civil_start' } },
      { id: 'activity-level',      label: '活動レベル (activity-level)',        method: 'GET', path: '/v4/users/me/dataTypes/activity-level/dataPoints',      filter: { options: ['interval_civil_start', 'interval_start'], default: 'interval_civil_start' } },
    ],
  },
  heart: {
    label: '心拍',
    items: [
      { id: 'heart-rate',                 label: '心拍数 (heart-rate)',                          method: 'GET', path: '/v4/users/me/dataTypes/heart-rate/dataPoints',                  filter: { options: ['sample_civil', 'sample_physical'], default: 'sample_civil' } },
      { id: 'heart-rate-variability',     label: '心拍変動 (heart-rate-variability)',             method: 'GET', path: '/v4/users/me/dataTypes/heart-rate-variability/dataPoints',      filter: { options: ['sample_civil', 'sample_physical'], default: 'sample_civil' } },
      { id: 'daily-resting-heart-rate',   label: '安静時心拍数 (daily-resting-heart-rate)',       method: 'GET', path: '/v4/users/me/dataTypes/daily-resting-heart-rate/dataPoints',   filter: { options: ['daily_date'], default: 'daily_date' } },
      { id: 'daily-heart-rate-variability',label: '日次心拍変動 (daily-heart-rate-variability)', method: 'GET', path: '/v4/users/me/dataTypes/daily-heart-rate-variability/dataPoints', filter: { options: ['daily_date'], default: 'daily_date' } },
      { id: 'daily-heart-rate-zones',     label: '日次心拍ゾーン (daily-heart-rate-zones)',       method: 'GET', path: '/v4/users/me/dataTypes/daily-heart-rate-zones/dataPoints',     filter: { options: ['daily_date'], default: 'daily_date' } },
      { id: 'irregular-rhythm-notification', label: '不整脈通知 (irregular-rhythm-notification)', method: 'GET', path: '/v4/users/me/dataTypes/irregular-rhythm-notification/dataPoints', filter: { options: ['session_civil_start'], default: 'session_civil_start' } },
      { id: 'electrocardiogram',          label: '心電図 (electrocardiogram)',                    method: 'GET', path: '/v4/users/me/dataTypes/electrocardiogram/dataPoints',           filter: { options: ['ecg_start'], default: 'ecg_start' }, pageSize: { max: 25, default: 25 } },
    ],
  },
  sleep: {
    label: '睡眠',
    items: [
      { id: 'sleep',                            label: '睡眠セッション (sleep)',                           method: 'GET', path: '/v4/users/me/dataTypes/sleep/dataPoints',                          filter: { options: ['sleep_civil_end', 'sleep_end'], default: 'sleep_civil_end' }, pageSize: { max: 25, default: 25 } },
      { id: 'daily-sleep-temperature-derivations', label: '睡眠体温変化 (daily-sleep-temperature-derivations)', method: 'GET', path: '/v4/users/me/dataTypes/daily-sleep-temperature-derivations/dataPoints', filter: { options: ['daily_date'], default: 'daily_date' } },
      { id: 'respiratory-rate-sleep-summary',   label: '睡眠呼吸数 (respiratory-rate-sleep-summary)',    method: 'GET', path: '/v4/users/me/dataTypes/respiratory-rate-sleep-summary/dataPoints', filter: { options: ['sample_civil', 'sample_physical'], default: 'sample_civil' } },
      { id: 'daily-respiratory-rate',           label: '日次呼吸数 (daily-respiratory-rate)',            method: 'GET', path: '/v4/users/me/dataTypes/daily-respiratory-rate/dataPoints',       filter: { options: ['daily_date'], default: 'daily_date' } },
    ],
  },
  body: {
    label: '体組成',
    items: [
      { id: 'weight',    label: '体重 (weight)',       method: 'GET', path: '/v4/users/me/dataTypes/weight/dataPoints',     filter: { options: ['sample_civil', 'sample_physical'], default: 'sample_civil' } },
      { id: 'body-fat',  label: '体脂肪率 (body-fat)', method: 'GET', path: '/v4/users/me/dataTypes/body-fat/dataPoints',   filter: { options: ['sample_civil', 'sample_physical'], default: 'sample_physical' } },
      { id: 'height',    label: '身長 (height)',       method: 'GET', path: '/v4/users/me/dataTypes/height/dataPoints',     filter: { options: ['sample_civil', 'sample_physical'], default: 'sample_civil' } },
    ],
  },
  health: {
    label: '健康指標',
    items: [
      { id: 'oxygen-saturation',       label: '血中酸素濃度 (oxygen-saturation)',         method: 'GET', path: '/v4/users/me/dataTypes/oxygen-saturation/dataPoints',       filter: { options: ['sample_civil', 'sample_physical'], default: 'sample_civil' } },
      { id: 'daily-oxygen-saturation', label: '日次血中酸素 (daily-oxygen-saturation)',   method: 'GET', path: '/v4/users/me/dataTypes/daily-oxygen-saturation/dataPoints', filter: { options: ['daily_date'], default: 'daily_date' } },
      { id: 'vo2-max',                 label: 'VO2Max (vo2-max)',                         method: 'GET', path: '/v4/users/me/dataTypes/vo2-max/dataPoints',                 filter: { options: ['sample_civil', 'sample_physical'], default: 'sample_civil' } },
      { id: 'run-vo2-max',             label: 'ランニングVO2Max (run-vo2-max)',            method: 'GET', path: '/v4/users/me/dataTypes/run-vo2-max/dataPoints',             filter: { options: ['sample_civil', 'sample_physical'], default: 'sample_civil' } },
      { id: 'daily-vo2-max',           label: '日次VO2Max (daily-vo2-max)',               method: 'GET', path: '/v4/users/me/dataTypes/daily-vo2-max/dataPoints',           filter: { options: ['daily_date'], default: 'daily_date' } },
      { id: 'core-body-temperature',   label: '体温 (core-body-temperature)',             method: 'GET', path: '/v4/users/me/dataTypes/core-body-temperature/dataPoints',   filter: { options: ['sample_civil', 'sample_physical'], default: 'sample_civil' } },
      { id: 'blood-glucose',           label: '血糖値 (blood-glucose)',                   method: 'GET', path: '/v4/users/me/dataTypes/blood-glucose/dataPoints',           filter: { options: ['sample_civil', 'sample_physical'], default: 'sample_civil' } },
    ],
  },
  exercise: {
    label: 'エクササイズ',
    items: [
      { id: 'exercise', label: 'エクササイズセッション (exercise)', method: 'GET', path: '/v4/users/me/dataTypes/exercise/dataPoints', filter: { options: ['session_civil_start'], default: 'session_civil_start' }, pageSize: { max: 25, default: 25 } },
    ],
  },
  nutrition: {
    label: '栄養 & 水分',
    items: [
      { id: 'nutrition-log',  label: '栄養ログ (nutrition-log)',  method: 'GET', path: '/v4/users/me/dataTypes/nutrition-log/dataPoints',  filter: { options: ['session_civil_start'], default: 'session_civil_start' } },
      { id: 'hydration-log',  label: '水分ログ (hydration-log)',  method: 'GET', path: '/v4/users/me/dataTypes/hydration-log/dataPoints',  filter: { options: ['session_civil_start'], default: 'session_civil_start' } },
    ],
  },
};

function pad2(n) {
  return String(n).padStart(2, '0');
}

function toDateLocal(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function toDatetimeLocal(d) {
  return `${toDateLocal(d)}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** デフォルト期間: 48時間前 〜 現在（date は終了日を翌日で排他的上限） */
function defaultTimeRange(inputWidget) {
  const now = new Date();
  const start = new Date(now.getTime() - DEFAULT_RANGE_HOURS * 60 * 60 * 1000);

  if (inputWidget === 'datetime-local') {
    return { start: toDatetimeLocal(start), end: toDatetimeLocal(now) };
  }

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return { start: toDateLocal(start), end: toDateLocal(tomorrow) };
}

// ----- カテゴリ選択 → データタイプ一覧更新 -----
const apiCategory  = document.getElementById('api-category');
const apiDatatype  = document.getElementById('api-datatype');
const apiDatatypeWrap = document.getElementById('api-datatype-wrap');
const apiFilterWrap   = document.getElementById('api-filter-wrap');
const apiFilterFields = document.getElementById('api-filter-fields');
const apiEndpointSection = document.getElementById('api-endpoint-section');
const apiEndpointUrl = document.getElementById('api-endpoint-url');
const apiCurlCmd     = document.getElementById('api-curl-cmd');
const apiResponseSection = document.getElementById('api-response-section');
const apiLoading     = document.getElementById('api-loading');
const apiResponseError = document.getElementById('api-response-error');
const apiResponseResult = document.getElementById('api-response-result');
const apiResponseMeta   = document.getElementById('api-response-meta');
const apiResponseBody   = document.getElementById('api-response-body');

let currentApiItem = null;

apiCategory.addEventListener('change', () => {
  const cat = apiCategory.value;
  apiDatatype.innerHTML = '<option value="">-- データタイプを選択 --</option>';

  if (!cat || !API_CATEGORIES[cat]) {
    apiDatatypeWrap.style.display = 'none';
    apiFilterWrap.style.display = 'none';
    apiEndpointSection.style.display = 'none';
    currentApiItem = null;
    return;
  }

  API_CATEGORIES[cat].items.forEach(item => {
    const opt = document.createElement('option');
    opt.value = item.id;
    opt.textContent = item.label;
    apiDatatype.appendChild(opt);
  });
  apiDatatypeWrap.style.display = 'flex';
  apiFilterWrap.style.display = 'none';
  apiEndpointSection.style.display = 'none';
  currentApiItem = null;
});

apiDatatype.addEventListener('change', () => {
  const cat = apiCategory.value;
  const id  = apiDatatype.value;
  if (!cat || !id) {
    apiFilterWrap.style.display = 'none';
    apiEndpointSection.style.display = 'none';
    currentApiItem = null;
    return;
  }

  currentApiItem = API_CATEGORIES[cat].items.find(i => i.id === id) || null;
  if (!currentApiItem) return;

  clearPageToken();
  renderFilterUI(currentApiItem);
  updateEndpoint();
});

function getSelectedTimeOption(item) {
  const key = document.getElementById('filter-time-key')?.value || item.filter.default;
  return TIME_FILTER_OPTIONS[key];
}

function applyPageSizeLimits(item) {
  const input = document.getElementById('api-page-size');
  const note  = document.getElementById('api-page-size-note');
  const tokenWrap = document.getElementById('api-page-token-wrap');
  const limits = item.pageSize || { max: 10000, default: DEFAULT_PAGE_SIZE };
  input.max = limits.max;
  input.min = 1;
  input.value = Math.min(limits.default, limits.max);
  if (limits.max <= 25) {
    note.textContent = `※ ${item.id} は pageSize 最大 ${limits.max}（公式デフォルト ${limits.default}）`;
  } else {
    note.textContent = '※ 最大 10000';
  }
  if (tokenWrap) tokenWrap.style.display = item.filter ? 'flex' : 'none';
}

// ----- フィルターUI 生成（データタイプごとに変化） -----
function renderFilterUI(item) {
  apiFilterFields.innerHTML = '';
  const hintEl = document.getElementById('api-filter-hint');

  if (!item.filter) {
    apiFilterWrap.style.display = 'none';
    hintEl.textContent = '';
    return;
  }

  apiFilterWrap.style.display = 'flex';
  applyPageSizeLimits(item);

  const defaultKey = item.filter.default;
  const defaultOpt = TIME_FILTER_OPTIONS[defaultKey];

  let timeKeySelectHtml = '';
  if (item.filter.options.length > 1) {
    const opts = item.filter.options.map(key => {
      const o = TIME_FILTER_OPTIONS[key];
      const sel = key === defaultKey ? ' selected' : '';
      return `<option value="${key}"${sel}>${o.label}</option>`;
    }).join('');
    timeKeySelectHtml = `
      <div class="api-field">
        <label for="filter-time-key">時刻の種類</label>
        <select id="filter-time-key" class="api-select">${opts}</select>
      </div>`;
  } else {
    timeKeySelectHtml = `<input type="hidden" id="filter-time-key" value="${defaultKey}" />`;
  }

  hintEl.textContent = defaultOpt.hint;

  function buildTimeInputsHtml(opt) {
    const isUtc = opt.inputType === 'utc';
    const inputType = opt.inputWidget || (opt.inputType === 'date' ? 'date' : 'datetime-local');
    const { start: startVal, end: endVal } = defaultTimeRange(inputType);
    const startLabel = opt.rangeEnd
      ? (isUtc ? '開始 (以上・UTC)' : '開始 (以上)')
      : (isUtc ? '開始 (以上・UTC) のみ' : '開始 (以上) のみ');

    if (!opt.rangeEnd) {
      return `
        <div class="api-field">
          <label for="filter-start">${startLabel}</label>
          <input type="${inputType}" id="filter-start" class="api-input" value="${startVal}" />
          <input type="hidden" id="filter-end" value="${endVal}" />
        </div>`;
    }
    return `
      <div class="filter-date-row">
        <div class="api-field">
          <label for="filter-start">${startLabel}</label>
          <input type="${inputType}" id="filter-start" class="api-input" value="${startVal}" />
        </div>
        <div class="api-field">
          <label for="filter-end">${isUtc ? '終了 (未満・UTC)' : '終了 (未満)'}</label>
          <input type="${inputType}" id="filter-end" class="api-input" value="${endVal}" />
        </div>
      </div>`;
  }

  apiFilterFields.innerHTML = timeKeySelectHtml + `<div id="filter-time-inputs">${buildTimeInputsHtml(defaultOpt)}</div>`;

  const timeKeyEl = document.getElementById('filter-time-key');
  const inputsWrap = document.getElementById('filter-time-inputs');

  function onTimeKeyChange() {
    const opt = getSelectedTimeOption(item);
    hintEl.textContent = opt.hint;
    inputsWrap.innerHTML = buildTimeInputsHtml(opt);
    bindFilterInputListeners();
    updateEndpoint();
  }

  if (timeKeyEl.tagName === 'SELECT') {
    timeKeyEl.addEventListener('change', onTimeKeyChange);
  }

  bindFilterInputListeners();
}

function onQueryParamsChange() {
  clearPageToken();
  if (currentApiItem) updateEndpoint();
}

function bindFilterInputListeners() {
  document.querySelectorAll('#api-filter-fields input, #api-filter-fields select').forEach(el => {
    el.addEventListener('change', onQueryParamsChange);
    el.addEventListener('input', onQueryParamsChange);
  });
}

document.getElementById('api-page-size').addEventListener('change', onQueryParamsChange);
document.getElementById('api-page-size').addEventListener('input', onQueryParamsChange);
document.getElementById('api-page-token').addEventListener('input', () => {
  if (currentApiItem) updateEndpoint();
});
document.getElementById('api-page-token').addEventListener('change', () => {
  if (currentApiItem) updateEndpoint();
});

// ----- フィルター式 生成 -----
function buildFilter(item) {
  if (!item.filter) return null;

  const opt = getSelectedTimeOption(item);
  const startEl = document.getElementById('filter-start');
  const endEl   = document.getElementById('filter-end');
  if (!startEl || !endEl) return null;

  const startRaw = startEl.value;
  if (!startRaw) return null;

  const field = getFilterFieldForOption(item, opt);
  const path = `${field}.${opt.path}`;
  const startLit = formatFilterLiteral(startRaw, opt.inputType, false);

  if (!opt.rangeEnd) {
    return `${path} >= "${startLit}"`;
  }

  const endRaw = endEl.value;
  if (!endRaw) return null;
  const endLit = formatFilterLiteral(endRaw, opt.inputType, true);
  return `${path} >= "${startLit}" AND ${path} < "${endLit}"`;
}

function buildApiUrl(item) {
  const filter   = buildFilter(item);
  const pageSize = document.getElementById('api-page-size').value;
  const pageToken = document.getElementById('api-page-token')?.value.trim() || '';

  const url = new URL(BASE_URL + item.path);
  if (filter) url.searchParams.set('filter', filter);
  if (item.filter && pageSize) {
    const max = (item.pageSize && item.pageSize.max) || 10000;
    url.searchParams.set('pageSize', Math.min(Number(pageSize) || DEFAULT_PAGE_SIZE, max));
  }
  if (pageToken) url.searchParams.set('pageToken', pageToken);
  return url;
}

function clearPageToken() {
  const input = document.getElementById('api-page-token');
  if (input) input.value = '';
  hide(document.getElementById('api-pagination-bar'));
}

function showNextPageToken(token, note) {
  const bar = document.getElementById('api-pagination-bar');
  const preview = document.getElementById('api-next-page-token-preview');
  const noteEl = document.getElementById('api-pagination-note');
  if (!token) {
    hide(bar);
    return;
  }
  preview.textContent = token;
  if (note) {
    noteEl.textContent = note;
    show(noteEl);
  } else {
    noteEl.textContent = '';
    hide(noteEl);
  }
  show(bar);
}

// ----- エンドポイント URL & curl 生成 -----
function updateEndpoint() {
  if (!currentApiItem) return;

  const fullUrl = buildApiUrl(currentApiItem).toString();
  apiEndpointUrl.textContent = fullUrl;

  apiCurlCmd.textContent = buildCurlCommand(currentApiItem.method, fullUrl, cachedAccessToken);

  apiEndpointSection.style.display = 'block';
  showAuthFlowSection();
}

// ----- コピーボタン -----
document.getElementById('copy-endpoint-btn').addEventListener('click', () => {
  copyText(apiEndpointUrl.textContent);
});

document.getElementById('copy-curl-btn').addEventListener('click', () => {
  copyText(apiCurlCmd.textContent);
  const toast = document.getElementById('copy-curl-toast');
  show(toast);
  setTimeout(() => hide(toast), 2000);
});

function copyText(text) {
  navigator.clipboard.writeText(text).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  });
}

async function callHealthApi(requestUrl, accessToken) {
  return fetch(requestUrl, {
    method:  currentApiItem.method,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept':        'application/json',
    },
  });
}

function renderApiResponse(res, rawText, parsedBody, elapsed, requestUrl, pageTokenUsed) {
  const statusClass = res.ok ? 'ok' : 'err';
  const pageInfo = pageTokenUsed
    ? '<span class="response-time">pageToken 指定あり</span>'
    : '<span class="response-time">1ページ目</span>';
  let countInfo = '';
  if (parsedBody && typeof parsedBody === 'object') {
    const n = Array.isArray(parsedBody.dataPoints) ? parsedBody.dataPoints.length : null;
    if (n !== null) countInfo = `<span class="response-time">dataPoints: ${n} 件</span>`;
    if (parsedBody.nextPageToken) countInfo += '<span class="response-time">nextPageToken あり</span>';
  }
  apiResponseMeta.innerHTML = `
    <span class="response-status ${statusClass}">HTTP ${res.status} ${res.statusText}</span>
    <span class="response-time">${elapsed} ms</span>
    ${pageInfo}
    ${countInfo}`;

  apiResponseBody.textContent = formatResponseBodyDisplay(parsedBody, rawText);
  const debugEl = document.getElementById('api-response-debug');
  if (debugEl) {
    debugEl.textContent = formatResponseDebug(
      { method: currentApiItem.method, url: requestUrl },
      res, rawText, parsedBody, elapsed
    );
  }

  show(apiResponseResult);

  if (res.ok && parsedBody && typeof parsedBody === 'object' && parsedBody.nextPageToken) {
    const n = Array.isArray(parsedBody.dataPoints) ? parsedBody.dataPoints.length : 0;
    const note = n === 0
      ? 'dataPoints が空ですが nextPageToken があります。pageSize を増やすか「次のページを取得」を試してください。'
      : '「次のページを取得」で pageToken を付けて続きを取得できます。';
    showNextPageToken(parsedBody.nextPageToken, note);
    hideError(apiResponseError);
  } else {
    hide(document.getElementById('api-pagination-bar'));
    if (res.ok) hideError(apiResponseError);
  }

  if (!res.ok) {
    const errMsg = (parsedBody && typeof parsedBody === 'object' && parsedBody.error)
      ? (parsedBody.error.message || JSON.stringify(parsedBody.error))
      : res.statusText;
    let fullMsg = `API エラー (${res.status}): ${errMsg}`;
    if (res.status === 401) {
      fullMsg += '\n\nAccess Token の期限切れの可能性があります。「① トークン更新のみ実行」または再度「API を実行」で Refresh から取り直してください。';
    }
    showError(apiResponseError, fullMsg);
  }
}

['api-refresh-token', 'api-client-id', 'api-client-secret'].forEach(id => {
  document.getElementById(id).addEventListener('input', () => {
    cachedAccessToken = null;
    cachedAccessTokenExpiresAt = 0;
    const preview = document.getElementById('api-cached-access-token');
    if (preview) preview.textContent = '（未取得）';
    if (id === 'api-refresh-token') syncRefreshTokenPreview();
  });
});

// ----- API 実行（Refresh → Access → API） -----
async function executeApiRequest() {
  if (!currentApiItem) return;

  const url = buildApiUrl(currentApiItem);
  const requestUrl = url.toString();
  const pageTokenUsed = document.getElementById('api-page-token').value.trim();

  apiResponseSection.style.display = 'block';
  showAuthFlowSection();
  show(apiLoading);
  hide(apiResponseError);
  hide(apiResponseResult);
  hide(document.getElementById('api-pagination-bar'));
  setAuthFlowStep(2, 'active', '準備中...');
  apiResponseSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

  try {
    let accessToken = await refreshAccessToken(false);

    const startMs = Date.now();
    setAuthFlowStep(2, 'active', 'API 呼び出し中...');
    let res = await callHealthApi(requestUrl, accessToken);
    let elapsed = Date.now() - startMs;

    if (res.status === 401) {
      setAuthFlowStep(1, 'active', '401 のため再取得...');
      accessToken = await refreshAccessToken(true);
      const retryStart = Date.now();
      res = await callHealthApi(requestUrl, accessToken);
      elapsed = Date.now() - retryStart;
    }

    const rawText = await res.text();
    let parsedBody;
    try { parsedBody = rawText ? JSON.parse(rawText) : null; } catch { parsedBody = undefined; }

    hide(apiLoading);
    setAuthFlowStep(2, res.ok ? 'done' : 'error', res.ok ? `完了（${elapsed} ms）` : `失敗 HTTP ${res.status}`);
    renderApiResponse(res, rawText, parsedBody, elapsed, requestUrl, pageTokenUsed);

  } catch (err) {
    hide(apiLoading);
    setAuthFlowStep(2, 'error', `中断: ${err.message}`);
    showError(apiResponseError, err.message + '\n\n※ CORS制限がある場合は curl をターミナルで実行してください。');
    show(apiResponseResult);
    apiResponseMeta.innerHTML = '<span class="response-status err">エラー</span>';
    apiResponseBody.textContent = JSON.stringify({ error: err.message }, null, 2);
    hide(document.getElementById('api-pagination-bar'));
  }
}

document.getElementById('api-execute-btn').addEventListener('click', executeApiRequest);

document.getElementById('api-refresh-only-btn').addEventListener('click', async () => {
  showAuthFlowSection();
  hide(apiResponseError);
  try {
    await refreshAccessToken(true);
  } catch (err) {
    showError(apiResponseError, err.message);
  }
});

document.getElementById('api-fetch-next-btn').addEventListener('click', () => {
  const preview = document.getElementById('api-next-page-token-preview');
  const token = preview.textContent.trim();
  if (!token) return;
  document.getElementById('api-page-token').value = token;
  updateEndpoint();
  executeApiRequest();
});

document.getElementById('api-clear-page-token-btn').addEventListener('click', () => {
  clearPageToken();
  if (currentApiItem) updateEndpoint();
});
