"use client";

/** Document viewer: page image with switchable layers (tamper heatmap,
 * character anomalies, OCR boxes, fields), the extracted fields, file
 * forensics, checks, and this document's findings. */

import { useEffect, useMemo, useState } from "react";
import { api, fileUrl, fmtValue, SEV_TONE, type DocDetail, type DocumentData } from "@/lib/api";
import { Badge, Card, DISPLAY, Eyebrow, MONO, Spinner } from "@/components/ui/kit";

type Layer = "heatmap" | "chars" | "ocr" | "fields";

export function DocViewer({ caseId, docs, initial }: { caseId: string; docs: DocDetail[]; initial: { doc?: string; page?: number; hl?: number[]; field?: string } }) {
  const [docId, setDocId] = useState(initial.doc || docs[0]?.doc_id);
  const [data, setData] = useState<DocumentData | null>(null);
  const [page, setPage] = useState(initial.page || 1);
  const [layers, setLayers] = useState<Record<Layer, boolean>>({ heatmap: false, chars: true, ocr: false, fields: true });
  const [tab, setTab] = useState<"fields" | "file" | "checks" | "findings">(initial.field ? "fields" : "findings");
  const [hl, setHl] = useState<number[] | undefined>(initial.hl);
  const [hlField, setHlField] = useState<string | undefined>(initial.field);

  useEffect(() => {
    if (!docId) return;
    let alive = true;
    api.document(caseId, docId).then((x) => alive && setData(x));
    return () => {
      alive = false;
    };
  }, [caseId, docId]);

  const d = data && data.meta.doc_id === docId ? data : null;
  const pg = d?.meta.pages.find((p) => p.page === page) || d?.meta.pages[0];
  const L = (d && pg && d.layers[String(pg.page)]) || {};
  const words = (d && pg && d.words[String(pg.page)]) || [];
  const fieldsOnPage = useMemo(() => Object.entries(d?.extracted.fields || {}).filter(([, f]) => f.page === pg?.page && f.bbox), [d, pg]);

  if (!docs.length) return <Card>No documents yet.</Card>;

  const pct = (v: number, total: number) => `${(v / total) * 100}%`;
  const box = (b: number[], color: string, fill: string, key: string, title?: string, thick = 1.5) =>
    pg && (
      <div
        key={key}
        title={title}
        style={{ position: "absolute", left: pct(b[0], pg.w), top: pct(b[1], pg.h), width: pct(b[2] - b[0], pg.w), height: pct(b[3] - b[1], pg.h), border: `${thick}px solid ${color}`, background: fill, borderRadius: 2, pointerEvents: "auto" }}
      />
    );

  return (
    <div className="vv-col2" style={{ display: "grid", gridTemplateColumns: "230px 1fr 380px", gap: 14, alignItems: "start" }}>
      <Card pad={10} style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 760, overflowY: "auto" }}>
        <Eyebrow style={{ padding: "4px 4px 6px" }}>Documents</Eyebrow>
        {docs.map((x) => {
          const on = x.doc_id === docId;
          return (
            <button
              key={x.doc_id}
              onClick={() => {
                setDocId(x.doc_id);
                setPage(1);
                setHl(undefined);
                setHlField(undefined);
              }}
              style={{ display: "flex", gap: 9, alignItems: "center", textAlign: "left", padding: 7, borderRadius: 9, border: "1px solid " + (on ? "var(--accent)" : "var(--line)"), background: on ? "var(--accent-tint)" : "var(--panel-2)", color: "var(--ink)" }}
            >
              {x.thumb && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={fileUrl(caseId, x.thumb)} alt="" style={{ width: 38, height: 48, objectFit: "cover", objectPosition: "top", borderRadius: 4, border: "1px solid var(--line)", flex: "none" }} />
              )}
              <span style={{ minWidth: 0, flex: 1 }}>
                <span style={{ display: "block", fontWeight: 650, fontSize: 12.5 }}>{x.doc_label}</span>
                <span style={{ display: "block", font: `500 10px/1.35 ${MONO}`, color: "var(--ink-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.doc_id}</span>
              </span>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: `var(--${x.badge})`, flex: "none" }} />
            </button>
          );
        })}
      </Card>

      <Card pad={12}>
        {!d || !pg ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
            <Spinner size={22} />
          </div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
              <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 15 }}>{d.meta.doc_label}</div>
              <span style={{ font: `500 10.5px/1 ${MONO}`, color: "var(--ink-3)" }}>{d.meta.file}</span>
              {d.dossier && <Badge tone={d.dossier.verdict === "tampered" ? "fail" : d.dossier.verdict === "suspicious" ? "caution" : "pass"}>{d.dossier.verdict.toUpperCase()}</Badge>}
              <span style={{ marginLeft: "auto", display: "flex", gap: 5 }}>
                {(["fields", "chars", "heatmap", "ocr"] as Layer[]).map((k) => {
                  const avail = k === "heatmap" ? !!L.heatmap : k === "chars" ? !!L.chars : true;
                  return (
                    <button
                      key={k}
                      disabled={!avail}
                      onClick={() => setLayers((x) => ({ ...x, [k]: !x[k] }))}
                      style={{ height: 28, padding: "0 9px", borderRadius: 7, border: "1px solid " + (layers[k] && avail ? "var(--accent)" : "var(--line-2)"), background: layers[k] && avail ? "var(--accent-tint)" : "var(--panel-3)", color: avail ? (layers[k] ? "var(--accent)" : "var(--ink-3)") : "var(--ink-4)", font: `600 10px/1 ${MONO}`, opacity: avail ? 1 : 0.5 }}
                    >
                      {k === "heatmap" ? "TAMPER MAP" : k === "chars" ? "CHARACTERS" : k === "ocr" ? "TEXT BOXES" : "FIELDS"}
                    </button>
                  );
                })}
              </span>
            </div>
            {d.meta.pages.length > 1 && (
              <div style={{ display: "flex", gap: 5, marginBottom: 8 }}>
                {d.meta.pages.map((p) => (
                  <button key={p.page} onClick={() => setPage(p.page)} style={{ height: 26, minWidth: 30, borderRadius: 6, border: "1px solid " + (p.page === pg.page ? "var(--accent)" : "var(--line-2)"), background: p.page === pg.page ? "var(--accent-tint)" : "var(--panel-2)", font: `600 11px/1 ${MONO}`, color: "var(--ink-2)" }}>
                    {p.page}
                  </button>
                ))}
              </div>
            )}
            <div style={{ position: "relative", width: "100%", border: "1px solid var(--line)", borderRadius: 6, overflow: "hidden", background: "#fff" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={fileUrl(caseId, layers.heatmap && L.heatmap ? L.heatmap : layers.chars && L.chars ? L.chars : pg.png)} alt={d.meta.doc_label} style={{ width: "100%", display: "block" }} />
              <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
                {layers.ocr && words.map((w, i) => box(w.b, "rgba(42,157,99,.55)", "transparent", `w${i}`, w.t, 1))}
                {layers.fields &&
                  fieldsOnPage.map(([k, f]) =>
                    box(f.bbox!, hlField === k ? "var(--accent)" : "rgba(31,122,78,.7)", hlField === k ? "rgba(65,172,112,.22)" : "rgba(65,172,112,.08)", `f${k}`, `${k}: ${fmtValue(f.value)}`, hlField === k ? 2.5 : 1.2),
                  )}
                {d.findings
                  .filter((f) => f.page === pg.page && f.bbox)
                  .map((f) => box(f.bbox!, "var(--fail)", "rgba(164,57,43,.10)", `x${f.id}`, f.claim, 2))}
                {hl && box(hl, "var(--accent)", "rgba(65,172,112,.18)", "hl", "linked field", 3)}
              </div>
            </div>
            {d.dossier && <div style={{ fontSize: 12.5, color: "var(--ink-2)", marginTop: 10 }}>{d.dossier.reasons}</div>}
          </>
        )}
      </Card>

      <Card pad={0} style={{ maxHeight: 760, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", borderBottom: "1px solid var(--line)" }}>
          {(["findings", "fields", "file", "checks"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} style={{ flex: 1, height: 40, border: "none", borderBottom: "2px solid " + (tab === t ? "var(--accent)" : "transparent"), background: "none", color: tab === t ? "var(--ink)" : "var(--ink-3)", fontWeight: 600, fontSize: 12.5, textTransform: "capitalize" }}>
              {t === "file" ? "File forensics" : t}
              {t === "findings" && d ? ` (${d.findings.length})` : ""}
            </button>
          ))}
        </div>
        <div style={{ overflowY: "auto", padding: 14 }}>
          {!d ? null : tab === "findings" ? (
            d.findings.length === 0 ? (
              <div style={{ fontSize: 12.5, color: "var(--ink-3)" }}>No findings on this document.</div>
            ) : (
              d.findings.map((f) => (
                <div key={f.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--line-3)" }}>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <Badge tone={SEV_TONE[f.severity]}>{f.severity.toUpperCase()}</Badge>
                    <span style={{ font: `600 10px/1 ${MONO}`, color: "var(--ink-3)" }}>{f.id} · {f.confidence} confidence</span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, marginTop: 6, lineHeight: 1.4 }}>{f.claim}</div>
                  <div style={{ font: `500 10.5px/1.4 ${MONO}`, color: "var(--ink-3)", marginTop: 4 }}>agreeing: {f.layers.join(" + ")}</div>
                </div>
              ))
            )
          ) : tab === "fields" ? (
            <div>
              {Object.entries(d.extracted.fields || {}).map(([k, f]) => (
                <button
                  key={k}
                  onClick={() => {
                    setHlField(k);
                    setHl(undefined);
                    if (f.page) setPage(f.page);
                  }}
                  style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 8, width: "100%", textAlign: "left", padding: "7px 6px", borderRadius: 7, border: "none", background: hlField === k ? "var(--accent-tint)" : "none", color: "var(--ink)", borderBottom: "1px solid var(--line-3)" }}
                >
                  <span style={{ font: `500 10.5px/1.5 ${MONO}`, color: "var(--ink-3)" }}>{k}</span>
                  <span style={{ fontSize: 12.5, fontWeight: 600, wordBreak: "break-word" }}>{fmtValue(f.value)}</span>
                </button>
              ))}
              {d.extracted.missing_fields && d.extracted.missing_fields.length > 0 && (
                <div style={{ fontSize: 11.5, color: "var(--caution)", marginTop: 10 }}>Not found on this document: {d.extracted.missing_fields.join(", ")}</div>
              )}
              {d.extracted.transactions && d.extracted.transactions.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <Eyebrow>Statement rows · {d.extracted.transactions.length}</Eyebrow>
                  {d.extracted.transactions.map((t, i) => (
                    <button key={i} onClick={() => { setHl(t.bbox); setHlField(undefined); setPage(t.page); }} style={{ display: "grid", gridTemplateColumns: "78px 1fr 80px", gap: 6, width: "100%", textAlign: "left", border: "none", background: "none", padding: "6px 0", borderBottom: "1px solid var(--line-3)", fontSize: 12, color: "var(--ink-2)" }}>
                      <span style={{ font: `500 10.5px/1.5 ${MONO}` }}>{t.date}</span>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.description}</span>
                      <span style={{ textAlign: "right", fontWeight: 600, color: t.direction === "in" ? "var(--pass)" : "var(--ink)" }}>{t.direction === "in" ? "+" : "-"}{fmtValue(t.amount)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : tab === "file" ? (
            <FileForensics ps={d.pdf_structure} pixel={d.pixel} />
          ) : (
            <div>
              {(d.logic?.checks || []).map((c, i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "7px 0", borderBottom: "1px solid var(--line-3)" }}>
                  <Badge tone={c.status === "passed" ? "pass" : c.status === "failed" ? "fail" : "neutral"}>{c.status.toUpperCase()}</Badge>
                  <span style={{ fontSize: 12.5 }}>
                    <b>{c.check.replace(/_/g, " ")}</b>
                    <span style={{ display: "block", font: `500 10.5px/1.45 ${MONO}`, color: "var(--ink-3)", marginTop: 2 }}>
                      {Object.entries(c)
                        .filter(([k]) => !["check", "status", "breaks"].includes(k))
                        .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
                        .join(" · ")
                        .slice(0, 260)}
                    </span>
                  </span>
                </div>
              ))}
              {d.payments && <pre style={{ marginTop: 10, font: `500 10.5px/1.45 ${MONO}`, whiteSpace: "pre-wrap", color: "var(--ink-2)" }}>{JSON.stringify(d.payments, null, 1).slice(0, 1600)}</pre>}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function FileForensics({ ps, pixel }: { ps: Record<string, unknown> | null; pixel: Record<string, unknown> | null }) {
  if (!ps) return <div style={{ fontSize: 12.5, color: "var(--ink-3)" }}>Not analysed yet.</div>;
  if (!ps.applicable)
    return (
      <div style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
        Image upload: PDF structure checks do not apply.
        {pixel && Boolean(pixel.applicable) && <div style={{ marginTop: 8 }}>Pixel forensics ran on this image (see the tamper map layer).</div>}
      </div>
    );
  const rows: [string, unknown][] = [
    ["Producer", ps.producer || "unknown"],
    ["Creator", ps.creator || "unknown"],
    ["Created", ps.created],
    ["Modified", ps.modified],
    ["Saves (revisions)", ps.revisions],
    ["Editor detected", ps.editor_detected || "none"],
  ];
  const pages = (ps.pages as { page: number; fonts: string[]; annotations: unknown[]; white_boxes_over_text: unknown[]; invisible_text: unknown[] }[]) || [];
  return (
    <div>
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: "grid", gridTemplateColumns: "130px 1fr", gap: 8, padding: "7px 0", borderBottom: "1px solid var(--line-3)", fontSize: 12.5 }}>
          <span style={{ color: "var(--ink-3)" }}>{k}</span>
          <span style={{ fontWeight: 600, wordBreak: "break-word" }}>{String(v ?? "")}</span>
        </div>
      ))}
      {pages.map((p) => (
        <div key={p.page} style={{ marginTop: 10 }}>
          <Eyebrow>Page {p.page}</Eyebrow>
          <div style={{ font: `500 10.5px/1.5 ${MONO}`, color: "var(--ink-3)", marginTop: 6 }}>fonts: {p.fonts.join(", ") || "none"}</div>
          <div style={{ fontSize: 12, color: "var(--ink-2)", marginTop: 4 }}>
            {p.annotations.length} annotation(s) · {p.white_boxes_over_text.length} white box(es) over text · {p.invisible_text.length} invisible text span(s)
          </div>
        </div>
      ))}
    </div>
  );
}
