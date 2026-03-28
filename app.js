const STORAGE_KEYS = {
  apiBase: "kkomo-pages:api-base",
  token: "kkomo-pages:session-token",
  tab: "kkomo-pages:last-tab",
  snapshot: "kkomo-pages:last-snapshot",
  ui: "kkomo-pages:ui-state"
};

const DEFAULT_TABS = ["profile", "gacha", "collection", "customize"];
const RARITY_ORDER = ["common", "rare", "epic", "legendary"];
const DEFAULT_API_BASE = "https://kakao-study-groupbot-dev-inxmplcjia-du.a.run.app";

const app = document.getElementById("app");
const toastEl = createToast();
let toastTimer = null;

const state = {
  mode: "public",
  apiBase: readInitialApiBase(),
  token: window.localStorage.getItem(STORAGE_KEYS.token) ?? "",
  activeTab: readStoredText(STORAGE_KEYS.tab, "profile"),
  loading: false,
  sessionStatus: "idle",
  sessionMessage: "",
  sessionExpiresAt: 0,
  me: readStoredJson(STORAGE_KEYS.snapshot)?.me ?? null,
  collection: readStoredJson(STORAGE_KEYS.snapshot)?.collection ?? null,
  rewards: readStoredJson(STORAGE_KEYS.snapshot)?.rewards ?? null,
  drawResult: null,
  lastError: "",
  draftCode: new URLSearchParams(window.location.search).get("code") ?? ""
};

boot();

function boot() {
  wireEvents();
  hydrateFromQuery();
  render();
  void syncSessionAndData();
}

function wireEvents() {
  app.addEventListener("click", onAppClick);
  app.addEventListener("submit", onAppSubmit);
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      state.drawResult = null;
      render();
    }
  });
}

function readInitialApiBase() {
  const params = new URLSearchParams(window.location.search);
  const explicit = params.get("apiBase")?.trim();
  if (explicit) {
    window.localStorage.setItem(STORAGE_KEYS.apiBase, explicit);
    return explicit;
  }
  return window.localStorage.getItem(STORAGE_KEYS.apiBase) ?? DEFAULT_API_BASE;
}

function readStoredText(key, fallback) {
  const value = window.localStorage.getItem(key)?.trim();
  return value || fallback;
}

function readStoredJson(key) {
  const raw = window.localStorage.getItem(key);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeStoredJson(key, value) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

function hydrateFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const tab = params.get("tab");
  if (tab && DEFAULT_TABS.includes(tab)) {
    state.activeTab = tab;
  }
  if (params.get("mode") === "player" || params.has("code") || state.token) {
    state.mode = "player";
  }
}

function createToast() {
  const node = document.createElement("div");
  node.className = "toast";
  document.body.appendChild(node);
  return node;
}

function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl.classList.remove("show"), 2200);
}

function onAppClick(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const tabButton = target.closest("[data-tab]");
  if (tabButton instanceof HTMLElement) {
    state.activeTab = tabButton.dataset.tab ?? "profile";
    window.localStorage.setItem(STORAGE_KEYS.tab, state.activeTab);
    render();
    return;
  }

  const action = target.closest("[data-action]");
  if (!(action instanceof HTMLElement)) {
    return;
  }

  const name = action.dataset.action;
  if (name === "save-api-base") {
    const input = document.querySelector("[data-field='api-base']");
    if (input instanceof HTMLInputElement) {
      state.apiBase = normalizeApiBase(input.value);
      window.localStorage.setItem(STORAGE_KEYS.apiBase, state.apiBase);
      showToast("API 주소를 저장했어요.");
      render();
      void syncSessionAndData();
    }
    return;
  }

  if (name === "clear-session") {
    clearSession();
    return;
  }

  if (name === "reload-data") {
    void syncSessionAndData(true);
    return;
  }

  if (name === "draw-gacha") {
    void drawGacha();
    return;
  }

  if (name === "customize-save") {
    void saveCustomization();
    return;
  }

  if (name === "copy-link") {
    void copySessionLink();
    return;
  }
}

function onAppSubmit(event) {
  const target = event.target;
  if (!(target instanceof HTMLFormElement)) {
    return;
  }

  event.preventDefault();
  const formType = target.dataset.form;
  if (formType === "connect") {
    void connectSession(target);
  }
}

function normalizeApiBase(raw) {
  const trimmed = raw.trim().replace(/\/+$/u, "");
  if (!trimmed) {
    return window.location.origin;
  }
  return trimmed;
}

function apiUrl(path) {
  return `${state.apiBase}${path}`;
}

