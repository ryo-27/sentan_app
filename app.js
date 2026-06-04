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

// ----- データタイプ定義 -----
// filterType:
//   none     → パラメータなし (user系エンドポイント)
//   interval → interval.civil_start_time (steps, floors, distance, etc.)
//   sample   → sample_time.civil_time (heart-rate, weight, etc.)
//   daily    → .date (daily-* 系) ※フィルター名は snake_case (例: daily_heart_rate_variability)
//   session  → interval.civil_start_time (exercise, nutrition-log, etc.)
//   sleep    → interval.civil_end_time
//   ecg      → interval.start_time (UTC ISO8601)
//
// フィルター式のデータタイプ名 (公式 Endpoints):
//   URL パス → kebab-case (例: heart-rate-variability)
//   filter  → 複数語は snake_case (例: heart_rate_variability)、単語はそのまま (例: steps)
//   https://developers.google.com/health/endpoints

function kebabToSnake(str) {
  return str.replace(/-/g, '_');
}

/** @returns {string} filter 式の先頭セグメント（data type 識別子） */
function getFilterField(item) {
  return item.id.includes('-') ? kebabToSnake(item.id) : item.id;
}

const API_CATEGORIES = {
  user: {
    label: 'ユーザー情報',
    items: [
      { id: 'identity',     label: 'getIdentity (ユーザーID)', method: 'GET', path: '/v4/users/me/identity',     filterType: 'none' },
      { id: 'profile',      label: 'getProfile (プロフィール)',  method: 'GET', path: '/v4/users/me/profile',      filterType: 'none' },
      { id: 'settings',     label: 'getSettings (設定)',         method: 'GET', path: '/v4/users/me/settings',     filterType: 'none' },
      { id: 'pairedDevices',label: 'listPairedDevices (デバイス一覧)', method: 'GET', path: '/v4/users/me/pairedDevices', filterType: 'none' },
    ],
  },
  activity: {
    label: 'アクティビティ & フィットネス',
    items: [
      { id: 'steps',               label: '歩数 (steps)',                       method: 'GET', path: '/v4/users/me/dataTypes/steps/dataPoints',                filterType: 'interval' },
      { id: 'floors',              label: '階数 (floors)',                      method: 'GET', path: '/v4/users/me/dataTypes/floors/dataPoints',               filterType: 'interval' },
      { id: 'distance',            label: '距離 (distance)',                    method: 'GET', path: '/v4/users/me/dataTypes/distance/dataPoints',             filterType: 'interval' },
      { id: 'altitude',            label: '高度 (altitude)',                    method: 'GET', path: '/v4/users/me/dataTypes/altitude/dataPoints',             filterType: 'interval' },
      { id: 'active-zone-minutes', label: 'アクティブゾーン分 (active-zone-minutes)', method: 'GET', path: '/v4/users/me/dataTypes/active-zone-minutes/dataPoints', filterType: 'interval' },
      { id: 'active-minutes',      label: 'アクティブ分 (active-minutes)',      method: 'GET', path: '/v4/users/me/dataTypes/active-minutes/dataPoints',      filterType: 'interval' },
      { id: 'active-energy-burned',label: '消費カロリー (active-energy-burned)', method: 'GET', path: '/v4/users/me/dataTypes/active-energy-burned/dataPoints', filterType: 'interval' },
      { id: 'sedentary-period',    label: '座位時間 (sedentary-period)',        method: 'GET', path: '/v4/users/me/dataTypes/sedentary-period/dataPoints',    filterType: 'interval' },
      { id: 'swim-lengths-data',   label: '水泳ラップ (swim-lengths-data)',      method: 'GET', path: '/v4/users/me/dataTypes/swim-lengths-data/dataPoints',   filterType: 'interval' },
      { id: 'time-in-heart-rate-zone', label: '心拍ゾーン時間 (time-in-heart-rate-zone)', method: 'GET', path: '/v4/users/me/dataTypes/time-in-heart-rate-zone/dataPoints', filterType: 'interval' },
      { id: 'activity-level',      label: '活動レベル (activity-level)',        method: 'GET', path: '/v4/users/me/dataTypes/activity-level/dataPoints',      filterType: 'daily' },
    ],
  },
  heart: {
    label: '心拍',
    items: [
      { id: 'heart-rate',                 label: '心拍数 (heart-rate)',                          method: 'GET', path: '/v4/users/me/dataTypes/heart-rate/dataPoints',                  filterType: 'sample' },
      { id: 'heart-rate-variability',     label: '心拍変動 (heart-rate-variability)',             method: 'GET', path: '/v4/users/me/dataTypes/heart-rate-variability/dataPoints',      filterType: 'sample' },
      { id: 'daily-resting-heart-rate',   label: '安静時心拍数 (daily-resting-heart-rate)',       method: 'GET', path: '/v4/users/me/dataTypes/daily-resting-heart-rate/dataPoints',   filterType: 'daily' },
      { id: 'daily-heart-rate-variability',label: '日次心拍変動 (daily-heart-rate-variability)', method: 'GET', path: '/v4/users/me/dataTypes/daily-heart-rate-variability/dataPoints', filterType: 'daily' },
      { id: 'daily-heart-rate-zones',     label: '日次心拍ゾーン (daily-heart-rate-zones)',       method: 'GET', path: '/v4/users/me/dataTypes/daily-heart-rate-zones/dataPoints',     filterType: 'daily' },
      { id: 'irregular-rhythm-notification', label: '不整脈通知 (irregular-rhythm-notification)', method: 'GET', path: '/v4/users/me/dataTypes/irregular-rhythm-notification/dataPoints', filterType: 'session' },
      { id: 'electrocardiogram',          label: '心電図 (electrocardiogram)',                    method: 'GET', path: '/v4/users/me/dataTypes/electrocardiogram/dataPoints',           filterType: 'ecg' },
    ],
  },
  sleep: {
    label: '睡眠',
    items: [
      { id: 'sleep',                            label: '睡眠セッション (sleep)',                           method: 'GET', path: '/v4/users/me/dataTypes/sleep/dataPoints',                          filterType: 'sleep' },
      { id: 'daily-sleep-temperature-derivations', label: '睡眠体温変化 (daily-sleep-temperature-derivations)', method: 'GET', path: '/v4/users/me/dataTypes/daily-sleep-temperature-derivations/dataPoints', filterType: 'daily' },
      { id: 'respiratory-rate-sleep-summary',   label: '睡眠呼吸数 (respiratory-rate-sleep-summary)',    method: 'GET', path: '/v4/users/me/dataTypes/respiratory-rate-sleep-summary/dataPoints', filterType: 'sample' },
      { id: 'daily-respiratory-rate',           label: '日次呼吸数 (daily-respiratory-rate)',            method: 'GET', path: '/v4/users/me/dataTypes/daily-respiratory-rate/dataPoints',       filterType: 'daily' },
    ],
  },
  body: {
    label: '体組成',
    items: [
      { id: 'weight',    label: '体重 (weight)',       method: 'GET', path: '/v4/users/me/dataTypes/weight/dataPoints',     filterType: 'sample' },
      { id: 'body-fat',  label: '体脂肪率 (body-fat)', method: 'GET', path: '/v4/users/me/dataTypes/body-fat/dataPoints',   filterType: 'sample' },
      { id: 'height',    label: '身長 (height)',       method: 'GET', path: '/v4/users/me/dataTypes/height/dataPoints',     filterType: 'sample' },
    ],
  },
  health: {
    label: '健康指標',
    items: [
      { id: 'oxygen-saturation',       label: '血中酸素濃度 (oxygen-saturation)',         method: 'GET', path: '/v4/users/me/dataTypes/oxygen-saturation/dataPoints',       filterType: 'sample' },
      { id: 'daily-oxygen-saturation', label: '日次血中酸素 (daily-oxygen-saturation)',   method: 'GET', path: '/v4/users/me/dataTypes/daily-oxygen-saturation/dataPoints', filterType: 'daily' },
      { id: 'vo2-max',                 label: 'VO2Max (vo2-max)',                         method: 'GET', path: '/v4/users/me/dataTypes/vo2-max/dataPoints',                 filterType: 'sample' },
      { id: 'run-vo2-max',             label: 'ランニングVO2Max (run-vo2-max)',            method: 'GET', path: '/v4/users/me/dataTypes/run-vo2-max/dataPoints',             filterType: 'sample' },
      { id: 'daily-vo2-max',           label: '日次VO2Max (daily-vo2-max)',               method: 'GET', path: '/v4/users/me/dataTypes/daily-vo2-max/dataPoints',           filterType: 'daily' },
      { id: 'core-body-temperature',   label: '体温 (core-body-temperature)',             method: 'GET', path: '/v4/users/me/dataTypes/core-body-temperature/dataPoints',   filterType: 'sample' },
      { id: 'blood-glucose',           label: '血糖値 (blood-glucose)',                   method: 'GET', path: '/v4/users/me/dataTypes/blood-glucose/dataPoints',           filterType: 'sample' },
    ],
  },
  exercise: {
    label: 'エクササイズ',
    items: [
      { id: 'exercise', label: 'エクササイズセッション (exercise)', method: 'GET', path: '/v4/users/me/dataTypes/exercise/dataPoints', filterType: 'session' },
    ],
  },
  nutrition: {
    label: '栄養 & 水分',
    items: [
      { id: 'nutrition-log',  label: '栄養ログ (nutrition-log)',  method: 'GET', path: '/v4/users/me/dataTypes/nutrition-log/dataPoints',  filterType: 'session' },
      { id: 'hydration-log',  label: '水分ログ (hydration-log)',  method: 'GET', path: '/v4/users/me/dataTypes/hydration-log/dataPoints',  filterType: 'session' },
    ],
  },
};

