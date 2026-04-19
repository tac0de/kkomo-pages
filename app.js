const DEFAULT_API_BASE = "https://kakao-study-groupbot-dev-1028385057594.asia-northeast3.run.app";
const panels = Array.from(document.querySelectorAll("[data-flow-panel]"));
const buttons = Array.from(document.querySelectorAll("[data-flow-target]"));
const counters = Array.from(document.querySelectorAll("[data-countup]"));
const shareAnchors = Array.from(document.querySelectorAll("[data-share-anchor]"));
const params = new URLSearchParams(window.location.search);

function readQueryValue(key) {
  return params.get(key)?.trim() || "";
}

function normalizeApiBase(raw) {
  return (raw || DEFAULT_API_BASE).trim().replace(/\/+$/u, "");
}

function setField(name, value) {
  const node = document.querySelector(`[data-field="${name}"]`);
  if (node) {
    node.textContent = value;
  }
}

function setSectionFocus(hash) {
  document.querySelectorAll(".section-focus").forEach((node) => node.classList.remove("section-focus"));
  const target = document.querySelector(hash);
  if (target) {
    target.classList.add("section-focus");
  }
}

function activatePanel(target) {
  panels.forEach((panel) => {
    panel.classList.toggle("is-active", panel.dataset.flowPanel === target);
  });
}

buttons.forEach((button) => {
  button.addEventListener("click", () => {
    const target = button.dataset.flowTarget || "profile";
    activatePanel(target);
    window.location.hash = target === "memo" ? "memo" : "profile";
  });
});

shareAnchors.forEach((anchor) => {
  anchor.addEventListener("click", () => {
    const hash = `#${anchor.dataset.shareAnchor || "profile"}`;
    setSectionFocus(hash);
  });
});

function animateCounter(node) {
  const target = Number(node.dataset.countup || "0");
  if (!Number.isFinite(target) || target <= 0) {
    return;
  }
  const suffix = node.textContent?.replace(/^\d+/u, "") || "";
  let current = 0;
  const step = Math.max(1, Math.ceil(target / 28));
  const timer = window.setInterval(() => {
    current = Math.min(target, current + step);
    node.textContent = `${current}${suffix}`;
    if (current >= target) {
      window.clearInterval(timer);
    }
  }, 34);
}

counters.forEach((counter) => animateCounter(counter));
activatePanel(window.location.hash.replace(/^#/, "") === "memo" ? "memo" : "profile");
setSectionFocus(window.location.hash || "#profile");

async function hydrateLanding() {
  const userId = readQueryValue("userId");
  if (!userId) {
    return;
  }

  const apiBase = normalizeApiBase(readQueryValue("apiBase"));
  const conversationKey = readQueryValue("conversationKey");
  const url = new URL(`${apiBase}/api/public/landing-snapshot`);
  url.searchParams.set("userId", userId);
  if (conversationKey) {
    url.searchParams.set("conversationKey", conversationKey);
  }

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`landing_snapshot_${response.status}`);
  }

  const payload = await response.json();
  const data = payload?.data;
  if (!data) {
    return;
  }

  const profile = data.profile || {};
  const analysis = Array.isArray(data.analysis) ? data.analysis : [];
  const memo = data.memo || {};
  const tower = data.tower || null;
  const artifacts = data.artifacts || {};
  const shareCard = data.shareCard || {};

  setField("status-chip", conversationKey ? "도전의 탑 live snapshot" : "꼬모 프로필 snapshot");
  setField("hero-job", `Lv.${profile.level || 1} ${profile.jobLabel || "학습자"}`);
  setField(
    "hero-summary",
    `대표 호칭 ${profile.equippedTitle || "아직 없음"} · ${artifacts.summary || "유물 비어 있음"}`
  );
  setField(
    "hero-analysis",
    analysis.map((entry) => `${entry.subject} ${entry.xp}XP`).join(" · ") || "분석 데이터가 아직 없어요."
  );
  setField("hero-analysis-description", data.followupDescription || "프로필과 메모장을 바로 열 수 있어요.");
  setField(
    "profile-detail",
    `${profile.stageLabel || "자동 맞춤"} · Lv.${profile.level || 1} · ${profile.totalXp || 0}XP · ${profile.jobLabel || "학습자"}`
  );
  setField(
    "analysis-detail",
    analysis.map((entry) => `${entry.subject} ${entry.xp}XP`).join(" · ") || "과목 XP가 아직 쌓이지 않았어요."
  );
  setField(
    "identity-detail",
    `${profile.jobLabel || "학습자"} · ${profile.jobTierLabel || "초기"} · 대표 호칭 ${profile.equippedTitle || "아직 없음"}`
  );
  setField(
    "memo-detail",
    `영단어 ${memo.vocab || 0} · 수학공식 ${memo.formula || 0} · 과학공식 ${memo.science || 0} · 사자성어 ${memo.saja || 0}`
  );

  if (tower) {
    setField("tower-detail", tower.hint || "질문, 퀴즈, 메모를 섞어 쓰면 탑 진행이 빨라집니다.");
    setField("tower-name", tower.bossName || "도전의 탑");
    setField("tower-progress", `${tower.totalDamage || 0} / ${tower.maxHp || 0}`);
    setField("tower-participants", `${tower.participantCount || 0}명`);
  }

  setField("share-title", shareCard.title || `${profile.jobLabel || "학습자"} · ${profile.equippedTitle || "아직 없음"}`);
  setField("share-subtitle", shareCard.subtitle || "랜딩 허브 snapshot");
  setField("share-body", shareCard.body || artifacts.summary || "유물과 메모장이 아직 비어 있어요.");

  if (shareCard.profileAnchorUrl) {
    const profileAnchor = document.querySelector('[data-share-anchor="profile"]');
    if (profileAnchor) profileAnchor.setAttribute("href", shareCard.profileAnchorUrl);
  }
  if (shareCard.memoAnchorUrl) {
    const memoAnchor = document.querySelector('[data-share-anchor="memo"]');
    if (memoAnchor) memoAnchor.setAttribute("href", shareCard.memoAnchorUrl);
  }
  if (shareCard.artifactsAnchorUrl) {
    const artifactsAnchor = document.querySelector('[data-share-anchor="artifacts"]');
    if (artifactsAnchor) artifactsAnchor.setAttribute("href", shareCard.artifactsAnchorUrl);
  }
}

window.addEventListener("hashchange", () => {
  activatePanel(window.location.hash.replace(/^#/, "") === "memo" ? "memo" : "profile");
  setSectionFocus(window.location.hash || "#profile");
});

hydrateLanding().catch((error) => {
  setField("hero-analysis-description", `live snapshot 연결 실패: ${error instanceof Error ? error.message : String(error)}`);
});
