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
    <main className="reader-page reader-page-intro">
      <section className="waiting-room">
        <div className="waiting-room-head">
          <p className="eyebrow">KKOMO PROFILE READER</p>
          <h1>이 화면은 랜딩이 아니라 유저 기록판이 열리기 전 검문소다.</h1>
          <p className="intro-copy">
            꼬모는 데모 프로필로 분위기를 만들지 않는다. 유효한 링크가 없으면 서비스 홍보 대신 열람 규칙과 기록 항목만 보여주고, 실제 프로필이 들어오면 즉시 해당 유저 원장으로 전환한다.
          </p>
        </div>

        <div className="waiting-room-rail">
          <div className="rail-block">
            <span>ENTRY</span>
            <strong>프로필 버튼 또는 메모 저장 후 진입</strong>
          </div>
          <div className="rail-block">
            <span>DEFAULT</span>
            <strong>소개 모드 유지</strong>
          </div>
          <div className="rail-block">
            <span>UNLOCK</span>
            <strong>실제 유저 컨텍스트</strong>
          </div>
        </div>
      </section>

      <section className="protocol-grid">
        <article className="protocol-sheet protocol-sheet-major">
          <p className="eyebrow">READ ORDER</p>
          <div className="protocol-sequence">
            <div>
              <span>01</span>
              <strong>프로필 상세</strong>
            </div>
            <div>
              <span>02</span>
              <strong>유저 분석표</strong>
            </div>
            <div>
              <span>03</span>
              <strong>직업 · 호칭</strong>
            </div>
            <div>
              <span>04</span>
              <strong>4기능 메모장</strong>
            </div>
            <div>
              <span>05</span>
              <strong>협동 기록 아카이브</strong>
            </div>
          </div>
        </article>

        <article className="protocol-sheet">
          <p className="eyebrow">NO FAKE DATA</p>
          <h2>샘플 유저 카드, 가짜 랭킹, 허상 유물 전시는 금지.</h2>
          <p>프로필이 없으면 열람 규칙만 남긴다. 랜딩이 아니라 리더 대기실이다.</p>
        </article>

        <article className="protocol-sheet protocol-sheet-accent">
          <p className="eyebrow">READER STRUCTURE</p>
          <h2>프로필과 메모가 전면, 탑과 유물은 뒷장 아카이브.</h2>
          <p>협동 기록은 존재하지만 광고판이 아니다. 이미 쌓인 학습 이력 뒤에서 읽힌다.</p>
        </article>
      </section>

      <section className="index-wall">
        {[
          ["PROFILE", "레벨 · XP · 대표 호칭"],
          ["ANALYSIS", "과목별 누적 흐름과 주력 축"],
          ["MEMO", "영단어 · 수학공식 · 과학공식 · 사자성어"],
          ["ARCHIVE", "도전의 탑 흔적과 유물 도감"]
        ].map(([label, value]) => (
          <article className="index-slab" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </article>
        ))}
      </section>
    </main>
  );
}

function LoadingShell() {
  return (
    <main className="reader-page state-page">
      <section className="state-shell">
        <p className="eyebrow">LOADING</p>
        <h2>유저 기록판을 조립하는 중입니다.</h2>
        <p>프로필 상세, 분석표, 메모장, 협동 기록을 순서대로 정렬하고 있습니다.</p>
      </section>
    </main>
  );
}

