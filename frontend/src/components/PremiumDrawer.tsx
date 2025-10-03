import React, { useState } from "react";
import { loadStripe } from '@stripe/stripe-js'; // Necesario para Stripe Checkout

// --- TIPOS Y CONFIGURACIÓN ---

// Planes basados en tu configuración de Stripe (MXN 70, 130, 1300)
// **NOTA IMPORTANTE:** Reemplaza los placeholders 'price_XXXX_ID' con tus IDs reales de Stripe.
const PLANS = [
    { id: 'price_SEMANAL_ID', name: 'SEMANAL', price: 70.00, interval: 'Semanal' },
    { id: 'price_MENSUAL_ID', name: 'MENSUAL', price: 130.00, interval: 'Mensual' },
    { id: 'price_ANUAL_ID', name: 'ANUAL', price: 1300.00, interval: 'Anual' },
];

type Plan = typeof PLANS[0];

// Tu clave pública de Stripe. DEBE CARGARSE DESDE UNA VARIABLE DE ENTORNO EN Vercel/local.
// Por ahora, reemplaza esto con tu clave pública real:
const STRIPE_PUBLISHABLE_KEY = 'pk_test_YOUR_STRIPE_PUBLISHABLE_KEY'; // <-- ¡REEMPLAZAR!
const stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY);

type Props = { 
    open: boolean; 
    onClose: () => void; 
    API_BASE: string; // Para llamar al endpoint de FastAPI
    currentKey: string; 
    onKeySubmit: (key: string) => void; 
};

// --- ESTILOS ---
const overlay: React.CSSProperties = {
    position: "fixed", inset: 0, background: "rgba(0,0,0,.65)",
    display: "grid", placeItems: "center", zIndex: 60,
    backdropFilter: 'blur(5px)'
};
const card: React.CSSProperties = {
    width: "min(900px, 92vw)", 
    background: "rgba(17,24,39,.98)",
    border: "1px solid rgba(255,255,255,.15)", 
    borderRadius: 16, 
    padding: 20,
    color: "#e5e7eb", 
    boxShadow: "0 30px 80px rgba(0,0,0,.45)",
    maxHeight: '90vh',
    overflowY: 'auto'
};
const pill: React.CSSProperties = {
    display:"inline-flex", alignItems:"center", gap:8, padding:"8px 12px",
    borderRadius:999, background:"rgba(255,255,255,.06)",
    border:"1px solid rgba(255,255,255,.12)", color:"#d1d5db", fontSize:12, cursor: 'pointer'
};
const inputStyle: React.CSSProperties = {
    width: "100%",
    background: "#0f172a",
    color: "white",
    border: "1px solid rgba(255,255,255,.18)",
    borderRadius: 8,
    padding: "10px 14px",
    outline: "none",
    fontSize: 14
};
const buttonPrimary: React.CSSProperties = {
    background:"linear-gradient(135deg,#7c3aed,#5b21b6)",
    color:"#fff", border:"none", borderRadius:12, padding:"12px 18px",
    fontWeight:900, cursor:"pointer", transition: 'opacity 0.2s'
};
const planCardStyle: React.CSSProperties = {
    padding: 20,
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,.2)",
    textAlign: 'center',
    background: 'rgba(255,255,255,.05)',
    flex: 1,
    minWidth: '200px'
};
// --- FIN ESTILOS ---


