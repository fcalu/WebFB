// src/components/InstallBanner.tsx
import React, { useEffect, useState } from "react";

const wrap: React.CSSProperties = {
  position: "fixed",
  left: 12,
  right: 12,
  bottom: 70, // por encima de tu fixedbar
  zIndex: 45,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  background: "linear-gradient(135deg, rgba(124,58,237,.18), rgba(99,102,241,.18))",
  border: "1px solid rgba(99,102,241,.35)",
  boxShadow: "0 16px 32px rgba(0,0,0,.35)",
  borderRadius: 14,
  padding: "10px 12px",
  color: "#e5e7eb",
};

const pillBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 12px",
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,.12)",
  background: "rgba(255,255,255,.06)",
  color: "#e5e7eb",
  cursor: "pointer",
  fontWeight: 800,
};

function isiOS() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}
function inStandalone() {
  // iOS
  // @ts-ignore
  if (typeof window !== "undefined" && window.navigator?.standalone) return true;
  // PWA display-mode
  return window.matchMedia?.("(display-mode: standalone)").matches ?? false;
}

export default function InstallBanner() {
  const [deferred, setDeferred] = useState<any>(null);
  const [show, setShow] = useState(false);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    // no mostrar si el user ya instaló o ya lo cerró
    const dismissed = localStorage.getItem("fm_install_dismissed") === "1";
    if (dismissed || inStandalone()) return;

    // Android/Chrome
    const onBIP = (e: any) => {
      e.preventDefault();
      setDeferred(e);
      setShow(true);
    };
    window.addEventListener("beforeinstallprompt", onBIP);

    // iOS fallback (no dispara beforeinstallprompt)
    if (isiOS() && !inStandalone()) {
      setIosHint(true);
      setShow(true);
    }

    const onInstalled = () => {
      setShow(false);
      setDeferred(null);
      localStorage.setItem("fm_install_dismissed", "1");
    };
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBIP);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!show) return null;

  return (
    <div style={wrap}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            display: "grid",
            placeItems: "center",
            background: "linear-gradient(135deg,#7c3aed,#5b21b6)",
            boxShadow: "0 10px 22px rgba(124,58,237,.35)",
            fontSize: 18,
            fontWeight: 900,
          }}
        >
          ⚽
        </div>
        <div style={{ lineHeight: 1.2 }}>
          <div style={{ fontWeight: 900 }}>Instala FootyMines</div>
          <div style={{ fontSize: 12, opacity: 0.85 }}>
            Acceso rápido y uso sin navegador.
            {iosHint && " En iPhone: Compartir → Añadir a pantalla de inicio."}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        {!iosHint && (
          <button
            style={{ ...pillBtn, borderColor: "#22c55e", background: "linear-gradient(135deg,#22c55e55,#16a34a55)" }}
            onClick={async () => {
              if (!deferred) return;
              deferred.prompt();
              const choice = await deferred.userChoice;
              if (choice?.outcome === "accepted") {
                localStorage.setItem("fm_install_dismissed", "1");
                setShow(false);
              }
              setDeferred(null);
            }}
          >
            ⬇️ Instalar
          </button>
        )}
        <button
          style={pillBtn}
          onClick={() => {
            localStorage.setItem("fm_install_dismissed", "1");
            setShow(false);
          }}
        >
          ✖ Cerrar
        </button>
      </div>
    </div>
  );
}
