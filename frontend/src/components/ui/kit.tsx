"use client";

/**
 * Shared UI kit in the VeriSec console design, copied from the console's own
 * primitives: section cards (#fafafa, 20px, edge line), white tiles (12px,
 * hairline), verdict and outcome pills that carry a glyph as well as a colour,
 * lime pill buttons, icon-led white fields, the switch, the tab strip, the
 * score dial and the h1 page header.
 */

import Link from "next/link";
import { AlertTriangle, Check, ChevronDown, Loader2, Minus, X, type LucideIcon } from "lucide-react";
import { forwardRef } from "react";
import type { ComponentProps, CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

export const MONO = "ui-monospace, 'SF Mono', Menlo, Consolas, monospace";
export const DISPLAY = "inherit";

export type Tone = "pass" | "caution" | "fail" | "neutral" | "accent";

/* ---------------------------------------------------------------------------
   Pills
--------------------------------------------------------------------------- */

const TONE_PILL: Record<Tone, string> = {
  pass: "bg-pass-tint text-ramp-2",
  caution: "bg-caution-tint text-caution",
  fail: "bg-danger-tint text-danger",
  neutral: "bg-inert-tint text-inert",
  accent: "bg-pine text-lime",
};
const TONE_DOT: Record<Tone, string> = { pass: "bg-ramp-3", caution: "bg-caution", fail: "bg-danger", neutral: "bg-muted", accent: "bg-lime" };
const TONE_GLYPH: Record<Tone, LucideIcon | null> = { pass: Check, caution: Minus, fail: X, neutral: null, accent: null };

/** Kept for callers that build inline styles. */
export function badgeStyle(tone: Tone, extra?: CSSProperties): CSSProperties {
  const map: Record<Tone, [string, string]> = {
    pass: ["#eaf7cd", "#1a4a3a"],
    caution: ["#fbefd6", "#b7791f"],
    fail: ["#fbe5e2", "#c0362c"],
    neutral: ["#ededed", "#6d6d6d"],
    accent: ["#0e3228", "#bfeb58"],
  };
  return { display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 9999, padding: "4px 10px", fontSize: 11.28, fontWeight: 500, whiteSpace: "nowrap", background: map[tone][0], color: map[tone][1], ...extra };
}

const sentence = (s: ReactNode) => (typeof s === "string" && s === s.toUpperCase() ? s.charAt(0) + s.slice(1).toLowerCase() : s);

/**
 * Status pill, as the console's verdict chip: a tinted pill with a glyph, so
 * pass and fail never differ by hue alone.
 */
export function Badge({ tone = "neutral", children, style, glyph = true, className }: { tone?: Tone; children: ReactNode; style?: CSSProperties; glyph?: boolean; className?: string }) {
  const G = TONE_GLYPH[tone];
  return (
    <span style={style} className={cn("inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-micro font-medium whitespace-nowrap", TONE_PILL[tone], className)}>
      {glyph && (G ? (
        <span aria-hidden className={cn("grid size-3.5 place-items-center rounded-pill text-white", TONE_DOT[tone])}>
          <G className="size-2.5" strokeWidth={3} />
        </span>
      ) : (
        <span aria-hidden className={cn("size-1.5 rounded-pill", TONE_DOT[tone])} />
      ))}
      {sentence(children)}
    </span>
  );
}

const SEV: Record<string, { pill: string; dot: string; icon: LucideIcon }> = {
  critical: { pill: "bg-danger text-white", dot: "bg-white/25", icon: AlertTriangle },
  high: { pill: "bg-danger-tint text-danger", dot: "bg-danger", icon: AlertTriangle },
  medium: { pill: "bg-caution-tint text-caution", dot: "bg-caution", icon: Minus },
  low: { pill: "bg-inert-tint text-inert", dot: "bg-muted", icon: Minus },
};

/** Finding severity. Critical is the only filled red pill on a screen. */
export function SevChip({ s }: { s: string }) {
  const k = SEV[s.toLowerCase()] || SEV.low;
  const I = k.icon;
  return (
    <span className={cn("inline-flex w-fit items-center gap-1 self-start rounded-pill py-0.5 pr-2 pl-1 text-micro font-medium whitespace-nowrap capitalize", k.pill)}>
      <span aria-hidden className={cn("grid size-4 place-items-center rounded-pill", k.dot)}>
        <I className="size-2.5 text-white" strokeWidth={2.6} />
      </span>
      {s.toLowerCase()}
    </span>
  );
}

/** Small neutral tag (the console's Tag). */
export function Tag({ active, children, mono, className }: { active?: boolean; children: ReactNode; mono?: boolean; className?: string }) {
  return <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-micro whitespace-nowrap", active ? "bg-lime-tint text-pine" : "bg-well text-inert", mono && "font-mono text-[10.5px] tracking-[0.02em]", className)}>{children}</span>;
}

/** Uppercase letter-spaced label above a figure or block. */
export function Eyebrow({ children, style, className }: { children: ReactNode; style?: CSSProperties; className?: string }) {
  return (
    <span style={style} className={cn("block text-micro tracking-[0.564px] text-muted uppercase", className)}>
      {children}
    </span>
  );
}

/** The heading above a block inside a card (the console's SectionHeading). */
export function SectionHeading({ children, count, right, className }: { children: ReactNode; count?: number; right?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-h-6 items-center gap-2", className)}>
      <h3 className="m-0 text-section font-medium text-pine">{children}</h3>
      {count != null && <span className="tnum rounded-pill bg-well px-2 py-0.5 text-micro text-slate">{count}</span>}
      {right && <div className="ml-auto flex items-center gap-2">{right}</div>}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Buttons
--------------------------------------------------------------------------- */

type BtnKind = "primary" | "dark" | "ghost" | "soft" | "danger" | "link";
type BtnSize = "sm" | "md" | "lg";
const BTN_KIND: Record<BtnKind, string> = {
  primary: "bg-lime text-pine hover:brightness-95 active:brightness-90",
  dark: "bg-pine text-lime hover:bg-pine/90",
  ghost: "border border-edge bg-page text-pine shadow-[0_1px_2px_0_rgb(10_13_18/0.05)] hover:bg-hover-light",
  soft: "bg-lime-tint text-pine hover:bg-lime-wash",
  danger: "border border-danger/25 bg-page text-danger hover:bg-danger-tint",
  link: "px-0! text-pine underline-offset-4 hover:underline",
};
const BTN_SIZE: Record<BtnSize, string> = {
  sm: "h-[35px] gap-1.5 px-3.5 text-micro [&_svg]:size-3.5",
  md: "h-10 gap-2 px-4.5 text-body [&_svg]:size-4",
  lg: "h-11 gap-2 px-6 text-[15px] [&_svg]:size-4",
};

type BtnProps = {
  kind?: BtnKind;
  size?: BtnSize;
  icon?: LucideIcon;
  iconRight?: LucideIcon;
  children?: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  style?: CSSProperties;
  className?: string;
  type?: "button" | "submit";
  title?: string;
  href?: string;
  target?: string;
  busy?: boolean;
};

export function Btn({ kind = "ghost", size, icon: I, iconRight: IR, children, onClick, disabled, style, className, type = "button", title, href, target, busy }: BtnProps) {
  const sz = size || (kind === "primary" || kind === "dark" ? "md" : "sm");
  const cls = cn(
    "inline-flex shrink-0 cursor-pointer items-center justify-center rounded-pill font-medium whitespace-nowrap transition-[filter,background-color,color] outline-none select-none focus-visible:ring-2 focus-visible:ring-pine focus-visible:ring-offset-2 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-45 [&_svg]:shrink-0",
    BTN_SIZE[sz],
    BTN_KIND[kind],
    className,
  );
  const inner = (
    <>
      {busy ? <Loader2 aria-hidden className="animate-spin" strokeWidth={2} /> : I ? <I aria-hidden strokeWidth={1.9} /> : null}
      {children}
      {IR && <IR aria-hidden strokeWidth={1.9} />}
    </>
  );
  if (href)
    return target ? (
      <a href={href} target={target} rel="noreferrer" className={cls} style={style} title={title}>
        {inner}
      </a>
    ) : (
      <Link href={href} className={cls} style={style} title={title}>
        {inner}
      </Link>
    );
  return (
    <button type={type} title={title} onClick={onClick} disabled={disabled || busy} style={style} className={cls}>
      {inner}
    </button>
  );
}

/** A round icon-only button (close, remove, move). */
export function IconBtn({ icon: I, label, onClick, disabled, className, tone = "default" }: { icon: LucideIcon; label: string; onClick?: () => void; disabled?: boolean; className?: string; tone?: "default" | "danger" }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled} className={cn("grid size-8 shrink-0 cursor-pointer place-items-center rounded-pill text-slate transition-colors hover:bg-hover-panel hover:text-pine disabled:cursor-not-allowed disabled:opacity-35", tone === "danger" && "hover:bg-danger-tint hover:text-danger", className)}>
      <I aria-hidden className="size-4" strokeWidth={1.8} />
    </button>
  );
}

/* ---------------------------------------------------------------------------
   Surfaces
--------------------------------------------------------------------------- */

/**
 * The console's section card: #fafafa, 20px radius, edge line. With a title it
 * gets the console's heading row (title, count, right-aligned action).
 */
export function Card({ children, style, pad, className, title, count, action, sub }: { children?: ReactNode; style?: CSSProperties; pad?: number; className?: string; title?: ReactNode; count?: number; action?: ReactNode; sub?: ReactNode }) {
  return (
    <section style={{ ...(pad !== undefined ? { padding: pad } : {}), ...style }} className={cn("min-w-0 rounded-shell border border-edge bg-panel", pad === undefined && "p-5", className)}>
      {(title || action) && (
        <header className={cn("flex flex-col gap-1", children ? "mb-4" : "")}>
          <SectionHeading count={count} right={action}>
            {title}
          </SectionHeading>
          {sub && <p className="m-0 text-micro text-slate">{sub}</p>}
        </header>
      )}
      {children}
    </section>
  );
}

/** A white tile inside a card: 12px, hairline. */
export function Tile({ children, className, style, onClick, active, as = "div" }: { children: ReactNode; className?: string; style?: CSSProperties; onClick?: () => void; active?: boolean; as?: "div" | "button" }) {
  const cls = cn(
    "min-w-0 rounded-box border bg-page p-3 text-left",
    active ? "border-pine/40 bg-lime-tint/40 ring-1 ring-pine/15" : "border-hairline",
    (onClick || as === "button") && "w-full cursor-pointer transition-colors hover:border-pine/20 hover:bg-hover-light",
    active && onClick && "hover:bg-lime-tint/60",
    className,
  );
  if (onClick || as === "button")
    return (
      <button type="button" onClick={onClick} className={cls} style={style}>
        {children}
      </button>
    );
  return (
    <div className={cls} style={style}>
      {children}
    </div>
  );
}

/** Label/value pairs about one subject, as a real description list. */
export function Facts({ facts, columns = 2, className }: { facts: { term: string; detail: ReactNode; mono?: boolean }[]; columns?: 1 | 2 | 3; className?: string }) {
  return (
    <dl className={cn("m-0 grid gap-x-6 gap-y-3.5", columns === 1 && "grid-cols-1", columns === 2 && "grid-cols-1 sm:grid-cols-2", columns === 3 && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3", className)}>
      {facts.map((f) => (
        <div key={f.term} className="flex min-w-0 flex-col gap-0.5">
          <dt className="text-micro text-muted">{f.term}</dt>
          <dd className={cn("m-0 min-w-0 text-body break-words text-pine [overflow-wrap:anywhere]", f.mono && "tnum font-mono text-[12.5px]")}>{f.detail}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Label + value on one ruled white row. */
export function StatRow({ label, value, sub, tone }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: Tone }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-box border border-hairline bg-page px-3 py-2.5">
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="min-w-0 text-body text-pine">{label}</span>
        {sub && <span className="text-micro text-muted">{sub}</span>}
      </span>
      <span className={cn("tnum shrink-0 text-body font-medium", tone === "fail" ? "text-danger" : tone === "caution" ? "text-caution" : tone === "pass" ? "text-positive" : "text-pine")}>{value}</span>
    </div>
  );
}

export function Spinner({ size = 16, className }: { size?: number; color?: string; className?: string }) {
  return <Loader2 aria-label="Loading" className={cn("shrink-0 animate-spin text-pine", className)} style={{ width: size, height: size }} strokeWidth={1.8} />;
}

/** A centered loading block that fills a card. */
export function Loading({ label = "Loading", className }: { label?: string; className?: string }) {
  return (
    <div className={cn("flex items-center justify-center gap-2 rounded-shell border border-edge bg-panel px-5 py-14 text-body text-slate", className)}>
      <Spinner /> {label}
    </div>
  );
}

export function Dot({ tone = "accent", pulse, className }: { tone?: Tone; pulse?: boolean; className?: string }) {
  const c = tone === "neutral" ? "bg-icon-soft" : tone === "accent" ? "bg-uptime" : tone === "pass" ? "bg-ramp-3" : tone === "caution" ? "bg-caution" : "bg-danger";
  return <span className={cn("inline-block size-2 shrink-0 rounded-pill", c, pulse && "vv-pulse", className)} />;
}

export function PageHeader({ title, sub, right, back }: { title: ReactNode; sub?: ReactNode; right?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        {back && (
          <Link href={back.href} className="inline-flex w-fit items-center gap-1 text-body text-crumb transition-colors hover:text-pine">
            <span aria-hidden>‹</span>
            {back.label}
          </Link>
        )}
        <h1 className="m-0 text-h1 font-medium tracking-[-0.45px] text-pine">{title}</h1>
        {sub && <p className="m-0 max-w-[880px] text-body text-crumb">{sub}</p>}
      </div>
      {right && <div className="flex shrink-0 flex-wrap items-center gap-2">{right}</div>}
    </header>
  );
}

export function Page({ children }: { children: ReactNode; wide?: boolean }) {
  return <div className="vv-fade flex flex-col gap-row">{children}</div>;
}

/** KPI card: eyebrow, big tabular figure, caption. */
export function Kpi({ label, value, tone, sub, icon: I }: { label: string; value: ReactNode; tone?: Tone; sub?: ReactNode; icon?: LucideIcon }) {
  const color = !tone || tone === "neutral" || tone === "accent" ? "text-pine" : tone === "pass" ? "text-positive" : tone === "caution" ? "text-caution" : "text-danger";
  return (
    <section className="flex min-w-0 flex-col gap-stack rounded-card border border-site-line bg-site-panel p-pad">
      <div className="flex items-center gap-2">
        <Eyebrow>{label}</Eyebrow>
        {I && <I aria-hidden className="ml-auto size-4 text-icon-soft" strokeWidth={1.7} />}
      </div>
      <p className={cn("tnum m-0 text-stat font-medium", color)}>{value}</p>
      {sub && <span className="text-micro text-subtle">{sub}</span>}
    </section>
  );
}

export function Empty({ title, sub, action, icon: I }: { title: string; sub?: string; action?: ReactNode; icon?: LucideIcon }) {
  return (
    <section className="flex flex-col items-center gap-2 rounded-shell border border-dashed border-edge bg-panel px-5 py-12 text-center">
      {I && (
        <span className="mb-1 grid size-11 place-items-center rounded-pill bg-lime-tint text-pine">
          <I aria-hidden className="size-5" strokeWidth={1.7} />
        </span>
      )}
      <p className="m-0 text-body font-medium text-pine">{title}</p>
      {sub && <p className="m-0 max-w-[52ch] text-micro text-slate">{sub}</p>}
      {action && <div className="mt-3">{action}</div>}
    </section>
  );
}

/* ---------------------------------------------------------------------------
   Form controls (the console's settings fields: white, 12px, lime focus ring)
--------------------------------------------------------------------------- */

const FIELD = "w-full min-w-0 rounded-box border border-[#e6e6e3] bg-white text-body text-pine outline-none transition-colors placeholder:text-[#9a9a97] focus-visible:border-pine/40 focus-visible:ring-2 focus-visible:ring-lime/60 disabled:cursor-not-allowed disabled:bg-well disabled:text-pine/60";
const FIELD_SIZE = { sm: "h-8 px-2.5 text-[13px]", md: "h-11 px-3.5" } as const;

type InputProps = Omit<ComponentProps<"input">, "size"> & { icon?: LucideIcon; size?: "sm" | "md" };
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ icon: I, size = "md", className, ...p }, ref) {
  if (!I) return <input ref={ref} {...p} className={cn(FIELD, FIELD_SIZE[size], className)} />;
  return (
    <span className="relative flex w-full min-w-0 items-center">
      <I aria-hidden className="pointer-events-none absolute left-3.5 size-[17px] text-[#a3a3a0]" strokeWidth={1.7} />
      <input ref={ref} {...p} className={cn(FIELD, FIELD_SIZE[size], "pl-10", className)} />
    </span>
  );
});

export function TextArea({ className, ...p }: ComponentProps<"textarea">) {
  return <textarea {...p} className={cn(FIELD, "min-h-[84px] resize-y px-3.5 py-2.5 leading-[1.5]", className)} />;
}

export function SelectBox({ className, size = "md", children, ...p }: Omit<ComponentProps<"select">, "size"> & { size?: "sm" | "md" }) {
  return (
    <span className={cn("relative inline-flex min-w-0 items-center", className)}>
      <select {...p} className={cn(FIELD, FIELD_SIZE[size], "cursor-pointer appearance-none pr-9")}>
        {children}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute right-3 size-4 text-slate" strokeWidth={1.8} />
    </span>
  );
}

/** A labelled field: label above, optional hint below. */
export function Field({ label, hint, children, className }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cn("flex min-w-0 flex-col gap-2", className)}>
      <span className="text-[14px] font-medium text-pine">{label}</span>
      {children}
      {hint && <span className="text-micro text-slate">{hint}</span>}
    </label>
  );
}

/** The console's switch: a real checkbox with role="switch", lime when on. */
export function Switch({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <span className="relative inline-flex shrink-0">
      <input type="checkbox" role="switch" checked={on} aria-label={label} disabled={disabled} onChange={(e) => onChange(e.currentTarget.checked)} className="peer absolute inset-0 z-10 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed" />
      <span aria-hidden className="pointer-events-none flex h-5 w-9 items-center rounded-pill bg-track p-0.5 transition-colors peer-checked:bg-lime peer-checked:[&>span]:translate-x-4 peer-focus-visible:ring-2 peer-focus-visible:ring-pine peer-focus-visible:ring-offset-2 peer-disabled:opacity-50">
        <span className="size-4 rounded-pill bg-page shadow-sm transition-transform" />
      </span>
    </span>
  );
}

/** Label + switch on one line. */
export function ToggleRow({ label, sub, on, onChange }: { label: ReactNode; sub?: ReactNode; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-box border border-hairline bg-page px-3 py-2.5">
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-body text-pine">{label}</span>
        {sub && <span className="text-micro text-slate">{sub}</span>}
      </span>
      <Switch on={on} onChange={onChange} label={typeof label === "string" ? label : "Toggle"} />
    </div>
  );
}

/** A toggleable filter pill (graph filters, document type picks). */
export function FilterChip({ on, onClick, children, color, className }: { on: boolean; onClick: () => void; children: ReactNode; color?: string; className?: string }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={cn("inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-pill border px-3 text-micro font-medium whitespace-nowrap transition-colors", on ? "border-pine/15 bg-page text-pine shadow-[0_1px_2px_0_rgb(10_13_18/0.05)]" : "border-transparent bg-well text-muted hover:text-pine", className)}>
      {color && <span aria-hidden className="size-2 rounded-pill" style={{ background: on ? color : "var(--color-track)" }} />}
      {children}
    </button>
  );
}

