import { useEffect, useMemo, useState } from "react";

type SnapshotResponse = {
  ok: boolean;
  data?: {
    modeHint: "profile";
    hasProfileData: boolean;
    hasConversationContext: boolean;
    followupDescription?: string;
    profile?: {
      stageLabel?: string;
      level?: number;
      totalXp?: number;
      jobLabel?: string;
      jobTierLabel?: string;
      equippedTitle?: string;
      todaySummary?: string;
    };
    analysis?: Array<{ subject: string; xp: number }>;
    memo?: {
      vocab?: number;
      formula?: number;
      science?: number;
      saja?: number;
    };
    tower?: {
      bossName?: string;
      totalDamage?: number;
      maxHp?: number;
      participantCount?: number;
      hint?: string;
    } | null;
    artifacts?: {
      summary?: string;
      catalog?: Array<{
        id: string;
        name: string;
        description: string;
        subject: string;
        unlockRule: string;
        unlocked: boolean;
        imagePath: string;
      }>;
    };
    shareCard?: {
      title?: string;
      subtitle?: string;
      body?: string;
      profileAnchorUrl?: string;
      memoAnchorUrl?: string;
      artifactsAnchorUrl?: string;
    };
  };
};

type ArtifactCard = {
  id: string;
  name: string;
  description: string;
  subject: string;
  unlockRule: string;
  unlocked: boolean;
  imagePath: string;
};

type LandingState =
  | { mode: "intro" }
  | { mode: "loading" }
  | { mode: "invalid-link"; reason: string }
  | { mode: "profile"; snapshot: NonNullable<SnapshotResponse["data"]> };

const DEFAULT_API_BASE = "https://kakao-study-groupbot-dev-inxmplcjia-du.a.run.app";

const FALLBACK_ARTIFACTS: ArtifactCard[] = [
  {
    id: "english-glossary-lantern",
    name: "해석의 등잔",
    description: "영어 개념과 어휘 공략을 밝히는 등잔이에요.",
    subject: "영어 유물",
    unlockRule: "2명 이상 방에서 영어 축 도전의 탑 등반 기여 시 해금",
    unlocked: false,
    imagePath: `${import.meta.env.BASE_URL}assets/artifacts/english-glossary-lantern.svg`
  },
  {
    id: "math-proof-compass",
    name: "증명의 나침반",
    description: "식과 풀이의 방향을 정리해 주는 나침반이에요.",
    subject: "수학 유물",
    unlockRule: "2명 이상 방에서 수학 축 도전의 탑 등반 기여 시 해금",
    unlocked: false,
    imagePath: `${import.meta.env.BASE_URL}assets/artifacts/math-proof-compass.svg`
  },
  {
    id: "science-observer-orb",
    name: "관측의 구체",
    description: "관찰 기록을 모아 탑 공략을 돕는 구체예요.",
    subject: "과학 유물",
    unlockRule: "2명 이상 방에서 과학 축 도전의 탑 등반 기여 시 해금",
    unlocked: false,
    imagePath: `${import.meta.env.BASE_URL}assets/artifacts/science-observer-orb.svg`
  },
  {
    id: "korean-archive-seal",
    name: "문해의 인장",
    description: "읽기와 표현의 흐름을 남기는 인장이에요.",
    subject: "국어 유물",
    unlockRule: "2명 이상 방에서 국어 축 도전의 탑 등반 기여 시 해금",
    unlocked: false,
    imagePath: `${import.meta.env.BASE_URL}assets/artifacts/korean-archive-seal.svg`
  }
];

function readQueryValue(params: URLSearchParams, key: string): string {
  return params.get(key)?.trim() || "";
}

function normalizeApiBase(raw: string): string {
  return (raw || DEFAULT_API_BASE).trim().replace(/\/+$/u, "");
}

