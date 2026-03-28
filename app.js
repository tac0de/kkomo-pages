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
    playerHandle: profile.playerHandle ?? data.playerHandle ?? data.publicId ?? data.handle ?? "",
    nickname: profile.nickname ?? data.nickname ?? profile.displayName ?? data.displayName ?? "",
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
  const nicknameField = form.querySelector("[name='nickname']");
  try {
    const payload = await apiFetch("/api/web/profile/customize", {
      method: "POST",
      body: JSON.stringify({
        featuredKkomoId: representativeKkomo instanceof HTMLSelectElement ? representativeKkomo.value : "default",
        frameId: representativeFrame instanceof HTMLSelectElement ? representativeFrame.value : "none",
        nickname: nicknameField instanceof HTMLInputElement ? nicknameField.value.trim() : ""
      })
    });
    const customization = payload?.data?.customization ?? payload?.data ?? payload?.customization ?? payload ?? null;
    const identity = payload?.data?.identity ?? payload?.identity ?? null;
    if (state.me && customization) {
      state.me.customization = {
        representativeKkomo: customization.featuredKkomoId ?? state.me.customization?.representativeKkomo ?? "default",
        representativeFrame: customization.frameId ?? state.me.customization?.representativeFrame ?? "none"
      };
      if (identity?.nickname) {
        state.me.nickname = identity.nickname;
      }
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
    <main class="page page-public">
      <div class="container">
        <header class="topbar">
          <div class="brand">
            <div class="brand-mark">꼬</div>
            <div class="brand-copy">
              <strong>꼬모</strong>
              <span>공식 사이트 · 학습은 카카오톡, 정리는 웹에서</span>
            </div>
          </div>
          <div class="topbar-actions">
            <span class="status-pill ok">공식 랜딩</span>
            <a class="button secondary" href="#player-connect">플레이어 열기</a>
          </div>
        </header>

        <section class="landing-hero">
          <div class="hero-copy">
            <div class="official-banner">
              <span class="tiny-pill">공개 랜딩</span>
              <span class="tiny-pill">signed link player mode</span>
            </div>
            <p class="eyebrow">Official Kkomo Site</p>
            <h1>카카오에서 시작한 공부를<br /><span class="marker">웹의 공식 공간에 정리한다.</span></h1>
            <p>
              꼬모는 질문과 퀴즈를 즉시 처리하고, 웹은 프로필·보상·컬렉션·꾸미기를 쌓아두는 공식 허브입니다.
              플레이어는 카카오에서 받은 서명 링크로만 들어옵니다.
            </p>
            <div class="hero-actions">
              <a class="button primary" href="#player-connect">카카오에서 시작하기</a>
              <a class="button secondary" href="#web-features">웹에서 할 수 있는 것</a>
            </div>
            <div class="proof-row">
              <article class="proof-card">
                <strong>공식 랜딩</strong>
                <p>소개와 진입 안내만 두고, 실제 플레이어 데이터는 따로 엽니다.</p>
              </article>
              <article class="proof-card">
                <strong>참여 기반 보상</strong>
                <p>정답 경쟁보다 출석, 복습, 방 기여, 연속 참여를 더 크게 봅니다.</p>
              </article>
              <article class="proof-card">
                <strong>대표 정체성</strong>
                <p>플레이어 ID, 닉네임, 대표 꼬모, 프레임으로 내 계정을 만듭니다.</p>
              </article>
            </div>
          </div>

          <aside class="hero-stage">
            <div class="stage-frame">
              <div class="stage-orbit">
                <span class="preview-tag tag-a">공식</span>
                <span class="preview-tag tag-b">보상</span>
                <span class="preview-tag tag-c">컬렉션</span>
              </div>
              <div class="identity-card">
                <div class="identity-head">
                  <div class="identity-avatar">꼬</div>
                  <div>
                    <span class="eyebrow">플레이어 미리보기</span>
                    <strong>${hasPreview ? escapeHtml(cached.nickname || cached.playerName) : "닉네임 / 플레이어 ID"}</strong>
                    <p>${hasPreview ? escapeHtml(formatPlayerHandle(cached)) : "카카오 서명 링크로 열리는 플레이어 룸"}</p>
                  </div>
                </div>
                <div class="identity-meta">
                  <span>대표 꼬모 ${hasPreview ? escapeHtml(cached.customization?.representativeKkomo ?? "default") : "default"}</span>
                  <span>프레임 ${hasPreview ? escapeHtml(cached.customization?.representativeFrame ?? "none") : "none"}</span>
                  <span>오늘 총점 ${hasPreview ? numberOrZero(cached.todayTotalScore ?? 0) : "0"}점</span>
                </div>
              </div>
              <div class="stage-notes">
                <div class="stage-note">
                  <strong>웹 역할</strong>
                  <p>프로필, 컬렉션, 뽑기, 꾸미기를 모아보는 정리 공간.</p>
                </div>
                <div class="stage-note">
                  <strong>챗봇 역할</strong>
                  <p>질문, 퀴즈, 정오답, 즉시 반응 같은 지금 순간의 학습.</p>
                </div>
              </div>
            </div>
          </aside>
        </section>

        <section class="section section-bleed" id="web-features">
          <div class="section-head">
            <div>
              <p class="eyebrow">IA</p>
              <h2>웹에서는 쌓인 상태를 읽고, 모으고, 꾸밉니다.</h2>
            </div>
            <p>랜딩은 적은 장면으로, 플레이어는 한눈에 읽히는 상태판으로 정리했습니다.</p>
          </div>

          <div class="feature-grid feature-grid-strong">
            <article class="feature-card feature-card-bright">
              <strong>프로필 허브</strong>
              <p>학교급, 오늘 기록, 총점, 플레이어 ID, 닉네임, 대표 꼬모를 한 화면에 둡니다.</p>
              <div class="code-line">내 계정의 정체성을 먼저 보여주는 구성이에요.</div>
            </article>
            <article class="feature-card">
              <strong>보상 루프</strong>
              <p>일반권, 특별권, 파편을 분리해 보여주고, 참여가 어떻게 쌓였는지 설명합니다.</p>
              <div class="code-line">출석과 복습이 뽑기권으로 이어집니다.</div>
            </article>
            <article class="feature-card">
              <strong>컬렉션 중심</strong>
              <p>획득한 꼬모를 희귀도와 중복 수까지 같이 보여주고, 공식 감각의 도감처럼 다룹니다.</p>
              <div class="code-line">신규 획득은 강조하고, 잠금은 실루엣으로 정리합니다.</div>
            </article>
          </div>
        </section>

        <section class="section section-bleed">
          <div class="section-head">
            <div>
              <p class="eyebrow">컬렉션 티저</p>
              <h2>보유 여부보다, 공식 도감처럼 보이는 인상이 중요합니다.</h2>
            </div>
            <p>잠금 실루엣과 대표 카드 예시로 컬렉션 톤을 미리 보여줍니다.</p>
          </div>

          <div class="collection-teaser">
            ${renderCollectionTeaserCards()}
          </div>
        </section>

        <section class="section section-bleed" id="player-connect">
          <div class="section-head">
            <div>
              <p class="eyebrow">플레이어 진입</p>
              <h2>카카오에서 받은 서명 링크를 넣으면 플레이어 룸이 열립니다.</h2>
            </div>
            <p>공개 사이트와 플레이어 모드를 한 사이트 안에 분리해 둔 구조입니다.</p>
          </div>

          <div class="auth-grid">
            <form class="auth-card auth-card-prominent" data-form="connect">
              <p class="eyebrow">연결</p>
              <h2>플레이어 모드 열기</h2>
              <p class="subtle" style="margin-top:10px">
                API 주소와 one-time code를 넣으면 프로필, 뽑기, 컬렉션, 꾸미기 화면을 불러옵니다.
              </p>
              <div class="auth-form">
                <div class="field">
                  <label for="apiBase">API 주소</label>
                  <input id="apiBase" name="apiBase" data-field="api-base" value="${escapeAttribute(state.apiBase)}" placeholder="https://api.example.com" />
                </div>
                <div class="field">
                  <label for="code">서명 코드</label>
                  <input id="code" name="code" placeholder="카카오에서 받은 one-time code" value="${escapeAttribute(state.draftCode)}" />
                </div>
                <div class="button-row">
                  <button class="button primary" type="submit">플레이어 열기</button>
                  <button class="button secondary" type="button" data-action="save-api-base">API 저장</button>
                  <button class="button secondary" type="button" data-action="copy-link">링크 복사</button>
                </div>
                <p class="footnote">
                  session exchange, profile, collection, gacha, customize, rewards API를 순서대로 읽습니다.
                </p>
              </div>
            </form>

            <aside class="support-section support-section-prominent">
              <div class="support-box support-box-card">
                <div class="section-title">
                  <h3>웹에서 열리는 것</h3>
                  <div class="actions">
                    <span class="inline-badge">${state.apiBase ? `API ${escapeHtml(state.apiBase)}` : "API 미설정"}</span>
                    <span class="inline-badge">${state.token ? "세션 있음" : "세션 없음"}</span>
                  </div>
                </div>
                <div class="support-list">
                  <div class="support-item">
                    <strong>프로필</strong>
                    <p>플레이어 ID, 닉네임, 대표 꼬모, 프레임, 오늘 상태.</p>
                  </div>
                  <div class="support-item">
                    <strong>뽑기</strong>
                    <p>티켓 종류를 고르고 바로 결과를 확인합니다.</p>
                  </div>
                  <div class="support-item">
                    <strong>컬렉션 / 꾸미기</strong>
                    <p>획득 꼬모, 중복, 파편, 대표 선택을 한 번에 다룹니다.</p>
                  </div>
                </div>
              </div>
              <div class="preview-stage preview-stage-compact">
                ${hasPreview ? renderPreviewCard(cached) : renderEmptyPreview()}
              </div>
            </aside>
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
    ? `${formatPlayerIdentity(me)} · ${me.gradeLabel ?? "자동 맞춤"} · ${me.schoolStage ?? "general"}`
    : "연결 대기";

  return `
    <main class="page page-player">
      <div class="container">
        <header class="topbar">
          <div class="brand">
            <div class="brand-mark">꼬</div>
            <div class="brand-copy">
              <strong>꼬모 플레이어 룸</strong>
              <span>${escapeHtml(summaryLine)}</span>
            </div>
          </div>
          <div class="topbar-actions">
            <span class="status-pill ${state.loading ? "warn" : state.token ? "ok" : "warn"}">${state.loading ? "동기화 중" : state.token ? "연결됨" : "연결 필요"}</span>
            <button class="button secondary" type="button" data-action="reload-data">새로고침</button>
            <button class="button secondary" type="button" data-action="clear-session">연결 해제</button>
          </div>
        </header>

        <section class="player-hero">
          <div class="player-identity">
            <div class="identity-avatar identity-avatar-large">꼬</div>
            <div class="player-identity-copy">
              <p class="eyebrow">플레이어 홈</p>
              <h1>${escapeHtml(me?.nickname || me?.playerName || "꼬모 플레이어")}</h1>
              <p class="player-handle">${escapeHtml(formatPlayerHandle(me))}</p>
              <p>
                참여한 만큼 모이고, 꾸며지고, 남는 구조로 정리한 공식 플레이어 룸입니다.
                숫자는 짧게, 정체성은 선명하게 보여줍니다.
              </p>
              <div class="hero-actions">
                <button class="button primary" type="button" data-action="draw-gacha">바로 뽑기</button>
                <a class="button secondary" href="#collection">컬렉션 보기</a>
              </div>
            </div>
          </div>

          <aside class="player-side">
            <div class="side-card">
              <div class="side-card-head">
                <span class="status-pill ${state.token ? "ok" : "warn"}">${state.token ? "세션 있음" : "세션 없음"}</span>
                <span class="inline-badge">세션 만료 ${state.sessionExpiresAt ? new Date(state.sessionExpiresAt).toLocaleString("ko-KR") : "미확인"}</span>
              </div>
              <div class="side-metrics">
                <span><strong>${numberOrZero(me?.todayTotalScore ?? 0)}</strong> 오늘 총점</span>
                <span><strong>${collection.length}</strong> 컬렉션</span>
                <span><strong>${inventory.general}</strong> 일반권</span>
                <span><strong>${inventory.special}</strong> 특별권</span>
                <span><strong>${inventory.shards}</strong> 파편</span>
                <span><strong>${escapeHtml(me?.customization?.representativeFrame ?? "none")}</strong> 프레임</span>
              </div>
              <div class="button-row">
                <button class="button secondary" type="button" data-action="reload-data">새로고침</button>
                <button class="button secondary" type="button" data-action="copy-link">플레이어 링크 복사</button>
              </div>
            </div>

            <div class="side-card side-card-soft">
              <strong>오늘 기록</strong>
              <p>${escapeHtml(me?.todayRecord ?? "대기")}</p>
              <div class="mini-stack">
                <span>학교급 ${escapeHtml(me?.schoolStage ?? "general")}</span>
                <span>학년 ${escapeHtml(me?.gradeLabel ?? "자동 맞춤")}</span>
                <span>대표 꼬모 ${escapeHtml(me?.customization?.representativeKkomo ?? "default")}</span>
              </div>
            </div>
          </aside>
        </section>

        <section class="section section-bleed">
          <div class="section-head">
            <div>
              <p class="eyebrow">플레이어 상태판</p>
              <h2>한 화면에서 프로필, 뽑기, 컬렉션, 꾸미기를 넘깁니다.</h2>
            </div>
            <p>탭은 상태를 분리하고, 내용은 한 덩어리로 읽히도록 정리했습니다.</p>
          </div>

          <div class="player-console">
            <div class="tabbar" role="tablist" aria-label="플레이어 탭">
              ${renderTabButton("profile", "프로필", "학교급, 점수, 오늘 상태")}
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
    <button class="tab-button ${active ? "active" : ""}" type="button" data-tab="${id}" aria-pressed="${active}" aria-selected="${active}" role="tab">
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
      <div class="split split-hero">
        <div class="card card-surface">
          <strong>${escapeHtml(formatPlayerIdentity(me))}</strong>
          <p>${escapeHtml(me?.nickname || me?.playerName || "꼬모 플레이어")} · ${escapeHtml(me?.todayRecord ?? "오늘 기록 없음")}</p>
          <div class="mini-stack">
            <span>플레이어 ID ${escapeHtml(formatPlayerHandle(me))}</span>
            <span>총 XP ${numberOrZero(me?.totalXp ?? 0)}</span>
            <span>대표 꼬모 ${escapeHtml(me?.customization?.representativeKkomo ?? "default")}</span>
            <span>프레임 ${escapeHtml(me?.customization?.representativeFrame ?? "none")}</span>
          </div>
        </div>
        <div class="card card-surface">
          <strong>오늘 상태</strong>
          <p>${escapeHtml(me?.summary?.missionStatus ?? "참여 우선")}</p>
          <div class="mini-stack">
            <span>일반권 ${numberOrZero(me?.tickets?.general ?? 0)}</span>
            <span>특별권 ${numberOrZero(me?.tickets?.special ?? 0)}</span>
            <span>파편 ${numberOrZero(me?.tickets?.shards ?? 0)}</span>
          </div>
          <div class="button-row button-row-tight">
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
        <div class="card card-surface">
          <strong>뽑기권 종류</strong>
          <p>일반권과 특별권만 먼저 두고, 중복은 파편으로 바꿉니다.</p>
          <div class="field field-offset">
            <label for="ticketType">티켓 선택</label>
            <select id="ticketType" name="ticketType">
              <option value="normal">일반 뽑기권</option>
              <option value="special">특별 뽑기권</option>
            </select>
          </div>
          <div class="button-row button-row-tight">
            <button class="button primary" type="button" data-action="draw-gacha">뽑기 실행</button>
          </div>
        </div>
        <div class="card card-surface">
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
        <div class="card card-surface">
          <strong>닉네임</strong>
          <p>웹 프로필에서 보이는 이름이에요. 플레이어 ID는 그대로 유지됩니다.</p>
          <div class="field field-offset">
            <label for="nickname">닉네임</label>
            <input
              id="nickname"
              name="nickname"
              maxlength="20"
              value="${escapeAttribute(me?.nickname || me?.playerName || "")}"
              placeholder="닉네임을 입력하세요"
            />
          </div>
        </div>
        <div class="card card-surface">
          <strong>대표 꼬모</strong>
          <p>보유한 꼬모 중에서 대표를 하나 정할 수 있어요.</p>
          <div class="field field-offset">
            <label for="representativeKkomo">선택</label>
            <select id="representativeKkomo" name="representativeKkomo">
              ${ownedChoices || `<option value="default">기본 꼬모</option>`}
            </select>
          </div>
        </div>
        <div class="card card-surface">
          <strong>프레임</strong>
          <p>웹 프로필의 분위기를 프레임으로 조절해요.</p>
          <div class="field field-offset">
            <label for="representativeFrame">선택</label>
            <select id="representativeFrame" name="representativeFrame">
              ${ownedFrames}
            </select>
          </div>
          <div class="button-row button-row-tight">
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
    <section class="section draw-result-section">
      <div class="section-head">
        <div>
          <p class="eyebrow">뽑기 결과</p>
          <h2>이번에 새로 얻은 꼬모예요.</h2>
        </div>
      </div>
      <div class="card card-surface draw-result-card">
        ${renderDrawSummary(drawResult)}
        <div class="button-row button-row-tight">
          <button class="button secondary" type="button" data-tab="collection">컬렉션으로 보기</button>
          <button class="button secondary" type="button" data-action="draw-gacha">한 번 더 뽑기</button>
        </div>
      </div>
    </section>
  `;
}

function renderDrawSummary(drawResult) {
  const item = drawResult.item ?? drawResult.result ?? drawResult.draw ?? drawResult;
  const summary = drawResult.summary ?? {};
  const rarity = normalizeRarity(item.rarity ?? item.rank ?? "common");
  const converted = Boolean(item.convertedToShards ?? item.duplicate ?? item.isDuplicate);
  const shardCount = numberOrZero(item.shardCount ?? item.fragmentCount ?? item.shardDelta ?? 0);
  const name = item.name ?? item.title ?? "알 수 없는 꼬모";
  const icon = item.icon ?? item.emoji ?? "◌";
  const tickets = summary.tickets ?? drawResult.inventory ?? {};
  return `
    <div class="reward-item">
      <div class="rarity ${rarity}">${rarity}</div>
      <div class="icon">${escapeHtml(icon)}</div>
      <strong>${escapeHtml(name)}</strong>
      <p>${converted ? `중복이어서 파편 ${shardCount}개로 바뀌었어요.` : "새로운 꼬모를 얻었어요."}</p>
      <div class="mini-stack">
        <span>일반권 ${numberOrZero(tickets.normalTickets ?? tickets.normal ?? 0)}</span>
        <span>특별권 ${numberOrZero(tickets.specialTickets ?? tickets.special ?? 0)}</span>
        <span>파편 ${numberOrZero(tickets.shards ?? 0)}</span>
        <span>컬렉션 ${numberOrZero(summary.collectionCount ?? 0)}</span>
      </div>
      ${summary.autoFeaturedKkomoId ? `<div class="code-line">대표 꼬모로 자동 지정됐어요.</div>` : ""}
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

function renderCollectionTeaserCards() {
  const cards = [
    { rarity: "common", title: "잠금 실루엣", copy: "아직 얻지 못한 꼬모는 도감 카드로만 살짝 비춥니다.", symbol: "◌" },
    { rarity: "rare", title: "대표 카드", copy: "획득한 꼬모는 컬러와 희귀도로 분리해서 보여줍니다.", symbol: "✦" },
    { rarity: "epic", title: "중복 전환", copy: "중복은 파편으로 흘러가고, 다음 보상 루프를 밀어줍니다.", symbol: "◎" },
    { rarity: "legendary", title: "공식 도감", copy: "컬렉션은 소장감이 남도록 카드 비중을 크게 가져갑니다.", symbol: "❂" }
  ];
  return cards
    .map(
      (card) => `
        <article class="teaser-card rarity-${card.rarity}">
          <div class="teaser-symbol">${card.symbol}</div>
          <strong>${card.title}</strong>
          <p>${card.copy}</p>
          <span class="rarity ${card.rarity}">${card.rarity}</span>
        </article>
      `
    )
    .join("");
}

function formatPlayerHandle(me) {
  if (!me) {
    return "player-id pending";
  }
  return me.playerHandle || me.playerName || "player-id pending";
}

function formatPlayerIdentity(me) {
  if (!me) {
    return "꼬모 플레이어";
  }
  const nickname = me.nickname || me.playerName || "꼬모 플레이어";
  const handle = formatPlayerHandle(me);
  return me.playerHandle ? `${nickname} · ${handle}` : nickname;
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
  const previousMode = state.__lastRenderedMode;
  const previousTab = state.__lastRenderedTab;
  app.innerHTML = buildPage();
  runMotion({ previousMode, previousTab });
  state.__lastRenderedMode = state.mode;
  state.__lastRenderedTab = state.activeTab;
}

function runMotion(context = {}) {
  const gsap = window.gsap;
  if (!gsap || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }

  const root = document.querySelector(".page");
  if (!root) {
    return;
  }

  gsap.killTweensOf(root.querySelectorAll("*"));

  const topbar = root.querySelector(".topbar");
  const hero = root.querySelector(".landing-hero, .player-hero");
  if (topbar) {
    gsap.fromTo(topbar, { opacity: 0, y: -16 }, { opacity: 1, y: 0, duration: 0.42, ease: "power3.out" });
  }
  if (hero) {
    gsap.fromTo(hero, { opacity: 0, y: 22 }, { opacity: 1, y: 0, duration: 0.72, ease: "power3.out", delay: 0.05 });
  }

  const staggerTargets = root.querySelectorAll(
    ".feature-card, .proof-card, .identity-card, .stage-note, .support-item, .preview-stage, .auth-card, .value-card, .panel, .side-card, .teaser-card, .reward-item, .item-card"
  );
  if (staggerTargets.length) {
    gsap.fromTo(
      staggerTargets,
      { opacity: 0, y: 18 },
      { opacity: 1, y: 0, duration: 0.52, ease: "power3.out", stagger: 0.04, delay: 0.08 }
    );
  }

  if (state.mode === "public") {
    gsap.to(root.querySelectorAll(".stage-orbit .preview-tag"), {
      y: -8,
      duration: 2.8,
      repeat: -1,
      yoyo: true,
      ease: "sine.inOut",
      stagger: 0.12
    });
    gsap.to(root.querySelectorAll(".identity-avatar, .brand-mark"), {
      rotate: 3,
      duration: 4.8,
      repeat: -1,
      yoyo: true,
      ease: "sine.inOut"
    });
  }

  if (state.mode === "player") {
    if (context.previousTab !== state.activeTab) {
      const panel = root.querySelector(`[data-panel="${state.activeTab}"]`);
      if (panel) {
        gsap.fromTo(panel, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.42, ease: "power3.out" });
      }
    }

    if (state.drawResult) {
      gsap.fromTo(
        root.querySelectorAll(".draw-result-card"),
        { opacity: 0, scale: 0.96, y: 16 },
        { opacity: 1, scale: 1, y: 0, duration: 0.5, ease: "back.out(1.4)" }
      );
    }

    const collectionCards = root.querySelectorAll(".collection-grid .item-card");
    if (collectionCards.length) {
      gsap.fromTo(
        collectionCards,
        { opacity: 0, y: 14 },
        { opacity: 1, y: 0, duration: 0.45, ease: "power3.out", stagger: 0.035, delay: 0.05 }
      );
    }
  }
}
