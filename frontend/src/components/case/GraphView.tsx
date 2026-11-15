"use client";

/**
 * Connections (Figma screen 05): documents on the left state facts about the
 * applicant, the people, places, accounts and money on the right. Every link is
 * coloured by its state and carries both values and their sources. Below the
 * graph: the broken and missing links and the selected one side by side. On the
 * right: the workflow blueprint, rule by rule.
 */

import "@xyflow/react/dist/style.css";
import { Background, Handle, MarkerType, Position, ReactFlow, useNodesInitialized, useNodesState, useReactFlow, type Edge, type Node, type NodeProps } from "@xyflow/react";
import { useRouter } from "next/navigation";
import { memo, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Eye, Maximize, X, ZoomIn, ZoomOut } from "lucide-react";
import { api, fmtValue, type BlueprintRule, type DocDetail, type EdgeState, type Flow, type GEdge, type GNode, type Graph, type Ref } from "@/lib/api";
import { Badge, Btn, Eyebrow, Loading } from "@/components/ui/kit";
import { cn } from "@/lib/utils";

const STATE_COLOR: Record<EdgeState, string> = { verified: "#27634d", conflict: "#c0362c", missing: "#d98a1c", unverifiable: "#9aa3ae" };
const STATE_LABEL: Record<EdgeState, string> = { verified: "Verified", conflict: "Conflict", missing: "Missing", unverifiable: "Unverifiable" };
const STATES: EdgeState[] = ["verified", "conflict", "missing", "unverifiable"];
const FLOWS: ("all" | Flow)[] = ["all", "identity", "address", "money", "time"];
const COL_X = [0, 230, 470, 760, 930];
const COL_TITLE = ["Documents", "Applicant", "People, places, accounts", "Pay", "Deposits"];

/** Short titles for broken and missing links, by rule and state. */
function linkTitle(e: GEdge): string {
  const r = e.rule || "";
  const rel = (e.relation || "").toLowerCase();
  if (r === "current_address") return "Two different current addresses";
  if (r === "cheque_account") return rel.includes("routing") || (e.explain || "").toLowerCase().includes("routing") ? "Cheque routing belongs to another bank" : "Cheque not drawn on the applicant's account";
  if (r === "statement_chain") return "Gap in the statement chain";
  if (r === "required_documents") return "Required document missing";
  if (r === "employer_pays_account") return e.state === "missing" ? "No deposit from the employer" : "Salary comes from a different payer";
  if (r === "pay_to_deposit") return e.state === "missing" ? "Pay date with no deposit" : "Pay date with no matching deposit";
  if (r === "same_person") return "Name differs between documents";
  if (r === "dob_consistent") return "Different dates of birth";
  if (r === "id_valid") return "Photo ID expired";
  if (r === "income_consistency") return "Stated income does not match";
  if (r === "recency") return "Document outside the date window";
  if (r === "invoice_paid") return "Invoice not matched by a payment";
  return (e.relation || "Link").replace(/^\w/, (c) => c.toUpperCase());
}

type NData = { n?: GNode; header?: string; worst?: EdgeState; selected?: boolean; dim?: boolean };

const CaseNode = memo(function CaseNode({ data }: NodeProps<Node<NData>>) {
  if (data.header) return <span className="block text-[9.5px] font-bold tracking-[0.4px] whitespace-nowrap text-[#5f6a7b] uppercase">{data.header}</span>;
  const n = data.n!;
  const missing = n.kind === "missing";
  const applicant = n.kind === "person" && n.role === "applicant";
  const bad = data.worst === "conflict";
  const sub = n.kind === "document" ? n.doc : n.kind === "money" ? `${n.date || ""}${n.payer ? " · " + n.payer : ""}` : applicant ? "applicant" : n.role || (n.merged_from.length ? `${n.merged_from.length + 1} spellings merged` : `${n.docs.length} document${n.docs.length === 1 ? "" : "s"}`);
  return (
    <div
      className={cn(
        "relative flex w-[176px] flex-col rounded-[6px] border px-2.5 py-1.5 transition-opacity",
        applicant ? "border-[#0e3228] bg-[#0e3228]" : missing ? "border-dashed border-[#d98a1c] bg-[#fdf3df]" : bad ? "border-[#e39a92] bg-white" : "border-[#e1e5eb] bg-white",
        data.selected && "ring-2 ring-[#bfeb58] ring-offset-1",
        data.dim && "opacity-25",
      )}
    >
      {bad && !applicant && <span aria-hidden className="absolute top-1 bottom-1 left-0 w-[3px] rounded-r-[2px] bg-[#c0362c]" />}
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
      <span className={cn("truncate text-[10.5px] leading-[14px] font-semibold", applicant ? "text-white" : missing ? "text-[#8a5a12]" : "text-[#0e3228]")}>{n.label}</span>
      <span className={cn("truncate text-[8.5px] leading-[12px]", applicant ? "text-[#bfeb58]" : missing ? "text-[#8a5a12]" : "text-[#5f6a7b]")}>{missing ? (n.missing_kind === "required" ? "required, not uploaded" : "missing from chain") : sub}</span>
    </div>
  );
});

