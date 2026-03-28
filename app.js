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
              <span>카카오에서 시작한 공부를 웹 공책에 모아요</span>
            </div>
          </div>
          <div class="topbar-actions">
            <span class="status-pill ok">모바일 공책</span>
            <a class="button secondary" href="#player-connect">내 공책 열기</a>
          </div>
        </header>

        <section class="landing-hero">
          <div class="hero-copy">
            <div class="official-banner">
              <span class="tiny-pill">꼬모 웹 공책</span>
              <span class="tiny-pill">모바일 랜딩</span>
            </div>
            <p class="eyebrow">Notebook landing</p>
            <h1>카카오에서 풀던 공부를<br /><span class="marker">웹 공책에 차곡차곡</span> 모아요.</h1>
            <p>
              꼬모는 카카오톡에서 질문과 퀴즈를 돕고, 웹은 프로필·뽑기·도감·꾸미기를 한눈에 보는 공책이에요.
              카카오에서 받은 열쇠 코드로 내 공책을 열 수 있어요.
            </p>
            <div class="hero-actions">
              <a class="button primary" href="#player-connect">열쇠 코드로 열기</a>
              <a class="button secondary" href="#web-features">공책 미리보기</a>
            </div>
            <div class="proof-row">
              <article class="proof-card">
                <strong>가볍게</strong>
                <p>복잡한 설명보다 지금 필요한 것만 먼저 보여줘요.</p>
              </article>
              <article class="proof-card">
                <strong>모으는 재미</strong>
                <p>출석, 복습, 참여가 뽑기권과 꼬모 모음으로 이어져요.</p>
              </article>
              <article class="proof-card">
                <strong>내 이름</strong>
                <p>닉네임, 플레이어 ID, 대표 꼬모, 프레임으로 내 공책이 생겨요.</p>
              </article>
            </div>
          </div>

          <aside class="hero-stage">
            <div class="stage-frame">
              <div class="stage-orbit">
                <span class="preview-tag tag-a">공책</span>
                <span class="preview-tag tag-b">도감</span>
                <span class="preview-tag tag-c">뽑기</span>
              </div>
              <div class="identity-card">
                <div class="identity-head">
                  <div class="identity-avatar">꼬</div>
                  <div>
                    <span class="eyebrow">내 공책 미리보기</span>
                    <strong>${hasPreview ? escapeHtml(cached.nickname || cached.playerName) : "닉네임 / 플레이어 ID"}</strong>
                    <p>${hasPreview ? escapeHtml(formatPlayerHandle(cached)) : "카카오에서 받은 열쇠 코드로 열어요"}</p>
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
                  <strong>웹에서 보는 것</strong>
                  <p>프로필, 도감, 뽑기, 꾸미기를 한곳에 모아요.</p>
                </div>
                <div class="stage-note">
                  <strong>카톡에서 하는 것</strong>
                  <p>질문, 퀴즈, 정답 확인처럼 바로바로 하는 공부예요.</p>
                </div>
              </div>
            </div>
          </aside>
        </section>

        <section class="section section-bleed" id="web-features">
          <div class="section-head">
            <div>
              <p class="eyebrow">공책 구성</p>
              <h2>웹에서는 모은 것과 지금 상태를 한눈에 봐요.</h2>
            </div>
            <p>화면은 단순하게, 버튼은 크게, 글은 바로 읽히게 정리했습니다.</p>
          </div>

          <div class="feature-grid feature-grid-strong">
            <article class="feature-card feature-card-bright">
              <strong>내 정보</strong>
              <p>학교급, 오늘 기록, 총점, 플레이어 ID, 닉네임을 한 장에 모아요.</p>
              <div class="code-line">내 공책은 이름부터 보이게 해요.</div>
            </article>
            <article class="feature-card">
              <strong>뽑기권</strong>
              <p>일반권, 특별권, 파편을 따로 보여주고, 참여로 어떻게 모였는지 알려줘요.</p>
              <div class="code-line">출석과 복습이 뽑기권으로 이어져요.</div>
            </article>
            <article class="feature-card">
              <strong>꼬모 도감</strong>
              <p>얻은 꼬모는 원형 카드로 모아두고, 잠금은 그림자처럼 보여줘요.</p>
              <div class="code-line">신규 획득은 더 눈에 띄게 정리합니다.</div>
            </article>
          </div>
        </section>

        <section class="section section-bleed">
          <div class="section-head">
            <div>
              <p class="eyebrow">꼬모 도감</p>
              <h2>꼬모는 둥근 카드로 모으는 느낌이 잘 어울려요.</h2>
            </div>
            <p>뽑기 기계에서 나온 캡슐처럼, 원형 카드가 하나씩 열리는 컨셉으로 잡았습니다.</p>
          </div>

          <div class="collection-teaser">
            ${renderCollectionTeaserCards()}
          </div>
        </section>

        <section class="section section-bleed" id="player-connect">
          <div class="section-head">
            <div>
              <p class="eyebrow">내 공책 열기</p>
              <h2>카카오에서 받은 열쇠 코드로 내 공책을 열어요.</h2>
            </div>
            <p>공개 페이지는 누구나 볼 수 있고, 개인 공책은 열쇠 코드가 있어야 열립니다.</p>
          </div>

          <div class="auth-grid">
            <form class="auth-card auth-card-prominent" data-form="connect">
              <p class="eyebrow">열기</p>
              <h2>내 공책 연결</h2>
              <p class="subtle" style="margin-top:10px">
                열쇠 코드만 넣으면 내 프로필, 뽑기, 도감, 꾸미기가 열려요.
              </p>
              <div class="auth-form">
                <div class="field">
                  <label for="code">열쇠 코드</label>
                  <input id="code" name="code" placeholder="카카오에서 받은 한 번용 코드" value="${escapeAttribute(state.draftCode)}" />
                </div>
                <div class="button-row">
                  <button class="button primary" type="submit">내 공책 열기</button>
                  <button class="button secondary" type="button" data-action="copy-link">링크 복사</button>
                </div>
                <p class="footnote">
                  열쇠 코드가 없으면 카카오에서 먼저 받아주세요.
                </p>
              </div>
              <details class="advanced-connection">
                <summary>연결 주소 바꾸기</summary>
                <div class="field field-offset">
                  <label for="apiBase">서버 주소(선택)</label>
                  <input id="apiBase" name="apiBase" data-field="api-base" value="${escapeAttribute(state.apiBase)}" placeholder="https://api.example.com" />
                </div>
                <div class="button-row">
                  <button class="button secondary" type="button" data-action="save-api-base">저장하기</button>
                </div>
              </details>
            </form>

            <aside class="support-section support-section-prominent">
              <div class="support-box support-box-card">
                <div class="section-title">
                  <h3>여기서 볼 수 있는 것</h3>
                  <div class="actions">
                    <span class="inline-badge">${state.apiBase ? "연결 준비됨" : "연결 주소 확인 필요"}</span>
                    <span class="inline-badge">${state.token ? "열림" : "대기"}</span>
                  </div>
                </div>
                <div class="support-list">
                  <div class="support-item">
                    <strong>프로필</strong>
                    <p>이름, ID, 대표 꼬모, 프레임, 오늘 상태를 봐요.</p>
                  </div>
                  <div class="support-item">
                    <strong>뽑기</strong>
                    <p>티켓을 골라서 바로 돌리고, 결과를 확인해요.</p>
                  </div>
                  <div class="support-item">
                    <strong>도감 / 꾸미기</strong>
                    <p>얻은 꼬모를 모으고, 이름과 프레임을 바꿔요.</p>
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
    ? `${formatPlayerIdentity(me)} · ${me.gradeLabel ?? "자동 맞춤"}`
    : "연결 대기";

  return `
    <main class="page page-player">
      <div class="container">
        <header class="topbar">
          <div class="brand">
            <div class="brand-mark">꼬</div>
            <div class="brand-copy">
              <strong>꼬모 내 공책</strong>
              <span>${escapeHtml(summaryLine)}</span>
            </div>
          </div>
          <div class="topbar-actions">
            <span class="status-pill ${state.loading ? "warn" : state.token ? "ok" : "warn"}">${state.loading ? "불러오는 중" : state.token ? "열림" : "대기"}</span>
            <button class="button secondary" type="button" data-action="reload-data">다시 불러오기</button>
            <button class="button secondary" type="button" data-action="clear-session">연결 끊기</button>
          </div>
        </header>

        <section class="player-hero">
          <div class="player-identity">
            <div class="identity-avatar identity-avatar-large">꼬</div>
            <div class="player-identity-copy">
              <p class="eyebrow">내 공책</p>
              <h1>${escapeHtml(me?.nickname || me?.playerName || "꼬모 플레이어")}</h1>
              <p class="player-handle">${escapeHtml(formatPlayerHandle(me))}</p>
              <p>
                오늘의 공부와 모은 꼬모를 한 번에 보는 개인 공책이에요.
                이름은 부드럽게, 기록은 한눈에 보여줘요.
              </p>
              <div class="hero-actions">
                <button class="button primary" type="button" data-action="draw-gacha">바로 뽑기</button>
                <a class="button secondary" href="#collection">도감 보기</a>
              </div>
            </div>
          </div>

          <aside class="player-side">
            <div class="side-card">
              <div class="side-card-head">
                <span class="status-pill ${state.token ? "ok" : "warn"}">${state.token ? "열림" : "대기"}</span>
                <span class="inline-badge">연결 상태 ${state.token ? "정상" : "확인 필요"}</span>
              </div>
              <div class="side-metrics">
                <span><strong>${numberOrZero(me?.todayTotalScore ?? 0)}</strong> 오늘 총점</span>
                <span><strong>${collection.length}</strong> 모은 꼬모</span>
                <span><strong>${inventory.general}</strong> 일반권</span>
                <span><strong>${inventory.special}</strong> 특별권</span>
                <span><strong>${inventory.shards}</strong> 파편</span>
                <span><strong>${escapeHtml(me?.customization?.representativeFrame ?? "none")}</strong> 프레임</span>
              </div>
              <div class="button-row">
                <button class="button secondary" type="button" data-action="reload-data">다시 불러오기</button>
                <button class="button secondary" type="button" data-action="copy-link">공책 링크 복사</button>
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
              <p class="eyebrow">내 공책 칸</p>
              <h2>프로필, 뽑기, 도감, 꾸미기를 한 장씩 넘겨요.</h2>
            </div>
            <p>모바일에서 바로 읽히도록, 탭 하나씩 천천히 넘기는 구조예요.</p>
          </div>

          <div class="player-console">
            <div class="tabbar" role="tablist" aria-label="플레이어 탭">
              ${renderTabButton("profile", "내 정보", "이름, 학교급, 오늘 기록")}
              ${renderTabButton("gacha", "뽑기", "티켓으로 꼬모를 뽑아요")}
              ${renderTabButton("collection", "도감", "모은 꼬모를 모아봐요")}
              ${renderTabButton("customize", "꾸미기", "이름과 프레임")}
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
              <p class="eyebrow">참여 기록</p>
              <h2>참여한 만큼 쌓인 것을<br />기록으로 봐요.</h2>
            </div>
            <p>출석, 복습, 방 기여, 뽑기권 같은 것들을 시간순으로 읽어요.</p>
          </div>

          <div class="reward-list">
            ${renderRewards(rewards)}
          </div>
        </section>

        ${drawResult ? renderDrawResult(drawResult) : ""}

        <footer>
          꼬모 · 공부는 카카오톡에서, 모으는 재미는 웹 공책에서
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
        <h3>내 정보</h3>
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
          <strong>뽑기 기계</strong>
          <p>작은 캡슐을 돌리듯, 꼬모를 하나씩 열어봐요.</p>
          <div class="gacha-machine" aria-hidden="true">
            <div class="gacha-orb">${escapeHtml(state.drawResult?.item?.icon ?? state.drawResult?.result?.icon ?? "◌")}</div>
          </div>
          <div class="field field-offset">
            <label for="ticketType">어떤 뽑기를 할까요?</label>
            <select id="ticketType" name="ticketType">
              <option value="normal">일반 뽑기권</option>
              <option value="special">특별 뽑기권</option>
            </select>
          </div>
          <div class="button-row button-row-tight">
            <button class="button primary" type="button" data-action="draw-gacha">뽑기</button>
          </div>
        </div>
        <div class="card card-surface">
          <strong>최근 결과</strong>
          ${state.drawResult ? renderDrawSummary(state.drawResult) : `<p>아직 뽑은 꼬모가 없어요. 한 번 돌리면 결과가 여기 열려요.</p>`}
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
        <h3>도감</h3>
        <div class="actions">
          <span class="inline-badge">총 ${collection.length}개</span>
        </div>
      </div>
      ${
        empty
          ? `
            <div class="empty-state">
              <strong>아직 모은 꼬모가 없어요.</strong>
              <p>뽑기를 한 번 돌리면 원형 카드로 차곡차곡 모이기 시작해요.</p>
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
          <p>웹 공책에 보이는 이름이에요. 플레이어 ID는 그대로 유지돼요.</p>
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
          <p>모은 꼬모 중에서 지금 마음에 드는 하나를 골라요.</p>
          <div class="field field-offset">
            <label for="representativeKkomo">선택</label>
            <select id="representativeKkomo" name="representativeKkomo">
              ${ownedChoices || `<option value="default">기본 꼬모</option>`}
            </select>
          </div>
        </div>
        <div class="card card-surface">
          <strong>프레임</strong>
          <p>웹 공책의 분위기를 프레임으로 살짝 바꿔요.</p>
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
        <strong>아직 쌓인 기록이 없어요.</strong>
        <p>퀴즈, 복습, 방 목표 기여가 쌓이면 여기에서 차곡차곡 보여줘요.</p>
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
      <div class="icon round-icon">${escapeHtml(item.icon)}</div>
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
          <h2>이번에 열린 꼬모예요.</h2>
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
    <div class="reward-item reward-item-hero">
      <div class="rarity ${rarity}">${rarity}</div>
      <div class="icon round-icon round-icon-large">${escapeHtml(icon)}</div>
      <strong>${escapeHtml(name)}</strong>
      <p>${converted ? `중복이라 파편 ${shardCount}개로 바뀌었어요.` : "새로운 꼬모를 만났어요."}</p>
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
      <strong>아직 열려 있지 않아요.</strong>
      <p>카카오에서 받은 열쇠 코드를 넣으면 프로필과 도감 미리보기가 살아나요.</p>
      <div class="button-row" style="justify-content:center;margin-top:14px">
        <button class="button primary" type="button" data-action="copy-link">링크 복사</button>
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
        <strong>이름</strong>
        <div class="value">${escapeHtml(name)}</div>
        <div class="meta">${escapeHtml(stage)} · ${escapeHtml(grade)}</div>
      </article>
      <article class="value-card">
        <strong>오늘 총점</strong>
        <div class="value">${totalScore}점</div>
        <div class="meta">참여한 만큼 천천히 쌓여요.</div>
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
    { rarity: "common", title: "잠금 카드", copy: "아직 못 얻은 꼬모는 그림자처럼 살짝만 보여줘요.", symbol: "◌" },
    { rarity: "rare", title: "원형 카드", copy: "얻은 꼬모는 둥근 카드로 모아두면 더 예뻐 보여요.", symbol: "◉" },
    { rarity: "epic", title: "파편 전환", copy: "중복 꼬모는 파편이 되어 다음 보상을 밀어줘요.", symbol: "◎" },
    { rarity: "legendary", title: "도감 한 장", copy: "가장 멋진 꼬모는 한 장만 봐도 기억에 남게 잡아요.", symbol: "✦" }
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
