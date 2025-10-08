import React, { useEffect, useMemo } from "react";

type Props = {
  open?: boolean;                 // solo usado en modo drawer
  onClose?: () => void;           // idem
  onOpenParlay: () => void;
  onOpenBuilder: () => void;
  onOpenHistory: () => void;
  onOpenIABoot?: () => void;
  onUpgrade?: () => void;         // Gestionar/Hazte PRO
  isPremium?: boolean;
  planLabel?: string | null;      // "Semanal", "Mensual", "Anual", etc.
  variant?: "auto" | "drawer" | "rail"; // por defecto "auto"
};

export default function NavDrawer({
  open = false,
  onClose = () => {},
  onOpenParlay,
  onOpenBuilder,
  onOpenHistory,
  onOpenIABoot,
  onUpgrade,
  isPremium = false,
  planLabel = null,
  variant = "auto",
}: Props) {
  // Detecta desktop para "auto"
  const isDesktop = useMemo(
    () => (typeof window !== "undefined" ? window.matchMedia("(min-width:1025px)").matches : false),
    []
  );
  useEffect(() => {
    if (variant !== "auto") return;
    const mm = window.matchMedia("(min-width:1025px)");
    const onChange = () => {};
    mm.addEventListener?.("change", onChange);
    return () => mm.removeEventListener?.("change", onChange);
  }, [variant]);

  const isRail = variant === "rail" || (variant === "auto" && isDesktop);
  const isDrawer = !isRail; // en auto + móvil será drawer

  const go = (fn: () => void) => {
    fn();
    if (isDrawer) onClose();
  };

  const chipStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,.12)",
    background: "rgba(255,255,255,.06)",
    color: "#d1d5db",
    fontSize: 12,
    whiteSpace: "nowrap",
  };

  // ---- Overlay (solo drawer)
  const overlay =
    isDrawer ? (
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: open ? "rgba(0,0,0,.45)" : "transparent",
          transition: "background .25s ease",
          pointerEvents: open ? "auto" : "none",
          zIndex: 60,
        }}
      />
    ) : null;

  // ---- Contenedor (drawer fijo / rail)
  const baseStyle: React.CSSProperties = isRail
    ? {
        // Rail lateral fijo (en flujo de layout)
        position: "sticky",
        top: 16,
        height: "calc(100dvh - 32px)",
        width: 260,
        background: "linear-gradient(180deg,#0f172a 0%, #0b1020 100%)",
        borderRight: "1px solid rgba(255,255,255,.12)",
        boxShadow: "0 10px 40px rgba(0,0,0,.25)",
        zIndex: 1,
        display: "flex",
        flexDirection: "column",
        borderRadius: 16,
      }
    : {
        // Drawer móvil
        position: "fixed",
        top: 0,
        left: 0,
        height: "100dvh",
        width: 300,
        maxWidth: "85vw",
        background: "linear-gradient(180deg,#0f172a 0%, #0b1020 100%)",
        borderRight: "1px solid rgba(255,255,255,.12)",
        boxShadow: "0 10px 40px rgba(0,0,0,.45)",
        transform: `translateX(${open ? "0" : "-100%"})`,
        transition: "transform .28s ease",
        zIndex: 61,
        display: "flex",
        flexDirection: "column",
      };

  return (
    <>
      {overlay}

      <aside role="navigation" aria-label="Menú principal" style={baseStyle}>
        {/* Header */}
        <div style={{ padding: 16, borderBottom: "1px solid rgba(255,255,255,.12)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 12,
                  display: "grid",
                  placeItems: "center",
                  background: "linear-gradient(135deg,#7c3aed,#5b21b6)",
                  boxShadow: "0 8px 18px rgba(124,58,237,.35)",
                  fontSize: 20,
                  fontWeight: 900,
                }}
              >
                ⚽
              </div>
              <div>
                <div style={{ fontWeight: 900 }}>FootyMines</div>
                <div style={{ opacity: 0.7, fontSize: 12 }}>Menú principal</div>
              </div>
            </div>

            {/* Cerrar (solo drawer) */}
            {isDrawer && (
              <button
                onClick={onClose}
                aria-label="Cerrar menú"
                style={{
                  fontSize: 20,
                  color: "#e5e7eb",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                ×
              </button>
            )}
          </div>

          {/* Chip Premium */}
          <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <div style={chipStyle}>
              {isPremium ? "💎 Premium activo" : "🔒 Modo gratis"}
              {isPremium && planLabel ? <b style={{ marginLeft: 6 }}>· {planLabel}</b> : null}
            </div>
            {onUpgrade && (
              <button
                onClick={onUpgrade}
                style={{
                  ...chipStyle,
                  cursor: "pointer",
                  borderColor: isPremium ? "rgba(34,197,94,.45)" : "rgba(167,139,250,.45)",
                  background: isPremium
                    ? "linear-gradient(135deg,#22c55e33,#16a34a33)"
                    : "linear-gradient(135deg,#a78bfa33,#7c3aed33)",
                  fontWeight: 800,
                }}
              >
                {isPremium ? "Gestionar" : "Hazte PRO"}
              </button>
            )}
          </div>
        </div>

        {/* Items */}
        <nav style={{ padding: 10, display: "grid", gap: 8 }}>
          <NavItem
            icon="🎯"
            label="Generador de selección"
            desc="Ticket sugerido del partido"
            onClick={() => go(onOpenBuilder)}
          />
          <NavItem
            icon="📒"
            label="Historial"
            desc="Registra tus tickets"
            onClick={() => go(onOpenHistory)}
          />
          <NavItem
            icon="🧮"
            label="Generador de Parley"
            desc="Combina hasta 4 partidos"
            onClick={() => go(onOpenParlay)}
          />
          {onOpenIABoot && (
            <NavItem icon="🤖" label="IA Boot" desc="Resumen y picks" onClick={() => go(onOpenIABoot)} />
          )}
        </nav>

        <div style={{ marginTop: "auto", padding: 14, opacity: 0.7, fontSize: 12 }}>
          © {new Date().getFullYear()} FootyMines
        </div>
      </aside>
    </>
  );
}

function NavItem({
  icon,
  label,
  desc,
  onClick,
}: {
  icon: string;
  label: string;
  desc?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        textAlign: "left",
        width: "100%",
        display: "grid",
        gridTemplateColumns: "32px 1fr",
        gap: 10,
        alignItems: "center",
        background: "rgba(255,255,255,.06)",
        border: "1px solid rgba(255,255,255,.12)",
        color: "#e5e7eb",
        borderRadius: 12,
        padding: "10px 12px",
        cursor: "pointer",
      }}
    >
      <div style={{ fontSize: 20 }}>{icon}</div>
      <div>
        <div style={{ fontWeight: 800 }}>{label}</div>
        {desc && <div style={{ opacity: 0.8, fontSize: 12 }}>{desc}</div>}
      </div>
    </button>
  );
}
