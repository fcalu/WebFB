import { useState } from "react";

export default function NavHamburger({
  onOpenParlay,
  onOpenBuilder,
  onOpenHistory,
  onUpgrade
}: {
  onOpenParlay: () => void;
  onOpenBuilder: () => void;
  onOpenHistory: () => void;
  onUpgrade?: () => void;
}) {
  const [open, setOpen] = useState(false);

  const item = (icon: string, label: string, onClick: () => void) => (
    <button
      onClick={() => { onClick(); setOpen(false); }}
      style={{
        width: "100%", textAlign: "left",
        padding: "12px 14px", borderRadius: 12,
        border: "1px solid rgba(255,255,255,.10)",
        background: "rgba(255,255,255,.04)",
        color: "#e5e7eb", fontWeight: 700, display: "flex", gap: 10, alignItems: "center"
      }}
    >
      <span style={{fontSize:18}}>{icon}</span> {label}
    </button>
  );

  return (
    <>
      {/* Botón flotante */}
      <button
        onClick={() => setOpen(true)}
        aria-label="Abrir menú"
        style={{
          position: "fixed", top: 12, left: 12, zIndex: 60,
          width: 44, height: 44, borderRadius: 12,
          background: "rgba(255,255,255,.08)",
          border: "1px solid rgba(255,255,255,.14)",
          color: "#e5e7eb", fontSize: 20, fontWeight: 900
        }}
      >
        ☰
      </button>

      {/* Overlay */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,.45)",
            zIndex: 59
          }}
        />
      )}

      {/* Drawer izquierdo */}
      <div
        style={{
          position: "fixed", top: 0, left: 0, bottom: 0, width: 310,
          background: "#0b1020", borderRight: "1px solid rgba(255,255,255,.12)",
          padding: 14, zIndex: 60,
          transform: `translateX(${open ? 0 : -320}px)`,
          transition: "transform .22s ease-out"
        }}
      >
        <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10}}>
          <div style={{display:"flex", alignItems:"center", gap:10}}>
            <div style={{width:36,height:36,borderRadius:10,display:"grid",placeItems:"center",
              background:"linear-gradient(135deg,#7c3aed,#5b21b6)", fontWeight:900}}>⚽</div>
            <div style={{fontWeight:900}}>FootyMines</div>
          </div>
          <button onClick={() => setOpen(false)} style={{fontSize:20,color:"#e5e7eb"}}>×</button>
        </div>

        <div style={{display:"grid", gap:10}}>
          {item("🧮", "Generador de Parley", onOpenParlay)}
          {item("🎯", "Generador de selección", onOpenBuilder)}
          {item("📒", "Historial", onOpenHistory)}
          <a
            href="https://tu-dominio.com/#pro"
            target="_blank" rel="noreferrer"
            style={{
              textDecoration:"none",
              padding:"12px 14px",
              borderRadius:12,
              border:"1px solid rgba(34,197,94,.45)",
              background:"linear-gradient(135deg,#22c55e33,#16a34a33)",
              color:"#e5e7eb", fontWeight:900, display:"block"
            }}
            onClick={() => setOpen(false)}
          >💎 Hazte PRO</a>

          <button
            onClick={() => {
              if (navigator.share) {
                navigator.share({ title: "FootyMines", text: "Predicciones de fútbol con IA", url: location.href });
              } else {
                navigator.clipboard.writeText(location.href);
                alert("Enlace copiado");
              }
              setOpen(false);
            }}
            style={{
              width:"100%", padding:"12px 14px", borderRadius:12,
              border:"1px solid rgba(255,255,255,.10)",
              background:"rgba(255,255,255,.04)", color:"#e5e7eb", fontWeight:700, textAlign:"left"
            }}
          >🔗 Compartir app</button>
        </div>
      </div>
    </>
  );
}
