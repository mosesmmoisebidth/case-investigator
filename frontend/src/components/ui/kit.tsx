"use client";

/**
 * Shared UI kit, built to the Figma redesign ("VeriSec Case Investigator,
 * Redesign"). Tokens used throughout:
 *   pine #0e3228 · lime #bfeb58 · lime tint #eefccd · line #e1e5eb
 *   panel #fafafa · sidebar #f6f7f4 · body #3f4a5a · muted #626262 · label #5f6a7b
 *   danger #c0362c / ink #a12b22 / tint #fbe5e2 · caution ink #8a5a12 / tint #fbefd6
 *   pass #27634d / tint #eaf7cd · neutral tint #eef0f3 / ink #4b5563
 * Section cards: #fafafa, 20px radius, line border, 20px padding, 17px titles.
 * Tiles: white, 14px radius. Chips: 24px pills with a 12px glyph. Buttons:
 * 34px (small), 44px (default) and 50px (final action) pills.
 */

import Link from "next/link";
import { AlertTriangle, Check, ChevronDown, Clock, Loader2, X, type LucideIcon } from "lucide-react";
import { forwardRef } from "react";
import type { ComponentProps, CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

export const MONO = "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace";
export const DISPLAY = "inherit";

export type Tone = "pass" | "caution" | "fail" | "neutral" | "accent" | "critical";

/* ---------------------------------------------------------------------------
   Chips
--------------------------------------------------------------------------- */

const CHIP: Record<Tone, string> = {
  pass: "bg-[#eaf7cd] text-[#27634d]",
  caution: "bg-[#fbefd6] text-[#8a5a12]",
  fail: "bg-[#fbe5e2] text-[#a12b22]",
  critical: "bg-[#c0362c] text-white",
  neutral: "bg-[#eef0f3] text-[#4b5563]",
  accent: "bg-[#0e3228] text-[#bfeb58]",
};
const CHIP_GLYPH: Record<Tone, LucideIcon | null> = { pass: Check, caution: Clock, fail: X, critical: AlertTriangle, neutral: null, accent: null };

/** Kept for callers that build inline styles. */
export function badgeStyle(tone: Tone, extra?: CSSProperties): CSSProperties {
  const map: Record<Tone, [string, string]> = {
    pass: ["#eaf7cd", "#27634d"],
    caution: ["#fbefd6", "#8a5a12"],
    fail: ["#fbe5e2", "#a12b22"],
    critical: ["#c0362c", "#ffffff"],
    neutral: ["#eef0f3", "#4b5563"],
    accent: ["#0e3228", "#bfeb58"],
  };
  return { display: "inline-flex", alignItems: "center", gap: 5, borderRadius: 12, padding: "3px 10px", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", background: map[tone][0], color: map[tone][1], ...extra };
}

const sentence = (s: ReactNode) => (typeof s === "string" && s === s.toUpperCase() && /[A-Z]/.test(s) ? s.charAt(0) + s.slice(1).toLowerCase() : s);

/** Status chip: 24px pill, 12px glyph, 12px semibold label. Colour is never the only signal. */
export function Badge({ tone = "neutral", children, style, glyph = true, icon, className }: { tone?: Tone; children: ReactNode; style?: CSSProperties; glyph?: boolean; icon?: LucideIcon; className?: string }) {
  const G = icon || CHIP_GLYPH[tone];
  return (
    <span style={style} className={cn("inline-flex h-6 w-fit shrink-0 items-center gap-[5px] rounded-[12px] px-2.5 text-[12px] leading-[18px] font-semibold whitespace-nowrap", CHIP[tone], className)}>
      {glyph && G && <G aria-hidden className="size-3 shrink-0" strokeWidth={2.2} />}
      {sentence(children)}
    </span>
  );
}

const SEV_TONE: Record<string, Tone> = { critical: "critical", high: "fail", medium: "caution", low: "neutral", info: "neutral" };

/** Finding severity: Critical is the only solid red chip on a screen. */
export function SevChip({ s, className }: { s: string; className?: string }) {
  const k = s.toLowerCase();
  return (
    <Badge tone={SEV_TONE[k] || "neutral"} icon={AlertTriangle} className={cn("self-start capitalize", className)}>
      {k}
    </Badge>
  );
}

/** Small neutral tag. */
export function Tag({ active, children, mono, className }: { active?: boolean; children: ReactNode; mono?: boolean; className?: string }) {
  return <span className={cn("inline-flex h-6 items-center rounded-[12px] px-2.5 text-[12px] whitespace-nowrap", active ? "bg-[#eefccd] font-semibold text-[#0e3228]" : "bg-[#eef0f3] text-[#4b5563]", mono && "font-mono text-[11px] tracking-[-0.02em]", className)}>{children}</span>;
}

/** 11px bold uppercase label. */
export function Eyebrow({ children, style, className }: { children: ReactNode; style?: CSSProperties; className?: string }) {
  return (
    <span style={style} className={cn("block text-[11px] leading-4 font-bold tracking-[0.4px] text-[#5f6a7b] uppercase", className)}>
      {children}
    </span>
  );
}

/** A card's heading row: 17px title, optional count, right-aligned action. */
export function SectionHeading({ children, count, right, className }: { children: ReactNode; count?: number; right?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-h-[34px] items-center gap-2", className)}>
      <h3 className="m-0 text-[17px] leading-[24.7px] font-semibold tracking-[-0.3px] text-[#0e3228]">{children}</h3>
      {count != null && <span className="grid h-5 min-w-5 place-items-center rounded-[10px] bg-[#eef0f3] px-1.5 text-[11.5px] font-semibold text-[#4b5563]">{count}</span>}
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
  primary: "bg-[#bfeb58] text-[#0e3228] hover:brightness-95 active:brightness-90",
  dark: "bg-[#0e3228] text-white hover:bg-[#0e3228]/90",
  ghost: "border border-[#e1e5eb] bg-white text-[#0e3228] hover:bg-[#fafafa]",
  soft: "bg-[#eefccd] text-[#0e3228] hover:bg-[#e4f8b4]",
  danger: "border border-[#e1e5eb] bg-white text-[#a12b22] hover:bg-[#fbe5e2]",
  link: "px-0! text-[#0e3228] underline-offset-4 hover:underline",
};
const BTN_SIZE: Record<BtnSize, string> = {
  sm: "h-[34px] gap-1.5 rounded-[17px] px-3 text-[13px] [&_svg]:size-[14px]",
  md: "h-11 gap-2 rounded-[22px] px-[18px] text-[14px] [&_svg]:size-4",
  lg: "h-[50px] gap-2 rounded-[25px] px-6 text-[15px] [&_svg]:size-4",
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
    "inline-flex shrink-0 cursor-pointer items-center justify-center font-semibold tracking-[-0.3px] whitespace-nowrap transition-[filter,background-color,color] outline-none select-none focus-visible:ring-2 focus-visible:ring-[#0e3228] focus-visible:ring-offset-2 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-45 [&_svg]:shrink-0",
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

/** A round icon-only button. */
export function IconBtn({ icon: I, label, onClick, disabled, className, tone = "default", bordered }: { icon: LucideIcon; label: string; onClick?: () => void; disabled?: boolean; className?: string; tone?: "default" | "danger"; bordered?: boolean }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled} className={cn("grid size-[34px] shrink-0 cursor-pointer place-items-center rounded-full text-[#3f4a5a] transition-colors hover:bg-[#eef0f3] hover:text-[#0e3228] disabled:cursor-not-allowed disabled:opacity-35", bordered && "border border-[#e1e5eb] bg-white", tone === "danger" && "hover:bg-[#fbe5e2] hover:text-[#a12b22]", className)}>
      <I aria-hidden className="size-[15px]" strokeWidth={1.8} />
    </button>
  );
}

/* ---------------------------------------------------------------------------
   Surfaces
--------------------------------------------------------------------------- */

/** Section card: #fafafa, 20px radius, line border, 20px padding. */
export function Card({ children, style, pad, className, title, count, action, sub, white }: { children?: ReactNode; style?: CSSProperties; pad?: number; className?: string; title?: ReactNode; count?: number; action?: ReactNode; sub?: ReactNode; white?: boolean }) {
  return (
    <section style={{ ...(pad !== undefined ? { padding: pad } : {}), ...style }} className={cn("min-w-0 rounded-[20px] border border-[#e1e5eb]", white ? "bg-white" : "bg-[#fafafa]", pad === undefined && "p-5", className)}>
      {(title || action) && (
        <header className={cn("flex flex-col gap-0.5", children ? "mb-4" : "")}>
          <SectionHeading count={count} right={action}>
            {title}
          </SectionHeading>
          {sub && <p className="m-0 text-[12.5px] leading-[18px] tracking-[-0.2px] text-[#626262]">{sub}</p>}
        </header>
      )}
      {children}
    </section>
  );
}

/** White tile inside a section card: 14px radius. */
export function Tile({ children, className, style, onClick, active, as = "div" }: { children: ReactNode; className?: string; style?: CSSProperties; onClick?: () => void; active?: boolean; as?: "div" | "button" }) {
  const cls = cn(
    "min-w-0 rounded-[14px] border bg-white p-4 text-left",
    active ? "border-2 border-[#0e3228] bg-[#f7fdea]" : "border-[#e1e5eb]",
    (onClick || as === "button") && "w-full cursor-pointer transition-colors hover:border-[#0e3228]/30",
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

/** Label/value pairs as a real description list. */
export function Facts({ facts, columns = 2, className }: { facts: { term: string; detail: ReactNode; mono?: boolean; tone?: "fail" }[]; columns?: 1 | 2 | 3; className?: string }) {
  return (
    <dl className={cn("m-0 grid gap-x-6 gap-y-2.5", columns === 1 && "grid-cols-1", columns === 2 && "grid-cols-1 sm:grid-cols-2", columns === 3 && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3", className)}>
      {facts.map((f) => (
        <div key={f.term} className={cn("flex min-w-0 gap-3", columns === 1 ? "items-baseline justify-between" : "flex-col gap-0.5")}>
          <dt className="shrink-0 text-[12.5px] text-[#626262]">{f.term}</dt>
          <dd className={cn("m-0 min-w-0 text-right text-[13px] font-semibold break-words text-[#0e3228] [overflow-wrap:anywhere]", columns !== 1 && "text-left", f.mono && "font-mono text-[12px] font-normal", f.tone === "fail" && "text-[#c0362c]")}>{f.detail}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Label + value on one white row. */
export function StatRow({ label, value, sub, tone }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: Tone }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-[14px] border border-[#e1e5eb] bg-white px-4 py-3">
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="min-w-0 text-[13.5px] text-[#0e3228]">{label}</span>
        {sub && <span className="text-[12px] text-[#626262]">{sub}</span>}
      </span>
      <span className={cn("tnum shrink-0 text-[13.5px] font-semibold", tone === "fail" || tone === "critical" ? "text-[#c0362c]" : tone === "caution" ? "text-[#8a5a12]" : tone === "pass" ? "text-[#27634d]" : "text-[#0e3228]")}>{value}</span>
    </div>
  );
}

export function Spinner({ size = 16, className }: { size?: number; color?: string; className?: string }) {
  return <Loader2 aria-label="Loading" className={cn("shrink-0 animate-spin text-[#0e3228]", className)} style={{ width: size, height: size }} strokeWidth={1.8} />;
}

/** A centered loading block. */
export function Loading({ label = "Loading", className }: { label?: string; className?: string }) {
  return (
    <div className={cn("flex items-center justify-center gap-2 rounded-[20px] border border-[#e1e5eb] bg-[#fafafa] px-5 py-14 text-[13.5px] text-[#626262]", className)}>
      <Spinner /> {label}
    </div>
  );
}

export function Dot({ tone = "accent", pulse, className }: { tone?: Tone; pulse?: boolean; className?: string }) {
  const c = tone === "neutral" ? "bg-[#9aa3ae]" : tone === "accent" ? "bg-[#6fb801]" : tone === "pass" ? "bg-[#27634d]" : tone === "caution" ? "bg-[#e8a33d]" : "bg-[#c0362c]";
  return <span className={cn("inline-block size-2 shrink-0 rounded-full", c, pulse && "vv-pulse", className)} />;
}

/** Page title block: 26px semibold title, 13.5px muted line, actions on the right. */
export function PageHeader({ title, sub, right, back, icon }: { title: ReactNode; sub?: ReactNode; right?: ReactNode; back?: { href: string; label: string }; icon?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 flex-col">
        {back && (
          <Link href={back.href} className="mb-2 inline-flex w-fit items-center gap-1 text-[12.5px] text-[#3f4a5a] transition-colors hover:text-[#0e3228]">
            <span aria-hidden className="text-[15px] leading-none">‹</span>
            {back.label}
          </Link>
        )}
        <div className="flex items-center gap-3">
          {icon}
          <h1 className="m-0 text-[26px] leading-[37.7px] font-semibold tracking-[-0.66px] text-[#0e3228]">{title}</h1>
        </div>
        {sub && <p className="m-0 mt-1.5 max-w-[740px] text-[13.5px] leading-[19.6px] tracking-[-0.3px] text-[#626262]">{sub}</p>}
      </div>
      {right && <div className="flex shrink-0 flex-wrap items-center gap-2">{right}</div>}
    </header>
  );
}

export function Page({ children }: { children: ReactNode; wide?: boolean }) {
  return <div className="vv-fade flex flex-col gap-5">{children}</div>;
}

const KPI_INK: Record<string, string> = { pass: "text-[#27634d]", caution: "text-[#8a5a12]", fail: "text-[#c0362c]", critical: "text-[#c0362c]" };

/** KPI card: white, 16px radius, 11px label, round glyph, 32px figure, 12px caption. */
export function Kpi({ label, value, tone, sub, icon: I }: { label: string; value: ReactNode; tone?: Tone; sub?: ReactNode; icon?: LucideIcon }) {
  return (
    <section className="relative flex min-w-0 flex-col rounded-[16px] border border-[#e1e5eb] bg-white px-[18px] pt-[21px] pb-4">
      <Eyebrow className="pr-10">{label}</Eyebrow>
      {I && (
        <span className="absolute top-4 right-4 grid size-[30px] place-items-center rounded-full bg-[#eef0f3] text-[#0e3228]">
          <I aria-hidden className="size-4" strokeWidth={1.6} />
        </span>
      )}
      <p className={cn("tnum m-0 mt-3.5 text-[32px] leading-8 font-semibold tracking-[-1px]", (tone && KPI_INK[tone]) || "text-[#0e3228]")}>{value}</p>
      {sub && <span className="mt-2 text-[12px] leading-[17.4px] tracking-[-0.3px] text-[#626262]">{sub}</span>}
    </section>
  );
}

export function Empty({ title, sub, action, icon: I }: { title: string; sub?: string; action?: ReactNode; icon?: LucideIcon }) {
  return (
    <section className="flex flex-col items-center gap-2 rounded-[20px] border border-dashed border-[#d5d9df] bg-[#fafafa] px-5 py-12 text-center">
      {I && (
        <span className="mb-1 grid size-11 place-items-center rounded-full bg-[#eefccd] text-[#0e3228]">
          <I aria-hidden className="size-5" strokeWidth={1.7} />
        </span>
      )}
      <p className="m-0 text-[14px] font-semibold text-[#0e3228]">{title}</p>
      {sub && <p className="m-0 max-w-[52ch] text-[12.5px] text-[#626262]">{sub}</p>}
      {action && <div className="mt-3">{action}</div>}
    </section>
  );
}

/* ---------------------------------------------------------------------------
   Form controls: white, 12px radius, line border, lime focus ring
--------------------------------------------------------------------------- */

const FIELD = "w-full min-w-0 rounded-[12px] border border-[#e1e5eb] bg-white text-[14px] tracking-[-0.2px] text-[#0e3228] outline-none transition-colors placeholder:text-[#757575] focus-visible:border-[#0e3228]/40 focus-visible:ring-2 focus-visible:ring-[#bfeb58]/70 disabled:cursor-not-allowed disabled:bg-[#f3f4f6] disabled:text-[#0e3228]/60";
const FIELD_SIZE = { sm: "h-[34px] px-3 text-[13px]", md: "h-11 px-3" } as const;

type InputProps = Omit<ComponentProps<"input">, "size"> & { icon?: LucideIcon; size?: "sm" | "md" };
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ icon: I, size = "md", className, ...p }, ref) {
  if (!I) return <input ref={ref} {...p} className={cn(FIELD, FIELD_SIZE[size], className)} />;
  return (
    <span className="relative flex w-full min-w-0 items-center">
      <I aria-hidden className="pointer-events-none absolute left-3.5 size-4 text-[#0e3228]" strokeWidth={1.6} />
      <input ref={ref} {...p} className={cn(FIELD, FIELD_SIZE[size], "pl-10", className)} />
    </span>
  );
});

export function TextArea({ className, ...p }: ComponentProps<"textarea">) {
  return <textarea {...p} className={cn(FIELD, "min-h-[84px] resize-y px-3 py-2.5 leading-[20.3px]", className)} />;
}

export function SelectBox({ className, size = "md", children, ...p }: Omit<ComponentProps<"select">, "size"> & { size?: "sm" | "md" }) {
  return (
    <span className={cn("relative inline-flex min-w-0 items-center", className)}>
      <select {...p} className={cn(FIELD, FIELD_SIZE[size], "cursor-pointer appearance-none pr-9")}>
        {children}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute right-3.5 size-4 text-[#0e3228]" strokeWidth={1.8} />
    </span>
  );
}

/** Labelled field: 12.5px semibold label above. */
export function Field({ label, hint, children, className }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <span className="text-[12.5px] leading-[18.1px] font-semibold tracking-[-0.3px] text-[#3f4a5a]">{label}</span>
      {children}
      {hint && <span className="text-[12px] text-[#626262]">{hint}</span>}
    </label>
  );
}

/** Switch: a real checkbox with role="switch"; lime track and pine knob when on. */
export function Switch({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <span className="relative inline-flex shrink-0">
      <input type="checkbox" role="switch" checked={on} aria-label={label} disabled={disabled} onChange={(e) => onChange(e.currentTarget.checked)} className="peer absolute inset-0 z-10 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed" />
      <span aria-hidden className="pointer-events-none flex h-[22px] w-[38px] items-center rounded-full border border-[#e1e5eb] bg-[#eef0f3] p-[2px] transition-colors peer-checked:border-[#a6d43f] peer-checked:bg-[#bfeb58] peer-checked:[&>span]:translate-x-4 peer-checked:[&>span]:bg-[#0e3228] peer-focus-visible:ring-2 peer-focus-visible:ring-[#0e3228] peer-focus-visible:ring-offset-2 peer-disabled:opacity-50">
        <span className="size-4 rounded-full bg-white shadow-sm transition-transform" />
      </span>
    </span>
  );
}

/** Label + switch on one line. */
export function ToggleRow({ label, sub, on, onChange }: { label: ReactNode; sub?: ReactNode; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[13.5px] font-semibold tracking-[-0.3px] text-[#0e3228]">{label}</span>
        {sub && <span className="text-[12px] leading-[17.4px] text-[#626262]">{sub}</span>}
      </span>
      <Switch on={on} onChange={onChange} label={typeof label === "string" ? label : "Toggle"} />
    </div>
  );
}

/** Outlined filter pill (graph flows, document type picks). */
export function FilterChip({ on, onClick, children, color, className }: { on: boolean; onClick: () => void; children: ReactNode; color?: string; className?: string }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={cn("inline-flex h-[34px] cursor-pointer items-center gap-1.5 rounded-[17px] border px-3.5 text-[13px] font-semibold whitespace-nowrap transition-colors", on ? "border-[#0e3228] bg-[#0e3228] text-white" : "border-[#e1e5eb] bg-white text-[#0e3228] hover:bg-[#fafafa]", className)}>
      {color && <span aria-hidden className="size-2 rounded-full" style={{ background: color }} />}
      {children}
    </button>
  );
}

/** Small segmented control (the top bar's Local / AI, the status filters). */
export function Seg<T extends string>({ items, value, onChange, className, label }: { items: { id: T; label: ReactNode }[]; value: T; onChange: (v: T) => void; className?: string; label?: string }) {
  return (
    <div role="group" aria-label={label} className={cn("inline-flex h-[31px] shrink-0 items-center gap-0.5 rounded-[15.7px] border border-[#e1e5eb] bg-white p-[3px]", className)}>
      {items.map((it) => {
        const on = it.id === value;
        return (
          <button key={it.id} type="button" aria-pressed={on} onClick={() => onChange(it.id)} className={cn("h-full cursor-pointer rounded-[11.7px] px-2.5 text-[12px] tracking-[-0.3px] whitespace-nowrap transition-colors", on ? "bg-[#bfeb58] font-semibold text-[#0e3228]" : "text-[#5f6a7b] hover:text-[#0e3228]")}>
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Tabs
--------------------------------------------------------------------------- */

/** Equal-width tab bar (the document detail tabs). */
export function TabStrip<T extends string>({ tabs, current, onChange, className, label = "Views" }: { tabs: { id: T; label: ReactNode; badge?: ReactNode }[]; current: T; onChange: (t: T) => void; className?: string; label?: string }) {
  return (
    <nav aria-label={label} role="tablist" className={cn("flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", className)}>
      {tabs.map((t) => {
        const on = t.id === current;
        return (
          <button key={t.id} type="button" role="tab" aria-selected={on} onClick={() => onChange(t.id)} className={cn("inline-flex h-[38px] min-w-0 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[19px] border px-3.5 text-[13.5px] tracking-[-0.3px] whitespace-nowrap transition-colors", on ? "border-[#bfeb58] bg-[#eefccd] font-semibold text-[#0e3228]" : "border-transparent bg-[#f3f4f1] text-[#3f4a5a] hover:text-[#0e3228]")}>
            {t.label}
            {t.badge}
          </button>
        );
      })}
    </nav>
  );
}

/* ---------------------------------------------------------------------------
   Score dial (Summary banner)
--------------------------------------------------------------------------- */

const R = 64;
const C = 2 * Math.PI * R;

/** 168px ring: white track, coloured sweep (stroke 14), score and level label. */
export function ScoreDial({ value, max = 100, label, tone = "accent", size = 168 }: { value: number; max?: number; label: string; tone?: Tone; icon?: LucideIcon; size?: number }) {
  const swept = C * Math.max(0, Math.min(1, value / max));
  const stroke = tone === "fail" || tone === "critical" ? "#f06a5e" : tone === "caution" ? "#f2c46b" : "#bfeb58";
  const labelInk = tone === "fail" || tone === "critical" ? "#f7a79e" : tone === "caution" ? "#f5d58e" : "#bfeb58";
  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg viewBox="0 0 168 168" className="absolute inset-0 size-full -rotate-90" aria-hidden>
        <circle cx="84" cy="84" r={R} fill="none" stroke="white" strokeWidth="14" />
        <circle cx="84" cy="84" r={R} fill="none" stroke={stroke} strokeWidth="14" strokeLinecap="round" strokeDasharray={`${swept} ${C}`} style={{ transition: "stroke-dasharray .6s cubic-bezier(.2,.7,.3,1)" }} />
        {[0, 90, 180, 270].map((a) => (
          <circle key={a} cx={84 + R * Math.cos((a * Math.PI) / 180)} cy={84 + R * Math.sin((a * Math.PI) / 180)} r="5" fill="#bfeb58" opacity={value === 0 ? 1 : 0} />
        ))}
      </svg>
      <span className="relative flex flex-col items-center">
        <span className="tnum text-[44px] leading-[44px] font-semibold tracking-[-1.9px] text-white">{value}</span>
        <span className="mt-1.5 text-[11px] leading-4 font-bold tracking-[0.67px] uppercase" style={{ color: labelInk }}>
          {label}
        </span>
      </span>
    </div>
  );
}

/** Thin progress bar. */
export function Bar({ value, max = 100, tone = "accent", className }: { value: number; max?: number; tone?: Tone; className?: string }) {
  const c = tone === "fail" || tone === "critical" ? "bg-[#c0362c]" : tone === "caution" ? "bg-[#e8a33d]" : tone === "pass" ? "bg-[#27634d]" : "bg-[#bfeb58]";
  return (
    <span className={cn("block h-1.5 w-full overflow-hidden rounded-full bg-[#eef0f3]", className)}>
      <span className={cn("block h-full rounded-full transition-[width] duration-500", c)} style={{ width: `${Math.max(0, Math.min(100, (value / Math.max(max, 1)) * 100))}%` }} />
    </span>
  );
}

/** Mini stacked bar: verified / broken / missing links. */
export function LinksBar({ verified, broken, missing, width = 120 }: { verified: number; broken: number; missing: number; width?: number }) {
  const t = Math.max(verified + broken + missing, 1);
  return (
    <span className="flex h-2 overflow-hidden rounded-[4px] bg-[#eef0f3]" style={{ width }} aria-hidden>
      <span className="h-full bg-[#27634d]" style={{ width: `${(verified / t) * 100}%` }} />
      <span className="h-full bg-[#c0362c]" style={{ width: `${(broken / t) * 100}%` }} />
      <span className="h-full bg-[#e8a33d]" style={{ width: `${(missing / t) * 100}%` }} />
    </span>
  );
}