const nodeTypes = { caseNode: CaseNode };

function layout(g: Graph): Record<string, { x: number; y: number }> {
  const col = (n: GNode): number => {
    if (n.kind === "document" || n.kind === "missing") return 0;
    if (n.kind === "person" && n.role === "applicant") return 1;
    if (n.kind === "money") return n.money_kind === "pay" ? 3 : 4;
    return 2;
  };
  const order: Record<string, number> = { address: 0, account: 1, organisation: 2, person: 3 };
  const cols: GNode[][] = [[], [], [], [], []];
  g.nodes.forEach((n) => cols[col(n)].push(n));
  cols[0].sort((a, b) => (a.kind === "missing" && a.missing_kind === "required" ? 1 : 0) - (b.kind === "missing" && b.missing_kind === "required" ? 1 : 0) || (a.doc_type || "~").localeCompare(b.doc_type || "~") || (a.date || a.label).localeCompare(b.date || b.label));
  cols[2].sort((a, b) => (order[a.kind] ?? 9) - (order[b.kind] ?? 9) || a.label.localeCompare(b.label));
  cols[3].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  cols[4].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  const gap = 40;
  const tallest = Math.max(...cols.map((c) => c.length), 1);
  const pos: Record<string, { x: number; y: number }> = {};
  cols.forEach((c, ci) => {
    const off = ((tallest - c.length) * gap) / 2;
    c.forEach((n, i) => (pos[n.id] = { x: COL_X[ci], y: off + i * gap }));
  });
  return pos;
}

function ZoomControls() {
  const rf = useReactFlow();
  const ready = useNodesInitialized();
  useEffect(() => {
    if (ready) rf.fitView({ padding: 0.06 });
  }, [ready, rf]);
  return (
    <div className="absolute right-3 bottom-3 z-10 flex gap-1.5">
      {[
        { I: ZoomIn, label: "Zoom in", on: () => rf.zoomIn() },
        { I: ZoomOut, label: "Zoom out", on: () => rf.zoomOut() },
        { I: Maximize, label: "Fit to view", on: () => rf.fitView({ padding: 0.1 }) },
      ].map(({ I, label, on }) => (
        <button key={label} type="button" aria-label={label} title={label} onClick={on} className="grid size-9 cursor-pointer place-items-center rounded-full border border-[#e1e5eb] bg-white text-[#0e3228] transition-colors hover:bg-[#fafafa]">
          <I aria-hidden className="size-4" strokeWidth={1.7} />
        </button>
      ))}
    </div>
  );
}

