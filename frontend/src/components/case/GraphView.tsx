"use client";

/**
 * The relationship graph: documents on the left state facts about the people,
 * places, companies, accounts and money on the right. Every link is coloured by
 * its state (verified, conflict, missing, unverifiable) and carries both values
 * and their source fields. The blueprint checklist shows which expected
 * relationships hold.
 */

import "@xyflow/react/dist/style.css";
import { Background, Controls, Handle, MarkerType, Position, ReactFlow, useNodesState, type Edge, type Node, type NodeProps } from "@xyflow/react";
import { useRouter } from "next/navigation";
import { memo, useEffect, useMemo, useState } from "react";
import { ArrowRight, Banknote, Building2, FileQuestion, FileText, Landmark, MapPin, User, X, type LucideIcon } from "lucide-react";
import { api, fmtValue, STATE_LABEL, STATE_TONE, type BlueprintRule, type DocDetail, type EdgeState, type Flow, type GEdge, type GNode, type Graph, type Ref } from "@/lib/api";
import { Badge, Btn, Card, Eyebrow, FilterChip, IconBtn, Loading, Tag } from "@/components/ui/kit";
import { cn } from "@/lib/utils";

const STATE_COLOR: Record<EdgeState, string> = { verified: "#27634d", conflict: "#c0362c", missing: "#b7791f", unverifiable: "#8c8c8c" };
const FLOWS: Flow[] = ["identity", "address", "money", "time"];
const STATES: EdgeState[] = ["verified", "conflict", "missing", "unverifiable"];

type NData = { n: GNode; worst?: EdgeState; badge?: "pass" | "caution" | "fail"; selected?: boolean; dim?: boolean };

const KIND_ICON: Record<GNode["kind"], LucideIcon> = { document: FileText, person: User, organisation: Building2, address: MapPin, account: Landmark, money: Banknote, missing: FileQuestion };

const CaseNode = memo(function CaseNode({ data }: NodeProps<Node<NData>>) {
  const { n, worst, badge, selected, dim } = data;
  const missing = n.kind === "missing";
  const isApplicant = n.kind === "person" && n.role === "applicant";
  const I = KIND_ICON[n.kind];
  return (
    <div
      className={cn(
        "relative flex items-center gap-2.5 rounded-box border bg-page py-2 pr-3 pl-2 transition-[opacity,box-shadow]",
        n.kind === "document" ? "w-[214px]" : "w-[224px]",
        missing ? "border-dashed border-caution/60 bg-caution-tint/60" : selected ? "border-pine shadow-[0_10px_28px_-12px_rgb(14_50_40/0.45)] ring-2 ring-lime" : isApplicant ? "border-pine/40 bg-lime-tint/70" : "border-edge shadow-[0_1px_2px_0_rgb(10_13_18/0.05)]",
        dim && "opacity-30",
      )}
    >
      {worst && worst !== "verified" && <span aria-hidden className="absolute top-2 bottom-2 left-0 w-[3px] rounded-r-full" style={{ background: STATE_COLOR[worst] }} />}
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
      <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", missing ? "bg-caution/15 text-caution" : isApplicant ? "bg-pine text-lime" : n.kind === "document" ? "bg-well text-pine" : "bg-lime-tint text-pine")}>
        <I aria-hidden className="size-4" strokeWidth={1.7} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-1.5">
          <span className={cn("truncate text-[12.5px] leading-[1.3] font-medium", missing ? "text-caution" : "text-pine")}>{n.label}</span>
          {badge && badge !== "pass" && <span aria-hidden className={cn("size-1.5 shrink-0 rounded-pill", badge === "caution" ? "bg-caution" : "bg-danger")} />}
        </span>
        <span className="truncate font-mono text-[9.5px] leading-[1.4] text-muted">
          {n.kind === "document" ? `${n.doc}${n.date ? " · " + n.date : ""}` : n.kind === "money" ? `${n.sub || ""}${n.payer ? " · " + n.payer : ""}` : isApplicant ? "applicant" : n.role || (n.merged_from.length ? `${n.merged_from.length + 1} spellings merged` : `${n.docs.length} document${n.docs.length === 1 ? "" : "s"}`)}
        </span>
      </span>
    </div>
  );
});

