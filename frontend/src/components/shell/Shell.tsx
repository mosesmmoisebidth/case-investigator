"use client";

/**
 * App shell: the VeriSec console's sidebar + topbar, rebuilt for the Case
 * Investigator. Same 240px sunken rail, logo mark, mono section labels, nav
 * tags, accent "primary rail" button, grain overlay and light/dark tokens.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { CSSProperties, ReactNode } from "react";
import { DISPLAY, MONO, Tag, Dot } from "@/components/ui/kit";

type NavItem = { href: string; tag: string; label: string; match?: (p: string) => boolean };

const NAV_MAIN: NavItem[] = [
  { href: "/cases", tag: "CQ", label: "Case queue", match: (p) => p === "/cases" || (p.startsWith("/cases/") && p !== "/cases/new") },
  { href: "/workflows", tag: "WF", label: "Workflows", match: (p) => p.startsWith("/workflows") },
  { href: "/engines", tag: "EN", label: "Engines", match: (p) => p.startsWith("/engines") },
];
const NAV_SYSTEM: NavItem[] = [
  { href: "/audit", tag: "AU", label: "Audit log" },
  { href: "/settings", tag: "ST", label: "Settings" },
];

const TITLES: Array<[RegExp, string]> = [
  [/^\/cases\/new/, "New case"],
  [/^\/cases\/[^/]+/, "Case"],
  [/^\/cases/, "Case queue"],
  [/^\/workflows\/[^/]+/, "Workflow editor"],
  [/^\/workflows/, "Workflows"],
  [/^\/engines/, "Engines"],
  [/^\/audit/, "Audit log"],
  [/^\/settings/, "Settings"],
];

function Logo() {
  return (
    <div style={{ padding: "16px 16px 13px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", gap: 10 }}>
      <div
        style={{
          width: 30,
          height: 30,
          flex: "none",
          border: "1.5px solid var(--ink)",
          borderRadius: 6,
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ position: "absolute", width: 7, height: 7, borderLeft: "1.5px solid var(--accent)", borderTop: "1.5px solid var(--accent)", top: 5, left: 5 }} />
        <div style={{ position: "absolute", width: 7, height: 7, borderRight: "1.5px solid var(--accent)", borderBottom: "1.5px solid var(--accent)", bottom: 5, right: 5 }} />
        <div style={{ width: 9, height: 9, borderRadius: "50%", border: "1.5px solid var(--ink)" }} />
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 14.5, letterSpacing: ".05em", lineHeight: 1 }}>VERISEC</div>
        <div style={{ font: `500 9px/1.4 ${MONO}`, letterSpacing: ".13em", color: "var(--ink-3)", marginTop: 3 }}>CASE INVESTIGATOR · FIN</div>
      </div>
    </div>
  );
}

function navStyle(active: boolean): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "100%",
    padding: "8px 9px",
    borderRadius: 8,
    border: "1px solid " + (active ? "var(--line-2)" : "transparent"),
    background: active ? "var(--panel)" : "transparent",
    color: active ? "var(--ink)" : "var(--ink-2)",
    fontWeight: active ? 600 : 500,
    fontSize: 13,
    textDecoration: "none",
  };
}

const sectionLabel: CSSProperties = {
  font: `600 9.5px/1 ${MONO}`,
  letterSpacing: ".16em",
  color: "var(--ink-4)",
  padding: "6px 8px 8px",
};

/* Theme lives in localStorage; read it through an external-store subscription
   so the server render (light) and the client agree, then the client switches. */
