import { useEffect, useState } from "react";

declare global {
  interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  }
}

export default function InstallPWAButton(
  { style }: { style?: React.CSSProperties }
) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    setStandalone(
      (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
      (navigator as any).standalone === true
    );
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (standalone) return null;

  const isiOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

  async function install() {
    if (!deferred) {
      if (isiOS) alert("En iPhone: Compartir → 'Añadir a pantalla de inicio'.");
      return;
    }
    deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
  }

  // Solo muestra si hay prompt o si es iOS (con la guía)
  if (!deferred && !isiOS) return null;

  return (
    <button onClick={install} style={style} title="Instalar app">
      📲 Instalar
    </button>
  );
}