// ----- デフォルト日付 (昨日〜今日) -----
function defaultDates() {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const yesterday = new Date(now - 86400000).toISOString().slice(0, 10);
  return { start: yesterday, end: today };
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

  renderFilterUI(currentApiItem);
  updateEndpoint();
});

// ----- フィルターUI 生成 -----
function renderFilterUI(item) {
  apiFilterFields.innerHTML = '';
  const { filterType } = item;

  if (filterType === 'none') {
    apiFilterWrap.style.display = 'none';
    return;
  }

  apiFilterWrap.style.display = 'flex';
  const { start, end } = defaultDates();

  if (filterType === 'daily') {
    apiFilterFields.innerHTML = `
      <div class="filter-date-row">
        <div class="api-field">
          <label>開始日 (以上)</label>
          <input type="date" id="filter-start" class="api-input" value="${start}" />
        </div>
        <div class="api-field">
          <label>終了日 (未満)</label>
          <input type="date" id="filter-end" class="api-input" value="${end}" />
        </div>
      </div>`;
  } else if (filterType === 'ecg') {
    apiFilterFields.innerHTML = `
      <div class="api-field">
        <label>開始日 (以上・UTC) ※ECGは終了日フィルター非対応</label>
        <input type="date" id="filter-start" class="api-input" value="${start}" />
        <input type="hidden" id="filter-end" value="${end}" />
      </div>`;
  } else {
    // interval / sample / session / sleep
    apiFilterFields.innerHTML = `
      <div class="filter-date-row">
        <div class="api-field">
          <label>開始日 (以上)</label>
          <input type="date" id="filter-start" class="api-input" value="${start}" />
        </div>
        <div class="api-field">
          <label>終了日 (未満)</label>
          <input type="date" id="filter-end" class="api-input" value="${end}" />
        </div>
      </div>`;
  }

  // 入力変更時にエンドポイント再生成
  apiFilterFields.querySelectorAll('input').forEach(inp => {
    inp.addEventListener('change', updateEndpoint);
    inp.addEventListener('input', updateEndpoint);
  });
  document.getElementById('api-page-size').addEventListener('change', updateEndpoint);
}

