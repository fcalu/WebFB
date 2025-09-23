import React from "react";
import { X } from "lucide-react";
import ResultCard from "./ResultCard";
import { motion, AnimatePresence } from "framer-motion";
type Item = { id:string; league:string; home:string; away:string; payload:any; date:string; };
export default function HistoryDrawer({ open, onClose, items }:{ open:boolean; onClose:()=>void; items:Item[]; }){
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/40" onClick={onClose} />
          <motion.aside initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "tween", duration: 0.25 }} className="absolute top-0 right-0 h-full w-full md:w-[600px] bg-bg border-l border-line shadow-soft">
            <div className="p-4 flex items-center justify-between border-b border-line">
              <h3 className="font-bold">Historial</h3>
              <button onClick={onClose} className="rounded-xl border border-line px-3 py-1 text-dim hover:text-text"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-4 space-y-6 overflow-y-auto h-[calc(100%-56px)]">
              {items.length === 0 && <div className="text-dim text-sm">Aún no hay predicciones guardadas.</div>}
              {items.map((it) => (
                <div key={it.id} className="space-y-2">
                  <div className="text-sm text-dim">{new Date(it.date).toLocaleString()} · {it.league}</div>
                  <ResultCard home={it.home} away={it.away} probs={it.payload.probs} averages={it.payload.averages} topScores={it.payload.poisson?.top_scorelines || []} />
                </div>
              ))}
            </div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
