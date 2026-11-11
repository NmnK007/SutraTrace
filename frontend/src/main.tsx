import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Clock3,
  Database,
  FileCheck2,
  FileJson,
  FileText,
  Fingerprint,
  FolderOpen,
  GitBranch,
  HardDrive,
  LayoutDashboard,
  Link2,
  LoaderCircle,
  LockKeyhole,
  Maximize2,
  MessageSquareText,
  Minus,
  Network,
  Plus,
  Search,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Upload,
  X,
  AlertTriangle,
  RotateCcw,
  UserRound,
  Monitor,
  Globe,
  Hash,
  PanelLeftClose,
  Menu,
  CheckCircle2,
} from "lucide-react";
import type {
  Answer,
  Audit,
  Case,
  Event,
  Evidence,
  Finding,
  GEdge,
  GNode,
  Ledger,
  Workspace,
} from "./types";
import "./styles.css";

const NAV = [
  ["overview", "Overview", LayoutDashboard],
  ["evidence", "Evidence vault", Database],
  ["timeline", "Unified timeline", Activity],
  ["graph", "Relationship graph", Network],
  ["findings", "Findings", Fingerprint],
  ["copilot", "Investigation copilot", Sparkles],
  ["custody", "Chain of custody", Link2],
  ["reports", "Case reports", FileText],
] as const;
type View = (typeof NAV)[number][0];
type Selected =
  | { kind: "event"; data: Event }
  | { kind: "evidence"; data: Evidence }
  | { kind: "finding"; data: Finding }
  | { kind: "node"; data: GNode }
  | { kind: "edge"; data: GEdge };
const sourceColors: Record<string, string> = {
  authentication: "#c4f36a",
  endpoint: "#a991f7",
  network: "#69c6dd",
  browser: "#e9b86c",
  cloud: "#8aa0ed",
  email: "#ed8e9f",
  document: "#9da69b",
  media: "#dc9dc4",
  other: "#96a299",
};
const human = (s: string) => s.replaceAll("_", " ");
const bytes = (n: number) =>
  n >= 1048576
    ? `${(n / 1048576).toFixed(1)} MB`
    : n >= 1024
      ? `${(n / 1024).toFixed(1)} KB`
      : `${n} B`;
const short = (s: string) =>
  s.length > 28 ? s.slice(0, 15) + "…" + s.slice(-9) : s;
const date = (s: string | null, timeOnly = false) =>
  s
    ? new Intl.DateTimeFormat("en-GB", {
        timeZone: "UTC",
        ...(timeOnly ? {} : { day: "2-digit", month: "short" }),
        hour: "2-digit",
        minute: "2-digit",
        second: timeOnly ? "2-digit" : undefined,
      }).format(new Date(s))
    : "Time unresolved";
