const DEFAULT_API_BASE = "https://kakao-study-groupbot-dev-inxmplcjia-du.a.run.app";
const params = new URLSearchParams(window.location.search);
const counters = Array.from(document.querySelectorAll("[data-countup]"));
const shareAnchors = Array.from(document.querySelectorAll("[data-share-anchor]"));
const body = document.body;

function readQueryValue(key) {
  return params.get(key)?.trim() || "";
}

function normalizeApiBase(raw) {
  return (raw || DEFAULT_API_BASE).trim().replace(/\/+$/u, "");
}

function setMode(mode) {
  body.dataset.mode = mode;
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

function applyHashFocus() {
  if (body.dataset.mode !== "profile") {
    return;
  }
  const hash = window.location.hash || "#profile";
  setSectionFocus(hash);
}

function animateCounter(node, targetValue) {
  const target = Number(targetValue);
  if (!Number.isFinite(target) || target < 0) {
    return;
  }
  const suffix = node.textContent?.replace(/^\d+/u, "") || "";
  let current = 0;
  const step = Math.max(1, Math.ceil(target / 24));
  const timer = window.setInterval(() => {
    current = Math.min(target, current + step);
    node.textContent = `${current}${suffix}`;
    if (current >= target) {
      window.clearInterval(timer);
    }
  }, 28);
}

function setCounter(name, value, suffix) {
  const node = document.querySelector(`[data-field="${name}"]`);
  if (!node) {
    return;
  }
  node.textContent = `0${suffix}`;
  animateCounter(node, value);
}

function renderIntroMode() {
  setMode("intro");
}

function renderInvalidMode(reason) {
  setField("invalid-reason", reason || "열람 가능한 프로필 정보를 불러오지 못했습니다.");
  setMode("invalid-link");
}

function renderProfileMode(data, conversationKey) {
  const profile = data.profile || {};
  const analysis = Array.isArray(data.analysis) ? data.analysis : [];
  const memo = data.memo || {};
  const tower = data.tower || null;
  const artifacts = data.artifacts || {};
  const shareCard = data.shareCard || {};

  setField("status-chip", conversationKey ? "profile + tower snapshot" : "profile snapshot");
  setField(
    "workspace-title",
    `${profile.stageLabel || "학습 프로필"} 기준으로 해당 유저의 기록판을 열람합니다.`
  );
  setField(
    "workspace-subtitle",
    data.followupDescription || "프로필 상세와 분석표, 메모장을 먼저 읽고 협동 기록은 아래에서 확인합니다."
  );
  setField("hero-job", `Lv.${profile.level || 1} ${profile.jobLabel || "학습자"}`);
  setField("hero-summary", `대표 호칭 ${profile.equippedTitle || "아직 없음"} · ${artifacts.summary || "유물 비어 있음"}`);
  setField(
    "hero-analysis",
    analysis.map((entry) => `${entry.subject} ${entry.xp}XP`).join(" · ") || "분석 데이터가 아직 없어요."
  );
  setField("hero-analysis-description", "주력 과목과 메모장 저장 패턴을 같이 보여줍니다.");
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
  setField("memo-vocab", `${memo.vocab || 0}개 저장`);
  setField("memo-formula", `${memo.formula || 0}개 저장`);
  setField("memo-science", `${memo.science || 0}개 저장`);
  setField("memo-saja", `${memo.saja || 0}개 저장`);
  setField(
    "recent-note",
    profile.todaySummary || artifacts.summary || "아직 오늘 기록이 없어요. 메모장과 퀴즈 기록이 쌓이면 여기에 요약됩니다."
  );
  setField(
    "tower-detail",
    tower?.hint || "도전의 탑 기록이 있으면 이 유저가 남긴 협동 등반 흔적을 보여줍니다."
  );
  setField("tower-name", tower?.bossName || "도전의 탑");
  setCounter("tower-progress", tower?.totalDamage || 0, ` / ${tower?.maxHp || 0}`);
  setCounter("tower-participants", tower?.participantCount || 0, "명");
  setField("artifact-summary", artifacts.summary || "아직 해금된 유물이 없습니다.");
  setField("share-title", shareCard.title || `${profile.jobLabel || "학습자"} · ${profile.equippedTitle || "아직 없음"}`);
  setField("share-subtitle", shareCard.subtitle || "프로필 snapshot");
  setField("share-body", shareCard.body || artifacts.summary || "유물과 메모장이 아직 비어 있어요.");

  const catalog = Array.isArray(artifacts.catalog) ? artifacts.catalog : [];
  catalog.forEach((artifact) => {
    const card = document.querySelector(`[data-artifact-id="${artifact.id}"]`);
    if (card) {
      card.dataset.unlocked = artifact.unlocked ? "true" : "false";
    }
    const stateNode = document.querySelector(`[data-artifact-state="${artifact.id}"]`);
    if (stateNode) {
      stateNode.textContent = artifact.unlocked ? "해금 완료" : artifact.unlockRule || "아직 해금 전";
    }
  });

  if (shareCard.profileAnchorUrl) {
    const profileAnchor = document.querySelector('[data-share-anchor="profile"]');
    if (profileAnchor) {
      profileAnchor.setAttribute("href", shareCard.profileAnchorUrl);
    }
  }
  if (shareCard.memoAnchorUrl) {
    const memoAnchor = document.querySelector('[data-share-anchor="memo"]');
    if (memoAnchor) {
      memoAnchor.setAttribute("href", shareCard.memoAnchorUrl);
    }
  }
  if (shareCard.artifactsAnchorUrl) {
    const artifactsAnchor = document.querySelector('[data-share-anchor="artifacts"]');
    if (artifactsAnchor) {
      artifactsAnchor.setAttribute("href", shareCard.artifactsAnchorUrl);
    }
  }

  setMode("profile");
  applyHashFocus();
}

async function hydrateLanding() {
  const userId = readQueryValue("userId");
  if (!userId) {
    renderIntroMode();
    return;
  }

  setMode("loading");
  const apiBase = normalizeApiBase(readQueryValue("apiBase"));
  const conversationKey = readQueryValue("conversationKey");
  const url = new URL(`${apiBase}/api/public/landing-snapshot`);
  url.searchParams.set("userId", userId);
  if (conversationKey) {
    url.searchParams.set("conversationKey", conversationKey);
  }

  try {
    const response = await fetch(url.toString());
    if (!response.ok) {
      renderInvalidMode("열람 가능한 프로필 정보를 불러오지 못했습니다. 카카오에서 다시 프로필 버튼으로 진입해 주세요.");
      return;
    }

    const payload = await response.json();
    const data = payload?.data;
    if (!data?.hasProfileData || data?.modeHint !== "profile") {
      renderInvalidMode("프로필 링크는 열렸지만, 실제로 표시할 유저 기록이 아직 없습니다.");
      return;
    }

    renderProfileMode(data, conversationKey);
  } catch (_error) {
    renderInvalidMode("프로필 연결에 실패했습니다. 잠시 후 다시 열거나 카카오에서 새 링크로 들어와 주세요.");
  }
}

shareAnchors.forEach((anchor) => {
  anchor.addEventListener("click", () => {
    window.requestAnimationFrame(() => applyHashFocus());
  });
});

window.addEventListener("hashchange", applyHashFocus);

void hydrateLanding();