async function apiFetch(path, options = {}) {
  const headers = new Headers(options.headers ?? {});
  if (!headers.has("Content-Type") && options.body && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (state.token) {
    headers.set("Authorization", `Bearer ${state.token}`);
  }
  const response = await fetch(apiUrl(path), {
    ...options,
    headers,
    credentials: "omit"
  });
  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  if (!response.ok) {
    const message =
      (body && typeof body === "object" && "error" in body && typeof body.error === "string" && body.error) ||
      `http_${response.status}`;
    const error = new Error(message);
    error.responseBody = body;
    throw error;
  }
  return body;
}

function normalizeSessionPayload(payload) {
  const data = payload?.data ?? payload ?? {};
  const token =
    data.sessionToken ?? data.token ?? data.accessToken ?? data.webToken ?? data.session?.token ?? data.sessionTokenValue ?? "";
  const expiresAt =
    Number(data.expiresAt ?? data.expireAt ?? data.session?.expiresAt ?? data.sessionExpiresAt ?? 0) || 0;
  const userName =
    data.profile?.displayName ??
    data.displayName ??
    data.profile?.nickname ??
    data.nickname ??
    data.userName ??
    "";
  return { token, expiresAt, userName };
}

function normalizeMe(payload) {
  const data = payload?.data ?? payload ?? {};
  const profile = data.profile ?? data.me ?? data;
  return {
    playerName: profile.displayName ?? profile.nickname ?? data.displayName ?? "꼬모 플레이어",
    schoolStage: profile.schoolStage ?? data.schoolStage ?? "general",
    gradeLabel: profile.gradeLabel ?? data.gradeLabel ?? "자동 맞춤",
    todayRecord: profile.todayRecord ?? data.todayRecord ?? "오늘 기록 없음",
    todayTotalScore: numberOrZero(profile.todayTotalScore ?? data.todayTotalScore ?? 0),
    totalXp: numberOrZero(profile.totalXp ?? data.totalXp ?? 0),
    tickets: {
      general: numberOrZero(profile.inventory?.normal ?? data.inventory?.normal ?? data.normalTickets ?? 0),
      special: numberOrZero(profile.inventory?.special ?? data.inventory?.special ?? data.specialTickets ?? 0),
      shards: numberOrZero(profile.inventory?.shards ?? data.inventory?.shards ?? data.shards ?? 0)
    },
    customization: {
      representativeKkomo: profile.customization?.featuredKkomoId ?? data.customization?.featuredKkomoId ?? "default",
      representativeFrame: profile.customization?.frameId ?? data.customization?.frameId ?? "none"
    },
    summary:
      profile.summary ??
      data.summary ?? {
        missionStatus: "참여 우선",
        collectionCount: data.collectionCount ?? 0
      }
  };
}

function normalizeCollection(payload) {
  const data = payload?.data ?? payload ?? {};
  const items = Array.isArray(data.items)
    ? data.items
    : Array.isArray(data.collection)
      ? data.collection
      : data.collection && typeof data.collection === "object"
        ? Object.values(data.collection.entries ?? {})
        : [];
  return items.map((item, index) => ({
    id: item.id ?? item.kkomoId ?? `kkomo-${index}`,
    name: item.name ?? item.title ?? `꼬모 ${index + 1}`,
    rarity: normalizeRarity(item.rarity ?? item.rank ?? "common"),
    icon: item.icon ?? item.emoji ?? item.symbol ?? "◌",
    acquiredAt: item.acquiredAt ?? item.obtainedAt ?? null,
    duplicateCount: numberOrZero(item.duplicateCount ?? item.duplicates ?? 0),
    favorite: Boolean(item.favorite ?? item.isFavorite)
  }));
}

function normalizeRewards(payload) {
  const data = payload?.data ?? payload ?? {};
  const list = Array.isArray(data.items) ? data.items : Array.isArray(data.ledger) ? data.ledger : [];
  return list.map((item, index) => ({
    id: item.id ?? `${index}`,
    title: item.title ?? item.reason ?? "보상",
    amount: numberOrZero(item.amount ?? item.delta ?? 0),
    type: item.type ?? item.category ?? "general",
    createdAt: item.createdAt ?? item.earnedAt ?? null
  }));
}

function normalizeRarity(value) {
  const normalized = String(value ?? "common").toLowerCase();
  return RARITY_ORDER.includes(normalized) ? normalized : "common";
}

function numberOrZero(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function syncSessionAndData(silent = false) {
  state.loading = true;
  state.lastError = "";
  render();
  try {
    const code = state.draftCode || new URLSearchParams(window.location.search).get("code") || "";
    if (code) {
      await exchangeSession(code);
      clearQueryParam("code");
      state.draftCode = "";
    }
    if (state.token) {
      await Promise.all([loadMe(), loadCollection(), loadRewards()]);
      state.mode = "player";
    } else if (state.mode === "player") {
      await loadCachedPlayerPreview();
    }
  } catch (error) {
    state.lastError = error instanceof Error ? error.message : "unknown_error";
    if (!silent) {
      showToast("연결을 불러오지 못했어요.");
    }
  } finally {
    state.loading = false;
    render();
  }
}

async function exchangeSession(code) {
  const payload = await apiFetch("/api/web/session/exchange", {
    method: "POST",
    body: JSON.stringify({ code })
  });
  const normalized = normalizeSessionPayload(payload);
  if (normalized.token) {
    state.token = normalized.token;
    window.localStorage.setItem(STORAGE_KEYS.token, normalized.token);
  }
  if (normalized.expiresAt) {
    state.sessionExpiresAt = normalized.expiresAt;
  }
  if (normalized.userName) {
    showToast(`${normalized.userName} 연결 완료`);
  } else {
    showToast("연결 완료");
  }
  state.sessionStatus = "connected";
}

async function loadMe() {
  const payload = await apiFetch("/api/web/me");
  state.me = normalizeMe(payload);
  persistSnapshot();
}

async function loadCollection() {
  const payload = await apiFetch("/api/web/collection");
  state.collection = normalizeCollection(payload);
  persistSnapshot();
}

async function loadRewards() {
  const payload = await apiFetch("/api/web/rewards");
  state.rewards = normalizeRewards(payload);
  persistSnapshot();
}

async function loadCachedPlayerPreview() {
  const snapshot = readStoredJson(STORAGE_KEYS.snapshot);
  if (!snapshot) {
    return;
  }
  state.me = snapshot.me ?? state.me;
  state.collection = snapshot.collection ?? state.collection;
  state.rewards = snapshot.rewards ?? state.rewards;
}

function persistSnapshot() {
  writeStoredJson(STORAGE_KEYS.snapshot, {
    me: state.me,
    collection: state.collection,
    rewards: state.rewards,
    savedAt: Date.now()
  });
}

async function connectSession(form) {
  const apiBaseField = form.querySelector("[name='apiBase']");
  const codeField = form.querySelector("[name='code']");
  if (apiBaseField instanceof HTMLInputElement) {
    state.apiBase = normalizeApiBase(apiBaseField.value);
    window.localStorage.setItem(STORAGE_KEYS.apiBase, state.apiBase);
  }
  if (codeField instanceof HTMLInputElement) {
    state.draftCode = codeField.value.trim();
  }
  await syncSessionAndData();
}

async function drawGacha() {
  if (!state.token) {
    showToast("먼저 연결 링크로 들어와야 해요.");
    return;
  }
  try {
    const payload = await apiFetch("/api/web/gacha/draw", {
      method: "POST",
      body: JSON.stringify({
        ticketType: document.querySelector("[name='ticketType']")?.value ?? "normal"
      })
    });
    state.drawResult = payload?.data ?? payload ?? null;
    showToast("뽑기 완료");
    await Promise.all([loadMe(), loadCollection(), loadRewards()]);
    render();
  } catch (error) {
    state.lastError = error instanceof Error ? error.message : "draw_failed";
    showToast("뽑기를 실행하지 못했어요.");
    render();
  }
}

async function saveCustomization() {
  if (!state.token) {
    showToast("먼저 연결 링크로 들어와야 해요.");
    return;
  }
  const form = document.querySelector("[data-form='customize']");
  if (!(form instanceof HTMLFormElement)) {
    return;
  }
  const representativeKkomo = form.querySelector("[name='representativeKkomo']");
  const representativeFrame = form.querySelector("[name='representativeFrame']");
  try {
    const payload = await apiFetch("/api/web/profile/customize", {
      method: "POST",
      body: JSON.stringify({
        featuredKkomoId: representativeKkomo instanceof HTMLSelectElement ? representativeKkomo.value : "default",
        frameId: representativeFrame instanceof HTMLSelectElement ? representativeFrame.value : "none"
      })
    });
    const customization = payload?.data?.customization ?? payload?.data ?? payload?.customization ?? payload ?? null;
    if (state.me && customization) {
      state.me.customization = {
        representativeKkomo: customization.featuredKkomoId ?? state.me.customization?.representativeKkomo ?? "default",
        representativeFrame: customization.frameId ?? state.me.customization?.representativeFrame ?? "none"
      };
      persistSnapshot();
    }
    showToast("꾸미기를 저장했어요.");
    render();
  } catch (error) {
    state.lastError = error instanceof Error ? error.message : "customize_failed";
    showToast("꾸미기를 저장하지 못했어요.");
  }
}

async function copySessionLink() {
  const code = state.draftCode || new URLSearchParams(window.location.search).get("code") || "";
  const params = new URLSearchParams();
  params.set("mode", "player");
  if (code) {
    params.set("code", code);
  }
  if (state.apiBase) {
    params.set("apiBase", state.apiBase);
  }
  const link = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
  try {
    await navigator.clipboard.writeText(link);
    showToast("플레이어 링크를 복사했어요.");
  } catch {
    showToast(link);
  }
}

function clearSession() {
  state.token = "";
  state.me = null;
  state.collection = null;
  state.rewards = null;
  state.drawResult = null;
  state.sessionStatus = "idle";
  state.sessionMessage = "";
  state.sessionExpiresAt = 0;
  window.localStorage.removeItem(STORAGE_KEYS.token);
  window.localStorage.removeItem(STORAGE_KEYS.snapshot);
  state.mode = "public";
  render();
  showToast("연결을 해제했어요.");
}

function clearQueryParam(name) {
  const url = new URL(window.location.href);
  url.searchParams.delete(name);
  window.history.replaceState({}, "", `${url.pathname}${url.search ? `?${url.searchParams.toString()}` : ""}`);
}

function buildPage() {
  if (state.mode === "player") {
    return renderPlayerPage();
  }
  return renderPublicPage();
}

function renderPublicPage() {
  const cached = state.me;
  const hasPreview = Boolean(cached);
  return `
    <main class="page">
      <div class="container">
        <div class="topbar">
          <div class="brand">
            <div class="brand-mark">꼬</div>
            <div class="brand-copy">
              <strong>꼬모</strong>
              <span>공식 웹사이트 · 질문 · 퀴즈 · 프로필 · 뽑기</span>
            </div>
          </div>
          <div class="status-pill ok">GitHub Pages · Kkomo official</div>
        </div>

        <section class="shell">
          <section class="hero">
            <div class="official-banner">
              <span class="tiny-pill">공식 웹사이트</span>
              <span class="tiny-pill">Signed link player mode</span>
            </div>
            <p class="eyebrow">공개 랜딩 / 플레이어 모드</p>
            <h1>카톡에서 이어진 공부를<br /><span class="marker">웹에서 모아 정리한다.</span></h1>
            <p>
              꼬모는 초·중·고 교과 흐름을 유지하면서 질문, 퀴즈, 프로필을 한 번에 이어주는 학습 봇이에요.
              이제 웹에서는 내가 모은 꼬모, 받은 보상, 대표 꾸미기를 한 화면에서 볼 수 있어요.
            </p>
            <div class="hero-actions">
              <a class="button primary" href="#how-it-works">서비스 보기</a>
              <a class="button secondary" href="#player-connect">플레이어 모드 연결</a>
            </div>

            <div class="proof-row">
              <article class="proof-card">
                <strong>참여 우선</strong>
                <p>정답률보다 출석, 연속 참여, 복습과 기여를 더 크게 반영해요.</p>
              </article>
              <article class="proof-card">
                <strong>서명 링크</strong>
                <p>카카오에서 받은 1회성 코드로 플레이어 모드가 열려요.</p>
              </article>
              <article class="proof-card">
                <strong>중복 전환</strong>
                <p>같은 꼬모는 자동으로 파편으로 바뀌고, 다음 성장 재화가 돼요.</p>
              </article>
            </div>
          </section>

          <section class="auth-card" id="player-connect">
            <p class="eyebrow">플레이어 모드</p>
            <h2>카카오에서 받은 링크를 붙이면<br />프로필과 컬렉션이 열려요.</h2>
            <p class="subtle" style="margin-top:10px">
              GitHub Pages는 공개 웹이고, 실제 데이터는 백엔드 API와 연결해 보여줍니다.
            </p>
            <form class="auth-form" data-form="connect">
              <div class="field">
                <label for="apiBase">API 주소</label>
                <input id="apiBase" name="apiBase" data-field="api-base" value="${escapeAttribute(state.apiBase)}" placeholder="https://api.example.com" />
              </div>
              <div class="field">
                <label for="code">서명 코드</label>
                <input id="code" name="code" placeholder="카카오에서 받은 one-time code" value="${escapeAttribute(state.draftCode)}" />
              </div>
              <div class="button-row">
                <button class="button primary" type="submit">연결하기</button>
                <button class="button secondary" type="button" data-action="save-api-base">API 저장</button>
                <button class="button secondary" type="button" data-action="copy-link">링크 복사</button>
              </div>
              <p class="footnote">
                session exchange, profile, collection, gacha, customize, rewards API를 순서대로 읽어요.
              </p>
            </form>
          </section>
        </section>

        <section class="section" id="how-it-works">
          <div class="section-head">
            <div>
              <p class="eyebrow">한눈에 보기</p>
              <h2>꼬모 웹은 이렇게 흘러가요.</h2>
            </div>
            <p>기본은 공개 랜딩, 실제 데이터는 서명 링크로 들어간 플레이어 모드에서 열립니다.</p>
          </div>

          <div class="feature-grid">
            <article class="feature-card">
              <strong>프로필</strong>
              <p>학교급, 오늘 기록, 총점, 대표 꼬모, 프레임을 한 번에 봅니다.</p>
              <div class="code-line">카카오에서 받은 링크로 들어오면 프로필이 열려요.</div>
            </article>
            <article class="feature-card">
              <strong>뽑기</strong>
              <p>일반권과 특별권으로 꼬모를 뽑고, 중복은 파편으로 바뀝니다.</p>
              <div class="code-line">참여 보상으로 뽑기권을 모아요.</div>
            </article>
            <article class="feature-card">
              <strong>컬렉션</strong>
              <p>획득한 꼬모를 rarity별로 모아 보고, 잠금 상태도 함께 확인합니다.</p>
              <div class="code-line">신규 획득 꼬모는 바로 표시됩니다.</div>
            </article>
          </div>
        </section>

        <section class="section">
          <div class="section-head">
            <div>
              <p class="eyebrow">미리보기</p>
              <h2>웹에서 보게 될 화면은<br />이런 느낌이에요.</h2>
            </div>
            <p>아직 연결되지 않아도 구조는 먼저 보여줄 수 있어요.</p>
          </div>

          <div class="preview-stage">
            <div class="preview-orbit">
              <div class="preview-tag tag-a">학습 기록</div>
              <div class="preview-tag tag-b">꼬모 도감</div>
              <div class="preview-tag tag-c">참여 보상</div>
            </div>
            ${hasPreview ? renderPreviewCard(cached) : renderEmptyPreview()}
          </div>
        </section>

        <section class="support-section">
          <div class="support-box" style="padding:20px">
            <div class="section-title">
              <h3>설정 상태</h3>
              <div class="actions">
                <span class="inline-badge">${state.apiBase ? `API ${escapeHtml(state.apiBase)}` : "API 미설정"}</span>
                <span class="inline-badge">${state.token ? "세션 있음" : "세션 없음"}</span>
              </div>
            </div>
            <p class="subtle">
              플레이어 모드로 들어가려면 카카오봇이 발급한 서명 코드가 필요해요. 같은 링크를 다시 쓰면 세션 만료 규칙에 따라 재연결이 필요할 수 있어요.
            </p>
          </div>
        </section>
      </div>
    </main>
  `;
}

function renderPlayerPage() {
  const me = state.me;
  const collection = state.collection ?? [];
  const rewards = state.rewards ?? [];
  const drawResult = state.drawResult;
  const inventory = me?.tickets ?? { general: 0, special: 0, shards: 0 };
  const summaryLine = me
    ? `${me.playerName} · ${me.gradeLabel ?? "자동 맞춤"} · ${me.schoolStage ?? "general"}`
    : "연결 대기";

  return `
    <main class="page">
      <div class="container">
        <div class="topbar">
          <div class="brand">
            <div class="brand-mark">꼬</div>
            <div class="brand-copy">
              <strong>꼬모 플레이어</strong>
              <span>${escapeHtml(summaryLine)}</span>
            </div>
          </div>
          <div class="tab-actions">
            <span class="status-pill ${state.loading ? "warn" : state.token ? "ok" : "warn"}">${state.loading ? "동기화 중" : state.token ? "연결됨" : "연결 필요"}</span>
            <button class="button secondary" type="button" data-action="reload-data">새로고침</button>
            <button class="button secondary" type="button" data-action="clear-session">연결 해제</button>
          </div>
        </div>

        <section class="summary-grid">
          <article class="value-card">
            <strong>대표 꼬모</strong>
            <div class="value">${escapeHtml(me?.customization?.representativeKkomo ?? "default")}</div>
            <div class="meta">프레임 ${escapeHtml(me?.customization?.representativeFrame ?? "none")}</div>
          </article>
          <article class="value-card">
            <strong>오늘 기록</strong>
            <div class="value">${escapeHtml(me?.todayRecord ?? "대기")}</div>
            <div class="meta">오늘 총점 ${numberOrZero(me?.todayTotalScore ?? 0)}점</div>
          </article>
          <article class="value-card">
            <strong>뽑기권</strong>
            <div class="value">${inventory.general} / ${inventory.special}</div>
            <div class="meta">일반 / 특별 · 파편 ${inventory.shards}</div>
          </article>
          <article class="value-card">
            <strong>컬렉션</strong>
            <div class="value">${collection.length}</div>
            <div class="meta">획득한 꼬모 수</div>
          </article>
        </section>

        <section class="shell">
          <section class="hero">
            <div class="official-banner">
              <span class="tiny-pill">플레이어 홈</span>
              <span class="tiny-pill">공식 컬렉션</span>
            </div>
            <p class="eyebrow">플레이어 홈</p>
            <h1>참여한 만큼<br /><span class="marker">모이고, 꾸며지고, 남는다.</span></h1>
            <p>
              꼬모의 게임성은 실력 경쟁보다 참여 루프에 더 가깝게 설계돼 있어요.
              퀴즈를 풀고, 복습하고, 방에 기여하면 뽑기권이 모이고, 그 보상으로 컬렉션과 꾸미기가 열립니다.
            </p>
            <div class="hero-actions">
              <button class="button primary" type="button" data-action="draw-gacha">뽑기하기</button>
              <a class="button secondary" href="#collection">컬렉션 보기</a>
            </div>
            <div class="mini-stack" style="margin-top:18px">
              <span>참여 우선 보상</span>
              <span>중복은 파편</span>
              <span>대표 꼬모 + 프레임</span>
              <span>학교급 유지</span>
            </div>
          </section>

          <section class="auth-card">
            <p class="eyebrow">연결 상태</p>
            <h2>지금 세션이 살아있어요.</h2>
            <p class="subtle" style="margin-top:10px">
              코드는 안전하게 소비되고, 이후 상태는 백엔드 토큰으로 읽어요.
            </p>
            <div class="auth-form">
              <div class="field">
                <label>API 주소</label>
                <input value="${escapeAttribute(state.apiBase)}" data-field="api-base" />
              </div>
              <div class="field">
                <label>세션 만료</label>
                <input value="${state.sessionExpiresAt ? new Date(state.sessionExpiresAt).toLocaleString("ko-KR") : "미확인"}" readonly />
              </div>
              <div class="button-row">
                <button class="button secondary" type="button" data-action="save-api-base">API 저장</button>
                <button class="button secondary" type="button" data-action="copy-link">플레이어 링크 복사</button>
              </div>
            </div>
          </section>
        </section>

        <section class="section">
          <div class="tabbar" role="tablist" aria-label="플레이어 탭">
            ${renderTabButton("profile", "프로필", "학년, 점수, 오늘 상태")}
            ${renderTabButton("gacha", "뽑기", "티켓으로 꼬모를 뽑아요")}
            ${renderTabButton("collection", "컬렉션", "획득한 꼬모를 모아봐요")}
            ${renderTabButton("customize", "꾸미기", "대표 꼬모와 프레임")}
          </div>

          <div class="panel-grid">
            ${renderProfilePanel()}
            ${renderGachaPanel()}
            ${renderCollectionPanel()}
            ${renderCustomizePanel()}
          </div>
        </section>

        <section class="section" id="rewards">
          <div class="section-head">
            <div>
              <p class="eyebrow">보상 기록</p>
              <h2>참여가 어떻게 쌓였는지<br />기록으로 봐요.</h2>
            </div>
            <p>퀴즈, 복습, 방 목표, 출석 보상은 여기에서 시간순으로 읽습니다.</p>
          </div>

          <div class="reward-list">
            ${renderRewards(rewards)}
          </div>
        </section>

        ${drawResult ? renderDrawResult(drawResult) : ""}

        <footer>
          꼬모 플레이어 · 학습은 카카오톡에서, 모으는 재미는 웹에서
        </footer>
      </div>
    </main>
  `;
}

function renderTabButton(id, title, copy) {
  const active = state.activeTab === id;
  return `
    <button class="tab-button ${active ? "active" : ""}" type="button" data-tab="${id}" aria-pressed="${active}">
      <span class="tab-title">${title}</span>
      <span class="tab-copy">${copy}</span>
    </button>
  `;
}

function renderProfilePanel() {
  const me = state.me;
  const visible = state.activeTab === "profile";
  return `
    <section class="panel ${visible ? "" : "panel-hidden"}" data-panel="profile">
      <div class="section-title">
        <h3>프로필</h3>
        <div class="actions">
          <span class="inline-badge">학교급 ${escapeHtml(me?.schoolStage ?? "general")}</span>
          <span class="inline-badge">총점 ${numberOrZero(me?.todayTotalScore ?? 0)}점</span>
        </div>
      </div>
      <div class="split">
        <div class="card" style="padding:18px">
          <strong>${escapeHtml(me?.playerName ?? "꼬모 플레이어")}</strong>
          <p>${escapeHtml(me?.todayRecord ?? "오늘 기록 없음")}</p>
          <div class="mini-stack">
            <span>학년 ${escapeHtml(me?.gradeLabel ?? "자동 맞춤")}</span>
            <span>총 XP ${numberOrZero(me?.totalXp ?? 0)}</span>
            <span>대표 꼬모 ${escapeHtml(me?.customization?.representativeKkomo ?? "default")}</span>
            <span>프레임 ${escapeHtml(me?.customization?.representativeFrame ?? "none")}</span>
          </div>
        </div>
        <div class="card" style="padding:18px">
          <strong>오늘 상태</strong>
          <p>${escapeHtml(me?.summary?.missionStatus ?? "참여 우선")}</p>
          <div class="mini-stack">
            <span>일반권 ${numberOrZero(me?.tickets?.general ?? 0)}</span>
            <span>특별권 ${numberOrZero(me?.tickets?.special ?? 0)}</span>
            <span>파편 ${numberOrZero(me?.tickets?.shards ?? 0)}</span>
          </div>
          <div class="button-row" style="margin-top:14px">
            <button class="button primary" type="button" data-action="draw-gacha">바로 뽑기</button>
            <button class="button secondary" type="button" data-tab="customize">꾸미기 보기</button>
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderGachaPanel() {
  const visible = state.activeTab === "gacha";
  const me = state.me;
  return `
    <section class="panel ${visible ? "" : "panel-hidden"}" data-panel="gacha">
      <div class="section-title">
        <h3>뽑기</h3>
        <div class="actions">
          <span class="inline-badge">일반 ${numberOrZero(me?.tickets?.general ?? 0)}</span>
          <span class="inline-badge">특별 ${numberOrZero(me?.tickets?.special ?? 0)}</span>
        </div>
      </div>
      <div class="split">
        <div class="card" style="padding:18px">
          <strong>뽑기권 종류</strong>
          <p>일반권과 특별권만 먼저 두고, 중복은 파편으로 바꿉니다.</p>
          <div class="field" style="margin-top:14px">
            <label for="ticketType">티켓 선택</label>
            <select id="ticketType" name="ticketType">
              <option value="normal">일반 뽑기권</option>
              <option value="special">특별 뽑기권</option>
            </select>
          </div>
          <div class="button-row" style="margin-top:14px">
            <button class="button primary" type="button" data-action="draw-gacha">뽑기 실행</button>
          </div>
        </div>
        <div class="card" style="padding:18px">
          <strong>최근 결과</strong>
          ${state.drawResult ? renderDrawSummary(state.drawResult) : `<p>아직 뽑기 결과가 없어요. 먼저 한 번 뽑아보면 결과가 이 자리에 표시돼요.</p>`}
        </div>
      </div>
    </section>
  `;
}

function renderCollectionPanel() {
  const visible = state.activeTab === "collection";
  const collection = state.collection ?? [];
  const grouped = RARITY_ORDER.flatMap((rarity) => collection.filter((item) => item.rarity === rarity));
  const empty = grouped.length === 0;
  return `
    <section class="panel ${visible ? "" : "panel-hidden"}" data-panel="collection" id="collection">
      <div class="section-title">
        <h3>컬렉션</h3>
        <div class="actions">
          <span class="inline-badge">총 ${collection.length}개</span>
        </div>
      </div>
      ${
        empty
          ? `
            <div class="empty-state">
              <strong>아직 보유한 꼬모가 없어요.</strong>
              <p>뽑기를 한 번 돌리면 여기서 보유 꼬모와 희귀도를 볼 수 있어요.</p>
            </div>
          `
          : `<div class="collection-grid">${grouped.map(renderCollectionItem).join("")}</div>`
      }
    </section>
  `;
}

function renderCustomizePanel() {
  const visible = state.activeTab === "customize";
  const collection = state.collection ?? [];
  const me = state.me;
  const selectedKkomo = me?.customization?.representativeKkomo ?? "default";
  const selectedFrame = me?.customization?.representativeFrame ?? "none";
  const ownedChoices = collection
    .map(
      (item) =>
        `<option value="${escapeAttribute(item.id)}"${item.id === selectedKkomo ? " selected" : ""}>${escapeHtml(item.name)}</option>`
    )
    .join("");
  const ownedFrames = [
    ["none", "기본 프레임"],
    ["soft", "소프트 프레임"],
    ["glow", "글로우 프레임"],
    ["rare", "레어 프레임"]
  ]
    .map(([value, label]) => `<option value="${value}"${value === selectedFrame ? " selected" : ""}>${label}</option>`)
    .join("");
  return `
    <section class="panel ${visible ? "" : "panel-hidden"}" data-panel="customize">
      <div class="section-title">
        <h3>꾸미기</h3>
        <div class="actions">
          <span class="inline-badge">대표 꼬모 ${escapeHtml(me?.customization?.representativeKkomo ?? "default")}</span>
          <span class="inline-badge">프레임 ${escapeHtml(me?.customization?.representativeFrame ?? "none")}</span>
        </div>
      </div>
      <form class="customize-grid" data-form="customize">
        <div class="card" style="padding:18px">
          <strong>대표 꼬모</strong>
          <p>보유한 꼬모 중에서 대표를 하나 정할 수 있어요.</p>
          <div class="field" style="margin-top:14px">
            <label for="representativeKkomo">선택</label>
            <select id="representativeKkomo" name="representativeKkomo">
              ${ownedChoices || `<option value="default">기본 꼬모</option>`}
            </select>
          </div>
        </div>
        <div class="card" style="padding:18px">
          <strong>프레임</strong>
          <p>웹 프로필의 분위기를 프레임으로 조절해요.</p>
          <div class="field" style="margin-top:14px">
            <label for="representativeFrame">선택</label>
            <select id="representativeFrame" name="representativeFrame">
              ${ownedFrames}
            </select>
          </div>
          <div class="button-row" style="margin-top:14px">
            <button class="button primary" type="submit" data-action="customize-save">저장하기</button>
          </div>
        </div>
      </form>
    </section>
  `;
}

function renderRewards(items) {
  if (!items.length) {
    return `
      <article class="reward-item">
        <strong>보상 기록이 아직 없어요.</strong>
        <p>퀴즈, 복습, 방 목표 기여가 쌓이면 여기에서 시간순으로 보여줘요.</p>
      </article>
    `;
  }
  return items
    .slice(0, 8)
    .map(
      (item) => `
        <article class="reward-item">
          <strong>${escapeHtml(item.title)}</strong>
          <p>${escapeHtml(item.type)} · ${item.amount >= 0 ? "+" : ""}${item.amount}</p>
          <span class="subtle">${escapeHtml(formatHumanDate(item.createdAt))}</span>
        </article>
      `
    )
    .join("");
}

function renderCollectionItem(item) {
  return `
    <article class="item-card">
      <div class="rarity ${item.rarity}">${item.rarity}</div>
      <div class="icon">${escapeHtml(item.icon)}</div>
      <strong>${escapeHtml(item.name)}</strong>
      <p>${item.favorite ? "대표 후보" : "보유 꼬모"} · 중복 ${item.duplicateCount}</p>
      <div class="mini-stack">
        <span>${item.acquiredAt ? formatHumanDate(item.acquiredAt) : "획득 시각 미상"}</span>
        <span>${item.id}</span>
      </div>
    </article>
  `;
}

function renderDrawResult(drawResult) {
  return `
    <section class="section">
      <div class="section-head">
        <div>
          <p class="eyebrow">뽑기 결과</p>
          <h2>이번에 새로 얻은 꼬모예요.</h2>
        </div>
      </div>
      <div class="card" style="padding:18px">
        ${renderDrawSummary(drawResult)}
        <div class="button-row" style="margin-top:14px">
          <button class="button secondary" type="button" data-tab="collection">컬렉션으로 보기</button>
          <button class="button secondary" type="button" data-action="draw-gacha">한 번 더 뽑기</button>
        </div>
      </div>
    </section>
  `;
}

function renderDrawSummary(drawResult) {
  const item = drawResult.item ?? drawResult.result ?? drawResult.draw ?? drawResult;
  const rarity = normalizeRarity(item.rarity ?? item.rank ?? "common");
  const converted = Boolean(item.convertedToShards ?? item.duplicate ?? item.isDuplicate);
  const shardCount = numberOrZero(item.shardCount ?? item.fragmentCount ?? item.shardDelta ?? 0);
  const name = item.name ?? item.title ?? "알 수 없는 꼬모";
  const icon = item.icon ?? item.emoji ?? "◌";
  return `
    <div class="reward-item">
      <div class="rarity ${rarity}">${rarity}</div>
      <div class="icon">${escapeHtml(icon)}</div>
      <strong>${escapeHtml(name)}</strong>
      <p>${converted ? `중복이어서 파편 ${shardCount}개로 바뀌었어요.` : "새로운 꼬모를 얻었어요."}</p>
    </div>
  `;
}

function renderEmptyPreview() {
  return `
    <div class="empty-state">
      <strong>아직 연동되지 않았어요.</strong>
      <p>카카오에서 받은 서명 링크를 넣으면 프로필과 컬렉션 미리보기가 살아납니다.</p>
      <div class="button-row" style="justify-content:center;margin-top:14px">
        <button class="button primary" type="button" data-action="copy-link">플레이어 링크 복사</button>
      </div>
    </div>
  `;
}

function renderPreviewCard(profile) {
  const name = profile.displayName ?? profile.playerName ?? "꼬모 플레이어";
  const stage = profile.schoolStage ?? "general";
  const grade = profile.gradeLabel ?? "자동 맞춤";
  const totalScore = numberOrZero(profile.todayTotalScore ?? 0);
  const tickets = profile.tickets ?? { general: 0, special: 0, shards: 0 };
  return `
    <div class="summary-grid">
      <article class="value-card">
        <strong>플레이어</strong>
        <div class="value">${escapeHtml(name)}</div>
        <div class="meta">${escapeHtml(stage)} · ${escapeHtml(grade)}</div>
      </article>
      <article class="value-card">
        <strong>오늘 총점</strong>
        <div class="value">${totalScore}점</div>
        <div class="meta">참여 우선 보상으로 쌓여요.</div>
      </article>
      <article class="value-card">
        <strong>티켓</strong>
        <div class="value">${tickets.general} / ${tickets.special}</div>
        <div class="meta">일반 / 특별 / 파편 ${tickets.shards ?? 0}</div>
      </article>
      <article class="value-card">
        <strong>꾸미기</strong>
        <div class="value">${escapeHtml(profile.customization?.representativeFrame ?? "none")}</div>
        <div class="meta">${escapeHtml(profile.customization?.representativeKkomo ?? "default")}</div>
      </article>
    </div>
  `;
}

function formatHumanDate(value) {
  if (!value) {
    return "기록 없음";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("\n", " ");
}

function render() {
  document.title = state.mode === "player" ? "꼬모 · 플레이어" : "꼬모 · 공식 웹 공책";
  app.innerHTML = buildPage();
  runMotion();
}

function runMotion() {
  const gsap = window.gsap;
  if (!gsap || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }

  gsap.fromTo(
    ".container .topbar",
    { opacity: 0, y: -12 },
    { opacity: 1, y: 0, duration: 0.45, ease: "power3.out" }
  );

  gsap.fromTo(
    ".container .hero",
    { opacity: 0, y: 18 },
    { opacity: 1, y: 0, duration: 0.65, ease: "power3.out", delay: 0.06 }
  );

  gsap.fromTo(
    ".container .feature-card, .container .value-card, .container .item-card, .container .reward-item, .container .panel, .container .auth-card",
    { opacity: 0, y: 18 },
    {
      opacity: 1,
      y: 0,
      duration: 0.55,
      ease: "power3.out",
      stagger: 0.04,
      delay: 0.08
    }
  );

  if (state.mode === "public") {
    gsap.to(".hero-visual .note.quiz", {
      y: -8,
      duration: 2.8,
      repeat: -1,
      yoyo: true,
      ease: "sine.inOut"
    });
    gsap.to(".hero-visual .note.profile", {
      y: 8,
      duration: 3.1,
      repeat: -1,
      yoyo: true,
      ease: "sine.inOut"
    });
    gsap.to(".hero-visual .stamp.blue", {
      rotate: -10,
      duration: 4.8,
      repeat: -1,
      yoyo: true,
      ease: "sine.inOut"
    });
  }
}
