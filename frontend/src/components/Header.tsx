import React from "react";
import { Zap, History, TrendingUp, Shield } from "lucide-react";
import { motion } from "framer-motion";
import ThemeToggle from "./ThemeToggle";

export default function Header({ onOpenHistory }: { onOpenHistory: () => void }) {
  return (
    <header className="relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-accent/10 to-transparent blur-3xl" />
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="relative max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-primary/90 grid place-items-center shadow-soft">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight">FootyMines · IA Predictor</h1>
              <p className="text-dim text-sm">Predicciones confiables para el usuario final</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onOpenHistory}
              className="rounded-2xl border border-line/70 px-3 py-2 text-sm text-dim hover:text-text hover:border-line transition flex items-center gap-2"
              title="Historial de predicciones"
            >
              <History className="w-4 h-4" />
              Historial
            </button>
            <ThemeToggle />
            <a href="#" onClick={(e) => e.preventDefault()} className="rounded-2xl px-4 py-2 bg-primary hover:opacity-90 transition font-semibold shadow-soft flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Explorar
            </a>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3 text-dim text-sm">
          <span className="inline-flex items-center gap-1"><Shield className="w-4 h-4" /> Poisson</span>
          <span className="inline-flex items-center gap-1"><Shield className="w-4 h-4" /> BTTS</span>
          <span className="inline-flex items-center gap-1"><Shield className="w-4 h-4" /> MLP Corners</span>
        </div>
      </motion.div>
    </header>
  );
}