export default function PremiumDrawer({ open, onClose, API_BASE, onKeySubmit, currentKey }: Props) {
    const [inputKey, setInputKey] = useState(currentKey);
    const [loading, setLoading] = useState(false);
    const isPremiumActive = currentKey.trim().length > 5;

    // Maneja el guardado/verificación de la clave ingresada
    const handleKeySubmit = () => {
        onKeySubmit(inputKey.trim());
        if (inputKey.trim() === currentKey.trim()) {
             alert(isPremiumActive ? "Clave verificada. ¡Acceso Premium activo!" : "Clave guardada. Verifica tu acceso en el siguiente pronóstico.");
        }
    };
    
    // Función central para iniciar el proceso de Stripe Checkout
    const handleCheckout = async (plan: Plan) => {
        const userEmail = prompt("Por favor, ingresa tu dirección de email para la suscripción (usado por Stripe):");
        if (!userEmail) return;

        setLoading(true);

        try {
            const r = await fetch(API_BASE + '/create-checkout-session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ price_id: plan.id, user_email: userEmail }),
            });
            
            if (!r.ok) {
                const errorText = await r.text();
                throw new Error('Error al crear la sesión de pago: ' + errorText);
            }

            const { session_id } = await r.json();
            
            // Redirigir a Stripe Checkout
            const stripe = await stripePromise;
            if (stripe) {
                const { error } = await stripe.redirectToCheckout({ sessionId: session_id });
                if (error) {
                    alert(`Error al redirigir: ${error.message}`);
                }
            }
        } catch (e) {
            alert("Fallo el pago: " + (e as Error).message);
        } finally {
            setLoading(false);
        }
    }

    if (!open) return null;

    return (
        <div style={overlay} onClick={onClose}>
            <div style={card} onClick={(e) => e.stopPropagation()}>
                
                {/* ENCABEZADO */}
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center", marginBottom: 15}}>
                    <h2 style={{fontSize:24, fontWeight:900}}>
                        👑 Acceso Premium 
                        {isPremiumActive && <span style={{ marginLeft: 10, color: '#22c55e', fontSize: 16 }}>(ACTIVO)</span>}
                    </h2>
                    <button onClick={onClose} style={{...pill, opacity: 0.8}}>Cerrar ✕</button>
                </div>

                {/* CONTENIDO PRINCIPAL */}
                <div style={{ display: 'flex', gap: 25, flexWrap: 'wrap' }}>
                    
                    {/* COLUMNA 1: BENEFICIOS */}
                    <div style={{ flex: 2, minWidth: '300px' }}>
                        <p style={{opacity:.9, marginTop:8, fontSize: 16, fontWeight: 600}}>
                            Desbloquea el poder del análisis profundo y las herramientas Pro:
                        </p>
                        <ul style={{marginTop:12, lineHeight:2, paddingLeft: 20, listStyleType: 'disc', color: '#d1d5db'}}>
                            <li>• **IA Boot:** Análisis completo con justificación narrativa.</li>
                            <li>• **Parley Builder:** Generador de combinadas con Valor Esperado (EV).</li>
                            <li>• **Selección Combinada:** Picks avanzados (Córners, BTTS, Over/Under).</li>
                            <li>• **Gestión Pro:** Stake recomendado (Kelly) y registro de tickets.</li>
                            <li>• **Experiencia Pura:** Sin anuncios + soporte prioritario.</li>
                        </ul>
                    </div>
                    
                    {/* COLUMNA 2: PLANES Y CLAVE */}
                    <div style={{ flex: 3, minWidth: '350px' }}>

                        {/* SECCIÓN DE PLANES DE PAGO */}
                        <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 15, color: '#a5b4fc' }}>
                            1. Elige tu Plan de Suscripción
                        </h3>
                        
                        <div style={{ display: 'flex', gap: 15, flexWrap: 'wrap', marginBottom: 25 }}>
                            {PLANS.map((plan) => (
                                <div key={plan.id} style={planCardStyle}>
                                    <h4 style={{ color: '#f3f4f6', fontWeight: 800, fontSize: 18 }}>{plan.interval}</h4>
                                    <p style={{ fontSize: 26, fontWeight: 900, margin: '8px 0', color: '#7c3aed' }}>
                                        MXN {plan.price.toFixed(2)}
                                    </p>
                                    <p style={{ fontSize: 12, opacity: 0.8, marginBottom: 10 }}>Precio por {plan.interval.toLowerCase()}</p>
                                    
                                    <button 
                                        onClick={() => handleCheckout(plan)}
                                        disabled={loading}
                                        style={{
                                            ...buttonPrimary, 
                                            padding: '10px 16px', 
                                            fontSize: 14,
                                            opacity: loading ? 0.6 : 1
                                        }}
                                    >
                                        {loading ? "Cargando Pago..." : "Empezar prueba"}
                                    </button>
                                </div>
                            ))}
                        </div>

                        {/* SECCIÓN DE CLAVE DE ACCESO MANUAL */}
                        <div style={{ borderTop: '1px solid rgba(255,255,255,.1)', paddingTop: 15 }}>
                            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 10, color: '#a5b4fc' }}>
                                2. Ingresar Clave de Acceso
                            </h3>

                            <input
                                type="text"
                                placeholder="Pega aquí tu Clave Premium..."
                                value={inputKey}
                                onChange={(e) => setInputKey(e.target.value)}
                                style={inputStyle}
                            />

                            <div style={{display:"flex", gap:10, marginTop:15, flexWrap:"wrap"}}>
                                <button
                                    style={{
                                        ...buttonPrimary, 
                                        opacity: !inputKey ? 0.6 : 1,
                                    }}
                                    onClick={handleKeySubmit}
                                    disabled={!inputKey}
                                >
                                    {isPremiumActive ? 'Guardar y Verificar' : 'Guardar Clave de Acceso'}
                                </button>
                                
                                {isPremiumActive && (
                                    <button
                                        onClick={() => onKeySubmit('')} // Limpia la clave
                                        style={{...pill, background: 'none', borderColor: '#ef4444', color: '#fecaca', fontWeight: 700}}
                                    >
                                        🗑️ Revocar Clave
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* FOOTER DE CONFIANZA */}
                        <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: 'center'}}>
                            <span style={pill}>⚡ 3 días gratis (al pagar)</span>
                            <span style={pill}>🔒 Cancela cuando quieras</span>
                        </div>
                        
                    </div>
                </div>
                
            </div>
        </div>
    );
}