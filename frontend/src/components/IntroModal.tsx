import { useEffect, useState } from "react";

type Props = { open: boolean; onClose: () => void; onGoPremium: () => void; };

export default function IntroModal({ open, onClose, onGoPremium }: Props) {
  if (!open) return null;
  return (
    <div style={{
      position:"fixed", inset:0, background:"rgba(0,0,0,.55)", backdropFilter:"blur(4px)",
      display:"flex", justifyContent:"center", alignItems:"flex-start", paddingTop:24, zIndex:70
    }} onClick={onClose}>
      <div onClick={(e)=>e.stopPropagation()} style={{
        width:"min(980px,96vw)", maxHeight:"88vh", overflow:"auto",
        background:"rgba(17,24,39,.98)", border:"1px solid rgba(255,255,255,.12)",
        borderRadius:16, padding:22, color:"#e5e7eb"
      }}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{fontSize:24,fontWeight:900,display:"flex",gap:8,alignItems:"center"}}>⚡ FootyMines • IA Predictor</div>
          <button onClick={onClose} style={{border:"1px solid rgba(255,255,255,.15)",borderRadius:12,padding:"8px 12px"}}>Cerrar ✕</button>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"1.1fr .9fr",gap:18, marginTop:12}}>
          {/* Lado izq: copy */}
          <div>
            <p style={{opacity:.9}}>
              Predicción clara para usuarios finales: <b>Poisson calibrado + mercado</b>, con
              <b> explicaciones</b>, <b>parley builder</b> y <b>IA Boot</b> para análisis narrativo.
            </p>
            <ul style={{marginTop:10, lineHeight:1.7}}>
              <li>• <b>Selección</b>: 1X2 / Over/Under / BTTS con probabilidades.</li>
              <li>• <b>Parley Builder</b>: combinadas con probabilidad ajustada.</li>
              <li>• <b>IA Boot</b>: picks estructurados y racionales (opcional GPT).</li>
              <li>• <b>Gestión</b>: guardado de tickets e historial.</li>
              <li>• <b>Pagos seguros</b>: Stripe/PayPal, portal de facturación.</li>
            </ul>
            <div style={{marginTop:14, fontSize:13, opacity:.8}}>
              FootyMines no garantiza resultados. Úsalo como apoyo estadístico y gestiona tu banca con responsabilidad.
            </div>
          </div>

          {/* Lado der: planes rápidos */}
          <div style={{display:"grid",gap:12}}>
            {[
              {t:"Semanal",p:"MXN 70.00",d:"Ideal para probar funciones Pro"},
              {t:"Mensual",p:"MXN 130.00",d:"Uso continuo y soporte prioritario"},
              {t:"Anual",p:"MXN 1300.00",d:"Mejor precio / mes"},
            ].map((c)=>(
              <div key={c.t} style={{
                background:"rgba(255,255,255,.05)", border:"1px solid rgba(255,255,255,.12)",
                borderRadius:14, padding:14
              }}>
                <div style={{fontWeight:900}}>{c.t}</div>
                <div style={{fontSize:20,fontWeight:900, marginTop:4}}>{c.p}</div>
                <div style={{opacity:.85, marginTop:4}}>{c.d}</div>
                <button onClick={onGoPremium}
                  style={{marginTop:10, padding:"10px 14px", borderRadius:12,
                  background:"linear-gradient(135deg,#7c3aed,#5b21b6)", color:"#fff", fontWeight:800}}>
                  Empezar prueba
                </button>
              </div>
            ))}
          </div>
        </div>

        <div style={{marginTop:16, display:"flex", gap:10, flexWrap:"wrap", opacity:.9}}>
          <span>🔒 Pagos seguros con Stripe/PayPal</span>
          <span>• 📈 Método: Poisson + calibración</span>
          <span>• 🧠 IA opcional para racionales</span>
        </div>
      </div>
    </div>
  );
}
