/* Typed client for the Case Investigator API (proxied at /api by Next). */

export type Sev = "critical" | "high" | "medium" | "low" | "info";
export type EdgeState = "verified" | "conflict" | "missing" | "unverifiable";
export type Flow = "identity" | "address" | "money" | "time";

export interface CaseSummary {
  id: string;
  type: string;
  type_label: string;
  context: string;
  applicant?: string;
  created: number;
  assignee: string;
  state: string;
  phase?: string;
  mode?: string;
  documents: number;
  risk_level?: string;
  risk_score?: number;
  recommended_outcome?: string;
  final_outcome?: string;
  locked: boolean;
  findings?: number;
}

export interface DocDetail {
  doc_id: string;
  doc_label: string;
  doc_type: string;
  page_count: number;
  file: string;
  sha256: string;
  kind: string;
  thumb: string | null;
  badge: "pass" | "caution" | "fail";
  findings: number;
  verdict?: string;
  catalog_type?: string;
  family?: string;
  family_label?: string;
  classify_conf?: number;
  classify_why?: string[];
  classify_alt?: { type: string; label: string; score: number }[];
  needs_review?: boolean;
  split_reason?: string | null;
  page_numbers?: number[];
}

export interface CatalogFamily {
  id: string;
  label: string;
  types: { id: string; label: string; pack: string; used_for: string[]; checked: boolean }[];
}

export interface Score {
  risk_score: number;
  risk_level: string;
  recommended_outcome: string;
  rules_fired: string[];
  counted_findings: string[];
  document_requests: string[];
  by_severity: Record<Sev, number>;
}

export interface Decision {
  recommended_outcome: string;
  final_outcome: string;
  rationale: string;
  override: boolean;
  signed_by: string;
  signed_at: number;
}

export interface CaseDetail extends CaseSummary {
  status: Record<string, unknown>;
  score: Score;
  documents_detail: DocDetail[];
  inputs: { file: string; size: number; sha256: string }[];
  graph_counts?: Record<EdgeState, number>;
  narrative?: string | null;
  leads: { note: string }[];
  decision?: Decision | null;
}

export interface Ref {
  doc?: string;
  field?: string;
  value?: unknown;
  page?: number;
  bbox?: number[];
  text?: string;
}

export interface GNode {
  id: string;
  kind: "document" | "person" | "organisation" | "address" | "account" | "money" | "missing";
  label: string;
  sub?: string;
  role?: string;
  docs: string[];
  merged_from: { value: string; doc: string; reason: string }[];
  doc?: string;
  doc_type?: string;
  date?: string;
  money_kind?: string;
  amount?: number;
  payer?: string;
  missing_kind?: string;
  stale?: boolean;
}

export interface GEdge {
  id: string;
  source: string;
  target: string;
  relation: string;
  flow: Flow;
  state: EdgeState;
  rule: string | null;
  explain: string;
  a?: Ref | null;
  b?: Ref | null;
  score?: number | null;
}

export interface Graph {
  applicant: string;
  nodes: GNode[];
  edges: GEdge[];
  counts: Record<EdgeState, number>;
  context: Record<string, unknown>;
}

export interface BlueprintRule {
  rule: string;
  label: string;
  flow: Flow;
  severity: Sev;
  status: EdgeState;
  detail: string;
  edges: string[];
}

export interface Finding {
  id: string;
  claim: string;
  detail: string[];
  category: string;
  checks: string[];
  layers: string[];
  agreeing: number;
  doc?: string;
  field?: string;
  page?: number;
  bbox?: number[];
  evidence: string[];
  values?: Record<string, unknown>;
  deterministic: boolean;
  confidence: "high" | "medium" | "low";
  severity: Sev;
  status: "verified" | "lead" | "accepted" | "rejected";
  review?: { decision: string; reason: string; reviewer: string } | null;
}

export interface Workflow {
  id: string;
  label: string;
  description: string;
  window_days?: number;
  required_documents: { types: string[]; label: string; count: number }[];
  steps: { id: string; label: string; engine: string; enabled: boolean }[];
  rules: { id: string; label: string; flow: Flow; severity: Sev; enabled: boolean; params?: Record<string, number> }[];
  scoring: { weights: Record<Sev, number>; levels: Record<string, number> };
}

export interface Catalog {
  rules: { id: string; flow: Flow; label: string; params: Record<string, number> }[];
  steps: { id: string; label: string; code: string }[];
  doc_types: { id: string; label: string; family: string }[];
  severities: Sev[];
}

export interface LiveEvent {
  t: number;
  type: string;
  [k: string]: unknown;
}

async function j<T>(r: Response): Promise<T> {
  if (!r.ok) {
    let msg = `${r.status}`;
    try {
      const b = await r.json();
      msg = b.detail || msg;
    } catch {}
    throw new Error(msg);
  }
  return r.json() as Promise<T>;
}

const get = <T,>(p: string) => fetch(`/api${p}`, { cache: "no-store" }).then((r) => j<T>(r));
const send = <T,>(method: string, p: string, body?: unknown) =>
  fetch(`/api${p}`, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }).then((r) => j<T>(r));

/** Direct API origin for the live event stream (avoids proxy buffering). */
export const API_DIRECT = typeof window !== "undefined" ? `${window.location.protocol}//${window.location.hostname}:8100` : "";