async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const form = body instanceof FormData;
  const response = await fetch("/api" + path, {
    method,
    credentials: "same-origin",
    headers: {
      "X-SutraTrace": "local-workspace",
      ...(!form && body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? (form ? body : JSON.stringify(body)) : undefined,
  });
  if (!response.ok) {
    const e = await response.json().catch(() => ({ detail: "Request failed" }));
    throw new Error(
      typeof e.detail === "string"
        ? e.detail
        : "Please check the required fields.",
    );
  }
  return response.json();
}
function Badge({
  children,
  tone = "muted",
}: {
  children: React.ReactNode;
  tone?: string;
}) {
  return <span className={"badge " + tone}>{children}</span>;
}
function Source({ name }: { name: string }) {
  return (
    <span className="source">
      <i style={{ background: sourceColors[name] || sourceColors.other }} />
      {human(name)}
    </span>
  );
}
function Empty({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <Fingerprint size={38} />
      <h3>{title}</h3>
      <p>{description}</p>
      {children}
    </div>
  );
}
function Weave() {
  return (
    <svg className="weave" viewBox="0 0 320 110" fill="none" aria-hidden="true">
      {Array.from({ length: 7 }, (_, i) => (
        <path
          key={i}
          d={`M -20 ${20 + i * 13} C 65 ${-50 + i * 18}, 175 ${170 - i * 18}, 340 ${-10 + i * 15}`}
          stroke="currentColor"
          strokeOpacity={0.12 + i * 0.07}
          strokeWidth="1.1"
        />
      ))}
      <path
        className="travel"
        d="M -20 59 C 65 4, 175 116, 340 35"
        stroke="currentColor"
        strokeWidth="2"
        strokeDasharray="8 180"
      />
    </svg>
  );
}

function App() {
  const [cases, setCases] = useState<Case[]>([]),
    [caseId, setCaseId] = useState(""),
    [data, setData] = useState<Workspace | null>(null),
    [view, setView] = useState<View>("overview");
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(""),
    [query, setQuery] = useState(""),
    [toast, setToast] = useState(""),
    [error, setError] = useState("");
  const [modal, setModal] = useState<"case" | "upload" | null>(null),
    [selected, setSelected] = useState<Selected | null>(null),
    [model, setModel] = useState<string | null>(null),
    [mobile, setMobile] = useState(false);
  const [source, setSource] = useState("all"),
    [eventType, setEventType] = useState("all"),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [findingFilter, setFindingFilter] = useState("all");
  const [answer, setAnswer] = useState<Answer | null>(null),
    [question, setQuestion] = useState(""),
    [useModel, setUseModel] = useState(false),
    [reviewNote, setReviewNote] = useState("");
  const [ledgerResult, setLedgerResult] = useState<Ledger | null>(null),
    [checkpoint, setCheckpoint] = useState("");
  const detailRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    (async () => {
      try {
        const session = await api<{ model: string | null }>("/session");
        setModel(session.model);
        const all = await api<Case[]>("/cases");
        setCases(all);
        const previous = localStorage.getItem("sutratrace-case");
        setCaseId(all.find((c) => c.id === previous)?.id || all[0]?.id || "");
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);
  useEffect(() => {
    if (!caseId) {
      setData(null);
      return;
    }
    let alive = true;
    setLoading(true);
    setSelected(null);
    setAnswer(null);
    setQuery("");
    setSource("all");
    setFrom("");
    setTo("");
    setEventType("all");
    setLedgerResult(null);
    api<Workspace>("/cases/" + caseId)
      .then((x) => {
        if (alive) {
          setData(x);
          localStorage.setItem("sutratrace-case", caseId);
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [caseId]);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(""), 4500);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelected(null);
        setModal(null);
        setMobile(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  async function refresh() {
    if (caseId) {
      const d = await api<Workspace>("/cases/" + caseId);
      setData(d);
      return d;
    }
  }
  async function act(
    name: string,
    fn: () => Promise<unknown>,
    success?: string,
  ) {
    if (busy) return;
    setBusy(name);
    setError("");
    try {
      await fn();
      if (success) setToast(success);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }
  function navigate(next: View) {
    window.scrollTo(0, 0);
    setView(next);
    setQuery("");
    setSource("all");
    setSelected(null);
    setMobile(false);
  }
  async function loadDemo() {
    await act(
      "demo",
      async () => {
        const c = await api<Case>("/demo", "POST");
        setCases(await api<Case[]>("/cases"));
        setCaseId(c.id);
        setView("overview");
      },
      "Synthetic investigation loaded",
    );
  }
  async function selectEvidence(e: Evidence) {
    setSelected({ kind: "evidence", data: e });
    try {
      const current = await api<Evidence>(`/cases/${caseId}/evidence/${e.id}`);
      setSelected({ kind: "evidence", data: current });
      await refresh();
    } catch (error) {
      setError(String(error));
    }
  }
  function selectEvent(id: string) {
    const e = data?.events.find((e) => e.id === id);
    if (e) setSelected({ kind: "event", data: e });
  }
  function selectFinding(f: Finding) {
    setReviewNote(f.review_note || "");
    setSelected({ kind: "finding", data: f });
  }
  async function exportReport(format: "json" | "md") {
    await act(
      "export",
      async () => {
        const res = await fetch(`/api/cases/${caseId}/report?format=${format}`);
        if (!res.ok) throw new Error("Report export failed");
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `SutraTrace-${caseId}.${format}`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        await refresh();
      },
      "Report exported with fresh integrity checks",
    );
  }
  async function submitAsk(q = question) {
    if (!q.trim()) return;
    setQuestion(q);
    await act("ask", async () => {
      setAnswer(
        await api<Answer>(`/cases/${caseId}/ask`, "POST", {
          question: q,
          use_model: useModel,
        }),
      );
      await refresh();
    });
  }
  const events = (data?.events || []).filter(
    (e) =>
      (source === "all" || e.source_type === source) &&
      (eventType === "all" || e.event_type === eventType) &&
      (!query ||
        JSON.stringify(e).toLowerCase().includes(query.toLowerCase())) &&
      (!from ||
        (e.timestamp_utc &&
          e.timestamp_utc >= new Date(from + "Z").toISOString())) &&
      (!to ||
        (e.timestamp_utc &&
          e.timestamp_utc <= new Date(to + "Z").toISOString())),
  );
  const evidence = (data?.evidence || []).filter(
    (e) =>
      (source === "all" || source === e.source_type) &&
      (!query || JSON.stringify(e).toLowerCase().includes(query.toLowerCase())),
  );
  const findings = (data?.findings || []).filter(
    (f) =>
      (findingFilter === "all" || f.status === findingFilter) &&
      (!query || JSON.stringify(f).toLowerCase().includes(query.toLowerCase())),
  );
  const unreviewed =
    data?.findings.filter((f) => f.status === "unreviewed").length || 0;
  const verified =
    data?.evidence.filter((e) => e.verification_status === "verified").length ||
    0;
  const uncertain = data?.events.filter((e) => !e.timestamp_utc).length || 0;
  const entityCount =
    data?.graph.nodes.filter((n) => n.type !== "event").length || 0;
  const currentTitle = NAV.find((n) => n[0] === view)?.[1];
  const eventCitations = (ids: string[]) => (
    <div className="citations">
      {ids.map((id) => (
        <button key={id} onClick={() => selectEvent(id)}>
          <FileText size={12} />
          {data?.events.find((e) => e.id === id)?.source_locator || id}
          <ArrowUpRight size={11} />
        </button>
      ))}
    </div>
  );
  const evidenceCitations = (ids: string[]) => (
    <div className="citations">
      {ids.map((id) => {
        const ev = data?.evidence.find((e) => e.id === id);
        return ev ? (
          <button key={id} onClick={() => selectEvidence(ev)}>
            <Database size={12} />
            {ev.filename}
            <ArrowUpRight size={11} />
          </button>
        ) : null;
      })}
    </div>
  );
  const sourceFilter = (
    <label className="select-wrap">
      <SlidersHorizontal size={14} />
      <select
        aria-label="Source filter"
        value={source}
        onChange={(e) => setSource(e.target.value)}
      >
        <option value="all">All sources</option>
        {Object.keys(sourceColors).map((s) => (
          <option key={s} value={s}>
            {human(s)}
          </option>
        ))}
      </select>
    </label>
  );
  const downloadEvidence = (e: Evidence) =>
    act(
      "download",
      async () => {
        const response = await fetch(
          `/api/cases/${caseId}/evidence/${e.id}/download`,
        );
        if (!response.ok) {
          const j = await response.json();
          throw new Error(j.detail);
        }
        const url = URL.createObjectURL(await response.blob());
        const a = document.createElement("a");
        a.href = url;
        a.download = e.filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        await refresh();
      },
      "Original exported after integrity verification",
    );

  return (
    <div className={"app " + (mobile ? "mobile-open" : "")}>
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate("overview");
          }}
        >
          <span className="brand-mark">
            <Fingerprint size={27} />
          </span>
          <span>
            Sutra<span className="brand-light">Trace</span>
            <small>EVERY TRACE CONNECTS</small>
          </span>
        </a>
        <button className="workspace-switch" onClick={() => setModal("case")}>
          <span className="workspace-icon">
            <FolderOpen size={18} />
          </span>
          <span>
            Investigation workspace<small>Local environment</small>
          </span>
          <Plus size={15} />
        </button>
        <div className="nav-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {NAV.map(([id, label, Icon], i) => (
            <React.Fragment key={id}>
              {i === 6 && <div className="nav-label second">GOVERNANCE</div>}
              <button
                className={view === id ? "nav-item active" : "nav-item"}
                onClick={() => navigate(id)}
              >
                <Icon size={18} />
                <span>{label}</span>
                {id === "findings" && unreviewed > 0 && <b>{unreviewed}</b>}
                {id === "copilot" && <span className="tiny">AI</span>}
              </button>
            </React.Fragment>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="privacy-card">
            <LockKeyhole size={17} />
            <strong>Your evidence stays here.</strong>
            <p>
              Local storage. Local intelligence.
              <br />
              You control the investigation.
            </p>
            <span>
              <i className="status-dot" /> Running on your device
            </span>
          </div>
          <div className="profile">
            <span className="avatar">
              {data?.case.owner.slice(0, 2).toUpperCase() || "IN"}
            </span>
            <span>
              {data?.case.owner || "Investigator"}
              <small>Single-investigator workspace</small>
            </span>
            <ShieldCheck size={16} />
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            aria-label="Toggle navigation"
            onClick={() => setMobile(!mobile)}
          >
            <Menu size={20} />
          </button>
          <div className="breadcrumb">
            Workspace <ChevronRight size={13} />
            <span>{currentTitle}</span>
          </div>
          <div className="top-tools">
            <label className="global-search">
              <Search size={16} />
              <input
                aria-label="Search current view"
                placeholder="Search this view…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <kbd>⌕</kbd>
            </label>
            <span className="local-badge">
              <span className="status-dot" /> Local workspace
            </span>
            <span className="top-avatar">
              <UserRound size={17} />
            </span>
          </div>
        </header>
        <main>
          {error && (
            <div role="alert" className="error-banner">
              <AlertTriangle size={17} />
              <span>{error}</span>
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {loading ? (
            <div className="loading">
              <LoaderCircle className="spin" />
              <p>Opening your investigation…</p>
            </div>
          ) : !data ? (
            <div className="onboarding">
              <div className="onboarding-art">
                <Weave />
                <Fingerprint size={66} />
              </div>
              <span className="eyebrow">THE INVESTIGATION STARTS HERE</span>
              <h1>
                Scattered evidence.
                <br />
                <em>Connected understanding.</em>
              </h1>
              <p>
                Preserve every artifact. Reconstruct the sequence.
                <br />
                Follow every finding back to its source.
              </p>
              <div className="button-row">
                <button className="primary" onClick={() => setModal("case")}>
                  <Plus size={16} />
                  Create your first case
                </button>
                <button
                  className="secondary"
                  disabled={!!busy}
                  onClick={loadDemo}
                >
                  {busy === "demo" ? (
                    <LoaderCircle className="spin" size={16} />
                  ) : (
                    <GitBranch size={16} />
                  )}
                  Explore the demo case
                </button>
              </div>
              <small>
                Demo records are synthetic. No evidence leaves this computer.
              </small>
            </div>
          ) : (
            <>
              <div className="case-bar">
                <div className="case-select">
                  <FolderOpen size={16} />
                  <select
                    aria-label="Active case"
                    disabled={!!busy}
                    value={caseId}
                    onChange={(e) => setCaseId(e.target.value)}
                  >
                    {cases.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={13} />
                  <Badge tone={data.case.synthetic ? "amber" : "green"}>
                    {data.case.synthetic ? "SYNTHETIC DEMO" : "ACTIVE CASE"}
                  </Badge>
                </div>
                <button
                  className="text-button"
                  onClick={() => setModal("case")}
                >
                  <Plus size={14} />
                  New case
                </button>
              </div>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">
                    {view === "overview"
                      ? "YOUR INVESTIGATION, CONNECTED"
                      : data.case.id}
                  </span>
                  <h1>
                    {view === "overview" ? (
                      <>
                        Follow the <em>evidence.</em>
                      </>
                    ) : (
                      currentTitle
                    )}
                  </h1>
                  <p>
                    {
                      {
                        overview:
                          "From scattered artifacts to a defensible incident story.",
                        evidence:
                          "Preserved originals. Traceable origins. Verifiable integrity.",
                        timeline:
                          "One sequence of events, with every source a click away.",
                        graph:
                          "Explore the relationships. Inspect the reason behind every link.",
                        findings:
                          "Explainable leads, waiting for investigator judgment.",
                        copilot:
                          "Ask better questions. Get back to the evidence.",
                        custody:
                          "A traceable history of how each artifact was handled.",
                        reports:
                          "Turn reviewed findings into a source-linked investigation record.",
                      }[view]
                    }
                  </p>
                </div>
                <div className="button-row">
                  {view === "overview" || view === "evidence" ? (
                    <>
                      <button
                        className="secondary"
                        disabled={!!busy}
                        onClick={() =>
                          act(
                            "verify",
                            async () => {
                              await api(`/cases/${caseId}/verify`, "POST");
                              await refresh();
                            },
                            "Integrity checks completed; review each result",
                          )
                        }
                      >
                        <ShieldCheck size={15} />
                        Verify integrity
                      </button>
                      <button
                        className="primary"
                        onClick={() => setModal("upload")}
                      >
                        <Plus size={16} />
                        Add evidence
                      </button>
                    </>
                  ) : view === "findings" ? (
                    <button
                      className="primary"
                      disabled={!!busy}
                      onClick={() =>
                        act(
                          "triage",
                          async () => {
                            await api(`/cases/${caseId}/triage`, "POST");
                            await refresh();
                          },
                          "Triage completed; existing review decisions preserved",
                        )
                      }
                    >
                      <RotateCcw size={15} />
                      Run triage
                    </button>
                  ) : view === "reports" ? (
                    <button
                      className="primary"
                      disabled={!!busy}
                      onClick={() => exportReport("md")}
                    >
                      <ArrowDownToLine size={16} />
                      Export report
                    </button>
                  ) : null}
                </div>
              </div>

              {view === "overview" && (
                <>
                  <div className="metrics">
                    <Metric
                      label="Evidence preserved"
                      value={data.evidence.length}
                      icon={<Database />}
                      foot={`${new Set(data.evidence.map((e) => e.source_type)).size} source categories`}
                      accent
                    />
                    <Metric
                      label="Integrity verified"
                      value={`${verified}/${data.evidence.length}`}
                      icon={<ShieldCheck />}
                      foot="Against recorded intake hashes"
                    />
                    <Metric
                      label="Findings to review"
                      value={unreviewed}
                      icon={<Fingerprint />}
                      foot={`${data.findings.filter((f) => f.severity === "high" && f.status === "unreviewed").length} high-priority leads`}
                      amber
                    />
                    <Metric
                      label="Connected entities"
                      value={entityCount}
                      icon={<Network />}
                      foot={`Across ${data.events.length} source records`}
                    />
                  </div>
                  <div className="dashboard-grid">
                    <section className="card activity-card">
                      <CardTitle
                        title="Incident activity"
                        subtitle="Chronological activity across your evidence"
                        right={
                          <button
                            className="text-button"
                            onClick={() => navigate("timeline")}
                          >
                            Open timeline
                            <ArrowUpRight size={14} />
                          </button>
                        }
                      />
                      <ActivityChart events={events} onSelect={selectEvent} />
                      <div className="chart-footer">
                        <span>
                          <i className="status-dot" />
                          {events.filter((e) => e.timestamp_utc).length} timed
                          observations
                        </span>
                        <span>UTC · source clocks unverified</span>
                      </div>
                    </section>
                    <section className="card priority-card">
                      <CardTitle
                        title="Priority findings"
                        right={
                          <Badge tone="amber">{unreviewed} to review</Badge>
                        }
                      />
                      {findings.slice(0, 3).map((f, i) => (
                        <button
                          className="priority-row"
                          key={f.id}
                          onClick={() => selectFinding(f)}
                        >
                          <span className={"finding-number " + f.severity}>
                            0{i + 1}
                          </span>
                          <span>
                            <strong>{f.title}</strong>
                            <small>
                              {f.event_ids.length} source records ·{" "}
                              {human(f.status)}
                            </small>
                          </span>
                          <ArrowUpRight size={15} />
                        </button>
                      ))}
                      {findings.length === 0 && (
                        <div className="small-empty">
                          No rule-based leads in the current evidence.
                        </div>
                      )}
                      <button
                        className="card-bottom-link"
                        onClick={() => navigate("findings")}
                      >
                        View all findings
                        <ArrowRight size={15} />
                      </button>
                    </section>
                    <section className="card overview-graph">
                      <CardTitle
                        title="The evidence, connected"
                        subtitle="Exact field relationships · select a node to inspect"
                        right={
                          <button
                            className="icon-button"
                            aria-label="Open full graph"
                            onClick={() => navigate("graph")}
                          >
                            <Maximize2 size={15} />
                          </button>
                        }
                      />
                      <Graph
                        nodes={data.graph.nodes}
                        edges={data.graph.edges}
                        compact
                        onNode={(n) => setSelected({ kind: "node", data: n })}
                        onEdge={(e) => setSelected({ kind: "edge", data: e })}
                      />
                      <div className="graph-legend">
                        <span>
                          <i style={{ background: "#c4f36a" }} />
                          Account
                        </span>
                        <span>
                          <i style={{ background: "#a991f7" }} />
                          Device
                        </span>
                        <span>
                          <i style={{ background: "#69c6dd" }} />
                          Network
                        </span>
                        <span>
                          <i style={{ background: "#e9b86c" }} />
                          Artifact / event
                        </span>
                      </div>
                    </section>
                    <section className="card copilot-card">
                      <div className="copilot-visual">
                        <Weave />
                        <span>
                          <Sparkles size={26} />
                        </span>
                      </div>
                      <Badge tone="green">EVIDENCE FIRST</Badge>
                      <h2>
                        A second perspective.
                        <br />
                        Grounded in your case.
                      </h2>
                      <p>
                        Find supporting records, explore the sequence, and
                        surface what still needs an answer.
                      </p>
                      <button
                        className="copilot-prompt"
                        onClick={() => {
                          navigate("copilot");
                          setQuestion("What evidence supports the transfer?");
                        }}
                      >
                        <span>What supports the suspected transfer?</span>
                        <ArrowUpRight size={17} />
                      </button>
                      <small>
                        <LockKeyhole size={12} />
                        {model
                          ? `Local model: ${model}`
                          : "Evidence search ready · local AI optional"}
                      </small>
                    </section>
                    <section className="card wide">
                      <CardTitle
                        title="Evidence inventory"
                        subtitle="Every original has a fingerprint and a history"
                        right={
                          <button
                            className="text-button"
                            onClick={() => navigate("evidence")}
                          >
                            View all evidence
                            <ArrowUpRight size={14} />
                          </button>
                        }
                      />
                      <EvidenceTable
                        rows={evidence.slice(0, 5)}
                        onSelect={selectEvidence}
                      />
                    </section>
                  </div>
                </>
              )}

              {view === "evidence" && (
                <>
                  <div className="toolbar">
                    <div className="tab-pills">
                      <button className="selected">
                        All evidence <b>{data.evidence.length}</b>
                      </button>
                      <span>
                        {bytes(data.evidence.reduce((n, e) => n + e.size, 0))}{" "}
                        preserved
                      </span>
                    </div>
                    {sourceFilter}
                  </div>
                  <section className="card">
                    <EvidenceTable rows={evidence} onSelect={selectEvidence} />
                  </section>
                  <div className="subtle-note">
                    <ShieldCheck size={15} />A verified hash confirms byte
                    consistency with intake. It does not establish historical
                    authenticity or authorship.
                  </div>
                </>
              )}

              {view === "timeline" && (
                <>
                  <div className="toolbar timeline-toolbar">
                    {sourceFilter}
                    <label className="select-wrap">
                      <select
                        aria-label="Event type"
                        value={eventType}
                        onChange={(e) => setEventType(e.target.value)}
                      >
                        <option value="all">All event types</option>
                        {[...new Set(data.events.map((e) => e.event_type))].map(
                          (t) => (
                            <option key={t} value={t}>
                              {human(t)}
                            </option>
                          ),
                        )}
                      </select>
                    </label>
                    <label className="date-filter">
                      From (UTC)
                      <input
                        aria-label="From UTC"
                        type="datetime-local"
                        value={from}
                        onChange={(e) => setFrom(e.target.value)}
                      />
                    </label>
                    <label className="date-filter">
                      To (UTC)
                      <input
                        aria-label="To UTC"
                        type="datetime-local"
                        value={to}
                        onChange={(e) => setTo(e.target.value)}
                      />
                    </label>
                    <button
                      className="text-button"
                      onClick={() => {
                        setFrom("");
                        setTo("");
                        setEventType("all");
                        setSource("all");
                        setQuery("");
                      }}
                    >
                      Reset
                    </button>
                  </div>
                  <section className="card">
                    <CardTitle
                      title={`${events.length} source observations`}
                      subtitle="Original timestamps and source locations are retained"
                      right={
                        <Badge tone="amber">{uncertain} unresolved times</Badge>
                      }
                    />
                    <div className="timeline">
                      {events.map((e, i) => (
                        <button
                          className="timeline-row"
                          key={e.id}
                          onClick={() => selectEvent(e.id)}
                        >
                          <div className="timeline-time">
                            <strong>{date(e.timestamp_utc, true)}</strong>
                            <small>
                              {e.timestamp_utc
                                ? date(e.timestamp_utc).split(",")[0]
                                : "Not time ordered"}
                            </small>
                          </div>
                          <div className="timeline-track">
                            <span
                              style={{
                                borderColor: sourceColors[e.source_type],
                              }}
                            />
                            {i < events.length - 1 && <i />}
                          </div>
                          <div className="timeline-content">
                            <div>
                              <Source name={e.source_type} />
                              <span className="mono">{e.source_locator}</span>
                              {!e.timestamp_utc && (
                                <Badge tone="amber">
                                  {human(e.timestamp_quality)}
                                </Badge>
                              )}
                            </div>
                            <strong>{e.description.slice(0, 180)}</strong>
                            <p>
                              {[
                                e.actor,
                                e.device,
                                e.object || e.destination || e.ip,
                              ]
                                .filter(Boolean)
                                .join("  ·  ") || e.filename}
                            </p>
                          </div>
                          <ArrowUpRight size={15} />
                        </button>
                      ))}
                      {!events.length && (
                        <Empty
                          title="No matching events"
                          description="Adjust the filters or import a supported source."
                        />
                      )}
                    </div>
                  </section>
                </>
              )}

              {view === "graph" && (
                <>
                  <div className="toolbar">
                    <span className="muted">
                      {data.graph.nodes.length} nodes ·{" "}
                      {data.graph.edges.length} sourced relationships
                    </span>
                    {sourceFilter}
                  </div>
                  <section className="card full-graph">
                    <Graph
                      nodes={data.graph.nodes.filter((n) =>
                        n.event_ids.some((id) =>
                          events.some((e) => e.id === id),
                        ),
                      )}
                      edges={data.graph.edges.filter((e) =>
                        events.some((x) => x.id === e.event_id),
                      )}
                      onNode={(n) => setSelected({ kind: "node", data: n })}
                      onEdge={(e) => setSelected({ kind: "edge", data: e })}
                    />
                  </section>
                  <div className="subtle-note">
                    <Link2 size={15} />
                    {data.graph.limitation} Select an edge to inspect its source
                    and matching rule.
                  </div>
                </>
              )}

              {view === "findings" && (
                <>
                  <div className="toolbar">
                    <div className="tab-pills">
                      {[
                        "all",
                        "unreviewed",
                        "accepted",
                        "needs_followup",
                        "rejected",
                      ].map((s) => (
                        <button
                          key={s}
                          className={findingFilter === s ? "selected" : ""}
                          onClick={() => setFindingFilter(s)}
                        >
                          {s === "all" ? "All findings" : human(s)}
                        </button>
                      ))}
                    </div>
                    <span className="muted">
                      Rule set 1.0 · {findings.length} leads
                    </span>
                  </div>
                  <div className="findings-grid">
                    {findings.map((f) => (
                      <article className="card finding-card" key={f.id}>
                        <div className="finding-top">
                          <Badge
                            tone={
                              f.severity === "high"
                                ? "red"
                                : f.severity === "medium"
                                  ? "amber"
                                  : "muted"
                            }
                          >
                            {f.severity} priority
                          </Badge>
                          <Badge
                            tone={f.status === "accepted" ? "green" : "muted"}
                          >
                            {human(f.status)}
                          </Badge>
                        </div>
                        <h2>{f.title}</h2>
                        <p>{f.explanation}</p>
                        {eventCitations(f.event_ids)}
                        {!f.event_ids.length &&
                          evidenceCitations(f.evidence_ids)}
                        <div className="finding-caveat">
                          <AlertTriangle size={14} />
                          {f.limitations}
                        </div>
                        <button
                          className="card-bottom-link"
                          onClick={() => selectFinding(f)}
                        >
                          Inspect & review
                          <ArrowRight size={15} />
                        </button>
                      </article>
                    ))}
                  </div>
                  {!findings.length && (
                    <Empty
                      title="No findings in this view"
                      description="Try another review status or import evidence and run triage."
                    />
                  )}
                </>
              )}

              {view === "copilot" && (
                <div className="copilot-layout">
                  <section className="card chat-card">
                    <div className="chat-top">
                      <span className="ai-mark">
                        <Sparkles size={18} />
                      </span>
                      <div>
                        <strong>SutraTrace copilot</strong>
                        <small>
                          {useModel && model
                            ? `Local AI · ${model}`
                            : "Evidence search · no generative model"}
                        </small>
                      </div>
                      <Badge tone="green">
                        <LockKeyhole size={11} />
                        Local only
                      </Badge>
                    </div>
                    <div className="chat-body">
                      {!answer ? (
                        <div className="chat-welcome">
                          <Fingerprint size={43} />
                          <h2>
                            Start with a question.
                            <br />
                            <em>Follow it to the source.</em>
                          </h2>
                          <p>
                            Search the records in this case. Every result links
                            to the original evidence.
                          </p>
                          <div className="suggestions">
                            {[
                              "Summarize the incident timeline",
                              "What evidence supports the transfer?",
                              "Show login failures",
                              "Which records mention Project Orion?",
                            ].map((q) => (
                              <button
                                key={q}
                                onClick={() => submitAsk(q)}
                                disabled={!!busy}
                              >
                                {q}
                                <ArrowUpRight size={14} />
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="user-question">
                            <UserRound size={18} />
                            <p>{answer.question ?? question}</p>
                          </div>
                          <div className="answer">
                            <Badge
                              tone={
                                answer.mode === "local_ai" ? "green" : "muted"
                              }
                            >
                              {human(answer.mode)}
                            </Badge>
                            <h3>{answer.answer}</h3>
                            {answer.claims.map((c, i) => (
                              <div className="claim" key={i}>
                                <span className="eyebrow">
                                  {c.kind === "hypothesis"
                                    ? "AI HYPOTHESIS · REQUIRES REVIEW"
                                    : "SOURCE OBSERVATION"}
                                </span>
                                <p>{c.text}</p>
                                {c.quote && <blockquote>{c.quote}</blockquote>}
                                {eventCitations(c.citations)}
                              </div>
                            ))}
                            <div className="finding-caveat">
                              <AlertTriangle size={15} />
                              <span>{answer.limitations.join(" ")}</span>
                            </div>
                          </div>
                        </>
                      )}
                      {busy === "ask" && (
                        <div className="thinking">
                          <LoaderCircle size={17} className="spin" />
                          Retrieving case evidence
                          {useModel ? " and consulting the local model" : ""}…
                        </div>
                      )}
                    </div>
                    <form
                      className="chat-input"
                      onSubmit={(e) => {
                        e.preventDefault();
                        submitAsk();
                      }}
                    >
                      <div>
                        <input
                          aria-label="Investigation question"
                          value={question}
                          onChange={(e) => setQuestion(e.target.value)}
                          placeholder="Ask about an account, artifact, or sequence…"
                          maxLength={2000}
                        />
                        <button
                          type="submit"
                          className="primary icon-button"
                          disabled={!!busy || !question.trim()}
                          aria-label="Send question"
                        >
                          <Send size={17} />
                        </button>
                      </div>
                      <label>
                        <input
                          type="checkbox"
                          checked={useModel}
                          onChange={(e) => setUseModel(e.target.checked)}
                          disabled={!model}
                        />
                        Use local AI{" "}
                        {model ? `(${model})` : "— configure Ollama to enable"}
                      </label>
                    </form>
                  </section>
                  <aside className="card source-panel">
                    <CardTitle
                      title="Source context"
                      subtitle="Records retrieved for your question"
                    />
                    {answer?.citations.length ? (
                      answer.citations.map((c) => (
                        <button
                          className="context-record"
                          key={c.event_id}
                          onClick={() => selectEvent(c.event_id)}
                        >
                          <FileText size={16} />
                          <span>
                            <strong>{c.description.slice(0, 90)}</strong>
                            <small>
                              {c.locator} · {date(c.timestamp, true)}
                            </small>
                          </span>
                          <ArrowUpRight size={13} />
                        </button>
                      ))
                    ) : (
                      <div className="small-empty">
                        Supporting records appear here after a search.
                      </div>
                    )}
                    <div className="source-policy">
                      <ShieldCheck size={19} />
                      <strong>Grounded by design</strong>
                      <p>
                        Case-scoped retrieval. Source citations. Read-only AI.
                        Every interpretation stays open to investigator review.
                      </p>
                    </div>
                  </aside>
                </div>
              )}

              {view === "custody" && (
                <>
                  <section className="card ledger-check">
                    <div>
                      <ShieldCheck size={24} />
                      <div>
                        <h2>
                          {(ledgerResult || data.ledger).valid
                            ? "Ledger is internally consistent"
                            : "Ledger verification failed"}
                        </h2>
                        <p>
                          {(ledgerResult || data.ledger).entries} entries ·
                          Hash-linked handling history
                        </p>
                      </div>
                    </div>
                    <button
                      className="secondary"
                      disabled={!!busy}
                      onClick={() =>
                        act(
                          "ledger",
                          async () =>
                            setLedgerResult(
                              await api<Ledger>(
                                `/cases/${caseId}/audit/verify`,
                                "POST",
                                { checkpoint: checkpoint || null },
                              ),
                            ),
                          "Ledger verification finished",
                        )
                      }
                    >
                      <ShieldCheck size={15} />
                      Verify chain
                    </button>
                    <label>
                      Optional independently saved head checkpoint
                      <input
                        aria-label="Saved ledger checkpoint"
                        placeholder="64-character SHA-256 checkpoint"
                        value={checkpoint}
                        onChange={(e) => setCheckpoint(e.target.value.trim())}
                        maxLength={64}
                      />
                    </label>
                    <code>{(ledgerResult || data.ledger).head}</code>
                    <small>{(ledgerResult || data.ledger).limitation}</small>
                  </section>
                  <section className="card">
                    <CardTitle
                      title="Handling history"
                      subtitle="Most recent first · actor names are investigator assertions"
                    />
                    <div className="audit-list">
                      {data.audit
                        .slice()
                        .reverse()
                        .filter(
                          (a) =>
                            !query ||
                            JSON.stringify(a)
                              .toLowerCase()
                              .includes(query.toLowerCase()),
                        )
                        .map((a) => (
                          <AuditRow key={a.id} value={a} />
                        ))}
                    </div>
                  </section>
                </>
              )}

              {view === "reports" && (
                <div className="report-layout">
                  <section className="card report-preview">
                    <div className="report-mast">
                      <Fingerprint size={28} />
                      <span>
                        SutraTrace<small>INVESTIGATION RECORD</small>
                      </span>
                      <Badge tone={data.case.synthetic ? "amber" : "muted"}>
                        {data.case.synthetic ? "SYNTHETIC CASE" : "DRAFT"}
                      </Badge>
                    </div>
                    <h2>{data.case.title}</h2>
                    <p className="mono">{data.case.id}</p>
                    <div className="report-details">
                      <div>
                        <small>INVESTIGATOR</small>
                        <strong>{data.case.owner}</strong>
                      </div>
                      <div>
                        <small>EVIDENCE ITEMS</small>
                        <strong>{data.evidence.length}</strong>
                      </div>
                      <div>
                        <small>OBSERVED EVENTS</small>
                        <strong>{data.events.length}</strong>
                      </div>
                    </div>
                    <h3>Investigation scope</h3>
                    <p>{data.case.scope}</p>
                    <h3>Accepted findings</h3>
                    {data.findings
                      .filter((f) => f.status === "accepted")
                      .map((f) => (
                        <div className="report-finding" key={f.id}>
                          <CheckCircle2 size={17} />
                          <div>
                            <strong>{f.title}</strong>
                            <p>{f.review_note}</p>
                            {eventCitations(f.event_ids)}
                          </div>
                        </div>
                      ))}
                    {!data.findings.some((f) => f.status === "accepted") && (
                      <p className="report-placeholder">
                        No findings have been accepted. Review the leads before
                        adopting conclusions.
                      </p>
                    )}
                    <h3>Methodology & source trail</h3>
                    <p>
                      SHA-256 intake fingerprints, fresh export-time
                      verification, source-located observations, UTC
                      normalization where explicit offsets exist, and versioned
                      correlation rules.
                    </p>
                    <h3>Limits of interpretation</h3>
                    <p>
                      Source-clock accuracy, transfer payload bytes, and human
                      attribution require independent corroboration. Other
                      findings are included with their review status, separately
                      from accepted findings.
                    </p>
                  </section>
                  <aside>
                    <section className="card export-card">
                      <ArrowDownToLine size={26} />
                      <h2>A record you can review.</h2>
                      <p>
                        Export the complete evidence manifest, timeline,
                        findings, review decisions, and custody trail.
                      </p>
                      <ul>
                        {[
                          "Fresh integrity checks",
                          "Source IDs and record locations",
                          "Accepted and pending findings separated",
                          "Custody hashes and head checkpoint",
                          "Methodology and limitations",
                        ].map((x) => (
                          <li key={x}>
                            <Check size={14} />
                            {x}
                          </li>
                        ))}
                      </ul>
                      <button
                        className="primary"
                        disabled={!!busy}
                        onClick={() => exportReport("md")}
                      >
                        <FileText size={16} />
                        Export Markdown report
                      </button>
                      <button
                        className="secondary"
                        disabled={!!busy}
                        onClick={() => exportReport("json")}
                      >
                        <FileJson size={16} />
                        Export full JSON case
                      </button>
                      <small>
                        Original files are exported separately from the evidence
                        vault. No legal certification is implied.
                      </small>
                    </section>
                  </aside>
                </div>
              )}
              <footer>
                <span>
                  <Fingerprint size={13} />
                  SutraTrace <span className="footer-sep">/</span> Every trace
                  connects.
                </span>
                <span>
                  {data.case.synthetic
                    ? "Synthetic training data"
                    : "Local investigator workspace"}
                  <span className="footer-sep">·</span>v0.1
                </span>
              </footer>
            </>
          )}
        </main>
      </div>
      {busy && busy !== "ask" && (
        <div className="busy-bar" role="status">
          <LoaderCircle size={15} className="spin" />
          {{
            demo: "Preparing the synthetic case",
            verify: "Verifying stored evidence",
            triage: "Running correlation rules",
            export: "Verifying evidence and exporting report",
            upload: "Preserving and parsing evidence",
            review: "Saving review",
            custody: "Recording custody transfer",
            download: "Verifying and exporting original",
            ledger: "Checking ledger",
            case: "Creating case",
          }[busy] || "Working"}
          …
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {toast}
        </div>
      )}

      {modal && (
        <Modal
          title={modal === "case" ? "Create an investigation" : "Add evidence"}
          onClose={() => setModal(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              if (modal === "case") {
                act(
                  "case",
                  async () => {
                    const c = await api<Case>(
                      "/cases",
                      "POST",
                      Object.fromEntries(form),
                    );
                    setCases(await api<Case[]>("/cases"));
                    setCaseId(c.id);
                    setView("overview");
                    setModal(null);
                  },
                  "Investigation created",
                );
              } else {
                act("upload", async () => {
                  const files = form.getAll("file") as File[];
                  let count = 0;
                  for (const file of files) {
                    const one = new FormData();
                    for (const [key, val] of form.entries())
                      if (key !== "file") one.set(key, val);
                    one.set("file", file);
                    await api(`/cases/${caseId}/evidence`, "POST", one);
                    count++;
                  }
                  await refresh();
                  setModal(null);
                  setToast(
                    `${count} evidence item${count === 1 ? "" : "s"} preserved and analyzed`,
                  );
                });
              }
            }}
          >
            {modal === "case" ? (
              <>
                <p className="modal-intro">
                  Give the investigation a clear purpose. Each case keeps its
                  evidence, findings, and history separate.
                </p>
                <label>
                  Case title
                  <input
                    name="title"
                    required
                    maxLength={160}
                    placeholder="e.g. Project Orion data transfer"
                    autoFocus
                  />
                </label>
                <label>
                  Investigator
                  <input
                    name="owner"
                    required
                    maxLength={100}
                    placeholder="Your name or examiner identifier"
                  />
                </label>
                <label>
                  Authorized scope
                  <textarea
                    name="scope"
                    required
                    maxLength={4000}
                    placeholder="What evidence and activity are you authorized to investigate?"
                  />
                </label>
                <label>
                  Description
                  <textarea
                    name="description"
                    maxLength={4000}
                    placeholder="Background and questions to investigate"
                  />
                </label>
              </>
            ) : (
              <>
                <p className="modal-intro">
                  Original bytes stay in the local vault. Parsing produces
                  separate observations without changing the source.
                </p>
                <label className="upload-zone">
                  <Upload size={26} />
                  <strong>Choose evidence files</strong>
                  <span>
                    CSV, JSON, JSONL, EML, text, PDF, images
                    <br />
                    Other formats are preserved only · 20 MB per file
                  </span>
                  <input
                    aria-label="Evidence files"
                    name="file"
                    type="file"
                    multiple
                    required
                  />
                </label>
                <div className="form-grid">
                  <label>
                    Source category
                    <select name="source_type">
                      {Object.keys(sourceColors).map((s) => (
                        <option value={s} key={s}>
                          {human(s)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Collected by
                    <input
                      name="collected_by"
                      required
                      maxLength={100}
                      defaultValue={data?.case.owner}
                    />
                  </label>
                </div>
                <label>
                  Source / acquisition method
                  <input
                    name="source_description"
                    required
                    maxLength={1000}
                    placeholder="e.g. Authorized firewall CSV export from gateway 01"
                  />
                </label>
                <label>
                  Acquisition time with UTC offset
                  <input
                    name="acquired_at"
                    placeholder="2026-10-17T09:30:00+05:30, or Unknown"
                    defaultValue="Unknown"
                  />
                </label>
                <label>
                  Collection notes
                  <textarea
                    name="notes"
                    maxLength={4000}
                    placeholder="Authorization reference, handling notes, known clock issues…"
                  />
                </label>
              </>
            )}
            <div className="modal-actions">
              <button
                className="secondary"
                type="button"
                onClick={() => setModal(null)}
                disabled={!!busy}
              >
                Cancel
              </button>
              <button className="primary" type="submit" disabled={!!busy}>
                {busy ? (
                  <LoaderCircle size={16} className="spin" />
                ) : (
                  <Plus size={16} />
                )}{" "}
                {modal === "case" ? "Create case" : "Preserve & analyze"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {selected && data && (
        <div className="drawer-backdrop" onClick={() => setSelected(null)}>
          <div
            className="drawer"
            ref={detailRef}
            role="dialog"
            aria-modal="true"
            aria-label="Evidence inspection"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="drawer-head">
              <span className="eyebrow">{human(selected.kind)} INSPECTOR</span>
              <button
                className="icon-button"
                aria-label="Close inspector"
                onClick={() => setSelected(null)}
              >
                <X size={19} />
              </button>
            </div>
            {selected.kind === "event" && (
              <>
                <Source name={selected.data.source_type} />
                <h2>{selected.data.description.slice(0, 240)}</h2>
                <code>{selected.data.id}</code>
                <dl>
                  <dt>Normalized time (UTC)</dt>
                  <dd>{selected.data.timestamp_utc || "Not resolved"}</dd>
                  <dt>Original timestamp</dt>
                  <dd>{selected.data.timestamp_raw || "Not provided"}</dd>
                  <dt>Timestamp quality</dt>
                  <dd>{human(selected.data.timestamp_quality)}</dd>
                  <dt>Source location</dt>
                  <dd>
                    {selected.data.filename} / {selected.data.source_locator}
                  </dd>
                  <dt>Parser</dt>
                  <dd>{selected.data.parser_version}</dd>
                </dl>
                <h3>Source artifact</h3>
                {evidenceCitations([selected.data.evidence_id])}
                <h3>Original extracted record</h3>
                <pre>{JSON.stringify(selected.data.raw, null, 2)}</pre>
                <div className="finding-caveat">
                  <AlertTriangle size={14} />
                  Source content is untrusted data. A recorded claim is not
                  independent confirmation of an event.
                </div>
              </>
            )}
            {selected.kind === "evidence" && (
              <>
                <Badge
                  tone={
                    selected.data.verification_status === "verified"
                      ? "green"
                      : "red"
                  }
                >
                  <ShieldCheck size={12} />
                  {selected.data.verification_status}
                </Badge>
                <h2>{selected.data.filename}</h2>
                <code>{selected.data.id}</code>
                <dl>
                  <dt>Source</dt>
                  <dd>{selected.data.source_description}</dd>
                  <dt>Collector / current custodian</dt>
                  <dd>
                    {selected.data.collected_by} / {selected.data.custodian}
                  </dd>
                  <dt>Acquisition time (as provided)</dt>
                  <dd>{selected.data.acquired_at}</dd>
                  <dt>Received (UTC)</dt>
                  <dd>{selected.data.received_at}</dd>
                  <dt>Size / parser status</dt>
                  <dd>
                    {bytes(selected.data.size)} ·{" "}
                    {human(selected.data.parser_status)}
                  </dd>
                  <dt>Last verification (UTC)</dt>
                  <dd>{selected.data.verified_at}</dd>
                </dl>
                <h3>SHA-256 at intake</h3>
                <code className="hash-block">{selected.data.sha256}</code>
                {selected.data.verification_status !== "verified" && (
                  <>
                    <h3>Observed digest</h3>
                    <code className="hash-block">
                      {selected.data.observed_sha256 || "Original missing"}
                    </code>
                  </>
                )}
                <div className="button-row">
                  <button
                    className="primary"
                    disabled={!!busy}
                    onClick={() =>
                      act(
                        "verify",
                        async () => {
                          const ev = await api<Evidence>(
                            `/cases/${caseId}/evidence/${selected.data.id}/verify`,
                            "POST",
                          );
                          setSelected({ kind: "evidence", data: ev });
                          await refresh();
                        },
                        "Integrity check completed",
                      )
                    }
                  >
                    <ShieldCheck size={15} />
                    Verify bytes
                  </button>
                  <button
                    className="secondary"
                    disabled={!!busy}
                    onClick={() => downloadEvidence(selected.data)}
                  >
                    <ArrowDownToLine size={15} />
                    Original
                  </button>
                </div>
                <h3>Processing notes</h3>
                {selected.data.warnings.map((w, i) => (
                  <p className="warning-line" key={i}>
                    <AlertTriangle size={13} />
                    {w}
                  </p>
                ))}
                <h3>Extracted metadata</h3>
                <pre>{JSON.stringify(selected.data.metadata, null, 2)}</pre>
                <h3>Collection notes</h3>
                <p>{selected.data.notes || "None supplied."}</p>
                <h3>Record a custody transfer</h3>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const body = Object.fromEntries(
                      new FormData(e.currentTarget),
                    );
                    act(
                      "custody",
                      async () => {
                        const ev = await api<Evidence>(
                          `/cases/${caseId}/evidence/${selected.data.id}/custody`,
                          "POST",
                          body,
                        );
                        setSelected({ kind: "evidence", data: ev });
                        await refresh();
                      },
                      "Custody transfer recorded",
                    );
                  }}
                >
                  <label>
                    New custodian
                    <input name="custodian" required maxLength={100} />
                  </label>
                  <label>
                    Purpose
                    <textarea name="purpose" required maxLength={2000} />
                  </label>
                  <button className="secondary" disabled={!!busy} type="submit">
                    <Link2 size={15} />
                    Record transfer
                  </button>
                </form>
                <small>
                  Records your assertion; does not authenticate the recipient or
                  move the bytes.
                </small>
              </>
            )}
            {selected.kind === "finding" && (
              <>
                <Badge
                  tone={selected.data.severity === "high" ? "red" : "amber"}
                >
                  {selected.data.severity} review priority
                </Badge>
                <h2>{selected.data.title}</h2>
                <code>
                  {selected.data.rule} · {selected.data.rule_version}
                </code>
                <h3>Why this was flagged</h3>
                <p>{selected.data.explanation}</p>
                <h3>Supporting source records</h3>
                {eventCitations(selected.data.event_ids)}
                {evidenceCitations(selected.data.evidence_ids)}
                <h3>What is not established</h3>
                <div className="finding-caveat">
                  <AlertTriangle size={15} />
                  {selected.data.limitations}
                </div>
                <h3>Investigator review</h3>
                <Badge
                  tone={selected.data.status === "accepted" ? "green" : "muted"}
                >
                  {human(selected.data.status)}
                </Badge>
                <label>
                  Review reasoning
                  <textarea
                    value={reviewNote}
                    onChange={(e) => setReviewNote(e.target.value)}
                    placeholder="Record your interpretation, alternative explanation, or next step…"
                    maxLength={4000}
                  />
                </label>
                <div className="review-buttons">
                  {[
                    ["accepted", "Accept lead"],
                    ["needs_followup", "Follow up"],
                    ["rejected", "Mark benign / reject"],
                  ].map(([status, label]) => (
                    <button
                      className={
                        status === "accepted" ? "primary" : "secondary"
                      }
                      key={status}
                      disabled={!!busy || !reviewNote.trim()}
                      onClick={() =>
                        act(
                          "review",
                          async () => {
                            const f = await api<Finding>(
                              `/cases/${caseId}/findings/${selected.data.id}`,
                              "PATCH",
                              { status, note: reviewNote },
                            );
                            setSelected({ kind: "finding", data: f });
                            await refresh();
                          },
                          "Review decision saved to custody history",
                        )
                      }
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <small>
                  Accepting a lead records your review; it does not establish
                  guilt or prove attribution.
                </small>
              </>
            )}
            {selected.kind === "node" && (
              <>
                <Badge tone="green">{selected.data.type}</Badge>
                <h2>{selected.data.label}</h2>
                <p>
                  {selected.data.event_ids.length} source records contain this
                  exact field value. Shared fields do not prove shared human
                  identity.
                </p>
                <h3>Connected observations</h3>
                {selected.data.event_ids.map((id) => {
                  const e = data.events.find((e) => e.id === id);
                  return e ? (
                    <button
                      className="context-record"
                      key={id}
                      onClick={() => selectEvent(id)}
                    >
                      <FileText size={16} />
                      <span>
                        <strong>{e.description.slice(0, 130)}</strong>
                        <small>
                          {e.filename} / {e.source_locator}
                        </small>
                      </span>
                      <ArrowUpRight size={13} />
                    </button>
                  ) : null;
                })}
              </>
            )}
            {selected.kind === "edge" && (
              <>
                <Badge tone="green">SOURCED RELATIONSHIP</Badge>
                <h2>{human(selected.data.relationship)}</h2>
                <h3>Matching basis</h3>
                <p>{selected.data.basis}</p>
                <dl>
                  <dt>Source location</dt>
                  <dd>{selected.data.source_locator}</dd>
                  <dt>Timestamp (UTC)</dt>
                  <dd>{selected.data.timestamp || "Unresolved"}</dd>
                </dl>
                {eventCitations([selected.data.event_id])}
                {evidenceCitations([selected.data.evidence_id])}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  icon,
  foot,
  accent = false,
  amber = false,
}: {
  label: string;
  value: React.ReactNode;
  icon: React.ReactNode;
  foot: string;
  accent?: boolean;
  amber?: boolean;
}) {
  return (
    <section className={"metric " + (accent ? "accent" : "")}>
      <div>
        <span>{label}</span>
        <span className="metric-icon">{icon}</span>
      </div>
      <strong>{value}</strong>
      <small className={amber ? "amber-text" : ""}>
        {amber && <span className="amber-dot" />}
        {foot}
      </small>
      {accent && (
        <svg className="metric-line" viewBox="0 0 130 40" aria-hidden="true">
          <path
            d="M0 35 L12 30 L23 32 L35 22 L46 25 L58 13 L67 18 L80 8 L93 13 L106 4 L130 1"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        </svg>
      )}
    </section>
  );
}
function CardTitle({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="card-title">
      <div>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}
function EvidenceTable({
  rows,
  onSelect,
}: {
  rows: Evidence[];
  onSelect: (e: Evidence) => void;
}) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Evidence artifact</th>
            <th>Source</th>
            <th>Size</th>
            <th>Integrity</th>
            <th>Records</th>
            <th aria-label="Inspect" />
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.id} onClick={() => onSelect(e)}>
              <td>
                <button
                  className="file-cell"
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelect(e);
                  }}
                >
                  <span className="file-icon">
                    <FileText size={17} />
                  </span>
                  <span>
                    <strong>{e.filename}</strong>
                    <small>{e.sha256.slice(0, 12)}…</small>
                  </span>
                </button>
              </td>
              <td>
                <Source name={e.source_type} />
              </td>
              <td className="muted mono">{bytes(e.size)}</td>
              <td>
                <Badge
                  tone={e.verification_status === "verified" ? "green" : "red"}
                >
                  {e.verification_status === "verified" ? (
                    <CheckCheck size={12} />
                  ) : (
                    <AlertTriangle size={12} />
                  )}{" "}
                  {e.verification_status}
                </Badge>
              </td>
              <td className="mono muted">
                {e.event_count}{" "}
                {e.parser_status === "parse_failed" && (
                  <Badge tone="red">Parse failed</Badge>
                )}
                {e.parser_status === "preserved_only" && (
                  <Badge>Not parsed</Badge>
                )}
              </td>
              <td>
                <ArrowUpRight size={14} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && (
        <Empty
          title="No evidence in this view"
          description="Import an artifact or adjust the source and search filters."
        />
      )}
    </div>
  );
}
function ActivityChart({
  events,
  onSelect,
}: {
  events: Event[];
  onSelect: (id: string) => void;
}) {
  const timed = events.filter((e) => e.timestamp_utc);
  if (!timed.length)
    return (
      <Empty
        title="No timed records yet"
        description="Import events with timestamps that include a UTC offset."
      />
    );
  const min = Math.min(...timed.map((e) => Date.parse(e.timestamp_utc!))),
    max = Math.max(...timed.map((e) => Date.parse(e.timestamp_utc!)));
  const range = Math.max(max - min, 60000);
  const bins: Array<Event[]> = Array.from({ length: 30 }, () => []);
  for (const e of timed)
    bins[
      Math.min(
        29,
        Math.floor(((Date.parse(e.timestamp_utc!) - min) / range) * 29),
      )
    ].push(e);
  const peak = Math.max(...bins.map((b) => b.length), 1);
  return (
    <div className="activity-chart">
      <div className="chart-topline">
        <strong>
          {timed.length}
          <small>timed events</small>
        </strong>
        <span>
          <Clock3 size={12} />
          {Math.max(1, Math.round(range / 60000))} min observed span
        </span>
      </div>
      <div className="bars">
        <div className="gridlines">
          <i />
          <i />
          <i />
        </div>
        {bins.map((bin, i) => (
          <button
            aria-label={
              bin.length
                ? `${bin.length} events at ${date(bin[0].timestamp_utc, true)}`
                : "No observations in this interval"
            }
            title={
              bin.length
                ? `${bin.length} events · ${date(bin[0].timestamp_utc, true)}`
                : "No observations"
            }
            disabled={!bin.length}
            key={i}
            onClick={() => onSelect(bin[0].id)}
            className={"bar " + (bin.length ? "has-events" : "")}
            style={{
              height: `${bin.length ? Math.max(8, (bin.length / peak) * 95) : 3}%`,
            }}
          >
            {bin.map((e) => (
              <span
                key={e.id}
                style={{ background: sourceColors[e.source_type], flex: 1 }}
              />
            ))}
          </button>
        ))}
      </div>
      <div className="chart-axis">
        {[0, 0.25, 0.5, 0.75, 1].map((n) => (
          <span key={n}>
            {date(new Date(min + range * n).toISOString(), true).slice(0, 5)}
          </span>
        ))}
      </div>
    </div>
  );
}
function Graph({
  nodes,
  edges,
  compact = false,
  onNode,
  onEdge,
}: {
  nodes: GNode[];
  edges: GEdge[];
  compact?: boolean;
  onNode: (n: GNode) => void;
  onEdge: (e: GEdge) => void;
}) {
  const [zoom, setZoom] = useState(1),
    [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(
    null,
  );
  const entities = nodes
    .filter((n) => n.type !== "event")
    .sort((a, b) => b.event_ids.length - a.event_ids.length)
    .slice(0, compact ? 8 : 26);
  const entityIds = new Set(entities.map((n) => n.id));
  const relatedIds = new Set(
    edges.filter((e) => entityIds.has(e.target)).map((e) => e.source),
  );
  const observations = nodes
    .filter((n) => n.type === "event" && relatedIds.has(n.id))
    .slice(0, compact ? 10 : 44);
  const visible = [...entities, ...observations];
  const positions = new Map<string, { x: number; y: number }>();
  entities.forEach((n, i) => {
    const angle = (i / entities.length) * Math.PI * 2 - Math.PI / 2;
    positions.set(n.id, {
      x: 400 + Math.cos(angle) * (compact ? 235 : 255),
      y: 210 + Math.sin(angle) * (compact ? 140 : 155),
    });
  });
  observations.forEach((n, i) => {
    const angle = (i / observations.length) * Math.PI * 2;
    positions.set(n.id, {
      x: 400 + Math.cos(angle) * 105,
      y: 210 + Math.sin(angle) * 85,
    });
  });
  const color = (type: string) =>
    ({
      actor: "#c4f36a",
      device: "#a991f7",
      ip: "#69c6dd",
      destination: "#69c6dd",
      object: "#e9b86c",
      sha256: "#e9b86c",
      event: "#697365",
    })[type] || "#9da69b";
  return (
    <div className={"graph-canvas " + (compact ? "compact" : "")}>
      <svg
        viewBox="0 0 800 420"
        aria-label="Evidence relationship graph"
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) {
            drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
            e.currentTarget.setPointerCapture(e.pointerId);
          }
        }}
        onPointerMove={(e) => {
          if (drag.current) {
            setPan({
              x:
                drag.current.px +
                ((e.clientX - drag.current.x) * 800) /
                  e.currentTarget.clientWidth,
              y:
                drag.current.py +
                ((e.clientY - drag.current.y) * 420) /
                  e.currentTarget.clientHeight,
            });
          }
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
      >
        <defs>
          <pattern
            id={compact ? "dot-small" : "dot-large"}
            width="20"
            height="20"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="1" cy="1" r=".7" fill="#343a31" />
          </pattern>
          <radialGradient id="graph-glow">
            <stop stopColor="#b4e769" stopOpacity=".07" />
            <stop offset="1" stopColor="#b4e769" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect
          width="800"
          height="420"
          fill={`url(#${compact ? "dot-small" : "dot-large"})`}
          pointerEvents="none"
        />
        <ellipse
          cx="400"
          cy="210"
          rx="290"
          ry="210"
          fill="url(#graph-glow)"
          pointerEvents="none"
        />
        <g
          transform={`translate(${pan.x + 400 * (1 - zoom)} ${pan.y + 210 * (1 - zoom)}) scale(${zoom})`}
        >
          {edges
            .filter((e) => positions.has(e.source) && positions.has(e.target))
            .map((e, i) => {
              const a = positions.get(e.source)!,
                b = positions.get(e.target)!;
              return (
                <g
                  key={e.id}
                  className="graph-edge"
                  tabIndex={compact ? -1 : 0}
                  role="button"
                  aria-label={e.basis}
                  onClick={() => onEdge(e)}
                  onKeyDown={(k) => {
                    if (k.key === "Enter") onEdge(e);
                  }}
                >
                  <path
                    d={`M${a.x} ${a.y} Q400 210 ${b.x} ${b.y}`}
                    className="edge-hit"
                  />
                  <path
                    d={`M${a.x} ${a.y} Q400 210 ${b.x} ${b.y}`}
                    className="edge-line"
                  />
                  {i % 8 === 0 && (
                    <path
                      d={`M${a.x} ${a.y} Q400 210 ${b.x} ${b.y}`}
                      className="edge-pulse"
                      style={{ animationDelay: `${i * 0.2}s` }}
                    />
                  )}
                </g>
              );
            })}
          {visible.map((n) => {
            const p = positions.get(n.id)!;
            return (
              <g
                key={n.id}
                transform={`translate(${p.x} ${p.y})`}
                className="graph-node"
                role="button"
                tabIndex={0}
                aria-label={`${n.type}: ${n.label}`}
                onClick={() => onNode(n)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onNode(n);
                }}
              >
                <circle
                  r={n.type === "event" ? 8 : 22}
                  fill={n.type === "event" ? "#22291e" : "#1a2117"}
                  stroke={color(n.type)}
                  strokeWidth="1.2"
                />
                {n.type !== "event" && (
                  <>
                    <text
                      y="5"
                      fill={color(n.type)}
                      textAnchor="middle"
                      fontSize="16"
                    >
                      {{
                        actor: "@",
                        device: "▣",
                        ip: "◎",
                        destination: "◎",
                        object: "◇",
                        sha256: "#",
                      }[n.type] || "·"}
                    </text>
                    <text
                      y="40"
                      textAnchor="middle"
                      fill="#cbd2c6"
                      fontSize="11"
                    >
                      {short(
                        n.label.length > 30
                          ? n.label.split("/").pop() || n.label
                          : n.label,
                      )}
                    </text>
                    <text
                      y="55"
                      textAnchor="middle"
                      fill="#77816f"
                      fontSize="9"
                    >
                      {n.type.toUpperCase()}
                    </text>
                  </>
                )}
              </g>
            );
          })}
        </g>
      </svg>
      {!nodes.length && (
        <div className="graph-empty">
          Import structured evidence to build relationships.
        </div>
      )}
      {!compact && (
        <>
          <div className="graph-controls">
            <button
              aria-label="Zoom out"
              onClick={() => setZoom(Math.max(0.5, zoom - 0.2))}
            >
              <Minus size={16} />
            </button>
            <span>{Math.round(zoom * 100)}%</span>
            <button
              aria-label="Zoom in"
              onClick={() => setZoom(Math.min(2.5, zoom + 0.2))}
            >
              <Plus size={16} />
            </button>
            <button
              aria-label="Reset graph"
              onClick={() => {
                setZoom(1);
                setPan({ x: 0, y: 0 });
              }}
            >
              <Maximize2 size={15} />
            </button>
          </div>
          <div className="graph-hint">
            {visible.length} / {nodes.length} nodes shown · drag background to
            pan · select a source filter to focus
          </div>
        </>
      )}
    </div>
  );
}
function AuditRow({ value: a }: { value: Audit }) {
  return (
    <details className="audit-row">
      <summary>
        <span className="audit-symbol">
          <Link2 size={16} />
        </span>
        <span>
          <strong>{human(a.action)}</strong>
          <small>
            {a.actor} · {a.evidence_id || "Case activity"}
          </small>
        </span>
        <time>{date(a.timestamp)} UTC</time>
        <ChevronDown size={14} />
      </summary>
      <div>
        <code>
          Previous: {a.previous_hash}
          <br />
          Entry: {a.hash}
        </code>
        <pre>{JSON.stringify(a.details, null, 2)}</pre>
      </div>
    </details>
  );
}
function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const old = document.activeElement as HTMLElement;
    ref.current?.focus();
    return () => old?.focus();
  }, []);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={ref}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Tab") {
            const inputs = ref.current?.querySelectorAll<HTMLElement>(
              "button:not(:disabled),input:not(:disabled),textarea,select",
            );
            if (inputs?.length) {
              const first = inputs[0],
                last = inputs[inputs.length - 1];
              if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
              } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
              }
            }
          }
        }}
      >
        <div className="modal-head">
          <h2>{title}</h2>
          <button
            className="icon-button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