const themeListeners = new Set<() => void>();
function readTheme(): "light" | "dark" {
  try {
    return localStorage.getItem("ci-theme") === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}
function writeTheme(t: "light" | "dark") {
  try {
    localStorage.setItem("ci-theme", t);
  } catch {}
  themeListeners.forEach((l) => l());
}
function subscribeTheme(l: () => void) {
  themeListeners.add(l);
  return () => themeListeners.delete(l);
}

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname() || "/";
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => "light" as const);
  const [health, setHealth] = useState<{ ok: boolean; model?: string } | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/health")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => alive && setHealth({ ok: true, model: j.model }))
      .catch(() => alive && setHealth({ ok: false }));
    return () => {
      alive = false;
    };
  }, []);

  const flipTheme = () => writeTheme(theme === "light" ? "dark" : "light");

  const title = TITLES.find(([re]) => re.test(path))?.[1] ?? "Case queue";
  const isActive = (n: NavItem) => (n.match ? n.match(path) : path.startsWith(n.href));
  const newActive = path === "/cases/new";

  return (
    <div
      data-theme={theme}
      style={{ height: "100vh", overflow: "hidden", width: "100%", background: "var(--bg)", color: "var(--ink)", position: "relative", fontSize: 14, lineHeight: 1.5 }}
    >
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          zIndex: 80,
          opacity: 0.028,
          mixBlendMode: "multiply",
          backgroundImage:
            "url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22140%22 height=%22140%22%3E%3Cfilter id=%22n%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.85%22 numOctaves=%222%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23n)%22/%3E%3C/svg%3E')",
          backgroundSize: "140px",
        }}
      />
      <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
        <aside
          style={{
            width: 240,
            flex: "none",
            background: "var(--bg-sunken)",
            borderRight: "1px solid var(--line)",
            display: "flex",
            flexDirection: "column",
            height: "100vh",
            zIndex: 5,
          }}
        >
          <Logo />
          <nav style={{ flex: 1, overflowY: "auto", padding: "13px 11px", display: "flex", flexDirection: "column", gap: 3 }}>
            <div style={sectionLabel}>INVESTIGATIONS</div>
            <Link
              href="/cases/new"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                width: "100%",
                padding: "9px 11px",
                borderRadius: 9,
                border: "1px solid var(--accent)",
                background: newActive ? "var(--accent)" : "var(--accent-tint)",
                color: newActive ? "var(--accent-ink)" : "var(--accent)",
                fontWeight: 700,
                fontSize: 13,
                marginBottom: 2,
                textDecoration: "none",
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" style={{ flex: "none" }}>
                <path d="M12 5v14M5 12h14" />
              </svg>
              <span style={{ flex: 1 }}>New case</span>
            </Link>
            {NAV_MAIN.map((n) => {
              const a = isActive(n);
              return (
                <Link key={n.href} href={n.href} style={navStyle(a)}>
                  <Tag active={a}>{n.tag}</Tag>
                  <span style={{ flex: 1 }}>{n.label}</span>
                </Link>
              );
            })}
            <div style={{ ...sectionLabel, padding: "16px 8px 8px" }}>SYSTEM</div>
            {NAV_SYSTEM.map((n) => {
              const a = isActive(n);
              return (
                <Link key={n.href} href={n.href} style={navStyle(a)}>
                  <Tag active={a}>{n.tag}</Tag>
                  <span style={{ flex: 1 }}>{n.label}</span>
                </Link>
              );
            })}
          </nav>
          <div style={{ padding: 11, borderTop: "1px solid var(--line)" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "9px 11px",
                borderRadius: 10,
                border: "1px solid var(--line-2)",
                background: "var(--panel)",
              }}
            >
              <Dot tone={health == null ? "neutral" : health.ok ? "pass" : "fail"} pulse={health == null} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600 }}>
                  {health == null ? "Connecting" : health.ok ? "Engines online" : "Backend offline"}
                </div>
                <div style={{ font: `500 10px/1.3 ${MONO}`, color: "var(--ink-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {health?.ok ? health.model || "local" : "127.0.0.1:8100"}
                </div>
              </div>
            </div>
          </div>
        </aside>

        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", height: "100vh" }}>
          <header
            style={{
              height: 58,
              flex: "none",
              display: "flex",
              alignItems: "center",
              gap: 14,
              padding: "0 22px",
              borderBottom: "1px solid var(--line)",
              background: "var(--bg)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
              <span style={{ font: `600 10px/1 ${MONO}`, letterSpacing: ".12em", color: "var(--ink-4)" }}>CASES</span>
              <span style={{ color: "var(--ink-4)" }}>/</span>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{title}</span>
            </div>
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                height: 32,
                padding: "0 12px",
                borderRadius: 20,
                fontWeight: 600,
                fontSize: 12,
                border: "1px solid var(--accent-line)",
                background: "var(--accent-tint)",
                color: "var(--accent)",
              }}
              title="Documents are processed on this machine"
            >
              <Dot tone="accent" />
              Runs locally
            </span>
            <button
              onClick={flipTheme}
              title="Switch theme"
              style={{
                width: 34,
                height: 34,
                borderRadius: 9,
                border: "1px solid var(--line-2)",
                background: "var(--panel)",
                color: "var(--ink-2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                {theme === "light" ? (
                  <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
                ) : (
                  <>
                    <circle cx="12" cy="12" r="4" />
                    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
                  </>
                )}
              </svg>
            </button>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: "var(--accent-tint)",
                border: "1px solid var(--accent-line)",
                color: "var(--accent)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                font: `600 11px/1 ${MONO}`,
              }}
            >
              IN
            </div>
          </header>
          <main style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>{children}</main>
        </div>
      </div>
    </div>
  );
}