/* ---------------------------------------------------------------------------
   Navigation
--------------------------------------------------------------------------- */

/** The console's tab strip: white well, lime-tint active tab, scrolls instead of wrapping. */
export function TabStrip<T extends string>({ tabs, current, onChange, className, label = "Views" }: { tabs: { id: T; label: ReactNode; badge?: ReactNode }[]; current: T; onChange: (t: T) => void; className?: string; label?: string }) {
  return (
    <div className={cn("relative min-w-0", className)}>
      <nav aria-label={label} role="tablist" className="flex gap-0.5 overflow-x-auto rounded-tab border border-hairline bg-page p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((t) => {
          const on = t.id === current;
          return (
            <button key={t.id} type="button" role="tab" aria-selected={on} onClick={() => onChange(t.id)} className={cn("inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-well px-3.5 py-2 text-body whitespace-nowrap transition-colors", on ? "bg-lime-tint font-medium text-pine" : "text-slate hover:bg-hover-light hover:text-pine")}>
              {t.label}
              {t.badge}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Score dial (the console's Trust Seal ring)
--------------------------------------------------------------------------- */

const R = 76;
const C = 2 * Math.PI * R;

export function ScoreDial({ value, max = 100, label, tone = "accent", icon: I, size = 168 }: { value: number; max?: number; label: string; tone?: Tone; icon?: LucideIcon; size?: number }) {
  const swept = C * Math.max(0, Math.min(1, value / max));
  const stroke = tone === "fail" ? "var(--color-danger)" : tone === "caution" ? "var(--color-caution)" : tone === "pass" ? "var(--color-ramp-3)" : "var(--color-lime)";
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg viewBox="0 0 180 180" className="absolute inset-0 size-full -rotate-90" aria-hidden>
        <circle cx="90" cy="90" r={R} fill="none" stroke="var(--color-well)" strokeWidth="12" />
        <circle cx="90" cy="90" r={R} fill="none" stroke={stroke} strokeWidth="12" strokeLinecap="round" strokeDasharray={`${swept} ${C}`} style={{ transition: "stroke-dasharray .6s cubic-bezier(.2,.7,.3,1)" }} />
      </svg>
      <span className="relative flex flex-col items-center gap-1">
        {I && <I aria-hidden className={cn("size-6", tone === "fail" ? "text-danger" : tone === "caution" ? "text-caution" : "text-ramp-3")} strokeWidth={1.6} />}
        <span className="tnum text-stat font-medium text-pine">{value}</span>
        <span className="text-micro tracking-[0.564px] text-muted uppercase">{label}</span>
      </span>
    </div>
  );
}

/** A thin progress bar. */
export function Bar({ value, max = 100, tone = "accent", className }: { value: number; max?: number; tone?: Tone; className?: string }) {
  const c = tone === "fail" ? "bg-danger" : tone === "caution" ? "bg-caution" : tone === "pass" ? "bg-ramp-3" : "bg-lime";
  return (
    <span className={cn("block h-1.5 w-full overflow-hidden rounded-pill bg-well", className)}>
      <span className={cn("block h-full rounded-pill transition-[width] duration-500", c)} style={{ width: `${Math.max(0, Math.min(100, (value / Math.max(max, 1)) * 100))}%` }} />
    </span>
  );
}
