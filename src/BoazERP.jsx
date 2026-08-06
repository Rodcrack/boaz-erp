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
  fecha: (d) => d ? new Date(d).toLocaleDateString("es-PE") : "—",
  hora:  (d) => d ? new Date(d).toLocaleTimeString("es-PE", {hour:"2-digit",minute:"2-digit"}) : "—",
  sol:   (n) => n != null ? `S/ ${parseFloat(n).toFixed(2)}` : "—",
};

const ESTADOS_PEDIDO = {
  sin_asignar: { bg:"#EFF6FF", color:"#1D4ED8", label:"Sin asignar" },
  asignado:    { bg:"#FFF7ED", color:"#C2410C", label:"Asignado" },
  en_ruta:     { bg:"#FFFBEB", color:"#B45309", label:"En ruta" },
  entregado:   { bg:"#ECFDF5", color:"#065F46", label:"Entregado" },
  no_entregado:{ bg:"#FEF2F2", color:"#991B1B", label:"No entregado" },
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
const obtenerTarifaEmpresa = (empresaId, ambito, tarifariosCliente) => {
  if (!empresaId) return null;
  return tarifariosCliente.find(t=>t.empresa_id===empresaId && t.ambito===ambito && t.activo) || null;
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
  admin: ["dashboard","pedidos","repartidores","clientes","unidades","catalogo","liquidaciones","liquidacion-transporte","facturacion","reportes","configuracion"],
  operaciones: ["dashboard","pedidos","repartidores","clientes","unidades","catalogo"],
  finanzas: ["dashboard","clientes","catalogo","liquidaciones","liquidacion-transporte","facturacion","reportes"],
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
function Dashboard({ pedidos, repartidores, liquidaciones }) {
  const hoy = new Date().toISOString().split("T")[0];
  const hoyP = pedidos.filter(p => p.created_at?.startsWith(hoy));
  const entregados = pedidos.filter(p => p.estado==="entregado");
  const enRuta = pedidos.filter(p => p.estado==="en_ruta");
  const sinAsignar = pedidos.filter(p => p.estado==="sin_asignar");
  const ingresoHoy = hoyP.reduce((a,p)=>a+(parseFloat(p.tarifa_s)||0),0);
  const efectividad = pedidos.length ? Math.round(entregados.length/pedidos.length*100) : 0;

  const kpis = [
    { icon:"📦", label:"Pedidos hoy", value: hoyP.length, sub:`${pedidos.length} total`, color: B.navy },
    { icon:"✅", label:"Entregados", value: entregados.length, sub:`${efectividad}% efectividad`, color: B.green },
    { icon:"🛵", label:"En ruta", value: enRuta.length, sub:"activos ahora", color: B.gold },
    { icon:"⚠️", label:"Sin asignar", value: sinAsignar.length, sub: sinAsignar.length>0?"requieren atención":"todo OK", color: sinAsignar.length>0?B.red:B.green },
    { icon:"💰", label:"Ingresos hoy", value: fmt.sol(ingresoHoy), sub:"antes de IGV", color: B.goldDk, big:true },
    { icon:"🏍️", label:"Repartidores", value: repartidores.filter(r=>r.activo).length, sub:"activos", color: B.navy },
  ];

  const porEstado = Object.entries(ESTADOS_PEDIDO).map(([k,v])=>({
    estado: k, label: v.label, color: v.color,
    count: pedidos.filter(p=>p.estado===k).length
  }));

  const recientes = [...pedidos].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,8);

  return (
    <div>
      {/* KPIs */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(6,1fr)", gap:14, marginBottom:24 }}>
        {kpis.map((k,i) => (
          <div key={i} style={{ background:B.white, border:`1px solid ${B.border}`,
            borderRadius:12, padding:18, borderTop:`3px solid ${k.color}`,
            boxShadow:"0 2px 8px #0D1E3D0A" }}>
            <div style={{ fontSize:22, marginBottom:8 }}>{k.icon}</div>
            <div style={{ fontSize:10, color:B.textMut, textTransform:"uppercase",
              letterSpacing:"0.8px", marginBottom:4 }}>{k.label}</div>
            <div style={{ fontSize: k.big?18:28, fontWeight:800, color:B.textPri, lineHeight:1 }}>{k.value}</div>
            <div style={{ fontSize:11, color:B.textSec, marginTop:5 }}>{k.sub}</div>
          </div>
        ))}
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
                {["Tracking Boaz","Destinatario","Distrito","Tarifa","Repartidor","Estado","Fecha"].map(h=>(
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
                  <td style={{ padding:"10px 14px", fontSize:12, color:B.textPri }}>{p.dest_nombre}</td>
                  <td style={{ padding:"10px 14px", fontSize:12, color:B.textSec }}>{p.dest_distrito||"—"}</td>
                  <td style={{ padding:"10px 14px", fontSize:12, fontWeight:600, color:B.textPri }}>{fmt.sol(p.tarifa_s)}</td>
                  <td style={{ padding:"10px 14px", fontSize:12, color:B.textSec }}>
  {repartidores.find(r=>r.id===p.repartidor_id) ?
    `${repartidores.find(r=>r.id===p.repartidor_id).nombres} ${repartidores.find(r=>r.id===p.repartidor_id).apellidos}` : "—"}
</td>
                  <td style={{ padding:"10px 14px" }}><Chip estado={p.estado}/></td>
                  <td style={{ padding:"10px 14px", fontSize:11, color:B.textMut }}>{fmt.fecha(p.created_at)}</td>
                </tr>
              ))}
              {recientes.length===0&&<tr><td colSpan={7} style={{ padding:32, textAlign:"center",
                color:B.textMut, fontSize:13 }}>No hay pedidos aún</td></tr>}
            </tbody>
          </table>
        </div>

        {/* Panel derecho */}
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          {/* Distribución por estado */}
          <div style={{ background:B.white, border:`1px solid ${B.border}`, borderRadius:12,
            padding:16, boxShadow:"0 2px 8px #0D1E3D0A" }}>
            <div style={{ fontSize:12, fontWeight:700, color:B.textPri, marginBottom:12 }}>Estado de pedidos</div>
            {porEstado.map(e => (
              <div key={e.estado} style={{ marginBottom:10 }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                  <span style={{ fontSize:11, color:B.textSec }}>{e.label}</span>
                  <span style={{ fontSize:11, fontWeight:700, color:e.color }}>{e.count}</span>
                </div>
                <div style={{ height:5, background:B.bg, borderRadius:4, overflow:"hidden" }}>
                  <div style={{ height:"100%", background:e.color, borderRadius:4,
                    width: pedidos.length ? `${(e.count/pedidos.length)*100}%` : "0%" }} />
                </div>
              </div>
            ))}
          </div>

          {/* Top repartidores */}
          <div style={{ background:B.white, border:`1px solid ${B.border}`, borderRadius:12,
            padding:16, boxShadow:"0 2px 8px #0D1E3D0A", flex:1 }}>
            <div style={{ fontSize:12, fontWeight:700, color:B.textPri, marginBottom:12 }}>Top repartidores</div>
            {repartidores.slice(0,5).map(r => {
              const count = pedidos.filter(p=>p.repartidor_id===r.id).length;
              const ent = pedidos.filter(p=>p.repartidor_id===r.id&&p.estado==="entregado").length;
              return (
                <div key={r.id} style={{ display:"flex", alignItems:"center", gap:10,
                  padding:"8px 0", borderBottom:`1px solid ${B.border}` }}>
                  <div style={{ width:32, height:32, borderRadius:"50%",
                    background:`linear-gradient(135deg,${B.navy},${B.navyLt})`,
                    display:"flex", alignItems:"center", justifyContent:"center",
                    fontSize:12, fontWeight:700, color:B.gold, flexShrink:0 }}>
                    {r.nombres?.[0]}{r.apellidos?.[0]}
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:12, color:B.textPri, fontWeight:600 }}>{r.nombres} {r.apellidos}</div>
                    <div style={{ fontSize:10, color:B.textMut }}>{ent}/{count} entregados</div>
                  </div>
                  <div style={{ fontSize:16, fontWeight:800, color:B.gold }}>{count}</div>
                </div>
              );
            })}
            {repartidores.length===0&&<div style={{ fontSize:12, color:B.textMut, textAlign:"center", padding:16 }}>Sin repartidores</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// MÓDULO 2: PEDIDOS COMPLETO
// ══════════════════════════════════════════════════════════════
function Pedidos({ pedidos, repartidores, empresas, tarifariosCliente, onRefresh, toast }) {
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [busqueda, setBusqueda] = useState("");
  const [modalNuevo, setModalNuevo] = useState(false);
  const [modalCarga, setModalCarga] = useState(false);
  const [modalGeocodificar, setModalGeocodificar] = useState(false);
  const [modalDetalle, setModalDetalle] = useState(null);
  const [asignando, setAsignando] = useState(null);

  const filtrados = pedidos.filter(p => {
    const okE = filtroEstado==="todos" || p.estado===filtroEstado;
    const okB = !busqueda ||
      p.omd?.toLowerCase().includes(busqueda.toLowerCase()) ||
      p.dest_nombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
      p.dest_distrito?.toLowerCase().includes(busqueda.toLowerCase()) ||
      p.dest_telefono?.includes(busqueda);
    return okE && okB;
  });

  const cambiarEstado = async (id, nuevoEstado) => {
    const extra = nuevoEstado==="entregado" ? {fecha_entrega:new Date().toISOString()} :
                  nuevoEstado==="en_ruta"   ? {fecha_asignacion:new Date().toISOString()} : {};
    const { error } = await sb.from("pedidos").update({estado:nuevoEstado,...extra}).eq("id",id);
    if (error) { toast("Error: "+error.message,"error"); return; }
    toast("Estado actualizado ✓");
    onRefresh();
  };

  const asignarRep = async (pedidoId, repId) => {
    const { error } = await sb.from("pedidos").update({
      repartidor_id: repId, estado:"asignado",
      fecha_asignacion: new Date().toISOString()
    }).eq("id", pedidoId);
    if (error) { toast("Error: "+error.message,"error"); return; }
    toast("Repartidor asignado ✓");
    setAsignando(null); onRefresh();
  };

  return (
    <div>
      {/* Barra de herramientas */}
      <div style={{ display:"flex", gap:10, marginBottom:16, flexWrap:"wrap", alignItems:"center" }}>
        <input placeholder="🔍 Buscar por OMD, nombre, teléfono, distrito..."
          value={busqueda} onChange={e=>setBusqueda(e.target.value)}
          style={{ ...inp, width:320 }} />
        <div style={{ display:"flex", gap:6 }}>
          {["todos",...Object.keys(ESTADOS_PEDIDO)].map(e=>(
            <button key={e} onClick={()=>setFiltroEstado(e)}
              style={{ padding:"7px 12px", borderRadius:20, fontSize:11, fontWeight:600,
                cursor:"pointer", border:`1px solid ${filtroEstado===e?B.gold:B.border}`,
                background: filtroEstado===e?B.gold:"transparent",
                color: filtroEstado===e?B.navy:B.textSec }}>
              {e==="todos"?"Todos":ESTADOS_PEDIDO[e].label}
            </button>
          ))}
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
              {["Tracking Boaz","Destinatario","Dirección","Peso","Tarifa","Ámbito","Repartidor","Estado","Fecha","Acciones"].map(h=>(
                <th key={h} style={{ padding:"10px 14px", textAlign:"left", fontSize:10,
                  color:B.textMut, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.7px" }}>{h}</th>
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
                  <td style={{ padding:"11px 14px" }}>
                    <div style={{ fontSize:12, color:B.textPri, fontWeight:600 }}>{p.dest_nombre}</div>
                    <div style={{ fontSize:10, color:B.textMut }}>{p.dest_telefono}</div>
                  </td>
                  <td style={{ padding:"11px 14px" }}>
                    <div style={{ fontSize:12, color:B.textSec }}>{p.dest_direccion?.slice(0,30)}{p.dest_direccion?.length>30?"...":""}</div>
                    <div style={{ fontSize:10, color:B.textMut }}>{p.dest_distrito}</div>
                  </td>
                  <td style={{ padding:"11px 14px", fontSize:12, color:B.textSec }}>{p.peso_kg?p.peso_kg+" kg":"—"}</td>
                  <td style={{ padding:"11px 14px", fontSize:12, fontWeight:700, color:B.navy }}>{fmt.sol(p.tarifa_s)}</td>
                  <td style={{ padding:"11px 14px", fontSize:11, color:B.textSec, textTransform:"capitalize" }}>{p.ambito?.replace("_"," ")||"—"}</td>
                  <td style={{ padding:"11px 14px" }} onClick={e=>e.stopPropagation()}>
                    {asignando===p.id ? (
                      <select autoFocus onChange={e=>{if(e.target.value)asignarRep(p.id,e.target.value);}}
                        style={{ ...inp, padding:"4px 8px", fontSize:11, width:"auto" }}>
                        <option value="">Selecciona...</option>
                        {repartidores.filter(r=>r.activo).map(r=>(
                          <option key={r.id} value={r.id}>{r.nombres} {r.apellidos}</option>
                        ))}
                      </select>
                    ) : rep ? (
                      <span style={{ fontSize:12, color:B.textPri }}>{rep.nombres} {rep.apellidos}</span>
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

      {modalNuevo && <ModalNuevoPedido repartidores={repartidores} empresas={empresas} tarifariosCliente={tarifariosCliente}
        onClose={()=>setModalNuevo(false)} onSaved={()=>{setModalNuevo(false);onRefresh();}} toast={toast}/>}
      {modalCarga && <ModalCargaMasiva repartidores={repartidores} empresas={empresas} tarifariosCliente={tarifariosCliente}
        onClose={()=>setModalCarga(false)} onSaved={()=>{onRefresh();}} toast={toast}/>}
      {modalGeocodificar && <ModalGeocodificarPendientes pedidos={pedidos}
        onClose={()=>setModalGeocodificar(false)} onDone={onRefresh} toast={toast}/>}
      {modalDetalle && <ModalDetallePedido pedido={modalDetalle} repartidores={repartidores}
        onClose={()=>setModalDetalle(null)} onRefresh={onRefresh} toast={toast}/>}
    </div>
  );
}

// Modal nuevo pedido
function ModalNuevoPedido({ repartidores, empresas, tarifariosCliente, onClose, onSaved, toast }) {
  const getTarifa = getTarifaSameDay;
  const [f, setF] = useState({
    dest_nombre:"", dest_telefono:"", dest_direccion:"", dest_distrito:"",
    dest_referencia:"", peso_kg:"", ambito:"urbano", empresa_id:"",
    repartidor_id:"", cobro_destino:false, monto_cobrar:"",
    descripcion:"", fecha_programada: new Date().toISOString().split("T")[0],
  });
  const tarifaPersonalizada = obtenerTarifaEmpresa(f.empresa_id, f.ambito, tarifariosCliente);
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
              {tarifaPersonalizada && <span style={{ color:B.green, fontWeight:700 }}> · tarifario personalizado ✓</span>}
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
          <Field label="Descripción del contenido"><input style={inp} value={f.descripcion} onChange={e=>setF(p=>({...p,descripcion:e.target.value}))}/></Field>
        </Row>

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
      out.tipo_servicio = t.includes("next") ? "next_day" : t.includes("same") ? "same_day" : "";
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

function ModalCargaMasiva({ repartidores, empresas, tarifariosCliente, onClose, onSaved, toast }) {
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
    try {
      for (let i=0; i<validas.length; i++) {
        const fila = validas[i];
        setProgreso(`Ubicando dirección ${i+1} de ${validas.length}...`);
        try {
          const { data: codigo, error: errCodigo } = await sb.rpc("generar_codigo_boaz");
          if (errCodigo || !codigo) { generados.push({ ...fila, ok:false, error:"no se pudo generar código: "+(errCodigo?.message||"sin detalle") }); continue; }
          const coords = await geocodificarDireccion(fila.dest_direccion, fila.dest_distrito);
          const tarifaPersonalizada = obtenerTarifaEmpresa(empresaId, fila.ambito, tarifariosCliente);
          const tarifa = getTarifaSameDay(fila.ambito, fila.peso_kg, tarifaPersonalizada);
          const { error: errInsert } = await sb.from("pedidos").insert({
            omd: codigo,
            empresa_id: empresaId,
            repartidor_id: repartidorId || null,
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
  const timeline = [
    { label:"Creado", fecha: p.created_at, ok: true },
    { label:"Asignado", fecha: p.fecha_asignacion, ok: !!p.fecha_asignacion },
    { label:"En ruta", fecha: p.fecha_asignacion, ok: ["en_ruta","entregado"].includes(p.estado) },
    { label:"Entregado", fecha: p.fecha_entrega, ok: p.estado==="entregado" },
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
        <div style={{ display:"flex", gap:0, marginBottom:24 }}>
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
            {[["Peso",p.peso_kg?p.peso_kg+" kg":"—"],["Tarifa",fmt.sol(p.tarifa_s)],
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
        {p.foto_evidencia && (
          <div style={{ marginTop:16 }}>
            <div style={{ fontSize:11, color:B.textMut, marginBottom:6 }}>Foto de evidencia</div>
            <img src={p.foto_evidencia} style={{ width:"100%", borderRadius:8, maxHeight:200, objectFit:"cover" }}/>
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
    email:"", vehiculo:"moto", placa:"", zona_default:"urbano" };
  const [f, setF] = useState(emptyForm);

  const guardar = async () => {
    if (!f.nombres || !f.dni) { toast("Nombre y DNI son obligatorios","error"); return; }
    const payload = { ...f, email: f.email?.trim() ? f.email.trim() : null, activo:true };
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
function Clientes({ empresas, pedidos, lineasNegocio, tarifariosCliente, onRefresh, toast }) {
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState(null);
  const empty = { nombre:"", ruc:"", contacto:"", telefono:"", email:"", direccion:"", puede_generar_etiquetas:false, linea_negocio_id:"" };
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

function ModalTarifarioCliente({ empresa, tarifariosCliente, onClose, onSaved, toast }) {
  const AMBITOS = [
    { id:"urbano", label:"Urbano" },
    { id:"semi_urbano", label:"Semi Urbano" },
    { id:"periferico", label:"Periférico" },
  ];
  const inicial = {};
  AMBITOS.forEach(a=>{
    const existente = tarifariosCliente.find(t=>t.empresa_id===empresa.id && t.ambito===a.id);
    inicial[a.id] = existente
      ? { xs:existente.tarifa_xs, s:existente.tarifa_s, m:existente.tarifa_m, extra:existente.extra_kg??1 }
      : { xs:"", s:"", m:"", extra:1 };
  });
  const [valores, setValores] = useState(inicial);
  const [guardando, setGuardando] = useState(false);

  const set = (ambito, campo, valor) => setValores(p=>({ ...p, [ambito]: { ...p[ambito], [campo]:valor } }));

  const guardar = async () => {
    setGuardando(true);
    for (const a of AMBITOS) {
      const v = valores[a.id];
      const completo = v.xs!=="" && v.s!=="" && v.m!=="";
      if (!completo) continue; // ámbito sin personalizar, no se guarda (usa el genérico)
      await sb.from("tarifarios_cliente").upsert({
        empresa_id: empresa.id, ambito: a.id,
        tarifa_xs: parseFloat(v.xs), tarifa_s: parseFloat(v.s), tarifa_m: parseFloat(v.m),
        extra_kg: parseFloat(v.extra)||1, activo:true,
      }, { onConflict: "empresa_id,ambito" });
    }
    setGuardando(false);
    toast("Tarifario guardado ✓");
    onSaved();
    onClose();
  };

  const quitarAmbito = async (ambitoId) => {
    await sb.from("tarifarios_cliente").delete().eq("empresa_id", empresa.id).eq("ambito", ambitoId);
    set(ambitoId, "xs", ""); set(ambitoId, "s", ""); set(ambitoId, "m", "");
    toast(`Tarifario personalizado de ${ambitoId.replace("_"," ")} eliminado — vuelve a usar el genérico`);
    onSaved();
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"#0008", zIndex:1000,
      display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ background:B.white, borderRadius:16, padding:28, width:560,
        maxHeight:"85vh", overflowY:"auto", boxShadow:"0 20px 60px #0003" }}>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
          <div style={{ fontSize:16, fontWeight:800, color:B.navy }}>💰 Tarifario de {empresa.nombre}</div>
          <button onClick={onClose} style={{ background:"none", border:"none", fontSize:20,
            color:B.textSec, cursor:"pointer" }}>✕</button>
        </div>
        <div style={{ fontSize:12, color:B.textMut, marginBottom:20 }}>
          Deja un ámbito en blanco para que ese cliente siga usando el tarifario genérico. Completa los tres valores (XS/S/M) de un ámbito para activar su tarifa negociada ahí.
        </div>

        {AMBITOS.map(a=>{
          const v = valores[a.id];
          const activo = v.xs!=="" && v.s!=="" && v.m!=="";
          return (
            <div key={a.id} style={{ border:`1px solid ${B.border}`, borderRadius:10, padding:14, marginBottom:12,
              background: activo ? "#FFF8EF" : B.bg }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                <div style={{ fontSize:13, fontWeight:700, color:B.navy }}>
                  {a.label} {activo && <span style={{ color:B.green, fontSize:11 }}>· personalizado ✓</span>}
                </div>
                {activo && (
                  <button onClick={()=>quitarAmbito(a.id)}
                    style={{ fontSize:11, color:B.red, background:"none", border:"none", cursor:"pointer" }}>Quitar</button>
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
const calcularMontoAsignacion = (a, diasServicio) => calcularDiasAsignacion(a, diasServicio) * (parseFloat(a.tarifa_dia)||0);
const calcularIGVAsignacion = (a, diasServicio) => calcularMontoAsignacion(a, diasServicio) * 0.18;
const calcularTotalConIGVAsignacion = (a, diasServicio) => calcularMontoAsignacion(a, diasServicio) * 1.18;

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
function LiquidacionTransporte({ unidades, asignaciones, empresas, tiposServicio, diasServicio, onRefresh, toast }) {
  const [modalCalendario, setModalCalendario] = useState(null);

  const marcarLiquidado = async (a) => {
    const { error } = await sb.from("asignaciones_unidad").update({ liquidado:true }).eq("id", a.id);
    if (error) { toast("Error: "+error.message, "error"); return; }
    toast("Marcado como liquidado ✓");
    onRefresh();
  };

  const totalPendiente = asignaciones
    .filter(a=>!a.liquidado)
    .reduce((sum,a)=>sum+calcularTotalConIGVAsignacion(a, diasServicio), 0);

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
              const monto = calcularMontoAsignacion(a, diasServicio);
              const igv = calcularIGVAsignacion(a, diasServicio);
              const totalConIGV = calcularTotalConIGVAsignacion(a, diasServicio);
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
          onClose={()=>setModalCalendario(null)} onCambio={onRefresh} toast={toast}/>
      )}
    </div>
  );
}

function ModalCalendarioServicio({ asignacion, diasServicio, unidad, empresa, onClose, onCambio, toast }) {
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
  const subtotal = totalPrestados * (parseFloat(asignacion.tarifa_dia)||0);
  const igv = subtotal * 0.18;
  const totalConIGV = subtotal * 1.18;

  return (
    <div style={{ position:"fixed", inset:0, background:"#0008", zIndex:1000,
      display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ background:B.white, borderRadius:16, padding:28, width:540,
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
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:10, textAlign:"center" }}>
            <div>
              <div style={{ fontSize:18, fontWeight:900, color:B.navy }}>{totalPrestados}</div>
              <div style={{ fontSize:9, color:B.textMut, textTransform:"uppercase" }}>Días</div>
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
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(74px, 1fr))", gap:8 }}>
            {fechas.map(f => {
              const prestado = mapa[f] === true;
              const fechaObj = new Date(f+"T12:00:00");
              return (
                <button key={f} onClick={()=>toggle(f, prestado)}
                  style={{ padding:"10px 4px", borderRadius:8, border:`2px solid ${prestado?B.green:B.border}`,
                    background: prestado?"#ECFDF5":B.bg, cursor:"pointer", textAlign:"center" }}>
                  <div style={{ fontSize:9, color:B.textMut, textTransform:"uppercase" }}>
                    {fechaObj.toLocaleDateString("es-PE",{weekday:"short"})}
                  </div>
                  <div style={{ fontSize:14, fontWeight:800, color: prestado?B.green:B.textMut }}>
                    {fechaObj.getDate()}
                  </div>
                  <div style={{ fontSize:9, color:B.textMut }}>
                    {fechaObj.toLocaleDateString("es-PE",{month:"short"})}
                  </div>
                </button>
              );
            })}
          </div>
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
  const [filtroPago, setFiltroPago] = useState("todas");
  const facturaVacia = () => ({
    empresa_id:"", serie:"E001", numero:"", descripcion:
    "Servicio de transporte y distribución multipunto - Same Day",
    cantidad:1, valor_unit_s:"", fecha_emision: new Date().toISOString().split("T")[0],
    tipo_servicio_id:"", aplica_detraccion:false, porcentaje_detraccion:"",
  });
  const [f, setF] = useState(facturaVacia());

  const abrirNuevaFactura = () => { setF(facturaVacia()); setModal(true); };

  const cargarFacturas = () => {
    sb.from("facturas").select("*,empresas(nombre)").order("created_at",{ascending:false})
      .then(({data})=>{ if(data) setFacturas(data); });
  };
  useEffect(()=>{ cargarFacturas(); },[]);

  const marcarPagado = async (fecha) => {
    const { error } = await sb.from("facturas").update({ estado_pago:"pagado", fecha_pago: fecha }).eq("id", modalPago.id);
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
    const { error } = await sb.from("facturas").insert([{
      ...f, tipo_servicio_id: f.tipo_servicio_id||null,
      igv_s: igv, total_s: total, estado:"emitida", estado_pago:"pendiente",
      porcentaje_detraccion: f.aplica_detraccion ? (parseFloat(f.porcentaje_detraccion)||0) : 0,
      monto_detraccion: montoDetraccion,
      unidad_medida:"ZZ",
    }]);
    if (error) { toast("Error: "+error.message,"error"); return; }
    toast("Factura registrada ✓");
    setModal(false);
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
        <BtnPri onClick={abrirNuevaFactura}>+ Registrar factura</BtnPri>
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
                </td>
                <td style={{ padding:"11px 14px" }}>
                  {fa.estado_pago!=="pagado" && (
                    <button onClick={()=>setModalPago(fa)}
                      style={{ fontSize:11, color:B.green, background:"none", border:"none",
                        cursor:"pointer", fontWeight:700 }}>💰 Marcar pagada</button>
                  )}
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
              <div style={{ fontSize:15, fontWeight:800, color:B.navy }}>Registrar factura</div>
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
              <BtnSec onClick={()=>setModal(false)}>Cancelar</BtnSec>
              <BtnPri onClick={guardar}>Registrar factura</BtnPri>
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

function ModalMarcarPagada({ factura, onClose, onConfirmar }) {
  const [fecha, setFecha] = useState(new Date().toISOString().split("T")[0]);
  return (
    <div style={{ position:"fixed", inset:0, background:"#0008", zIndex:1000,
      display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ background:B.white, borderRadius:16, padding:28, width:400, boxShadow:"0 20px 60px #0003" }}>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:16 }}>
          <div style={{ fontSize:15, fontWeight:800, color:B.navy }}>💰 Marcar factura como pagada</div>
          <button onClick={onClose} style={{ background:"none", border:"none", fontSize:18, color:B.textSec, cursor:"pointer" }}>✕</button>
        </div>
        <div style={{ fontSize:13, color:B.textSec, marginBottom:16 }}>
          {factura.serie}-{factura.numero} — {factura.empresas?.nombre} — <strong style={{color:B.navy}}>{fmt.sol(factura.total_s)}</strong>
        </div>
        <label style={lbl}>Fecha de pago</label>
        <input type="date" style={{ ...inp, marginBottom:20 }} value={fecha} onChange={e=>setFecha(e.target.value)}/>
        <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
          <BtnSec onClick={onClose}>Cancelar</BtnSec>
          <BtnPri onClick={()=>onConfirmar(fecha)}>Confirmar pago</BtnPri>
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
function Catalogo({ empresas, lineasNegocio, tiposServicio, tarifariosCliente, onRefresh, toast }) {
  const [modalLinea, setModalLinea] = useState(false);
  const [modalTipo, setModalTipo] = useState(null);
  const [modalTarifario, setModalTarifario] = useState(null); // guarda la empresa seleccionada
  const TARIFAS = {
    urbano:      { XS:10, S:13, M:16 },
    semi_urbano: { XS:12, S:15, M:18 },
    periferico:  { XS:15, S:18, M:22 },
  };

  return (
    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
      {/* Tarifario genérico Same Day */}
      <div style={{ background:B.white, border:`1px solid ${B.border}`,
        borderRadius:12, padding:20, boxShadow:"0 2px 8px #0D1E3D0A" }}>
        <div style={{ fontSize:14, fontWeight:800, color:B.navy, marginBottom:16,
          paddingBottom:8, borderBottom:`2px solid ${B.gold}` }}>💰 Tarifario Same Day (genérico)</div>
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
            {Object.entries(TARIFAS).map(([ambito,t],i)=>(
              <tr key={ambito} style={{ borderTop:`1px solid ${B.border}`,
                background:i%2===0?B.white:"#F8FAFC" }}>
                <td style={{ padding:"10px 12px", fontSize:12, fontWeight:600,
                  color:B.navy, textTransform:"capitalize" }}>{ambito.replace("_"," ")}</td>
                {Object.values(t).map((v,j)=>(
                  <td key={j} style={{ padding:"10px 12px", fontSize:13,
                    fontWeight:700, color:B.gold }}>S/ {v}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ fontSize:11, color:B.textMut, marginTop:10 }}>
          A partir de 7 kg se suma <strong style={{ color:B.gold }}>S/ 1.00 adicional por cada kg extra</strong> sobre la tarifa M. Este es el tarifario por defecto — cada cliente puede tener el suyo propio negociado (ver más abajo).
        </div>
      </div>

      {/* Tarifarios personalizados por cliente */}
      <div style={{ background:B.white, border:`1px solid ${B.border}`,
        borderRadius:12, padding:20, boxShadow:"0 2px 8px #0D1E3D0A" }}>
        <div style={{ fontSize:14, fontWeight:800, color:B.navy, marginBottom:16,
          paddingBottom:8, borderBottom:`2px solid ${B.gold}` }}>🤝 Tarifarios negociados por cliente</div>
        <div style={{ display:"flex", flexDirection:"column", gap:8, maxHeight:280, overflowY:"auto" }}>
          {empresas.map(e=>{
            const tieneCustom = tarifariosCliente.some(t=>t.empresa_id===e.id);
            return (
              <div key={e.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
                padding:"8px 12px", background:B.bg, borderRadius:8 }}>
                <div style={{ fontSize:12, color:B.textPri }}>
                  {e.codigo_interno && <span style={{ color:B.gold, fontWeight:700, marginRight:6 }}>{e.codigo_interno}</span>}
                  {e.nombre}
                  {tieneCustom && <span style={{ marginLeft:8, fontSize:10, color:B.green, fontWeight:700 }}>✓ personalizado</span>}
                </div>
                <button onClick={()=>setModalTarifario(e)}
                  style={{ fontSize:11, color:B.blue, background:"none", border:"none", cursor:"pointer", fontWeight:600 }}>
                  {tieneCustom ? "Editar" : "Configurar"}
                </button>
              </div>
            );
          })}
          {empresas.length===0 && (
            <div style={{ padding:20, textAlign:"center", color:B.textMut, fontSize:12 }}>Sin clientes registrados</div>
          )}
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
      {modalTarifario && (
        <ModalTarifarioCliente empresa={modalTarifario} tarifariosCliente={tarifariosCliente}
          onClose={()=>setModalTarifario(null)} onSaved={()=>{onRefresh();}} toast={toast}/>
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
  const [diasServicio, setDiasServicio] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [toast, setToast] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const showToast = useCallback((msg, tipo="ok") => setToast({msg,tipo}), []);

  const cargar = useCallback(async (opts={}) => {
    if (!opts.silencioso) setCargando(true);
    try {
      const [p,r,e,l,ln,ts,u,au,tc,ds] = await Promise.all([
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
    { id:"facturacion",  icon:"🧾", label:"Facturación" },
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
              {seccion==="pedidos"       && <Pedidos pedidos={pedidos} repartidores={repartidores} empresas={empresas} tarifariosCliente={tarifariosCliente} onRefresh={cargarSilencioso} toast={showToast}/>}
              {seccion==="repartidores"  && <Repartidores repartidores={repartidores} pedidos={pedidos} onRefresh={cargarSilencioso} toast={showToast}/>}
              {seccion==="unidades"      && <Unidades unidades={unidades} asignaciones={asignacionesUnidad} empresas={empresas} tiposServicio={tiposServicio} repartidores={repartidores} onRefresh={cargarSilencioso} toast={showToast}/>}
              {seccion==="clientes"      && <Clientes empresas={empresas} pedidos={pedidos} lineasNegocio={lineasNegocio} tarifariosCliente={tarifariosCliente} onRefresh={cargarSilencioso} toast={showToast}/>}
              {seccion==="catalogo"      && <Catalogo empresas={empresas} lineasNegocio={lineasNegocio} tiposServicio={tiposServicio} tarifariosCliente={tarifariosCliente} onRefresh={cargarSilencioso} toast={showToast}/>}
              {seccion==="liquidaciones" && <Liquidaciones repartidores={repartidores} pedidos={pedidos} liquidaciones={liquidaciones} onRefresh={cargarSilencioso} toast={showToast}/>}
              {seccion==="liquidacion-transporte" && <LiquidacionTransporte unidades={unidades} asignaciones={asignacionesUnidad} empresas={empresas} tiposServicio={tiposServicio} diasServicio={diasServicio} onRefresh={cargarSilencioso} toast={showToast}/>}
              {seccion==="facturacion"   && <Facturacion empresas={empresas} pedidos={pedidos} tiposServicio={tiposServicio} usuario={usuario} toast={showToast}/>}
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