export function GraphView({ caseId, docs }: { caseId: string; docs: DocDetail[] }) {
  const router = useRouter();
  const [g, setG] = useState<Graph | null>(null);
  const [bp, setBp] = useState<BlueprintRule[]>([]);
  const [states, setStates] = useState<Record<EdgeState, boolean>>({ verified: true, conflict: true, missing: true, unverifiable: true });
  const [flow, setFlow] = useState<"all" | Flow>("all");
  const [selEdge, setSelEdge] = useState<string | null>(null);
  const [selNode, setSelNode] = useState<string | null>(null);
  const [focusRule, setFocusRule] = useState<string | null>(null);

  useEffect(() => {
    api
      .graph(caseId)
      .then((x) => {
        setG(x);
        const firstBad = x.edges.find((e) => e.state === "conflict") || x.edges.find((e) => e.state === "missing");
        if (firstBad) setSelEdge(firstBad.id);
      })
      .catch(() => setG({ nodes: [], edges: [], counts: { verified: 0, conflict: 0, missing: 0, unverifiable: 0 }, applicant: "", context: {} }));
    api.blueprint(caseId).then((b) => setBp(b.rules)).catch(() => setBp([]));
  }, [caseId]);

  const docLabel = useMemo(() => Object.fromEntries(docs.map((d) => [d.doc_id, d.doc_label])), [docs]);

  const { nodes, edges } = useMemo(() => {
    if (!g) return { nodes: [] as Node<NData>[], edges: [] as Edge[] };
    const pos = layout(g);
    const ruleEdges = focusRule ? new Set(bp.find((r) => r.rule === focusRule)?.edges || []) : null;
    const visible = g.edges.filter((e) => states[e.state] && (flow === "all" || e.flow === flow) && (!ruleEdges || ruleEdges.has(e.id)));
    const worst: Record<string, EdgeState> = {};
    const rank: Record<EdgeState, number> = { conflict: 3, missing: 2, unverifiable: 1, verified: 0 };
    for (const e of g.edges) for (const id of [e.source, e.target]) if (!worst[id] || rank[e.state] > rank[worst[id]]) worst[id] = e.state;
    const touched = new Set(visible.flatMap((e) => [e.source, e.target]));
    const filtered = ruleEdges != null || visible.length < g.edges.length;
    const nodes: Node<NData>[] = [
      ...COL_TITLE.map((t, i) => ({ id: `hdr:${i}`, type: "caseNode", position: { x: COL_X[i], y: -46 }, data: { header: t }, draggable: false, selectable: false })),
      ...g.nodes.map((n) => ({ id: n.id, type: "caseNode", position: pos[n.id] || { x: 0, y: 0 }, data: { n, worst: worst[n.id], selected: selNode === n.id, dim: filtered && !touched.has(n.id) } })),
    ];
    const kindOf = Object.fromEntries(g.nodes.map((n) => [n.id, n.kind]));
    const edges: Edge[] = visible.map((e) => {
      const on = selEdge === e.id;
      const flip = (kindOf[e.target] === "missing" && kindOf[e.source] !== "document") || (kindOf[e.source] === "person" && kindOf[e.target] === "document");
      return {
        id: e.id,
        source: flip ? e.target : e.source,
        target: flip ? e.source : e.target,
        animated: on && e.state !== "verified",
        style: { stroke: STATE_COLOR[e.state], strokeWidth: on ? 3 : e.state === "verified" ? 1.2 : 1.8, strokeDasharray: e.state === "missing" ? "5 4" : e.state === "unverifiable" ? "2 3" : undefined, opacity: selEdge && !on ? 0.45 : e.state === "verified" ? 0.7 : 1 },
        markerEnd: e.state === "verified" ? undefined : { type: MarkerType.ArrowClosed, color: STATE_COLOR[e.state], width: 12, height: 12 },
      };
    });
    return { nodes, edges };
  }, [g, bp, states, flow, selEdge, selNode, focusRule]);

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<Node<NData>>([]);
  useEffect(() => {
    setRfNodes((prev) =>
      nodes.map((n) => {
        const p = prev.find((x) => x.id === n.id);
        return p ? { ...n, position: p.position, measured: p.measured } : n;
      }),
    );
  }, [nodes, setRfNodes]);

  if (!g) return <Loading label="Building the relationship graph" />;
  if (!g.nodes.length) return <section className="rounded-[20px] border border-[#e1e5eb] bg-[#fafafa] p-8 text-center text-[13.5px] text-[#626262]">The graph appears when the investigation reaches the relationship step.</section>;

  const c = g.counts;
  const edge: GEdge | undefined = g.edges.find((e) => e.id === selEdge);
  const node: GNode | undefined = g.nodes.find((n) => n.id === selNode);
  const nodeEdges = node ? g.edges.filter((e) => e.source === node.id || e.target === node.id) : [];
  const seen = new Set<string>();
  const bad = g.edges
    .filter((e) => e.state === "conflict" || e.state === "missing")
    .sort((a, b) => (a.state === b.state ? 0 : a.state === "conflict" ? -1 : 1))
    .filter((e) => {
      const k = `${e.rule}|${linkTitle(e)}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  const ruleOf = (id?: string | null) => bp.find((r) => r.rule === id);
  const openRef = (r: Ref) => router.push(`/cases/${caseId}?tab=documents&doc=${r.doc}${r.page ? `&page=${r.page}` : ""}${r.bbox ? `&hl=${r.bbox.map((v) => Math.round(v)).join(",")}` : ""}${r.field ? `&field=${r.field}` : ""}`);
  const held = bp.filter((r) => r.status === "verified").length;
  const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && /^-?[\d,.]+$/.test(v) ? Number(v.replace(/,/g, "")) : null);
  const diff = edge && edge.a && edge.b && num(edge.a.value) != null && num(edge.b.value) != null ? (num(edge.a.value) as number) - (num(edge.b.value) as number) : null;

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="m-0 text-[20px] leading-[28px] font-semibold tracking-[-0.4px] text-[#0e3228]">
            {c.verified} links verified, <span className="text-[#c0362c]">{c.conflict} broken</span>, <span className="text-[#8a5a12]">{c.missing} missing</span>
          </h2>
          <p className="m-0 text-[13px] text-[#626262]">Documents state facts about people, places, accounts and money. Each line is one fact checked against another document.</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FLOWS.map((f) => (
            <button key={f} type="button" aria-pressed={flow === f} onClick={() => setFlow(f)} className={cn("h-[34px] cursor-pointer rounded-[17px] border px-3.5 text-[13px] font-semibold transition-colors", f !== "all" && "capitalize", flow === f ? "border-[#0e3228] bg-[#0e3228] text-white" : "border-[#e1e5eb] bg-white text-[#0e3228] hover:bg-[#fafafa]")}>
              {f === "all" ? "All flows" : f}
            </button>
          ))}
          {focusRule && (
            <Btn kind="soft" icon={X} onClick={() => setFocusRule(null)}>
              {`Showing: ${ruleOf(focusRule)?.label || "one rule"}`}
            </Btn>
          )}
        </div>

        <section className="relative h-[492px] overflow-hidden rounded-[20px] border border-[#e1e5eb] bg-[#fafafa]">
          <ReactFlow
            nodes={rfNodes}
            onNodesChange={onNodesChange}
            edges={edges}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.08 }}
            minZoom={0.3}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
            nodesDraggable
            onEdgeClick={(_, e) => {
              setSelEdge(e.id);
              setSelNode(null);
            }}
            onNodeClick={(_, n) => {
              if (n.id.startsWith("hdr:")) return;
              setSelNode(n.id);
              setSelEdge(null);
            }}
          >
            <Background color="#e6e9e2" gap={22} size={1} />
            <ZoomControls />
          </ReactFlow>
          <div className="absolute bottom-3 left-4 z-10 flex flex-wrap gap-4 text-[12.5px] text-[#0e3228]">
            {STATES.map((s) => (
              <button key={s} type="button" aria-pressed={states[s]} onClick={() => setStates((x) => ({ ...x, [s]: !x[s] }))} className={cn("inline-flex cursor-pointer items-center gap-2 transition-opacity", !states[s] && "line-through opacity-40")}>
                <span aria-hidden className="w-6 border-t-2" style={{ borderTopStyle: s === "missing" ? "dashed" : s === "unverifiable" ? "dotted" : "solid", borderTopColor: STATE_COLOR[s] }} />
                {STATE_LABEL[s]}
              </button>
            ))}
          </div>
        </section>

        <section className="grid gap-4 rounded-[20px] border border-[#e1e5eb] bg-[#fafafa] p-4 md:grid-cols-[278px_minmax(0,1fr)]">
          <div className="flex flex-col">
            <Eyebrow>Broken and missing links</Eyebrow>
            <ul className="m-0 mt-2.5 flex list-none flex-col gap-2 p-0">
              {bad.length === 0 && <li className="rounded-[12px] border border-[#e1e5eb] bg-white px-3 py-3 text-[13px] text-[#27634d]">Every expected link checks out.</li>}
              {bad.map((e) => {
                const on = selEdge === e.id;
                const sev = ruleOf(e.rule)?.severity;
                return (
                  <li key={e.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelEdge(e.id);
                        setSelNode(null);
                      }}
                      className={cn("flex w-full cursor-pointer items-center gap-2.5 rounded-[12px] border px-3 py-2.5 text-left transition-colors", on ? "border-[#0e3228] bg-[#0e3228] text-white" : "border-[#e1e5eb] bg-white text-[#0e3228] hover:border-[#0e3228]/30")}
                    >
                      <span className={cn("grid size-[22px] shrink-0 place-items-center rounded-full", e.state === "conflict" ? "bg-[#fbe5e2] text-[#c0362c]" : "bg-[#fbefd6] text-[#8a5a12]")}>
                        {e.state === "conflict" ? <X aria-hidden className="size-3" strokeWidth={2.4} /> : <AlertTriangle aria-hidden className="size-3" strokeWidth={2.2} />}
                      </span>
                      <span className="min-w-0 flex-1 text-[13px] leading-[18.9px] font-semibold tracking-[-0.42px]">{linkTitle(e)}</span>
                      {sev && <span className={cn("text-[12px] capitalize", on ? "text-white" : "text-[#0e3228]")}>{sev}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="flex min-w-0 flex-col rounded-[16px] border border-[#e1e5eb] bg-white p-4">
            {edge ? (
              <div key={edge.id} className="vv-fade flex flex-col">
                <Eyebrow>Selected link</Eyebrow>
                <div className="mt-1 flex items-start justify-between gap-3">
                  <h3 className="m-0 text-[17px] leading-[24.7px] font-semibold tracking-[-0.28px] text-[#0e3228]">{edge.state === "verified" ? (edge.relation || "Link").replace(/^\w/, (x) => x.toUpperCase()) : linkTitle(edge)}</h3>
                  <Badge tone={edge.state === "conflict" ? "fail" : edge.state === "missing" ? "caution" : edge.state === "verified" ? "pass" : "neutral"} icon={edge.state === "verified" ? undefined : AlertTriangle} className="capitalize">
                    {edge.state === "verified" ? "Verified" : ruleOf(edge.rule)?.severity || STATE_LABEL[edge.state]}
                  </Badge>
                </div>
                {edge.rule && <p className="m-0 mt-0.5 text-[12px] text-[#626262]">Rule: {ruleOf(edge.rule)?.label || edge.rule}</p>}
                <p className="m-0 mt-2 text-[13px] leading-[18.9px] text-[#3f4a5a]">{edge.explain}</p>
                {(edge.a || edge.b) && (
                  <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                    {[edge.a, edge.b].map((r, i) =>
                      r ? (
                        <div key={i} className={cn("flex min-w-0 flex-col rounded-[12px] border px-3 py-3", i === 1 && edge.state === "conflict" ? "border-[#f0b4ad] bg-[#fff7f6]" : "border-[#e1e5eb] bg-white")}>
                          <span className="truncate text-[12px] font-semibold text-[#626262]">{(r.doc && docLabel[r.doc]) || r.doc || "Case context"}</span>
                          <span className="text-[12px] text-[#626262] capitalize">{(r.field || "value").replace(/_/g, " ")}</span>
                          <span className={cn("mt-1.5 text-[17px] leading-[24.7px] font-semibold break-words", i === 1 && edge.state === "conflict" ? "text-[#a12b22]" : "text-[#0e3228]")}>{fmtValue(r.value) || "(no value)"}</span>
                          {r.doc && (
                            <span className="mt-1 font-mono text-[11px] text-[#5f6a7b]">
                              {r.doc}
                              {r.page ? `, page ${r.page}` : ""}
                            </span>
                          )}
                        </div>
                      ) : null,
                    )}
                  </div>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {diff != null && diff !== 0 && <Badge tone="fail" glyph={false}>{`Differs by ${diff > 0 ? "+" : ""}${diff.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</Badge>}
                  {edge.score != null && <Badge tone="neutral" glyph={false}>{`match ${edge.score}`}</Badge>}
                  {(edge.b?.doc || edge.a?.doc) && (
                    <Btn kind="primary" size="sm" icon={Eye} className="ml-auto" onClick={() => openRef((edge.b?.doc ? edge.b : edge.a) as Ref)}>
                      Open at this field
                    </Btn>
                  )}
                </div>
              </div>
            ) : node ? (
              <div key={node.id} className="vv-fade flex flex-col gap-3">
                <Eyebrow>Selected {node.kind}</Eyebrow>
                <h3 className="m-0 text-[17px] font-semibold text-[#0e3228]">{node.label}</h3>
                {node.kind === "document" && node.doc && (
                  <Btn kind="primary" size="sm" icon={Eye} className="w-fit" onClick={() => router.push(`/cases/${caseId}?tab=documents&doc=${node.doc}`)}>
                    Open document
                  </Btn>
                )}
                {node.merged_from.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <Eyebrow>Merged spellings, with reason</Eyebrow>
                    {node.merged_from.map((m, i) => (
                      <div key={i} className="rounded-[12px] border border-[#e1e5eb] px-3 py-2 text-[13px] text-[#0e3228]">
                        <span className="font-semibold">{m.value}</span> <span className="text-[#626262]">on {m.doc}</span>
                        <span className="block font-mono text-[11px] text-[#5f6a7b]">{m.reason}</span>
                      </div>
                    ))}
                  </div>
                )}
                <Eyebrow>Links · {nodeEdges.length}</Eyebrow>
                <ul className="m-0 flex max-h-[260px] list-none flex-col gap-1.5 overflow-y-auto p-0">
                  {nodeEdges.map((e) => (
                    <li key={e.id}>
                      <button type="button" onClick={() => setSelEdge(e.id)} className="flex w-full cursor-pointer items-start gap-2 rounded-[10px] border border-[#e1e5eb] px-3 py-2 text-left text-[12.5px] leading-[18px] text-[#3f4a5a] hover:bg-[#fafafa]">
                        <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: STATE_COLOR[e.state] }} />
                        {e.explain}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="m-0 text-[13px] text-[#626262]">Pick a link or a node to see both values and their sources.</p>
            )}
          </div>
        </section>
      </div>

      <aside className="flex flex-col rounded-[20px] border border-[#e1e5eb] bg-[#fafafa] p-4 xl:sticky xl:top-0">
        <div className="flex items-center justify-between gap-2">
          <h3 className="m-0 text-[17px] leading-[24.7px] font-semibold tracking-[-0.3px] text-[#0e3228]">Workflow blueprint</h3>
          <span className="rounded-[12px] bg-[#eef0f3] px-2.5 py-0.5 text-[12px] text-[#3f4a5a]">
            {held} of {bp.length} hold
          </span>
        </div>
        <span className="mt-3 block h-1.5 overflow-hidden rounded-[3px] bg-[#e1e5eb]">
          <span className="block h-full rounded-[3px] bg-[#27634d]" style={{ width: `${bp.length ? (held / bp.length) * 100 : 0}%` }} />
        </span>
        <p className="m-0 mt-2.5 text-[12.5px] leading-[18px] text-[#626262]">What a genuine case must contain, checked link by link. Pick a rule to light up only its links.</p>
        <ul className="m-0 mt-3 flex list-none flex-col gap-2.5 p-0">
          {bp.map((r) => {
            const on = focusRule === r.rule;
            const tone = r.status === "verified" ? "pass" : r.status === "conflict" ? "fail" : r.status === "missing" ? "caution" : "neutral";
            return (
              <li key={r.rule}>
                <button type="button" onClick={() => setFocusRule(on ? null : r.rule)} className={cn("flex w-full cursor-pointer flex-col gap-2 rounded-[14px] border bg-white px-3.5 py-3 text-left transition-colors", on ? "border-2 border-[#0e3228] px-[13px] py-[11px]" : "border-[#e1e5eb] hover:border-[#0e3228]/30")}>
                  <span className="flex items-start justify-between gap-2">
                    <span className="text-[13.5px] leading-[19px] font-semibold tracking-[-0.3px] text-[#0e3228]">{r.label}</span>
                    <span className="shrink-0 rounded-[10px] bg-[#eef0f3] px-2 py-0.5 text-[11px] text-[#4b5563] capitalize">{r.flow}</span>
                  </span>
                  <span className="flex items-start gap-2">
                    <Badge tone={tone} glyph={false} className="h-[22px] shrink-0 text-[11.5px]">
                      {STATE_LABEL[r.status]}
                    </Badge>
                    <span className="text-[12px] leading-[17.4px] text-[#626262]">{r.detail}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>
    </div>
  );
}