function useLandingState(): LandingState {
  const [state, setState] = useState<LandingState>(() => {
    const params = new URLSearchParams(window.location.search);
    return readQueryValue(params, "userId") ? { mode: "loading" } : { mode: "intro" };
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const userId = readQueryValue(params, "userId");
    if (!userId) {
      setState({ mode: "intro" });
      return;
    }

    const apiBase = normalizeApiBase(readQueryValue(params, "apiBase"));
    const conversationKey = readQueryValue(params, "conversationKey");
    const url = new URL(`${apiBase}/api/public/landing-snapshot`);
    url.searchParams.set("userId", userId);
    if (conversationKey) {
      url.searchParams.set("conversationKey", conversationKey);
    }

    let cancelled = false;
    setState({ mode: "loading" });

    void fetch(url.toString())
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("열람 가능한 프로필 정보를 불러오지 못했습니다.");
        }

        const payload = (await response.json()) as SnapshotResponse;
        if (!payload.data?.hasProfileData || payload.data.modeHint !== "profile") {
          throw new Error("프로필 링크는 열렸지만 표시할 유저 기록이 아직 없습니다.");
        }

        if (!cancelled) {
          setState({ mode: "profile", snapshot: payload.data });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setState({
            mode: "invalid-link",
            reason: error instanceof Error ? error.message : "프로필 연결에 실패했습니다."
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

function IntroShell() {
  return (
    <main className="page mode-intro">
      <section className="intro-hero">
        <div className="intro-hero-copy">
          <p className="micro-label">KKOMO PROFILE READER</p>
          <h1>꼬모는 공부 결과를 예쁜 소개 카드가 아니라 한 사람의 학습 기록 원장으로 남긴다.</h1>
          <p className="lead">
            지금은 유효한 프로필 컨텍스트가 없어서 대기실 모드로 열렸다. 올바른 링크로 들어오면 이 페이지는 소개를 멈추고 곧바로 해당 유저의 기록판으로 바뀐다.
          </p>
        </div>
        <div className="intro-side-index">
          <span>OPEN SEQUENCE</span>
          <ol>
            <li>프로필 상세</li>
            <li>유저 분석표</li>
            <li>직업 · 호칭</li>
            <li>4기능 메모장</li>
            <li>협동 기록</li>
          </ol>
        </div>
      </section>

      <section className="intro-deck">
        <article className="deck-panel deck-panel-wide">
          <p className="micro-label">RECORD INDEX</p>
          <h2>꼬모가 기록하는 것</h2>
          <div className="index-grid">
            <div>
              <span>PROFILE</span>
              <strong>레벨 · 경험치 · 대표 호칭</strong>
            </div>
            <div>
              <span>ANALYSIS</span>
              <strong>과목별 XP와 주력 축</strong>
            </div>
            <div>
              <span>MEMO</span>
              <strong>영단어 · 수학공식 · 과학공식 · 사자성어</strong>
            </div>
            <div>
              <span>CO-OP RECORD</span>
              <strong>탑 진행과 유물 도감</strong>
            </div>
          </div>
        </article>

        <article className="deck-panel">
          <p className="micro-label">ENTRY RULE</p>
          <h2>이 화면은 서비스 소개보다 프로필 열람의 입구에 가깝다.</h2>
          <p>프로필 버튼이나 메모장 저장 이후 링크로 들어오면 실제 유저 기록만 보여준다. 샘플 유저 카드로 분위기만 꾸미는 방식은 쓰지 않는다.</p>
        </article>

        <article className="deck-panel deck-panel-accent">
          <p className="micro-label">READING ORDER</p>
          <h2>프로필과 메모가 전면, 탑과 유물은 뒤쪽 기록.</h2>
          <p>도전의 탑과 유물은 메인 광고가 아니라, 이미 쌓인 개인 기록 뒤에서 따라오는 협동 흔적으로 배치한다.</p>
        </article>
      </section>
    </main>
  );
}

function LoadingShell() {
  return (
    <main className="page state-page">
      <section className="state-shell">
        <p className="micro-label">LOADING</p>
        <h2>프로필 기록판을 불러오는 중입니다.</h2>
        <p>프로필 상세, 분석표, 메모장 현황, 협동 기록을 조합하고 있습니다.</p>
      </section>
    </main>
  );
}

function InvalidShell({ reason }: { reason: string }) {
  return (
    <main className="page state-page">
      <section className="state-shell">
        <p className="micro-label">INVALID LINK</p>
        <h2>열람 가능한 프로필 정보를 불러오지 못했습니다.</h2>
        <p>{reason}</p>
        <a className="plain-link" href={import.meta.env.BASE_URL}>
          소개 모드로 돌아가기
        </a>
      </section>
    </main>
  );
}

function ProfileShell({ snapshot }: { snapshot: NonNullable<SnapshotResponse["data"]> }) {
  const profile = snapshot.profile ?? {};
  const analysis = snapshot.analysis ?? [];
  const memo = snapshot.memo ?? {};
  const tower = snapshot.tower;
  const artifacts = snapshot.artifacts ?? {};
  const shareCard = snapshot.shareCard ?? {};
  const artifactCards = useMemo(
    () => (artifacts.catalog && artifacts.catalog.length > 0 ? artifacts.catalog : FALLBACK_ARTIFACTS),
    [artifacts.catalog]
  );

  return (
    <main className="page mode-profile">
      <section className="ledger-head">
        <div className="ledger-title">
          <p className="micro-label">PROFILE DOSSIER</p>
          <h1>{profile.stageLabel || "학습 프로필"} 기준으로 정리된 이 유저의 기록 원장</h1>
          <p className="lead">
            {snapshot.followupDescription || "프로필 상세와 분석표, 메모장을 먼저 읽고 협동 기록은 뒤에서 확인합니다."}
          </p>
        </div>
        <div className="ledger-status">
          <div className="status-chip">{snapshot.hasConversationContext ? "profile + tower" : "profile only"}</div>
          <div className="status-sheet">
            <span>현재 표지</span>
            <strong>{`Lv.${profile.level || 1} ${profile.jobLabel || "학습자"}`}</strong>
            <p>{`${profile.equippedTitle || "대표 호칭 없음"} · ${artifacts.summary || "유물 도감 비어 있음"}`}</p>
          </div>
        </div>
      </section>

      <nav className="rail-nav">
        <a href="#profile">Profile</a>
        <a href="#analysis">Analysis</a>
        <a href="#memo">Memo</a>
        <a href="#archive">Archive</a>
      </nav>

      <section className="profile-stage" id="profile">
        <article className="paper-sheet paper-sheet-primary">
          <p className="micro-label">PROFILE DETAIL</p>
          <div className="identity-head">
            <div>
              <h2>{profile.jobLabel || "학습자"}</h2>
              <p>{profile.jobTierLabel || "초기 단계"} · {profile.equippedTitle || "대표 호칭 없음"}</p>
            </div>
            <div className="identity-badge">
              <span>오늘 기록</span>
              <strong>{profile.todaySummary || "기록 대기 중"}</strong>
            </div>
          </div>
          <div className="stat-grid">
            <div>
              <span>학습 단계</span>
              <strong>{profile.stageLabel || "자동 맞춤"}</strong>
            </div>
            <div>
              <span>레벨</span>
              <strong>{`Lv.${profile.level || 1}`}</strong>
            </div>
            <div>
              <span>누적 XP</span>
              <strong>{`${profile.totalXp || 0} XP`}</strong>
            </div>
            <div>
              <span>대표 호칭</span>
              <strong>{profile.equippedTitle || "없음"}</strong>
            </div>
          </div>
        </article>

        <article className="paper-sheet paper-sheet-log" id="analysis">
          <p className="micro-label">ANALYSIS LOG</p>
          <h2>과목별 누적 흐름</h2>
          <div className="analysis-log">
            {(analysis.length > 0 ? analysis : [{ subject: "기록 없음", xp: 0 }]).map((entry, index) => (
              <div className="analysis-line" key={`${entry.subject}-${index}`}>
                <span>{entry.subject}</span>
                <strong>{`${entry.xp} XP`}</strong>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="memo-stage" id="memo">
        <article className="paper-sheet paper-sheet-memo">
          <div className="section-head">
            <div>
              <p className="micro-label">MEMO WORKSPACE</p>
              <h2>4기능 메모장</h2>
            </div>
            <p className="section-note">기억해야 할 항목은 메모장 쪽에 남고, 프로필은 그 누적 결과를 읽는 쪽에 가깝다.</p>
          </div>
          <div className="memo-shelf">
            <article>
              <span>영단어</span>
              <strong>{`${memo.vocab || 0}개`}</strong>
              <p>어휘와 표현 기록</p>
            </article>
            <article>
              <span>수학공식</span>
              <strong>{`${memo.formula || 0}개`}</strong>
              <p>풀이와 공식 기록</p>
            </article>
            <article>
              <span>과학공식</span>
              <strong>{`${memo.science || 0}개`}</strong>
              <p>원리와 실험 기록</p>
            </article>
            <article>
              <span>사자성어</span>
              <strong>{`${memo.saja || 0}개`}</strong>
              <p>문해와 표현 기록</p>
            </article>
          </div>
        </article>

        <article className="paper-sheet paper-sheet-side">
          <p className="micro-label">RECENT NOTE</p>
          <h2>최근 활동</h2>
          <p>{profile.todaySummary || artifacts.summary || "아직 오늘 기록이 없습니다. 메모장 저장과 문제 풀이가 쌓이면 여기에 요약됩니다."}</p>
        </article>
      </section>

      <section className="archive-stage" id="archive">
        <article className="paper-sheet paper-sheet-archive">
          <div className="section-head">
            <div>
              <p className="micro-label">CO-OP ARCHIVE</p>
              <h2>도전의 탑 요약</h2>
            </div>
            <p className="section-note">{tower?.hint || "도전의 탑 기록이 있으면 이 유저가 남긴 협동 흔적을 여기서 읽는다."}</p>
          </div>
          <div className="archive-strip">
            <div>
              <span>현재 구간</span>
              <strong>{tower?.bossName || "도전의 탑"}</strong>
            </div>
            <div>
              <span>진행도</span>
              <strong>{`${tower?.totalDamage || 0} / ${tower?.maxHp || 0}`}</strong>
            </div>
            <div>
              <span>방 참여</span>
              <strong>{`${tower?.participantCount || 0}명`}</strong>
            </div>
          </div>
        </article>

        <article className="paper-sheet paper-sheet-share">
          <p className="micro-label">PROFILE CARD</p>
          <h2>{shareCard.title || `${profile.jobLabel || "학습자"} · ${profile.equippedTitle || "대표 호칭 없음"}`}</h2>
          <p>{shareCard.subtitle || "profile snapshot"}</p>
          <small>{shareCard.body || artifacts.summary || "유물과 메모장이 아직 비어 있습니다."}</small>
          <div className="share-links">
            <a href={shareCard.profileAnchorUrl || "#profile"}>프로필</a>
            <a href={shareCard.memoAnchorUrl || "#memo"}>메모장</a>
            <a href={shareCard.artifactsAnchorUrl || "#artifacts"}>유물</a>
          </div>
        </article>
      </section>

      <section className="artifact-stage" id="artifacts">
        <div className="artifact-header">
          <div>
            <p className="micro-label">ARTIFACT ARCHIVE</p>
            <h2>유물 도감</h2>
          </div>
          <p>{artifacts.summary || "유물은 이 유저의 협동 기록 보조 지표다. 프로필 전면이 아니라 뒤쪽 아카이브에 배치한다."}</p>
        </div>
        <div className="artifact-wall">
          {artifactCards.map((artifact) => (
            <article className={`artifact-entry${artifact.unlocked ? " is-unlocked" : ""}`} key={artifact.id}>
              <div className="artifact-visual">
                <img src={artifact.imagePath} alt={artifact.name} loading="lazy" />
              </div>
              <div className="artifact-meta">
                <span>{artifact.subject}</span>
                <h3>{artifact.name}</h3>
                <p>{artifact.description}</p>
                <small>{artifact.unlocked ? "해금 완료" : artifact.unlockRule}</small>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

export default function App() {
  const state = useLandingState();
  if (state.mode === "intro") return <IntroShell />;
  if (state.mode === "loading") return <LoadingShell />;
  if (state.mode === "invalid-link") return <InvalidShell reason={state.reason} />;
  return <ProfileShell snapshot={state.snapshot} />;
}
