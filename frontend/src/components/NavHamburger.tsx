// src/components/NavHamburger.tsx
import { useEffect, useState } from "react";

function useMedia(query: string) {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(query).matches : false
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mm = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    setMatches(mm.matches);
    mm.addEventListener("change", handler);
    return () => mm.removeEventListener("change", handler);
  }, [query]);
  return matches;
}

export default function NavHamburger({
  onOpenParlay,
  onOpenBuilder,
  onOpenHistory,
  onOpenIABoot,
  onUpgrade,
  upgradeLabel = "Hazte PRO",
  manageLabel = "Gestionar",
  isPremium = false,
}: {
  onOpenParlay: () => void;
  onOpenBuilder: () => void;
  onOpenHistory: () => void;
  onOpenIABoot: () => void;
  onUpgrade?: () => void;           // abre Premium / Gestionar
  upgradeLabel?: string;            // texto del botón cuando no es premium
  manageLabel?: string;             // texto si es premium (gestionar)
  isPremium?: boolean;              // estado actual
}) {
  const isDesktop = useMedia("(min-width: 1025px)");

  // En desktop lo dejamos siempre abierto como rail fijo
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setOpen(isDesktop ? true : false);
  }, [isDesktop]);

  const item = (icon: string, label: string, onClick: () => void) => (
    <button
      onClick={() => {
        onClick();
        if (!isDesktop) setOpen(false);
      }}
      style={{
        width: "100%",
        textAlign: "left",
        padding: "12px 14px",
        borderRadius: 12,
        border: "1px solid rgba(255,255,255,.10)",
        background: "rgba(255,255,255,.04)",
        color: "#e5e7eb",
        fontWeight: 700,
        display: "flex",
        gap: 10,
        alignItems: "center",
      }}
    >
      <span style={{ fontSize: 18 }}>{icon}</span> {label}
    </button>
  );

  // estilos del contenedor “drawer/rail”
  const drawerBase: React.CSSProperties = {
    position: isDesktop ? "sticky" as const : "fixed" as const,
    top: isDesktop ? 16 : 0,
    left: 0,
    bottom: isDesktop ? undefined : 0,
    width: isDesktop ? 260 : 310,
    background: "#0b1020",
    borderRight: "1px solid rgba(255,255,255,.12)",
    padding: 14,
    zIndex: 60,
    transform: isDesktop ? "translateX(0)" : `translateX(${open ? 0 : -320}px)`,
    transition: isDesktop ? undefined : "transform .22s ease-out",
  };

  return (
    <>
      {/* Botón flotante (solo móvil/tablet) */}
      {!isDesktop && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Abrir menú"
          style={{
            position: "fixed",
            top: 12,
            left: 12,
            zIndex: 60,
            width: 44,
            height: 44,
            borderRadius: 12,
            background: "rgba(255,255,255,.08)",
            border: "1px solid rgba(255,255,255,.14)",
            color: "#e5e7eb",
            fontSize: 20,
            fontWeight: 900,
          }}
        >
          ☰
        </button>
      )}

      {/* Overlay (solo cuando es drawer móvil) */}
      {!isDesktop && open && (
        <div
          onClick={() => setOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 59 }}
        />
      )}

      {/* Drawer / Rail */}
      <div style={drawerBase}>
        {/* Header del rail */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                display: "grid",
                placeItems: "center",
                background: "linear-gradient(135deg,#7c3aed,#5b21b6)",
                fontWeight: 900,
              }}
            >
              ⚽
            </div>
            <div style={{ fontWeight: 900 }}>FootyMines</div>
          </div>

          {!isDesktop && (
            <button onClick={() => setOpen(false)} style={{ fontSize: 20, color: "#e5e7eb" }}>
              ×
            </button>
          )}
        </div>

        {/* Acciones */}
        <div style={{ display: "grid", gap: 10 }}>
          {item("🎯", "Generador de selección", onOpenBuilder)}
          {item("📒", "Historial", onOpenHistory)}
          {item("🧮", "Generador de Parley", onOpenParlay)}
          {item("🤖", "IA Boot", onOpenIABoot)}

          {/* Premium / Gestionar */}
          {onUpgrade && (
            <button
              onClick={() => {
                onUpgrade();
                if (!isDesktop) setOpen(false);
              }}
              style={{
                textDecoration: "none",
                padding: "12px 14px",
                borderRadius: 12,
                border: isPremium ? "1px solid rgba(34,197,94,.45)" : "1px solid rgba(168,85,247,.45)",
                background: isPremium
                  ? "linear-gradient(135deg,#22c55e33,#16a34a33)"
                  : "linear-gradient(135deg,#a78bfa33,#7c3aed33)",
                color: "#e5e7eb",
                fontWeight: 900,
                display: "block",
                textAlign: "left",
              }}
            >
              💎 {isPremium ? manageLabel : upgradeLabel}
            </button>
          )}

          {/* Compartir */}
          <button
            onClick={() => {
              if (navigator.share) {
                navigator.share({
                  title: "FootyMines",
                  text: "Predicciones de fútbol con IA",
                  url: location.href,
                });
              } else {
                navigator.clipboard.writeText(location.href);
                alert("Enlace copiado");
              }
              if (!isDesktop) setOpen(false);
            }}
            style={{
              width: "100%",
              padding: "12px 14px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,.10)",
              background: "rgba(255,255,255,.04)",
              color: "#e5e7eb",
              fontWeight: 700,
              textAlign: "left",
            }}
          >
            🔗 Compartir app
          </button>
        </div>
      </div>
    </>
  );
}