const nodeTypes = { caseNode: CaseNode };

function layout(g: Graph): Record<string, { x: number; y: number }> {
  // columns: documents | people | addresses and companies | accounts | pay events | deposits and payments
  const col = (n: GNode): number => {
    if (n.kind === "document" || n.kind === "missing") return 0;
    if (n.kind === "person") return 1;
    if (n.kind === "account") return 3;
    if (n.kind === "money") return n.money_kind === "pay" ? 4 : 5;
    return 2;
  };
  const order: Record<string, number> = { address: 0, organisation: 1 };
  const cols: GNode[][] = [[], [], [], [], [], []];
  g.nodes.forEach((n) => cols[col(n)].push(n));
  cols[0].sort((a, b) => (a.kind === "missing" && a.missing_kind === "required" ? 1 : 0) - (b.kind === "missing" && b.missing_kind === "required" ? 1 : 0) || (a.doc_type || "~").localeCompare(b.doc_type || "~") || (a.date || a.label).localeCompare(b.date || b.label));
  cols[1].sort((a, b) => (a.role === "applicant" ? -1 : 0) - (b.role === "applicant" ? -1 : 0));
  cols[2].sort((a, b) => (order[a.kind] ?? 9) - (order[b.kind] ?? 9) || (a.role || "").localeCompare(b.role || "") || a.label.localeCompare(b.label));
  cols[4].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  cols[5].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  const gap = 80;

  const tallest = Math.max(...cols.map((c) => c.length), 1);
  const pos: Record<string, { x: number; y: number }> = {};
  let xi = 0;
  cols.forEach((c) => {
    if (!c.length) return;
    const off = ((tallest - c.length) * gap) / 2;
    c.forEach((n, i) => (pos[n.id] = { x: xi * 300, y: off + i * gap }));
    xi += 1;
  });

  return pos;
}

function RefBox({ title, r, onOpen }: { title: string; r?: Ref | null; onOpen: (r: Ref) => void }) {
  if (!r) return null;
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5 rounded-box border border-hairline bg-page p-3">
      <Eyebrow>{title}</Eyebrow>
      <span className="text-body font-medium break-words text-pine">{fmtValue(r.value) || "(no value)"}</span>
      <span className="font-mono text-[10.5px] leading-[1.45] text-muted">
        {r.doc}
        {r.field ? ` · ${r.field}` : ""}
        {r.page ? ` · p${r.page}` : ""}
      </span>
      {r.text && <span className="text-micro text-slate">{r.text}</span>}
      {r.doc && (
        <button type="button" onClick={() => onOpen(r)} className="mt-1 inline-flex w-fit cursor-pointer items-center gap-1 text-micro font-medium text-pine hover:underline">
          Open at this field <ArrowRight aria-hidden className="size-3" strokeWidth={2} />
        </button>
      )}
    </div>
  );
}