// ----- フィルター式 生成 -----
function buildFilter(item) {
  const { filterType } = item;
  if (filterType === 'none') return null;

  const startEl = document.getElementById('filter-start');
  const endEl   = document.getElementById('filter-end');
  if (!startEl || !endEl) return null;

  const startVal = startEl.value;
  const endVal   = endEl.value;
  if (!startVal || !endVal) return null;

  const field = getFilterField(item);

  switch (filterType) {
    case 'interval':
    case 'session':
      return `${field}.interval.civil_start_time >= "${startVal}" AND ${field}.interval.civil_start_time < "${endVal}"`;
    case 'sample':
      return `${field}.sample_time.civil_time >= "${startVal}" AND ${field}.sample_time.civil_time < "${endVal}"`;
    case 'daily':
      return `${field}.date >= "${startVal}" AND ${field}.date < "${endVal}"`;
    case 'sleep':
      return `sleep.interval.civil_end_time >= "${startVal}" AND sleep.interval.civil_end_time < "${endVal}"`;
    case 'ecg':
      // ECG は start_time の >= のみサポート（公式: end_time フィルター非対応）
      return `electrocardiogram.interval.start_time >= "${startVal}T00:00:00Z"`;
    default:
      return null;
  }
}

// ----- エンドポイント URL & curl 生成 -----
function updateEndpoint() {
  if (!currentApiItem) return;

  const accessToken = document.getElementById('api-access-token').value.trim();
  const filter      = buildFilter(currentApiItem);
  const pageSize    = document.getElementById('api-page-size').value;

  const url = new URL(BASE_URL + currentApiItem.path);
  if (filter) url.searchParams.set('filter', filter);
  if (currentApiItem.filterType !== 'none' && pageSize) {
    url.searchParams.set('pageSize', pageSize);
  }

  const fullUrl = url.toString();
  apiEndpointUrl.textContent = fullUrl;

  // curl コマンド
  const tokenDisplay = accessToken || 'YOUR_ACCESS_TOKEN';
  const curlLines = [
    `curl -X ${currentApiItem.method} \\`,
    `  -H "Authorization: Bearer ${tokenDisplay}" \\`,
    `  -H "Content-Type: application/json" \\`,
    `  "${fullUrl}"`,
  ];
  apiCurlCmd.textContent = curlLines.join('\n');

  apiEndpointSection.style.display = 'block';
}

