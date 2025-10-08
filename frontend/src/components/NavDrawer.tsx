import React from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  onOpenParlay: () => void;
  onOpenBuilder: () => void;
  onOpenHistory: () => void;
};

export default function NavDrawer({
  open,
  onClose,
  onOpenParlay,
  onOpenBuilder,
  onOpenHistory,
}: Props) {
  // helpers para cerrar y abrir opción
  const go = (fn: () => void) => {
    fn();
    onClose();
  };

  return (
    <>
      {/* Overlay */}
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

      {/* Panel */}
      <aside
        role="dialog"
        aria-modal="true"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          height: "100dvh",
          width: 300,
          maxWidth: "85vw",
          background:
            "linear-gradient(180deg, rgba(15,23,42,1) 0%, rgba(11,16,32,1) 100%)",
          borderRight: "1px solid rgba(255,255,255,.12)",
          boxShadow: "0 10px 40px rgba(0,0,0,.45)",
          transform: `translateX(${open ? "0" : "-100%"})`,
          transition: "transform .28s ease",
          zIndex: 61,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header del drawer */}
        <div style={{ padding: 16, borderBottom: "1px solid rgba(255,255,255,.12)" }}>
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
        </div>

        {/* Items */}
        <nav style={{ padding: 10, display: "grid", gap: 8 }}>
          <NavItem
            icon="🧮"
            label="Generador de Parley"
            desc="Combina hasta 4 partidos"
            onClick={() => go(onOpenParlay)}
          />
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
