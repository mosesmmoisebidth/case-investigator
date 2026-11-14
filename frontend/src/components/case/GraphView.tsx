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
import { api, fmtValue, STATE_LABEL, STATE_TONE, type BlueprintRule, type DocDetail, type EdgeState, type Flow, type GEdge, type GNode, type Graph, type Ref } from "@/lib/api";
import { Badge, Btn, Card, DISPLAY, Eyebrow, MONO, Spinner } from "@/components/ui/kit";

const STATE_COLOR: Record<EdgeState, string> = { verified: "var(--pass)", conflict: "var(--fail)", missing: "var(--caution)", unverifiable: "var(--ink-4)" };
const KIND_TAG: Record<GNode["kind"], string> = { document: "DOC", person: "PER", organisation: "ORG", address: "ADR", account: "ACC", money: "MNY", missing: "MIS" };
const FLOWS: Flow[] = ["identity", "address", "money", "time"];
const STATES: EdgeState[] = ["verified", "conflict", "missing", "unverifiable"];

type NData = { n: GNode; worst?: EdgeState; badge?: "pass" | "caution" | "fail"; selected?: boolean; dim?: boolean };

const CaseNode = memo(function CaseNode({ data }: NodeProps<Node<NData>>) {
  const { n, worst, badge, selected, dim } = data;
  const missing = n.kind === "missing";
  const isApplicant = n.kind === "person" && n.role === "applicant";
  const border = missing ? "1.5px dashed var(--caution)" : selected ? "1.5px solid var(--accent)" : isApplicant ? "1.5px solid var(--accent)" : "1px solid var(--line-2)";
  const stripe = worst ? STATE_COLOR[worst] : "transparent";
  return (
    <div
      style={{
        width: n.kind === "document" ? 210 : 220,
        padding: "9px 11px 9px 13px",
        borderRadius: 10,
        border,
        background: missing ? "var(--caution-tint)" : isApplicant ? "var(--accent-tint)" : "var(--panel-2)",
        boxShadow: selected ? "var(--shadow-lg)" : "var(--shadow)",
        opacity: dim ? 0.35 : 1,
        position: "relative",
        transition: "opacity .2s",
      }}
    >
      <span style={{ position: "absolute", left: 0, top: 8, bottom: 8, width: 3, borderRadius: 3, background: stripe }} />
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <span style={{ font: `600 8.5px/1 ${MONO}`, letterSpacing: ".05em", padding: "3px 4px", borderRadius: 4, border: "1px solid var(--line-2)", color: missing ? "var(--caution)" : "var(--ink-3)", background: "var(--panel-3)" }}>{KIND_TAG[n.kind]}</span>
        <span style={{ fontWeight: 650, fontSize: 12.5, color: missing ? "var(--caution)" : "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{n.label}</span>
        {badge && badge !== "pass" && <span style={{ width: 7, height: 7, borderRadius: "50%", background: `var(--${badge})`, flex: "none" }} />}
      </div>
      <div style={{ font: `500 10px/1.35 ${MONO}`, color: "var(--ink-3)", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {n.kind === "document" ? `${n.doc}${n.date ? " · " + n.date : ""}` : n.kind === "money" ? `${n.sub || ""}${n.payer ? " · " + n.payer : ""}` : isApplicant ? "applicant" : n.role || (n.merged_from.length ? `${n.merged_from.length + 1} spellings merged` : `${n.docs.length} document${n.docs.length === 1 ? "" : "s"}`)}
      </div>
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
    <div style={{ flex: 1, minWidth: 0, border: "1px solid var(--line-2)", borderRadius: 9, padding: 10, background: "var(--panel-2)" }}>
      <Eyebrow>{title}</Eyebrow>
      <div style={{ fontWeight: 650, fontSize: 13, marginTop: 7, wordBreak: "break-word" }}>{fmtValue(r.value) || "(no value)"}</div>
      <div style={{ font: `500 10.5px/1.45 ${MONO}`, color: "var(--ink-3)", marginTop: 5 }}>
        {r.doc}
        {r.field ? ` · ${r.field}` : ""}
        {r.page ? ` · p${r.page}` : ""}
      </div>
      {r.text && <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 4 }}>{r.text}</div>}
      {r.doc && (
        <button onClick={() => onOpen(r)} style={{ marginTop: 8, border: "none", background: "none", padding: 0, color: "var(--accent)", fontWeight: 600, fontSize: 12 }}>
          Open at this field →
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
        labelStyle: { fill: STATE_COLOR[e.state], fontWeight: 600, fontSize: 10.5, fontFamily: "IBM Plex Mono, monospace" },
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

  if (!g)
    return (
      <Card style={{ display: "flex", justifyContent: "center", padding: 50 }}>
        <Spinner size={22} />
      </Card>
    );
  if (!g.nodes.length) return <Card style={{ padding: 30, textAlign: "center", color: "var(--ink-3)" }}>The graph appears when the investigation reaches the relationship step.</Card>;

  const c = g.counts;
  const missingDocs = g.nodes.filter((n) => n.kind === "missing").length;
  const edge: GEdge | undefined = g.edges.find((e) => e.id === selEdge);
  const node: GNode | undefined = g.nodes.find((n) => n.id === selNode);
  const nodeEdges = node ? g.edges.filter((e) => e.source === node.id || e.target === node.id) : [];
  const openRef = (r: Ref) => router.push(`/cases/${caseId}?tab=documents&doc=${r.doc}${r.page ? `&page=${r.page}` : ""}${r.bbox ? `&hl=${r.bbox.map((v) => Math.round(v)).join(",")}` : ""}${r.field ? `&field=${r.field}` : ""}`);
  const nodeLabel = (id: string) => g.nodes.find((n) => n.id === id)?.label || id;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 18 }}>
          {g.applicant} case: {c.verified} link{c.verified === 1 ? "" : "s"} verified, {c.conflict} broken, {c.missing} missing{missingDocs ? `, ${missingDocs} missing document${missingDocs === 1 ? "" : "s"}` : ""}
        </div>
        <div style={{ color: "var(--ink-3)", fontSize: 12.5 }}>Documents on the left state facts about the people, places, accounts and money on the right.</div>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10, alignItems: "center" }}>
        {STATES.map((s) => (
          <button
            key={s}
            onClick={() => setStates((x) => ({ ...x, [s]: !x[s] }))}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 30, padding: "0 10px", borderRadius: 8, border: "1px solid " + (states[s] ? STATE_COLOR[s] : "var(--line-2)"), background: states[s] ? "var(--panel-2)" : "var(--panel-3)", color: states[s] ? "var(--ink)" : "var(--ink-4)", fontSize: 12, fontWeight: 600 }}
          >
            <span style={{ width: 14, height: 0, borderTop: `2.5px ${s === "missing" ? "dashed" : s === "unverifiable" ? "dotted" : "solid"} ${STATE_COLOR[s]}` }} />
            {STATE_LABEL[s]} <span style={{ font: `600 10.5px/1 ${MONO}`, color: "var(--ink-3)" }}>{c[s]}</span>
          </button>
        ))}
        <span style={{ width: 1, height: 22, background: "var(--line-2)", margin: "0 4px" }} />
        {FLOWS.map((f) => (
          <button
            key={f}
            onClick={() => setFlows((x) => ({ ...x, [f]: !x[f] }))}
            style={{ height: 30, padding: "0 10px", borderRadius: 8, border: "1px solid " + (flows[f] ? "var(--accent)" : "var(--line-2)"), background: flows[f] ? "var(--accent-tint)" : "var(--panel-3)", color: flows[f] ? "var(--accent)" : "var(--ink-4)", fontSize: 12, fontWeight: 600, textTransform: "capitalize" }}
          >
            {f} flow
          </button>
        ))}
        {focusRule && (
          <Btn kind="soft" onClick={() => setFocusRule(null)} style={{ height: 30 }}>
            Showing one rule · clear
          </Btn>
        )}
      </div>
      <div className="vv-col2" style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 14 }}>
        <Card pad={0} style={{ height: 620, overflow: "hidden" }}>
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
            <Background color="var(--line-2)" gap={22} size={1} />
            <Controls showInteractive={false} position="bottom-left" />
          </ReactFlow>
        </Card>
        <Card style={{ height: 620, overflowY: "auto" }}>
          {edge ? (
            <div className="vv-fade">
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Badge tone={STATE_TONE[edge.state]}>{STATE_LABEL[edge.state].toUpperCase()}</Badge>
                <Badge tone="neutral">{edge.flow.toUpperCase()} FLOW</Badge>
                <button onClick={() => setSelEdge(null)} style={{ marginLeft: "auto", border: "none", background: "none", color: "var(--ink-3)" }}>
                  ×
                </button>
              </div>
              <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 15.5, marginTop: 12 }}>
                {nodeLabel(edge.source)} <span style={{ color: "var(--ink-4)" }}>{edge.relation}</span> {nodeLabel(edge.target)}
              </div>
              <div style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 8, lineHeight: 1.5 }}>{edge.explain}</div>
              {edge.rule && <div style={{ font: `500 10.5px/1.4 ${MONO}`, color: "var(--ink-3)", marginTop: 8 }}>rule: {bp.find((r) => r.rule === edge.rule)?.label || edge.rule}</div>}
              {edge.score != null && <div style={{ font: `500 10.5px/1.4 ${MONO}`, color: "var(--ink-3)" }}>match score: {edge.score}</div>}
              {(edge.a || edge.b) && (
                <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                  <RefBox title="This side" r={edge.a} onOpen={openRef} />
                  <RefBox title="Other side" r={edge.b} onOpen={openRef} />
                </div>
              )}
            </div>
          ) : node ? (
            <div className="vv-fade">
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Badge tone={node.kind === "missing" ? "caution" : "accent"}>{node.kind.toUpperCase()}</Badge>
                <button onClick={() => setSelNode(null)} style={{ marginLeft: "auto", border: "none", background: "none", color: "var(--ink-3)" }}>
                  ×
                </button>
              </div>
              <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 16, marginTop: 10 }}>{node.label}</div>
              {node.kind === "document" && node.doc && (
                <Btn kind="soft" style={{ marginTop: 10, height: 30 }} onClick={() => router.push(`/cases/${caseId}?tab=documents&doc=${node.doc}`)}>
                  Open document
                </Btn>
              )}
              {node.merged_from.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <Eyebrow>Merged spellings (with reason)</Eyebrow>
                  {node.merged_from.map((m, i) => (
                    <div key={i} style={{ fontSize: 12.5, marginTop: 7, padding: 8, borderRadius: 8, background: "var(--panel-3)" }}>
                      <b>{m.value}</b> <span style={{ color: "var(--ink-3)" }}>on {m.doc}</span>
                      <div style={{ font: `500 10.5px/1.4 ${MONO}`, color: "var(--ink-3)", marginTop: 3 }}>{m.reason}</div>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ marginTop: 14 }}>
                <Eyebrow>Links ({nodeEdges.length})</Eyebrow>
                {nodeEdges.map((e) => (
                  <button key={e.id} onClick={() => setSelEdge(e.id)} style={{ display: "flex", gap: 8, alignItems: "flex-start", width: "100%", textAlign: "left", border: "none", background: "none", padding: "8px 0", borderBottom: "1px solid var(--line-3)", color: "var(--ink-2)", fontSize: 12.5 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", marginTop: 5, background: STATE_COLOR[e.state], flex: "none" }} />
                    <span>{e.explain}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <Eyebrow>Workflow blueprint · {bp.length} rules</Eyebrow>
              <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 6, marginBottom: 10 }}>What a genuine case must contain, checked link by link. Click a rule to see only its links.</div>
              {bp.map((r) => (
                <button
                  key={r.rule}
                  onClick={() => setFocusRule(focusRule === r.rule ? null : r.rule)}
                  style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 10px", marginBottom: 6, borderRadius: 9, border: "1px solid " + (focusRule === r.rule ? "var(--accent)" : "var(--line)"), background: focusRule === r.rule ? "var(--accent-tint)" : "var(--panel-2)", color: "var(--ink)" }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: STATE_COLOR[r.status], flex: "none" }} />
                    <span style={{ fontWeight: 650, fontSize: 12.5, flex: 1 }}>{r.label}</span>
                    <span style={{ font: `600 9px/1 ${MONO}`, color: "var(--ink-4)" }}>{r.flow.toUpperCase()}</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 5, lineHeight: 1.4 }}>{r.detail}</div>
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