function InvalidShell({ reason }: { reason: string }) {
  return (
    <main className="reader-page state-page">
      <section className="state-shell">
        <p className="eyebrow">INVALID LINK</p>
        <h2>열람 가능한 프로필 정보를 불러오지 못했습니다.</h2>
        <p>{reason}</p>
        <a className="action-chip" href={import.meta.env.BASE_URL}>
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
    <main className="reader-page reader-page-profile">
      <section className="reader-head">
        <div className="reader-head-copy">
          <p className="eyebrow">PROFILE DOSSIER</p>
          <h1>{profile.stageLabel || "학습 프로필"} 기준으로 정리된 이 유저의 기록 원장</h1>
          <p className="intro-copy">
            {snapshot.followupDescription || "프로필과 분석표를 먼저 읽고, 메모 기록과 협동 흔적을 뒤에서 확인합니다."}
          </p>
        </div>

        <div className="reader-head-status">
          <div className="status-flag">{snapshot.hasConversationContext ? "profile + co-op" : "profile only"}</div>
          <div className="status-card">
            <span>대표 표지</span>
            <strong>{`Lv.${profile.level || 1} ${profile.jobLabel || "학습자"}`}</strong>
            <p>{`${profile.equippedTitle || "대표 호칭 없음"} · ${artifacts.summary || "유물 기록 없음"}`}</p>
          </div>
        </div>
      </section>

      <nav className="reader-nav">
        <a href="#profile">Profile</a>
        <a href="#analysis">Analysis</a>
        <a href="#memo">Memo</a>
        <a href="#archive">Archive</a>
      </nav>

      <section className="reader-grid" id="profile">
        <article className="sheet sheet-identity">
          <p className="eyebrow">PROFILE DETAIL</p>
          <div className="identity-stack">
            <div>
              <h2>{profile.jobLabel || "학습자"}</h2>
              <p>{`${profile.jobTierLabel || "초기 단계"} · ${profile.equippedTitle || "대표 호칭 없음"}`}</p>
            </div>
            <div className="today-chip">
              <span>TODAY</span>
              <strong>{profile.todaySummary || "기록 대기 중"}</strong>
            </div>
          </div>
          <div className="stat-columns">
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

        <article className="sheet sheet-analysis" id="analysis">
          <div className="sheet-head">
            <div>
              <p className="eyebrow">ANALYSIS LOG</p>
              <h2>과목별 누적 흐름</h2>
            </div>
            <p>이 유저가 어느 축에 시간을 썼는지 XP 분포로 읽는다.</p>
          </div>
          <div className="analysis-ribbon">
            {(analysis.length > 0 ? analysis : [{ subject: "기록 없음", xp: 0 }]).map((entry, index) => (
              <div className="analysis-row" key={`${entry.subject}-${index}`}>
                <span>{entry.subject}</span>
                <strong>{`${entry.xp} XP`}</strong>
              </div>
            ))}
          </div>
        </article>

        <aside className="sheet sheet-aside">
          <p className="eyebrow">TRACE NOTE</p>
          <h2>최근 흔적</h2>
          <p>{profile.todaySummary || artifacts.summary || "아직 오늘 기록이 없습니다. 메모장 저장과 문제 풀이가 쌓이면 여기가 먼저 갱신됩니다."}</p>
        </aside>
      </section>

      <section className="memo-dock" id="memo">
        <div className="dock-head">
          <div>
            <p className="eyebrow">MEMO WORKSPACE</p>
            <h2>4기능 메모장</h2>
          </div>
          <p>저장 행위는 메모장에 남고, 프로필은 그 누적 결과를 읽는다.</p>
        </div>
        <div className="memo-grid">
          {[
            ["영단어", `${memo.vocab || 0}개`, "어휘와 표현 기록"],
            ["수학공식", `${memo.formula || 0}개`, "풀이와 공식 기록"],
            ["과학공식", `${memo.science || 0}개`, "원리와 실험 기록"],
            ["사자성어", `${memo.saja || 0}개`, "문해와 표현 기록"]
          ].map(([label, value, copy]) => (
            <article className="memo-card" key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
              <p>{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="archive-grid" id="archive">
        <article className="sheet sheet-tower">
          <div className="sheet-head">
            <div>
              <p className="eyebrow">CO-OP TRACE</p>
              <h2>도전의 탑 요약</h2>
            </div>
            <p>{tower?.hint || "협동 기록이 있을 때만 이 구간이 살아난다."}</p>
          </div>
          <div className="tower-grid">
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

        <article className="sheet sheet-share">
          <p className="eyebrow">ANCHOR CARD</p>
          <h2>{shareCard.title || `${profile.jobLabel || "학습자"} · ${profile.equippedTitle || "대표 호칭 없음"}`}</h2>
          <p>{shareCard.subtitle || "profile reader anchor"}</p>
          <small>{shareCard.body || artifacts.summary || "메모장과 유물 기록이 쌓이면 이 카드도 같이 바뀝니다."}</small>
          <div className="chip-row">
            <a href={shareCard.profileAnchorUrl || "#profile"}>프로필</a>
            <a href={shareCard.memoAnchorUrl || "#memo"}>메모장</a>
            <a href={shareCard.artifactsAnchorUrl || "#artifacts"}>유물</a>
          </div>
        </article>
      </section>

      <section className="artifact-archive" id="artifacts">
        <div className="dock-head">
          <div>
            <p className="eyebrow">ARTIFACT ARCHIVE</p>
            <h2>유물 도감</h2>
          </div>
          <p>{artifacts.summary || "유물은 전면 히어로가 아니라 협동 기록의 후면 인덱스다."}</p>
        </div>
        <div className="artifact-grid">
          {artifactCards.map((artifact) => (
            <article className={`artifact-card${artifact.unlocked ? " unlocked" : ""}`} key={artifact.id}>
              <div className="artifact-thumb">
                <img src={artifact.imagePath} alt={artifact.name} loading="lazy" />
              </div>
              <div className="artifact-copy">
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
