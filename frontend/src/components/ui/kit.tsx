"use client";

/**
 * Shared UI kit, built from the VeriSec console's exact style formulas
 * (same tokens, mono tags, verdict badges, buttons, spinner and page header),
 * so every screen here looks like the rest of VeriSec.
 */

import type { CSSProperties, ReactNode } from "react";

export const MONO = "'IBM Plex Mono',monospace";
export const DISPLAY = "Archivo,sans-serif";

export type Tone = "pass" | "caution" | "fail" | "neutral" | "accent";

/** Verdict badge, identical to the console's session verdict badge. */
export function badgeStyle(tone: Tone, extra?: CSSProperties): CSSProperties {
  const base: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: "5px",
    font: `600 10px/1 ${MONO}`,
    letterSpacing: ".05em",
    borderRadius: "5px",
    padding: "4px 7px",
    whiteSpace: "nowrap",
  };
  if (tone === "pass" || tone === "caution" || tone === "fail")
    return { ...base, color: `var(--${tone})`, background: `var(--${tone}-tint)`, border: `1px solid var(--${tone})`, ...extra };
  if (tone === "accent")
    return { ...base, color: "var(--accent)", background: "var(--accent-tint)", border: "1px solid var(--accent-line)", ...extra };
  return { ...base, color: "var(--ink-3)", background: "var(--panel-3)", border: "1px solid var(--line-2)", ...extra };
}

export function Badge({ tone = "neutral", children, style }: { tone?: Tone; children: ReactNode; style?: CSSProperties }) {
  return <span style={badgeStyle(tone, style)}>{children}</span>;
}

/** Small mono tag, as used in the console's sidebar nav. */
export function Tag({ active, children }: { active?: boolean; children: ReactNode }) {
  return (
    <span
      style={{
        font: `600 9px/1 ${MONO}`,
        letterSpacing: ".04em",
        color: active ? "var(--accent)" : "var(--ink-3)",
        border: "1px solid " + (active ? "var(--accent-line)" : "var(--line-2)"),
        borderRadius: "5px",
        padding: "4px 5px",
        background: active ? "var(--accent-tint)" : "transparent",
        flex: "none",
      }}
    >
      {children}
    </span>
  );
}

export function Eyebrow({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ font: `600 9.5px/1 ${MONO}`, letterSpacing: ".16em", color: "var(--ink-4)", textTransform: "uppercase", ...style }}>
      {children}
    </div>
  );
}

type BtnKind = "primary" | "ghost" | "soft" | "danger";
export function Btn({
  kind = "ghost",
  children,
  onClick,
  disabled,
  style,
  type = "button",
  title,
}: {
  kind?: BtnKind;
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  style?: CSSProperties;
  type?: "button" | "submit";
  title?: string;
}) {
  const base: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    height: "36px",
    padding: "0 14px",
    borderRadius: "9px",
    fontWeight: 600,
    fontSize: "13px",
    border: "1px solid var(--line-2)",
    background: "var(--panel)",
    color: "var(--ink-2)",
    opacity: disabled ? 0.55 : 1,
    cursor: disabled ? "not-allowed" : "pointer",
    whiteSpace: "nowrap",
  };
  const kinds: Record<BtnKind, CSSProperties> = {
    primary: { background: "var(--accent)", color: "var(--accent-ink)", border: "1px solid var(--accent)" },
    ghost: {},
    soft: { background: "var(--accent-tint)", color: "var(--accent)", border: "1px solid var(--accent-line)" },
    danger: { background: "var(--fail-tint)", color: "var(--fail)", border: "1px solid var(--fail)" },
  };
  return (
    <button type={type} title={title} onClick={onClick} disabled={disabled} style={{ ...base, ...kinds[kind], ...style }}>
      {children}
    </button>
  );
}

export function Card({ children, style, pad = 18, className }: { children: ReactNode; style?: CSSProperties; pad?: number; className?: string }) {
  return (
    <div
      className={className}
      style={{
        background: "var(--panel)",
        border: "1px solid var(--line)",
        borderRadius: "13px",
        boxShadow: "var(--shadow)",
        padding: pad,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** The console's rotating ring loader. */
export function Spinner({ size = 16, color = "var(--accent)" }: { size?: number; color?: string }) {
  return (
    <span
      aria-label="Loading"
      style={{
        display: "inline-block",
        width: size,
        height: size,
        borderRadius: "50%",
        border: `2px solid var(--line-2)`,
        borderTopColor: color,
        animation: "vv-spin .8s linear infinite",
        flex: "none",
      }}
    />
  );
}

/** Pulsing status dot. */
export function Dot({ tone = "accent", pulse }: { tone?: Tone; pulse?: boolean }) {
  const c = tone === "neutral" ? "var(--ink-4)" : tone === "accent" ? "var(--accent)" : `var(--${tone})`;
  return (
    <span
      className={pulse ? "vv-pulse" : undefined}
      style={{ width: 7, height: 7, borderRadius: "50%", background: c, display: "inline-block", flex: "none" }}
    />
  );
}

export function PageHeader({ title, sub, right }: { title: string; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 20, marginBottom: 18 }}>
      <div style={{ minWidth: 0 }}>
        <h1 style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 26, letterSpacing: "-.01em", margin: 0, lineHeight: 1.15 }}>
          {title}
        </h1>
        {sub && <div style={{ color: "var(--ink-3)", fontSize: 13.5, marginTop: 6 }}>{sub}</div>}
      </div>
      {right && <div style={{ display: "flex", gap: 8, flex: "none" }}>{right}</div>}
    </div>
  );
}

export function Page({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="vv-fade" style={{ padding: "26px 30px 60px", maxWidth: wide ? 1480 : 1180, margin: "0 auto" }}>
      {children}
    </div>
  );
}

export function Kpi({ label, value, tone, sub }: { label: string; value: ReactNode; tone?: Tone; sub?: ReactNode }) {
  const color = !tone || tone === "neutral" ? "var(--ink)" : tone === "accent" ? "var(--accent)" : `var(--${tone})`;
  return (
    <Card pad={16}>
      <Eyebrow>{label}</Eyebrow>
      <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 28, marginTop: 10, color, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ font: `500 11px/1.4 ${MONO}`, color: "var(--ink-3)", marginTop: 8 }}>{sub}</div>}
    </Card>
  );
}

export function Empty({ title, sub, action }: { title: string; sub?: string; action?: ReactNode }) {
  return (
    <Card style={{ textAlign: "center", padding: "46px 20px" }}>
      <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 17 }}>{title}</div>
      {sub && <div style={{ color: "var(--ink-3)", fontSize: 13, marginTop: 6 }}>{sub}</div>}
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </Card>
  );
}