export const api = {
  health: () => get<{ ok: boolean; model: string; ai: boolean }>("/health"),
  cases: () => get<CaseSummary[]>("/cases"),
  createCase: (type: string, context: string) => send<CaseSummary>("POST", "/cases", { type, context }),
  case: (id: string) => get<CaseDetail>(`/cases/${id}`),
  upload: (id: string, files: File[]) => {
    const fd = new FormData();
    files.forEach((f) => fd.append("files", f));
    return fetch(`/api/cases/${id}/documents`, { method: "POST", body: fd }).then((r) => j<{ uploaded: { file: string; sha256: string; pages: number; size: number }[] }>(r));
  },
  removeUpload: (id: string, name: string) => send("DELETE", `/cases/${id}/documents/${encodeURIComponent(name)}`),
  investigate: (id: string, mode: "agent" | "pipeline" = "agent", trufor = true) => send<{ started: boolean; mode: string }>("POST", `/cases/${id}/investigate`, { mode, trufor }),
  eventsAll: (id: string) => get<LiveEvent[]>(`/cases/${id}/events/all`),
  document: (id: string, doc: string) => get<DocumentData>(`/cases/${id}/documents/${doc}`),
  docCatalog: () => get<{ families: CatalogFamily[]; count: number }>("/catalog"),
  setDocType: (id: string, doc: string, catalog_type: string, reason: string) => send<{ document: unknown; note: string }>("PATCH", `/cases/${id}/documents/${doc}/type`, { catalog_type, reason }),
  graph: (id: string) => get<Graph>(`/cases/${id}/graph`),
  blueprint: (id: string) => get<{ workflow: string; rules: BlueprintRule[] }>(`/cases/${id}/blueprint`),
  consistency: (id: string) => get<Consistency>(`/cases/${id}/consistency`),
  timeline: (id: string) => get<{ events: TimelineEvent[] }>(`/cases/${id}/timeline`),
  findings: (id: string) => get<{ findings: Finding[]; score: Score }>(`/cases/${id}/findings`),
  review: (id: string, fid: string, decision: "accept" | "reject", reason = "", true_match?: boolean) => send<{ finding: Finding; score: Score }>("PATCH", `/cases/${id}/findings/${fid}`, { decision, reason, true_match }),
  ask: (id: string, question: string) => send<{ answer: string }>("POST", `/cases/${id}/ask`, { question }),
  decide: (id: string, outcome: string, rationale: string, signed_by: string) => send<Decision>("POST", `/cases/${id}/decision`, { outcome, rationale, signed_by }),
  audit: (id: string) => get<{ intact: boolean; events: AuditEvent[] }>(`/cases/${id}/audit`),
  workflows: () => get<{ id: string; label: string; description: string; rules: number; steps: number; required_documents: number }[]>("/workflows"),
  workflow: (id: string) => get<Workflow>(`/workflows/${id}`),
  saveWorkflow: (wf: Workflow) => send<Workflow>("PUT", `/workflows/${wf.id}`, wf),
  newWorkflow: (label: string, from: string) => send<Workflow>("POST", "/workflows", { label, from }),
  catalog: () => get<Catalog>("/workflows/catalog"),
  engines: () => get<EngineInfo[]>("/engines"),
};

export const fileUrl = (id: string, path: string) => `/api/cases/${id}/file?path=${encodeURIComponent(path)}`;

export interface EngineInfo {
  id: string;
  code: string;
  name: string;
  layer: string;
  source: string;
  does: string;
}

export interface AuditEvent {
  t: number;
  actor: string;
  action: string;
  inputs: unknown;
  result: unknown;
  hash: string;
}

export interface TimelineEvent {
  date: string;
  kind: string;
  label: string;
  doc?: string;
  field?: string;
  page?: number;
  bbox?: number[];
}

export interface Consistency {
  columns: { doc_id: string; label: string; file: string }[];
  rows: { label: string; reference: string | null; cells: Record<string, { value: unknown; field: string; page?: number; bbox?: number[]; state: "match" | "mismatch" | "info" }> }[];
}

export interface Word {
  t: string;
  b: number[];
  conf: number;
}

export interface DocumentData {
  meta: { doc_id: string; doc_label: string; doc_type: string; file: string; kind: string; sha256: string; pages: { page: number; png: string; w: number; h: number; source: string }[] };
  extracted: { fields: Record<string, { value: unknown; raw: string; type: string; role?: string; label: string; page?: number; bbox?: number[]; conf?: number }>; transactions?: { date: string; description: string; amount: number; direction: string; balance?: number; page: number; bbox: number[] }[]; missing_fields?: string[] };
  words: Record<string, Word[]>;
  pdf_structure: Record<string, unknown> | null;
  pixel: Record<string, unknown> | null;
  chars: Record<string, unknown> | null;
  logic: { checks: { check: string; status: string; [k: string]: unknown }[] } | null;
  payments: Record<string, unknown> | null;
  dossier: { verdict: string; reasons: string } | null;
  layers: Record<string, Record<string, string>>;
  findings: Finding[];
}

export const SEV_TONE: Record<Sev, "fail" | "caution" | "neutral"> = { critical: "fail", high: "fail", medium: "caution", low: "neutral", info: "neutral" };
export const STATE_TONE: Record<EdgeState, "pass" | "fail" | "caution" | "neutral"> = { verified: "pass", conflict: "fail", missing: "caution", unverifiable: "neutral" };
export const STATE_LABEL: Record<EdgeState, string> = { verified: "Verified", conflict: "Conflict", missing: "Missing", unverifiable: "Unverifiable" };

export function riskTone(level?: string): "pass" | "caution" | "fail" | "neutral" {
  if (!level) return "neutral";
  if (level === "Low") return "pass";
  if (level === "Medium") return "caution";
  return "fail";
}

export function ago(ts?: number): string {
  if (!ts) return "";
  const s = Date.now() / 1000 - ts;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

export function fmtValue(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "number") return v.toLocaleString("en-US", { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 });
  return String(v);
}
