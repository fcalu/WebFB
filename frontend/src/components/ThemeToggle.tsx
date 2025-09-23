import React, { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";
export default function ThemeToggle(){
  const [theme, setTheme] = useState<string>(()=>localStorage.getItem("fm_theme")||"dark");
  useEffect(()=>{ const root=document.documentElement; if(theme==="light") root.classList.add("theme-light"); else root.classList.remove("theme-light"); localStorage.setItem("fm_theme", theme); },[theme]);
  const isLight = theme==="light";
  return (
    <button onClick={()=>setTheme(isLight?"dark":"light")} className="rounded-2xl border border-line/70 px-3 py-2 text-sm text-dim hover:text-text hover:border-line transition flex items-center gap-2" title={isLight?"Cambiar a oscuro":"Cambiar a claro"} aria-label="Cambiar tema">
      {isLight ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}{isLight?"Oscuro":"Claro"}
    </button>
  );
}
