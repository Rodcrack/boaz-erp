import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";

const SUPABASE_URL  = "https://jeftkwjdqzkpswvaqspi.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImplZnRrd2pkcXprcHN3dmFxc3BpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4MzI0OTEsImV4cCI6MjEwMDQwODQ5MX0.Ta8Ei_wCm8ZEzD3IM-S60R0rJvI_d5BTvix_Z3W4EmY";
const sb = createClient(SUPABASE_URL, SUPABASE_ANON);

// ── PALETA BOAZ ──────────────────────────────────────────────
const B = {
  navy:     "#0D1E3D",   // azul marino profundo
  navyMd:   "#152848",   // marino medio (sidebar)
  navyLt:   "#1E3A5F",   // marino claro (hover)
  navyBdr:  "#1E3560",   // bordes marino
  gold:     "#E8780A",   // ámbar dorado Boaz
  goldDk:   "#C4660A",   // ámbar oscuro
  goldLt:   "#FFB347",   // ámbar claro
  white:    "#FFFFFF",
  bg:       "#F0F4F8",   // fondo gris azulado claro
  surface:  "#FFFFFF",
  border:   "#D1DCE8",
  textPri:  "#0D1E3D",
  textSec:  "#4A6080",
  textMut:  "#8FA3BA",
  green:    "#10B981",
  red:      "#EF4444",
  orange:   "#F97316",
  blue:     "#3B82F6",
};

// ── UTILIDADES ────────────────────────────────────────────────
const fmt = {
  fecha: (d) => {
    if (!d) return "—";
    // Si es una fecha "sola" (YYYY-MM-DD, sin hora), forzamos que se interprete
    // en hora local en vez de UTC — si no, JS la corre un día hacia atrás en
    // zonas horarias negativas como Perú (UTC-5).
    const str = typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d+"T00:00:00" : d;
    return new Date(str).toLocaleDateString("es-PE");
  },
  hora:  (d) => d ? new Date(d).toLocaleTimeString("es-PE", {hour:"2-digit",minute:"2-digit"}) : "—",
  fechaHora: (d) => d ? new Date(d).toLocaleString("es-PE",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}) : "—",
  sol:   (n) => n != null ? `S/ ${parseFloat(n).toFixed(2)}` : "—",
};

const ICONOS_HIST = {
  llamada:"📞", whatsapp:"💬", estado:"🔄",
  foto_entrega:"📸", foto_no_entrega:"📸",
};

const BADGE_SERVICIO = {
  same_day: { bg:"#F5F3FF", color:"#7C3AED", label:"Same Day" },
  next_day: { bg:"#EFF6FF", color:"#0369A1", label:"Next Day" },
  especial: { bg:"#FEF3E2", color:"#B45309", label:"Especial" },
};

// Agrupa las fotos de un mismo evento (mismo timestamp) para mostrarlas juntas.
function agruparHistorial(historial) {
  const grupos = [];
  for (const h of historial) {
    if ((h.tipo||"").startsWith("foto_")) {
      const ultimo = grupos[grupos.length-1];
      if (ultimo && ultimo.esFotoGrupo && ultimo.timestamp === h.timestamp) {
        ultimo.urls.push(h.url);
      } else {
        grupos.push({ esFotoGrupo:true, tipo:h.tipo, timestamp:h.timestamp, urls:[h.url] });
      }
    } else {
      grupos.push(h);
    }
  }
  return grupos;
}

const ESTADOS_PEDIDO = {
  sin_asignar: { bg:"#EFF6FF", color:"#1D4ED8", label:"Sin asignar" },
  asignado:    { bg:"#FFF7ED", color:"#C2410C", label:"Asignado" },
  en_ruta:     { bg:"#FFFBEB", color:"#B45309", label:"En ruta" },
  entregado:   { bg:"#ECFDF5", color:"#065F46", label:"Entregado" },
  no_entregado:{ bg:"#FEF2F2", color:"#991B1B", label:"No entregado" },
};

const TIPOS_SERVICIO_PEDIDO = {
  same_day: { label:"Same Day", bg:"#F5F3FF", color:"#7C3AED" },
  next_day: { label:"Next Day", bg:"#EFF6FF", color:"#0369A1" },
  especial: { label:"Especial", bg:"#FFF7ED", color:"#B45309" },
};

const TARIFAS_SAMEDAY = {
  urbano:      { XS:10, S:13, M:16 },
  semi_urbano: { XS:12, S:15, M:18 },
  periferico:  { XS:15, S:18, M:22 },
};
// tarifaPersonalizada (opcional): { tarifa_xs, tarifa_s, tarifa_m, extra_kg } negociado con un cliente.
// Si se pasa, se usa en vez del tarifario genérico por ámbito.
const getTarifaSameDay = (ambito, kg, tarifaPersonalizada) => {
  const t = tarifaPersonalizada
    ? { XS:tarifaPersonalizada.tarifa_xs, S:tarifaPersonalizada.tarifa_s, M:tarifaPersonalizada.tarifa_m }
    : (TARIFAS_SAMEDAY[ambito] || TARIFAS_SAMEDAY.urbano);
  const extraKg = tarifaPersonalizada?.extra_kg ?? 1;
  const peso = kg || 0;
  if (peso <= 1) return t.XS;
  if (peso <= 3) return t.S;
  if (peso <= 7) return t.M;
  return t.M + Math.ceil(peso - 7) * extraKg; // cargo por cada kg por encima de 7kg
};
// Busca la tarifa personalizada del cliente para ese ámbito. Prioriza una
// tarifa específica para el tipo de servicio (Same Day / Next Day); si no
// existe, usa la que aplica "a ambos" (tipo_servicio en null).
const obtenerTarifaEmpresa = (empresaId, ambito, tipoServicio, tarifariosCliente) => {
  if (!empresaId) return null;
  const especifica = tarifariosCliente.find(t=>
    t.empresa_id===empresaId && t.ambito===ambito && t.activo && t.tipo_servicio===tipoServicio);
  if (especifica) return especifica;
  return tarifariosCliente.find(t=>
    t.empresa_id===empresaId && t.ambito===ambito && t.activo && !t.tipo_servicio) || null;
};

// Igual que obtenerTarifaEmpresa, pero sobre el tarifario estándar (sin cliente).
const obtenerTarifaEstandar = (ambito, tipoServicio, tarifarioEstandar) => {
  const especifica = tarifarioEstandar.find(t=>
    t.ambito===ambito && t.activo && t.tipo_servicio===tipoServicio);
  if (especifica) return especifica;
  return tarifarioEstandar.find(t=>t.ambito===ambito && t.activo && !t.tipo_servicio) || null;
};

// ── GEOCODIFICACIÓN GRATUITA (OpenStreetMap / Nominatim) ───────
// Convierte una dirección en texto a coordenadas lat/lng. Gratis, sin API key.
// Límite de uso: máx. 1 solicitud por segundo (por eso las cargas masivas
// esperan un poco entre cada dirección).
async function geocodificarDireccion(direccion, distrito) {
  try {
    const query = encodeURIComponent(`${direccion}, ${distrito||""}, Lima, Perú`);
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=pe&q=${query}`);
    const data = await res.json();
    if (data && data[0]) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }
  } catch (e) { /* si falla, el pedido se crea igual, sin coordenadas */ }
  return null;
}
const esperar = (ms) => new Promise(r => setTimeout(r, ms));

const ROLES_ACCESO = {
  admin: ["dashboard","pedidos","repartidores","clientes","unidades","catalogo","liquidaciones","liquidacion-transporte","liquidacion-clientes","facturacion","planilla","reportes","configuracion"],
  operaciones: ["dashboard","pedidos","repartidores","clientes","unidades","catalogo"],
  finanzas: ["dashboard","clientes","catalogo","liquidaciones","liquidacion-transporte","liquidacion-clientes","facturacion","planilla","reportes"],
};
const Chip = ({ estado, size="sm" }) => {
  const s = ESTADOS_PEDIDO[estado] || { bg:"#F3F4F6", color:"#374151", label: estado };
  return (
    <span style={{ background: s.bg, color: s.color, padding: size==="sm" ? "3px 10px" : "5px 14px",
      borderRadius: 20, fontSize: size==="sm" ? 11 : 12, fontWeight: 700, whiteSpace:"nowrap",
      border: `1px solid ${s.color}22` }}>
      {s.label}
    </span>
  );
};

// ── TOAST ─────────────────────────────────────────────────────
function Toast({ msg, tipo, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3500); return () => clearTimeout(t); }, [onClose]);
  return (
    <div style={{ position:"fixed", bottom:24, right:24, zIndex:9999,
      background: tipo==="error" ? B.red : tipo==="warn" ? B.orange : B.green,
      color:"#fff", padding:"14px 22px", borderRadius:12, fontWeight:600,
      fontSize:13, boxShadow:"0 8px 32px #0003", display:"flex", alignItems:"center", gap:10 }}>
      <span>{tipo==="error"?"❌":tipo==="warn"?"⚠️":"✅"}</span> {msg}
    </div>
  );
}

// ── MODAL CONFIRM ─────────────────────────────────────────────
function Confirm({ msg, onOk, onCancel }) {
  return (
    <div style={{ position:"fixed", inset:0, background:"#0008", zIndex:2000,
      display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ background:B.white, borderRadius:16, padding:28, width:380,
        boxShadow:"0 20px 60px #0003" }}>
        <div style={{ fontSize:15, fontWeight:700, color:B.textPri, marginBottom:8 }}>¿Confirmar acción?</div>
        <div style={{ fontSize:13, color:B.textSec, marginBottom:24 }}>{msg}</div>
        <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
          <button onClick={onCancel} style={{ background:B.bg, border:`1px solid ${B.border}`,
            color:B.textSec, padding:"8px 18px", borderRadius:8, cursor:"pointer", fontSize:13 }}>Cancelar</button>
          <button onClick={onOk} style={{ background:B.red, border:"none",
            color:"#fff", padding:"8px 18px", borderRadius:8, cursor:"pointer", fontSize:13, fontWeight:700 }}>Confirmar</button>
        </div>
      </div>
    </div>
  );
}

// ── CAMPO INPUT ───────────────────────────────────────────────
const inp = { background:B.bg, border:`1px solid ${B.border}`, color:B.textPri,
  borderRadius:8, padding:"9px 12px", fontSize:13, width:"100%", outline:"none" };
const lbl = { fontSize:11, color:B.textSec, fontWeight:700,
  textTransform:"uppercase", letterSpacing:"0.7px", marginBottom:4, display:"block" };
const BtnPri = ({ children, onClick, disabled, style={} }) => (
  <button onClick={onClick} disabled={disabled}
    style={{ background:`linear-gradient(135deg,${B.gold},${B.goldDk})`,
      border:"none", color:B.navy, padding:"9px 20px", borderRadius:8,
      cursor: disabled?"not-allowed":"pointer", fontSize:13, fontWeight:800,
      opacity: disabled?0.6:1, letterSpacing:"0.3px", ...style }}>
    {children}
  </button>
);
const BtnSec = ({ children, onClick, style={} }) => (
  <button onClick={onClick}
    style={{ background:"transparent", border:`1px solid ${B.border}`,
      color:B.textSec, padding:"8px 18px", borderRadius:8,
      cursor:"pointer", fontSize:13, ...style }}>
    {children}
  </button>
);

// ══════════════════════════════════════════════════════════════
// MÓDULO 1: DASHBOARD
// ══════════════════════════════════════════════════════════════
function generarInsights(pedidos, hoyP, ayerP, entregados, efectividad, ingresoHoy, ingresoAyer, sinAsignar, repartidores) {
  const frases = [];

  // Comparación de volumen vs ayer
  if (ayerP.length > 0) {
    const delta = Math.round(((hoyP.length - ayerP.length) / ayerP.length) * 100);
    if (Math.abs(delta) >= 5) {
      frases.push(delta > 0
        ? `📈 Hoy llevas ${delta}% más pedidos que ayer a esta hora (${hoyP.length} vs ${ayerP.length}).`
        : `📉 Hoy llevas ${Math.abs(delta)}% menos pedidos que ayer a esta hora (${hoyP.length} vs ${ayerP.length}).`);
    }
  } else if (hoyP.length > 0) {
    frases.push(`📦 Ya registraste ${hoyP.length} pedido${hoyP.length===1?"":"s"} hoy.`);
  }

  // Efectividad
  if (pedidos.length >= 10) {
    if (efectividad >= 90) frases.push(`✅ Tu efectividad general está en ${efectividad}% — excelente nivel.`);
    else if (efectividad < 70) frases.push(`⚠️ Tu efectividad general bajó a ${efectividad}% — vale la pena revisar los pedidos no entregados.`);
  }

  // Ingresos vs ayer
  if (ingresoAyer > 0 && ingresoHoy > 0) {
    const deltaIngreso = Math.round(((ingresoHoy - ingresoAyer) / ingresoAyer) * 100);
    if (Math.abs(deltaIngreso) >= 10) {
      frases.push(deltaIngreso > 0
        ? `💰 Los ingresos de hoy van ${deltaIngreso}% por encima de ayer a esta hora.`
        : `💰 Los ingresos de hoy van ${Math.abs(deltaIngreso)}% por debajo de ayer a esta hora.`);
    }
  }

  // Pedidos sin asignar
  if (sinAsignar.length > 0) {
    frases.push(`🔔 Tienes ${sinAsignar.length} pedido${sinAsignar.length===1?"":"s"} sin asignar esperando repartidor.`);
  }

  // Repartidor destacado del día
  const conteoHoy = {};
  hoyP.forEach(p=>{ if(p.repartidor_id) conteoHoy[p.repartidor_id]=(conteoHoy[p.repartidor_id]||0)+1; });
  const topId = Object.keys(conteoHoy).sort((a,b)=>conteoHoy[b]-conteoHoy[a])[0];
  if (topId && conteoHoy[topId] >= 3) {
    const rep = repartidores.find(r=>r.id===topId);
    if (rep) frases.push(`🏆 ${rep.nombres} ${rep.apellidos} lleva la delantera hoy, con ${conteoHoy[topId]} pedidos.`);
  }

  if (frases.length === 0) frases.push("👋 Sin novedades destacadas hoy todavía — vuelve más tarde para ver el resumen.");
  return frases.slice(0, 4);
}

function Dashboard({ pedidos, repartidores, liquidaciones }) {
  const hoy = new Date().toISOString().split("T")[0];
  const ayer = new Date(Date.now()-86400000).toISOString().split("T")[0];
  const horaActual = new Date().getHours()*60 + new Date().getMinutes();

  const hoyP = pedidos.filter(p => p.created_at?.startsWith(hoy));
  // "Ayer a esta hora" — comparación justa, no todo el día de ayer completo
  const ayerP = pedidos.filter(p => {
    if (!p.created_at?.startsWith(ayer)) return false;
    const d = new Date(p.created_at);
    return (d.getHours()*60+d.getMinutes()) <= horaActual;
  });
  const entregados = pedidos.filter(p => p.estado==="entregado");
  const enRuta = pedidos.filter(p => p.estado==="en_ruta");
  const sinAsignar = pedidos.filter(p => p.estado==="sin_asignar");
  const ingresoHoy = hoyP.reduce((a,p)=>a+(parseFloat(p.tarifa_s)||0),0);
  const ingresoAyer = ayerP.reduce((a,p)=>a+(parseFloat(p.tarifa_s)||0),0);
  const efectividad = pedidos.length ? Math.round(entregados.length/pedidos.length*100) : 0;

  const deltaPct = (hoyVal, ayerVal) => {
    if (!ayerVal) return null;
    return Math.round(((hoyVal-ayerVal)/ayerVal)*100);
  };
  const deltaPedidos = deltaPct(hoyP.length, ayerP.length);
  const deltaIngreso = deltaPct(ingresoHoy, ingresoAyer);

  const kpis = [
    { icon:"📦", label:"Pedidos hoy", value: hoyP.length, sub:`${pedidos.length} total`, color: B.navy, delta: deltaPedidos },
    { icon:"✅", label:"Entregados", value: entregados.length, sub:`${efectividad}% efectividad`, color: B.green },
    { icon:"🛵", label:"En ruta", value: enRuta.length, sub:"activos ahora", color: B.gold },
    { icon:"⚠️", label:"Sin asignar", value: sinAsignar.length, sub: sinAsignar.length>0?"requieren atención":"todo OK", color: sinAsignar.length>0?B.red:B.green },
    { icon:"💰", label:"Ingresos hoy", value: fmt.sol(ingresoHoy), sub:"antes de IGV", color: B.goldDk, big:true, delta: deltaIngreso },
    { icon:"🏍️", label:"Repartidores", value: repartidores.filter(r=>r.activo).length, sub:"activos", color: B.navy },
  ];

  const porEstado = Object.entries(ESTADOS_PEDIDO).map(([k,v])=>({
    estado: k, label: v.label, color: v.color,
    count: pedidos.filter(p=>p.estado===k).length
  }));

  // Tendencia de los últimos 7 días
  const serie7dias = [];
  for (let i=6; i>=0; i--) {
    const fecha = new Date(Date.now() - i*86400000);
    const key = fecha.toISOString().split("T")[0];
    const delDia = pedidos.filter(p=>p.created_at?.startsWith(key));
    serie7dias.push({
      label: fecha.toLocaleDateString("es-PE",{day:"2-digit",month:"2-digit"}),
      total: delDia.length,
      entregados: delDia.filter(p=>p.estado==="entregado").length,
    });
  }

  const insights = generarInsights(pedidos, hoyP, ayerP, entregados, efectividad, ingresoHoy, ingresoAyer, sinAsignar, repartidores);

  const recientes = [...pedidos].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,8);

  return (
    <div>
      {/* Resumen automático */}
      <div style={{ background:`linear-gradient(135deg,${B.navy},${B.navyLt||"#1E3A6E"})`, borderRadius:14,
        padding:"16px 20px", marginBottom:20, boxShadow:"0 4px 16px #0D1E3D22" }}>
        <div style={{ fontSize:11, fontWeight:700, color:B.gold, textTransform:"uppercase",
          letterSpacing:"0.8px", marginBottom:10 }}>🔎 Resumen del día</div>
        <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
          {insights.map((frase,i)=>(
            <div key={i} style={{ fontSize:13, color:"#E8EAF0" }}>{frase}</div>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(6,1fr)", gap:14, marginBottom:24 }}>
        {kpis.map((k,i) => (
          <div key={i} style={{ background:B.white, border:`1px solid ${B.border}`,
            borderRadius:12, padding:18, borderTop:`3px solid ${k.color}`,
            boxShadow:"0 2px 8px #0D1E3D0A" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
              <div style={{ fontSize:22, marginBottom:8 }}>{k.icon}</div>
              {k.delta != null && (
                <span style={{ fontSize:10, fontWeight:700, padding:"2px 6px", borderRadius:8,
                  background: k.delta>=0?"#ECFDF5":"#FEF2F2", color: k.delta>=0?B.green:B.red }}>
                  {k.delta>=0?"▲":"▼"} {Math.abs(k.delta)}%
                </span>
              )}
            </div>
            <div style={{ fontSize:10, color:B.textMut, textTransform:"uppercase",
              letterSpacing:"0.8px", marginBottom:4 }}>{k.label}</div>
            <div style={{ fontSize: k.big?18:28, fontWeight:800, color:B.textPri, lineHeight:1 }}>{k.value}</div>
            <div style={{ fontSize:11, color:B.textSec, marginTop:5 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 340px", gap:14, marginBottom:14 }}>
        {/* Tendencia 7 días */}
        <div style={{ background:B.white, border:`1px solid ${B.border}`, borderRadius:12,
          padding:18, boxShadow:"0 2px 8px #0D1E3D0A", gridColumn:"span 2" }}>
          <div style={{ fontSize:13, fontWeight:700, color:B.textPri, marginBottom:4 }}>Tendencia — últimos 7 días</div>
          <div style={{ fontSize:11, color:B.textMut, marginBottom:10 }}>
            <span style={{ color:B.green, fontWeight:700 }}>■</span> Entregados · Barra completa = total del día
          </div>
          <SerieDiaria datos={serie7dias}/>
        </div>

        {/* Dona de estados */}
        <div style={{ background:B.white, border:`1px solid ${B.border}`, borderRadius:12,
          padding:16, boxShadow:"0 2px 8px #0D1E3D0A" }}>
          <div style={{ fontSize:12, fontWeight:700, color:B.textPri, marginBottom:12 }}>Estado de pedidos</div>
          <div style={{ display:"flex", alignItems:"center", gap:16 }}>
            <DonutChart segments={porEstado.map(e=>({ value:e.count, color:e.color }))} size={110}/>
            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
              {porEstado.map(e=>(
                <div key={e.estado} style={{ display:"flex", alignItems:"center", gap:6, fontSize:11 }}>
                  <span style={{ width:8, height:8, borderRadius:2, background:e.color, display:"inline-block" }}/>
                  <span style={{ color:B.textSec }}>{e.label}</span>
                  <span style={{ fontWeight:700, color:B.navy, marginLeft:"auto" }}>{e.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 340px", gap:14 }}>
        {/* Pedidos recientes */}
        <div style={{ background:B.white, border:`1px solid ${B.border}`, borderRadius:12,
          overflow:"hidden", boxShadow:"0 2px 8px #0D1E3D0A", gridColumn:"span 2" }}>
          <div style={{ padding:"14px 18px", borderBottom:`1px solid ${B.border}`,
            display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <span style={{ fontSize:13, fontWeight:700, color:B.textPri }}>Pedidos recientes</span>
            <span style={{ fontSize:11, color:B.textMut }}>{recientes.length} últimos</span>
          </div>
          <table style={{ width:"100%", borderCollapse:"collapse" }}>
            <thead>
              <tr style={{ background:B.bg }}>
                {["Tracking Boaz","N° Orden","Destinatario","Distrito","Servicio","Repartidor","Estado","Fecha"].map(h=>(
                  <th key={h} style={{ padding:"8px 14px", textAlign:"left", fontSize:10,
                    color:B.textMut, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.7px" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recientes.map((p,i) => (
                <tr key={p.id} style={{ borderTop:`1px solid ${B.border}`,
                  background: i%2===0?B.white:"#F8FAFC" }}>
                  <td style={{ padding:"10px 14px", fontSize:12, fontWeight:700, color:B.navy }}>{p.omd}</td>
                  <td style={{ padding:"10px 14px", fontSize:12, color:B.textSec }}>{p.cliente_referencia||"—"}</td>
                  <td style={{ padding:"10px 14px", fontSize:12, color:B.textPri }}>{p.dest_nombre}</td>
                  <td style={{ padding:"10px 14px", fontSize:12, color:B.textSec }}>{p.dest_distrito||"—"}</td>
                  <td style={{ padding:"10px 14px" }}>
                    {p.tipo_servicio && BADGE_SERVICIO[p.tipo_servicio] ? (
                      <span style={{ fontSize:10, fontWeight:700, padding:"3px 8px", borderRadius:8,
                        background: BADGE_SERVICIO[p.tipo_servicio].bg,
                        color: BADGE_SERVICIO[p.tipo_servicio].color }}>
                        {BADGE_SERVICIO[p.tipo_servicio].label}
                      </span>
                    ) : <span style={{ fontSize:11, color:B.textMut }}>—</span>}
                  </td>
                  <td style={{ padding:"10px 14px", fontSize:12, color:B.textSec }}>
  {repartidores.find(r=>r.id===p.repartidor_id) ?
    `${repartidores.find(r=>r.id===p.repartidor_id).nombres} ${repartidores.find(r=>r.id===p.repartidor_id).apellidos}` : "—"}
</td>
                  <td style={{ padding:"10px 14px" }}><Chip estado={p.estado}/></td>
                  <td style={{ padding:"10px 14px", fontSize:11, color:B.textMut }}>{fmt.fecha(p.created_at)}</td>
                </tr>
              ))}
              {recientes.length===0&&<tr><td colSpan={8} style={{ padding:32, textAlign:"center",
                color:B.textMut, fontSize:13 }}>No hay pedidos aún</td></tr>}
            </tbody>
          </table>
        </div>

        {/* Top repartidores */}
        <div style={{ background:B.white, border:`1px solid ${B.border}`, borderRadius:12,
          padding:16, boxShadow:"0 2px 8px #0D1E3D0A" }}>
          <div style={{ fontSize:12, fontWeight:700, color:B.textPri, marginBottom:12 }}>Top repartidores</div>
          {[...repartidores].map(r=>{
            const count = pedidos.filter(p=>p.repartidor_id===r.id).length;
            const ent = pedidos.filter(p=>p.repartidor_id===r.id&&p.estado==="entregado").length;
            return { ...r, count, ent, ef: count?Math.round(ent/count*100):0 };
          }).sort((a,b)=>b.count-a.count).slice(0,5).map(r => (
            <div key={r.id} style={{ padding:"8px 0", borderBottom:`1px solid ${B.border}` }}>
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6 }}>
                <div style={{ width:32, height:32, borderRadius:"50%",
                  background:`linear-gradient(135deg,${B.navy},${B.navyLt||"#1E3A6E"})`,
                  display:"flex", alignItems:"center", justifyContent:"center",
                  fontSize:12, fontWeight:700, color:B.gold, flexShrink:0 }}>
                  {r.nombres?.[0]}{r.apellidos?.[0]}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:12, color:B.textPri, fontWeight:600 }}>{r.nombres} {r.apellidos}</div>
                  <div style={{ fontSize:10, color:B.textMut }}>{r.ent}/{r.count} entregados</div>
                </div>
                <div style={{ fontSize:16, fontWeight:800, color:B.gold }}>{r.count}</div>
              </div>
              <div style={{ height:4, background:B.bg, borderRadius:3, overflow:"hidden" }}>
                <div style={{ height:"100%", width:`${r.ef}%`, borderRadius:3,
                  background: r.ef>=80?B.green:r.ef>=60?B.gold:B.red }}/>
              </div>
            </div>
          ))}
          {repartidores.length===0 && (
            <div style={{ padding:20, textAlign:"center", color:B.textMut, fontSize:12 }}>Sin repartidores</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// MÓDULO 2: PEDIDOS COMPLETO
// ══════════════════════════════════════════════════════════════
function Pedidos({ pedidos, repartidores, empresas, tarifariosCliente, tarifarioEstandar, onRefresh, toast }) {
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [busqueda, setBusqueda] = useState("");
  const [modalNuevo, setModalNuevo] = useState(false);
  const [modalCarga, setModalCarga] = useState(false);
  const [modalGeocodificar, setModalGeocodificar] = useState(false);
  const [modalDetalle, setModalDetalle] = useState(null);
  const [asignando, setAsignando] = useState(null);
  const [ordenCol, setOrdenCol] = useState(null);
  const [ordenDir, setOrdenDir] = useState("asc");

  const ordenarPor = (col) => {
    if (ordenCol === col) {
      setOrdenDir(d => d==="asc" ? "desc" : "asc");
    } else {
      setOrdenCol(col);
      setOrdenDir("asc");
    }
  };

  const VALOR_COL = {
    tracking: p => p.omd || "",
    orden_cliente: p => p.cliente_referencia || "",
    destinatario: p => p.dest_nombre || "",
    direccion: p => p.dest_direccion || "",
    peso: p => parseFloat(p.peso_kg) || 0,
    tamano: p => bandaDePeso(p.peso_kg),
    servicio: p => p.tipo_servicio || "",
    ambito: p => p.ambito || "",
    repartidor: p => { const r = repartidores.find(r=>r.id===p.repartidor_id); return r ? `${r.nombres} ${r.apellidos}` : ""; },
    estado: p => p.estado || "",
    fecha: p => p.created_at || "",
  };

  const filtrados = pedidos.filter(p => {
    const okE = filtroEstado==="todos" || p.estado===filtroEstado;
    const okB = !busqueda ||
      p.omd?.toLowerCase().includes(busqueda.toLowerCase()) ||
      p.cliente_referencia?.toLowerCase().includes(busqueda.toLowerCase()) ||
      p.dest_nombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
      p.dest_distrito?.toLowerCase().includes(busqueda.toLowerCase()) ||
      p.dest_telefono?.includes(busqueda);
    return okE && okB;
  }).sort((a,b) => {
    if (!ordenCol) return 0;
    const va = VALOR_COL[ordenCol](a), vb = VALOR_COL[ordenCol](b);
    const cmp = typeof va === "number" ? va-vb : String(va).localeCompare(String(vb));
    return ordenDir==="asc" ? cmp : -cmp;
  });

  const cambiarEstado = async (id, nuevoEstado) => {
    const extra = nuevoEstado==="entregado" ? {fecha_entrega:new Date().toISOString()} :
                  nuevoEstado==="en_ruta"   ? {fecha_asignacion:new Date().toISOString()} : {};
    const { error } = await sb.from("pedidos").update({estado:nuevoEstado,...extra}).eq("id",id);
    if (error) { toast("Error: "+error.message,"error"); return; }
    toast("Estado actualizado ✓");
    onRefresh();
  };

  const asignarRep = async (pedidoId, repId, estadoActual) => {
    const payload = { repartidor_id: repId };
    // Si el pedido todavía no tenía repartidor, pasa a "asignado" y registra la fecha.
    // Si ya estaba en ruta/entregado/etc., solo se cambia el conductor sin tocar el estado.
    if (estadoActual === "sin_asignar") {
      payload.estado = "asignado";
      payload.fecha_asignacion = new Date().toISOString();
    }
    const { error } = await sb.from("pedidos").update(payload).eq("id", pedidoId);
    if (error) { toast("Error: "+error.message,"error"); return; }
    toast(estadoActual==="sin_asignar" ? "Repartidor asignado ✓" : "Repartidor cambiado ✓");
    setAsignando(null); onRefresh();
  };

  return (
    <div>
      {/* Barra de herramientas */}
      <div style={{ display:"flex", gap:10, marginBottom:16, flexWrap:"wrap", alignItems:"center" }}>
        <input placeholder="🔍 Buscar por OMD, N° de orden, nombre, teléfono, distrito..."
          value={busqueda} onChange={e=>setBusqueda(e.target.value)}
          style={{ ...inp, width:320, background:B.white, boxShadow:"0 1px 3px #0D1E3D14" }} />
        <div style={{ display:"flex", gap:6 }}>
          {["todos",...Object.keys(ESTADOS_PEDIDO)].map(e=>{
            const cantidad = e==="todos" ? pedidos.length : pedidos.filter(p=>p.estado===e).length;
            return (
              <button key={e} onClick={()=>setFiltroEstado(e)}
                style={{ padding:"7px 12px", borderRadius:20, fontSize:11, fontWeight:600,
                  cursor:"pointer", border:`1px solid ${filtroEstado===e?B.gold:B.border}`,
                  background: filtroEstado===e?B.gold:"transparent",
                  color: filtroEstado===e?B.navy:B.textSec }}>
                {e==="todos"?"Todos":ESTADOS_PEDIDO[e].label} ({cantidad})
              </button>
            );
          })}
        </div>
        <span style={{ marginLeft:"auto", fontSize:12, color:B.textMut }}>{filtrados.length} pedidos</span>
        {pedidos.filter(p=>!p.dest_lat).length > 0 && (
          <BtnSec onClick={()=>setModalGeocodificar(true)}>
            📍 Geocodificar pendientes ({pedidos.filter(p=>!p.dest_lat).length})
          </BtnSec>
        )}
        <BtnSec onClick={()=>setModalCarga(true)}>⬆️ Cargar masivo</BtnSec>
        <BtnPri onClick={()=>setModalNuevo(true)}>+ Nuevo pedido</BtnPri>
      </div>

      {/* Tabla */}
      <div style={{ background:B.white, border:`1px solid ${B.border}`, borderRadius:12,
        overflow:"hidden", boxShadow:"0 2px 8px #0D1E3D0A" }}>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead>
            <tr style={{ background:B.bg }}>
              {[
                ["Tracking Boaz","tracking"],["N° Orden","orden_cliente"],["Destinatario","destinatario"],["Dirección","direccion"],
                ["Peso","peso"],["Tamaño","tamano"],["Servicio","servicio"],["Ámbito","ambito"],["Repartidor","repartidor"],
                ["Estado","estado"],["Fecha","fecha"],["Acciones",null],
              ].map(([h,col])=>(
                <th key={h} onClick={()=>col && ordenarPor(col)}
                  style={{ padding:"10px 14px", textAlign:"left", fontSize:10,
                    color: ordenCol===col ? B.navy : B.textMut, fontWeight:700, textTransform:"uppercase",
                    letterSpacing:"0.7px", cursor: col?"pointer":"default", userSelect:"none",
                    whiteSpace:"nowrap" }}>
                  {h}{col && (
                    <span style={{ marginLeft:4, opacity: ordenCol===col?1:0.3 }}>
                      {ordenCol===col ? (ordenDir==="asc"?"▲":"▼") : "▲"}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtrados.map((p,i) => {
              const rep = repartidores.find(r=>r.id===p.repartidor_id);
              return (
                <tr key={p.id} style={{ borderTop:`1px solid ${B.border}`,
                  background: i%2===0?B.white:"#F8FAFC",
                  cursor:"pointer" }}
                  onClick={()=>setModalDetalle(p)}>
                  <td style={{ padding:"11px 14px", fontSize:12, fontWeight:700, color:B.navy }}>{p.omd}</td>
                  <td style={{ padding:"11px 14px", fontSize:12, color:B.textSec }}>{p.cliente_referencia||"—"}</td>
                  <td style={{ padding:"11px 14px" }}>
                    <div style={{ fontSize:12, color:B.textPri, fontWeight:600 }}>{p.dest_nombre}</div>
                    <div style={{ fontSize:10, color:B.textMut }}>{p.dest_telefono}</div>
                  </td>
                  <td style={{ padding:"11px 14px" }}>
                    <div style={{ fontSize:12, color:B.textSec }}>{p.dest_direccion?.slice(0,30)}{p.dest_direccion?.length>30?"...":""}</div>
                    <div style={{ fontSize:10, color:B.textMut }}>{p.dest_distrito}</div>
                  </td>
                  <td style={{ padding:"11px 14px", fontSize:12, color:B.textSec }}>{p.peso_kg?p.peso_kg+" kg":"—"}</td>
                  <td style={{ padding:"11px 14px" }}>
                    <span style={{ fontSize:10, fontWeight:700, padding:"3px 8px", borderRadius:8,
                      background:"#F0F4F8", color:B.navy }}>
                      {bandaDePeso(p.peso_kg)}
                    </span>
                  </td>
                  <td style={{ padding:"11px 14px" }}>
                    {p.tipo_servicio && BADGE_SERVICIO[p.tipo_servicio] ? (
                      <span style={{ fontSize:10, fontWeight:700, padding:"3px 8px", borderRadius:8,
                        background: BADGE_SERVICIO[p.tipo_servicio].bg,
                        color: BADGE_SERVICIO[p.tipo_servicio].color }}>
                        {BADGE_SERVICIO[p.tipo_servicio].label}
                      </span>
                    ) : <span style={{ fontSize:11, color:B.textMut }}>—</span>}
                  </td>
                  <td style={{ padding:"11px 14px", fontSize:11, color:B.textSec, textTransform:"capitalize" }}>{p.ambito?.replace("_"," ")||"—"}</td>
                  <td style={{ padding:"11px 14px" }} onClick={e=>e.stopPropagation()}>
                    {asignando===p.id ? (
                      <select autoFocus defaultValue={p.repartidor_id||""}
                        onChange={e=>{if(e.target.value)asignarRep(p.id,e.target.value,p.estado); else setAsignando(null);}}
                        onBlur={()=>setAsignando(null)}
                        style={{ ...inp, padding:"4px 8px", fontSize:11, width:"auto" }}>
                        <option value="">Sin asignar</option>
                        {repartidores.filter(r=>r.activo).map(r=>(
                          <option key={r.id} value={r.id}>{r.nombres} {r.apellidos}</option>
                        ))}
                      </select>
                    ) : rep ? (
                      <button onClick={()=>setAsignando(p.id)}
                        title="Clic para cambiar de repartidor"
                        style={{ fontSize:12, color:B.textPri, background:"none", border:"none",
                          cursor:"pointer", padding:0, textDecoration:"underline",
                          textDecorationStyle:"dotted", textDecorationColor:B.textMut }}>
                        {rep.nombres} {rep.apellidos}
                      </button>
                    ) : (
                      <button onClick={()=>setAsignando(p.id)}
                        style={{ fontSize:11, color:B.blue, background:"none", border:"none",
                          cursor:"pointer", fontWeight:600 }}>+ Asignar</button>
                    )}
                  </td>
                  <td style={{ padding:"11px 14px" }} onClick={e=>e.stopPropagation()}>
                    <select value={p.estado} onChange={e=>cambiarEstado(p.id,e.target.value)}
                      style={{ ...inp, padding:"4px 8px", fontSize:11, width:"auto",
                        cursor:"pointer", borderRadius:6 }}>
                      {Object.entries(ESTADOS_PEDIDO).map(([k,v])=>(
                        <option key={k} value={k}>{v.label}</option>
                      ))}
                    </select>
                  </td>
                  <td style={{ padding:"11px 14px", fontSize:11, color:B.textMut }}>{fmt.fecha(p.created_at)}</td>
                  <td style={{ padding:"11px 14px" }} onClick={e=>e.stopPropagation()}>
                    <button onClick={()=>setModalDetalle(p)}
                      style={{ fontSize:11, color:B.navy, background:B.bg, border:`1px solid ${B.border}`,
                        padding:"4px 10px", borderRadius:6, cursor:"pointer" }}>Ver</button>
                  </td>
                </tr>
              );
            })}
            {filtrados.length===0&&<tr><td colSpan={10} style={{ padding:40, textAlign:"center",
              color:B.textMut, fontSize:13 }}>No hay pedidos con este filtro</td></tr>}
          </tbody>
        </table>
      </div>

      {modalNuevo && <ModalNuevoPedido repartidores={repartidores} empresas={empresas} tarifariosCliente={tarifariosCliente} tarifarioEstandar={tarifarioEstandar}
        onClose={()=>setModalNuevo(false)} onSaved={()=>{setModalNuevo(false);onRefresh();}} toast={toast}/>}
      {modalCarga && <ModalCargaMasiva repartidores={repartidores} empresas={empresas} tarifariosCliente={tarifariosCliente} tarifarioEstandar={tarifarioEstandar}
        onClose={()=>setModalCarga(false)} onSaved={()=>{onRefresh();}} toast={toast}/>}
      {modalGeocodificar && <ModalGeocodificarPendientes pedidos={pedidos}
        onClose={()=>setModalGeocodificar(false)} onDone={onRefresh} toast={toast}/>}
      {modalDetalle && <ModalDetallePedido pedido={modalDetalle} repartidores={repartidores}
        onClose={()=>setModalDetalle(null)} onRefresh={onRefresh} toast={toast}/>}
    </div>
  );
}

// Modal nuevo pedido
function ModalNuevoPedido({ repartidores, empresas, tarifariosCliente, tarifarioEstandar, onClose, onSaved, toast }) {
  const getTarifa = getTarifaSameDay;
  const [f, setF] = useState({
    dest_nombre:"", dest_telefono:"", dest_direccion:"", dest_distrito:"",
    dest_referencia:"", peso_kg:"", ambito:"urbano", empresa_id:"",
    repartidor_id:"", cobro_destino:false, monto_cobrar:"", tipo_servicio:"same_day",
    descripcion:"", fecha_programada: new Date().toISOString().split("T")[0],
  });
  const tarifaCliente = obtenerTarifaEmpresa(f.empresa_id, f.ambito, f.tipo_servicio, tarifariosCliente);
  const tarifaEstandarAplicable = obtenerTarifaEstandar(f.ambito, f.tipo_servicio, tarifarioEstandar);
  const tarifaPersonalizada = tarifaCliente || tarifaEstandarAplicable;
  const tarifa = getTarifa(f.ambito, parseFloat(f.peso_kg), tarifaPersonalizada);
  const [guardando, setGuardando] = useState(false);

  const save = async () => {
    if (!f.dest_nombre || !f.dest_direccion) { toast("Completa nombre y dirección","error"); return; }
    setGuardando(true);
    const { data: codigo, error: errCodigo } = await sb.rpc("generar_codigo_boaz");
    if (errCodigo || !codigo) { toast("Error al generar el código de tracking: "+(errCodigo?.message||""),"error"); setGuardando(false); return; }
    const coords = await geocodificarDireccion(f.dest_direccion, f.dest_distrito);
    const { error } = await sb.from("pedidos").insert([{
      ...f, omd: codigo, tarifa_s: tarifa,
      peso_kg: parseFloat(f.peso_kg)||null,
      monto_cobrar: parseFloat(f.monto_cobrar)||null,
      empresa_id: f.empresa_id||null, repartidor_id: f.repartidor_id||null,
      estado: f.repartidor_id?"asignado":"sin_asignar",
      fecha_asignacion: f.repartidor_id?new Date().toISOString():null,
      dest_lat: coords?.lat||null, dest_lng: coords?.lng||null,
    }]);
    setGuardando(false);
    if (error) { toast("Error: "+error.message,"error"); return; }
    toast(coords ? "Pedido creado ✓ (ubicación encontrada)" : "Pedido creado ✓ (no se encontró la ubicación exacta)");
    onSaved();
  };

  const Row = ({ children }) => (
    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>{children}</div>
  );
  const Field = ({ label, children }) => (
    <div><label style={lbl}>{label}</label>{children}</div>
  );

  const ZONAS = {
    urbano: ["Lima","Barranco","Breña","Chorrillos","El Agustino","Jesús María","La Victoria","Lince","Magdalena del Mar","Miraflores","Pueblo Libre","Rímac","San Borja","San Isidro","San Luis","San Miguel","Santiago de Surco","Surquillo"],
    semi_urbano: ["Callao","Ate","Independencia","La Molina","Los Olivos","San Juan de Lurigancho","San Juan de Miraflores","San Martín de Porres","Santa Anita","Villa El Salvador","Villa María del Triunfo"],
    periferico: ["Comas","Ventanilla","Carabayllo","Lurigancho-Chosica","Lurín","Pachacámac","Puente Piedra"],
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"#0008", zIndex:1000,
      display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ background:B.white, borderRadius:16, padding:28, width:640,
        maxHeight:"90vh", overflowY:"auto", boxShadow:"0 20px 60px #0003" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
          <div>
            <div style={{ fontSize:16, fontWeight:800, color:B.navy }}>Nuevo pedido</div>
            <div style={{ fontSize:11, color:B.textMut }}>
              Tarifa calculada: <strong style={{color:B.gold}}>{fmt.sol(tarifa)}</strong> ({f.ambito.replace("_"," ")})
              {tarifaCliente && <span style={{ color:B.green, fontWeight:700 }}> · tarifario negociado con el cliente ✓</span>}
              {!tarifaCliente && tarifaEstandarAplicable && <span style={{ color:B.gold, fontWeight:700 }}> · tarifario estándar</span>}
            </div>
          </div>
          <button onClick={onClose} style={{ background:"none", border:"none", fontSize:20,
            color:B.textSec, cursor:"pointer" }}>✕</button>
        </div>

        <div style={{ fontSize:11, fontWeight:700, color:B.navy, textTransform:"uppercase",
          letterSpacing:"1px", marginBottom:10, paddingBottom:6,
          borderBottom:`2px solid ${B.gold}` }}>Datos del destinatario</div>
        <Row>
          <Field label="Nombre completo"><input style={inp} value={f.dest_nombre} onChange={e=>setF(p=>({...p,dest_nombre:e.target.value}))}/></Field>
          <Field label="Teléfono"><input style={inp} value={f.dest_telefono} onChange={e=>setF(p=>({...p,dest_telefono:e.target.value}))}/></Field>
        </Row>
        <div style={{ marginBottom:12 }}>
          <Field label="Dirección completa"><input style={inp} value={f.dest_direccion} onChange={e=>setF(p=>({...p,dest_direccion:e.target.value}))}/></Field>
        </div>
        <Row>
          <Field label="Ámbito">
            <select style={inp} value={f.ambito} onChange={e=>setF(p=>({...p,ambito:e.target.value,dest_distrito:""}))}>
              <option value="urbano">Urbano</option>
              <option value="semi_urbano">Semi Urbano</option>
              <option value="periferico">Periférico</option>
            </select>
          </Field>
          <Field label="Distrito">
            <select style={inp} value={f.dest_distrito} onChange={e=>setF(p=>({...p,dest_distrito:e.target.value}))}>
              <option value="">— Selecciona —</option>
              {(ZONAS[f.ambito]||[]).map(z=><option key={z} value={z}>{z}</option>)}
            </select>
          </Field>
        </Row>
        <div style={{ marginBottom:12 }}>
          <Field label="Referencia"><input style={inp} value={f.dest_referencia} onChange={e=>setF(p=>({...p,dest_referencia:e.target.value}))}/></Field>
        </div>

        <div style={{ fontSize:11, fontWeight:700, color:B.navy, textTransform:"uppercase",
          letterSpacing:"1px", marginBottom:10, marginTop:16, paddingBottom:6,
          borderBottom:`2px solid ${B.gold}` }}>Datos del paquete</div>
        <Row>
          <Field label="Peso (kg)"><input type="number" style={inp} value={f.peso_kg} onChange={e=>setF(p=>({...p,peso_kg:e.target.value}))}/></Field>
          <Field label="Tipo de servicio">
            <select style={inp} value={f.tipo_servicio} onChange={e=>setF(p=>({...p,tipo_servicio:e.target.value}))}>
              <option value="same_day">Same Day</option>
              <option value="next_day">Next Day</option>
              <option value="especial">Especial</option>
            </select>
          </Field>
        </Row>
        <div style={{ marginBottom:12 }}>
          <Field label="Descripción del contenido"><input style={inp} value={f.descripcion} onChange={e=>setF(p=>({...p,descripcion:e.target.value}))}/></Field>
        </div>

        <div style={{ fontSize:11, fontWeight:700, color:B.navy, textTransform:"uppercase",
          letterSpacing:"1px", marginBottom:10, marginTop:16, paddingBottom:6,
          borderBottom:`2px solid ${B.gold}` }}>Asignación</div>
        <Row>
          <Field label="Empresa cliente">
            <select style={inp} value={f.empresa_id} onChange={e=>setF(p=>({...p,empresa_id:e.target.value}))}>
              <option value="">— Sin empresa —</option>
              {empresas.map(e=><option key={e.id} value={e.id}>{e.codigo_interno ? `${e.codigo_interno} — ` : ""}{e.nombre}</option>)}
            </select>
          </Field>
          <Field label="Repartidor">
            <select style={inp} value={f.repartidor_id} onChange={e=>setF(p=>({...p,repartidor_id:e.target.value}))}>
              <option value="">— Sin asignar —</option>
              {repartidores.filter(r=>r.activo).map(r=><option key={r.id} value={r.id}>{r.nombres} {r.apellidos}</option>)}
            </select>
          </Field>
        </Row>
        <Row>
          <Field label="Fecha programada"><input type="date" style={inp} value={f.fecha_programada} onChange={e=>setF(p=>({...p,fecha_programada:e.target.value}))}/></Field>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:20 }}>
              <input type="checkbox" id="cobro" checked={f.cobro_destino}
                onChange={e=>setF(p=>({...p,cobro_destino:e.target.checked}))}
                style={{ width:16, height:16 }}/>
              <label htmlFor="cobro" style={{ fontSize:13, color:B.textPri, cursor:"pointer" }}>Cobro en destino</label>
            </div>
            {f.cobro_destino && <input type="number" placeholder="Monto S/" style={inp} value={f.monto_cobrar} onChange={e=>setF(p=>({...p,monto_cobrar:e.target.value}))}/>}
          </div>
        </Row>

        {/* Resumen tarifa */}
        <div style={{ background:`${B.navy}08`, border:`1px solid ${B.gold}44`,
          borderRadius:10, padding:14, marginTop:12, display:"flex", gap:24, alignItems:"center" }}>
          <div><div style={{ fontSize:10, color:B.textMut, textTransform:"uppercase" }}>Tarifa</div>
            <div style={{ fontSize:22, fontWeight:800, color:B.gold }}>{fmt.sol(tarifa)}</div></div>
          <div><div style={{ fontSize:10, color:B.textMut, textTransform:"uppercase" }}>Ámbito</div>
            <div style={{ fontSize:14, fontWeight:600, color:B.navy, textTransform:"capitalize" }}>{f.ambito.replace("_"," ")}</div></div>
          <div><div style={{ fontSize:10, color:B.textMut, textTransform:"uppercase" }}>IGV (18%)</div>
            <div style={{ fontSize:14, fontWeight:600, color:B.textSec }}>{fmt.sol(tarifa*0.18)}</div></div>
          <div><div style={{ fontSize:10, color:B.textMut, textTransform:"uppercase" }}>Total con IGV</div>
            <div style={{ fontSize:14, fontWeight:600, color:B.navy }}>{fmt.sol(tarifa*1.18)}</div></div>
        </div>

        <div style={{ display:"flex", gap:10, marginTop:20, justifyContent:"flex-end" }}>
          <BtnSec onClick={onClose}>Cancelar</BtnSec>
          <BtnPri onClick={save} disabled={guardando}>{guardando?"Ubicando dirección...":"Crear pedido"}</BtnPri>
        </div>
      </div>
    </div>
  );
}

// ── ETIQUETAS CON CÓDIGO DE BARRAS ─────────────────────────────
function escapeHtmlEtiqueta(str) {
  return (str||"").toString()
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function generarHtmlEtiquetas(pedidosSel, empresas) {
  const filas = pedidosSel.map(p => {
    const empresa = empresas.find(e=>e.id===p.empresa_id);
    const tipoServicio = p.tipo_servicio==="same_day" ? "Same Day"
      : p.tipo_servicio==="next_day" ? "Next Day" : "—";
    const cod = p.cobro_destino ? `COD — S/ ${p.monto_cobrar||""}` : "Pagado";
    const codigo = escapeHtmlEtiqueta(p.omd);
    return `
      <div class="etiqueta">
        <div class="fila-header">
          <div>
            <div style="font-size:10px;font-weight:bold;">ENVIADO POR:</div>
            <div style="font-size:22px;font-weight:900;letter-spacing:2px;margin-top:2px;">
              <span style="color:#0D1E3D;">BOA</span><span style="color:#E8780A;">Z</span>
            </div>
          </div>
        </div>
        <div style="font-size:11px;margin:8px 0;"><strong>TRACKING:</strong> ${codigo}</div>
        <div style="font-size:11px;margin-bottom:10px;">
          <strong>MÉTODO DE ENVÍO:</strong> ${escapeHtmlEtiqueta(tipoServicio)} &nbsp;|&nbsp;
          <strong>ÁMBITO:</strong> ${escapeHtmlEtiqueta((p.ambito||"—").replace("_"," "))} &nbsp;|&nbsp;
          <strong>MODALIDAD:</strong> ${escapeHtmlEtiqueta(cod)}
        </div>
        <div class="titulo-negro">
          <div style="flex:1;">REMITENTE:</div>
          <div style="flex:1;">DESTINATARIO:</div>
        </div>
        <div style="display:flex;">
          <div class="col">
            <div><strong>Empresa:</strong> ${escapeHtmlEtiqueta(empresa?.nombre||"Grupo Boaz S.A.C.")}</div>
            <div><strong>Dirección:</strong> ${escapeHtmlEtiqueta(empresa?.direccion||"—")}</div>
            <div><strong>Departamento:</strong> Lima</div>
            <div><strong>Provincia:</strong> Lima</div>
            <div><strong>Fecha de ingreso:</strong> ${fmt.fecha(p.created_at)}</div>
          </div>
          <div class="col">
            <div><strong>Cliente:</strong> ${escapeHtmlEtiqueta(p.dest_nombre)}</div>
            <div><strong>Dirección:</strong> ${escapeHtmlEtiqueta(p.dest_direccion)}</div>
            ${p.dest_referencia ? `<div><strong>Referencia:</strong> ${escapeHtmlEtiqueta(p.dest_referencia)}</div>` : ""}
            <div><strong>Departamento:</strong> Lima</div>
            <div><strong>Provincia:</strong> Lima</div>
            <div><strong>Distrito:</strong> ${escapeHtmlEtiqueta(p.dest_distrito)}</div>
          </div>
        </div>
        <div class="barcode-bottom">
          <svg data-code="${codigo}" style="height:60px;width:90%;"></svg>
          <div style="font-weight:bold;letter-spacing:3px;font-size:13px;margin-top:4px;">${codigo}</div>
        </div>
      </div>`;
  }).join("");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Etiquetas Boaz</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jsbarcode/3.12.3/JsBarcode.all.min.js"></script>
<style>
  @page { size: 10cm 15cm; margin: 0.3cm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; margin:0; background:#fff; }
  .etiqueta { width:9.4cm; min-height:14.4cm; border:1.5px solid #000; padding:10px;
    page-break-after: always; margin:0 auto; }
  .etiqueta:last-child { page-break-after: auto; }
  .fila-header { display:flex; justify-content:space-between; align-items:flex-start;
    border-bottom:1.5px solid #000; padding-bottom:8px; }
  .titulo-negro { display:flex; background:#000; color:#fff; font-weight:bold;
    font-size:11px; padding:5px 8px; margin:6px 0; }
  .col { flex:1; padding:6px 8px 0 0; font-size:10.5px; line-height:1.5; }
  .barcode-bottom { text-align:center; margin-top:14px; border-top:1px dashed #999; padding-top:10px; }
  @media print { .no-print { display:none; } }
</style>
</head>
<body>
  <div class="no-print" style="text-align:center;padding:14px;">
    <button onclick="window.print()" style="padding:10px 20px;font-size:14px;cursor:pointer;">🖨️ Imprimir</button>
  </div>
  ${filas}
  <script>
    window.addEventListener("load", function() {
      if (typeof JsBarcode === "undefined") {
        document.body.insertAdjacentHTML("afterbegin",
          '<div style="background:#FEE;color:#900;padding:12px;text-align:center;font-family:Arial;">' +
          '⚠️ No se pudo cargar la librería de códigos de barras (revisa tu conexión a internet e intenta de nuevo).</div>');
        return;
      }
      document.querySelectorAll("svg[data-code]").forEach(function(el){
        try {
          JsBarcode(el, el.getAttribute("data-code"), { format:"CODE128", width:2, height:44, displayValue:false, margin:0 });
        } catch(e) { console.error("Error generando código de barras:", e); }
      });
    });
  </script>
</body>
</html>`;
}

function ModalEtiquetas({ pedidos, empresas, onClose }) {
  const [seleccionados, setSeleccionados] = useState(() => new Set(pedidos.map(p=>p.id)));

  const toggle = (id) => setSeleccionados(prev => {
    const nuevo = new Set(prev);
    nuevo.has(id) ? nuevo.delete(id) : nuevo.add(id);
    return nuevo;
  });
  const toggleTodos = () => setSeleccionados(prev =>
    prev.size === pedidos.length ? new Set() : new Set(pedidos.map(p=>p.id))
  );

  const imprimir = () => {
    const elegidos = pedidos.filter(p=>seleccionados.has(p.id));
    if (elegidos.length===0) return;
    const html = generarHtmlEtiquetas(elegidos, empresas);
    const ventana = window.open("", "_blank");
    if (!ventana) return;
    ventana.document.write(html);
    ventana.document.close();
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"#0008", zIndex:1000,
      display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ background:B.white, borderRadius:16, padding:28, width:560,
        maxHeight:"85vh", overflowY:"auto", boxShadow:"0 20px 60px #0003" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
          <div style={{ fontSize:16, fontWeight:800, color:B.navy }}>🏷️ Generar etiquetas con código de barras</div>
          <button onClick={onClose} style={{ background:"none", border:"none", fontSize:20,
            color:B.textSec, cursor:"pointer" }}>✕</button>
        </div>

        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
          <button onClick={toggleTodos}
            style={{ fontSize:12, color:B.blue, background:"none", border:"none", cursor:"pointer", fontWeight:600 }}>
            {seleccionados.size===pedidos.length ? "Deseleccionar todos" : "Seleccionar todos"}
          </button>
          <span style={{ fontSize:12, color:B.textMut }}>{seleccionados.size} seleccionado{seleccionados.size===1?"":"s"}</span>
        </div>

        <div style={{ border:`1px solid ${B.border}`, borderRadius:10, overflow:"hidden", marginBottom:20 }}>
          {pedidos.length===0 && (
            <div style={{ padding:24, textAlign:"center", color:B.textMut, fontSize:13 }}>
              No hay pedidos en la vista actual
            </div>
          )}
          {pedidos.map((p,i)=>(
            <label key={p.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 14px",
              borderTop: i>0 ? `1px solid ${B.border}` : "none", cursor:"pointer",
              background: seleccionados.has(p.id) ? "#FFF7ED" : B.white }}>
              <input type="checkbox" checked={seleccionados.has(p.id)} onChange={()=>toggle(p.id)}
                style={{ width:16, height:16 }}/>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:12, fontWeight:700, color:B.navy }}>{p.omd} · {p.dest_nombre}</div>
                <div style={{ fontSize:11, color:B.textMut }}>{p.dest_distrito}</div>
              </div>
            </label>
          ))}
        </div>

        <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
          <BtnSec onClick={onClose}>Cancelar</BtnSec>
          <BtnPri onClick={imprimir} disabled={seleccionados.size===0}>
            🖨️ Generar e imprimir ({seleccionados.size})
          </BtnPri>
        </div>
      </div>
    </div>
  );
}

// Geocodifica retroactivamente pedidos ya existentes que no tienen coordenadas
function ModalGeocodificarPendientes({ pedidos, onClose, onDone, toast }) {
  const pendientes = pedidos.filter(p=>!p.dest_lat);
  const [procesando, setProcesando] = useState(false);
  const [progreso, setProgreso] = useState("");
  const [resultado, setResultado] = useState(null);
  const [mostrarLista, setMostrarLista] = useState(false);

  const iniciar = async () => {
    setProcesando(true);
    const fallidos = [];
    let ubicados = 0;
    for (let i=0; i<pendientes.length; i++) {
      const p = pendientes[i];
      setProgreso(`Ubicando pedido ${i+1} de ${pendientes.length} (${p.omd})...`);
      try {
        const coords = await geocodificarDireccion(p.dest_direccion, p.dest_distrito);
        if (coords) {
          await sb.from("pedidos").update({ dest_lat: coords.lat, dest_lng: coords.lng }).eq("id", p.id);
          ubicados++;
        } else {
          fallidos.push(p);
        }
      } catch (e) {
        fallidos.push(p);
      }
      await esperar(1100);
    }
    setProgreso("");
    setProcesando(false);
    setResultado({ ubicados, fallidos });
    toast(`${ubicados} pedido${ubicados===1?"":"s"} ubicado${ubicados===1?"":"s"} en el mapa ✓`);
    onDone();
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"#0008", zIndex:1000,
      display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ background:B.white, borderRadius:16, padding:28, width:560,
        maxHeight:"85vh", overflowY:"auto", boxShadow:"0 20px 60px #0003" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
          <div style={{ fontSize:16, fontWeight:800, color:B.navy }}>📍 Geocodificar pedidos existentes</div>
          <button onClick={onClose} style={{ background:"none", border:"none", fontSize:20,
            color:B.textSec, cursor:"pointer" }}>✕</button>
        </div>

        {!resultado ? (
          <>
            <div style={{ fontSize:13, color:B.textSec, marginBottom:12, lineHeight:1.6 }}>
              Se encontraron <strong style={{ color:B.navy }}>{pendientes.length} pedido{pendientes.length===1?"":"s"}</strong> sin coordenadas guardadas.
              Voy a buscar la ubicación de cada dirección (gratis, vía OpenStreetMap) para que aparezcan en el mapa de la app del repartidor.
            </div>
            <button onClick={()=>setMostrarLista(s=>!s)}
              style={{ fontSize:12, color:B.blue, background:"none", border:"none", cursor:"pointer",
                fontWeight:600, marginBottom:12 }}>
              {mostrarLista ? "Ocultar lista" : "Ver cuáles son →"}
            </button>
            {mostrarLista && (
              <div style={{ border:`1px solid ${B.border}`, borderRadius:8, marginBottom:16,
                maxHeight:220, overflowY:"auto" }}>
                {pendientes.map((p,i)=>(
                  <div key={p.id} style={{ padding:"8px 12px", fontSize:12,
                    borderTop: i>0 ? `1px solid ${B.border}` : "none",
                    background: i%2===0?B.white:"#F8FAFC" }}>
                    <span style={{ fontWeight:700, color:B.navy }}>{p.omd}</span> — {p.dest_nombre}
                    <div style={{ color:B.textMut }}>{p.dest_direccion}, {p.dest_distrito}</div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ background:"#FFFBEB", border:"1px solid #FDE68A", borderRadius:8,
              padding:"10px 14px", marginBottom:20, fontSize:12, color:"#92400E" }}>
              ⏱️ Esto puede tardar aproximadamente <strong>{Math.ceil(pendientes.length*1.1)} segundos</strong> (1 dirección por segundo, para respetar el servicio gratuito). No cierres esta ventana mientras procesa.
            </div>
            <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
              <BtnSec onClick={onClose}>Cancelar</BtnSec>
              <BtnPri onClick={iniciar} disabled={procesando}>
                {procesando ? (progreso||"Procesando...") : "Iniciar geocodificación"}
              </BtnPri>
            </div>
          </>
        ) : (
          <>
            <div style={{ background:"#ECFDF5", border:"1px solid #A7F3D0", borderRadius:10,
              padding:16, marginBottom:16, textAlign:"center" }}>
              <div style={{ fontSize:28, fontWeight:900, color:B.green }}>{resultado.ubicados}</div>
              <div style={{ fontSize:12, color:B.textSec }}>ubicados correctamente</div>
            </div>
            {resultado.fallidos.length > 0 && (
              <div style={{ marginBottom:16 }}>
                <div style={{ background:"#FEF2F2", border:"1px solid #FECACA", borderRadius:10,
                  padding:"12px 16px", marginBottom:8 }}>
                  <div style={{ fontSize:13, fontWeight:800, color:B.red, marginBottom:2 }}>
                    {resultado.fallidos.length} no se pudieron ubicar
                  </div>
                  <div style={{ fontSize:11, color:B.textSec }}>
                    Corrige la dirección de cada uno abriendo su detalle ("Ver") y usa "🔄 Guardar dirección y reintentar ubicación", o ingresa las coordenadas manualmente.
                  </div>
                </div>
                <div style={{ border:`1px solid ${B.border}`, borderRadius:8, maxHeight:220, overflowY:"auto" }}>
                  {resultado.fallidos.map((p,i)=>(
                    <div key={p.id} style={{ padding:"8px 12px", fontSize:12,
                      borderTop: i>0 ? `1px solid ${B.border}` : "none",
                      background: i%2===0?B.white:"#F8FAFC" }}>
                      <span style={{ fontWeight:700, color:B.navy }}>{p.omd}</span> — {p.dest_nombre}
                      <div style={{ color:B.textMut }}>{p.dest_direccion}, {p.dest_distrito}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div style={{ display:"flex", justifyContent:"flex-end" }}>
              <BtnPri onClick={onClose}>Listo</BtnPri>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Modal de carga masiva (CSV / Excel) — admin puede cargar en nombre de cualquier cliente
const COLUMNAS_PLANTILLA_ADMIN = [
  "Numero de Orden", "Destinatario", "Telefono", "Direccion", "Referencia",
  "Distrito", "Ambito (urbano-semi_urbano-periferico)", "Peso (kg)",
  "Tipo de Servicio", "Cobro en Destino (SI/NO)", "Monto a Cobrar",
];

function normalizarTextoAdmin(s) {
  return (s||"").toString().trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"");
}

function mapearFilaAdmin(fila) {
  const out = {};
  for (const key of Object.keys(fila)) {
    const k = normalizarTextoAdmin(key);
    const v = fila[key];
    if (k.includes("orden") || k.includes("referencia cliente") || k.includes("guia")) out.cliente_referencia = (v||"").toString().trim();
    else if (k.includes("destinatario") || k === "nombre") out.dest_nombre = (v||"").toString().trim();
    else if (k.includes("telefono")) out.dest_telefono = (v||"").toString().trim();
    else if (k.includes("direccion")) out.dest_direccion = (v||"").toString().trim();
    else if (k.includes("referencia")) out.dest_referencia = (v||"").toString().trim();
    else if (k.includes("distrito")) out.dest_distrito = (v||"").toString().trim();
    else if (k.includes("ambito") || k.includes("zona")) {
      const t = normalizarTextoAdmin(v);
      out.ambito = t.includes("peri") ? "periferico" : t.includes("semi") ? "semi_urbano" : "urbano";
    }
    else if (k.includes("peso")) out.peso_kg = parseFloat(v) || null;
    else if (k.includes("servicio")) {
      const t = normalizarTextoAdmin(v);
      out.tipo_servicio = t.includes("next") ? "next_day" : t.includes("same") ? "same_day" : t.includes("espec") ? "especial" : "";
    }
    else if (k.includes("cobro")) {
      const t = normalizarTextoAdmin(v);
      out.cobro_destino = t==="si" || t==="sí" || t==="true" || t==="1" || t==="x";
    }
    else if (k.includes("monto")) out.monto_cobrar = parseFloat(v) || null;
  }
  if (!out.ambito) out.ambito = "urbano";
  return out;
}

const REGEX_ALFANUM_ADMIN = /^[a-zA-Z0-9-]+$/;

function validarFilaAdmin(fila) {
  const errores = [];
  if (!fila.dest_nombre) errores.push("falta destinatario");
  if (!fila.dest_direccion) errores.push("falta dirección");
  if (!fila.dest_distrito) errores.push("falta distrito");
  if (fila.cliente_referencia) {
    if (fila.cliente_referencia.length > 15) errores.push("N° de orden supera 15 caracteres");
    if (!REGEX_ALFANUM_ADMIN.test(fila.cliente_referencia)) errores.push("N° de orden debe ser alfanumérico");
  }
  return errores;
}

function parseArchivoAdmin(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type:"array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(sheet, { defval:"" });
        resolve(json);
      } catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

function descargarPlantillaAdmin() {
  const ejemplo = ["PED-00123","Marco Salinas","987654321","Calle Las Flores 890","Frente al parque","Miraflores","urbano","1.2","Same Day","NO",""];
  const ws = XLSX.utils.aoa_to_sheet([COLUMNAS_PLANTILLA_ADMIN, ejemplo]);
  ws["!cols"] = COLUMNAS_PLANTILLA_ADMIN.map(()=>({ wch:22 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Plantilla");
  XLSX.writeFile(wb, "plantilla_pedidos_boaz.xlsx");
}

function ModalCargaMasiva({ repartidores, empresas, tarifariosCliente, tarifarioEstandar, onClose, onSaved, toast }) {
  const [empresaId, setEmpresaId] = useState("");
  const [repartidorId, setRepartidorId] = useState("");
  const [filas, setFilas] = useState([]);
  const [nombreArchivo, setNombreArchivo] = useState("");
  const [procesando, setProcesando] = useState(false);
  const [progreso, setProgreso] = useState("");
  const [resultado, setResultado] = useState(null);
  const [errorArchivo, setErrorArchivo] = useState("");
  const [mostrarEtiquetas, setMostrarEtiquetas] = useState(false);

  const validas = filas.filter(f=>f.errores.length===0);
  const invalidas = filas.filter(f=>f.errores.length>0);

  const onSeleccionarArchivo = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorArchivo(""); setResultado(null); setNombreArchivo(file.name);
    try {
      const json = await parseArchivoAdmin(file);
      const procesadas = json.map(fila => {
        const mapeada = mapearFilaAdmin(fila);
        return { ...mapeada, errores: validarFilaAdmin(mapeada) };
      });
      setFilas(procesadas);
    } catch (err) {
      setErrorArchivo("No se pudo leer el archivo. Verifica que sea un .csv o .xlsx válido.");
      setFilas([]);
    }
    e.target.value = "";
  };

  const confirmarCarga = async () => {
    if (!empresaId) { toast("Selecciona a qué empresa pertenecen estos pedidos","error"); return; }
    if (validas.length===0) return;
    setProcesando(true);
    const generados = [];
    const loteId = repartidorId ? crypto.randomUUID() : null;
    try {
      for (let i=0; i<validas.length; i++) {
        const fila = validas[i];
        setProgreso(`Ubicando dirección ${i+1} de ${validas.length}...`);
        try {
          const { data: codigo, error: errCodigo } = await sb.rpc("generar_codigo_boaz");
          if (errCodigo || !codigo) { generados.push({ ...fila, ok:false, error:"no se pudo generar código: "+(errCodigo?.message||"sin detalle") }); continue; }
          const coords = await geocodificarDireccion(fila.dest_direccion, fila.dest_distrito);
          const tarifaPersonalizada = obtenerTarifaEmpresa(empresaId, fila.ambito, fila.tipo_servicio, tarifariosCliente)
            || obtenerTarifaEstandar(fila.ambito, fila.tipo_servicio, tarifarioEstandar);
          const tarifa = getTarifaSameDay(fila.ambito, fila.peso_kg, tarifaPersonalizada);
          const { error: errInsert } = await sb.from("pedidos").insert({
            omd: codigo,
            empresa_id: empresaId,
            repartidor_id: repartidorId || null,
            lote_id: loteId,
            cliente_referencia: fila.cliente_referencia || null,
            dest_nombre: fila.dest_nombre,
            dest_telefono: fila.dest_telefono || null,
            dest_direccion: fila.dest_direccion,
            dest_referencia: fila.dest_referencia || null,
            dest_distrito: fila.dest_distrito,
            ambito: fila.ambito,
            peso_kg: fila.peso_kg || null,
            tarifa_s: tarifa,
            tipo_servicio: fila.tipo_servicio || null,
            cobro_destino: !!fila.cobro_destino,
            monto_cobrar: fila.cobro_destino ? (fila.monto_cobrar || null) : null,
            estado: repartidorId ? "asignado" : "sin_asignar",
            fecha_asignacion: repartidorId ? new Date().toISOString() : null,
            dest_lat: coords?.lat||null, dest_lng: coords?.lng||null,
          });
          if (errInsert) generados.push({ ...fila, ok:false, error:errInsert.message });
          else generados.push({ ...fila, ok:true, codigo, ubicado: !!coords });
          await esperar(1100); // respeta el límite de 1 solicitud/segundo del geocodificador gratuito
        } catch (filaErr) {
          generados.push({ ...fila, ok:false, error: filaErr.message || "error inesperado en esta fila" });
        }
      }
    } catch (err) {
      toast("Error inesperado durante la carga: "+err.message,"error");
    }
    setProgreso("");
    setProcesando(false);
    setResultado(generados);
    setFilas([]);
    const okCount = generados.filter(g=>g.ok).length;
    if (okCount > 0) toast(`${okCount} pedido${okCount===1?"":"s"} creado${okCount===1?"":"s"} ✓`);
    else if (generados.length > 0) toast("No se pudo crear ningún pedido — revisa el detalle abajo","error");
    onSaved();
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"#0008", zIndex:1000,
      display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ background:B.white, borderRadius:16, padding:28, width:820,
        maxHeight:"90vh", overflowY:"auto", boxShadow:"0 20px 60px #0003" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
          <div style={{ fontSize:16, fontWeight:800, color:B.navy }}>Cargar pedidos desde CSV o Excel</div>
          <button onClick={onClose} style={{ background:"none", border:"none", fontSize:20,
            color:B.textSec, cursor:"pointer" }}>✕</button>
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:16 }}>
          <div>
            <label style={lbl}>Cliente (empresa) *</label>
            <select style={inp} value={empresaId} onChange={e=>setEmpresaId(e.target.value)}>
              <option value="">— Selecciona —</option>
              {empresas.map(e=><option key={e.id} value={e.id}>{e.codigo_interno ? `${e.codigo_interno} — ` : ""}{e.nombre}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Asignar a repartidor (opcional)</label>
            <select style={inp} value={repartidorId} onChange={e=>setRepartidorId(e.target.value)}>
              <option value="">— Sin asignar —</option>
              {repartidores.filter(r=>r.activo).map(r=><option key={r.id} value={r.id}>{r.nombres} {r.apellidos}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginBottom:16 }}>
          <BtnSec onClick={descargarPlantillaAdmin}>📥 Descargar plantilla</BtnSec>
          <label style={{ background:`linear-gradient(135deg,${B.gold},${B.goldDk})`, color:B.navy,
            padding:"9px 18px", borderRadius:8, fontSize:13, fontWeight:800, cursor:"pointer",
            display:"inline-flex", alignItems:"center", gap:6 }}>
            📤 Seleccionar archivo (.csv, .xlsx)
            <input type="file" accept=".csv,.xlsx,.xls" onChange={onSeleccionarArchivo} style={{ display:"none" }}/>
          </label>
          {nombreArchivo && <div style={{ fontSize:12, color:B.textMut, alignSelf:"center" }}>{nombreArchivo}</div>}
        </div>

        {errorArchivo && (
          <div style={{ marginBottom:14, background:"#FEF2F2", border:"1px solid #FECACA", borderRadius:8,
            padding:"10px 14px", color:B.red, fontSize:12 }}>{errorArchivo}</div>
        )}

        {filas.length > 0 && !empresaId && (
          <div style={{ marginBottom:14, background:"#FFFBEB", border:"1px solid #FDE68A", borderRadius:8,
            padding:"10px 14px", color:"#92400E", fontSize:12, fontWeight:600 }}>
            ⚠️ Selecciona el cliente (empresa) arriba antes de confirmar — el botón no hace nada hasta que lo elijas.
          </div>
        )}

        {filas.length > 0 && (
          <div style={{ border:`1px solid ${B.border}`, borderRadius:10, overflow:"hidden", marginBottom:16 }}>
            <div style={{ padding:"12px 16px", borderBottom:`1px solid ${B.border}`, background:B.bg,
              display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div style={{ fontSize:12, fontWeight:700, color:B.navy }}>
                {validas.length} válida{validas.length===1?"":"s"}, {invalidas.length} con error{invalidas.length===1?"":"es"}
              </div>
              <BtnPri onClick={confirmarCarga} disabled={validas.length===0 || !empresaId || procesando}>
                {procesando ? (progreso||"Generando...") : `Confirmar y cargar ${validas.length}`}
              </BtnPri>
            </div>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
              <thead>
                <tr style={{ background:B.bg }}>
                  {["N° Orden","Destinatario","Distrito","Ámbito","Servicio","Estado"].map(h=>(
                    <th key={h} style={{ padding:"8px 10px", fontSize:10, fontWeight:700, color:B.textMut,
                      textTransform:"uppercase", borderBottom:`1px solid ${B.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filas.map((f,i)=>(
                  <tr key={i} style={{ borderBottom:"1px solid #F1F5F9",
                    background: f.errores.length>0 ? "#FEF2F2" : "transparent" }}>
                    <td style={{ padding:"8px 10px" }}>{f.cliente_referencia||"—"}</td>
                    <td style={{ padding:"8px 10px" }}>{f.dest_nombre||"—"}</td>
                    <td style={{ padding:"8px 10px" }}>{f.dest_distrito||"—"}</td>
                    <td style={{ padding:"8px 10px", textTransform:"capitalize" }}>{f.ambito?.replace("_"," ")}</td>
                    <td style={{ padding:"8px 10px" }}>{f.tipo_servicio||"—"}</td>
                    <td style={{ padding:"8px 10px" }}>
                      {f.errores.length===0
                        ? <span style={{ color:B.green, fontWeight:700 }}>✅ OK</span>
                        : <span style={{ color:B.red, fontWeight:700 }} title={f.errores.join(", ")}>❌ {f.errores[0]}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {resultado && (
          <div style={{ border:`1px solid ${B.border}`, borderRadius:10, padding:16 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
              <div style={{ fontSize:13, fontWeight:800, color:B.navy }}>
                {resultado.filter(r=>r.ok).length} pedido{resultado.filter(r=>r.ok).length===1?"":"s"} creado{resultado.filter(r=>r.ok).length===1?"":"s"}
              </div>
              {resultado.some(r=>r.ok) && (
                <BtnPri onClick={()=>setMostrarEtiquetas(true)} style={{ fontSize:12, padding:"7px 14px" }}>
                  🏷️ Generar etiquetas
                </BtnPri>
              )}
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:6, maxHeight:200, overflowY:"auto" }}>
              {resultado.map((r,i)=>(
                <div key={i} style={{ display:"flex", justifyContent:"space-between",
                  padding:"6px 10px", background:B.bg, borderRadius:6, fontSize:12 }}>
                  <span style={{ color:B.textSec }}>{r.cliente_referencia||"—"} · {r.dest_nombre}</span>
                  <span style={{ fontWeight:700, color: r.ok?B.green:B.red }}>
                    {r.ok ? `${r.ubicado?"📍 ":"⚠️ "}${r.codigo}` : `Error: ${r.error}`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {mostrarEtiquetas && resultado && (
          <ModalEtiquetas
            pedidos={resultado.filter(r=>r.ok).map(r => ({
              id: r.codigo,
              omd: r.codigo,
              dest_nombre: r.dest_nombre,
              dest_direccion: r.dest_direccion,
              dest_referencia: r.dest_referencia,
              dest_distrito: r.dest_distrito,
              tipo_servicio: r.tipo_servicio,
              cobro_destino: r.cobro_destino,
              monto_cobrar: r.monto_cobrar,
              cliente_referencia: r.cliente_referencia,
              ambito: r.ambito,
              empresa_id: empresaId,
              created_at: new Date().toISOString(),
            }))}
            empresas={empresas}
            onClose={()=>setMostrarEtiquetas(false)}
          />
        )}

        <div style={{ display:"flex", justifyContent:"flex-end", marginTop:20 }}>
          <BtnSec onClick={onClose}>Cerrar</BtnSec>
        </div>
      </div>
    </div>
  );
}

// Modal detalle pedido
function ModalDetallePedido({ pedido: p, repartidores, onClose, onRefresh, toast }) {
  const rep = repartidores.find(r=>r.id===p.repartidor_id);
  const [direccion, setDireccion] = useState(p.dest_direccion||"");
  const [distrito, setDistrito] = useState(p.dest_distrito||"");
  const [latManual, setLatManual] = useState(p.dest_lat||"");
  const [lngManual, setLngManual] = useState(p.dest_lng||"");
  const [ubicando, setUbicando] = useState(false);
  const historial = agruparHistorial(
    [...(p.historial||[])].sort((a,b)=> new Date(b.timestamp) - new Date(a.timestamp))
  );
  const todasLasFotos = historial.filter(h=>h.esFotoGrupo).flatMap(h=>h.urls);
  const [fotoAbierta, setFotoAbierta] = useState(null);
  const timeline = [
    { label:"Creado", fecha: p.created_at, ok: true },
    { label:"Asignado", fecha: p.fecha_asignacion, ok: !!p.fecha_asignacion },
    { label:"En ruta", fecha: p.fecha_asignacion, ok: ["en_ruta","entregado","no_entregado"].includes(p.estado) },
  ];

  const reintentarUbicacion = async () => {
    setUbicando(true);
    // Si cambió la dirección o distrito, los guarda primero
    if (direccion !== p.dest_direccion || distrito !== p.dest_distrito) {
      await sb.from("pedidos").update({ dest_direccion: direccion, dest_distrito: distrito }).eq("id", p.id);
    }
    const coords = await geocodificarDireccion(direccion, distrito);
    setUbicando(false);
    if (coords) {
      await sb.from("pedidos").update({ dest_lat: coords.lat, dest_lng: coords.lng }).eq("id", p.id);
      setLatManual(coords.lat); setLngManual(coords.lng);
      toast("Ubicación encontrada ✓");
      onRefresh();
    } else {
      toast("No se encontró la ubicación con esa dirección. Intenta ajustarla o ingresa las coordenadas manualmente.","error");
    }
  };

  const guardarManual = async () => {
    const lat = parseFloat(latManual), lng = parseFloat(lngManual);
    if (isNaN(lat) || isNaN(lng)) { toast("Ingresa latitud y longitud válidas","error"); return; }
    const { error } = await sb.from("pedidos").update({ dest_lat: lat, dest_lng: lng }).eq("id", p.id);
    if (error) { toast("Error: "+error.message,"error"); return; }
    toast("Coordenadas guardadas ✓");
    onRefresh();
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"#0008", zIndex:1000,
      display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ background:B.white, borderRadius:16, padding:28, width:580,
        maxHeight:"90vh", overflowY:"auto", boxShadow:"0 20px 60px #0003" }}>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:20 }}>
          <div>
            <div style={{ fontSize:20, fontWeight:800, color:B.navy }}>{p.omd}</div>
            <div style={{ marginTop:4 }}><Chip estado={p.estado} size="lg"/></div>
          </div>
          <button onClick={onClose} style={{ background:"none", border:"none", fontSize:20,
            color:B.textSec, cursor:"pointer" }}>✕</button>
        </div>

        {/* Timeline */}
        <div style={{ display:"flex", gap:0, marginBottom:14 }}>
          {timeline.map((t,i) => (
            <div key={i} style={{ flex:1, textAlign:"center", position:"relative" }}>
              <div style={{ width:28, height:28, borderRadius:"50%", margin:"0 auto 6px",
                background: t.ok?B.gold:B.bg, border:`2px solid ${t.ok?B.gold:B.border}`,
                display:"flex", alignItems:"center", justifyContent:"center",
                fontSize:12, color: t.ok?B.navy:B.textMut, fontWeight:700, zIndex:1, position:"relative" }}>
                {t.ok?"✓":i+1}
              </div>
              {i<timeline.length-1&&<div style={{ position:"absolute", top:14, left:"50%", width:"100%",
                height:2, background: t.ok?B.gold:B.border, zIndex:0 }}/>}
              <div style={{ fontSize:10, color: t.ok?B.navy:B.textMut, fontWeight: t.ok?700:400 }}>{t.label}</div>
              <div style={{ fontSize:9, color:B.textMut }}>{fmt.fecha(t.fecha)}</div>
            </div>
          ))}
        </div>

        {/* Subestado final: solo se muestra el que realmente ocurrió */}
        {(p.estado==="entregado" || p.estado==="no_entregado") && (
          <div style={{ marginBottom:24 }}>
            {p.estado==="entregado" ? (
              <div style={{ borderRadius:10, padding:"10px 14px", background:"#ECFDF5",
                border:`1.5px solid ${B.green}` }}>
                <div style={{ fontSize:11, fontWeight:700, color:B.green }}>
                  ✅ Entregado {p.recibido_por && `— a ${p.recibido_por}`}
                </div>
                <div style={{ fontSize:9, color:B.textMut, marginTop:2 }}>{fmt.fecha(p.fecha_entrega)}</div>
                {p.comentario_entrega && <div style={{ fontSize:10, color:"#065F46", marginTop:4, fontStyle:"italic" }}>{p.comentario_entrega}</div>}
              </div>
            ) : (
              <div style={{ borderRadius:10, padding:"10px 14px", background:"#FEF2F2",
                border:`1.5px solid ${B.red}` }}>
                <div style={{ fontSize:11, fontWeight:700, color:B.red }}>
                  ⚠️ No entregado {p.motivo_no_entrega && `— ${p.motivo_no_entrega}`}
                </div>
                <div style={{ fontSize:9, color:B.textMut, marginTop:2 }}>{fmt.fecha(p.fecha_entrega)}</div>
                {p.comentario_no_entrega && <div style={{ fontSize:10, color:"#991B1B", marginTop:4, fontStyle:"italic" }}>{p.comentario_no_entrega}</div>}
              </div>
            )}
          </div>
        )}

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:B.navy, textTransform:"uppercase",
              letterSpacing:"0.8px", marginBottom:10, paddingBottom:6, borderBottom:`1px solid ${B.border}` }}>Destinatario</div>
            {[["Nombre",p.dest_nombre],["Teléfono",p.dest_telefono],["Dirección",p.dest_direccion],
              ["Distrito",p.dest_distrito],["Referencia",p.dest_referencia||"—"]].map(([k,v])=>(
              <div key={k} style={{ marginBottom:8 }}>
                <div style={{ fontSize:10, color:B.textMut }}>{k}</div>
                <div style={{ fontSize:13, color:B.textPri, fontWeight:500 }}>{v||"—"}</div>
              </div>
            ))}
          </div>
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:B.navy, textTransform:"uppercase",
              letterSpacing:"0.8px", marginBottom:10, paddingBottom:6, borderBottom:`1px solid ${B.border}` }}>Detalles</div>
            {[["N° Orden",p.cliente_referencia||"—"],["Peso",p.peso_kg?p.peso_kg+" kg":"—"],["Tarifa",fmt.sol(p.tarifa_s)],
              ["Ámbito",p.ambito?.replace("_"," ")||"—"],["Repartidor",rep?`${rep.nombres} ${rep.apellidos}`:"Sin asignar"],
              ["Cobro destino",p.cobro_destino?fmt.sol(p.monto_cobrar):"No"],
              ["Fecha prog.",fmt.fecha(p.fecha_programada)]].map(([k,v])=>(
              <div key={k} style={{ marginBottom:8 }}>
                <div style={{ fontSize:10, color:B.textMut }}>{k}</div>
                <div style={{ fontSize:13, color:B.textPri, fontWeight:500, textTransform:"capitalize" }}>{v||"—"}</div>
              </div>
            ))}
          </div>
        </div>
        {historial.length > 0 && (
          <div style={{ marginTop:16 }}>
            <div style={{ fontSize:11, fontWeight:700, color:B.navy, textTransform:"uppercase",
              letterSpacing:"0.8px", marginBottom:10 }}>🕒 Historial del pedido</div>
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {historial.map((h,i)=>(
                <div key={i} style={{ display:"flex", gap:10, alignItems:"flex-start",
                  borderBottom: i<historial.length-1 ? `1px solid ${B.border}` : "none",
                  paddingBottom:10 }}>
                  <span style={{ fontSize:15 }}>{ICONOS_HIST[h.tipo]||"•"}</span>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:12, fontWeight:600, color:B.textPri }}>
                      {h.tipo==="llamada" && "Llamada al destinatario"}
                      {h.tipo==="whatsapp" && "Mensaje de WhatsApp"}
                      {h.tipo==="estado" && h.detalle}
                      {h.esFotoGrupo && "Fotos de evidencia"}
                    </div>
                    <div style={{ fontSize:10, color:B.textMut }}>
                      {fmt.fechaHora(h.timestamp)}
                      {h.lat && ` · GPS ${h.lat.toFixed(4)}, ${h.lng.toFixed(4)}`}
                    </div>
                    {h.esFotoGrupo && (
                      <div style={{ display:"flex", gap:8, marginTop:6, flexWrap:"wrap" }}>
                        {h.urls.map((url,ui)=>(
                          <img key={ui} src={url} alt=""
                            onClick={()=>setFotoAbierta(todasLasFotos.indexOf(url))}
                            style={{ width:70, height:70, objectFit:"cover",
                            borderRadius:6, border:`1px solid ${B.border}`, cursor:"pointer" }}/>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ marginTop:16, background:B.bg, borderRadius:10, padding:16 }}>
          <div style={{ fontSize:11, fontWeight:700, color:B.navy, textTransform:"uppercase",
            letterSpacing:"0.8px", marginBottom:10 }}>📍 Ubicación en el mapa</div>
          <div style={{ fontSize:12, marginBottom:12,
            color: p.dest_lat ? B.green : B.red, fontWeight:600 }}>
            {p.dest_lat ? `✓ Ubicado (${parseFloat(p.dest_lat).toFixed(5)}, ${parseFloat(p.dest_lng).toFixed(5)})` : "⚠️ Sin coordenadas — no aparece en el mapa del repartidor"}
          </div>

          <label style={{ ...lbl, marginTop:0 }}>Dirección (ajústala si la ubicación está mal)</label>
          <input style={{ ...inp, marginBottom:8 }} value={direccion} onChange={e=>setDireccion(e.target.value)}/>
          <label style={lbl}>Distrito</label>
          <input style={{ ...inp, marginBottom:10 }} value={distrito} onChange={e=>setDistrito(e.target.value)}/>
          <button onClick={reintentarUbicacion} disabled={ubicando}
            style={{ width:"100%", background:`linear-gradient(135deg,${B.gold},${B.goldDk})`,
              border:"none", color:B.navy, padding:10, borderRadius:8,
              fontSize:12, fontWeight:800, cursor: ubicando?"default":"pointer", marginBottom:14 }}>
            {ubicando ? "Buscando ubicación..." : "🔄 Guardar dirección y reintentar ubicación"}
          </button>

          <div style={{ borderTop:`1px solid ${B.border}`, paddingTop:12 }}>
            <label style={lbl}>O ingresa las coordenadas manualmente (ej. copiadas de Google Maps)</label>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:8 }}>
              <input style={inp} placeholder="Latitud" value={latManual} onChange={e=>setLatManual(e.target.value)}/>
              <input style={inp} placeholder="Longitud" value={lngManual} onChange={e=>setLngManual(e.target.value)}/>
            </div>
            <BtnSec onClick={guardarManual} style={{ width:"100%" }}>Guardar coordenadas manuales</BtnSec>
          </div>
        </div>

        <div style={{ display:"flex", justifyContent:"flex-end", marginTop:20 }}>
          <BtnSec onClick={onClose}>Cerrar</BtnSec>
        </div>
      </div>

      {fotoAbierta !== null && (
        <div onClick={()=>setFotoAbierta(null)}
          style={{ position:"fixed", inset:0, background:"#000000EE", zIndex:2000,
            display:"flex", alignItems:"center", justifyContent:"center" }}>
          <button onClick={()=>setFotoAbierta(null)}
            style={{ position:"absolute", top:16, right:16, background:"none", border:"none",
              color:"#fff", fontSize:28, cursor:"pointer", zIndex:1 }}>✕</button>

          <div style={{ position:"absolute", top:16, left:0, right:0, textAlign:"center",
            color:"#fff", fontSize:13, fontWeight:600 }}>
            {fotoAbierta+1} / {todasLasFotos.length}
          </div>

          {fotoAbierta > 0 && (
            <button onClick={(e)=>{ e.stopPropagation(); setFotoAbierta(f=>f-1); }}
              style={{ position:"absolute", left:8, top:"50%", transform:"translateY(-50%)",
                background:"#FFFFFF22", border:"none", color:"#fff", fontSize:26,
                width:44, height:44, borderRadius:"50%", cursor:"pointer" }}>‹</button>
          )}
          {fotoAbierta < todasLasFotos.length-1 && (
            <button onClick={(e)=>{ e.stopPropagation(); setFotoAbierta(f=>f+1); }}
              style={{ position:"absolute", right:8, top:"50%", transform:"translateY(-50%)",
                background:"#FFFFFF22", border:"none", color:"#fff", fontSize:26,
                width:44, height:44, borderRadius:"50%", cursor:"pointer" }}>›</button>
          )}

          <img src={todasLasFotos[fotoAbierta]} alt=""
            onClick={e=>e.stopPropagation()}
            style={{ maxWidth:"90%", maxHeight:"80%", objectFit:"contain", borderRadius:8 }}/>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// MÓDULO 3: REPARTIDORES
// ══════════════════════════════════════════════════════════════
function Repartidores({ repartidores, pedidos, onRefresh, toast }) {
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState(null);
  const [vista, setVista] = useState("cards");
  const emptyForm = { nombres:"", apellidos:"", dni:"", telefono:"",
    email:"", vehiculo:"moto", placa:"", zona_default:"urbano", usuario:"", password_hash:"" };
  const [f, setF] = useState(emptyForm);

  const guardar = async () => {
    if (!f.nombres || !f.dni) { toast("Nombre y DNI son obligatorios","error"); return; }
    const payload = { ...f, email: f.email?.trim() ? f.email.trim() : null,
      usuario: f.usuario?.trim() ? f.usuario.trim().toLowerCase() : null,
      password_hash: f.password_hash?.trim() ? f.password_hash.trim() : null,
      activo:true };
    let error;
    if (editando) {
      ({ error } = await sb.from("repartidores").update(payload).eq("id", editando.id));
    } else {
      ({ error } = await sb.from("repartidores").insert([payload]));
    }
    if (error) { toast("Error: "+error.message,"error"); return; }
    toast(editando?"Repartidor actualizado ✓":"Repartidor registrado ✓");
    setModal(false); setEditando(null); setF(emptyForm); onRefresh();
  };

  const toggle = async (r) => {
    await sb.from("repartidores").update({activo:!r.activo}).eq("id",r.id);
    toast(r.activo?"Repartidor desactivado":"Repartidor activado");
    onRefresh();
  };

  const abrirEditar = (r) => { setEditando(r); setF({...r}); setModal(true); };

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
        <div style={{ display:"flex", gap:6 }}>
          {["cards","tabla"].map(v=>(
            <button key={v} onClick={()=>setVista(v)}
              style={{ padding:"7px 14px", borderRadius:8, fontSize:12, cursor:"pointer",
                border:`1px solid ${vista===v?B.gold:B.border}`,
                background:vista===v?B.gold:"transparent",
                color:vista===v?B.navy:B.textSec, fontWeight:vista===v?700:400 }}>
              {v==="cards"?"🃏 Tarjetas":"📋 Tabla"}
            </button>
          ))}
        </div>
        <BtnPri onClick={()=>{setEditando(null);setF(emptyForm);setModal(true);}}>+ Nuevo repartidor</BtnPri>
      </div>

      {vista==="cards" ? (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(290px,1fr))", gap:14 }}>
          {repartidores.map(r => {
            const misP = pedidos.filter(p=>p.repartidor_id===r.id);
            const ent = misP.filter(p=>p.estado==="entregado").length;
            const ef = misP.length ? Math.round(ent/misP.length*100) : 0;
            return (
              <div key={r.id} style={{ background:B.white, border:`1px solid ${B.border}`,
                borderRadius:12, padding:20, opacity:r.activo?1:0.6,
                boxShadow:"0 2px 8px #0D1E3D0A",
                borderTop:`3px solid ${r.activo?B.gold:B.border}` }}>
                <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:16 }}>
                  <div style={{ width:48, height:48, borderRadius:"50%",
                    background:`linear-gradient(135deg,${B.navy},${B.navyLt})`,
                    display:"flex", alignItems:"center", justifyContent:"center",
                    fontSize:16, fontWeight:800, color:B.gold, flexShrink:0 }}>
                    {r.nombres?.[0]}{r.apellidos?.[0]}
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:14, fontWeight:800, color:B.navy }}>{r.nombres} {r.apellidos}</div>
                    <div style={{ fontSize:11, color:B.textMut }}>DNI: {r.dni}</div>
                  </div>
                  <span style={{ fontSize:10, padding:"3px 10px", borderRadius:20, fontWeight:700,
                    background:r.activo?"#ECFDF5":"#F3F4F6",
                    color:r.activo?B.green:B.textMut,
                    border:`1px solid ${r.activo?B.green+"44":B.border}` }}>
                    {r.activo?"Activo":"Inactivo"}
                  </span>
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:14 }}>
                  {[["📱",r.telefono||"—"],["🚗",r.vehiculo||"—"],
                    ["🔑",r.placa||"—"],["📍",r.zona_default?.replace("_"," ")||"—"]].map(([ic,v],i)=>(
                    <div key={i} style={{ fontSize:11, color:B.textSec }}>{ic} {v}</div>
                  ))}
                </div>
                <div style={{ background:B.bg, borderRadius:8, padding:10,
                  display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:14 }}>
                  {[["Pedidos",misP.length],["Entregados",ent],["Efectividad",ef+"%"]].map(([l,v])=>(
                    <div key={l} style={{ textAlign:"center" }}>
                      <div style={{ fontSize:18, fontWeight:800, color:B.gold }}>{v}</div>
                      <div style={{ fontSize:9, color:B.textMut, textTransform:"uppercase",
                        letterSpacing:"0.5px" }}>{l}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display:"flex", gap:6 }}>
                  <button onClick={()=>abrirEditar(r)} style={{ flex:1, background:B.bg,
                    border:`1px solid ${B.border}`, color:B.textSec, padding:"7px",
                    borderRadius:7, cursor:"pointer", fontSize:11 }}>✏️ Editar</button>
                  <button onClick={()=>toggle(r)} style={{ flex:1, background:"transparent",
                    border:`1px solid ${B.border}`, color:B.textSec, padding:"7px",
                    borderRadius:7, cursor:"pointer", fontSize:11 }}>
                    {r.activo?"Desactivar":"Activar"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ background:B.white, border:`1px solid ${B.border}`,
          borderRadius:12, overflow:"hidden", boxShadow:"0 2px 8px #0D1E3D0A" }}>
          <table style={{ width:"100%", borderCollapse:"collapse" }}>
            <thead>
              <tr style={{ background:B.bg }}>
                {["Nombre","DNI","Teléfono","Vehículo","Placa","Zona","Pedidos","Efectividad","Estado","Acciones"].map(h=>(
                  <th key={h} style={{ padding:"10px 14px", textAlign:"left", fontSize:10,
                    color:B.textMut, fontWeight:700, textTransform:"uppercase" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {repartidores.map((r,i) => {
                const misP = pedidos.filter(p=>p.repartidor_id===r.id);
                const ent = misP.filter(p=>p.estado==="entregado").length;
                return (
                  <tr key={r.id} style={{ borderTop:`1px solid ${B.border}`,
                    background:i%2===0?B.white:"#F8FAFC" }}>
                    <td style={{ padding:"11px 14px" }}>
                      <div style={{ fontSize:12, fontWeight:700, color:B.navy }}>{r.nombres} {r.apellidos}</div>
                      <div style={{ fontSize:10, color:B.textMut }}>{r.email||""}</div>
                    </td>
                    <td style={{ padding:"11px 14px", fontSize:12, color:B.textSec }}>{r.dni}</td>
                    <td style={{ padding:"11px 14px", fontSize:12, color:B.textSec }}>{r.telefono||"—"}</td>
                    <td style={{ padding:"11px 14px", fontSize:12, color:B.textSec, textTransform:"capitalize" }}>{r.vehiculo||"—"}</td>
                    <td style={{ padding:"11px 14px", fontSize:12, color:B.textSec }}>{r.placa||"—"}</td>
                    <td style={{ padding:"11px 14px", fontSize:11, color:B.textSec, textTransform:"capitalize" }}>{r.zona_default?.replace("_"," ")||"—"}</td>
                    <td style={{ padding:"11px 14px", fontSize:12, fontWeight:700, color:B.navy }}>{misP.length}</td>
                    <td style={{ padding:"11px 14px", fontSize:12, color:B.green, fontWeight:700 }}>
                      {misP.length?Math.round(ent/misP.length*100)+"%" :"—"}
                    </td>
                    <td style={{ padding:"11px 14px" }}>
                      <span style={{ fontSize:10, padding:"3px 8px", borderRadius:10, fontWeight:700,
                        background:r.activo?"#ECFDF5":"#F3F4F6",
                        color:r.activo?B.green:B.textMut }}>
                        {r.activo?"Activo":"Inactivo"}
                      </span>
                    </td>
                    <td style={{ padding:"11px 14px" }}>
                      <div style={{ display:"flex", gap:6 }}>
                        <button onClick={()=>abrirEditar(r)} style={{ fontSize:11, color:B.blue,
                          background:"none", border:"none", cursor:"pointer" }}>Editar</button>
                        <button onClick={()=>toggle(r)} style={{ fontSize:11, color:B.textMut,
                          background:"none", border:"none", cursor:"pointer" }}>{r.activo?"Desactivar":"Activar"}</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <div style={{ position:"fixed", inset:0, background:"#0008", zIndex:1000,
          display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div style={{ background:B.white, borderRadius:16, padding:28, width:520,
            boxShadow:"0 20px 60px #0003" }}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:20 }}>
              <div style={{ fontSize:15, fontWeight:800, color:B.navy }}>
                {editando?"Editar repartidor":"Nuevo repartidor"}
              </div>
              <button onClick={()=>setModal(false)} style={{ background:"none", border:"none",
                fontSize:18, color:B.textSec, cursor:"pointer" }}>✕</button>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
              {[["Nombres","nombres"],["Apellidos","apellidos"],["DNI","dni"],
                ["Teléfono","telefono"],["Email","email"],["Placa","placa"]].map(([l,k])=>(
                <div key={k}><label style={lbl}>{l}</label>
                  <input style={inp} value={f[k]||""} onChange={e=>setF(p=>({...p,[k]:e.target.value}))}/></div>
              ))}
              <div><label style={lbl}>Vehículo</label>
                <select style={inp} value={f.vehiculo} onChange={e=>setF(p=>({...p,vehiculo:e.target.value}))}>
                  <option value="moto">Moto</option>
                  <option value="bicicleta">Bicicleta</option>
                  <option value="auto">Auto</option>
                  <option value="furgoneta">Furgoneta</option>
                  <option value="minivan">Minivan</option>
                  <option value="van">Van</option>
                  <option value="porter">Porter</option>
                </select>
              </div>
              <div><label style={lbl}>Zona default</label>
                <select style={inp} value={f.zona_default} onChange={e=>setF(p=>({...p,zona_default:e.target.value}))}>
                  <option value="todas">Todas</option>
                  <option value="urbano">Urbano</option>
                  <option value="semi_urbano">Semi Urbano</option>
                  <option value="periferico">Periférico</option>
                </select>
              </div>
            </div>

            <div style={{ marginTop:16, padding:"12px 14px", background:B.bg, borderRadius:10 }}>
              <div style={{ fontSize:11, fontWeight:700, color:B.navy, textTransform:"uppercase",
                letterSpacing:"0.7px", marginBottom:10 }}>📱 Acceso a la app (/app)</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                <div><label style={lbl}>Usuario</label>
                  <input style={inp} value={f.usuario||""} placeholder="ej. lmamani"
                    onChange={e=>setF(p=>({...p,usuario:e.target.value.trim().toLowerCase()}))}/></div>
                <div><label style={lbl}>PIN de acceso</label>
                  <input style={inp} value={f.password_hash||""} placeholder="ej. últimos 4 del DNI"
                    onChange={e=>setF(p=>({...p,password_hash:e.target.value.trim()}))}/></div>
              </div>
              <div style={{ fontSize:10, color:B.textMut, marginTop:8 }}>
                Con estos dos datos el repartidor inicia sesión en la app móvil. Déjalos vacíos si aún no debe tener acceso.
              </div>
            </div>
            <div style={{ display:"flex", gap:10, marginTop:20, justifyContent:"flex-end" }}>
              <BtnSec onClick={()=>setModal(false)}>Cancelar</BtnSec>
              <BtnPri onClick={guardar}>{editando?"Guardar cambios":"Registrar"}</BtnPri>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// MÓDULO 4: CLIENTES / EMPRESAS
// ══════════════════════════════════════════════════════════════
function Clientes({ empresas, pedidos, lineasNegocio, tarifariosCliente, tarifarioVehiculoCliente, tarifarioEstandar, tarifarioVehiculoEstandar, onRefresh, toast }) {
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState(null);
  const [modalTarifario, setModalTarifario] = useState(null); // guarda la empresa seleccionada
  const [modalTarifarioVehiculo, setModalTarifarioVehiculo] = useState(null);
  const empty = { nombre:"", ruc:"", contacto:"", telefono:"", email:"", direccion:"", puede_generar_etiquetas:false, puede_ver_liquidacion:false, linea_negocio_id:"" };
  const [f, setF] = useState(empty);

  const guardar = async () => {
    if (!f.nombre) { toast("El nombre es obligatorio","error"); return; }
    let error;
    if (editando) {
      ({ error } = await sb.from("empresas").update(f).eq("id",editando.id));
    } else {
      ({ error } = await sb.from("empresas").insert([{...f,activo:true}]));
    }
    if (error) { toast("Error: "+error.message,"error"); return; }
    toast(editando?"Cliente actualizado ✓":"Cliente registrado ✓");
    setModal(false); setEditando(null); setF(empty); onRefresh();
  };

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:16 }}>
        <BtnPri onClick={()=>{setEditando(null);setF(empty);setModal(true);}}>+ Nueva empresa</BtnPri>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(320px,1fr))", gap:14 }}>
        {empresas.map(e => {
          const misP = pedidos.filter(p=>p.empresa_id===e.id);
          const ingreso = misP.reduce((a,p)=>a+(parseFloat(p.tarifa_s)||0),0);
          return (
            <div key={e.id} style={{ background:B.white, border:`1px solid ${B.border}`,
              borderRadius:12, padding:20, boxShadow:"0 2px 8px #0D1E3D0A",
              borderLeft:`4px solid ${B.gold}` }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:14 }}>
                <div>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <div style={{ fontSize:15, fontWeight:800, color:B.navy }}>{e.nombre}</div>
                    {e.codigo_interno && (
                      <span style={{ fontSize:10, fontWeight:800, color:B.gold, background:`${B.gold}18`,
                        padding:"2px 8px", borderRadius:8, border:`1px solid ${B.gold}44` }}>{e.codigo_interno}</span>
                    )}
                  </div>
                  <div style={{ fontSize:11, color:B.textMut }}>RUC: {e.ruc||"—"}</div>
                  {e.linea_negocio_id && (
                    <div style={{ marginTop:4 }}>
                      <span style={{ fontSize:10, fontWeight:700, color:B.navy, background:`${B.navy}10`,
                        padding:"2px 8px", borderRadius:8 }}>
                        {(lineasNegocio.find(ln=>ln.id===e.linea_negocio_id)||{}).codigo} — {(lineasNegocio.find(ln=>ln.id===e.linea_negocio_id)||{}).nombre}
                      </span>
                    </div>
                  )}
                </div>
                <button onClick={()=>{setEditando(e);setF({...e});setModal(true);}}
                  style={{ fontSize:11, color:B.blue, background:"none", border:"none", cursor:"pointer" }}>✏️ Editar</button>
              </div>
              <div style={{ display:"flex", gap:8, marginBottom:12, flexWrap:"wrap" }}>
                {(() => {
                  const tarifasPedido = tarifariosCliente.filter(t=>t.empresa_id===e.id);
                  const activosPedido = tarifasPedido.filter(t=>t.activo).length;
                  const tarifasVehiculo = tarifarioVehiculoCliente.filter(t=>t.empresa_id===e.id);
                  const activosVehiculo = tarifasVehiculo.filter(t=>t.activo).length;
                  return (
                    <>
                      <button onClick={()=>setModalTarifario(e)}
                        style={{ fontSize:10, fontWeight:700, padding:"4px 10px", borderRadius:20, cursor:"pointer",
                          border:`1px solid ${activosPedido>0?B.green:B.border}`,
                          background: activosPedido>0?"#ECFDF5":B.bg,
                          color: activosPedido>0?B.green:B.textSec }}>
                        💰 {activosPedido>0 ? `${activosPedido} tarifa${activosPedido===1?"":"s"} activa${activosPedido===1?"":"s"}` : "Sin tarifario por pedido"}
                      </button>
                      <button onClick={()=>setModalTarifarioVehiculo(e)}
                        style={{ fontSize:10, fontWeight:700, padding:"4px 10px", borderRadius:20, cursor:"pointer",
                          border:`1px solid ${activosVehiculo>0?B.green:B.border}`,
                          background: activosVehiculo>0?"#ECFDF5":B.bg,
                          color: activosVehiculo>0?B.green:B.textSec }}>
                        🚛 {activosVehiculo>0 ? `${activosVehiculo} vehículo${activosVehiculo===1?"":"s"} activo${activosVehiculo===1?"":"s"}` : "Sin tarifario por vehículo"}
                      </button>
                    </>
                  );
                })()}
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:14 }}>
                {[["👤",e.contacto||"—"],["📱",e.telefono||"—"],
                  ["✉️",e.email||"—"],["📍",e.direccion||"—"]].map(([ic,v],i)=>(
                  <div key={i} style={{ fontSize:11, color:B.textSec, overflow:"hidden",
                    textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{ic} {v}</div>
                ))}
              </div>
              <div style={{ fontSize:11, marginBottom:10,
                color: e.puede_generar_etiquetas ? B.green : B.textMut }}>
                {e.puede_generar_etiquetas ? "🏷️ Puede generar etiquetas" : "🏷️ Etiquetas deshabilitadas"}
                {" · "}
                <span style={{ color: e.puede_ver_liquidacion ? B.green : B.textMut }}>
                  {e.puede_ver_liquidacion ? "📄 Puede generar liquidación" : "📄 Liquidación deshabilitada"}
                </span>
              </div>
              <div style={{ background:B.bg, borderRadius:8, padding:10,
                display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                <div style={{ textAlign:"center" }}>
                  <div style={{ fontSize:20, fontWeight:800, color:B.gold }}>{misP.length}</div>
                  <div style={{ fontSize:9, color:B.textMut, textTransform:"uppercase" }}>Pedidos</div>
                </div>
                <div style={{ textAlign:"center" }}>
                  <div style={{ fontSize:16, fontWeight:800, color:B.navy }}>{fmt.sol(ingreso)}</div>
                  <div style={{ fontSize:9, color:B.textMut, textTransform:"uppercase" }}>Ingresos</div>
                </div>
              </div>
            </div>
          );
        })}
        {empresas.length===0&&(
          <div style={{ gridColumn:"1/-1", padding:40, textAlign:"center",
            color:B.textMut, fontSize:13 }}>No hay empresas registradas</div>
        )}
      </div>

      {modal && (
        <div style={{ position:"fixed", inset:0, background:"#0008", zIndex:1000,
          display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div style={{ background:B.white, borderRadius:16, padding:28, width:500,
            boxShadow:"0 20px 60px #0003" }}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:20 }}>
              <div style={{ fontSize:15, fontWeight:800, color:B.navy }}>
                {editando?"Editar empresa":"Nueva empresa cliente"}
              </div>
              <button onClick={()=>setModal(false)} style={{ background:"none", border:"none",
                fontSize:18, color:B.textSec, cursor:"pointer" }}>✕</button>
            </div>
            {editando?.codigo_interno && (
              <div style={{ marginBottom:14, fontSize:12, color:B.textSec }}>
                Código interno: <strong style={{ color:B.gold }}>{editando.codigo_interno}</strong> (se asigna automáticamente y no se puede editar)
              </div>
            )}
            {!editando && (
              <div style={{ marginBottom:14, fontSize:12, color:B.textMut, fontStyle:"italic" }}>
                El código interno (ej. CLI-004) se asignará automáticamente al guardar.
              </div>
            )}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
              {[["Razón social","nombre"],["RUC","ruc"],["Contacto","contacto"],
                ["Teléfono","telefono"],["Email","email"],["Dirección","direccion"]].map(([l,k])=>(
                <div key={k} style={{ gridColumn: k==="direccion"?"span 2":"auto" }}>
                  <label style={lbl}>{l}</label>
                  <input style={inp} value={f[k]||""} onChange={e=>setF(p=>({...p,[k]:e.target.value}))}/>
                </div>
              ))}
              <div style={{ gridColumn:"span 2" }}>
                <label style={lbl}>Línea de negocio</label>
                <select style={inp} value={f.linea_negocio_id||""} onChange={e=>setF(p=>({...p,linea_negocio_id:e.target.value||null}))}>
                  <option value="">— Sin clasificar —</option>
                  {lineasNegocio.map(ln=><option key={ln.id} value={ln.id}>{ln.codigo} — {ln.nombre}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:16,
              padding:"10px 12px", background:B.bg, borderRadius:8 }}>
              <input type="checkbox" id="etiquetas" checked={!!f.puede_generar_etiquetas}
                onChange={e=>setF(p=>({...p,puede_generar_etiquetas:e.target.checked}))}
                style={{ width:16, height:16 }}/>
              <label htmlFor="etiquetas" style={{ fontSize:13, color:B.textPri, cursor:"pointer" }}>
                🏷️ Permitir que este cliente genere sus propias etiquetas en su portal
              </label>
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:10,
              padding:"10px 12px", background:B.bg, borderRadius:8 }}>
              <input type="checkbox" id="liquidacion" checked={!!f.puede_ver_liquidacion}
                onChange={e=>setF(p=>({...p,puede_ver_liquidacion:e.target.checked}))}
                style={{ width:16, height:16 }}/>
              <label htmlFor="liquidacion" style={{ fontSize:13, color:B.textPri, cursor:"pointer" }}>
                📄 Permitir que este cliente genere su propia Liquidación de Entregas en su portal
              </label>
            </div>
            <div style={{ display:"flex", gap:10, marginTop:20, justifyContent:"flex-end" }}>
              <BtnSec onClick={()=>setModal(false)}>Cancelar</BtnSec>
              <BtnPri onClick={guardar}>{editando?"Guardar cambios":"Registrar"}</BtnPri>
            </div>
          </div>
        </div>
      )}
      {modalTarifario && (
        <ModalTarifarioCliente empresa={modalTarifario} tarifariosCliente={tarifariosCliente} tarifarioEstandar={tarifarioEstandar}
          onClose={()=>setModalTarifario(null)} onSaved={()=>{onRefresh();}} toast={toast}/>
      )}
      {modalTarifarioVehiculo && (
        <ModalTarifarioVehiculo empresa={modalTarifarioVehiculo} tarifarioVehiculoCliente={tarifarioVehiculoCliente} tarifarioVehiculoEstandar={tarifarioVehiculoEstandar}
          onClose={()=>setModalTarifarioVehiculo(null)} onSaved={()=>{onRefresh();}} toast={toast}/>
      )}
    </div>
  );
}

function ModalTarifarioCliente({ empresa, tarifariosCliente, tarifarioEstandar, onClose, onSaved, toast }) {
  const AMBITOS = [
    { id:"urbano", label:"Urbano" },
    { id:"semi_urbano", label:"Semi Urbano" },
    { id:"periferico", label:"Periférico" },
  ];
  const SERVICIOS = [
    { id:"ambos", db:null, label:"Aplica a ambos" },
    { id:"same_day", db:"same_day", label:"Same Day" },
    { id:"next_day", db:"next_day", label:"Next Day" },
    { id:"especial", db:"especial", label:"Especial" },
  ];

  const construirInicial = () => {
    const base = {};
    SERVICIOS.forEach(s=>{
      base[s.id] = {};
      AMBITOS.forEach(a=>{
        const existente = tarifariosCliente.find(t=>t.empresa_id===empresa.id && t.ambito===a.id && t.tipo_servicio===s.db);
        base[s.id][a.id] = existente
          ? { xs:existente.tarifa_xs, s:existente.tarifa_s, m:existente.tarifa_m, extra:existente.extra_kg??1, activo:existente.activo }
          : { xs:"", s:"", m:"", extra:1, activo:true };
      });
    });
    return base;
  };

  const [servicioTab, setServicioTab] = useState("ambos");
  const [valores, setValores] = useState(construirInicial());
  const [guardando, setGuardando] = useState(false);

  const set = (ambito, campo, valor) => setValores(p=>({
    ...p, [servicioTab]: { ...p[servicioTab], [ambito]: { ...p[servicioTab][ambito], [campo]:valor } },
  }));

  const cargarDesdeEstandar = (ambitoId) => {
    const servicioDb = SERVICIOS.find(s=>s.id===servicioTab).db;
    const base = obtenerTarifaEstandar(ambitoId, servicioDb, tarifarioEstandar);
    if (!base) { toast("El tarifario estándar no tiene esta zona definida todavía","error"); return; }
    setValores(p=>({ ...p, [servicioTab]: { ...p[servicioTab], [ambitoId]: {
      xs: base.tarifa_xs, s: base.tarifa_s, m: base.tarifa_m, extra: base.extra_kg??1, activo:true,
    }}}));
  };

  // Habilita de una vez todo el tarifario estándar del tipo de servicio activo
  // (los 3 ámbitos juntos), en vez de traerlos uno por uno.
  const cargarTodoElServicioDesdeEstandar = () => {
    const servicioDb = SERVICIOS.find(s=>s.id===servicioTab).db;
    let algunoCargado = false;
    const nuevo = { ...valores[servicioTab] };
    AMBITOS.forEach(a=>{
      const base = obtenerTarifaEstandar(a.id, servicioDb, tarifarioEstandar);
      if (base) {
        nuevo[a.id] = { xs: base.tarifa_xs, s: base.tarifa_s, m: base.tarifa_m, extra: base.extra_kg??1, activo:true };
        algunoCargado = true;
      }
    });
    if (!algunoCargado) { toast("El tarifario estándar no tiene definido este tipo de servicio todavía","error"); return; }
    setValores(p=>({ ...p, [servicioTab]: nuevo }));
    toast("Tarifario cargado — revisa y guarda para confirmar");
  };

  const guardar = async () => {
    setGuardando(true);
    for (const s of SERVICIOS) {
      for (const a of AMBITOS) {
        const v = valores[s.id][a.id];
        const completo = v.xs!=="" && v.s!=="" && v.m!=="";
        if (!completo) continue; // sin personalizar, no se guarda (usa el genérico)
        await sb.from("tarifarios_cliente").upsert({
          empresa_id: empresa.id, ambito: a.id, tipo_servicio: s.db,
          tarifa_xs: parseFloat(v.xs), tarifa_s: parseFloat(v.s), tarifa_m: parseFloat(v.m),
          extra_kg: parseFloat(v.extra)||1, activo: v.activo,
        }, { onConflict: "empresa_id,ambito,tipo_servicio" });
      }
    }
    setGuardando(false);
    toast("Tarifario guardado ✓");
    onSaved();
    onClose();
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"#0008", zIndex:1000,
      display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ background:B.white, borderRadius:16, padding:28, width:600,
        maxHeight:"85vh", overflowY:"auto", boxShadow:"0 20px 60px #0003" }}>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
          <div style={{ fontSize:16, fontWeight:800, color:B.navy }}>💰 Tarifario por pedido — {empresa.nombre}</div>
          <button onClick={onClose} style={{ background:"none", border:"none", fontSize:20,
            color:B.textSec, cursor:"pointer" }}>✕</button>
        </div>
        <div style={{ fontSize:12, color:B.textMut, marginBottom:16 }}>
          Deja un ámbito en blanco para que ese cliente siga usando el tarifario genérico ahí. Si el cliente tiene tarifas distintas para Same Day y Next Day, configúralas en su propia pestaña — si no, usa "Aplica a ambos".
        </div>

        <div style={{ display:"flex", gap:6, marginBottom:10 }}>
          {SERVICIOS.map(s=>(
            <button key={s.id} onClick={()=>setServicioTab(s.id)}
              style={{ flex:1, padding:"8px 10px", borderRadius:8, fontSize:12, fontWeight:700, cursor:"pointer",
                border: servicioTab===s.id ? `2px solid ${B.gold}` : `1px solid ${B.border}`,
                background: servicioTab===s.id ? "#FFF7ED" : B.white,
                color: servicioTab===s.id ? B.goldDk : B.textSec }}>
              {s.label}
            </button>
          ))}
        </div>
        <button onClick={cargarTodoElServicioDesdeEstandar}
          style={{ width:"100%", marginBottom:16, padding:"9px 12px", borderRadius:8, fontSize:12,
            fontWeight:700, cursor:"pointer", border:`1px dashed ${B.blue}`, background:"#EFF6FF", color:B.blue }}>
          📋 Habilitar tarifario "{SERVICIOS.find(s=>s.id===servicioTab).label}" completo desde el estándar
        </button>

        {AMBITOS.map(a=>{
          const v = valores[servicioTab][a.id];
          const completo = v.xs!=="" && v.s!=="" && v.m!=="";
          return (
            <div key={a.id} style={{ border:`1px solid ${B.border}`, borderRadius:10, padding:14, marginBottom:12,
              background: completo && v.activo ? "#FFF8EF" : B.bg,
              opacity: completo && !v.activo ? 0.6 : 1 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                <div style={{ fontSize:13, fontWeight:700, color:B.navy }}>
                  {a.label} {completo && <span style={{ color: v.activo?B.green:B.textMut, fontSize:11 }}>· {v.activo?"activo":"inactivo"}</span>}
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                  <button onClick={()=>cargarDesdeEstandar(a.id)}
                    style={{ fontSize:11, color:B.blue, background:"none", border:"none", cursor:"pointer", fontWeight:600 }}>
                    📋 Cargar desde el estándar
                  </button>
                  {completo && (
                    <label style={{ display:"flex", alignItems:"center", gap:6, fontSize:11, color:B.textSec, cursor:"pointer" }}>
                      <input type="checkbox" checked={v.activo} onChange={e=>set(a.id,"activo",e.target.checked)}/>
                      Activo
                    </label>
                  )}
                </div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:8 }}>
                <div>
                  <label style={{ ...lbl, marginBottom:4 }}>XS (0-1kg)</label>
                  <input type="number" style={inp} value={v.xs} onChange={e=>set(a.id,"xs",e.target.value)}/>
                </div>
                <div>
                  <label style={{ ...lbl, marginBottom:4 }}>S (1-3kg)</label>
                  <input type="number" style={inp} value={v.s} onChange={e=>set(a.id,"s",e.target.value)}/>
                </div>
                <div>
                  <label style={{ ...lbl, marginBottom:4 }}>M (3-7kg)</label>
                  <input type="number" style={inp} value={v.m} onChange={e=>set(a.id,"m",e.target.value)}/>
                </div>
                <div>
                  <label style={{ ...lbl, marginBottom:4 }}>S/ x kg extra</label>
                  <input type="number" style={inp} value={v.extra} onChange={e=>set(a.id,"extra",e.target.value)}/>
                </div>
              </div>
            </div>
          );
        })}

        <div style={{ display:"flex", gap:10, justifyContent:"flex-end", marginTop:8 }}>
          <BtnSec onClick={onClose}>Cerrar</BtnSec>
          <BtnPri onClick={guardar} disabled={guardando}>{guardando?"Guardando...":"Guardar tarifario"}</BtnPri>
        </div>
      </div>
    </div>
  );
}

function ModalTarifarioEstandar({ tarifarioEstandar, onClose, onSaved, toast }) {
  const AMBITOS = [
    { id:"urbano", label:"Urbano" },
    { id:"semi_urbano", label:"Semi Urbano" },
    { id:"periferico", label:"Periférico" },
  ];
  const SERVICIOS = [
    { id:"ambos", db:null, label:"Aplica a ambos" },
    { id:"same_day", db:"same_day", label:"Same Day" },
    { id:"next_day", db:"next_day", label:"Next Day" },
    { id:"especial", db:"especial", label:"Especial" },
  ];

  const construirInicial = () => {
    const base = {};
    SERVICIOS.forEach(s=>{
      base[s.id] = {};
      AMBITOS.forEach(a=>{
        const existente = tarifarioEstandar.find(t=>t.ambito===a.id && t.tipo_servicio===s.db);
        base[s.id][a.id] = existente
          ? { xs:existente.tarifa_xs, s:existente.tarifa_s, m:existente.tarifa_m, extra:existente.extra_kg??1, activo:existente.activo }
          : { xs:"", s:"", m:"", extra:1, activo:true };
      });
    });
    return base;
  };

  const [servicioTab, setServicioTab] = useState("ambos");
  const [valores, setValores] = useState(construirInicial());
  const [guardando, setGuardando] = useState(false);

  const set = (ambito, campo, valor) => setValores(p=>({
    ...p, [servicioTab]: { ...p[servicioTab], [ambito]: { ...p[servicioTab][ambito], [campo]:valor } },
  }));

  const guardar = async () => {
    setGuardando(true);
    for (const s of SERVICIOS) {
      for (const a of AMBITOS) {
        const v = valores[s.id][a.id];
        if (v.xs==="" || v.s==="" || v.m==="") continue;
        await sb.from("tarifario_estandar").upsert({
          ambito: a.id, tipo_servicio: s.db,
          tarifa_xs: parseFloat(v.xs), tarifa_s: parseFloat(v.s), tarifa_m: parseFloat(v.m),
          extra_kg: parseFloat(v.extra)||1, activo: v.activo,
        }, { onConflict: "ambito,tipo_servicio" });
      }
    }
    setGuardando(false);
    toast("Tarifario estándar actualizado ✓");
    onSaved();
    onClose();
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"#0008", zIndex:1000,
      display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ background:B.white, borderRadius:16, padding:28, width:600,
        maxHeight:"85vh", overflowY:"auto", boxShadow:"0 20px 60px #0003" }}>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
          <div style={{ fontSize:16, fontWeight:800, color:B.navy }}>💰 Tarifario estándar (propuesta base)</div>
          <button onClick={onClose} style={{ background:"none", border:"none", fontSize:20,
            color:B.textSec, cursor:"pointer" }}>✕</button>
        </div>
        <div style={{ fontSize:12, color:B.textMut, marginBottom:16 }}>
          Este es el tarifario que se usa por defecto para cualquier cliente sin tarifa negociada propia, y también el que se puede "jalar" al configurar el tarifario de cada cliente.
        </div>

        <div style={{ display:"flex", gap:6, marginBottom:16 }}>
          {SERVICIOS.map(s=>(
            <button key={s.id} onClick={()=>setServicioTab(s.id)}
              style={{ flex:1, padding:"8px 10px", borderRadius:8, fontSize:12, fontWeight:700, cursor:"pointer",
                border: servicioTab===s.id ? `2px solid ${B.gold}` : `1px solid ${B.border}`,
                background: servicioTab===s.id ? "#FFF7ED" : B.white,
                color: servicioTab===s.id ? B.goldDk : B.textSec }}>
              {s.label}
            </button>
          ))}
        </div>

        {AMBITOS.map(a=>{
          const v = valores[servicioTab][a.id];
          const completo = v.xs!=="" && v.s!=="" && v.m!=="";
          return (
            <div key={a.id} style={{ border:`1px solid ${B.border}`, borderRadius:10, padding:14, marginBottom:12,
              background: completo && v.activo ? "#FFF8EF" : B.bg,
              opacity: completo && !v.activo ? 0.6 : 1 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                <div style={{ fontSize:13, fontWeight:700, color:B.navy }}>
                  {a.label} {completo && <span style={{ color: v.activo?B.green:B.textMut, fontSize:11 }}>· {v.activo?"activo":"inactivo"}</span>}
                </div>
                {completo && (
                  <label style={{ display:"flex", alignItems:"center", gap:6, fontSize:11, color:B.textSec, cursor:"pointer" }}>
                    <input type="checkbox" checked={v.activo} onChange={e=>set(a.id,"activo",e.target.checked)}/>
                    Activo
                  </label>
                )}
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:8 }}>
                <div>
                  <label style={{ ...lbl, marginBottom:4 }}>XS (0-1kg)</label>
                  <input type="number" style={inp} value={v.xs} onChange={e=>set(a.id,"xs",e.target.value)}/>
                </div>
                <div>
                  <label style={{ ...lbl, marginBottom:4 }}>S (1-3kg)</label>
                  <input type="number" style={inp} value={v.s} onChange={e=>set(a.id,"s",e.target.value)}/>
                </div>
                <div>
                  <label style={{ ...lbl, marginBottom:4 }}>M (3-7kg)</label>
                  <input type="number" style={inp} value={v.m} onChange={e=>set(a.id,"m",e.target.value)}/>
                </div>
                <div>
                  <label style={{ ...lbl, marginBottom:4 }}>S/ x kg extra</label>
                  <input type="number" style={inp} value={v.extra} onChange={e=>set(a.id,"extra",e.target.value)}/>
                </div>
              </div>
            </div>
          );
        })}

        <div style={{ display:"flex", gap:10, justifyContent:"flex-end", marginTop:8 }}>
          <BtnSec onClick={onClose}>Cerrar</BtnSec>
          <BtnPri onClick={guardar} disabled={guardando}>{guardando?"Guardando...":"Guardar tarifario estándar"}</BtnPri>
        </div>
      </div>
    </div>
  );
}

function ModalTarifarioVehiculoEstandar({ tarifarioVehiculoEstandar, onClose, onSaved, toast }) {
  const TIPOS_VEHICULO = ["moto","bicicleta","auto","furgoneta","minivan","van","porter"];

  const construirInicial = () => {
    const base = {};
    TIPOS_VEHICULO.forEach(tv=>{
      const existente = tarifarioVehiculoEstandar.find(t=>t.tipo_vehiculo===tv);
      base[tv] = existente
        ? { base:existente.tarifa_base, recargo:existente.recargo_periferico??0, activo:existente.activo }
        : { base:"", recargo:"", activo:true };
    });
    return base;
  };

  const [valores, setValores] = useState(construirInicial());
  const [guardando, setGuardando] = useState(false);

  const set = (tv, campo, valor) => setValores(p=>({ ...p, [tv]: { ...p[tv], [campo]:valor } }));

  const guardar = async () => {
    setGuardando(true);
    for (const tv of TIPOS_VEHICULO) {
      const v = valores[tv];
      if (v.base === "") continue;
      await sb.from("tarifario_vehiculo_estandar").upsert({
        tipo_vehiculo: tv,
        tarifa_base: parseFloat(v.base), recargo_periferico: parseFloat(v.recargo)||0,
        activo: v.activo,
      }, { onConflict: "tipo_vehiculo" });
    }
    setGuardando(false);
    toast("Tarifario estándar por unidad actualizado ✓");
    onSaved();
    onClose();
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"#0008", zIndex:1000,
      display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ background:B.white, borderRadius:16, padding:28, width:560,
        maxHeight:"85vh", overflowY:"auto", boxShadow:"0 20px 60px #0003" }}>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
          <div style={{ fontSize:16, fontWeight:800, color:B.navy }}>🚛 Tarifario estándar por unidad</div>
          <button onClick={onClose} style={{ background:"none", border:"none", fontSize:20,
            color:B.textSec, cursor:"pointer" }}>✕</button>
        </div>
        <div style={{ fontSize:12, color:B.textMut, marginBottom:16 }}>
          Propuesta base de tarifa por día según tipo de vehículo, para clientes de Transporte y Carga. Deja vacía la tarifa base de un vehículo si aún no aplica.
        </div>

        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {TIPOS_VEHICULO.map(tv=>{
            const v = valores[tv];
            const completo = v.base !== "";
            return (
              <div key={tv} style={{ border:`1px solid ${B.border}`, borderRadius:10, padding:14,
                background: completo && v.activo ? "#FFF8EF" : B.bg,
                opacity: completo && !v.activo ? 0.6 : 1 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:B.navy, textTransform:"capitalize" }}>
                    {tv} {completo && <span style={{ color: v.activo?B.green:B.textMut, fontSize:11 }}>· {v.activo?"activo":"inactivo"}</span>}
                  </div>
                  {completo && (
                    <label style={{ display:"flex", alignItems:"center", gap:6, fontSize:11, color:B.textSec, cursor:"pointer" }}>
                      <input type="checkbox" checked={v.activo} onChange={e=>set(tv,"activo",e.target.checked)}/>
                      Activo
                    </label>
                  )}
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                  <div>
                    <label style={{ ...lbl, marginBottom:4 }}>Tarifa base (S/ — urbano/semi urbano)</label>
                    <input type="number" style={inp} value={v.base} onChange={e=>set(tv,"base",e.target.value)}/>
                  </div>
                  <div>
                    <label style={{ ...lbl, marginBottom:4 }}>Recargo periférico (S/ adicional)</label>
                    <input type="number" style={inp} value={v.recargo} onChange={e=>set(tv,"recargo",e.target.value)}/>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ display:"flex", gap:10, justifyContent:"flex-end", marginTop:16 }}>
          <BtnSec onClick={onClose}>Cerrar</BtnSec>
          <BtnPri onClick={guardar} disabled={guardando}>{guardando?"Guardando...":"Guardar tarifario estándar"}</BtnPri>
        </div>
      </div>
    </div>
  );
}

function ModalTarifarioVehiculo({ empresa, tarifarioVehiculoCliente, tarifarioVehiculoEstandar, onClose, onSaved, toast }) {
  const TIPOS_VEHICULO = ["moto","bicicleta","auto","furgoneta","minivan","van","porter"];

  const construirInicial = () => {
    const base = {};
    TIPOS_VEHICULO.forEach(tv=>{
      const existente = tarifarioVehiculoCliente.find(t=>t.empresa_id===empresa.id && t.tipo_vehiculo===tv);
      base[tv] = existente
        ? { base:existente.tarifa_base, recargo:existente.recargo_periferico??0, activo:existente.activo }
        : { base:"", recargo:"", activo:true };
    });
    return base;
  };

  const [valores, setValores] = useState(construirInicial());
  const [guardando, setGuardando] = useState(false);

  const set = (tv, campo, valor) => setValores(p=>({ ...p, [tv]: { ...p[tv], [campo]:valor } }));

  const cargarDesdeEstandar = (tv) => {
    const base = tarifarioVehiculoEstandar.find(t=>t.tipo_vehiculo===tv && t.activo);
    if (!base) { toast("El tarifario estándar no tiene definido este vehículo todavía","error"); return; }
    setValores(p=>({ ...p, [tv]: { base: base.tarifa_base, recargo: base.recargo_periferico??0, activo:true } }));
  };

  const guardar = async () => {
    setGuardando(true);
    for (const tv of TIPOS_VEHICULO) {
      const v = valores[tv];
      if (v.base === "") continue; // sin tarifa definida, se omite
      await sb.from("tarifarios_vehiculo_cliente").upsert({
        empresa_id: empresa.id, tipo_vehiculo: tv,
        tarifa_base: parseFloat(v.base), recargo_periferico: parseFloat(v.recargo)||0,
        activo: v.activo,
      }, { onConflict: "empresa_id,tipo_vehiculo" });
    }
    setGuardando(false);
    toast("Tarifario por vehículo guardado ✓");
    onSaved();
    onClose();
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"#0008", zIndex:1000,
      display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ background:B.white, borderRadius:16, padding:28, width:560,
        maxHeight:"85vh", overflowY:"auto", boxShadow:"0 20px 60px #0003" }}>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
          <div style={{ fontSize:16, fontWeight:800, color:B.navy }}>🚛 Tarifario por vehículo — {empresa.nombre}</div>
          <button onClick={onClose} style={{ background:"none", border:"none", fontSize:20,
            color:B.textSec, cursor:"pointer" }}>✕</button>
        </div>
        <div style={{ fontSize:12, color:B.textMut, marginBottom:16 }}>
          Tarifa por día según tipo de vehículo. La "tarifa base" aplica en zona urbana y semi urbana; el "recargo periférico" se suma solo cuando el servicio es en zona periférica. Deja vacía la tarifa base de un vehículo si este cliente no lo usa.
        </div>

        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {TIPOS_VEHICULO.map(tv=>{
            const v = valores[tv];
            const completo = v.base !== "";
            return (
              <div key={tv} style={{ border:`1px solid ${B.border}`, borderRadius:10, padding:14,
                background: completo && v.activo ? "#FFF8EF" : B.bg,
                opacity: completo && !v.activo ? 0.6 : 1 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:B.navy, textTransform:"capitalize" }}>
                    {tv} {completo && <span style={{ color: v.activo?B.green:B.textMut, fontSize:11 }}>· {v.activo?"activo":"inactivo"}</span>}
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                    <button onClick={()=>cargarDesdeEstandar(tv)}
                      style={{ fontSize:11, color:B.blue, background:"none", border:"none", cursor:"pointer", fontWeight:600 }}>
                      📋 Cargar desde el estándar
                    </button>
                    {completo && (
                      <label style={{ display:"flex", alignItems:"center", gap:6, fontSize:11, color:B.textSec, cursor:"pointer" }}>
                        <input type="checkbox" checked={v.activo} onChange={e=>set(tv,"activo",e.target.checked)}/>
                        Activo
                      </label>
                    )}
                  </div>
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                  <div>
                    <label style={{ ...lbl, marginBottom:4 }}>Tarifa base (S/ — urbano/semi urbano)</label>
                    <input type="number" style={inp} value={v.base} onChange={e=>set(tv,"base",e.target.value)}/>
                  </div>
                  <div>
                    <label style={{ ...lbl, marginBottom:4 }}>Recargo periférico (S/ adicional)</label>
                    <input type="number" style={inp} value={v.recargo} onChange={e=>set(tv,"recargo",e.target.value)}/>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ display:"flex", gap:10, justifyContent:"flex-end", marginTop:16 }}>
          <BtnSec onClick={onClose}>Cerrar</BtnSec>
          <BtnPri onClick={guardar} disabled={guardando}>{guardando?"Guardando...":"Guardar tarifario"}</BtnPri>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// MÓDULO: UNIDADES DE TRANSPORTE (clientes de Transporte y Carga)
// ══════════════════════════════════════════════════════════════
// Cálculos financieros de asignaciones de unidades — compartidos entre
// el módulo Unidades (operación) y Liquidación Transporte (finanzas).
function calcularDiasAsignacion(a, diasServicio) {
  const registrados = diasServicio.filter(d=>d.asignacion_id===a.id);
  if (registrados.length > 0) {
    return registrados.filter(d=>d.prestado).length;
  }
  const inicio = new Date(a.fecha_inicio+"T00:00:00");
  const fin = a.fecha_fin ? new Date(a.fecha_fin+"T00:00:00") : new Date();
  return Math.max(1, Math.round((fin-inicio)/86400000)+1);
}
// Si hay calendario real (con fechas exactas), suma día por día y aplica el
// recargo de feriado a cada día que corresponda. Sin calendario, usa la
// estimación plana anterior (no se puede aplicar recargo sin fechas exactas).
function calcularMontoAsignacion(a, diasServicio, recargoFeriadoPct=0) {
  const registrosCalendario = diasServicio.filter(d=>d.asignacion_id===a.id);
  const tarifaDia = parseFloat(a.tarifa_dia)||0;
  if (registrosCalendario.length > 0) {
    return registrosCalendario.filter(d=>d.prestado).reduce((sum,d)=>{
      const recargo = esFeriadoPeru(d.fecha) ? tarifaDia*(recargoFeriadoPct/100) : 0;
      return sum + tarifaDia + recargo;
    }, 0);
  }
  return calcularDiasAsignacion(a, diasServicio) * tarifaDia;
}
const calcularIGVAsignacion = (a, diasServicio, recargoFeriadoPct=0) => calcularMontoAsignacion(a, diasServicio, recargoFeriadoPct) * 0.18;
const calcularTotalConIGVAsignacion = (a, diasServicio, recargoFeriadoPct=0) => calcularMontoAsignacion(a, diasServicio, recargoFeriadoPct) * 1.18;

function Unidades({ unidades, asignaciones, empresas, tiposServicio, repartidores, onRefresh, toast }) {
  const [vista, setVista] = useState("asignaciones");
  const [modalUnidad, setModalUnidad] = useState(false);
  const [modalAsignacion, setModalAsignacion] = useState(false);
  const [editandoUnidad, setEditandoUnidad] = useState(null);
  const [editandoAsignacion, setEditandoAsignacion] = useState(null);

  const finalizarAsignacion = async (a) => {
    const hoy = new Date().toISOString().split("T")[0];
    const { error } = await sb.from("asignaciones_unidad").update({ fecha_fin: hoy, estado:"finalizada" }).eq("id", a.id);
    if (error) { toast("Error: "+error.message, "error"); return; }
    toast("Asignación finalizada ✓");
    onRefresh();
  };

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
        <div style={{ display:"flex", gap:6 }}>
          {[["asignaciones","📋 Asignaciones"],["unidades","🚛 Flota"]].map(([id,label])=>(
            <button key={id} onClick={()=>setVista(id)}
              style={{ padding:"8px 16px", borderRadius:8, fontSize:12, cursor:"pointer",
                border:`1px solid ${vista===id?B.gold:B.border}`,
                background:vista===id?B.gold:"transparent",
                color:vista===id?B.navy:B.textSec, fontWeight:vista===id?700:400 }}>
              {label}
            </button>
          ))}
        </div>
        {vista==="unidades" ? (
          <BtnPri onClick={()=>{setEditandoUnidad(null); setModalUnidad(true);}}>+ Nueva unidad</BtnPri>
        ) : (
          <BtnPri onClick={()=>{setEditandoAsignacion(null); setModalAsignacion(true);}}>+ Nueva asignación</BtnPri>
        )}
      </div>

      <div style={{ fontSize:12, color:B.textMut, marginBottom:14 }}>
        {vista==="unidades"
          ? "Tu flota disponible para clientes de Transporte y Carga."
          : "A qué cliente está asignada cada unidad y por cuánto tiempo. Para ver el cálculo de días, IGV y monto a facturar, ve a Finanzas → Liq. Transporte."}
      </div>

      {vista==="unidades" ? (
        <div style={{ background:B.white, border:`1px solid ${B.border}`, borderRadius:12, overflow:"hidden", boxShadow:"0 2px 8px #0D1E3D0A" }}>
          <table style={{ width:"100%", borderCollapse:"collapse" }}>
            <thead><tr style={{ background:B.bg }}>
              {["Placa","Tipo","Conductor","Teléfono","Estado","Acciones"].map(h=>(
                <th key={h} style={{ padding:"10px 14px", textAlign:"left", fontSize:10, color:B.textMut, fontWeight:700, textTransform:"uppercase" }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {unidades.map((u,i)=>{
                const conductor = repartidores.find(r=>r.id===u.repartidor_id);
                return (
                <tr key={u.id} style={{ borderTop:`1px solid ${B.border}`, background:i%2===0?B.white:"#F8FAFC" }}>
                  <td style={{ padding:"11px 14px", fontSize:12, fontWeight:700, color:B.navy }}>{u.placa}</td>
                  <td style={{ padding:"11px 14px", fontSize:12, color:B.textSec, textTransform:"capitalize" }}>{u.tipo_vehiculo||"—"}</td>
                  <td style={{ padding:"11px 14px", fontSize:12, color:B.textSec }}>{conductor?`${conductor.nombres} ${conductor.apellidos}`:"Sin asignar"}</td>
                  <td style={{ padding:"11px 14px", fontSize:12, color:B.textSec }}>{conductor?.telefono||"—"}</td>
                  <td style={{ padding:"11px 14px" }}>
                    <span style={{ fontSize:10, padding:"3px 8px", borderRadius:10, fontWeight:700,
                      background:u.activo?"#ECFDF5":"#F3F4F6", color:u.activo?B.green:B.textMut }}>
                      {u.activo?"Activa":"Inactiva"}
                    </span>
                  </td>
                  <td style={{ padding:"11px 14px" }}>
                    <button onClick={()=>{setEditandoUnidad(u); setModalUnidad(true);}}
                      style={{ fontSize:11, color:B.blue, background:"none", border:"none", cursor:"pointer" }}>Editar</button>
                  </td>
                </tr>
                );
              })}
              {unidades.length===0 && <tr><td colSpan={6} style={{ padding:32, textAlign:"center", color:B.textMut, fontSize:13 }}>No hay unidades registradas</td></tr>}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ background:B.white, border:`1px solid ${B.border}`, borderRadius:12, overflow:"hidden", boxShadow:"0 2px 8px #0D1E3D0A" }}>
          <table style={{ width:"100%", borderCollapse:"collapse" }}>
            <thead><tr style={{ background:B.bg }}>
              {["Unidad","Cliente","Servicio","Desde","Hasta","Estado","Acciones"].map(h=>(
                <th key={h} style={{ padding:"10px 12px", textAlign:"left", fontSize:10, color:B.textMut, fontWeight:700, textTransform:"uppercase" }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {asignaciones.map((a,i)=>{
                const unidad = unidades.find(u=>u.id===a.unidad_id);
                const empresa = empresas.find(e=>e.id===a.empresa_id);
                const servicio = tiposServicio.find(t=>t.id===a.tipo_servicio_id);
                return (
                  <tr key={a.id} style={{ borderTop:`1px solid ${B.border}`, background:i%2===0?B.white:"#F8FAFC" }}>
                    <td style={{ padding:"10px 12px", fontSize:12, fontWeight:700, color:B.navy }}>{unidad?.placa||"—"}</td>
                    <td style={{ padding:"10px 12px", fontSize:12, color:B.textPri }}>{empresa?.nombre||"—"}</td>
                    <td style={{ padding:"10px 12px", fontSize:11, color:B.textSec }}>{servicio?.codigo||"—"}</td>
                    <td style={{ padding:"10px 12px", fontSize:11, color:B.textMut }}>{fmt.fecha(a.fecha_inicio)}</td>
                    <td style={{ padding:"10px 12px", fontSize:11, color:B.textMut }}>{a.fecha_fin?fmt.fecha(a.fecha_fin):"En curso"}</td>
                    <td style={{ padding:"10px 12px" }}>
                      <span style={{ fontSize:10, padding:"3px 8px", borderRadius:10, fontWeight:700,
                        background: a.liquidado?"#ECFDF5":a.estado==="activa"?"#FFFBEB":"#F3F4F6",
                        color: a.liquidado?B.green:a.estado==="activa"?B.goldDk:B.textMut }}>
                        {a.liquidado?"Liquidado":a.estado==="activa"?"Activa":"Finalizada"}
                      </span>
                    </td>
                    <td style={{ padding:"10px 12px" }}>
                      <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                        <button onClick={()=>{setEditandoAsignacion(a); setModalAsignacion(true);}} style={{ fontSize:11, color:B.gold, background:"none", border:"none", cursor:"pointer" }}>✏️ Editar</button>
                        {a.estado==="activa" && (
                          <button onClick={()=>finalizarAsignacion(a)} style={{ fontSize:11, color:B.red, background:"none", border:"none", cursor:"pointer" }}>Finalizar</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {asignaciones.length===0 && <tr><td colSpan={7} style={{ padding:32, textAlign:"center", color:B.textMut, fontSize:13 }}>No hay asignaciones registradas</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {modalUnidad && (
        <ModalUnidad unidad={editandoUnidad} repartidores={repartidores} onClose={()=>setModalUnidad(false)}
          onSaved={()=>{setModalUnidad(false); onRefresh();}} toast={toast}/>
      )}
      {modalAsignacion && (
        <ModalAsignacionUnidad unidades={unidades} empresas={empresas} tiposServicio={tiposServicio} repartidores={repartidores}
          asignacion={editandoAsignacion}
          onClose={()=>{setModalAsignacion(false); setEditandoAsignacion(null);}}
          onSaved={()=>{setModalAsignacion(false); setEditandoAsignacion(null); onRefresh();}} toast={toast}/>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// MÓDULO: LIQUIDACIÓN TRANSPORTE (Finanzas — cálculo de IGV/total
// y calendario de días de servicio para clientes de Transporte y Carga)
// ══════════════════════════════════════════════════════════════
function LiquidacionTransporte({ unidades, asignaciones, empresas, tiposServicio, diasServicio, recargoFeriadoPct, onRefresh, toast }) {
  const [modalCalendario, setModalCalendario] = useState(null);

  const marcarLiquidado = async (a) => {
    const { error } = await sb.from("asignaciones_unidad").update({ liquidado:true }).eq("id", a.id);
    if (error) { toast("Error: "+error.message, "error"); return; }
    toast("Marcado como liquidado ✓");
    onRefresh();
  };

  const totalPendiente = asignaciones
    .filter(a=>!a.liquidado)
    .reduce((sum,a)=>sum+calcularTotalConIGVAsignacion(a, diasServicio, recargoFeriadoPct), 0);

  return (
    <div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:14, marginBottom:20 }}>
        {[
          { label:"Asignaciones activas", value: asignaciones.filter(a=>a.estado==="activa").length, icon:"🚛", color:B.gold },
          { label:"Pendientes de liquidar", value: asignaciones.filter(a=>!a.liquidado).length, icon:"⏳", color:B.red },
          { label:"Total pendiente (con IGV)", value: fmt.sol(totalPendiente), icon:"💰", color:B.green },
        ].map((k,i)=>(
          <div key={i} style={{ background:B.white, border:`1px solid ${B.border}`,
            borderRadius:12, padding:18, borderTop:`3px solid ${k.color}`, boxShadow:"0 2px 8px #0D1E3D0A" }}>
            <div style={{ fontSize:20, marginBottom:6 }}>{k.icon}</div>
            <div style={{ fontSize:20, fontWeight:800, color:B.textPri }}>{k.value}</div>
            <div style={{ fontSize:10, color:B.textMut, textTransform:"uppercase" }}>{k.label}</div>
          </div>
        ))}
      </div>

      <div style={{ background:B.white, border:`1px solid ${B.border}`, borderRadius:12, overflow:"hidden", boxShadow:"0 2px 8px #0D1E3D0A" }}>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead><tr style={{ background:B.bg }}>
            {["Unidad","Cliente","Servicio","Desde","Hasta","Días","Tarifa/día","Subtotal","IGV (18%)","Total a facturar","Estado","Acciones"].map(h=>(
              <th key={h} style={{ padding:"10px 12px", textAlign:"left", fontSize:10, color:B.textMut, fontWeight:700, textTransform:"uppercase" }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {asignaciones.map((a,i)=>{
              const unidad = unidades.find(u=>u.id===a.unidad_id);
              const empresa = empresas.find(e=>e.id===a.empresa_id);
              const servicio = tiposServicio.find(t=>t.id===a.tipo_servicio_id);
              const dias = calcularDiasAsignacion(a, diasServicio);
              const monto = calcularMontoAsignacion(a, diasServicio, recargoFeriadoPct);
              const igv = calcularIGVAsignacion(a, diasServicio, recargoFeriadoPct);
              const totalConIGV = calcularTotalConIGVAsignacion(a, diasServicio, recargoFeriadoPct);
              const tieneRegistro = diasServicio.some(d=>d.asignacion_id===a.id);
              return (
                <tr key={a.id} style={{ borderTop:`1px solid ${B.border}`, background:i%2===0?B.white:"#F8FAFC" }}>
                  <td style={{ padding:"10px 12px", fontSize:12, fontWeight:700, color:B.navy }}>{unidad?.placa||"—"}</td>
                  <td style={{ padding:"10px 12px", fontSize:12, color:B.textPri }}>{empresa?.nombre||"—"}</td>
                  <td style={{ padding:"10px 12px", fontSize:11, color:B.textSec }}>{servicio?.codigo||"—"}</td>
                  <td style={{ padding:"10px 12px", fontSize:11, color:B.textMut }}>{fmt.fecha(a.fecha_inicio)}</td>
                  <td style={{ padding:"10px 12px", fontSize:11, color:B.textMut }}>{a.fecha_fin?fmt.fecha(a.fecha_fin):"En curso"}</td>
                  <td style={{ padding:"10px 12px" }}>
                    <span style={{ fontSize:12, fontWeight:700, color:B.navy }}>{dias}</span>
                    <span style={{ fontSize:9, color: tieneRegistro?B.green:B.textMut, marginLeft:4 }}>
                      {tieneRegistro?"✓ real":"est."}
                    </span>
                  </td>
                  <td style={{ padding:"10px 12px", fontSize:12, color:B.textSec }}>{fmt.sol(a.tarifa_dia)}</td>
                  <td style={{ padding:"10px 12px", fontSize:12, color:B.textSec }}>{fmt.sol(monto)}</td>
                  <td style={{ padding:"10px 12px", fontSize:12, color:B.textMut }}>{fmt.sol(igv)}</td>
                  <td style={{ padding:"10px 12px", fontSize:13, fontWeight:800, color:B.gold }}>{fmt.sol(totalConIGV)}</td>
                  <td style={{ padding:"10px 12px" }}>
                    <span style={{ fontSize:10, padding:"3px 8px", borderRadius:10, fontWeight:700,
                      background: a.liquidado?"#ECFDF5":a.estado==="activa"?"#FFFBEB":"#F3F4F6",
                      color: a.liquidado?B.green:a.estado==="activa"?B.goldDk:B.textMut }}>
                      {a.liquidado?"Liquidado":a.estado==="activa"?"Activa":"Finalizada"}
                    </span>
                  </td>
                  <td style={{ padding:"10px 12px" }}>
                    <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                      <button onClick={()=>setModalCalendario(a)} style={{ fontSize:11, color:B.blue, background:"none", border:"none", cursor:"pointer" }}>📅 Calendario</button>
                      {!a.liquidado && a.estado==="finalizada" && (
                        <button onClick={()=>marcarLiquidado(a)} style={{ fontSize:11, color:B.green, background:"none", border:"none", cursor:"pointer" }}>Liquidar</button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {asignaciones.length===0 && <tr><td colSpan={12} style={{ padding:32, textAlign:"center", color:B.textMut, fontSize:13 }}>No hay asignaciones registradas</td></tr>}
          </tbody>
        </table>
      </div>

      {modalCalendario && (
        <ModalCalendarioServicio asignacion={modalCalendario}
          diasServicio={diasServicio.filter(d=>d.asignacion_id===modalCalendario.id)}
          unidad={unidades.find(u=>u.id===modalCalendario.unidad_id)}
          empresa={empresas.find(e=>e.id===modalCalendario.empresa_id)}
          recargoFeriadoPct={recargoFeriadoPct}
          onClose={()=>setModalCalendario(null)} onCambio={onRefresh} toast={toast}/>
      )}
    </div>
  );
}

function ModalCalendarioServicio({ asignacion, diasServicio, unidad, empresa, recargoFeriadoPct, onClose, onCambio, toast }) {
  const [inicializando, setInicializando] = useState(true);

  const fechas = useMemo(() => {
    const arr = [];
    const inicio = new Date(asignacion.fecha_inicio+"T00:00:00");
    const fin = asignacion.fecha_fin ? new Date(asignacion.fecha_fin+"T00:00:00") : new Date();
    let cur = new Date(inicio);
    while (cur <= fin) {
      arr.push(cur.toISOString().split("T")[0]);
      cur.setDate(cur.getDate()+1);
    }
    return arr;
  }, [asignacion.fecha_inicio, asignacion.fecha_fin]);

  const mesesDisponibles = useMemo(() => {
    const set = new Set(fechas.map(f=>f.slice(0,7)));
    return Array.from(set).sort();
  }, [fechas]);
  const [mesActivo, setMesActivo] = useState(null);
  useEffect(() => {
    if (mesesDisponibles.length && !mesActivo) {
      const hoyMes = new Date().toISOString().slice(0,7);
      setMesActivo(mesesDisponibles.includes(hoyMes) ? hoyMes : mesesDisponibles[mesesDisponibles.length-1]);
    }
  }, [mesesDisponibles]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    (async () => {
      const existentes = new Set(diasServicio.map(d=>d.fecha));
      const faltantes = fechas.filter(f=>!existentes.has(f));
      if (faltantes.length > 0) {
        const { error } = await sb.from("dias_servicio_unidad").upsert(
          faltantes.map(f=>({ asignacion_id: asignacion.id, fecha: f, prestado: false })),
          { onConflict: "asignacion_id,fecha" }
        );
        if (error) toast("Error preparando calendario: "+error.message, "error");
        onCambio();
      }
      setInicializando(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = async (fecha, actual) => {
    const { error } = await sb.from("dias_servicio_unidad").upsert(
      { asignacion_id: asignacion.id, fecha, prestado: !actual },
      { onConflict: "asignacion_id,fecha" }
    );
    if (error) { toast("Error: "+error.message, "error"); return; }
    onCambio();
  };

  const mapa = {};
  diasServicio.forEach(d=>{ mapa[d.fecha] = d.prestado; });
  const totalPrestados = fechas.filter(f => mapa[f] === true).length;
  const feriadosActivos = fechas.filter(f => mapa[f] === true && esFeriadoPeru(f)).length;
  const subtotal = calcularMontoAsignacion(asignacion, diasServicio, recargoFeriadoPct);
  const igv = subtotal * 0.18;
  const totalConIGV = subtotal * 1.18;

  const fechasDelMes = mesActivo ? fechas.filter(f=>f.startsWith(mesActivo)) : [];
  const idxMes = mesesDisponibles.indexOf(mesActivo);
  const labelMes = mesActivo
    ? new Date(mesActivo+"-01T12:00:00").toLocaleDateString("es-PE",{month:"long",year:"numeric"})
    : "";

  return (
    <div style={{ position:"fixed", inset:0, background:"#0008", zIndex:1000,
      display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ background:B.white, borderRadius:16, padding:28, width:560,
        maxHeight:"85vh", overflowY:"auto", boxShadow:"0 20px 60px #0003" }}>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
          <div style={{ fontSize:16, fontWeight:800, color:B.navy }}>📅 Calendario de servicio</div>
          <button onClick={onClose} style={{ background:"none", border:"none", fontSize:20,
            color:B.textSec, cursor:"pointer" }}>✕</button>
        </div>
        <div style={{ fontSize:12, color:B.textSec, marginBottom:16 }}>
          {unidad?.placa||"—"} — {empresa?.nombre||"—"}
        </div>
        <div style={{ background:B.bg, borderRadius:10, padding:"12px 16px", marginBottom:16 }}>
          <div style={{ fontSize:12, color:B.textSec, marginBottom:10 }}>
            Todos los días empiezan sin marcar. Toca cada día que sí tuvo servicio para activarlo.
            {recargoFeriadoPct>0 && ` Los feriados llevan +${recargoFeriadoPct}% de recargo automático.`}
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:10, textAlign:"center" }}>
            <div>
              <div style={{ fontSize:18, fontWeight:900, color:B.navy }}>{totalPrestados}</div>
              <div style={{ fontSize:9, color:B.textMut, textTransform:"uppercase" }}>Días{feriadosActivos>0?` (${feriadosActivos} fer.)`:""}</div>
            </div>
            <div>
              <div style={{ fontSize:14, fontWeight:700, color:B.textSec }}>{fmt.sol(subtotal)}</div>
              <div style={{ fontSize:9, color:B.textMut, textTransform:"uppercase" }}>Subtotal</div>
            </div>
            <div>
              <div style={{ fontSize:14, fontWeight:700, color:B.textMut }}>{fmt.sol(igv)}</div>
              <div style={{ fontSize:9, color:B.textMut, textTransform:"uppercase" }}>IGV 18%</div>
            </div>
            <div>
              <div style={{ fontSize:16, fontWeight:900, color:B.gold }}>{fmt.sol(totalConIGV)}</div>
              <div style={{ fontSize:9, color:B.textMut, textTransform:"uppercase" }}>Total</div>
            </div>
          </div>
        </div>

        {inicializando ? (
          <div style={{ textAlign:"center", padding:30, color:B.textMut, fontSize:13 }}>Preparando calendario...</div>
        ) : (
          <>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
              <button onClick={()=>setMesActivo(mesesDisponibles[idxMes-1])} disabled={idxMes<=0}
                style={{ background:"none", border:`1px solid ${B.border}`, borderRadius:8, width:32, height:32,
                  cursor: idxMes<=0?"default":"pointer", opacity: idxMes<=0?0.3:1, fontSize:14 }}>‹</button>
              <div style={{ fontSize:14, fontWeight:700, color:B.navy, textTransform:"capitalize" }}>{labelMes}</div>
              <button onClick={()=>setMesActivo(mesesDisponibles[idxMes+1])} disabled={idxMes>=mesesDisponibles.length-1}
                style={{ background:"none", border:`1px solid ${B.border}`, borderRadius:8, width:32, height:32,
                  cursor: idxMes>=mesesDisponibles.length-1?"default":"pointer", opacity: idxMes>=mesesDisponibles.length-1?0.3:1, fontSize:14 }}>›</button>
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(66px, 1fr))", gap:8 }}>
              {fechasDelMes.map(f => {
                const prestado = mapa[f] === true;
                const feriado = esFeriadoPeru(f);
                const fechaObj = new Date(f+"T12:00:00");
                const bg = prestado && feriado ? "linear-gradient(135deg, #ECFDF5 50%, #FEF2F2 50%)"
                  : prestado ? "#ECFDF5" : feriado ? "#FEF2F2" : B.bg;
                const borderColor = prestado && feriado ? B.gold : prestado ? B.green : feriado ? B.red : B.border;
                const textColor = prestado && feriado ? B.goldDk : prestado ? B.green : feriado ? B.red : B.textMut;
                return (
                  <button key={f} onClick={()=>toggle(f, prestado)}
                    style={{ padding:"10px 4px", borderRadius:8, border:`2px solid ${borderColor}`,
                      background: bg, cursor:"pointer", textAlign:"center", position:"relative" }}>
                    <div style={{ fontSize:9, color:B.textMut, textTransform:"uppercase" }}>
                      {fechaObj.toLocaleDateString("es-PE",{weekday:"short"})}
                    </div>
                    <div style={{ fontSize:14, fontWeight:800, color:textColor }}>
                      {fechaObj.getDate()}
                    </div>
                    {feriado && (
                      <div style={{ fontSize:8, color:B.red, fontWeight:700, marginTop:1 }}>feriado</div>
                    )}
                  </button>
                );
              })}
            </div>

            <div style={{ display:"flex", gap:14, marginTop:14, fontSize:10, color:B.textMut, flexWrap:"wrap" }}>
              <span><span style={{ display:"inline-block", width:10, height:10, background:"#ECFDF5", border:`1.5px solid ${B.green}`, borderRadius:3, marginRight:4 }}/>Activo</span>
              <span><span style={{ display:"inline-block", width:10, height:10, background:"#FEF2F2", border:`1.5px solid ${B.red}`, borderRadius:3, marginRight:4 }}/>Feriado</span>
              <span><span style={{ display:"inline-block", width:10, height:10, background:"linear-gradient(135deg,#ECFDF5 50%,#FEF2F2 50%)", border:`1.5px solid ${B.gold}`, borderRadius:3, marginRight:4 }}/>Activo + Feriado (con recargo)</span>
            </div>
          </>
        )}

        <div style={{ display:"flex", justifyContent:"flex-end", marginTop:20 }}>
          <BtnPri onClick={onClose}>Listo</BtnPri>
        </div>
      </div>
    </div>
  );
}

function ModalUnidad({ unidad, repartidores, onClose, onSaved, toast }) {
  const [f, setF] = useState(unidad || { placa:"", tipo_vehiculo:"moto", repartidor_id:"" });
  const guardar = async () => {
    if (!f.placa) { toast("La placa es obligatoria","error"); return; }
    const payload = { placa:f.placa, tipo_vehiculo:f.tipo_vehiculo, repartidor_id:f.repartidor_id||null };
    let error;
    if (unidad) {
      ({ error } = await sb.from("unidades_transporte").update(payload).eq("id", unidad.id));
    } else {
      ({ error } = await sb.from("unidades_transporte").insert([{ ...payload, activo:true }]));
    }
    if (error) { toast("Error: "+error.message,"error"); return; }
    toast(unidad?"Unidad actualizada ✓":"Unidad registrada ✓");
    onSaved();
  };
  const toggleActivo = async () => {
    await sb.from("unidades_transporte").update({ activo: !f.activo }).eq("id", unidad.id);
    toast(f.activo?"Unidad desactivada":"Unidad activada");
    onSaved();
  };
  return (
    <div style={{ position:"fixed", inset:0, background:"#0008", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ background:B.white, borderRadius:16, padding:28, width:460, boxShadow:"0 20px 60px #0003" }}>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:20 }}>
          <div style={{ fontSize:15, fontWeight:800, color:B.navy }}>{unidad?"Editar unidad":"Nueva unidad"}</div>
          <button onClick={onClose} style={{ background:"none", border:"none", fontSize:18, color:B.textSec, cursor:"pointer" }}>✕</button>
        </div>
        <label style={lbl}>Placa</label>
        <input style={{ ...inp, marginBottom:12, textTransform:"uppercase" }} value={f.placa} onChange={e=>setF(p=>({...p,placa:e.target.value.toUpperCase()}))}/>
        <label style={lbl}>Tipo de vehículo</label>
        <select style={{ ...inp, marginBottom:12 }} value={f.tipo_vehiculo} onChange={e=>setF(p=>({...p,tipo_vehiculo:e.target.value}))}>
          <option value="moto">Moto</option>
          <option value="bicicleta">Bicicleta</option>
          <option value="auto">Auto</option>
          <option value="furgoneta">Furgoneta</option>
          <option value="minivan">Minivan</option>
          <option value="van">Van</option>
          <option value="porter">Porter</option>
        </select>
        <label style={lbl}>Conductor (elige de Repartidores)</label>
        <select style={{ ...inp, marginBottom:6 }} value={f.repartidor_id||""} onChange={e=>setF(p=>({...p,repartidor_id:e.target.value}))}>
          <option value="">— Sin asignar —</option>
          {repartidores.filter(r=>r.activo).map(r=>(
            <option key={r.id} value={r.id}>{r.nombres} {r.apellidos}{r.telefono?` — ${r.telefono}`:""}</option>
          ))}
        </select>
        <div style={{ fontSize:11, color:B.textMut, marginBottom:20 }}>
          ¿El conductor todavía no está registrado? Créalo primero en el módulo <strong>Repartidores</strong> — así puede usarse tanto para pedidos de última milla como para unidades de transporte.
        </div>
        <div style={{ display:"flex", gap:10, justifyContent:"space-between" }}>
          {unidad && <BtnSec onClick={toggleActivo}>{f.activo?"Desactivar":"Activar"}</BtnSec>}
          <div style={{ display:"flex", gap:10, marginLeft:"auto" }}>
            <BtnSec onClick={onClose}>Cancelar</BtnSec>
            <BtnPri onClick={guardar}>{unidad?"Guardar cambios":"Registrar"}</BtnPri>
          </div>
        </div>
      </div>
    </div>
  );
}

function ModalAsignacionUnidad({ unidades, empresas, tiposServicio, repartidores, asignacion, onClose, onSaved, toast }) {
  const [f, setF] = useState(asignacion || {
    unidad_id:"", empresa_id:"", tipo_servicio_id:"",
    fecha_inicio: new Date().toISOString().split("T")[0],
    tarifa_dia:"", notas:"",
  });
  const guardar = async () => {
    if (!f.unidad_id || !f.empresa_id || !f.fecha_inicio) { toast("Selecciona unidad, cliente y fecha de inicio","error"); return; }
    let error;
    if (asignacion) {
      ({ error } = await sb.from("asignaciones_unidad").update({
        unidad_id:f.unidad_id, empresa_id:f.empresa_id, tipo_servicio_id:f.tipo_servicio_id||null,
        fecha_inicio:f.fecha_inicio, fecha_fin:f.fecha_fin||null,
        tarifa_dia: parseFloat(f.tarifa_dia)||null, notas:f.notas||null,
      }).eq("id", asignacion.id));
    } else {
      ({ error } = await sb.from("asignaciones_unidad").insert([{
        ...f, tarifa_dia: parseFloat(f.tarifa_dia)||null, estado:"activa",
      }]));
    }
    if (error) { toast("Error: "+error.message,"error"); return; }
    toast(asignacion ? "Asignación actualizada ✓" : "Asignación creada ✓");
    onSaved();
  };
  return (
    <div style={{ position:"fixed", inset:0, background:"#0008", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ background:B.white, borderRadius:16, padding:28, width:480, boxShadow:"0 20px 60px #0003" }}>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:20 }}>
          <div style={{ fontSize:15, fontWeight:800, color:B.navy }}>{asignacion ? "Editar asignación" : "Nueva asignación de unidad"}</div>
          <button onClick={onClose} style={{ background:"none", border:"none", fontSize:18, color:B.textSec, cursor:"pointer" }}>✕</button>
        </div>
        <label style={lbl}>Unidad</label>
        <select style={{ ...inp, marginBottom:12 }} value={f.unidad_id} onChange={e=>setF(p=>({...p,unidad_id:e.target.value}))}>
          <option value="">— Selecciona —</option>
          {unidades.filter(u=>u.activo).map(u=>{
            const conductor = repartidores.find(r=>r.id===u.repartidor_id);
            return <option key={u.id} value={u.id}>{u.placa} — {conductor?`${conductor.nombres} ${conductor.apellidos}`:"sin conductor"}</option>;
          })}
        </select>
        <label style={lbl}>Cliente</label>
        <select style={{ ...inp, marginBottom:12 }} value={f.empresa_id} onChange={e=>setF(p=>({...p,empresa_id:e.target.value}))}>
          <option value="">— Selecciona —</option>
          {empresas.map(e=><option key={e.id} value={e.id}>{e.codigo_interno?`${e.codigo_interno} — `:""}{e.nombre}</option>)}
        </select>
        <label style={lbl}>Tipo de servicio</label>
        <select style={{ ...inp, marginBottom:12 }} value={f.tipo_servicio_id} onChange={e=>setF(p=>({...p,tipo_servicio_id:e.target.value}))}>
          <option value="">— Sin especificar —</option>
          {tiposServicio.map(t=><option key={t.id} value={t.id}>{t.codigo} — {t.nombre}</option>)}
        </select>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
          <div><label style={lbl}>Fecha de inicio</label>
            <input type="date" style={inp} value={f.fecha_inicio} onChange={e=>setF(p=>({...p,fecha_inicio:e.target.value}))}/></div>
          <div><label style={lbl}>Tarifa por día (S/)</label>
            <input type="number" style={inp} value={f.tarifa_dia} onChange={e=>setF(p=>({...p,tarifa_dia:e.target.value}))}/></div>
        </div>
        {asignacion && (
          <div style={{ marginBottom:12 }}>
            <label style={lbl}>Fecha de fin (déjalo vacío si sigue activa)</label>
            <input type="date" style={inp} value={f.fecha_fin||""} onChange={e=>setF(p=>({...p,fecha_fin:e.target.value}))}/>
          </div>
        )}
        <label style={lbl}>Notas (opcional)</label>
        <input style={{ ...inp, marginBottom:20 }} value={f.notas||""} onChange={e=>setF(p=>({...p,notas:e.target.value}))}/>
        <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
          <BtnSec onClick={onClose}>Cancelar</BtnSec>
          <BtnPri onClick={guardar}>{asignacion ? "Guardar cambios" : "Crear asignación"}</BtnPri>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// MÓDULO 5: LIQUIDACIONES
// ══════════════════════════════════════════════════════════════
function Liquidaciones({ repartidores, pedidos, toast, onRefresh }) {
  const [sel, setSel] = useState("");
  const [fechaInicio, setFechaInicio] = useState(new Date().toISOString().split("T")[0]);
  const [fechaFin, setFechaFin] = useState(new Date().toISOString().split("T")[0]);
  const [generando, setGenerando] = useState(false);
  const [historial, setHistorial] = useState([]);

  useEffect(() => {
    sb.from("liquidaciones").select("*,repartidores(nombres,apellidos)")
      .order("created_at",{ascending:false}).then(({data})=>{ if(data) setHistorial(data); });
  }, []);

  const pedidosFiltrados = pedidos.filter(p =>
    p.repartidor_id===sel && p.estado==="entregado" &&
    p.fecha_entrega >= fechaInicio && p.fecha_entrega <= fechaFin+"T23:59:59"
  );
  const total = pedidosFiltrados.reduce((a,p)=>a+(parseFloat(p.tarifa_s)||0),0);
  const rep = repartidores.find(r=>r.id===sel);

  const generar = async () => {
    if (!sel) { toast("Selecciona un repartidor","error"); return; }
    if (pedidosFiltrados.length===0) { toast("No hay pedidos entregados en el rango","warn"); return; }
    setGenerando(true);
    const { data: liq, error } = await sb.from("liquidaciones").insert([{
      repartidor_id:sel, fecha: fechaFin,
      total_pedidos:pedidosFiltrados.length, total_entregados:pedidosFiltrados.length,
      monto_ganado_s:total, estado:"pendiente",
    }]).select().single();
    if (error) { toast("Error: "+error.message,"error"); setGenerando(false); return; }
    await sb.from("liquidacion_pedidos").insert(
      pedidosFiltrados.map(p=>({liquidacion_id:liq.id,pedido_id:p.id,tarifa_s:p.tarifa_s}))
    );
    toast("Liquidación generada ✓");
    setGenerando(false);
    const { data } = await sb.from("liquidaciones").select("*,repartidores(nombres,apellidos)").order("created_at",{ascending:false});
    if (data) setHistorial(data);
  };

  const marcarPagado = async (id) => {
    await sb.from("liquidaciones").update({estado:"pagado"}).eq("id",id);
    toast("Marcado como pagado ✓");
    const { data } = await sb.from("liquidaciones").select("*,repartidores(nombres,apellidos)").order("created_at",{ascending:false});
    if (data) setHistorial(data);
  };

  return (
    <div>
      {/* Generador */}
      <div style={{ background:B.white, border:`1px solid ${B.border}`, borderRadius:12,
        padding:24, marginBottom:20, boxShadow:"0 2px 8px #0D1E3D0A" }}>
        <div style={{ fontSize:14, fontWeight:800, color:B.navy, marginBottom:16 }}>Generar nueva liquidación</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr auto", gap:14, alignItems:"flex-end" }}>
          <div>
            <label style={lbl}>Repartidor</label>
            <select style={inp} value={sel} onChange={e=>setSel(e.target.value)}>
              <option value="">— Selecciona —</option>
              {repartidores.map(r=><option key={r.id} value={r.id}>{r.nombres} {r.apellidos}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Fecha inicio</label>
            <input type="date" style={inp} value={fechaInicio} onChange={e=>setFechaInicio(e.target.value)}/>
          </div>
          <div>
            <label style={lbl}>Fecha fin</label>
            <input type="date" style={inp} value={fechaFin} onChange={e=>setFechaFin(e.target.value)}/>
          </div>
          <BtnPri onClick={generar} disabled={generando||!sel} style={{ whiteSpace:"nowrap" }}>
            {generando?"Generando...":"Generar"}
          </BtnPri>
        </div>

        {sel && (
          <div style={{ display:"flex", gap:24, marginTop:20, padding:16,
            background:B.bg, borderRadius:10, alignItems:"center" }}>
            <div style={{ textAlign:"center" }}>
              <div style={{ fontSize:28, fontWeight:800, color:B.gold }}>{pedidosFiltrados.length}</div>
              <div style={{ fontSize:10, color:B.textMut, textTransform:"uppercase" }}>Entregas</div>
            </div>
            <div style={{ textAlign:"center" }}>
              <div style={{ fontSize:24, fontWeight:800, color:B.navy }}>{fmt.sol(total)}</div>
              <div style={{ fontSize:10, color:B.textMut, textTransform:"uppercase" }}>Total a pagar</div>
            </div>
            <div style={{ textAlign:"center" }}>
              <div style={{ fontSize:20, fontWeight:800, color:B.green }}>{fmt.sol(total*0.18)}</div>
              <div style={{ fontSize:10, color:B.textMut, textTransform:"uppercase" }}>IGV estimado</div>
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:12, color:B.textSec }}>Repartidor: <strong>{rep?.nombres} {rep?.apellidos}</strong></div>
              <div style={{ fontSize:12, color:B.textSec }}>Período: {fmt.fecha(fechaInicio)} — {fmt.fecha(fechaFin)}</div>
            </div>
          </div>
        )}
      </div>

      {/* Historial */}
      <div style={{ fontSize:14, fontWeight:800, color:B.navy, marginBottom:12 }}>Historial de liquidaciones</div>
      <div style={{ background:B.white, border:`1px solid ${B.border}`, borderRadius:12,
        overflow:"hidden", boxShadow:"0 2px 8px #0D1E3D0A" }}>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead>
            <tr style={{ background:B.bg }}>
              {["Repartidor","Fecha","Pedidos","Total","Estado","Acciones"].map(h=>(
                <th key={h} style={{ padding:"10px 16px", textAlign:"left", fontSize:10,
                  color:B.textMut, fontWeight:700, textTransform:"uppercase" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {historial.map((l,i)=>(
              <tr key={l.id} style={{ borderTop:`1px solid ${B.border}`,
                background:i%2===0?B.white:"#F8FAFC" }}>
                <td style={{ padding:"12px 16px", fontSize:12, fontWeight:600, color:B.navy }}>
                  {l.repartidores?.nombres} {l.repartidores?.apellidos}
                </td>
                <td style={{ padding:"12px 16px", fontSize:12, color:B.textSec }}>{fmt.fecha(l.fecha)}</td>
                <td style={{ padding:"12px 16px", fontSize:12, color:B.textSec }}>{l.total_entregados}</td>
                <td style={{ padding:"12px 16px", fontSize:13, fontWeight:800, color:B.navy }}>{fmt.sol(l.monto_ganado_s)}</td>
                <td style={{ padding:"12px 16px" }}>
                  <span style={{ fontSize:11, padding:"3px 10px", borderRadius:20, fontWeight:700,
                    background: l.estado==="pagado"?"#ECFDF5":"#FFFBEB",
                    color: l.estado==="pagado"?B.green:B.goldDk,
                    border:`1px solid ${l.estado==="pagado"?B.green+"44":B.gold+"44"}` }}>
                    {l.estado==="pagado"?"✓ Pagado":"⏳ Pendiente"}
                  </span>
                </td>
                <td style={{ padding:"12px 16px" }}>
                  {l.estado!=="pagado" && (
                    <button onClick={()=>marcarPagado(l.id)}
                      style={{ fontSize:11, color:B.green, background:"none",
                        border:`1px solid ${B.green}`, padding:"4px 10px",
                        borderRadius:6, cursor:"pointer", fontWeight:600 }}>
                      Marcar pagado
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {historial.length===0&&<tr><td colSpan={6} style={{ padding:32,
              textAlign:"center", color:B.textMut, fontSize:13 }}>No hay liquidaciones aún</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// MÓDULO 6: FACTURACIÓN
// ══════════════════════════════════════════════════════════════
function Facturacion({ empresas, pedidos, tiposServicio, usuario, toast }) {
  const [facturas, setFacturas] = useState([]);
  const [modal, setModal] = useState(false);
  const [modalPago, setModalPago] = useState(null); // factura seleccionada para marcar pagada
  const [editandoFactura, setEditandoFactura] = useState(null);
  const [filtroPago, setFiltroPago] = useState("todas");
  const facturaVacia = () => ({
    empresa_id:"", serie:"E001", numero:"", descripcion:
    "Servicio de transporte y distribución multipunto - Same Day",
    cantidad:1, valor_unit_s:"", fecha_emision: new Date().toISOString().split("T")[0],
    tipo_servicio_id:"", aplica_detraccion:false, porcentaje_detraccion:"",
  });
  const [f, setF] = useState(facturaVacia());

  const abrirNuevaFactura = () => { setEditandoFactura(null); setF(facturaVacia()); setModal(true); };

  const cargarFacturas = () => {
    sb.from("facturas").select("*,empresas(nombre)").order("created_at",{ascending:false})
      .then(({data})=>{ if(data) setFacturas(data); });
  };
  useEffect(()=>{ cargarFacturas(); },[]);

  const marcarPagado = async (fecha, banco, numeroOperacion) => {
    const { error } = await sb.from("facturas").update({
      estado_pago:"pagado", fecha_pago: fecha,
      banco_pago: banco||null, numero_operacion: numeroOperacion||null,
    }).eq("id", modalPago.id);
    if (error) { toast("Error: "+error.message,"error"); return; }
    toast("Factura marcada como pagada ✓");
    setModalPago(null);
    cargarFacturas();
  };

  const facturasFiltradas = facturas.filter(fa =>
    filtroPago==="todas" || (fa.estado_pago||"pendiente")===filtroPago
  );

  const totalFacturado = facturas.reduce((a,fa)=>a+(parseFloat(fa.total_s)||0),0);
  const totalCobrado = facturas.filter(fa=>fa.estado_pago==="pagado").reduce((a,fa)=>a+(parseFloat(fa.total_s)||0),0);
  const totalPorCobrar = totalFacturado - totalCobrado;

  const seleccionarTipoServicio = (id) => {
    const t = tiposServicio.find(ts=>ts.id===id);
    setF(p=>({
      ...p, tipo_servicio_id:id,
      descripcion: t ? `Servicio de ${t.nombre} (${t.unidad_medida||"—"})` : p.descripcion,
      valor_unit_s: t?.tarifa_base ? String(t.tarifa_base) : p.valor_unit_s,
    }));
  };

  const igv = parseFloat(f.valor_unit_s||0) * 0.18;
  const total = parseFloat(f.valor_unit_s||0) * 1.18;
  const montoDetraccion = f.aplica_detraccion ? total * (parseFloat(f.porcentaje_detraccion||0)/100) : 0;
  const netoACobrar = total - montoDetraccion;

  const guardar = async () => {
    if (!f.empresa_id || !f.valor_unit_s || !f.numero) {
      toast("Completa empresa, número y valor","error"); return;
    }
    const payload = {
      empresa_id: f.empresa_id, serie: f.serie, numero: f.numero,
      descripcion: f.descripcion, cantidad: f.cantidad, valor_unit_s: f.valor_unit_s,
      fecha_emision: f.fecha_emision, tipo_servicio_id: f.tipo_servicio_id||null,
      igv_s: igv, total_s: total,
      porcentaje_detraccion: f.aplica_detraccion ? (parseFloat(f.porcentaje_detraccion)||0) : 0,
      monto_detraccion: montoDetraccion,
      unidad_medida:"ZZ",
    };
    let error;
    if (editandoFactura) {
      ({ error } = await sb.from("facturas").update(payload).eq("id", editandoFactura.id));
    } else {
      ({ error } = await sb.from("facturas").insert([{ ...payload, estado:"emitida", estado_pago:"pendiente" }]));
    }
    if (error) { toast("Error: "+error.message,"error"); return; }
    toast(editandoFactura ? "Factura actualizada ✓" : "Factura registrada ✓");
    setModal(false);
    setEditandoFactura(null);
    cargarFacturas();
  };

  return (
    <div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:14, marginBottom:20 }}>
        {[
          { label:"Total facturado", value: fmt.sol(totalFacturado), icon:"🧾", color:B.navy },
          { label:"Cobrado", value: fmt.sol(totalCobrado), icon:"✅", color:B.green },
          { label:"Por cobrar", value: fmt.sol(totalPorCobrar), icon:"⏳", color:B.red },
        ].map((k,i)=>(
          <div key={i} style={{ background:B.white, border:`1px solid ${B.border}`,
            borderRadius:12, padding:18, borderTop:`3px solid ${k.color}`, boxShadow:"0 2px 8px #0D1E3D0A" }}>
            <div style={{ fontSize:20, marginBottom:6 }}>{k.icon}</div>
            <div style={{ fontSize:20, fontWeight:800, color:B.textPri }}>{k.value}</div>
            <div style={{ fontSize:10, color:B.textMut, textTransform:"uppercase" }}>{k.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
        <div style={{ display:"flex", gap:6 }}>
          {[["todas","Todas"],["pendiente","Por cobrar"],["pagado","Cobradas"]].map(([id,label])=>(
            <button key={id} onClick={()=>setFiltroPago(id)}
              style={{ padding:"8px 16px", borderRadius:8, fontSize:12, cursor:"pointer",
                border:`1px solid ${filtroPago===id?B.gold:B.border}`,
                background:filtroPago===id?B.gold:"transparent",
                color:filtroPago===id?B.navy:B.textSec, fontWeight:filtroPago===id?700:400 }}>
              {label}
            </button>
          ))}
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <BtnPri onClick={abrirNuevaFactura}>+ Registrar factura</BtnPri>
        </div>
      </div>

      <div style={{ background:B.white, border:`1px solid ${B.border}`, borderRadius:12,
        overflow:"hidden", boxShadow:"0 2px 8px #0D1E3D0A" }}>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead>
            <tr style={{ background:B.bg }}>
              {["Serie-Número","Cliente","IGV","Total","Detracción","Neto a cobrar","Fecha emisión","Estado de pago","Fecha de pago","Acciones"].map(h=>(
                <th key={h} style={{ padding:"10px 14px", textAlign:"left", fontSize:10,
                  color:B.textMut, fontWeight:700, textTransform:"uppercase" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {facturasFiltradas.map((fa,i)=>(
              <tr key={fa.id} style={{ borderTop:`1px solid ${B.border}`,
                background:i%2===0?B.white:"#F8FAFC" }}>
                <td style={{ padding:"11px 14px", fontSize:12, fontWeight:700, color:B.navy }}>
                  {fa.serie}-{fa.numero}
                </td>
                <td style={{ padding:"11px 14px", fontSize:12, color:B.textPri }}>{fa.empresas?.nombre||"—"}</td>
                <td style={{ padding:"11px 14px", fontSize:12, color:B.textSec }}>{fmt.sol(fa.igv_s)}</td>
                <td style={{ padding:"11px 14px", fontSize:13, fontWeight:800, color:B.navy }}>{fmt.sol(fa.total_s)}</td>
                <td style={{ padding:"11px 14px", fontSize:12, color: fa.monto_detraccion>0?B.red:B.textMut }}>
                  {fa.monto_detraccion>0 ? `- ${fmt.sol(fa.monto_detraccion)} (${fa.porcentaje_detraccion}%)` : "—"}
                </td>
                <td style={{ padding:"11px 14px", fontSize:13, fontWeight:800, color:B.gold }}>
                  {fmt.sol((parseFloat(fa.total_s)||0) - (parseFloat(fa.monto_detraccion)||0))}
                </td>
                <td style={{ padding:"11px 14px", fontSize:11, color:B.textMut }}>{fmt.fecha(fa.fecha_emision)}</td>
                <td style={{ padding:"11px 14px" }}>
                  <span style={{ fontSize:11, padding:"3px 8px", borderRadius:10, fontWeight:700,
                    background:fa.estado_pago==="pagado"?"#ECFDF5":"#FEF2F2",
                    color:fa.estado_pago==="pagado"?B.green:B.red }}>
                    {fa.estado_pago==="pagado"?"Pagado":"Pendiente"}
                  </span>
                </td>
                <td style={{ padding:"11px 14px", fontSize:11, color:B.textMut }}>
                  {fa.fecha_pago ? fmt.fecha(fa.fecha_pago) : "—"}
                  {fa.banco_pago && <div style={{ fontSize:10, color:B.textMut }}>{fa.banco_pago}{fa.numero_operacion?` · Op. ${fa.numero_operacion}`:""}</div>}
                </td>
                <td style={{ padding:"11px 14px" }}>
                  <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                    <button onClick={()=>{setEditandoFactura(fa); setF({...fa, aplica_detraccion:(fa.porcentaje_detraccion||0)>0, porcentaje_detraccion: fa.porcentaje_detraccion?String(fa.porcentaje_detraccion):""}); setModal(true);}}
                      style={{ fontSize:11, color:B.blue, background:"none", border:"none", cursor:"pointer" }}>✏️ Editar</button>
                    {fa.estado_pago!=="pagado" && (
                      <button onClick={()=>setModalPago(fa)}
                        style={{ fontSize:11, color:B.green, background:"none", border:"none",
                          cursor:"pointer", fontWeight:700 }}>💰 Marcar pagada</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {facturasFiltradas.length===0&&<tr><td colSpan={10} style={{ padding:32, textAlign:"center",
              color:B.textMut, fontSize:13 }}>No hay facturas en esta vista</td></tr>}
          </tbody>
        </table>
      </div>

      {modalPago && (
        <ModalMarcarPagada factura={modalPago} onClose={()=>setModalPago(null)} onConfirmar={marcarPagado}/>
      )}

      {modal && (
        <div style={{ position:"fixed", inset:0, background:"#0008", zIndex:1000,
          display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div style={{ background:B.white, borderRadius:16, padding:28, width:560,
            boxShadow:"0 20px 60px #0003" }}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:20 }}>
              <div style={{ fontSize:15, fontWeight:800, color:B.navy }}>{editandoFactura ? "Editar factura" : "Registrar factura"}</div>
              <button onClick={()=>setModal(false)} style={{ background:"none", border:"none",
                fontSize:18, color:B.textSec, cursor:"pointer" }}>✕</button>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
              <div style={{ gridColumn:"span 2" }}>
                <label style={lbl}>Empresa cliente</label>
                <select style={inp} value={f.empresa_id} onChange={e=>setF(p=>({...p,empresa_id:e.target.value}))}>
                  <option value="">— Selecciona —</option>
                  {empresas.map(e=><option key={e.id} value={e.id}>{e.codigo_interno ? `${e.codigo_interno} — ` : ""}{e.nombre} — RUC: {e.ruc}</option>)}
                </select>
              </div>
              <div><label style={lbl}>Serie</label>
                <input style={inp} value={f.serie} onChange={e=>setF(p=>({...p,serie:e.target.value}))}/></div>
              <div><label style={lbl}>Número</label>
                <input style={inp} placeholder="00000001" value={f.numero} onChange={e=>setF(p=>({...p,numero:e.target.value}))}/></div>
              <div style={{ gridColumn:"span 2" }}>
                <label style={lbl}>Tipo de servicio (opcional — autocompleta descripción y tarifa)</label>
                <select style={inp} value={f.tipo_servicio_id} onChange={e=>seleccionarTipoServicio(e.target.value)}>
                  <option value="">— Ingresar manualmente —</option>
                  {tiposServicio.map(t=><option key={t.id} value={t.id}>{t.codigo} — {t.nombre}</option>)}
                </select>
              </div>
              <div style={{ gridColumn:"span 2" }}>
                <label style={lbl}>Descripción (SUNAT)</label>
                <input style={inp} value={f.descripcion} onChange={e=>setF(p=>({...p,descripcion:e.target.value}))}/>
              </div>
              <div><label style={lbl}>Valor unitario (S/ sin IGV)</label>
                <input type="number" style={inp} value={f.valor_unit_s} onChange={e=>setF(p=>({...p,valor_unit_s:e.target.value}))}/></div>
              <div><label style={lbl}>Fecha emisión</label>
                <input type="date" style={inp} value={f.fecha_emision}
                  onChange={e=>setF(p=>({...p,fecha_emision:e.target.value}))}/></div>
            </div>

            <div style={{ marginTop:14, padding:"12px 14px", background:B.bg, borderRadius:10 }}>
              <label style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer", marginBottom: f.aplica_detraccion?10:0 }}>
                <input type="checkbox" checked={f.aplica_detraccion}
                  onChange={e=>setF(p=>({...p,aplica_detraccion:e.target.checked, porcentaje_detraccion: e.target.checked?(p.porcentaje_detraccion||"10"):""}))}/>
                <span style={{ fontSize:12, fontWeight:600, color:B.textPri }}>Este cliente aplica detracción</span>
              </label>
              {f.aplica_detraccion && (
                <div>
                  <label style={lbl}>Porcentaje de detracción</label>
                  <select style={inp} value={f.porcentaje_detraccion} onChange={e=>setF(p=>({...p,porcentaje_detraccion:e.target.value}))}>
                    <option value="4">4% — servicios en general (más común en transporte/logística)</option>
                    <option value="10">10%</option>
                    <option value="12">12%</option>
                  </select>
                </div>
              )}
            </div>

            {f.valor_unit_s && (
              <div style={{ background:B.bg, borderRadius:10, padding:14, marginTop:14,
                display:"grid", gridTemplateColumns: f.aplica_detraccion ? "1fr 1fr 1fr 1fr 1fr" : "1fr 1fr 1fr", gap:12 }}>
                <div><div style={{ fontSize:10, color:B.textMut }}>VALOR VENTA</div>
                  <div style={{ fontSize:16, fontWeight:700, color:B.navy }}>{fmt.sol(f.valor_unit_s)}</div></div>
                <div><div style={{ fontSize:10, color:B.textMut }}>IGV 18%</div>
                  <div style={{ fontSize:16, fontWeight:700, color:B.orange }}>{fmt.sol(igv)}</div></div>
                <div><div style={{ fontSize:10, color:B.textMut }}>TOTAL</div>
                  <div style={{ fontSize:18, fontWeight:800, color:B.gold }}>{fmt.sol(total)}</div></div>
                {f.aplica_detraccion && (
                  <>
                    <div><div style={{ fontSize:10, color:B.textMut }}>DETRACCIÓN</div>
                      <div style={{ fontSize:16, fontWeight:700, color:B.red }}>- {fmt.sol(montoDetraccion)}</div></div>
                    <div><div style={{ fontSize:10, color:B.textMut }}>NETO A COBRAR</div>
                      <div style={{ fontSize:18, fontWeight:800, color:B.green }}>{fmt.sol(netoACobrar)}</div></div>
                  </>
                )}
              </div>
            )}
            <div style={{ display:"flex", gap:10, marginTop:20, justifyContent:"flex-end" }}>
              <BtnSec onClick={()=>{setModal(false); setEditandoFactura(null);}}>Cancelar</BtnSec>
              <BtnPri onClick={guardar}>{editandoFactura ? "Guardar cambios" : "Registrar factura"}</BtnPri>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// MÓDULO 7: REPORTES
// ══════════════════════════════════════════════════════════════
const TIPOS_SERVICIO = {
  same_day: { label:"Same Day", color:"#7C3AED", bg:"#F5F3FF" },
  next_day: { label:"Next Day", color:"#0369A1", bg:"#EFF6FF" },
};

// ── Carga dinámica de ExcelJS (para la Liquidación de Entregas con estilo) ──
// La librería "xlsx" que ya usamos en el resto del sistema no soporta colores
// ni bordes; ExcelJS sí, y solo se carga cuando hace falta generar este documento.
function cargarExcelJS() {
  return new Promise((resolve) => {
    if (window.ExcelJS) { resolve(window.ExcelJS); return; }
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js";
    script.onload = () => resolve(window.ExcelJS);
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });
}

// Feriados oficiales de Perú. Los fijos son siempre la misma fecha; Jueves y
// Viernes Santo dependen de la Pascua, calculada con el algoritmo estándar
// (Meeus/Jones/Butcher). Devuelve un Set de fechas "YYYY-MM-DD" para el año dado.
function calcularPascua(anio) {
  const a = anio % 19, b = Math.floor(anio/100), c = anio % 100;
  const d = Math.floor(b/4), e = b % 4, f = Math.floor((b+8)/25);
  const g = Math.floor((b-f+1)/3), h = (19*a+b-d-g+15) % 30;
  const i = Math.floor(c/4), k = c % 4, l = (32+2*e+2*i-h-k) % 7;
  const m = Math.floor((a+11*h+22*l)/451);
  const mes = Math.floor((h+l-7*m+114)/31);
  const dia = ((h+l-7*m+114) % 31) + 1;
  return new Date(anio, mes-1, dia);
}
function obtenerFeriadosPeru(anio) {
  const f2 = (n)=>String(n).padStart(2,"0");
  const fechaStr = (d)=> `${d.getFullYear()}-${f2(d.getMonth()+1)}-${f2(d.getDate())}`;
  const pascua = calcularPascua(anio);
  const jueves = new Date(pascua); jueves.setDate(pascua.getDate()-3);
  const viernes = new Date(pascua); viernes.setDate(pascua.getDate()-2);
  return new Set([
    `${anio}-01-01`, fechaStr(jueves), fechaStr(viernes),
    `${anio}-05-01`, `${anio}-06-07`, `${anio}-06-29`, `${anio}-07-23`,
    `${anio}-07-28`, `${anio}-07-29`, `${anio}-08-06`, `${anio}-08-30`,
    `${anio}-10-08`, `${anio}-11-01`, `${anio}-12-08`, `${anio}-12-09`, `${anio}-12-25`,
  ]);
}
function esFeriadoPeru(fechaStr) {
  const anio = parseInt(fechaStr.slice(0,4));
  return obtenerFeriadosPeru(anio).has(fechaStr);
}

const bandaDePeso = (kg) => {
  const p = parseFloat(kg) || 0;
  if (p <= 1) return "XS";
  if (p <= 3) return "S";
  return "M";
};

// Genera la Liquidación de Entregas en el formato Boaz establecido:
// encabezado navy/ámbar, tabla con Tracking Boaz y N° de Orden del cliente,
// resumen operativo y tarifario de referencia al pie.
async function generarLiquidacionEntregas({ pedidosOrdenados, empresa, fechaInicio, fechaFin, numeroLiquidacion, toast }) {
  const ExcelJS = await cargarExcelJS();
  if (!ExcelJS) { toast("No se pudo cargar el generador de Excel — revisa tu conexión","error"); return; }

  const NAVY = "FF1B2A4A", AMBER = "FFE8A33D", LIGHT_GRAY = "FFF2F2F2", WHITE = "FFFFFFFF", BLUE_EDIT = "FFEFF6FF";
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Liquidación", { views: [{ showGridLines: false }] });

  const anchos = [5, 24, 18, 16, 12, 32, 9, 9, 13, 11, 11, 12];
  anchos.forEach((w,i)=>{ ws.getColumn(i+1).width = w; });

  const bordeFino = { style:"thin", color:{ argb:"FFBFBFBF" } };
  const borde = { top:bordeFino, left:bordeFino, right:bordeFino, bottom:bordeFino };

  // ── Encabezado ──
  ws.mergeCells("A1:L1");
  const titulo = ws.getCell("A1");
  titulo.value = "GRUPO BOAZ S.A.C.";
  titulo.font = { size:16, bold:true, color:{ argb:WHITE } };
  titulo.fill = { type:"pattern", pattern:"solid", fgColor:{ argb:NAVY } };
  titulo.alignment = { horizontal:"center", vertical:"middle" };
  ws.getRow(1).height = 28;

  ws.mergeCells("A2:L2");
  const sub = ws.getCell("A2");
  sub.value = "RUC 20613172301  ·  Con Boaz, tu negocio no para  ·  contacto@boaz.com.pe  ·  +51 960 622 471";
  sub.font = { size:9, color:{ argb:WHITE } };
  sub.fill = { type:"pattern", pattern:"solid", fgColor:{ argb:NAVY } };
  sub.alignment = { horizontal:"center" };

  ws.mergeCells("A4:L4");
  const tituloDoc = ws.getCell("A4");
  tituloDoc.value = "LIQUIDACIÓN DE ENTREGAS";
  tituloDoc.font = { size:13, bold:true, color:{ argb:NAVY } };
  tituloDoc.alignment = { horizontal:"center" };

  const infoRows = [
    ["N° de Liquidación:", numeroLiquidacion],
    ["Cliente:", empresa.nombre],
    ["RUC del cliente:", empresa.ruc||"—"],
    ["Periodo:", `${fmt.fecha(fechaInicio+"T00:00:00")} al ${fmt.fecha(fechaFin+"T00:00:00")}`],
    ["Tipo de servicio:", "Distribución / Same Day"],
  ];
  let filaInfo = 6;
  infoRows.forEach(([label,val])=>{
    ws.getCell(`A${filaInfo}`).value = label;
    ws.getCell(`A${filaInfo}`).font = { bold:true, size:10, color:{ argb:NAVY } };
    ws.mergeCells(`B${filaInfo}:D${filaInfo}`);
    ws.getCell(`B${filaInfo}`).value = val;
    ws.getCell(`B${filaInfo}`).font = { size:10 };
    filaInfo++;
  });

  // ── Tabla de puntos ──
  const filaTabla = filaInfo + 1;
  const encabezados = ["N°","Punto / Destinatario","Distrito","Tracking Boaz","N° Orden","Detalle de Servicio","Peso (kg)","Banda","Ámbito","Tarifa","IGV","Total"];
  encabezados.forEach((h,i)=>{
    const celda = ws.getCell(filaTabla, i+1);
    celda.value = h;
    celda.font = { bold:true, size:10, color:{ argb:WHITE } };
    celda.fill = { type:"pattern", pattern:"solid", fgColor:{ argb:NAVY } };
    celda.alignment = { horizontal:"center", vertical:"middle" };
    celda.border = borde;
  });
  ws.getRow(filaTabla).height = 20;

  let subtotal = 0;
  pedidosOrdenados.forEach((p,i)=>{
    const fila = filaTabla + 1 + i;
    const tarifa = parseFloat(p.tarifa_s)||0;
    const igv = tarifa*0.18;
    const total = tarifa*1.18;
    subtotal += tarifa;
    const tipoServLabel = p.tipo_servicio==="same_day" ? "SAME DAY"
      : p.tipo_servicio==="next_day" ? "NEXT DAY"
      : p.tipo_servicio==="especial" ? "ESPECIAL" : "";
    const detalle = "SERVICIO DE TRANSPORTE Y DISTRIBUCIÓN MULTIPUNTO" + (tipoServLabel ? ` - ${tipoServLabel}` : "");
    const valores = [i+1, p.dest_nombre, p.dest_distrito||"—", p.omd, p.cliente_referencia||"—", detalle,
      parseFloat(p.peso_kg)||0, bandaDePeso(p.peso_kg), (p.ambito||"—").replace("_"," "), tarifa, igv, total];
    valores.forEach((v,j)=>{
      const celda = ws.getCell(fila, j+1);
      celda.value = v;
      celda.border = borde;
      celda.font = { size:10 };
      if (j===5) celda.font = { size:8, italic:true, color:{ argb:"FF4B5563" } };
      if (i%2===1) celda.fill = { type:"pattern", pattern:"solid", fgColor:{ argb:LIGHT_GRAY } };
      if (j===9) celda.fill = { type:"pattern", pattern:"solid", fgColor:{ argb:BLUE_EDIT } }; // tarifa editable
      if (j>=9) celda.numFmt = '"S/" #,##0.00';
      if (j===0 || j===6) celda.alignment = { horizontal:"center" };
    });
  });

  const filaTotales = filaTabla + 1 + pedidosOrdenados.length;
  ws.mergeCells(`A${filaTotales}:I${filaTotales}`);
  ws.getCell(`A${filaTotales}`).value = `Total de puntos: ${pedidosOrdenados.length}`;
  ws.getCell(`A${filaTotales}`).font = { bold:true, size:10, color:{ argb:NAVY } };
  ws.getCell(`J${filaTotales}`).value = "Subtotal";
  ws.getCell(`J${filaTotales}`).font = { bold:true, size:10 };
  ws.getCell(`K${filaTotales}`).value = "IGV 18%";
  ws.getCell(`K${filaTotales}`).font = { bold:true, size:10 };
  ws.getCell(`L${filaTotales}`).value = "TOTAL";
  ws.getCell(`L${filaTotales}`).font = { bold:true, size:11, color:{ argb:NAVY } };

  const filaMontos = filaTotales + 1;
  ws.getCell(`J${filaMontos}`).value = subtotal;
  ws.getCell(`K${filaMontos}`).value = subtotal*0.18;
  ws.getCell(`L${filaMontos}`).value = subtotal*1.18;
  [`J${filaMontos}`,`K${filaMontos}`,`L${filaMontos}`].forEach(c=>{
    ws.getCell(c).numFmt = '"S/" #,##0.00';
    ws.getCell(c).font = { bold:true, size:11, color:{ argb:NAVY } };
    ws.getCell(c).fill = { type:"pattern", pattern:"solid", fgColor:{ argb:AMBER } };
  });

  // ── Resumen operativo ──
  let filaResumen = filaMontos + 3;
  ws.getCell(`A${filaResumen}`).value = "RESUMEN OPERATIVO";
  ws.getCell(`A${filaResumen}`).font = { bold:true, size:11, color:{ argb:NAVY } };
  filaResumen++;
  const pesoTotal = pedidosOrdenados.reduce((a,p)=>a+(parseFloat(p.peso_kg)||0),0);
  [["Puntos de entrega:", pedidosOrdenados.length],
   ["Peso total:", `${pesoTotal.toFixed(1)} kg`],
   ["Entregados:", pedidosOrdenados.filter(p=>p.estado==="entregado").length],
   ["No entregados:", pedidosOrdenados.filter(p=>p.estado==="no_entregado").length],
  ].forEach(([label,val])=>{
    ws.getCell(`A${filaResumen}`).value = label;
    ws.getCell(`A${filaResumen}`).font = { size:10 };
    ws.getCell(`C${filaResumen}`).value = val;
    ws.getCell(`C${filaResumen}`).font = { bold:true, size:10 };
    filaResumen++;
  });

  // ── Tarifario de referencia ──
  filaResumen++;
  ws.getCell(`A${filaResumen}`).value = "TARIFARIO SAME DAY DE REFERENCIA (sin IGV)";
  ws.getCell(`A${filaResumen}`).font = { bold:true, size:11, color:{ argb:NAVY } };
  filaResumen++;
  const filaTarifHead = filaResumen;
  ["Ámbito","XS (0-1kg)","S (1-3kg)","M (3-7kg)"].forEach((h,i)=>{
    const c = ws.getCell(filaTarifHead, i+1);
    c.value = h; c.font = { bold:true, size:9, color:{ argb:WHITE } };
    c.fill = { type:"pattern", pattern:"solid", fgColor:{ argb:NAVY } };
    c.border = borde;
  });
  [["Urbano",10,13,16],["Semi Urbano",12,15,18],["Periférico",15,18,22]].forEach((fila,i)=>{
    const f = filaTarifHead + 1 + i;
    fila.forEach((v,j)=>{
      const c = ws.getCell(f, j+1);
      c.value = j===0 ? v : `S/ ${v}`;
      c.font = { size:9 };
      c.border = borde;
      if (i%2===1) c.fill = { type:"pattern", pattern:"solid", fgColor:{ argb:LIGHT_GRAY } };
    });
  });

  ws.views = [{ state:"frozen", ySplit: filaTabla, showGridLines:false }];

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type:"application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${numeroLiquidacion}-${empresa.nombre.replace(/\s+/g,"-")}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

// Igual que generarLiquidacionEntregas, pero para clientes de Transporte y
// Carga (Deliverman, Globalia, etc.) que no tienen pedidos — se liquidan por
// placa y días de servicio trabajados dentro del rango elegido.
async function generarLiquidacionTransporte({ filasTransporte, empresa, fechaInicio, fechaFin, numeroLiquidacion, toast }) {
  const ExcelJS = await cargarExcelJS();
  if (!ExcelJS) { toast("No se pudo cargar el generador de Excel — revisa tu conexión","error"); return; }

  const NAVY = "FF1B2A4A", AMBER = "FFE8A33D", LIGHT_GRAY = "FFF2F2F2", WHITE = "FFFFFFFF", BLUE_EDIT = "FFEFF6FF";
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Liquidación", { views: [{ showGridLines: false }] });

  const anchos = [5, 14, 16, 42, 14, 12, 12, 11, 12];
  anchos.forEach((w,i)=>{ ws.getColumn(i+1).width = w; });

  const bordeFino = { style:"thin", color:{ argb:"FFBFBFBF" } };
  const borde = { top:bordeFino, left:bordeFino, right:bordeFino, bottom:bordeFino };

  ws.mergeCells("A1:I1");
  const titulo = ws.getCell("A1");
  titulo.value = "GRUPO BOAZ S.A.C.";
  titulo.font = { size:16, bold:true, color:{ argb:WHITE } };
  titulo.fill = { type:"pattern", pattern:"solid", fgColor:{ argb:NAVY } };
  titulo.alignment = { horizontal:"center", vertical:"middle" };
  ws.getRow(1).height = 28;

  ws.mergeCells("A2:I2");
  const sub = ws.getCell("A2");
  sub.value = "RUC 20613172301  ·  Con Boaz, tu negocio no para  ·  contacto@boaz.com.pe  ·  +51 960 622 471";
  sub.font = { size:9, color:{ argb:WHITE } };
  sub.fill = { type:"pattern", pattern:"solid", fgColor:{ argb:NAVY } };
  sub.alignment = { horizontal:"center" };

  ws.mergeCells("A4:I4");
  const tituloDoc = ws.getCell("A4");
  tituloDoc.value = "LIQUIDACIÓN DE SERVICIOS DE TRANSPORTE";
  tituloDoc.font = { size:13, bold:true, color:{ argb:NAVY } };
  tituloDoc.alignment = { horizontal:"center" };

  const infoRows = [
    ["N° de Liquidación:", numeroLiquidacion],
    ["Cliente:", empresa.nombre],
    ["RUC del cliente:", empresa.ruc||"—"],
    ["Periodo:", `${fmt.fecha(fechaInicio+"T00:00:00")} al ${fmt.fecha(fechaFin+"T00:00:00")}`],
    ["Tipo de servicio:", "Transporte y Carga — por día"],
  ];
  let filaInfo = 6;
  infoRows.forEach(([label,val])=>{
    ws.getCell(`A${filaInfo}`).value = label;
    ws.getCell(`A${filaInfo}`).font = { bold:true, size:10, color:{ argb:NAVY } };
    ws.mergeCells(`B${filaInfo}:D${filaInfo}`);
    ws.getCell(`B${filaInfo}`).value = val;
    ws.getCell(`B${filaInfo}`).font = { size:10 };
    filaInfo++;
  });

  const filaTabla = filaInfo + 1;
  const encabezados = ["N°","Placa","Tipo de Vehículo","Detalle de Servicio","Días trabajados","Tarifa/día","Subtotal","IGV","Total"];
  encabezados.forEach((h,i)=>{
    const celda = ws.getCell(filaTabla, i+1);
    celda.value = h;
    celda.font = { bold:true, size:10, color:{ argb:WHITE } };
    celda.fill = { type:"pattern", pattern:"solid", fgColor:{ argb:NAVY } };
    celda.alignment = { horizontal:"center", vertical:"middle" };
    celda.border = borde;
  });
  ws.getRow(filaTabla).height = 20;

  let subtotal = 0, diasTotales = 0;
  filasTransporte.forEach((f,i)=>{
    const fila = filaTabla + 1 + i;
    subtotal += f.monto;
    diasTotales += f.dias;
    const tipoVehiculo = f.unidad?.tipo_vehiculo||"—";
    const placa = f.unidad?.placa||"—";
    const detalle = `SERVICIO DE TRANSPORTE REALIZADO CON LA UNIDAD ${tipoVehiculo.toUpperCase()} DE PLACA ${placa}, ${f.dias} DÍA${f.dias===1?"":"S"} DE SERVICIO`;
    const valores = [i+1, placa, tipoVehiculo, detalle, f.dias,
      parseFloat(f.asignacion.tarifa_dia)||0, f.monto, f.igv, f.total];
    valores.forEach((v,j)=>{
      const celda = ws.getCell(fila, j+1);
      celda.value = v;
      celda.border = borde;
      celda.font = { size:10 };
      if (j===3) celda.font = { size:8, italic:true, color:{ argb:"FF4B5563" } };
      if (i%2===1) celda.fill = { type:"pattern", pattern:"solid", fgColor:{ argb:LIGHT_GRAY } };
      if (j===5) celda.fill = { type:"pattern", pattern:"solid", fgColor:{ argb:BLUE_EDIT } }; // tarifa/día editable
      if (j>=5) celda.numFmt = '"S/" #,##0.00';
      if (j===0 || j===4) celda.alignment = { horizontal:"center" };
    });
  });

  const filaTotales = filaTabla + 1 + filasTransporte.length;
  ws.mergeCells(`A${filaTotales}:F${filaTotales}`);
  ws.getCell(`A${filaTotales}`).value = `Total de unidades: ${filasTransporte.length}  ·  Total de días: ${diasTotales}`;
  ws.getCell(`A${filaTotales}`).font = { bold:true, size:10, color:{ argb:NAVY } };
  ws.getCell(`G${filaTotales}`).value = "Subtotal";
  ws.getCell(`G${filaTotales}`).font = { bold:true, size:9 };
  ws.getCell(`H${filaTotales}`).value = "IGV 18%";
  ws.getCell(`H${filaTotales}`).font = { bold:true, size:9 };
  ws.getCell(`I${filaTotales}`).value = "TOTAL";
  ws.getCell(`I${filaTotales}`).font = { bold:true, size:11, color:{ argb:NAVY } };

  const filaMontos = filaTotales + 1;
  ws.getCell(`G${filaMontos}`).value = subtotal;
  ws.getCell(`H${filaMontos}`).value = subtotal*0.18;
  ws.getCell(`I${filaMontos}`).value = subtotal*1.18;
  [`G${filaMontos}`,`H${filaMontos}`,`I${filaMontos}`].forEach(c=>{
    ws.getCell(c).numFmt = '"S/" #,##0.00';
    ws.getCell(c).font = { bold:true, size:11, color:{ argb:NAVY } };
    ws.getCell(c).fill = { type:"pattern", pattern:"solid", fgColor:{ argb:AMBER } };
  });

  // ── Tarifas realmente aplicadas en esta liquidación (no el tarifario
  // estándar genérico — el costo real del servicio prestado por vehículo) ──
  let filaResumen = filaMontos + 3;
  ws.getCell(`A${filaResumen}`).value = "TARIFAS APLICADAS EN ESTA LIQUIDACIÓN (sin IGV)";
  ws.getCell(`A${filaResumen}`).font = { bold:true, size:11, color:{ argb:NAVY } };
  filaResumen++;
  const filaTarifHead = filaResumen;
  ["Placa","Tipo de vehículo","Tarifa/día aplicada"].forEach((h,i)=>{
    const c = ws.getCell(filaTarifHead, i+1);
    c.value = h; c.font = { bold:true, size:9, color:{ argb:WHITE } };
    c.fill = { type:"pattern", pattern:"solid", fgColor:{ argb:NAVY } };
    c.border = borde;
  });
  filasTransporte.forEach((f,i)=>{
    const fila = filaTarifHead + 1 + i;
    [f.unidad?.placa||"—", f.unidad?.tipo_vehiculo||"—", `S/ ${(parseFloat(f.asignacion.tarifa_dia)||0).toFixed(2)}`].forEach((v,j)=>{
      const c = ws.getCell(fila, j+1);
      c.value = v;
      c.font = { size:9 };
      c.border = borde;
      if (i%2===1) c.fill = { type:"pattern", pattern:"solid", fgColor:{ argb:LIGHT_GRAY } };
    });
  });

  ws.views = [{ state:"frozen", ySplit: filaTabla, showGridLines:false }];

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type:"application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${numeroLiquidacion}-${empresa.nombre.replace(/\s+/g,"-")}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

function LiquidacionClientes({ pedidos, empresas, unidades, asignacionesUnidad, diasServicio, tarifarioVehiculoEstandar, recargoFeriadoPct, toast }) {
  const hoy = new Date().toISOString().split("T")[0];
  const primerDiaMes = hoy.slice(0,8)+"01";
  const [empresaId, setEmpresaId] = useState("todas");
  const [fechaInicio, setFechaInicio] = useState(primerDiaMes);
  const [fechaFin, setFechaFin] = useState(hoy);
  const [generado, setGenerado] = useState(false);
  const [generandoLiquidacion, setGenerandoLiquidacion] = useState(false);

  // Si el cliente elegido tiene asignaciones de unidades registradas, es un
  // cliente de Transporte y Carga — el reporte se arma por placa/días
  // trabajados en vez de por pedidos.
  const esClienteTransporte = empresaId!=="todas" && asignacionesUnidad.some(a=>a.empresa_id===empresaId);

  const diasTrabajadosEnRango = (asignacion) => {
    const registrados = diasServicio.filter(d=>d.asignacion_id===asignacion.id && d.fecha>=fechaInicio && d.fecha<=fechaFin);
    if (registrados.length > 0) return registrados.filter(d=>d.prestado).length;
    // Sin registro explícito de calendario: estima por solapamiento entre el
    // rango de la asignación y el rango de fechas elegido para el reporte.
    const inicioAsig = new Date(asignacion.fecha_inicio+"T00:00:00");
    const finAsig = asignacion.fecha_fin ? new Date(asignacion.fecha_fin+"T00:00:00") : new Date();
    const inicioRango = new Date(fechaInicio+"T00:00:00");
    const finRango = new Date(fechaFin+"T00:00:00");
    const desde = inicioAsig > inicioRango ? inicioAsig : inicioRango;
    const hasta = finAsig < finRango ? finAsig : finRango;
    if (hasta < desde) return 0;
    return Math.round((hasta-desde)/86400000)+1;
  };

  const filasTransporte = esClienteTransporte
    ? asignacionesUnidad.filter(a=>a.empresa_id===empresaId).map(a=>{
        const tarifaDia = parseFloat(a.tarifa_dia)||0;
        const registrados = diasServicio.filter(d=>d.asignacion_id===a.id && d.fecha>=fechaInicio && d.fecha<=fechaFin && d.prestado);
        let dias, monto;
        if (registrados.length > 0) {
          dias = registrados.length;
          monto = registrados.reduce((sum,d)=>{
            const recargo = esFeriadoPeru(d.fecha) ? tarifaDia*(recargoFeriadoPct/100) : 0;
            return sum + tarifaDia + recargo;
          }, 0);
        } else {
          dias = diasTrabajadosEnRango(a); // sin fechas exactas registradas: estimado, sin recargo
          monto = dias * tarifaDia;
        }
        const unidad = unidades.find(u=>u.id===a.unidad_id);
        return { asignacion:a, unidad, dias, monto, igv: monto*0.18, total: monto*1.18 };
      }).filter(f=>f.dias>0)
    : [];
  const subtotalTransporte = filasTransporte.reduce((s,f)=>s+f.monto,0);
  const igvTransporte = subtotalTransporte*0.18;
  const totalTransporte = subtotalTransporte*1.18;

  const dentroDelRango = (p) => {
    if (!p.created_at) return false;
    const fecha = new Date(p.created_at);
    const desde = new Date(fechaInicio+"T00:00:00");
    const hasta = new Date(fechaFin+"T23:59:59");
    return fecha >= desde && fecha <= hasta;
  };

  const filtrados = pedidos
    .filter(p => (empresaId==="todas" || p.empresa_id===empresaId) && dentroDelRango(p))
    .sort((a,b)=> new Date(a.created_at) - new Date(b.created_at));

  const nombreEmpresa = (id) => empresas.find(e=>e.id===id)?.nombre || "—";

  const subtotal = filtrados.reduce((a,p)=>a+(parseFloat(p.tarifa_s)||0),0);
  const igv = subtotal * 0.18;
  const total = subtotal * 1.18;

  // Agrupado por cliente, solo relevante cuando se ve "Todos los clientes"
  const porCliente = {};
  filtrados.forEach(p=>{
    const key = p.empresa_id || "sin_empresa";
    if (!porCliente[key]) porCliente[key] = { nombre: nombreEmpresa(p.empresa_id), pedidos:[], subtotal:0 };
    porCliente[key].pedidos.push(p);
    porCliente[key].subtotal += parseFloat(p.tarifa_s)||0;
  });

  const exportarExcel = () => {
    if (esClienteTransporte) { toast("Este cliente se liquida por días de transporte — usa el botón de Liquidación de Transporte","error"); return; }
    if (filtrados.length===0) { toast("No hay pedidos en este rango para exportar","error"); return; }
    const filas = filtrados.map(p=>{
      const sub = parseFloat(p.tarifa_s)||0;
      return [
        p.omd, p.cliente_referencia||"", empresaId==="todas"?nombreEmpresa(p.empresa_id):undefined,
        p.dest_nombre, p.tipo_servicio||"", fmt.fecha(p.created_at),
        sub.toFixed(2), (sub*0.18).toFixed(2), (sub*1.18).toFixed(2),
      ].filter(v=>v!==undefined);
    });
    const encabezados = ["Tracking Boaz","N° Orden","Cliente","Destinatario","Servicio","Fecha","Subtotal","IGV","Total"]
      .filter((h,i)=> empresaId==="todas" || i!==2);
    const ws = XLSX.utils.aoa_to_sheet([encabezados, ...filas,
      [], ["","","","","","Subtotal", subtotal.toFixed(2)],
      ["","","","","","IGV 18%", igv.toFixed(2)],
      ["","","","","","TOTAL", total.toFixed(2)],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Reporte");
    const nombreCliente = empresaId==="todas" ? "todos-los-clientes" : nombreEmpresa(empresaId).replace(/\s+/g,"-").toLowerCase();
    XLSX.writeFile(wb, `reporte-facturacion-${nombreCliente}-${fechaInicio}-a-${fechaFin}.xlsx`);
  };

  const imprimir = () => {
    if (esClienteTransporte) { toast("Este cliente se liquida por días de transporte — usa el botón de Liquidación de Transporte","error"); return; }
    if (filtrados.length===0) { toast("No hay pedidos en este rango para imprimir","error"); return; }
    const filasHtml = filtrados.map(p=>{
      const sub = parseFloat(p.tarifa_s)||0;
      return `<tr>
        <td>${p.omd}</td><td>${p.cliente_referencia||"—"}</td>
        ${empresaId==="todas"?`<td>${nombreEmpresa(p.empresa_id)}</td>`:""}
        <td>${p.dest_nombre}</td><td>${p.tipo_servicio||"—"}</td><td>${fmt.fecha(p.created_at)}</td>
        <td style="text-align:right">S/ ${sub.toFixed(2)}</td>
      </tr>`;
    }).join("");
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Reporte de facturación</title>
      <style>
        body{font-family:Arial,sans-serif;padding:24px;color:#0D1E3D}
        h1{font-size:18px;margin-bottom:4px} .sub{color:#64748B;font-size:12px;margin-bottom:20px}
        table{width:100%;border-collapse:collapse;font-size:12px}
        th{background:#F0F4F8;text-align:left;padding:8px;border-bottom:2px solid #D4AF37}
        td{padding:7px 8px;border-bottom:1px solid #E2E8F0}
        .totales{margin-top:16px;text-align:right;font-size:13px}
        .totales div{margin-bottom:4px} .totales strong{font-size:16px;color:#D4AF37}
      </style></head><body>
      <h1>Reporte de facturación — ${empresaId==="todas"?"Todos los clientes":nombreEmpresa(empresaId)}</h1>
      <div class="sub">Del ${fmt.fecha(fechaInicio+"T00:00:00")} al ${fmt.fecha(fechaFin+"T00:00:00")} · ${filtrados.length} pedido${filtrados.length===1?"":"s"}</div>
      <table><thead><tr>
        <th>Tracking Boaz</th><th>N° Orden</th>${empresaId==="todas"?"<th>Cliente</th>":""}<th>Destinatario</th><th>Servicio</th><th>Fecha</th><th style="text-align:right">Subtotal</th>
      </tr></thead><tbody>${filasHtml}</tbody></table>
      <div class="totales">
        <div>Subtotal: S/ ${subtotal.toFixed(2)}</div>
        <div>IGV 18%: S/ ${igv.toFixed(2)}</div>
        <div><strong>TOTAL: S/ ${total.toFixed(2)}</strong></div>
      </div>
      <button onclick="window.print()" style="margin-top:20px;padding:10px 20px;font-size:14px;cursor:pointer;">🖨️ Imprimir</button>
      </body></html>`;
    const ventana = window.open("", "_blank");
    if (!ventana) return;
    ventana.document.write(html);
    ventana.document.close();
  };

  const generarLiquidacion = async () => {
    const empresa = empresas.find(e=>e.id===empresaId);
    if (!empresa) return;
    const numeroLiquidacion = `LIQ-BOAZ-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`;
    if (esClienteTransporte) {
      if (filasTransporte.length===0) { toast("No hay días de servicio registrados en este rango para generar la liquidación","error"); return; }
      setGenerandoLiquidacion(true);
      await generarLiquidacionTransporte({
        filasTransporte, empresa, fechaInicio, fechaFin, numeroLiquidacion, toast,
      });
      setGenerandoLiquidacion(false);
      toast("Liquidación de transporte generada ✓ — revisa el número correlativo antes de enviarla");
      return;
    }
    if (filtrados.length===0) { toast("No hay pedidos en este rango para generar la liquidación","error"); return; }
    setGenerandoLiquidacion(true);
    await generarLiquidacionEntregas({
      pedidosOrdenados: filtrados, empresa, fechaInicio, fechaFin, numeroLiquidacion, toast,
    });
    setGenerandoLiquidacion(false);
    toast("Liquidación de entregas generada ✓ — revisa el número correlativo antes de enviarla");
  };

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
        <div style={{ fontSize:18, fontWeight:800, color:B.navy }}>💼 Liquidación de Clientes</div>
      </div>
      <div style={{ fontSize:12, color:B.textMut, marginBottom:16 }}>
        Elige un cliente y un rango de fechas para ver qué guías/pedidos (o placas y días de transporte) entran en la facturación de ese periodo.
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1.4fr 1fr 1fr auto", gap:10, marginBottom:16, alignItems:"end" }}>
        <div><label style={lbl}>Cliente</label>
          <select style={inp} value={empresaId} onChange={e=>{setEmpresaId(e.target.value); setGenerado(false);}}>
            <option value="todas">Todos los clientes</option>
            {empresas.map(e=><option key={e.id} value={e.id}>{e.nombre}</option>)}
          </select>
        </div>
        <div><label style={lbl}>Desde</label>
          <input type="date" style={inp} value={fechaInicio} onChange={e=>{setFechaInicio(e.target.value); setGenerado(false);}}/></div>
        <div><label style={lbl}>Hasta</label>
          <input type="date" style={inp} value={fechaFin} onChange={e=>{setFechaFin(e.target.value); setGenerado(false);}}/></div>
        <BtnPri onClick={()=>setGenerado(true)}>Generar</BtnPri>
      </div>

      {generado && (
          <>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginBottom:16 }}>
              <div style={{ background:B.bg, borderRadius:10, padding:14 }}>
                <div style={{ fontSize:10, color:B.textMut }}>{esClienteTransporte ? "UNIDADES" : "PEDIDOS"}</div>
                <div style={{ fontSize:18, fontWeight:800, color:B.navy }}>
                  {esClienteTransporte ? filasTransporte.length : filtrados.length}
                </div>
              </div>
              <div style={{ background:B.bg, borderRadius:10, padding:14 }}>
                <div style={{ fontSize:10, color:B.textMut }}>SUBTOTAL + IGV</div>
                <div style={{ fontSize:14, color:B.textSec }}>
                  {esClienteTransporte
                    ? `${fmt.sol(subtotalTransporte)} + ${fmt.sol(igvTransporte)}`
                    : `${fmt.sol(subtotal)} + ${fmt.sol(igv)}`}
                </div>
              </div>
              <div style={{ background:"#FFF8EF", borderRadius:10, padding:14, border:`1px solid ${B.gold}` }}>
                <div style={{ fontSize:10, color:B.textMut }}>TOTAL A FACTURAR</div>
                <div style={{ fontSize:18, fontWeight:800, color:B.gold }}>
                  {fmt.sol(esClienteTransporte ? totalTransporte : total)}
                </div>
              </div>
            </div>

            {esClienteTransporte && (
              <div style={{ background:"#EFF6FF", border:"1px solid #BFDBFE", borderRadius:10,
                padding:"10px 14px", marginBottom:16, fontSize:12, color:"#1E40AF" }}>
                🚛 Este cliente se liquida por <strong>días de transporte trabajados</strong> (Unidades), no por pedidos — por eso la tabla de abajo muestra placas en vez de guías.
              </div>
            )}

            {!esClienteTransporte && empresaId==="todas" && Object.keys(porCliente).length>1 && (
              <div style={{ marginBottom:16, display:"flex", flexWrap:"wrap", gap:8 }}>
                {Object.values(porCliente).map((c,i)=>(
                  <div key={i} style={{ fontSize:11, background:B.bg, borderRadius:20, padding:"5px 12px" }}>
                    <strong style={{ color:B.navy }}>{c.nombre}</strong>: {c.pedidos.length} pedidos · {fmt.sol(c.subtotal*1.18)}
                  </div>
                ))}
              </div>
            )}

            <div style={{ display:"flex", gap:10, marginBottom:14, flexWrap:"wrap" }}>
              {!esClienteTransporte && (
                <>
                  <BtnSec onClick={exportarExcel}>📥 Exportar a Excel</BtnSec>
                  <BtnSec onClick={imprimir}>🖨️ Imprimir / PDF</BtnSec>
                </>
              )}
              {empresaId!=="todas" && (
                <BtnPri onClick={generarLiquidacion} disabled={generandoLiquidacion}>
                  {generandoLiquidacion ? "Generando..." : esClienteTransporte
                    ? "📄 Generar Liquidación de Transporte (formato Boaz)"
                    : "📄 Generar Liquidación de Entregas (formato Boaz)"}
                </BtnPri>
              )}
            </div>
            {empresaId==="todas" && (
              <div style={{ fontSize:11, color:B.textMut, marginTop:-8, marginBottom:14 }}>
                Elige un cliente específico (no "Todos los clientes") para generar la liquidación con el formato Boaz.
              </div>
            )}

            {esClienteTransporte ? (
              <div style={{ background:B.white, border:`1px solid ${B.border}`, borderRadius:12,
                overflow:"hidden", maxHeight:340, overflowY:"auto" }}>
                <table style={{ width:"100%", borderCollapse:"collapse" }}>
                  <thead style={{ position:"sticky", top:0 }}>
                    <tr style={{ background:B.bg }}>
                      {["Placa","Tipo de Vehículo","Días trabajados","Tarifa/día","Subtotal"].map(h=>(
                        <th key={h} style={{ padding:"8px 12px", textAlign:"left", fontSize:10,
                          color:B.textMut, fontWeight:700, textTransform:"uppercase" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filasTransporte.map((f,i)=>(
                      <tr key={f.asignacion.id} style={{ borderTop:`1px solid ${B.border}`, background:i%2===0?B.white:"#F8FAFC" }}>
                        <td style={{ padding:"8px 12px", fontSize:12, fontWeight:700, color:B.navy }}>{f.unidad?.placa||"—"}</td>
                        <td style={{ padding:"8px 12px", fontSize:12, color:B.textPri, textTransform:"capitalize" }}>{f.unidad?.tipo_vehiculo||"—"}</td>
                        <td style={{ padding:"8px 12px", fontSize:12, color:B.textSec }}>{f.dias}</td>
                        <td style={{ padding:"8px 12px", fontSize:12, color:B.textSec }}>{fmt.sol(f.asignacion.tarifa_dia)}</td>
                        <td style={{ padding:"8px 12px", fontSize:12, fontWeight:600, color:B.textPri }}>{fmt.sol(f.monto)}</td>
                      </tr>
                    ))}
                    {filasTransporte.length===0 && (
                      <tr><td colSpan={5} style={{ padding:30, textAlign:"center", color:B.textMut, fontSize:13 }}>
                        No hay días de servicio en este rango de fechas
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ background:B.white, border:`1px solid ${B.border}`, borderRadius:12,
                overflow:"hidden", maxHeight:340, overflowY:"auto" }}>
                <table style={{ width:"100%", borderCollapse:"collapse" }}>
                  <thead style={{ position:"sticky", top:0 }}>
                    <tr style={{ background:B.bg }}>
                      {["Tracking Boaz","N° Orden", ...(empresaId==="todas"?["Cliente"]:[]), "Destinatario","Servicio","Fecha","Subtotal"].map(h=>(
                        <th key={h} style={{ padding:"8px 12px", textAlign:"left", fontSize:10,
                          color:B.textMut, fontWeight:700, textTransform:"uppercase" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtrados.map((p,i)=>(
                      <tr key={p.id} style={{ borderTop:`1px solid ${B.border}`, background:i%2===0?B.white:"#F8FAFC" }}>
                        <td style={{ padding:"8px 12px", fontSize:12, fontWeight:700, color:B.navy }}>{p.omd}</td>
                        <td style={{ padding:"8px 12px", fontSize:12, color:B.textSec }}>{p.cliente_referencia||"—"}</td>
                        {empresaId==="todas" && <td style={{ padding:"8px 12px", fontSize:12, color:B.textSec }}>{nombreEmpresa(p.empresa_id)}</td>}
                        <td style={{ padding:"8px 12px", fontSize:12, color:B.textPri }}>{p.dest_nombre}</td>
                        <td style={{ padding:"8px 12px", fontSize:11, color:B.textSec }}>{p.tipo_servicio||"—"}</td>
                        <td style={{ padding:"8px 12px", fontSize:11, color:B.textMut }}>{fmt.fecha(p.created_at)}</td>
                        <td style={{ padding:"8px 12px", fontSize:12, fontWeight:600, color:B.textPri }}>{fmt.sol(p.tarifa_s)}</td>
                      </tr>
                    ))}
                    {filtrados.length===0 && (
                      <tr><td colSpan={7} style={{ padding:30, textAlign:"center", color:B.textMut, fontSize:13 }}>
                        No hay pedidos en este rango de fechas
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
    </div>
  );
}

function ModalMarcarPagada({ factura, onClose, onConfirmar }) {
  const [fecha, setFecha] = useState(new Date().toISOString().split("T")[0]);
  const [banco, setBanco] = useState("");
  const [numeroOperacion, setNumeroOperacion] = useState("");
  return (
    <div style={{ position:"fixed", inset:0, background:"#0008", zIndex:1000,
      display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ background:B.white, borderRadius:16, padding:28, width:420, boxShadow:"0 20px 60px #0003" }}>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:16 }}>
          <div style={{ fontSize:15, fontWeight:800, color:B.navy }}>💰 Marcar factura como pagada</div>
          <button onClick={onClose} style={{ background:"none", border:"none", fontSize:18, color:B.textSec, cursor:"pointer" }}>✕</button>
        </div>
        <div style={{ fontSize:13, color:B.textSec, marginBottom:16 }}>
          {factura.serie}-{factura.numero} — {factura.empresas?.nombre} — <strong style={{color:B.navy}}>{fmt.sol(factura.total_s)}</strong>
        </div>
        <label style={lbl}>Fecha de pago</label>
        <input type="date" style={{ ...inp, marginBottom:12 }} value={fecha} onChange={e=>setFecha(e.target.value)}/>
        <label style={lbl}>Banco</label>
        <select style={{ ...inp, marginBottom:12 }} value={banco} onChange={e=>setBanco(e.target.value)}>
          <option value="">— Selecciona —</option>
          <option value="BCP">BCP</option>
          <option value="BBVA">BBVA</option>
          <option value="Interbank">Interbank</option>
          <option value="Scotiabank">Scotiabank</option>
          <option value="Banco de la Nación">Banco de la Nación</option>
          <option value="Otro">Otro</option>
        </select>
        <label style={lbl}>N° de operación</label>
        <input style={{ ...inp, marginBottom:20 }} value={numeroOperacion} onChange={e=>setNumeroOperacion(e.target.value)} placeholder="Ej. 001-4521789"/>
        <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
          <BtnSec onClick={onClose}>Cancelar</BtnSec>
          <BtnPri onClick={()=>onConfirmar(fecha, banco, numeroOperacion)}>Confirmar pago</BtnPri>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// MÓDULO: PLANILLA (personal propio + terceros por honorarios/factura)
// ══════════════════════════════════════════════════════════════
const PORCENTAJE_ONP = 13;
const PORCENTAJE_ESSALUD = 9; // lo paga la empresa, no se descuenta al trabajador
const UMBRAL_RETENCION_HONORARIOS = 1500; // referencial — confirma caso por caso

function calcularNetoPlanilla(sueldoBruto, sistemaPension, porcentajeAfp) {
  const bruto = parseFloat(sueldoBruto) || 0;
  const pctPension = sistemaPension === "afp" ? (parseFloat(porcentajeAfp) || 0) : PORCENTAJE_ONP;
  const descuentoPension = bruto * (pctPension / 100);
  const essalud = bruto * (PORCENTAJE_ESSALUD / 100); // informativo, costo empleador
  const neto = bruto - descuentoPension;
  return { descuentoPension, essalud, neto, pctPension };
}

function Planilla({ toast }) {
  const [tab, setTab] = useState("planilla");
  const [personal, setPersonal] = useState([]);
  const [terceros, setTerceros] = useState([]);
  const [pagosPlanilla, setPagosPlanilla] = useState([]);
  const [pagosTerceros, setPagosTerceros] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [modalPersonal, setModalPersonal] = useState(false);
  const [editandoPersonal, setEditandoPersonal] = useState(null);
  const [modalTercero, setModalTercero] = useState(false);
  const [editandoTercero, setEditandoTercero] = useState(null);
  const [modalPago, setModalPago] = useState(null); // { tipo:'planilla'|'tercero', registro }

  const cargar = async () => {
    setCargando(true);
    const [p, t, pp, pt] = await Promise.all([
      sb.from("personal_planilla").select("*").order("nombres"),
      sb.from("terceros_planilla").select("*").order("nombre"),
      sb.from("pagos_planilla").select("*,personal_planilla(nombres,apellidos)").order("created_at",{ascending:false}),
      sb.from("pagos_terceros").select("*,terceros_planilla(nombre)").order("created_at",{ascending:false}),
    ]);
    if (p.data) setPersonal(p.data);
    if (t.data) setTerceros(t.data);
    if (pp.data) setPagosPlanilla(pp.data);
    if (pt.data) setPagosTerceros(pt.data);
    setCargando(false);
  };
  useEffect(() => { cargar(); }, []);

  const totalMensualPlanilla = personal.filter(p=>p.activo)
    .reduce((s,p)=>s + calcularNetoPlanilla(p.sueldo_bruto, p.sistema_pension, p.porcentaje_afp).neto, 0);
  const pendientesPlanilla = pagosPlanilla.filter(p=>p.estado==="pendiente").length;
  const pendientesTerceros = pagosTerceros.filter(p=>p.estado==="pendiente").length;

  if (cargando) return <div style={{ padding:40, textAlign:"center", color:B.textMut }}>Cargando...</div>;

  return (
    <div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:14, marginBottom:20 }}>
        <div style={{ background:B.white, border:`1px solid ${B.border}`, borderRadius:12, padding:18, borderTop:`3px solid ${B.navy}` }}>
          <div style={{ fontSize:10, color:B.textMut }}>PERSONAL EN PLANILLA (activos)</div>
          <div style={{ fontSize:20, fontWeight:800, color:B.navy }}>{personal.filter(p=>p.activo).length}</div>
        </div>
        <div style={{ background:"#FFF8EF", border:`1px solid ${B.gold}`, borderRadius:12, padding:18 }}>
          <div style={{ fontSize:10, color:B.textMut }}>NETO MENSUAL ESTIMADO (planilla activa)</div>
          <div style={{ fontSize:20, fontWeight:800, color:B.gold }}>{fmt.sol(totalMensualPlanilla)}</div>
        </div>
        <div style={{ background:B.white, border:`1px solid ${B.border}`, borderRadius:12, padding:18, borderTop:`3px solid ${B.red}` }}>
          <div style={{ fontSize:10, color:B.textMut }}>PAGOS PENDIENTES</div>
          <div style={{ fontSize:20, fontWeight:800, color:B.red }}>{pendientesPlanilla + pendientesTerceros}</div>
        </div>
      </div>

      <div style={{ display:"flex", gap:6, marginBottom:16 }}>
        {[["planilla","👤 Personal en Planilla"],["terceros","🧾 Terceros (Honorarios/Factura)"]].map(([id,label])=>(
          <button key={id} onClick={()=>setTab(id)}
            style={{ padding:"8px 16px", borderRadius:8, fontSize:12, cursor:"pointer",
              border:`1px solid ${tab===id?B.gold:B.border}`,
              background:tab===id?B.gold:"transparent",
              color:tab===id?B.navy:B.textSec, fontWeight:tab===id?700:400 }}>
            {label}
          </button>
        ))}
      </div>

      {tab==="planilla" ? (
        <>
          <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:12 }}>
            <BtnPri onClick={()=>{setEditandoPersonal(null); setModalPersonal(true);}}>+ Nuevo trabajador</BtnPri>
          </div>
          <div style={{ background:B.white, border:`1px solid ${B.border}`, borderRadius:12, overflow:"hidden", marginBottom:20 }}>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead><tr style={{ background:B.bg }}>
                {["Nombre","Cargo","Sueldo bruto","Pensión","Descuento","EsSalud (empresa)","Neto","Estado","Acciones"].map(h=>(
                  <th key={h} style={{ padding:"9px 12px", textAlign:"left", fontSize:10, color:B.textMut, fontWeight:700, textTransform:"uppercase" }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {personal.map((p,i)=>{
                  const calc = calcularNetoPlanilla(p.sueldo_bruto, p.sistema_pension, p.porcentaje_afp);
                  return (
                    <tr key={p.id} style={{ borderTop:`1px solid ${B.border}`, background:i%2===0?B.white:"#F8FAFC", opacity:p.activo?1:0.5 }}>
                      <td style={{ padding:"9px 12px", fontSize:12, fontWeight:700, color:B.navy }}>{p.nombres} {p.apellidos}</td>
                      <td style={{ padding:"9px 12px", fontSize:12, color:B.textSec }}>{p.cargo||"—"}</td>
                      <td style={{ padding:"9px 12px", fontSize:12, color:B.textPri }}>{fmt.sol(p.sueldo_bruto)}</td>
                      <td style={{ padding:"9px 12px", fontSize:11, color:B.textSec, textTransform:"uppercase" }}>
                        {p.sistema_pension==="afp" ? `AFP ${p.afp_nombre||""} (${calc.pctPension}%)` : `ONP (${PORCENTAJE_ONP}%)`}
                      </td>
                      <td style={{ padding:"9px 12px", fontSize:12, color:B.red }}>- {fmt.sol(calc.descuentoPension)}</td>
                      <td style={{ padding:"9px 12px", fontSize:11, color:B.textMut }}>{fmt.sol(calc.essalud)}</td>
                      <td style={{ padding:"9px 12px", fontSize:13, fontWeight:800, color:B.gold }}>{fmt.sol(calc.neto)}</td>
                      <td style={{ padding:"9px 12px" }}>
                        <span style={{ fontSize:10, padding:"3px 8px", borderRadius:10, fontWeight:700,
                          background:p.activo?"#ECFDF5":"#F3F4F6", color:p.activo?B.green:B.textMut }}>
                          {p.activo?"Activo":"Inactivo"}
                        </span>
                      </td>
                      <td style={{ padding:"9px 12px" }}>
                        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                          <button onClick={()=>setModalPago({ tipo:"planilla", registro:p })}
                            style={{ fontSize:11, color:B.green, background:"none", border:"none", cursor:"pointer", fontWeight:700 }}>💰 Registrar pago</button>
                          <button onClick={()=>{setEditandoPersonal(p); setModalPersonal(true);}}
                            style={{ fontSize:11, color:B.blue, background:"none", border:"none", cursor:"pointer" }}>✏️ Editar</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {personal.length===0 && <tr><td colSpan={9} style={{ padding:30, textAlign:"center", color:B.textMut, fontSize:13 }}>Sin personal registrado</td></tr>}
              </tbody>
            </table>
          </div>

          <div style={{ fontSize:13, fontWeight:700, color:B.navy, marginBottom:10 }}>Historial de pagos</div>
          <div style={{ background:B.white, border:`1px solid ${B.border}`, borderRadius:12, overflow:"hidden" }}>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead><tr style={{ background:B.bg }}>
                {["Trabajador","Periodo","Neto pagado","Fecha de pago","Estado"].map(h=>(
                  <th key={h} style={{ padding:"9px 12px", textAlign:"left", fontSize:10, color:B.textMut, fontWeight:700, textTransform:"uppercase" }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {pagosPlanilla.slice(0,20).map((pg,i)=>(
                  <tr key={pg.id} style={{ borderTop:`1px solid ${B.border}`, background:i%2===0?B.white:"#F8FAFC" }}>
                    <td style={{ padding:"9px 12px", fontSize:12, color:B.textPri }}>{pg.personal_planilla?.nombres} {pg.personal_planilla?.apellidos}</td>
                    <td style={{ padding:"9px 12px", fontSize:12, color:B.textSec }}>{pg.periodo}</td>
                    <td style={{ padding:"9px 12px", fontSize:12, fontWeight:700, color:B.gold }}>{fmt.sol(pg.neto_pagar)}</td>
                    <td style={{ padding:"9px 12px", fontSize:11, color:B.textMut }}>{pg.fecha_pago?fmt.fecha(pg.fecha_pago+"T00:00:00"):"—"}</td>
                    <td style={{ padding:"9px 12px" }}>
                      <span style={{ fontSize:10, padding:"3px 8px", borderRadius:10, fontWeight:700,
                        background:pg.estado==="pagado"?"#ECFDF5":"#FFFBEB", color:pg.estado==="pagado"?B.green:B.goldDk }}>
                        {pg.estado==="pagado"?"Pagado":"Pendiente"}
                      </span>
                    </td>
                  </tr>
                ))}
                {pagosPlanilla.length===0 && <tr><td colSpan={5} style={{ padding:24, textAlign:"center", color:B.textMut, fontSize:13 }}>Sin pagos registrados</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <>
          <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:12 }}>
            <BtnPri onClick={()=>{setEditandoTercero(null); setModalTercero(true);}}>+ Nuevo tercero</BtnPri>
          </div>
          <div style={{ background:B.white, border:`1px solid ${B.border}`, borderRadius:12, overflow:"hidden", marginBottom:20 }}>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead><tr style={{ background:B.bg }}>
                {["Nombre","RUC/DNI","Tipo de documento","Servicio","Estado","Acciones"].map(h=>(
                  <th key={h} style={{ padding:"9px 12px", textAlign:"left", fontSize:10, color:B.textMut, fontWeight:700, textTransform:"uppercase" }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {terceros.map((t,i)=>(
                  <tr key={t.id} style={{ borderTop:`1px solid ${B.border}`, background:i%2===0?B.white:"#F8FAFC", opacity:t.activo?1:0.5 }}>
                    <td style={{ padding:"9px 12px", fontSize:12, fontWeight:700, color:B.navy }}>{t.nombre}</td>
                    <td style={{ padding:"9px 12px", fontSize:12, color:B.textSec }}>{t.ruc_dni||"—"}</td>
                    <td style={{ padding:"9px 12px", fontSize:11, color:B.textSec }}>
                      {t.tipo_documento==="factura"?"Factura":"Recibo por honorarios"}
                    </td>
                    <td style={{ padding:"9px 12px", fontSize:12, color:B.textPri }}>{t.servicio||"—"}</td>
                    <td style={{ padding:"9px 12px" }}>
                      <span style={{ fontSize:10, padding:"3px 8px", borderRadius:10, fontWeight:700,
                        background:t.activo?"#ECFDF5":"#F3F4F6", color:t.activo?B.green:B.textMut }}>
                        {t.activo?"Activo":"Inactivo"}
                      </span>
                    </td>
                    <td style={{ padding:"9px 12px" }}>
                      <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                        <button onClick={()=>setModalPago({ tipo:"tercero", registro:t })}
                          style={{ fontSize:11, color:B.green, background:"none", border:"none", cursor:"pointer", fontWeight:700 }}>💰 Registrar pago</button>
                        <button onClick={()=>{setEditandoTercero(t); setModalTercero(true);}}
                          style={{ fontSize:11, color:B.blue, background:"none", border:"none", cursor:"pointer" }}>✏️ Editar</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {terceros.length===0 && <tr><td colSpan={6} style={{ padding:30, textAlign:"center", color:B.textMut, fontSize:13 }}>Sin terceros registrados</td></tr>}
              </tbody>
            </table>
          </div>

          <div style={{ fontSize:13, fontWeight:700, color:B.navy, marginBottom:10 }}>Historial de pagos</div>
          <div style={{ background:B.white, border:`1px solid ${B.border}`, borderRadius:12, overflow:"hidden" }}>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead><tr style={{ background:B.bg }}>
                {["Tercero","N° Documento","Bruto","Retención 8%","Neto pagado","Fecha","Estado"].map(h=>(
                  <th key={h} style={{ padding:"9px 12px", textAlign:"left", fontSize:10, color:B.textMut, fontWeight:700, textTransform:"uppercase" }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {pagosTerceros.slice(0,20).map((pg,i)=>(
                  <tr key={pg.id} style={{ borderTop:`1px solid ${B.border}`, background:i%2===0?B.white:"#F8FAFC" }}>
                    <td style={{ padding:"9px 12px", fontSize:12, color:B.textPri }}>{pg.terceros_planilla?.nombre}</td>
                    <td style={{ padding:"9px 12px", fontSize:11, color:B.textSec }}>{pg.numero_documento||"—"}</td>
                    <td style={{ padding:"9px 12px", fontSize:12, color:B.textSec }}>{fmt.sol(pg.monto_bruto)}</td>
                    <td style={{ padding:"9px 12px", fontSize:11, color:pg.aplica_retencion?B.red:B.textMut }}>
                      {pg.aplica_retencion?`- ${fmt.sol(pg.monto_retencion)}`:"No aplica"}
                    </td>
                    <td style={{ padding:"9px 12px", fontSize:12, fontWeight:700, color:B.gold }}>{fmt.sol(pg.monto_neto)}</td>
                    <td style={{ padding:"9px 12px", fontSize:11, color:B.textMut }}>{pg.fecha_pago?fmt.fecha(pg.fecha_pago+"T00:00:00"):"—"}</td>
                    <td style={{ padding:"9px 12px" }}>
                      <span style={{ fontSize:10, padding:"3px 8px", borderRadius:10, fontWeight:700,
                        background:pg.estado==="pagado"?"#ECFDF5":"#FFFBEB", color:pg.estado==="pagado"?B.green:B.goldDk }}>
                        {pg.estado==="pagado"?"Pagado":"Pendiente"}
                      </span>
                    </td>
                  </tr>
                ))}
                {pagosTerceros.length===0 && <tr><td colSpan={7} style={{ padding:24, textAlign:"center", color:B.textMut, fontSize:13 }}>Sin pagos registrados</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}

      {modalPersonal && (
        <ModalPersonalPlanilla persona={editandoPersonal}
          onClose={()=>setModalPersonal(false)} onSaved={()=>{setModalPersonal(false); cargar();}} toast={toast}/>
      )}
      {modalTercero && (
        <ModalTerceroPlanilla tercero={editandoTercero}
          onClose={()=>setModalTercero(false)} onSaved={()=>{setModalTercero(false); cargar();}} toast={toast}/>
      )}
      {modalPago && (
        <ModalRegistrarPago tipo={modalPago.tipo} registro={modalPago.registro}
          onClose={()=>setModalPago(null)} onSaved={()=>{setModalPago(null); cargar();}} toast={toast}/>
      )}
    </div>
  );
}

function ModalPersonalPlanilla({ persona, onClose, onSaved, toast }) {
  const [f, setF] = useState(persona || {
    nombres:"", apellidos:"", dni:"", cargo:"", fecha_ingreso:"",
    sueldo_bruto:"", sistema_pension:"onp", afp_nombre:"", porcentaje_afp:"12.5",
  });
  const [guardando, setGuardando] = useState(false);
  const calc = calcularNetoPlanilla(f.sueldo_bruto, f.sistema_pension, f.porcentaje_afp);

  const guardar = async () => {
    if (!f.nombres || !f.apellidos || !f.sueldo_bruto) { toast("Completa nombres, apellidos y sueldo","error"); return; }
    setGuardando(true);
    const payload = {
      nombres:f.nombres, apellidos:f.apellidos, dni:f.dni||null, cargo:f.cargo||null,
      fecha_ingreso:f.fecha_ingreso||null, sueldo_bruto:parseFloat(f.sueldo_bruto)||0,
      sistema_pension:f.sistema_pension,
      afp_nombre: f.sistema_pension==="afp" ? (f.afp_nombre||null) : null,
      porcentaje_afp: f.sistema_pension==="afp" ? (parseFloat(f.porcentaje_afp)||0) : null,
      activo: f.activo ?? true,
    };
    let error;
    if (persona) ({ error } = await sb.from("personal_planilla").update(payload).eq("id", persona.id));
    else ({ error } = await sb.from("personal_planilla").insert([payload]));
    setGuardando(false);
    if (error) { toast("Error: "+error.message,"error"); return; }
    toast(persona?"Trabajador actualizado ✓":"Trabajador registrado ✓");
    onSaved();
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"#0008", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ background:B.white, borderRadius:16, padding:28, width:520, maxHeight:"88vh", overflowY:"auto", boxShadow:"0 20px 60px #0003" }}>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:16 }}>
          <div style={{ fontSize:15, fontWeight:800, color:B.navy }}>{persona?"Editar trabajador":"Nuevo trabajador en planilla"}</div>
          <button onClick={onClose} style={{ background:"none", border:"none", fontSize:18, color:B.textSec, cursor:"pointer" }}>✕</button>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
          <div><label style={lbl}>Nombres</label><input style={inp} value={f.nombres} onChange={e=>setF(p=>({...p,nombres:e.target.value}))}/></div>
          <div><label style={lbl}>Apellidos</label><input style={inp} value={f.apellidos} onChange={e=>setF(p=>({...p,apellidos:e.target.value}))}/></div>
          <div><label style={lbl}>DNI</label><input style={inp} value={f.dni||""} onChange={e=>setF(p=>({...p,dni:e.target.value}))}/></div>
          <div><label style={lbl}>Cargo</label><input style={inp} value={f.cargo||""} onChange={e=>setF(p=>({...p,cargo:e.target.value}))}/></div>
          <div><label style={lbl}>Fecha de ingreso</label><input type="date" style={inp} value={f.fecha_ingreso||""} onChange={e=>setF(p=>({...p,fecha_ingreso:e.target.value}))}/></div>
          <div><label style={lbl}>Sueldo bruto (S/)</label><input type="number" style={inp} value={f.sueldo_bruto} onChange={e=>setF(p=>({...p,sueldo_bruto:e.target.value}))}/></div>
        </div>
        <label style={lbl}>Sistema de pensión</label>
        <select style={{ ...inp, marginBottom:12 }} value={f.sistema_pension} onChange={e=>setF(p=>({...p,sistema_pension:e.target.value}))}>
          <option value="onp">ONP — 13% fijo</option>
          <option value="afp">AFP</option>
        </select>
        {f.sistema_pension==="afp" && (
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
            <div><label style={lbl}>AFP</label>
              <select style={inp} value={f.afp_nombre||""} onChange={e=>setF(p=>({...p,afp_nombre:e.target.value}))}>
                <option value="">— Selecciona —</option>
                <option value="Integra">Integra</option>
                <option value="Prima">Prima</option>
                <option value="Profuturo">Profuturo</option>
                <option value="Habitat">Habitat</option>
              </select>
            </div>
            <div><label style={lbl}>% de aporte total</label>
              <input type="number" step="0.1" style={inp} value={f.porcentaje_afp} onChange={e=>setF(p=>({...p,porcentaje_afp:e.target.value}))}/>
            </div>
          </div>
        )}
        {f.sueldo_bruto && (
          <div style={{ background:B.bg, borderRadius:10, padding:14, marginBottom:16, display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 }}>
            <div><div style={{ fontSize:10, color:B.textMut }}>DESCUENTO PENSIÓN</div>
              <div style={{ fontSize:14, fontWeight:700, color:B.red }}>- {fmt.sol(calc.descuentoPension)}</div></div>
            <div><div style={{ fontSize:10, color:B.textMut }}>ESSALUD (empresa)</div>
              <div style={{ fontSize:14, fontWeight:700, color:B.textMut }}>{fmt.sol(calc.essalud)}</div></div>
            <div><div style={{ fontSize:10, color:B.textMut }}>NETO A PAGAR</div>
              <div style={{ fontSize:16, fontWeight:800, color:B.gold }}>{fmt.sol(calc.neto)}</div></div>
          </div>
        )}
        {persona && (
          <label style={{ display:"flex", alignItems:"center", gap:8, marginBottom:16, cursor:"pointer" }}>
            <input type="checkbox" checked={f.activo!==false} onChange={e=>setF(p=>({...p,activo:e.target.checked}))}/>
            <span style={{ fontSize:13 }}>Trabajador activo</span>
          </label>
        )}
        <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
          <BtnSec onClick={onClose}>Cancelar</BtnSec>
          <BtnPri onClick={guardar} disabled={guardando}>{guardando?"Guardando...":persona?"Guardar cambios":"Registrar"}</BtnPri>
        </div>
      </div>
    </div>
  );
}

function ModalTerceroPlanilla({ tercero, onClose, onSaved, toast }) {
  const [f, setF] = useState(tercero || { nombre:"", tipo_documento:"recibo_honorarios", ruc_dni:"", servicio:"", activo:true });
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    if (!f.nombre) { toast("Completa el nombre","error"); return; }
    setGuardando(true);
    const payload = { nombre:f.nombre, tipo_documento:f.tipo_documento, ruc_dni:f.ruc_dni||null, servicio:f.servicio||null, activo:f.activo??true };
    let error;
    if (tercero) ({ error } = await sb.from("terceros_planilla").update(payload).eq("id", tercero.id));
    else ({ error } = await sb.from("terceros_planilla").insert([payload]));
    setGuardando(false);
    if (error) { toast("Error: "+error.message,"error"); return; }
    toast(tercero?"Tercero actualizado ✓":"Tercero registrado ✓");
    onSaved();
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"#0008", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ background:B.white, borderRadius:16, padding:28, width:460, boxShadow:"0 20px 60px #0003" }}>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:16 }}>
          <div style={{ fontSize:15, fontWeight:800, color:B.navy }}>{tercero?"Editar tercero":"Nuevo tercero"}</div>
          <button onClick={onClose} style={{ background:"none", border:"none", fontSize:18, color:B.textSec, cursor:"pointer" }}>✕</button>
        </div>
        <label style={lbl}>Nombre / Razón social</label>
        <input style={{ ...inp, marginBottom:12 }} value={f.nombre} onChange={e=>setF(p=>({...p,nombre:e.target.value}))}/>
        <label style={lbl}>Tipo de documento que emite</label>
        <select style={{ ...inp, marginBottom:12 }} value={f.tipo_documento} onChange={e=>setF(p=>({...p,tipo_documento:e.target.value}))}>
          <option value="recibo_honorarios">Recibo por honorarios</option>
          <option value="factura">Factura</option>
        </select>
        <label style={lbl}>RUC / DNI</label>
        <input style={{ ...inp, marginBottom:12 }} value={f.ruc_dni||""} onChange={e=>setF(p=>({...p,ruc_dni:e.target.value}))}/>
        <label style={lbl}>Servicio que presta</label>
        <input style={{ ...inp, marginBottom:16 }} value={f.servicio||""} onChange={e=>setF(p=>({...p,servicio:e.target.value}))}/>
        {tercero && (
          <label style={{ display:"flex", alignItems:"center", gap:8, marginBottom:16, cursor:"pointer" }}>
            <input type="checkbox" checked={f.activo!==false} onChange={e=>setF(p=>({...p,activo:e.target.checked}))}/>
            <span style={{ fontSize:13 }}>Tercero activo</span>
          </label>
        )}
        <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
          <BtnSec onClick={onClose}>Cancelar</BtnSec>
          <BtnPri onClick={guardar} disabled={guardando}>{guardando?"Guardando...":tercero?"Guardar cambios":"Registrar"}</BtnPri>
        </div>
      </div>
    </div>
  );
}

function ModalRegistrarPago({ tipo, registro, onClose, onSaved, toast }) {
  const hoy = new Date().toISOString().split("T")[0];
  const esPlanilla = tipo==="planilla";
  const [periodo, setPeriodo] = useState(hoy.slice(0,7));
  const [montoBruto, setMontoBruto] = useState(esPlanilla ? String(registro.sueldo_bruto||"") : "");
  const [aplicaRetencion, setAplicaRetencion] = useState(!esPlanilla && (parseFloat(registro.monto_bruto)||0) >= UMBRAL_RETENCION_HONORARIOS);
  const [numeroDocumento, setNumeroDocumento] = useState("");
  const [fechaPago, setFechaPago] = useState(hoy);
  const [guardando, setGuardando] = useState(false);

  const bruto = parseFloat(montoBruto)||0;
  const calcPlanilla = esPlanilla ? calcularNetoPlanilla(bruto, registro.sistema_pension, registro.porcentaje_afp) : null;
  const retencion = !esPlanilla && aplicaRetencion ? bruto*0.08 : 0;
  const netoTercero = bruto - retencion;

  const guardar = async () => {
    if (!bruto) { toast("Ingresa el monto","error"); return; }
    setGuardando(true);
    let error;
    if (esPlanilla) {
      ({ error } = await sb.from("pagos_planilla").insert([{
        personal_id: registro.id, periodo, sueldo_bruto: bruto,
        descuento_pension: calcPlanilla.descuentoPension, monto_essalud: calcPlanilla.essalud,
        neto_pagar: calcPlanilla.neto, fecha_pago: fechaPago, estado:"pagado",
      }]));
    } else {
      ({ error } = await sb.from("pagos_terceros").insert([{
        tercero_id: registro.id, descripcion: registro.servicio||null, monto_bruto: bruto,
        aplica_retencion: aplicaRetencion, monto_retencion: retencion, monto_neto: netoTercero,
        numero_documento: numeroDocumento||null, fecha_pago: fechaPago, estado:"pagado",
      }]));
    }
    setGuardando(false);
    if (error) { toast("Error: "+error.message,"error"); return; }
    toast("Pago registrado ✓");
    onSaved();
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"#0008", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ background:B.white, borderRadius:16, padding:28, width:480, boxShadow:"0 20px 60px #0003" }}>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
          <div style={{ fontSize:15, fontWeight:800, color:B.navy }}>💰 Registrar pago</div>
          <button onClick={onClose} style={{ background:"none", border:"none", fontSize:18, color:B.textSec, cursor:"pointer" }}>✕</button>
        </div>
        <div style={{ fontSize:13, color:B.textSec, marginBottom:16 }}>
          {esPlanilla ? `${registro.nombres} ${registro.apellidos}` : registro.nombre}
        </div>

        {esPlanilla ? (
          <div style={{ marginBottom:12 }}>
            <label style={lbl}>Periodo (mes)</label>
            <input type="month" style={inp} value={periodo} onChange={e=>setPeriodo(e.target.value)}/>
          </div>
        ) : (
          <div style={{ marginBottom:12 }}>
            <label style={lbl}>N° de documento (recibo/factura)</label>
            <input style={inp} value={numeroDocumento} onChange={e=>setNumeroDocumento(e.target.value)} placeholder="Ej. E001-123"/>
          </div>
        )}

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
          <div><label style={lbl}>Monto bruto (S/)</label>
            <input type="number" style={inp} value={montoBruto} onChange={e=>setMontoBruto(e.target.value)}/></div>
          <div><label style={lbl}>Fecha de pago</label>
            <input type="date" style={inp} value={fechaPago} onChange={e=>setFechaPago(e.target.value)}/></div>
        </div>

        {!esPlanilla && (
          <label style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12, cursor:"pointer" }}>
            <input type="checkbox" checked={aplicaRetencion} onChange={e=>setAplicaRetencion(e.target.checked)}/>
            <span style={{ fontSize:12, color:B.textSec }}>Aplica retención de renta 8% (recibo por honorarios ≥ S/ {UMBRAL_RETENCION_HONORARIOS} — confirma si corresponde)</span>
          </label>
        )}

        {bruto>0 && (
          <div style={{ background:B.bg, borderRadius:10, padding:14, marginBottom:16 }}>
            {esPlanilla ? (
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 }}>
                <div><div style={{ fontSize:10, color:B.textMut }}>DESC. PENSIÓN</div>
                  <div style={{ fontSize:14, fontWeight:700, color:B.red }}>- {fmt.sol(calcPlanilla.descuentoPension)}</div></div>
                <div><div style={{ fontSize:10, color:B.textMut }}>ESSALUD (empresa)</div>
                  <div style={{ fontSize:14, fontWeight:700, color:B.textMut }}>{fmt.sol(calcPlanilla.essalud)}</div></div>
                <div><div style={{ fontSize:10, color:B.textMut }}>NETO A PAGAR</div>
                  <div style={{ fontSize:16, fontWeight:800, color:B.gold }}>{fmt.sol(calcPlanilla.neto)}</div></div>
              </div>
            ) : (
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                <div><div style={{ fontSize:10, color:B.textMut }}>RETENCIÓN 8%</div>
                  <div style={{ fontSize:14, fontWeight:700, color:B.red }}>{aplicaRetencion?`- ${fmt.sol(retencion)}`:"No aplica"}</div></div>
                <div><div style={{ fontSize:10, color:B.textMut }}>NETO A PAGAR</div>
                  <div style={{ fontSize:16, fontWeight:800, color:B.gold }}>{fmt.sol(netoTercero)}</div></div>
              </div>
            )}
          </div>
        )}

        <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
          <BtnSec onClick={onClose}>Cancelar</BtnSec>
          <BtnPri onClick={guardar} disabled={guardando}>{guardando?"Guardando...":"Confirmar pago"}</BtnPri>
        </div>
      </div>
    </div>
  );
}

function rangoPeriodo(periodo, fechaInicio, fechaFin) {
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  if (periodo==="hoy") return [hoy, new Date()];
  if (periodo==="semana") {
    const dia = hoy.getDay();
    const diff = hoy.getDate() - dia + (dia===0 ? -6 : 1);
    const inicio = new Date(hoy); inicio.setDate(diff);
    return [inicio, new Date()];
  }
  if (periodo==="mes") {
    const inicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    return [inicio, new Date()];
  }
  const inicio = fechaInicio ? new Date(fechaInicio+"T00:00:00") : hoy;
  const fin = fechaFin ? new Date(fechaFin+"T23:59:59") : new Date();
  return [inicio, fin];
}

function DonutChart({ segments, size=150 }) {
  const total = segments.reduce((a,s)=>a+s.value,0);
  const r = size/2 - 16, c = size/2, circunferencia = 2*Math.PI*r;
  let acc = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={c} cy={c} r={r} fill="none" stroke="#F1F5F9" strokeWidth={18}/>
      {total>0 && segments.filter(s=>s.value>0).map((s,i)=>{
        const frac = s.value/total;
        const dash = frac*circunferencia;
        const offset = -acc*circunferencia;
        acc += frac;
        return (
          <circle key={i} cx={c} cy={c} r={r} fill="none" stroke={s.color} strokeWidth={18}
            strokeDasharray={`${dash} ${circunferencia-dash}`} strokeDashoffset={offset}
            transform={`rotate(-90 ${c} ${c})`}/>
        );
      })}
      <text x={c} y={c-4} textAnchor="middle" fontSize="22" fontWeight="900" fill={B.navy}>{total}</text>
      <text x={c} y={c+16} textAnchor="middle" fontSize="10" fill={B.textMut}>pedidos</text>
    </svg>
  );
}

function BarraHorizontal({ label, valor, max, color }) {
  const pct = max>0 ? Math.max(4, (valor/max*100)) : 0;
  return (
    <div style={{ marginBottom:10 }}>
      <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, marginBottom:4 }}>
        <span style={{ color:B.textSec, fontWeight:600 }}>{label}</span>
        <span style={{ color:B.navy, fontWeight:800 }}>{valor}</span>
      </div>
      <div style={{ background:"#F1F5F9", borderRadius:6, height:9, overflow:"hidden" }}>
        <div style={{ width:`${pct}%`, height:"100%", background:color, borderRadius:6 }}/>
      </div>
    </div>
  );
}

function SerieDiaria({ datos }) {
  const max = Math.max(1, ...datos.map(d=>d.total));
  return (
    <div style={{ display:"flex", gap:8, alignItems:"flex-end", height:150, overflowX:"auto", paddingBottom:28 }}>
      {datos.map((d,i)=>(
        <div key={i} style={{ display:"flex", flexDirection:"column", alignItems:"center", minWidth:32, position:"relative" }}>
          <div style={{ fontSize:10, color:B.textMut, marginBottom:4, fontWeight:700 }}>{d.total}</div>
          <div style={{ width:20, height: Math.max(4, d.total/max*100), borderRadius:"5px 5px 0 0",
            background:"#DCE3ED", position:"relative", overflow:"hidden" }}>
            <div style={{ position:"absolute", bottom:0, left:0, width:"100%",
              height: d.total ? `${(d.entregados/d.total*100)}%` : "0%", background:B.green }}/>
          </div>
          <div style={{ fontSize:9, color:B.textMut, marginTop:6, whiteSpace:"nowrap",
            position:"absolute", top:"100%", transform:"rotate(-35deg)", transformOrigin:"top left" }}>{d.label}</div>
        </div>
      ))}
    </div>
  );
}

function Reportes({ pedidos, repartidores, empresas, toast }) {
  const [periodo, setPeriodo] = useState("hoy");
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [empresaLiq, setEmpresaLiq] = useState("");
  const [generando, setGenerando] = useState(false);

  const [inicio, fin] = rangoPeriodo(periodo, fechaInicio, fechaFin);
  const filtrados = pedidos.filter(p => {
    const f = new Date(p.created_at);
    return f >= inicio && f <= fin;
  });

  const entregados = filtrados.filter(p=>p.estado==="entregado");
  const noEntregados = filtrados.filter(p=>p.estado==="no_entregado");
  const enRuta = filtrados.filter(p=>p.estado==="en_ruta");
  const asignados = filtrados.filter(p=>p.estado==="asignado");
  const sinAsignar = filtrados.filter(p=>p.estado==="sin_asignar");
  const finalizados = entregados.length + noEntregados.length;
  const efectividad = finalizados>0 ? Math.round(entregados.length/finalizados*100) : 0;
  const ingresoTotal = filtrados.reduce((a,p)=>a+(parseFloat(p.tarifa_s)||0),0);

  const codPedidos = filtrados.filter(p=>p.cobro_destino);
  const codCobrado = entregados.filter(p=>p.cobro_destino).reduce((a,p)=>a+(parseFloat(p.monto_cobrar)||0),0);
  const codPendiente = codPedidos.filter(p=>p.estado!=="entregado").reduce((a,p)=>a+(parseFloat(p.monto_cobrar)||0),0);

  const porDistrito = {};
  filtrados.forEach(p=>{ const d=p.dest_distrito||"Sin distrito"; porDistrito[d]=(porDistrito[d]||0)+1; });
  const topDistritos = Object.entries(porDistrito).sort((a,b)=>b[1]-a[1]).slice(0,6);
  const maxDistrito = topDistritos.length ? topDistritos[0][1] : 0;

  const porServicio = { same_day:0, next_day:0, sin_definir:0 };
  filtrados.forEach(p=>{
    if (p.tipo_servicio==="same_day") porServicio.same_day++;
    else if (p.tipo_servicio==="next_day") porServicio.next_day++;
    else porServicio.sin_definir++;
  });

  const porDia = {};
  filtrados.forEach(p=>{
    const key = new Date(p.created_at).toISOString().slice(0,10);
    if (!porDia[key]) porDia[key] = { total:0, entregados:0 };
    porDia[key].total++;
    if (p.estado==="entregado") porDia[key].entregados++;
  });
  const serieDiaria = Object.entries(porDia).sort((a,b)=>a[0].localeCompare(b[0])).map(([key,v])=>({
    label: new Date(key+"T12:00:00").toLocaleDateString("es-PE",{day:"2-digit",month:"2-digit"}),
    total:v.total, entregados:v.entregados,
  }));

  const stats = repartidores.map(r => {
    const misP = filtrados.filter(p=>p.repartidor_id===r.id);
    const ent = misP.filter(p=>p.estado==="entregado").length;
    const noEnt = misP.filter(p=>p.estado==="no_entregado").length;
    const ingreso = misP.reduce((a,p)=>a+(parseFloat(p.tarifa_s)||0),0);
    return { ...r, total:misP.length, entregados:ent, noEntregados:noEnt,
      efectividad: misP.length?Math.round(ent/misP.length*100):0, ingreso };
  }).sort((a,b)=>b.total-a.total);

  const porZona = ["urbano","semi_urbano","periferico"].map(z=>({
    zona: z.replace("_"," "), count: filtrados.filter(p=>p.ambito===z).length,
    entregados: filtrados.filter(p=>p.ambito===z&&p.estado==="entregado").length,
    ingreso: filtrados.filter(p=>p.ambito===z).reduce((a,p)=>a+(parseFloat(p.tarifa_s)||0),0),
  }));

  const porCliente = empresas.map(e=>({
    ...e, count: filtrados.filter(p=>p.empresa_id===e.id).length,
    ingreso: filtrados.filter(p=>p.empresa_id===e.id).reduce((a,p)=>a+(parseFloat(p.tarifa_s)||0),0),
  })).sort((a,b)=>b.count-a.count);

  // ── Liquidación Documentaria (descargo de guías) ──
  const pedidosEmpresaLiq = empresaLiq ? filtrados.filter(p=>p.empresa_id===empresaLiq) : [];
  const incluidosLiquidacion = pedidosEmpresaLiq.filter(p=>p.estado==="entregado"||p.estado==="no_entregado");

  const descargarLiquidacionDocumentaria = async () => {
    if (!empresaLiq || incluidosLiquidacion.length===0) return;
    setGenerando(true);
    try {
      const ExcelJS = (await import("exceljs")).default;
      const NAVY="FF1B2A4A", GOLD="FFE8A33D", WHITE="FFFFFFFF",
        GREEN="FF1E7A34", RED="FFB00000", REDBG="FFFCE4E4", GRAY="FF808080", ZEBRA="FFF2F2F2",
        BORDER="FFD9DEE6";

      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Liquidación", { pageSetup:{ orientation:"landscape" } });
      ws.columns = [ {width:3}, {width:10}, {width:34}, {width:20}, {width:24}, {width:16}, {width:22}, {width:37} ];

      const setCell = (addr, value, opts={}) => {
        const cell = ws.getCell(addr);
        cell.value = value;
        cell.font = { bold: !!opts.bold, size: opts.size||10, color:{argb: opts.color||"FF000000"}, italic: !!opts.italic };
        if (opts.fill) cell.fill = { type:"pattern", pattern:"solid", fgColor:{argb:opts.fill} };
        cell.alignment = { horizontal: opts.align||"left", vertical:"middle", wrapText: !!opts.wrap };
        if (opts.border) cell.border = {
          top:{style:"thin",color:{argb:BORDER}}, left:{style:"thin",color:{argb:BORDER}},
          bottom:{style:"thin",color:{argb:BORDER}}, right:{style:"thin",color:{argb:BORDER}},
        };
        return cell;
      };

      ws.mergeCells("B1:H1"); setCell("B1","GRUPO BOAZ S.A.C.",{bold:true,size:18,color:WHITE,fill:NAVY});
      ws.getRow(1).height = 30;
      ws.mergeCells("B2:H2"); setCell("B2","Con Boaz, tu negocio no para",{size:10,color:GOLD,fill:NAVY});
      ws.getRow(2).height = 18;
      ws.mergeCells("B3:H3");
      setCell("B3","RUC 20613172301  |  El Agustino, Lima  |  +51 960 622 471  |  contacto@boaz.com.pe  |  www.boaz.com.pe",{size:9,color:WHITE,fill:NAVY});
      ws.getRow(3).height = 16;

      const tiposPresentes = [...new Set(incluidosLiquidacion.map(p=>TIPOS_SERVICIO[p.tipo_servicio]?.label).filter(Boolean))];
      const tituloServicio = tiposPresentes.length===1 ? ` - ${tiposPresentes[0].toUpperCase()}` : "";
      ws.mergeCells("B5:H5");
      setCell("B5",`LIQUIDACIÓN DOCUMENTARIA DE ENTREGAS${tituloServicio}`,{bold:true,size:13,color:NAVY});
      ws.getRow(5).height = 22;
      ws.mergeCells("B6:H6");
      setCell("B6","(Documento de descargo de guías - sin valorización)",{size:9,color:GRAY,italic:true});

      const numLiquidacion = `LIQ-DOC-BOAZ-${new Date().toISOString().slice(0,10).replace(/-/g,"")}-${Math.random().toString(36).slice(2,5).toUpperCase()}`;
      const rangoTxt = `${inicio.toLocaleDateString("es-PE")} — ${fin.toLocaleDateString("es-PE")}`;
      const empresaObj = empresas.find(e=>e.id===empresaLiq);
      const nombreEmpresa = empresaObj?.nombre || "—";
      const destinosUnicos = new Set(incluidosLiquidacion.map(p=>p.dest_nombre)).size;
      const tipoServicioTxt = tiposPresentes.join(" / ") || "—";

      setCell("B8","N° Liquidación:",{bold:true,color:NAVY}); setCell("C8",numLiquidacion);
      setCell("E8","Periodo:",{bold:true,color:NAVY}); setCell("F8",rangoTxt);
      setCell("B9","Cliente:",{bold:true,color:NAVY});
      setCell("C9",`${empresaObj?.codigo_interno ? empresaObj.codigo_interno+" — " : ""}${nombreEmpresa}`);
      setCell("E9","Fecha de generación:",{bold:true,color:NAVY}); setCell("F9",new Date().toLocaleDateString("es-PE"));
      setCell("B10","Destinatarios:",{bold:true,color:NAVY});
      setCell("C10",`${destinosUnicos} destinatario(s) — ${incluidosLiquidacion.length} punto(s) de entrega`);
      setCell("E10","Tipo de servicio:",{bold:true,color:NAVY}); setCell("F10",tipoServicioTxt);

      const headers = ["N°","Punto","Distrito","Guía de Remisión / N° Orden","Fecha de Entrega","Estado","Observaciones"];
      const headerRow = 13;
      headers.forEach((h,i)=>{
        const col = String.fromCharCode("B".charCodeAt(0)+i);
        setCell(`${col}${headerRow}`, h, {bold:true,color:WHITE,fill:NAVY,border:true});
      });
      ws.getRow(headerRow).height = 28;

      incluidosLiquidacion.forEach((p,i)=>{
        const row = headerRow+1+i;
        const esNoEntregado = p.estado==="no_entregado";
        const fill = esNoEntregado ? REDBG : (i%2===1 ? ZEBRA : null);
        const vals = [
          i+1,
          p.dest_nombre||"—",
          p.dest_distrito||"—",
          p.cliente_referencia || p.omd,
          p.fecha_entrega ? new Date(p.fecha_entrega).toLocaleDateString("es-PE") : "—",
          esNoEntregado ? "No entregado" : "Entregado",
          esNoEntregado ? (p.motivo_no_entrega||"") : "",
        ];
        vals.forEach((v,ci)=>{
          const col = String.fromCharCode("B".charCodeAt(0)+ci);
          const opts = { fill: fill||undefined, border:true, wrap: ci===6 };
          if (ci===5) { opts.bold=true; opts.color = esNoEntregado?RED:GREEN; }
          if (ci===6 && esNoEntregado) opts.color = RED;
          setCell(`${col}${row}`, v, opts);
        });
      });

      let r = headerRow+1+incluidosLiquidacion.length+2;
      ws.mergeCells(`B${r}:H${r}`); setCell(`B${r}`,"RESUMEN DE DESCARGO",{bold:true,size:11,color:NAVY}); r++;
      setCell(`B${r}`,"Total de guías / puntos",{bold:true,color:NAVY}); setCell(`D${r}`,incluidosLiquidacion.length); r++;
      setCell(`B${r}`,"Total entregados",{bold:true,color:NAVY}); setCell(`D${r}`,incluidosLiquidacion.filter(p=>p.estado==="entregado").length); r++;
      setCell(`B${r}`,"Total no entregados",{bold:true,color:NAVY}); setCell(`D${r}`,incluidosLiquidacion.filter(p=>p.estado==="no_entregado").length); r+=2;

      ws.mergeCells(`B${r}:H${r}`);
      setCell(`B${r}`,"CARGO DE RECEPCIÓN DE LIQUIDACIÓN",{bold:true,size:11,color:WHITE,fill:NAVY});
      ws.getRow(r).height = 22; r++;
      ws.mergeCells(`B${r}:H${r}`);
      setCell(`B${r}`,`Declaro haber recibido de Grupo Boaz S.A.C. el presente documento de liquidación, con las ${incluidosLiquidacion.length} guías/puntos y sus respectivas observaciones detalladas.`,{size:8,color:GRAY,wrap:true});
      ws.getRow(r).height = 26; r+=2;

      ["Recibido por (nombre):","Cargo:","Empresa:","Fecha de recepción:","Firma / Sello:"].forEach(label=>{
        setCell(`B${r}`,label,{bold:true,color:NAVY});
        ws.mergeCells(`D${r}:F${r}`);
        setCell(`D${r}`,"________________________________");
        r++;
      });
      r++;
      ws.mergeCells(`B${r}:H${r}`);
      setCell(`B${r}`,`Nota: documento de descargo operativo, sin valorización económica. Periodo: ${rangoTxt}.`,{size:8,color:GRAY,italic:true});

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${numLiquidacion}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast?.("Liquidación generada ✓");
    } catch (err) {
      toast?.("Error al generar: "+err.message,"error");
    } finally {
      setGenerando(false);
    }
  };

  const PRESETS = [
    { id:"hoy", label:"Hoy" },
    { id:"semana", label:"Esta semana" },
    { id:"mes", label:"Este mes" },
    { id:"personalizado", label:"Rango personalizado" },
  ];

  return (
    <div>
      {/* Selector de periodo */}
      <div style={{ display:"flex", gap:8, marginBottom:6, flexWrap:"wrap" }}>
        {PRESETS.map(p=>(
          <button key={p.id} onClick={()=>setPeriodo(p.id)}
            style={{ padding:"8px 16px", borderRadius:20, fontSize:12, fontWeight:700, cursor:"pointer",
              border: periodo===p.id ? `2px solid ${B.gold}` : `1px solid ${B.border}`,
              background: periodo===p.id ? "#FFF7ED" : B.white,
              color: periodo===p.id ? B.goldDk : B.textSec }}>
            {p.label}
          </button>
        ))}
      </div>
      {periodo==="personalizado" && (
        <div style={{ display:"flex", gap:10, marginBottom:16, marginTop:10 }}>
          <input type="date" style={inp} value={fechaInicio} onChange={e=>setFechaInicio(e.target.value)}/>
          <span style={{ alignSelf:"center", color:B.textMut, fontSize:12 }}>hasta</span>
          <input type="date" style={inp} value={fechaFin} onChange={e=>setFechaFin(e.target.value)}/>
        </div>
      )}
      <div style={{ fontSize:12, color:B.textMut, margin:"10px 0 20px" }}>
        Mostrando {filtrados.length} pedido{filtrados.length===1?"":"s"} entre{" "}
        {inicio.toLocaleDateString("es-PE",{day:"numeric",month:"short"})} y {fin.toLocaleDateString("es-PE",{day:"numeric",month:"short"})}
      </div>

      {/* KPIs principales */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(6,1fr)", gap:14, marginBottom:20 }}>
        {[
          { icon:"📦", label:"Total pedidos", value: filtrados.length, color:B.navy },
          { icon:"✅", label:"Entregados", value: entregados.length, sub: finalizados>0?`${efectividad}% efect.`:null, color:B.green },
          { icon:"⚠️", label:"No entregados", value: noEntregados.length, color:B.red },
          { icon:"🛵", label:"En ruta", value: enRuta.length, color:"#7C3AED" },
          { icon:"⏳", label:"Por asignar/asig.", value: sinAsignar.length+asignados.length, color:B.gold },
          { icon:"💰", label:"Ingreso periodo", value: fmt.sol(ingresoTotal), color:B.goldDk, big:true },
        ].map((k,i)=>(
          <div key={i} style={{ background:B.white, border:`1px solid ${B.border}`,
            borderRadius:12, padding:16, borderTop:`3px solid ${k.color}`,
            boxShadow:"0 2px 8px #0D1E3D0A" }}>
            <div style={{ fontSize:20, marginBottom:6 }}>{k.icon}</div>
            <div style={{ fontSize: k.big?16:24, fontWeight:800, color:B.textPri }}>{k.value}</div>
            <div style={{ fontSize:10, color:B.textMut, textTransform:"uppercase", marginTop:2 }}>{k.label}</div>
            {k.sub && <div style={{ fontSize:10, color:k.color, fontWeight:700, marginTop:4 }}>{k.sub}</div>}
          </div>
        ))}
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:14 }}>
        {/* Estado: donut */}
        <div style={{ background:B.white, border:`1px solid ${B.border}`, borderRadius:12,
          padding:20, boxShadow:"0 2px 8px #0D1E3D0A" }}>
          <div style={{ fontSize:13, fontWeight:700, color:B.navy, marginBottom:16 }}>Distribución por estado</div>
          <div style={{ display:"flex", alignItems:"center", gap:20 }}>
            <DonutChart segments={[
              { value:entregados.length, color:B.green },
              { value:noEntregados.length, color:B.red },
              { value:enRuta.length, color:"#7C3AED" },
              { value:asignados.length, color:"#D97706" },
              { value:sinAsignar.length, color:"#3B82F6" },
            ]}/>
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {[
                ["Entregados",entregados.length,B.green],
                ["No entregados",noEntregados.length,B.red],
                ["En ruta",enRuta.length,"#7C3AED"],
                ["Asignados",asignados.length,"#D97706"],
                ["Sin asignar",sinAsignar.length,"#3B82F6"],
              ].map(([label,val,color])=>(
                <div key={label} style={{ display:"flex", alignItems:"center", gap:8, fontSize:12 }}>
                  <span style={{ width:10, height:10, borderRadius:3, background:color, display:"inline-block" }}/>
                  <span style={{ color:B.textSec }}>{label}</span>
                  <span style={{ fontWeight:800, color:B.navy, marginLeft:"auto" }}>{val}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* COD */}
        <div style={{ background:B.white, border:`1px solid ${B.border}`, borderRadius:12,
          padding:20, boxShadow:"0 2px 8px #0D1E3D0A" }}>
          <div style={{ fontSize:13, fontWeight:700, color:B.navy, marginBottom:16 }}>Cobros en destino (COD)</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
            <div><div style={{ fontSize:10, color:B.textMut, textTransform:"uppercase" }}>Pedidos COD</div>
              <div style={{ fontSize:22, fontWeight:900, color:B.navy }}>{codPedidos.length}</div></div>
            <div><div style={{ fontSize:10, color:B.textMut, textTransform:"uppercase" }}>Cobrado</div>
              <div style={{ fontSize:22, fontWeight:900, color:B.green }}>{fmt.sol(codCobrado)}</div></div>
            <div style={{ gridColumn:"1/-1" }}><div style={{ fontSize:10, color:B.textMut, textTransform:"uppercase" }}>Pendiente por cobrar</div>
              <div style={{ fontSize:22, fontWeight:900, color:"#C2410C" }}>{fmt.sol(codPendiente)}</div></div>
          </div>
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:14 }}>
        <div style={{ background:B.white, border:`1px solid ${B.border}`, borderRadius:12,
          padding:20, boxShadow:"0 2px 8px #0D1E3D0A" }}>
          <div style={{ fontSize:13, fontWeight:700, color:B.navy, marginBottom:16 }}>Top distritos</div>
          {topDistritos.map(([d,v])=>(
            <BarraHorizontal key={d} label={d} valor={v} max={maxDistrito} color={B.gold}/>
          ))}
          {topDistritos.length===0 && <div style={{ fontSize:12, color:B.textMut, textAlign:"center" }}>Sin datos</div>}
        </div>
        <div style={{ background:B.white, border:`1px solid ${B.border}`, borderRadius:12,
          padding:20, boxShadow:"0 2px 8px #0D1E3D0A" }}>
          <div style={{ fontSize:13, fontWeight:700, color:B.navy, marginBottom:16 }}>Tipo de servicio</div>
          <BarraHorizontal label="Same Day" valor={porServicio.same_day} max={filtrados.length} color="#7C3AED"/>
          <BarraHorizontal label="Next Day" valor={porServicio.next_day} max={filtrados.length} color="#0369A1"/>
          <BarraHorizontal label="Sin definir" valor={porServicio.sin_definir} max={filtrados.length} color={B.textMut}/>
        </div>
      </div>

      {serieDiaria.length>1 && (
        <div style={{ background:B.white, border:`1px solid ${B.border}`, borderRadius:12,
          padding:20, boxShadow:"0 2px 8px #0D1E3D0A", marginBottom:14 }}>
          <div style={{ fontSize:13, fontWeight:700, color:B.navy, marginBottom:6 }}>Tendencia diaria</div>
          <div style={{ fontSize:11, color:B.textMut, marginBottom:10 }}>
            <span style={{ color:B.green, fontWeight:700 }}>■</span> Entregados · Barra completa = total del día
          </div>
          <SerieDiaria datos={serieDiaria}/>
        </div>
      )}

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:14 }}>
        {/* Por repartidor */}
        <div style={{ background:B.white, border:`1px solid ${B.border}`,
          borderRadius:12, overflow:"hidden", boxShadow:"0 2px 8px #0D1E3D0A" }}>
          <div style={{ padding:"14px 18px", borderBottom:`1px solid ${B.border}`,
            fontSize:13, fontWeight:700, color:B.navy }}>📊 Rendimiento por repartidor</div>
          <table style={{ width:"100%", borderCollapse:"collapse" }}>
            <thead><tr style={{ background:B.bg }}>
              {["Repartidor","Total","Entregados","No entreg.","Efectividad","Ingresos"].map(h=>(
                <th key={h} style={{ padding:"8px 12px", textAlign:"left", fontSize:10,
                  color:B.textMut, fontWeight:700 }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {stats.map((r,i)=>(
                <tr key={r.id} style={{ borderTop:`1px solid ${B.border}`,
                  background:i%2===0?B.white:"#F8FAFC" }}>
                  <td style={{ padding:"10px 12px", fontSize:12, fontWeight:600, color:B.navy }}>
                    {r.nombres} {r.apellidos}
                  </td>
                  <td style={{ padding:"10px 12px", fontSize:12, fontWeight:700, color:B.navy }}>{r.total}</td>
                  <td style={{ padding:"10px 12px", fontSize:12, color:B.green, fontWeight:700 }}>{r.entregados}</td>
                  <td style={{ padding:"10px 12px", fontSize:12, color:B.red }}>{r.noEntregados}</td>
                  <td style={{ padding:"10px 12px" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                      <div style={{ flex:1, height:6, background:B.bg, borderRadius:3 }}>
                        <div style={{ width:`${r.efectividad}%`, height:"100%",
                          background:r.efectividad>=80?B.green:r.efectividad>=60?B.gold:B.red,
                          borderRadius:3 }}/>
                      </div>
                      <span style={{ fontSize:11, fontWeight:700, color:B.textPri, minWidth:32 }}>{r.efectividad}%</span>
                    </div>
                  </td>
                  <td style={{ padding:"10px 12px", fontSize:12, fontWeight:600, color:B.navy }}>{fmt.sol(r.ingreso)}</td>
                </tr>
              ))}
              {stats.length===0&&<tr><td colSpan={6} style={{ padding:24, textAlign:"center",
                color:B.textMut }}>Sin datos</td></tr>}
            </tbody>
          </table>
        </div>

        {/* Por zona */}
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          <div style={{ background:B.white, border:`1px solid ${B.border}`,
            borderRadius:12, overflow:"hidden", boxShadow:"0 2px 8px #0D1E3D0A" }}>
            <div style={{ padding:"14px 18px", borderBottom:`1px solid ${B.border}`,
              fontSize:13, fontWeight:700, color:B.navy }}>🗺️ Pedidos por zona</div>
            <div style={{ padding:16 }}>
              {porZona.map(z=>(
                <div key={z.zona} style={{ marginBottom:14 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                    <span style={{ fontSize:12, color:B.textPri, fontWeight:600, textTransform:"capitalize" }}>{z.zona}</span>
                    <span style={{ fontSize:12, fontWeight:800, color:B.gold }}>{z.count} pedidos · {fmt.sol(z.ingreso)}</span>
                  </div>
                  <div style={{ height:8, background:B.bg, borderRadius:4 }}>
                    <div style={{ width: filtrados.length?`${(z.count/filtrados.length)*100}%`:"0%",
                      height:"100%", background:B.gold, borderRadius:4 }}/>
                  </div>
                  <div style={{ fontSize:10, color:B.textMut, marginTop:2 }}>{z.entregados} entregados</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ background:B.white, border:`1px solid ${B.border}`,
            borderRadius:12, overflow:"hidden", boxShadow:"0 2px 8px #0D1E3D0A", flex:1 }}>
            <div style={{ padding:"14px 18px", borderBottom:`1px solid ${B.border}`,
              fontSize:13, fontWeight:700, color:B.navy }}>🏢 Top clientes</div>
            <div style={{ padding:14 }}>
              {porCliente.slice(0,5).map(c=>(
                <div key={c.id} style={{ display:"flex", alignItems:"center", gap:10,
                  padding:"8px 0", borderBottom:`1px solid ${B.border}` }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:12, color:B.textPri, fontWeight:600 }}>
                      {c.codigo_interno && <span style={{ color:B.gold, marginRight:4 }}>{c.codigo_interno}</span>}
                      {c.nombre}
                    </div>
                    <div style={{ fontSize:10, color:B.textMut }}>{c.count} pedidos</div>
                  </div>
                  <div style={{ fontSize:13, fontWeight:800, color:B.navy }}>{fmt.sol(c.ingreso)}</div>
                </div>
              ))}
              {porCliente.length===0&&<div style={{ padding:20, textAlign:"center",
                color:B.textMut, fontSize:12 }}>Sin clientes</div>}
            </div>
          </div>
        </div>
      </div>

      {/* Liquidación Documentaria */}
      <div style={{ background:B.white, border:`1px solid ${B.border}`, borderRadius:12,
        padding:20, boxShadow:"0 2px 8px #0D1E3D0A" }}>
        <div style={{ fontSize:13, fontWeight:700, color:B.navy, marginBottom:14 }}>📄 Liquidación Documentaria (descargo de guías)</div>
        <div style={{ display:"flex", gap:12, alignItems:"flex-end", flexWrap:"wrap" }}>
          <div style={{ minWidth:260 }}>
            <label style={lbl}>Cliente</label>
            <select style={inp} value={empresaLiq} onChange={e=>setEmpresaLiq(e.target.value)}>
              <option value="">— Selecciona un cliente —</option>
              {empresas.map(e=><option key={e.id} value={e.id}>{e.codigo_interno ? `${e.codigo_interno} — ` : ""}{e.nombre}</option>)}
            </select>
          </div>
          <BtnPri onClick={descargarLiquidacionDocumentaria}
            disabled={!empresaLiq || incluidosLiquidacion.length===0 || generando}>
            {generando ? "Generando..." : "Descargar Excel"}
          </BtnPri>
          {empresaLiq && (
            <div style={{ fontSize:12, color:B.textMut }}>
              {incluidosLiquidacion.length} pedido{incluidosLiquidacion.length===1?"":"s"} finalizado{incluidosLiquidacion.length===1?"":"s"} de este cliente en el periodo seleccionado
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// MÓDULO 8: CONFIGURACIÓN
// ══════════════════════════════════════════════════════════════
function ModalLineaNegocio({ onClose, onSaved, toast }) {
  const [f, setF] = useState({ codigo:"", nombre:"", descripcion:"" });

  const guardar = async () => {
    if (!f.codigo || !f.nombre) { toast("Código y nombre son obligatorios","error"); return; }
    const { error } = await sb.from("lineas_negocio").insert([{ ...f, activo:true }]);
    if (error) { toast("Error: "+error.message,"error"); return; }
    toast("Línea de negocio creada ✓");
    onSaved();
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"#0008", zIndex:1000,
      display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ background:B.white, borderRadius:16, padding:28, width:460,
        boxShadow:"0 20px 60px #0003" }}>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:20 }}>
          <div style={{ fontSize:15, fontWeight:800, color:B.navy }}>Nueva línea de negocio</div>
          <button onClick={onClose} style={{ background:"none", border:"none", fontSize:18,
            color:B.textSec, cursor:"pointer" }}>✕</button>
        </div>
        <label style={lbl}>Código (ej. LOG-TC)</label>
        <input style={{ ...inp, marginBottom:12, textTransform:"uppercase" }} value={f.codigo}
          onChange={e=>setF(p=>({...p,codigo:e.target.value.toUpperCase()}))}/>
        <label style={lbl}>Nombre</label>
        <input style={{ ...inp, marginBottom:12 }} value={f.nombre}
          onChange={e=>setF(p=>({...p,nombre:e.target.value}))}/>
        <label style={lbl}>Descripción (opcional)</label>
        <input style={{ ...inp, marginBottom:20 }} value={f.descripcion}
          onChange={e=>setF(p=>({...p,descripcion:e.target.value}))}/>
        <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
          <BtnSec onClick={onClose}>Cancelar</BtnSec>
          <BtnPri onClick={guardar}>Registrar</BtnPri>
        </div>
      </div>
    </div>
  );
}

function ModalTipoServicio({ lineaNegocioId, lineasNegocio, onClose, onSaved, toast }) {
  const [f, setF] = useState({
    linea_negocio_id: lineaNegocioId, codigo:"", nombre:"", unidad_medida:"unidad", tarifa_base:"",
  });

  const guardar = async () => {
    if (!f.codigo || !f.nombre || !f.linea_negocio_id) { toast("Completa línea, código y nombre","error"); return; }
    const { error } = await sb.from("tipos_servicio").insert([{
      ...f, tarifa_base: parseFloat(f.tarifa_base)||null, activo:true,
    }]);
    if (error) { toast("Error: "+error.message,"error"); return; }
    toast("Tipo de servicio creado ✓");
    onSaved();
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"#0008", zIndex:1000,
      display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ background:B.white, borderRadius:16, padding:28, width:460,
        boxShadow:"0 20px 60px #0003" }}>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:20 }}>
          <div style={{ fontSize:15, fontWeight:800, color:B.navy }}>Nuevo tipo de servicio</div>
          <button onClick={onClose} style={{ background:"none", border:"none", fontSize:18,
            color:B.textSec, cursor:"pointer" }}>✕</button>
        </div>
        <label style={lbl}>Línea de negocio</label>
        <select style={{ ...inp, marginBottom:12 }} value={f.linea_negocio_id}
          onChange={e=>setF(p=>({...p,linea_negocio_id:e.target.value}))}>
          <option value="">— Selecciona —</option>
          {lineasNegocio.map(ln=><option key={ln.id} value={ln.id}>{ln.codigo} — {ln.nombre}</option>)}
        </select>
        <label style={lbl}>Código (ej. TC-UNI)</label>
        <input style={{ ...inp, marginBottom:12, textTransform:"uppercase" }} value={f.codigo}
          onChange={e=>setF(p=>({...p,codigo:e.target.value.toUpperCase()}))}/>
        <label style={lbl}>Nombre</label>
        <input style={{ ...inp, marginBottom:12 }} value={f.nombre}
          onChange={e=>setF(p=>({...p,nombre:e.target.value}))}/>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:20 }}>
          <div>
            <label style={lbl}>Unidad de medida</label>
            <select style={inp} value={f.unidad_medida} onChange={e=>setF(p=>({...p,unidad_medida:e.target.value}))}>
              <option value="unidad">Unidad</option>
              <option value="dia">Día</option>
              <option value="entrega">Entrega</option>
              <option value="km">Kilómetro</option>
              <option value="hora">Hora</option>
            </select>
          </div>
          <div>
            <label style={lbl}>Tarifa base S/ (opcional)</label>
            <input type="number" style={inp} value={f.tarifa_base}
              onChange={e=>setF(p=>({...p,tarifa_base:e.target.value}))}/>
          </div>
        </div>
        <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
          <BtnSec onClick={onClose}>Cancelar</BtnSec>
          <BtnPri onClick={guardar}>Registrar</BtnPri>
        </div>
      </div>
    </div>
  );
}

function Configuracion({ onRefresh, toast }) {
  const ZONAS = {
    urbano: ["Lima","Barranco","Breña","Chorrillos","El Agustino","Jesús María","La Victoria","Lince","Magdalena del Mar","Miraflores","Pueblo Libre","Rímac","San Borja","San Isidro","San Luis","San Miguel","Santiago de Surco","Surquillo"],
    semi_urbano: ["Callao","Bellavista","Carmen de la Legua Reynoso","La Perla","La Punta","Ate","Independencia","La Molina","Los Olivos","San Juan de Lurigancho","San Juan de Miraflores","San Martín de Porres","Santa Anita","Villa El Salvador","Villa María del Triunfo"],
    periferico: ["Comas","Ventanilla","Mi Perú","Ancón","Carabayllo","Chaclacayo","Cieneguilla","Lurigancho-Chosica","Lurín","Pachacámac","Puente Piedra"],
  };

  return (
    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
      {/* Datos empresa */}
      <div style={{ background:B.white, border:`1px solid ${B.border}`,
        borderRadius:12, padding:20, boxShadow:"0 2px 8px #0D1E3D0A", gridColumn:"span 2" }}>
        <div style={{ fontSize:14, fontWeight:800, color:B.navy, marginBottom:16,
          paddingBottom:8, borderBottom:`2px solid ${B.gold}` }}>🏢 Datos de Grupo Boaz S.A.C.</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14 }}>
          {[
            ["Razón Social","Grupo Boaz S.A.C."],
            ["RUC","20613172301"],
            ["Régimen","RMT"],
            ["Teléfono","+51 960 622 471"],
            ["Email","contacto@boaz.com.pe"],
            ["Web","www.boaz.com.pe"],
            ["Dirección","El Agustino, Lima"],
            ["Tagline","Con Boaz, tu negocio no para"],
          ].map(([k,v])=>(
            <div key={k}>
              <div style={{ fontSize:10, color:B.textMut, textTransform:"uppercase",
                letterSpacing:"0.7px", marginBottom:4 }}>{k}</div>
              <div style={{ fontSize:13, fontWeight:600, color:B.textPri }}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Zonas */}
      <div style={{ background:B.white, border:`1px solid ${B.border}`,
        borderRadius:12, padding:20, boxShadow:"0 2px 8px #0D1E3D0A", gridColumn:"span 2" }}>
        <div style={{ fontSize:14, fontWeight:800, color:B.navy, marginBottom:16,
          paddingBottom:8, borderBottom:`2px solid ${B.gold}` }}>📍 Zonas de cobertura</div>
        {Object.entries(ZONAS).map(([ambito,distritos])=>(
          <div key={ambito} style={{ marginBottom:16 }}>
            <div style={{ fontSize:11, fontWeight:700, color:B.navy, textTransform:"capitalize",
              marginBottom:6 }}>{ambito.replace("_"," ")}</div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>
              {distritos.map(d=>(
                <span key={d} style={{ fontSize:10, background:`${B.navy}10`,
                  color:B.navy, padding:"2px 8px", borderRadius:10,
                  border:`1px solid ${B.navy}22` }}>{d}</span>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div style={{ background:B.white, border:`1px solid ${B.border}`,
        borderRadius:12, padding:20, boxShadow:"0 2px 8px #0D1E3D0A", gridColumn:"span 2" }}>
        <div style={{ fontSize:14, fontWeight:800, color:B.navy, marginBottom:16,
          paddingBottom:8, borderBottom:`2px solid ${B.gold}` }}>🔌 Integraciones API</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12 }}>
          {[
            { name:"VTEX", desc:"Ecommerce enterprise", color:"#F71963", ready:false },
            { name:"Shopify", desc:"Ecommerce SMB", color:"#96BF48", ready:false },
            { name:"MercadoLibre", desc:"Marketplace", color:"#FFE600", ready:false },
            { name:"WhatsApp", desc:"Notificaciones", color:"#25D366", ready:false },
            { name:"WooCommerce", desc:"WordPress shops", color:"#7F54B3", ready:false },
            { name:"SUNAT", desc:"Facturación electrónica", color:"#E32027", ready:false },
            { name:"Google Maps", desc:"GPS y rutas", color:"#4285F4", ready:false },
            { name:"Webhook", desc:"Eventos en tiempo real", color:B.navy, ready:false },
          ].map(it=>(
            <div key={it.name} style={{ border:`1px solid ${B.border}`, borderRadius:10,
              padding:14, display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ width:36, height:36, borderRadius:8, background:`${it.color}22`,
                display:"flex", alignItems:"center", justifyContent:"center",
                fontSize:11, fontWeight:800, color:it.color }}>
                {it.name.slice(0,2)}
              </div>
              <div>
                <div style={{ fontSize:12, fontWeight:700, color:B.navy }}>{it.name}</div>
                <div style={{ fontSize:10, color:B.textMut }}>{it.desc}</div>
              </div>
              <span style={{ marginLeft:"auto", fontSize:9, padding:"2px 6px", borderRadius:6,
                background:"#FFF7ED", color:B.orange, fontWeight:700, border:`1px solid ${B.orange}44` }}>
                Pronto
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// MÓDULO: CATÁLOGO (Comercial) — tarifario Same Day genérico,
// líneas de negocio + tipos de servicio, y tarifarios negociados
// por cliente. Todo el tema de precios en un solo lugar.
// ══════════════════════════════════════════════════════════════
function Catalogo({ lineasNegocio, tiposServicio, tarifarioEstandar, tarifarioVehiculoEstandar, recargoFeriadoPct, onRefresh, toast }) {
  const [modalLinea, setModalLinea] = useState(false);
  const [modalTipo, setModalTipo] = useState(null);
  const [modalTarifarioEstandar, setModalTarifarioEstandar] = useState(false);
  const [modalTarifarioVehiculoEstandar, setModalTarifarioVehiculoEstandar] = useState(false);
  const [tabEstandar, setTabEstandar] = useState("same_day");
  const [recargoInput, setRecargoInput] = useState(String(recargoFeriadoPct||0));
  const [guardandoRecargo, setGuardandoRecargo] = useState(false);

  const guardarRecargo = async () => {
    setGuardandoRecargo(true);
    const { data: fila } = await sb.from("configuracion_recargos").select("id").limit(1).maybeSingle();
    const payload = { recargo_feriado_pct: parseFloat(recargoInput)||0 };
    const { error } = fila
      ? await sb.from("configuracion_recargos").update(payload).eq("id", fila.id)
      : await sb.from("configuracion_recargos").insert([payload]);
    setGuardandoRecargo(false);
    if (error) { toast("Error: "+error.message, "error"); return; }
    toast("Recargo por feriado actualizado ✓");
    onRefresh();
  };

  const AMBITOS_LABEL = { urbano:"Urbano", semi_urbano:"Semi Urbano", periferico:"Periférico" };
  const TIPOS_VEHICULO_LABEL = { moto:"Moto", bicicleta:"Bicicleta", auto:"Auto", furgoneta:"Furgoneta", minivan:"Minivan", van:"Van", porter:"Porter" };
  const filaEstandar = (ambito, tipoServicio) =>
    tarifarioEstandar.find(t=>t.ambito===ambito && t.tipo_servicio===tipoServicio && t.activo);

  return (
    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
      {/* Recargo por feriados */}
      <div style={{ background:B.white, border:`1px solid ${B.border}`,
        borderRadius:12, padding:20, boxShadow:"0 2px 8px #0D1E3D0A", gridColumn:"span 2" }}>
        <div style={{ fontSize:14, fontWeight:800, color:B.navy, marginBottom:12,
          paddingBottom:8, borderBottom:`2px solid ${B.gold}` }}>📅 Recargo por feriados</div>
        <div style={{ fontSize:12, color:B.textMut, marginBottom:12 }}>
          Se aplica automáticamente sobre la tarifa/día de Transporte y Carga cuando un día marcado como activo en el calendario de servicio cae en un feriado oficial de Perú.
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <input type="number" step="0.1" value={recargoInput} onChange={e=>setRecargoInput(e.target.value)}
            style={{ ...inp, width:100 }}/>
          <span style={{ fontSize:13, color:B.textSec }}>% de recargo sobre la tarifa/día</span>
          <BtnPri onClick={guardarRecargo} disabled={guardandoRecargo} style={{ marginLeft:"auto", padding:"7px 14px", fontSize:12 }}>
            {guardandoRecargo?"Guardando...":"Guardar"}
          </BtnPri>
        </div>
      </div>

      {/* Tarifario estándar por pedido (editable) */}
      <div style={{ background:B.white, border:`1px solid ${B.border}`,
        borderRadius:12, padding:20, boxShadow:"0 2px 8px #0D1E3D0A" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
          marginBottom:12, paddingBottom:8, borderBottom:`2px solid ${B.gold}` }}>
          <div style={{ fontSize:14, fontWeight:800, color:B.navy }}>💰 Tarifario estándar por pedido</div>
          <button onClick={()=>setModalTarifarioEstandar(true)}
            style={{ fontSize:11, color:B.blue, background:"none", border:"none", cursor:"pointer", fontWeight:700 }}>
            ✏️ Editar
          </button>
        </div>
        <div style={{ display:"flex", gap:6, marginBottom:12 }}>
          {[["same_day","Same Day"],["next_day","Next Day"],["especial","Especial"]].map(([id,label])=>(
            <button key={id} onClick={()=>setTabEstandar(id)}
              style={{ flex:1, padding:"6px 8px", borderRadius:8, fontSize:11, fontWeight:700, cursor:"pointer",
                border: tabEstandar===id ? `2px solid ${B.gold}` : `1px solid ${B.border}`,
                background: tabEstandar===id ? "#FFF7ED" : B.white,
                color: tabEstandar===id ? B.goldDk : B.textSec }}>
              {label}
            </button>
          ))}
        </div>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead>
            <tr style={{ background:B.bg }}>
              {["Ámbito","XS (0-1kg)","S (1-3kg)","M (3-7kg)"].map(h=>(
                <th key={h} style={{ padding:"8px 12px", textAlign:"left", fontSize:10,
                  color:B.textMut, fontWeight:700, textTransform:"uppercase" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.keys(AMBITOS_LABEL).map((ambito,i)=>{
              const fila = filaEstandar(ambito, tabEstandar);
              return (
                <tr key={ambito} style={{ borderTop:`1px solid ${B.border}`,
                  background:i%2===0?B.white:"#F8FAFC" }}>
                  <td style={{ padding:"10px 12px", fontSize:12, fontWeight:600, color:B.navy }}>{AMBITOS_LABEL[ambito]}</td>
                  {fila ? (
                    <>
                      <td style={{ padding:"10px 12px", fontSize:13, fontWeight:700, color:B.gold }}>S/ {fila.tarifa_xs}</td>
                      <td style={{ padding:"10px 12px", fontSize:13, fontWeight:700, color:B.gold }}>S/ {fila.tarifa_s}</td>
                      <td style={{ padding:"10px 12px", fontSize:13, fontWeight:700, color:B.gold }}>S/ {fila.tarifa_m}</td>
                    </>
                  ) : (
                    <td colSpan={3} style={{ padding:"10px 12px", fontSize:11, color:B.textMut, fontStyle:"italic" }}>Sin definir aún</td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        <div style={{ fontSize:11, color:B.textMut, marginTop:10 }}>
          Punto de partida para negociar con cualquier cliente — cada uno puede tener el suyo propio ajustado (ver "Tarifarios negociados por cliente", con la opción "Cargar desde el estándar"). Tarifas sin IGV; +S/1 por kg extra sobre 7kg salvo que indiques otro monto al editar.
        </div>
      </div>

      {/* Tarifario estándar por unidad (transporte y carga) */}
      <div style={{ background:B.white, border:`1px solid ${B.border}`,
        borderRadius:12, padding:20, boxShadow:"0 2px 8px #0D1E3D0A" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
          marginBottom:16, paddingBottom:8, borderBottom:`2px solid ${B.gold}` }}>
          <div style={{ fontSize:14, fontWeight:800, color:B.navy }}>🚛 Tarifario estándar por unidad</div>
          <button onClick={()=>setModalTarifarioVehiculoEstandar(true)}
            style={{ fontSize:11, color:B.blue, background:"none", border:"none", cursor:"pointer", fontWeight:700 }}>
            ✏️ Editar
          </button>
        </div>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead>
            <tr style={{ background:B.bg }}>
              {["Tipo de vehículo","Tarifa base (día)","Recargo periférico"].map(h=>(
                <th key={h} style={{ padding:"8px 12px", textAlign:"left", fontSize:10,
                  color:B.textMut, fontWeight:700, textTransform:"uppercase" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.keys(TIPOS_VEHICULO_LABEL).map((tv,i)=>{
              const fila = tarifarioVehiculoEstandar.find(t=>t.tipo_vehiculo===tv && t.activo);
              return (
                <tr key={tv} style={{ borderTop:`1px solid ${B.border}`,
                  background:i%2===0?B.white:"#F8FAFC" }}>
                  <td style={{ padding:"10px 12px", fontSize:12, fontWeight:600, color:B.navy }}>{TIPOS_VEHICULO_LABEL[tv]}</td>
                  {fila ? (
                    <>
                      <td style={{ padding:"10px 12px", fontSize:13, fontWeight:700, color:B.gold }}>S/ {fila.tarifa_base}</td>
                      <td style={{ padding:"10px 12px", fontSize:12, color:B.textSec }}>{fila.recargo_periferico>0?`+ S/ ${fila.recargo_periferico}`:"—"}</td>
                    </>
                  ) : (
                    <td colSpan={2} style={{ padding:"10px 12px", fontSize:11, color:B.textMut, fontStyle:"italic" }}>Sin definir aún</td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        <div style={{ fontSize:11, color:B.textMut, marginTop:10 }}>
          Tarifa por día según tipo de vehículo — punto de partida para clientes de Transporte y Carga (Deliverman, Globalia, etc.).
        </div>
      </div>

      {/* Catálogo de servicios: líneas de negocio + tipos de servicio */}
      <div style={{ background:B.white, border:`1px solid ${B.border}`,
        borderRadius:12, padding:20, boxShadow:"0 2px 8px #0D1E3D0A", gridColumn:"span 2" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
          marginBottom:16, paddingBottom:8, borderBottom:`2px solid ${B.gold}` }}>
          <div style={{ fontSize:14, fontWeight:800, color:B.navy }}>🗂️ Líneas de negocio y tipos de servicio</div>
          <BtnPri onClick={()=>setModalLinea(true)} style={{ fontSize:12, padding:"7px 14px" }}>+ Nueva línea de negocio</BtnPri>
        </div>
        <div style={{ fontSize:12, color:B.textMut, marginBottom:16 }}>
          Clasifica tus servicios por línea de negocio (ej. Transporte y Carga, Distribución y Última Milla) y sus tipos específicos, cada uno con su propio código — útil para asignar a clientes y para armar facturas de forma consistente.
        </div>
        {lineasNegocio.length===0 ? (
          <div style={{ padding:24, textAlign:"center", color:B.textMut, fontSize:13 }}>
            Aún no hay líneas de negocio registradas
          </div>
        ) : (
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            {lineasNegocio.map(ln=>(
              <div key={ln.id} style={{ border:`1px solid ${B.border}`, borderRadius:10, padding:16 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                  <div>
                    <span style={{ fontSize:10, fontWeight:800, color:B.gold, background:`${B.gold}18`,
                      padding:"2px 8px", borderRadius:8, marginRight:8 }}>{ln.codigo}</span>
                    <span style={{ fontSize:13, fontWeight:700, color:B.navy }}>{ln.nombre}</span>
                  </div>
                  <button onClick={()=>setModalTipo(ln.id)}
                    style={{ fontSize:11, color:B.blue, background:"none", border:"none", cursor:"pointer", fontWeight:600 }}>
                    + Tipo de servicio
                  </button>
                </div>
                {ln.descripcion && <div style={{ fontSize:11, color:B.textMut, marginBottom:10 }}>{ln.descripcion}</div>}
                <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                  {tiposServicio.filter(t=>t.linea_negocio_id===ln.id).map(t=>(
                    <div key={t.id} style={{ background:B.bg, borderRadius:8, padding:"6px 12px", fontSize:11 }}>
                      <span style={{ fontWeight:800, color:B.navy }}>{t.codigo}</span>
                      <span style={{ color:B.textSec }}> — {t.nombre}</span>
                      {t.unidad_medida && <span style={{ color:B.textMut }}> ({t.unidad_medida})</span>}
                    </div>
                  ))}
                  {tiposServicio.filter(t=>t.linea_negocio_id===ln.id).length===0 && (
                    <div style={{ fontSize:11, color:B.textMut, fontStyle:"italic" }}>Sin tipos de servicio aún</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {modalLinea && (
        <ModalLineaNegocio onClose={()=>setModalLinea(false)}
          onSaved={()=>{setModalLinea(false); onRefresh();}} toast={toast}/>
      )}
      {modalTipo && (
        <ModalTipoServicio lineaNegocioId={modalTipo} lineasNegocio={lineasNegocio}
          onClose={()=>setModalTipo(null)}
          onSaved={()=>{setModalTipo(null); onRefresh();}} toast={toast}/>
      )}
      {modalTarifarioEstandar && (
        <ModalTarifarioEstandar tarifarioEstandar={tarifarioEstandar}
          onClose={()=>setModalTarifarioEstandar(false)} onSaved={()=>{onRefresh();}} toast={toast}/>
      )}
      {modalTarifarioVehiculoEstandar && (
        <ModalTarifarioVehiculoEstandar tarifarioVehiculoEstandar={tarifarioVehiculoEstandar}
          onClose={()=>setModalTarifarioVehiculoEstandar(false)} onSaved={()=>{onRefresh();}} toast={toast}/>
      )}
    </div>
  );
}

function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  const entrar = async () => {
    if (!email || !password) { setError("Completa email y contraseña"); return; }
    setCargando(true); setError("");
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) { setError("Credenciales incorrectas"); setCargando(false); return; }
    onLogin(data.session);
  };

  return (
    <div style={{ minHeight:"100vh", background:B.navy, display:"flex",
      alignItems:"center", justifyContent:"center",
      fontFamily:"'Segoe UI','Inter',sans-serif" }}>
      <div style={{ width:360, background:B.navyMd, border:`1px solid ${B.navyBdr}`,
        borderRadius:16, padding:32, boxShadow:"0 20px 60px #0006" }}>
        <div style={{ textAlign:"center", marginBottom:24 }}>
          <div style={{ display:"inline-flex", alignItems:"center", gap:2, marginBottom:6 }}>
            <span style={{ fontSize:28, fontWeight:900, color:"#E8EAF0" }}>BOA</span>
            <span style={{ fontSize:28, fontWeight:900, color:B.gold }}>Z</span>
            <span style={{ fontSize:12, color:"#8FA3BA", marginLeft:6, fontWeight:500 }}>ERP</span>
          </div>
          <div style={{ fontSize:12, color:"#8FA3BA" }}>Panel administrativo</div>
        </div>
        <label style={{ fontSize:11, color:"#8FA3BA", fontWeight:700,
          textTransform:"uppercase", letterSpacing:"0.7px", marginBottom:4, display:"block" }}>Email</label>
        <input type="email" value={email} onChange={e=>setEmail(e.target.value)}
          onKeyDown={e=>e.key==="Enter"&&entrar()}
          style={{ width:"100%", background:B.navy, border:`1px solid ${B.navyBdr}`,
            color:"#fff", borderRadius:8, padding:"10px 12px", fontSize:13,
            outline:"none", marginBottom:14, boxSizing:"border-box" }}/>
        <label style={{ fontSize:11, color:"#8FA3BA", fontWeight:700,
          textTransform:"uppercase", letterSpacing:"0.7px", marginBottom:4, display:"block" }}>Contraseña</label>
        <input type="password" value={password} onChange={e=>setPassword(e.target.value)}
          onKeyDown={e=>e.key==="Enter"&&entrar()}
          style={{ width:"100%", background:B.navy, border:`1px solid ${B.navyBdr}`,
            color:"#fff", borderRadius:8, padding:"10px 12px", fontSize:13,
            outline:"none", marginBottom:16, boxSizing:"border-box" }}/>
        {error && <div style={{ background:"#2D0707", border:"1px solid #EF444444",
          borderRadius:8, padding:"10px 12px", color:"#FCA5A5", fontSize:12,
          marginBottom:14, textAlign:"center" }}>{error}</div>}
        <button onClick={entrar} disabled={cargando}
          style={{ width:"100%", background:`linear-gradient(135deg,${B.gold},${B.goldDk})`,
            border:"none", color:B.navy, padding:"11px", borderRadius:8,
            cursor:cargando?"not-allowed":"pointer", fontSize:13, fontWeight:800 }}>
          {cargando?"Ingresando...":"Ingresar"}
        </button>
      </div>
    </div>
  );
}// ══════════════════════════════════════════════════════════════
// APP PRINCIPAL
// ══════════════════════════════════════════════════════════════
export default function BoazERP() {
  const [sesion, setSesion] = useState(null);
  const [usuario, setUsuario] = useState(null);
  const [verificando, setVerificando] = useState(true);

  useEffect(() => {
    sb.auth.getSession().then(({data}) => {
      if (data.session) cargarUsuario(data.session);
      else setVerificando(false);
    });
  }, []);

  const cargarUsuario = async (session) => {
    const { data } = await sb.from("usuarios").select("*").eq("id", session.user.id).single();
    setSesion(session); setUsuario(data); setVerificando(false);
  };

  const cerrarSesion = async () => {
    await sb.auth.signOut();
    setSesion(null); setUsuario(null);
  };
  const [seccion, setSeccion] = useState("dashboard");
  const [pedidos, setPedidos] = useState([]);
  const [repartidores, setRepartidores] = useState([]);
  const [empresas, setEmpresas] = useState([]);
  const [liquidaciones, setLiquidaciones] = useState([]);
  const [lineasNegocio, setLineasNegocio] = useState([]);
  const [tiposServicio, setTiposServicio] = useState([]);
  const [unidades, setUnidades] = useState([]);
  const [asignacionesUnidad, setAsignacionesUnidad] = useState([]);
  const [tarifariosCliente, setTarifariosCliente] = useState([]);
  const [tarifarioVehiculoCliente, setTarifarioVehiculoCliente] = useState([]);
  const [tarifarioEstandar, setTarifarioEstandar] = useState([]);
  const [tarifarioVehiculoEstandar, setTarifarioVehiculoEstandar] = useState([]);
  const [recargoFeriadoPct, setRecargoFeriadoPct] = useState(0);
  const [diasServicio, setDiasServicio] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [toast, setToast] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const showToast = useCallback((msg, tipo="ok") => setToast({msg,tipo}), []);

  const cargar = useCallback(async (opts={}) => {
    if (!opts.silencioso) setCargando(true);
    try {
      const [p,r,e,l,ln,ts,u,au,tc,ds,tv,te,tve,cr] = await Promise.all([
        sb.from("pedidos").select("*").order("created_at",{ascending:false}),
        sb.from("repartidores").select("*").order("nombres"),
        sb.from("empresas").select("*").order("nombre"),
        sb.from("liquidaciones").select("*").order("created_at",{ascending:false}),
        sb.from("lineas_negocio").select("*").order("codigo"),
        sb.from("tipos_servicio").select("*").order("codigo"),
        sb.from("unidades_transporte").select("*").order("placa"),
        sb.from("asignaciones_unidad").select("*").order("fecha_inicio",{ascending:false}),
        sb.from("tarifarios_cliente").select("*"),
        sb.from("dias_servicio_unidad").select("*"),
        sb.from("tarifario_vehiculo_cliente").select("*"),
        sb.from("tarifario_estandar").select("*"),
        sb.from("tarifario_vehiculo_estandar").select("*"),
        sb.from("configuracion_recargos").select("*").limit(1).maybeSingle(),
      ]);
      if(p.data) setPedidos(p.data);
      if(r.data) setRepartidores(r.data);
      if(e.data) setEmpresas(e.data);
      if(l.data) setLiquidaciones(l.data);
      if(ln.data) setLineasNegocio(ln.data);
      if(ts.data) setTiposServicio(ts.data);
      if(u.data) setUnidades(u.data);
      if(au.data) setAsignacionesUnidad(au.data);
      if(tc.data) setTarifariosCliente(tc.data);
      if(ds.data) setDiasServicio(ds.data);
      if(tv.data) setTarifarioVehiculoCliente(tv.data);
      if(te.data) setTarifarioEstandar(te.data);
      if(tve.data) setTarifarioVehiculoEstandar(tve.data);
      if(cr.data) setRecargoFeriadoPct(parseFloat(cr.data.recargo_feriado_pct)||0);
    } catch(err) { console.error(err); }
    if (!opts.silencioso) setCargando(false);
  }, []);

  const cargarSilencioso = useCallback(() => cargar({ silencioso:true }), [cargar]);

  useEffect(() => { cargar(); }, [cargar]);

  // Realtime
  useEffect(() => {
    const ch = sb.channel("boaz-rt")
      .on("postgres_changes",{event:"*",schema:"public",table:"pedidos"},cargar)
      .subscribe();
    return () => sb.removeChannel(ch);
  }, [cargar]);

  const NAV = [
    { section:"OPERACIONES" },
    { id:"dashboard",    icon:"🏠", label:"Dashboard" },
    { id:"pedidos",      icon:"📋", label:"Pedidos",
      badge: pedidos.filter(p=>p.estado==="sin_asignar").length || null },
    { id:"repartidores", icon:"🛵", label:"Repartidores" },
    { id:"unidades",     icon:"🚛", label:"Unidades" },
    { section:"COMERCIAL" },
    { id:"clientes",     icon:"🏢", label:"Clientes" },
    { id:"catalogo",     icon:"🗂️", label:"Catálogo" },
    { section:"FINANZAS" },
    { id:"liquidaciones",icon:"💰", label:"Liq. Repartidores",
      badge: liquidaciones.filter(l=>l.estado==="pendiente").length || null },
    { id:"liquidacion-transporte", icon:"📅", label:"Liq. Transporte" },
    { id:"liquidacion-clientes", icon:"💼", label:"Liq. Clientes" },
    { id:"facturacion",  icon:"🧾", label:"Facturación" },
    { id:"planilla",     icon:"👥", label:"Planilla" },
    { section:"ANÁLISIS" },
    { id:"reportes",     icon:"📊", label:"Reportes" },
    { section:"SISTEMA" },
    { id:"configuracion",icon:"⚙️", label:"Configuración" },
  ];

  const sideW = sidebarOpen ? 220 : 60;
  
if (verificando) {
    return (
      <div style={{ minHeight:"100vh", background:B.navy, display:"flex",
        alignItems:"center", justifyContent:"center", color:"#8FA3BA", fontSize:13 }}>
        Verificando sesión...
      </div>
    );
  }

  if (!sesion || !usuario) {
    return <Login onLogin={cargarUsuario}/>;
  }

  const navVisible = NAV.filter(n => n.section || (ROLES_ACCESO[usuario.rol]||[]).includes(n.id));
  
  return (
    <div style={{ display:"flex", height:"100vh", background:B.bg,
      color:B.textPri, fontFamily:"'Segoe UI','Inter',sans-serif", overflow:"hidden" }}>

      {/* SIDEBAR */}
      <div style={{ width:sideW, background:B.navy, display:"flex",
        flexDirection:"column", flexShrink:0, transition:"width 0.2s",
        boxShadow:"4px 0 20px #0D1E3D33", overflow:"hidden" }}>

        {/* Logo */}
        <div style={{ padding:"18px 14px 14px", borderBottom:"1px solid #1E3560",
          display:"flex", alignItems:"center", gap:10, minHeight:70 }}>
          <div style={{ width:36, height:36, flexShrink:0,
            background:`linear-gradient(135deg,${B.gold},${B.goldDk})`,
            borderRadius:10, display:"flex", alignItems:"center",
            justifyContent:"center", fontSize:18, fontWeight:800 }}>B</div>
          {sidebarOpen && (
            <div style={{ overflow:"hidden" }}>
              <div style={{ fontSize:16, fontWeight:800, letterSpacing:"1px",
                whiteSpace:"nowrap", display:"flex", alignItems:"center", gap:0 }}>
                <span style={{ color:"#E8EAF0" }}>BOA</span>
                <span style={{ color:"#E8780A" }}>Z</span>
                <span style={{ color:"#8FA3BA", fontSize:11, marginLeft:6, fontWeight:500 }}>ERP</span>
              </div>
              <div style={{ fontSize:9, color:"#8FA3BA", whiteSpace:"nowrap" }}>Grupo Boaz S.A.C.</div>
            </div>
          )}
          <button onClick={()=>setSidebarOpen(s=>!s)}
            style={{ marginLeft:"auto", background:"none", border:"none",
              color:"#8FA3BA", cursor:"pointer", fontSize:16, flexShrink:0 }}>
            {sidebarOpen?"◀":"▶"}
          </button>
        </div>

        {/* Nav */}
        <nav style={{ flex:1, padding:"12px 8px", overflowY:"auto" }}>
          
  {navVisible.map((n,i) => {
            if (n.section) return sidebarOpen ? (
              <div key={i} style={{ fontSize:9, fontWeight:700, color:"#4A6080",
                letterSpacing:"1.2px", textTransform:"uppercase",
                padding:"12px 8px 4px" }}>{n.section}</div>
            ) : <div key={i} style={{ margin:"8px 0", height:1, background:"#1E3560" }}/>;
            const active = seccion===n.id;
            return (
              <div key={n.id} onClick={()=>setSeccion(n.id)}
                style={{ display:"flex", alignItems:"center", gap:10,
                  padding: sidebarOpen?"10px 10px":"10px 0",
                  justifyContent: sidebarOpen?"flex-start":"center",
                  borderRadius:8, cursor:"pointer", marginBottom:2,
                  background: active?`linear-gradient(135deg,${B.gold}22,${B.gold}11)`:"transparent",
                  borderLeft: active?`3px solid ${B.gold}`:"3px solid transparent",
                  color: active?B.gold:"#8FA3BA",
                  fontWeight: active?700:400, fontSize:13, transition:"all 0.15s" }}>
                <span style={{ fontSize:16, flexShrink:0 }}>{n.icon}</span>
                {sidebarOpen && <span style={{ flex:1, whiteSpace:"nowrap" }}>{n.label}</span>}
                {sidebarOpen && n.badge ? (
                  <span style={{ background:B.red, color:"#fff", fontSize:9,
                    fontWeight:700, padding:"2px 6px", borderRadius:10 }}>{n.badge}</span>
                ) : null}
              </div>
            );
          })}
        </nav>

        {/* Footer */}
        {sidebarOpen && (
          <div style={{ padding:"12px 14px", borderTop:"1px solid #1E3560",
            fontSize:9, color:"#4A6080" }}>
            <div style={{ color:B.gold, fontWeight:600, marginBottom:2 }}>Con Boaz, tu negocio no para</div>
            <div>v2.0 · {new Date().toLocaleDateString("es-PE")}</div>
          </div>
        )}
      </div>

      {/* MAIN */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>

        {/* Topbar */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
          padding:"12px 24px", background:B.white,
          borderBottom:`1px solid ${B.border}`,
          boxShadow:"0 2px 8px #0D1E3D0A", flexShrink:0 }}>
          <div>
            <div style={{ fontSize:17, fontWeight:800, color:B.navy }}>
              {NAV.find(n=>n.id===seccion)?.icon} {NAV.find(n=>n.id===seccion)?.label}
            </div>
            <div style={{ fontSize:11, color:B.textMut, marginTop:1 }}>
              <span style={{ display:"inline-block", width:7, height:7,
                background:B.green, borderRadius:"50%", marginRight:5 }}></span>
              Sistema activo · {new Date().toLocaleDateString("es-PE",
                {weekday:"long",day:"numeric",month:"long",year:"numeric"})}
            </div>
          </div>
          <div style={{ display:"flex", gap:10, alignItems:"center" }}>
            <button onClick={cargar}
              style={{ background:B.bg, border:`1px solid ${B.border}`,
                color:B.textSec, padding:"7px 14px", borderRadius:8,
                cursor:"pointer", fontSize:12 }}>🔄 Actualizar</button>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
  <div style={{ textAlign:"right" }}>
    <div style={{ fontSize:12, fontWeight:700, color:B.navy }}>{usuario.nombre}</div>
    <div style={{ fontSize:10, color:B.textMut, textTransform:"capitalize" }}>{usuario.rol}</div>
  </div>
  <div style={{ width:36, height:36,
    background:`linear-gradient(135deg,${B.navy},${B.navyLt})`,
    borderRadius:"50%", display:"flex", alignItems:"center",
    justifyContent:"center", fontSize:14, fontWeight:800, color:B.gold }}>
    {usuario.nombre?.[0]}
  </div>
  <button onClick={cerrarSesion}
    style={{ background:"none", border:`1px solid ${B.border}`, color:B.textSec,
      fontSize:11, padding:"6px 10px", borderRadius:6, cursor:"pointer" }}>Salir</button>
</div>
</div>
</div>
        {/* Contenido */}
        <div style={{ flex:1, overflowY:"auto", padding:24 }}>
          {cargando ? (
            <div style={{ display:"flex", flexDirection:"column", alignItems:"center",
              justifyContent:"center", height:"100%", gap:16 }}>
              <div style={{ width:48, height:48,
                background:`linear-gradient(135deg,${B.gold},${B.goldDk})`,
                borderRadius:12, display:"flex", alignItems:"center",
                justifyContent:"center", fontSize:24, animation:"spin 1s linear infinite" }}>📦</div>
              <div style={{ fontSize:14, color:B.textMut }}>Cargando Boaz ERP...</div>
            </div>
          ) : (
            <>
              {seccion==="dashboard"     && <Dashboard pedidos={pedidos} repartidores={repartidores} liquidaciones={liquidaciones}/>}
              {seccion==="pedidos"       && <Pedidos pedidos={pedidos} repartidores={repartidores} empresas={empresas} tarifariosCliente={tarifariosCliente} tarifarioEstandar={tarifarioEstandar} onRefresh={cargarSilencioso} toast={showToast}/>}
              {seccion==="repartidores"  && <Repartidores repartidores={repartidores} pedidos={pedidos} onRefresh={cargarSilencioso} toast={showToast}/>}
              {seccion==="unidades"      && <Unidades unidades={unidades} asignaciones={asignacionesUnidad} empresas={empresas} tiposServicio={tiposServicio} repartidores={repartidores} tarifarioVehiculoCliente={tarifarioVehiculoCliente} onRefresh={cargarSilencioso} toast={showToast}/>}
              {seccion==="clientes"      && <Clientes empresas={empresas} pedidos={pedidos} lineasNegocio={lineasNegocio} tarifariosCliente={tarifariosCliente} tarifarioVehiculoCliente={tarifarioVehiculoCliente} tarifarioEstandar={tarifarioEstandar} tarifarioVehiculoEstandar={tarifarioVehiculoEstandar} onRefresh={cargarSilencioso} toast={showToast}/>}
              {seccion==="catalogo"      && <Catalogo lineasNegocio={lineasNegocio} tiposServicio={tiposServicio} tarifarioEstandar={tarifarioEstandar} tarifarioVehiculoEstandar={tarifarioVehiculoEstandar} recargoFeriadoPct={recargoFeriadoPct} onRefresh={cargarSilencioso} toast={showToast}/>}
              {seccion==="liquidaciones" && <Liquidaciones repartidores={repartidores} pedidos={pedidos} liquidaciones={liquidaciones} onRefresh={cargarSilencioso} toast={showToast}/>}
              {seccion==="liquidacion-transporte" && <LiquidacionTransporte unidades={unidades} asignaciones={asignacionesUnidad} empresas={empresas} tiposServicio={tiposServicio} diasServicio={diasServicio} recargoFeriadoPct={recargoFeriadoPct} onRefresh={cargarSilencioso} toast={showToast}/>}
              {seccion==="liquidacion-clientes" && <LiquidacionClientes pedidos={pedidos} empresas={empresas} unidades={unidades} asignacionesUnidad={asignacionesUnidad} diasServicio={diasServicio} tarifarioVehiculoEstandar={tarifarioVehiculoEstandar} recargoFeriadoPct={recargoFeriadoPct} toast={showToast}/>}
              {seccion==="facturacion"   && <Facturacion empresas={empresas} pedidos={pedidos} tiposServicio={tiposServicio} usuario={usuario} toast={showToast}/>}
              {seccion==="planilla"      && <Planilla toast={showToast}/>}
              {seccion==="reportes"      && <Reportes pedidos={pedidos} repartidores={repartidores} empresas={empresas} toast={showToast}/>}
              {seccion==="configuracion" && <Configuracion onRefresh={cargarSilencioso} toast={showToast}/>}
            </>
          )}
        </div>
      </div>

      {toast && <Toast msg={toast.msg} tipo={toast.tipo} onClose={()=>setToast(null)}/>}
    </div>
  );
}