// アクセストークン変更でも curl を更新
document.getElementById('api-access-token').addEventListener('input', () => {
  if (currentApiItem) updateEndpoint();
});

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

// ----- API 実行 -----
document.getElementById('api-execute-btn').addEventListener('click', async () => {
  if (!currentApiItem) return;

  const accessToken = document.getElementById('api-access-token').value.trim();
  if (!accessToken) {
    alert('Access Token を入力してください。');
    return;
  }

  const filter   = buildFilter(currentApiItem);
  const pageSize = document.getElementById('api-page-size').value;
  const url      = new URL(BASE_URL + currentApiItem.path);
  if (filter) url.searchParams.set('filter', filter);
  if (currentApiItem.filterType !== 'none' && pageSize) {
    url.searchParams.set('pageSize', pageSize);
  }

  apiResponseSection.style.display = 'block';
  show(apiLoading);
  hide(apiResponseError);
  hide(apiResponseResult);
  apiResponseSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const startMs = Date.now();

  try {
    const res = await fetch(url.toString(), {
      method:  currentApiItem.method,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type':  'application/json',
      },
    });

    const elapsed = Date.now() - startMs;
    let body;
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      body = await res.json();
    } else {
      body = await res.text();
    }

    hide(apiLoading);

    const statusClass = res.ok ? 'ok' : 'err';
    apiResponseMeta.innerHTML = `
      <span class="response-status ${statusClass}">HTTP ${res.status} ${res.statusText}</span>
      <span class="response-time">${elapsed} ms</span>`;

    apiResponseBody.textContent = typeof body === 'string'
      ? body
      : JSON.stringify(body, null, 2);

    show(apiResponseResult);

    if (!res.ok) {
      const errMsg = (typeof body === 'object' && body.error)
        ? (body.error.message || JSON.stringify(body.error))
        : res.statusText;
      showError(apiResponseError, `API エラー (${res.status}): ${errMsg}`);
    }

  } catch (err) {
    hide(apiLoading);
    showError(apiResponseError, `ネットワークエラー: ${err.message}\n\n※ CORS制限がある場合は curl コマンドをターミナルで直接実行してください。`);
    show(apiResponseResult);
    apiResponseMeta.innerHTML = '<span class="response-status err">ネットワークエラー</span>';
    apiResponseBody.textContent = '';
  }
});
