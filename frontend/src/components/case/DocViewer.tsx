"use client";

/** Document viewer: page image with switchable layers (tamper heatmap,
 * character anomalies, OCR boxes, fields), the extracted fields, file
 * forensics, checks, and this document's findings. */

import { useEffect, useMemo, useState } from "react";
import { Check, FileText, Layers, Minus, X } from "lucide-react";
import { api, fileUrl, fmtValue, type DocDetail, type DocumentData } from "@/lib/api";
import { Badge, Card, Eyebrow, Facts, Loading, SevChip, TabStrip, Tag } from "@/components/ui/kit";
import { cn } from "@/lib/utils";

type Layer = "heatmap" | "chars" | "ocr" | "fields";
type Side = "findings" | "fields" | "file" | "checks";
const LAYER_LABEL: Record<Layer, string> = { fields: "Fields", chars: "Characters", heatmap: "Tamper map", ocr: "Text boxes" };

export function DocViewer({ caseId, docs, initial }: { caseId: string; docs: DocDetail[]; initial: { doc?: string; page?: number; hl?: number[]; field?: string } }) {
  const [docId, setDocId] = useState(initial.doc || docs[0]?.doc_id);
  const [data, setData] = useState<DocumentData | null>(null);
  const [page, setPage] = useState(initial.page || 1);
  const [layers, setLayers] = useState<Record<Layer, boolean>>({ heatmap: false, chars: true, ocr: false, fields: true });
  const [tab, setTab] = useState<Side>(initial.field ? "fields" : "findings");
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

  if (!docs.length) return <Card className="text-body text-slate">No documents yet.</Card>;

  const pct = (v: number, total: number) => `${(v / total) * 100}%`;
  const box = (b: number[], color: string, fill: string, key: string, title?: string, thick = 1.5) =>
    pg && (
      <div
        key={key}
        title={title}
        style={{ position: "absolute", left: pct(b[0], pg.w), top: pct(b[1], pg.h), width: pct(b[2] - b[0], pg.w), height: pct(b[3] - b[1], pg.h), border: `${thick}px solid ${color}`, background: fill, borderRadius: 3, pointerEvents: "auto" }}
      />
    );
  const verdictTone = (v: string) => (v === "tampered" ? "fail" : v === "suspicious" ? "caution" : "pass");

  return (
    <div className="grid items-start gap-col xl:grid-cols-[240px_minmax(0,1fr)_400px]">
      <Card pad={8} className="flex flex-col gap-1 xl:sticky xl:top-0 xl:max-h-[calc(100dvh-230px)] xl:overflow-y-auto">
        <Eyebrow className="px-2 pt-1.5 pb-1">Documents · {docs.length}</Eyebrow>
        {docs.map((x) => {
          const on = x.doc_id === docId;
          return (
            <button
              key={x.doc_id}
              type="button"
              onClick={() => {
                setDocId(x.doc_id);
                setPage(1);
                setHl(undefined);
                setHlField(undefined);
              }}
              className={cn("flex cursor-pointer items-center gap-2.5 rounded-box border p-2 text-left transition-colors", on ? "border-pine/25 bg-lime-tint/60" : "border-transparent hover:border-hairline hover:bg-page")}
            >
              {x.thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={fileUrl(caseId, x.thumb)} alt="" className="h-12 w-[38px] shrink-0 rounded-md border border-hairline bg-white object-cover object-top" />
              ) : (
                <span className="grid h-12 w-[38px] shrink-0 place-items-center rounded-md bg-well">
                  <FileText aria-hidden className="size-4 text-icon-soft" />
                </span>
              )}
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-body font-medium text-pine">{x.doc_label}</span>
                <span className="truncate font-mono text-[10px] text-muted">{x.doc_id}</span>
              </span>
              <span aria-hidden className={cn("size-2 shrink-0 rounded-pill", x.badge === "pass" ? "bg-ramp-4" : x.badge === "caution" ? "bg-caution" : "bg-danger")} />
            </button>
          );
        })}
      </Card>

      <Card pad={14} className="min-w-0">
        {!d || !pg ? (
          <Loading label="Rendering the page" className="border-0" />
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <div className="flex min-w-0 flex-col">
                <span className="text-section font-medium text-pine">{d.meta.doc_label}</span>
                <span className="truncate font-mono text-[10.5px] text-muted">{d.meta.file}</span>
              </div>
              {d.dossier && <Badge tone={verdictTone(d.dossier.verdict)}>{d.dossier.verdict}</Badge>}
              <div className="ml-auto flex flex-wrap items-center gap-1 rounded-pill border border-hairline bg-page p-1">
                <Layers aria-hidden className="mx-1.5 size-3.5 text-muted" strokeWidth={1.8} />
                {(["fields", "chars", "heatmap", "ocr"] as Layer[]).map((k) => {
                  const avail = k === "heatmap" ? !!L.heatmap : k === "chars" ? !!L.chars : true;
                  const on = layers[k] && avail;
                  return (
                    <button
                      key={k}
                      type="button"
                      disabled={!avail}
                      aria-pressed={on}
                      title={avail ? undefined : "Not produced for this page"}
                      onClick={() => setLayers((x) => ({ ...x, [k]: !x[k] }))}
                      className={cn("h-7 cursor-pointer rounded-pill px-3 text-micro font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40", on ? "bg-pine text-lime" : "text-slate hover:bg-hover-panel hover:text-pine")}
                    >
                      {LAYER_LABEL[k]}
                    </button>
                  );
                })}
              </div>
            </div>
            {d.meta.pages.length > 1 && (
              <div className="mb-2.5 flex items-center gap-1">
                <span className="mr-1 text-micro text-muted">Page</span>
                {d.meta.pages.map((p) => (
                  <button key={p.page} type="button" onClick={() => setPage(p.page)} className={cn("tnum grid h-7 min-w-7 cursor-pointer place-items-center rounded-lg px-2 text-micro transition-colors", p.page === pg.page ? "bg-lime font-medium text-pine" : "text-pine hover:bg-hover-panel")}>
                    {p.page}
                  </button>
                ))}
              </div>
            )}
            <div className="relative w-full overflow-hidden rounded-box border border-hairline bg-white shadow-[0_12px_32px_-18px_rgb(14_50_40/0.35)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={fileUrl(caseId, layers.heatmap && L.heatmap ? L.heatmap : layers.chars && L.chars ? L.chars : pg.png)} alt={d.meta.doc_label} className="block w-full" />
              <div className="pointer-events-none absolute inset-0">
                {layers.ocr && words.map((w, i) => box(w.b, "rgba(39,99,77,.5)", "transparent", `w${i}`, w.t, 1))}
                {layers.fields && fieldsOnPage.map(([k, f]) => box(f.bbox!, hlField === k ? "#0e3228" : "rgba(39,99,77,.65)", hlField === k ? "rgba(191,235,88,.35)" : "rgba(191,235,88,.12)", `f${k}`, `${k}: ${fmtValue(f.value)}`, hlField === k ? 2.5 : 1.2))}
                {d.findings.filter((f) => f.page === pg.page && f.bbox).map((f) => box(f.bbox!, "#c0362c", "rgba(192,54,44,.10)", `x${f.id}`, f.claim, 2))}
                {hl && box(hl, "#0e3228", "rgba(191,235,88,.35)", "hl", "linked field", 3)}
              </div>
            </div>
            {d.dossier && (
              <p className="m-0 mt-3 rounded-box border border-hairline bg-page px-3 py-2.5 text-micro leading-[1.5] text-pine/85">
                <span className="font-medium text-pine">Analyst: </span>
                {d.dossier.reasons}
              </p>
            )}
            <div className="mt-2.5 flex flex-wrap gap-3 text-micro text-muted">
              <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm border-[1.5px] border-danger bg-danger/10" /> finding</span>
              <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm border-[1.5px] border-ramp-3 bg-lime/30" /> extracted field</span>
            </div>
          </>
        )}
      </Card>

      <Card pad={0} className="flex min-w-0 flex-col overflow-hidden xl:sticky xl:top-0 xl:max-h-[calc(100dvh-230px)]">
        <div className="border-b border-edge p-3">
          <TabStrip<Side>
            label="Document detail"
            current={tab}
            onChange={setTab}
            tabs={[
              { id: "findings", label: "Findings", badge: d && d.findings.some((f) => f.status !== "lead") ? <span className="tnum rounded-pill bg-danger-tint px-1.5 text-[10.5px] font-medium text-danger">{d.findings.filter((f) => f.status !== "lead").length}</span> : null },
              { id: "fields", label: "Fields" },
              { id: "file", label: "File" },
              { id: "checks", label: "Checks" },
            ]}
          />
        </div>
        <div className="min-h-0 overflow-y-auto p-3">
          {!d ? null : tab === "findings" ? (
            d.findings.length === 0 ? (
              <p className="m-0 flex items-center gap-2 rounded-box border border-hairline bg-page px-3 py-3 text-body text-positive">
                <Check aria-hidden className="size-4" strokeWidth={2.4} /> No findings on this document.
              </p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {[...d.findings].sort((a, b) => Number(a.status === "lead") - Number(b.status === "lead")).map((f) => (
                  <li key={f.id} className={cn("flex flex-col gap-1.5 rounded-box border bg-page p-3", f.status === "lead" ? "border-dashed border-edge opacity-70" : "border-hairline")}>
                    <span className="flex items-center gap-2">
                      {f.status === "lead" ? <Tag>Lead · unconfirmed</Tag> : <SevChip s={f.severity} />}
                      <span className="font-mono text-[10.5px] text-muted">
                        {f.id} · {f.confidence} confidence
                      </span>
                    </span>
                    <span className="text-body leading-[1.4] font-medium text-pine">{f.claim}</span>
                    <span className="flex flex-wrap gap-1">
                      {f.layers.map((l) => (
                        <Tag key={l} mono>
                          {l}
                        </Tag>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            )
          ) : tab === "fields" ? (
            <div className="flex flex-col gap-1">
              {Object.entries(d.extracted.fields || {}).map(([k, f]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    setHlField(k);
                    setHl(undefined);
                    if (f.page) setPage(f.page);
                  }}
                  className={cn("grid cursor-pointer grid-cols-[124px_minmax(0,1fr)] items-baseline gap-2 rounded-lg px-2.5 py-2 text-left transition-colors", hlField === k ? "bg-lime-tint" : "hover:bg-page")}
                >
                  <span className="truncate text-micro text-muted">{k.replace(/_/g, " ")}</span>
                  <span className="text-body font-medium break-words text-pine">{fmtValue(f.value)}</span>
                </button>
              ))}
              {d.extracted.missing_fields && d.extracted.missing_fields.length > 0 && (
                <p className="m-0 mt-2 rounded-box bg-caution-tint px-3 py-2 text-micro text-caution">Not found on this document: {d.extracted.missing_fields.join(", ")}</p>
              )}
              {d.extracted.transactions && d.extracted.transactions.length > 0 && (
                <div className="mt-3 flex flex-col gap-1">
                  <Eyebrow className="px-2.5 pb-1">Statement rows · {d.extracted.transactions.length}</Eyebrow>
                  {d.extracted.transactions.map((t, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        setHl(t.bbox);
                        setHlField(undefined);
                        setPage(t.page);
                      }}
                      className="grid cursor-pointer grid-cols-[78px_minmax(0,1fr)_84px] items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-micro transition-colors hover:bg-page"
                    >
                      <span className="tnum font-mono text-[10.5px] text-muted">{t.date}</span>
                      <span className="truncate text-pine/85">{t.description}</span>
                      <span className={cn("tnum text-right font-medium", t.direction === "in" ? "text-positive" : "text-pine")}>
                        {t.direction === "in" ? "+" : "-"}
                        {fmtValue(t.amount)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : tab === "file" ? (
            <FileForensics ps={d.pdf_structure} pixel={d.pixel} />
          ) : (
            <div className="flex flex-col gap-1.5">
              {(d.logic?.checks || []).length === 0 && <p className="m-0 text-micro text-muted">No logic checks apply to this document type.</p>}
              {(d.logic?.checks || []).map((c, i) => {
                const st = c.status === "passed" ? "pass" : c.status === "failed" ? "fail" : "neutral";
                const G = st === "pass" ? Check : st === "fail" ? X : Minus;
                return (
                  <div key={i} className="flex flex-col gap-1 rounded-box border border-hairline bg-page px-3 py-2.5">
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-body text-pine capitalize">{c.check.replace(/_/g, " ")}</span>
                      <span className={cn("inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-micro font-medium", st === "pass" ? "bg-pass-tint text-ramp-2" : st === "fail" ? "bg-danger-tint text-danger" : "bg-inert-tint text-inert")}>
                        <G aria-hidden className="size-3" strokeWidth={2.4} />
                        {st === "pass" ? "pass" : st === "fail" ? "Fail" : String(c.status)}
                      </span>
                    </span>
                    <span className="font-mono text-[10.5px] leading-[1.5] break-words text-muted">
                      {Object.entries(c)
                        .filter(([k]) => !["check", "status", "breaks"].includes(k))
                        .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
                        .join(" · ")
                        .slice(0, 260)}
                    </span>
                  </div>
                );
              })}
              {d.payments && <pre className="m-0 mt-2 overflow-x-auto rounded-box bg-code-bg p-3 font-mono text-[10.5px] leading-[1.5] whitespace-pre-wrap text-code-ink">{JSON.stringify(d.payments, null, 1).slice(0, 1600)}</pre>}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function FileForensics({ ps, pixel }: { ps: Record<string, unknown> | null; pixel: Record<string, unknown> | null }) {
  if (!ps) return <p className="m-0 text-micro text-muted">Not analysed yet.</p>;
  if (!ps.applicable)
    return (
      <div className="flex flex-col gap-2 rounded-box border border-hairline bg-page p-3 text-micro text-slate">
        <span>Image upload: PDF structure checks do not apply.</span>
        {pixel && Boolean(pixel.applicable) && <span>Pixel forensics ran on this image. Turn on the Tamper map layer to see it.</span>}
      </div>
    );
  const editor = String(ps.editor_detected || "");
  const pages = (ps.pages as { page: number; fonts: string[]; annotations: unknown[]; white_boxes_over_text: unknown[]; invisible_text: unknown[] }[]) || [];
  return (
    <div className="flex flex-col gap-3">
      {editor && editor !== "none" && (
        <p className="m-0 rounded-box bg-danger-tint px-3 py-2 text-micro font-medium text-danger">Edited with {editor}</p>
      )}
      <div className="rounded-box border border-hairline bg-page p-3">
        <Facts
          columns={1}
          facts={[
            { term: "Producer", detail: String(ps.producer || "unknown") },
            { term: "Creator", detail: String(ps.creator || "unknown") },
            { term: "Created", detail: String(ps.created ?? ""), mono: true },
            { term: "Modified", detail: String(ps.modified ?? ""), mono: true },
            { term: "Saves (revisions)", detail: String(ps.revisions ?? "") },
            { term: "Editor detected", detail: editor || "none" },
          ]}
        />
      </div>
      {pages.map((p) => (
        <div key={p.page} className="flex flex-col gap-1.5 rounded-box border border-hairline bg-page p-3">
          <Eyebrow>Page {p.page}</Eyebrow>
          <span className="font-mono text-[10.5px] leading-[1.5] break-words text-muted">fonts: {p.fonts.join(", ") || "none"}</span>
          <span className="flex flex-wrap gap-1">
            <Tag>{p.annotations.length} annotations</Tag>
            <Tag className={p.white_boxes_over_text.length ? "bg-danger-tint text-danger" : undefined}>{p.white_boxes_over_text.length} white boxes over text</Tag>
            <Tag className={p.invisible_text.length ? "bg-caution-tint text-caution" : undefined}>{p.invisible_text.length} invisible text spans</Tag>
          </span>
        </div>
      ))}
    </div>
  );
}
