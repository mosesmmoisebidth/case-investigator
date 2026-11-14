"use client";

import { useEffect, useState } from "react";
import { api, type EngineInfo } from "@/lib/api";
import { Badge, Card, DISPLAY, Eyebrow, MONO, Page, PageHeader, Spinner } from "@/components/ui/kit";

const LAYER_TONE: Record<string, "accent" | "caution" | "fail" | "neutral" | "pass"> = { Intake: "neutral", Extraction: "neutral", Integrity: "fail", Verification: "caution", Relationships: "accent" };

export default function Engines() {
  const [rows, setRows] = useState<EngineInfo[] | null>(null);
  const [h, setH] = useState<{ model: string; ai: boolean } | null>(null);
  useEffect(() => {
    api.engines().then(setRows);
    api.health().then(setH).catch(() => setH(null));
  }, []);
  return (
    <Page>
      <PageHeader title="Engines" sub="VeriSec engines wrapped as tools. Each one saves its raw output to the case evidence folder and returns only the evidence path and a short summary, so every finding is traceable." />
      <Card style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ font: `600 9px/1 ${MONO}`, padding: "4px 5px", borderRadius: 5, border: "1px solid var(--accent-line)", background: "var(--accent-tint)", color: "var(--accent)" }}>AI</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 650, fontSize: 13.5 }}>Lead investigator and document analysts (LangChain deep agents)</div>
          <div style={{ font: `500 11px/1.4 ${MONO}`, color: "var(--ink-3)", marginTop: 3 }}>{h ? h.model : "checking"}</div>
        </div>
        <Badge tone={h?.ai ? "pass" : "caution"}>{h?.ai ? "ON" : "DETERMINISTIC MODE"}</Badge>
      </Card>
      {!rows ? (
        <Card style={{ display: "flex", justifyContent: "center", padding: 40 }}>
          <Spinner size={22} />
        </Card>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
          {rows.map((e) => (
            <Card key={e.id}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ font: `600 9px/1 ${MONO}`, padding: "4px 5px", borderRadius: 5, border: "1px solid var(--line-2)", color: "var(--ink-3)", background: "var(--panel-3)" }}>{e.code}</span>
                <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 15, flex: 1 }}>{e.name}</span>
                <Badge tone={LAYER_TONE[e.layer] || "neutral"}>{e.layer.toUpperCase()}</Badge>
              </div>
              <div style={{ fontSize: 12.5, color: "var(--ink-2)", marginTop: 10, lineHeight: 1.5 }}>{e.does}</div>
              <Eyebrow style={{ marginTop: 12 }}>Source</Eyebrow>
              <div style={{ font: `500 11px/1.4 ${MONO}`, color: "var(--ink-3)", marginTop: 5 }}>{e.source}</div>
            </Card>
          ))}
        </div>
      )}
    </Page>
  );
}