export function GraphView({ caseId, docs }: { caseId: string; docs: DocDetail[] }) {
  const router = useRouter();
  const [g, setG] = useState<Graph | null>(null);
  const [bp, setBp] = useState<BlueprintRule[]>([]);
  const [states, setStates] = useState<Record<EdgeState, boolean>>({ verified: true, conflict: true, missing: true, unverifiable: true });
  const [flows, setFlows] = useState<Record<Flow, boolean>>({ identity: true, address: true, money: true, time: true });
  const [selEdge, setSelEdge] = useState<string | null>(null);
  const [selNode, setSelNode] = useState<string | null>(null);
  const [focusRule, setFocusRule] = useState<string | null>(null);

  useEffect(() => {
    api.graph(caseId).then(setG).catch(() => setG({ nodes: [], edges: [], counts: { verified: 0, conflict: 0, missing: 0, unverifiable: 0 }, applicant: "", context: {} }));
    api.blueprint(caseId).then((b) => setBp(b.rules)).catch(() => setBp([]));
  }, [caseId]);

  const badgeOf = useMemo(() => Object.fromEntries(docs.map((d) => [`doc:${d.doc_id}`, d.badge])), [docs]);

  const { nodes, edges } = useMemo(() => {
    if (!g) return { nodes: [] as Node<NData>[], edges: [] as Edge[] };
    const pos = layout(g);
    const ruleEdges = focusRule ? new Set(bp.find((r) => r.rule === focusRule)?.edges || []) : null;
    const visible = g.edges.filter((e) => states[e.state] && flows[e.flow] && (!ruleEdges || ruleEdges.has(e.id)));
    const worst: Record<string, EdgeState> = {};
    const rank: Record<EdgeState, number> = { conflict: 3, missing: 2, unverifiable: 1, verified: 0 };
    for (const e of g.edges) {
      for (const id of [e.source, e.target]) if (!worst[id] || rank[e.state] > rank[worst[id]]) worst[id] = e.state;
    }
    const touched = new Set(visible.flatMap((e) => [e.source, e.target]));
    const nodes: Node<NData>[] = g.nodes.map((n) => ({
      id: n.id,
      type: "caseNode",
      position: pos[n.id] || { x: 0, y: 0 },
      data: { n, worst: worst[n.id], badge: badgeOf[n.id], selected: selNode === n.id, dim: (ruleEdges != null || visible.length < g.edges.length) && !touched.has(n.id) },
    }));
    const kindOf = Object.fromEntries(g.nodes.map((n) => [n.id, n.kind]));
    const edges: Edge[] = visible.map((e) => {
      const on = selEdge === e.id;
      const flip = (kindOf[e.target] === "missing" && kindOf[e.source] !== "document") || (kindOf[e.source] === "person" && kindOf[e.target] === "document");
      return {
        id: e.id,
        source: flip ? e.target : e.source,
        target: flip ? e.source : e.target,
        animated: e.state === "conflict" && on,
        label: on || e.state === "conflict" ? (e.state === "verified" ? e.relation : STATE_LABEL[e.state].toLowerCase() + ": " + e.relation) : undefined,
        labelStyle: { fill: STATE_COLOR[e.state], fontWeight: 600, fontSize: 10.5, fontFamily: "ui-monospace, monospace" },
        labelBgStyle: { fill: "var(--panel-2)", fillOpacity: 0.92 },
        labelBgPadding: [5, 3] as [number, number],
        labelBgBorderRadius: 4,
        style: {
          stroke: STATE_COLOR[e.state],
          strokeWidth: on ? 3.2 : e.state === "conflict" ? 2.2 : 1.5,
          strokeDasharray: e.state === "missing" ? "6 5" : e.state === "unverifiable" ? "2 4" : undefined,
          opacity: selEdge && !on ? 0.35 : 1,
        },
        markerEnd: { type: MarkerType.ArrowClosed, color: STATE_COLOR[e.state], width: 14, height: 14 },
      };
    });
    return { nodes, edges };
  }, [g, bp, states, flows, selEdge, selNode, focusRule, badgeOf]);

  // React Flow measures each node through onNodesChange; keep the store in sync
  // with the computed nodes (and keep any position the investigator dragged to).
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
  if (!g.nodes.length) return <Card className="py-10 text-center text-body text-slate">The graph appears when the investigation reaches the relationship step.</Card>;

  const c = g.counts;
  const missingDocs = g.nodes.filter((n) => n.kind === "missing").length;
  const edge: GEdge | undefined = g.edges.find((e) => e.id === selEdge);
  const node: GNode | undefined = g.nodes.find((n) => n.id === selNode);
  const nodeEdges = node ? g.edges.filter((e) => e.source === node.id || e.target === node.id) : [];
  const openRef = (r: Ref) => router.push(`/cases/${caseId}?tab=documents&doc=${r.doc}${r.page ? `&page=${r.page}` : ""}${r.bbox ? `&hl=${r.bbox.map((v) => Math.round(v)).join(",")}` : ""}${r.field ? `&field=${r.field}` : ""}`);
  const nodeLabel = (id: string) => g.nodes.find((n) => n.id === id)?.label || id;
  const held = bp.filter((r) => r.status === "verified").length;

  return (
    <div className="flex flex-col gap-col">
      <div className="flex min-w-0 flex-col gap-1">
        <h2 className="m-0 text-section font-medium text-pine">
          {c.verified} link{c.verified === 1 ? "" : "s"} verified, <span className={c.conflict ? "text-danger" : undefined}>{c.conflict} broken</span>, <span className={c.missing ? "text-caution" : undefined}>{c.missing} missing</span>
          {missingDocs ? `, ${missingDocs} missing document${missingDocs === 1 ? "" : "s"}` : ""}
        </h2>
        <p className="m-0 text-micro text-slate">Documents on the left state facts about the people, places, accounts and money on the right. Click a line to see both values and their sources.</p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 rounded-[20px] border border-hairline bg-panel p-1.5">
        {STATES.map((s) => (
          <FilterChip key={s} on={states[s]} onClick={() => setStates((x) => ({ ...x, [s]: !x[s] }))}>
            <span aria-hidden className="w-4 border-t-[2.5px]" style={{ borderTopStyle: s === "missing" ? "dashed" : s === "unverifiable" ? "dotted" : "solid", borderTopColor: states[s] ? STATE_COLOR[s] : "var(--color-track)" }} />
            {STATE_LABEL[s]}
            <span className="tnum text-muted">{c[s]}</span>
          </FilterChip>
        ))}
        <span aria-hidden className="mx-1 h-5 w-px bg-edge" />
        {FLOWS.map((f) => (
          <FilterChip key={f} on={flows[f]} onClick={() => setFlows((x) => ({ ...x, [f]: !x[f] }))} className="capitalize">
            {f}
          </FilterChip>
        ))}
        {focusRule && (
          <Btn kind="dark" size="sm" icon={X} className="ml-auto h-8" onClick={() => setFocusRule(null)}>
            One rule shown
          </Btn>
        )}
      </div>
      <div className="grid gap-col xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card pad={0} className="h-[640px] overflow-hidden bg-page">
          <ReactFlow
            nodes={rfNodes}
            onNodesChange={onNodesChange}
            edges={edges}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.12 }}
            minZoom={0.3}
            maxZoom={1.8}
            proOptions={{ hideAttribution: true }}
            nodesDraggable
            onEdgeClick={(_, e) => {
              setSelEdge(e.id);
              setSelNode(null);
            }}
            onNodeClick={(_, n) => {
              setSelNode(n.id);
              setSelEdge(null);
            }}
            onPaneClick={() => {
              setSelEdge(null);
              setSelNode(null);
            }}
          >
            <Background color="#e1e5eb" gap={22} size={1.2} />
            <Controls showInteractive={false} position="bottom-left" />
          </ReactFlow>
        </Card>
        <Card className="h-[640px] overflow-y-auto">
          {edge ? (
            <div className="vv-fade flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Badge tone={STATE_TONE[edge.state]}>{STATE_LABEL[edge.state]}</Badge>
                <Tag className="capitalize">{edge.flow} flow</Tag>
                <IconBtn icon={X} label="Close" className="ml-auto" onClick={() => setSelEdge(null)} />
              </div>
              <h3 className="m-0 text-section leading-[1.4] font-medium text-pine">
                {nodeLabel(edge.source)} <span className="font-normal text-muted">{edge.relation}</span> {nodeLabel(edge.target)}
              </h3>
              <p className="m-0 text-read text-pine/85">{edge.explain}</p>
              {(edge.rule || edge.score != null) && (
                <div className="flex flex-wrap gap-1.5">
                  {edge.rule && <Tag>Rule: {bp.find((r) => r.rule === edge.rule)?.label || edge.rule}</Tag>}
                  {edge.score != null && <Tag mono>match {edge.score}</Tag>}
                </div>
              )}
              {(edge.a || edge.b) && (
                <div className="flex gap-2">
                  <RefBox title="This side" r={edge.a} onOpen={openRef} />
                  <RefBox title="Other side" r={edge.b} onOpen={openRef} />
                </div>
              )}
            </div>
          ) : node ? (
            <div className="vv-fade flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Badge tone={node.kind === "missing" ? "caution" : "accent"} glyph={false}>
                  {node.kind}
                </Badge>
                <IconBtn icon={X} label="Close" className="ml-auto" onClick={() => setSelNode(null)} />
              </div>
              <h3 className="m-0 text-section font-medium text-pine">{node.label}</h3>
              {node.kind === "document" && node.doc && (
                <Btn kind="soft" icon={FileText} className="w-fit" onClick={() => router.push(`/cases/${caseId}?tab=documents&doc=${node.doc}`)}>
                  Open document
                </Btn>
              )}
              {node.merged_from.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <Eyebrow>Merged spellings, with reason</Eyebrow>
                  {node.merged_from.map((m, i) => (
                    <div key={i} className="flex flex-col gap-0.5 rounded-box border border-hairline bg-page px-3 py-2">
                      <span className="text-body text-pine">
                        <span className="font-medium">{m.value}</span> <span className="text-muted">on {m.doc}</span>
                      </span>
                      <span className="font-mono text-[10.5px] text-muted">{m.reason}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <Eyebrow>Links · {nodeEdges.length}</Eyebrow>
                {nodeEdges.map((e) => (
                  <button key={e.id} type="button" onClick={() => setSelEdge(e.id)} className="flex cursor-pointer items-start gap-2.5 rounded-box border border-hairline bg-page px-3 py-2 text-left text-micro leading-[1.5] text-pine/85 transition-colors hover:bg-hover-light">
                    <span aria-hidden className="mt-1 size-2 shrink-0 rounded-pill" style={{ background: STATE_COLOR[e.state] }} />
                    <span>{e.explain}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <h3 className="m-0 text-section font-medium text-pine">Workflow blueprint</h3>
                  <span className="tnum rounded-pill bg-well px-2 py-0.5 text-micro text-slate">
                    {held}/{bp.length} hold
                  </span>
                </div>
                <p className="m-0 text-micro text-slate">What a genuine case must contain, checked link by link. Click a rule to see only its links.</p>
              </div>
              <div className="flex flex-col gap-1.5">
                {bp.map((r) => {
                  const on = focusRule === r.rule;
                  return (
                    <button
                      key={r.rule}
                      type="button"
                      onClick={() => setFocusRule(on ? null : r.rule)}
                      className={cn("flex cursor-pointer flex-col gap-1 rounded-box border px-3 py-2.5 text-left transition-colors", on ? "border-pine/30 bg-lime-tint/60" : "border-hairline bg-page hover:bg-hover-light")}
                    >
                      <span className="flex items-center gap-2">
                        <span aria-hidden className="size-2 shrink-0 rounded-pill" style={{ background: STATE_COLOR[r.status] }} />
                        <span className="min-w-0 flex-1 text-body font-medium text-pine">{r.label}</span>
                        <span className="text-[10px] tracking-[0.5px] text-muted uppercase">{r.flow}</span>
                      </span>
                      <span className="pl-4 text-micro leading-[1.45] text-slate">{r.detail}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
