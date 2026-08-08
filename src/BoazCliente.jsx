// ══════════════════════════════════════════════════════════════
// BOAZ CLIENTE — Portal de visibilidad para clientes (empresas)
// Login por contacto, ve todos los pedidos históricos de su
// empresa, con estado, historial de evidencias y comunicación.
// Solo lectura.
// ══════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import ExcelJS from "exceljs";

const SUPABASE_URL  = "https://jeftkwjdqzkpswvaqspi.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImplZnRrd2pkcXprcHN3dmFxc3BpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4MzI0OTEsImV4cCI6MjEwMDQwODQ5MX0.Ta8Ei_wCm8ZEzD3IM-S60R0rJvI_d5BTvix_Z3W4EmY";
const sb = createClient(SUPABASE_URL, SUPABASE_ANON);

// ── PALETA ────────────────────────────────────────────────────
const C = {
  navy:"#0D1E3D", navyMd:"#152848", navyLt:"#1E3A5F",
  gold:"#E87722", goldDk:"#C4650A",
  white:"#FFFFFF", bg:"#F0F4F8", border:"#E2E8F0",
  green:"#10B981", red:"#EF4444", orange:"#F97316",
  textPri:"#0D1E3D", textSec:"#4A6080", textMut:"#8FA3BA",
};

const ESTADOS = {
  sin_asignar: { label:"Sin asignar", color:"#3B82F6", bg:"#EFF6FF" },
  asignado:    { label:"Asignado",    color:"#D97706", bg:"#FFFBEB" },
  en_ruta:     { label:"En ruta",     color:"#7C3AED", bg:"#F5F3FF" },
  entregado:   { label:"Entregado",   color:"#059669", bg:"#ECFDF5" },
  no_entregado:{ label:"No entregado",color:"#DC2626", bg:"#FEF2F2" },
};

const ICONOS_HIST = {
  llamada:"📞", whatsapp:"💬", estado:"🔄",
  foto_entrega:"📸", foto_no_entrega:"📸",
};

const fmt = {
  fecha: (d) => {
    if (!d) return "—";
    const str = typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d+"T00:00:00" : d;
    return new Date(str).toLocaleDateString("es-PE",{day:"numeric",month:"short",year:"numeric"});
  },
  hora:  (d) => d ? new Date(d).toLocaleTimeString("es-PE",{hour:"2-digit",minute:"2-digit"}) : "",
  fechaHora: (d) => d ? new Date(d).toLocaleString("es-PE",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}) : "",
};

// ── GEOCODIFICACIÓN GRATUITA (OpenStreetMap / Nominatim) ───────
// Límite de uso: máx. 1 solicitud por segundo.
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

// Fecha del evento más reciente del pedido: último item del historial si existe,
// si no, la fecha específica según el estado actual, y como último recurso el registro.
function obtenerFechaUltimoEstado(p) {
  if (p.historial && p.historial.length) {
    const fechas = p.historial.map(h=>new Date(h.timestamp)).filter(d=>!isNaN(d));
    if (fechas.length) return new Date(Math.max(...fechas));
  }
  if (p.estado==="entregado" && p.fecha_entrega) return new Date(p.fecha_entrega);
  if (p.estado==="en_ruta" && p.fecha_en_ruta) return new Date(p.fecha_en_ruta);
  if (p.estado==="asignado" && p.fecha_asignacion) return new Date(p.fecha_asignacion);
  return new Date(p.created_at);
}

// ── HELPERS: CARGA MASIVA (CSV / EXCEL) ────────────────────────
const COLUMNAS_PLANTILLA = [
  "Numero de Orden", "Destinatario", "Telefono", "Direccion", "Referencia",
  "Distrito", "Peso (kg)", "Tipo de Servicio", "Cobro en Destino (SI/NO)", "Monto a Cobrar",
];

function normalizarTexto(s) {
  return (s||"").toString().trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"");
}

// Mapea encabezados flexibles del archivo del cliente a nuestros campos internos
function mapearFila(fila) {
  const out = {};
  for (const key of Object.keys(fila)) {
    const k = normalizarTexto(key);
    const v = fila[key];
    if (k.includes("orden") || k.includes("referencia cliente") || k.includes("guia")) out.cliente_referencia = (v||"").toString().trim();
    else if (k.includes("destinatario") || k === "nombre") out.dest_nombre = (v||"").toString().trim();
    else if (k.includes("telefono")) out.dest_telefono = (v||"").toString().trim();
    else if (k.includes("direccion")) out.dest_direccion = (v||"").toString().trim();
    else if (k.includes("referencia")) out.dest_referencia = (v||"").toString().trim();
    else if (k.includes("distrito")) out.dest_distrito = (v||"").toString().trim();
    else if (k.includes("peso")) out.peso_kg = parseFloat(v) || null;
    else if (k.includes("servicio")) {
      const t = normalizarTexto(v);
      out.tipo_servicio = t.includes("next") ? "next_day" : t.includes("same") ? "same_day" : "";
    }
    else if (k.includes("cobro")) {
      const t = normalizarTexto(v);
      out.cobro_destino = t==="si" || t==="sí" || t==="true" || t==="1" || t==="x";
    }
    else if (k.includes("monto")) out.monto_cobrar = parseFloat(v) || null;
  }
  return out;
}

const REGEX_ALFANUM = /^[a-zA-Z0-9-]+$/;

function validarFila(fila) {
  const errores = [];
  if (!fila.dest_nombre) errores.push("falta destinatario");
  if (!fila.dest_direccion) errores.push("falta dirección");
  if (!fila.dest_distrito) errores.push("falta distrito");
  if (fila.cliente_referencia) {
    if (fila.cliente_referencia.length > 15) errores.push("N° de orden supera 15 caracteres");
    if (!REGEX_ALFANUM.test(fila.cliente_referencia)) errores.push("N° de orden debe ser alfanumérico");
  }
  return errores;
}

function parseArchivo(file) {
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

function descargarPlantilla() {
  const ejemplo = ["PED-00123","Marco Salinas","987654321","Calle Las Flores 890","Frente al parque","Miraflores","1.2","Same Day","NO",""];
  const ws = XLSX.utils.aoa_to_sheet([COLUMNAS_PLANTILLA, ejemplo]);
  ws["!cols"] = COLUMNAS_PLANTILLA.map(()=>({ wch:20 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Plantilla");
  XLSX.writeFile(wb, "plantilla_pedidos_boaz.xlsx");
}

// ── PANTALLA LOGIN ─────────────────────────────────────────────
function Login({ onLogin }) {
  const [usuario, setUsuario] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  const entrar = async () => {
    if (!usuario.trim() || !pin.trim()) { setError("Ingresa tu usuario y PIN"); return; }
    setCargando(true);
    setError("");
    const { data, error: err } = await sb.rpc("verificar_login_cliente", {
      p_usuario: usuario.trim(), p_pin: pin.trim(),
    });
    if (err || !data || data.length===0) { setError("Usuario o PIN incorrecto"); setCargando(false); return; }
    const contacto = data[0];

    const { data: empresa } = await sb.from("empresas")
      .select("id,nombre,ruc,contacto,telefono,email,codigo_interno,puede_generar_etiquetas")
      .eq("id", contacto.empresa_id)
      .maybeSingle();

    setCargando(false);
    onLogin({ ...contacto, empresa });
  };

  return (
    <div style={{ minHeight:"100vh", background:C.navy,
      display:"flex", flexDirection:"column", alignItems:"center",
      justifyContent:"center", padding:24, fontFamily:"'Segoe UI',sans-serif" }}>

      <div style={{ marginBottom:40, textAlign:"center" }}>
        <div style={{ fontSize:48, fontWeight:900, letterSpacing:"3px", marginBottom:4 }}>
          <span style={{ color:"#E8EAF0" }}>BOA</span>
          <span style={{ color:C.gold }}>Z</span>
        </div>
        <div style={{ fontSize:13, color:C.textMut, fontStyle:"italic" }}>
          Con Boaz, tu negocio no para.
        </div>
        <div style={{ marginTop:12, fontSize:12, color:"#1E3A5F",
          background:"#152848", padding:"4px 14px", borderRadius:20, display:"inline-block" }}>
          Portal Cliente
        </div>
      </div>

      <div style={{ background:C.navyMd, borderRadius:20, padding:28,
        width:"100%", maxWidth:340, border:"1px solid #1E3560",
        boxShadow:"0 20px 60px #00000060" }}>
        <div style={{ fontSize:15, fontWeight:700, color:"#E8EAF0",
          marginBottom:20, textAlign:"center" }}>Iniciar sesión</div>

        <div style={{ marginBottom:14 }}>
          <label style={{ fontSize:11, color:C.textMut, textTransform:"uppercase",
            letterSpacing:"0.7px", marginBottom:6, display:"block" }}>Usuario</label>
          <input type="text" placeholder="Tu usuario" autoCapitalize="none" autoCorrect="off"
            value={usuario} onChange={e=>setUsuario(e.target.value)}
            style={{ width:"100%", background:"#0D1E3D", border:"1px solid #1E3560",
              color:"#E8EAF0", borderRadius:10, padding:"12px 14px",
              fontSize:14, outline:"none", boxSizing:"border-box" }}/>
        </div>

        <div style={{ marginBottom:20 }}>
          <label style={{ fontSize:11, color:C.textMut, textTransform:"uppercase",
            letterSpacing:"0.7px", marginBottom:6, display:"block" }}>PIN de acceso</label>
          <input type="password" maxLength={6} placeholder="••••"
            value={pin} onChange={e=>setPin(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&entrar()}
            style={{ width:"100%", background:"#0D1E3D", border:"1px solid #1E3560",
              color:"#E8EAF0", borderRadius:10, padding:"12px 14px",
              fontSize:20, outline:"none", textAlign:"center",
              letterSpacing:"8px", boxSizing:"border-box" }}/>
        </div>

        {error && (
          <div style={{ background:"#2D0707", border:"1px solid #EF444444",
            borderRadius:8, padding:"10px 14px", color:"#FCA5A5",
            fontSize:12, marginBottom:14, textAlign:"center" }}>{error}</div>
        )}

        <button onClick={entrar} disabled={cargando}
          style={{ width:"100%", background:`linear-gradient(135deg,${C.gold},${C.goldDk})`,
            border:"none", color:C.navy, padding:14, borderRadius:12,
            fontSize:15, fontWeight:800, cursor: cargando?"default":"pointer", letterSpacing:"0.5px" }}>
          {cargando ? "Ingresando..." : "Entrar →"}
        </button>

        <div style={{ textAlign:"center", marginTop:16, fontSize:11, color:"#2A3F60" }}>
          ¿Problemas de acceso? Llama a Boaz: +51 960 622 471
        </div>
      </div>
    </div>
  );
}

// ── LISTA DE PEDIDOS: DASHBOARD DE CONSULTA ────────────────────
const TIPOS_SERVICIO = {
  same_day: { label:"Same Day", color:"#7C3AED", bg:"#F5F3FF" },
  next_day: { label:"Next Day", color:"#0369A1", bg:"#EFF6FF" },
};

// ── HELPERS: REPORTES E INDICADORES ────────────────────────────
function rangoPeriodo(periodo, fechaInicio, fechaFin) {
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  if (periodo==="hoy") {
    const fin = new Date(); return [hoy, fin];
  }
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
      <text x={c} y={c-4} textAnchor="middle" fontSize="22" fontWeight="900" fill={C.navy}>{total}</text>
      <text x={c} y={c+16} textAnchor="middle" fontSize="10" fill={C.textMut}>pedidos</text>
    </svg>
  );
}

function KPICard({ icon, label, value, sub, color }) {
  return (
    <div style={{ background:C.white, borderRadius:14, padding:18, border:`1px solid ${C.border}`,
      boxShadow:"0 2px 8px #0D1E3D0A", borderTop:`3px solid ${color}` }}>
      <div style={{ fontSize:22, marginBottom:6 }}>{icon}</div>
      <div style={{ fontSize:26, fontWeight:900, color:C.navy }}>{value}</div>
      <div style={{ fontSize:11, color:C.textMut, textTransform:"uppercase", fontWeight:700, marginTop:2 }}>{label}</div>
      {sub && <div style={{ fontSize:11, color:color, fontWeight:700, marginTop:6 }}>{sub}</div>}
    </div>
  );
}

function BarraHorizontal({ label, valor, max, color }) {
  const pct = max>0 ? Math.max(4, (valor/max*100)) : 0;
  return (
    <div style={{ marginBottom:10 }}>
      <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, marginBottom:4 }}>
        <span style={{ color:C.textSec, fontWeight:600 }}>{label}</span>
        <span style={{ color:C.navy, fontWeight:800 }}>{valor}</span>
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
          <div style={{ fontSize:10, color:C.textMut, marginBottom:4, fontWeight:700 }}>{d.total}</div>
          <div style={{ width:20, height: Math.max(4, d.total/max*100), borderRadius:"5px 5px 0 0",
            background:"#DCE3ED", position:"relative", overflow:"hidden" }}>
            <div style={{ position:"absolute", bottom:0, left:0, width:"100%",
              height: d.total ? `${(d.entregados/d.total*100)}%` : "0%", background:C.green }}/>
          </div>
          <div style={{ fontSize:9, color:C.textMut, marginTop:6, whiteSpace:"nowrap",
            position:"absolute", top:"100%", transform:"rotate(-35deg)", transformOrigin:"top left" }}>{d.label}</div>
        </div>
      ))}
    </div>
  );
}

function Reportes({ pedidos, contacto }) {
  const [periodo, setPeriodo] = useState("hoy");
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
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
    const d = new Date(p.created_at);
    const key = d.toISOString().slice(0,10);
    if (!porDia[key]) porDia[key] = { total:0, entregados:0 };
    porDia[key].total++;
    if (p.estado==="entregado") porDia[key].entregados++;
  });
  const serieDiaria = Object.entries(porDia).sort((a,b)=>a[0].localeCompare(b[0])).map(([key,v])=>({
    label: new Date(key+"T12:00:00").toLocaleDateString("es-PE",{day:"2-digit",month:"2-digit"}),
    total:v.total, entregados:v.entregados,
  }));

  // ── Reporte de Liquidación Documentaria (descargo de guías) ──
  const incluidosLiquidacion = filtrados.filter(p=>p.estado==="entregado"||p.estado==="no_entregado");

  const descargarLiquidacionDocumentaria = async () => {
    if (incluidosLiquidacion.length===0) return;
    setGenerando(true);
    try {
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

      // Encabezado de marca
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
      const nombreEmpresa = contacto?.empresa?.nombre || "—";
      const destinosUnicos = new Set(incluidosLiquidacion.map(p=>p.dest_nombre)).size;
      const tipoServicioTxt = tiposPresentes.join(" / ") || "—";

      setCell("B8","N° Liquidación:",{bold:true,color:NAVY}); setCell("C8",numLiquidacion);
      setCell("E8","Periodo:",{bold:true,color:NAVY}); setCell("F8",rangoTxt);
      setCell("B9","Cliente:",{bold:true,color:NAVY}); setCell("C9",nombreEmpresa);
      setCell("E9","Fecha de generación:",{bold:true,color:NAVY}); setCell("F9",new Date().toLocaleDateString("es-PE"));
      setCell("B10","Destinatarios:",{bold:true,color:NAVY});
      setCell("C10",`${destinosUnicos} destinatario(s) — ${incluidosLiquidacion.length} punto(s) de entrega`);
      setCell("E10","Tipo de servicio:",{bold:true,color:NAVY}); setCell("F10",tipoServicioTxt);

      // Tabla de guías
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
      setCell(`B${r}`,"Total entregados",{bold:true,color:NAVY}); setCell(`D${r}`,entregados.length); r++;
      setCell(`B${r}`,"Total no entregados",{bold:true,color:NAVY}); setCell(`D${r}`,noEntregados.length); r+=2;

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
    <div style={{ padding:"20px 24px" }}>
      {/* Selector de periodo */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start",
        gap:12, marginBottom:6, flexWrap:"wrap" }}>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          {PRESETS.map(p=>(
            <button key={p.id} onClick={()=>setPeriodo(p.id)}
              style={{ padding:"8px 16px", borderRadius:20, fontSize:12, fontWeight:700, cursor:"pointer",
                border: periodo===p.id ? `2px solid ${C.gold}` : `1px solid ${C.border}`,
                background: periodo===p.id ? "#FFF8EF" : C.white,
                color: periodo===p.id ? C.goldDk : C.textSec }}>
              {p.label}
            </button>
          ))}
        </div>
        <button onClick={descargarLiquidacionDocumentaria}
          disabled={incluidosLiquidacion.length===0 || generando}
          title={incluidosLiquidacion.length===0 ? "No hay pedidos entregados o no entregados en este periodo" : ""}
          style={{ background: incluidosLiquidacion.length>0 ? C.navy : "#CBD5E1", color:"#E8EAF0", border:"none",
            padding:"10px 18px", borderRadius:10, fontSize:12, fontWeight:800,
            cursor: incluidosLiquidacion.length>0 && !generando ? "pointer" : "default",
            whiteSpace:"nowrap" }}>
          {generando ? "Generando..." : "📄 Descargar Liquidación Documentaria"}
        </button>
      </div>
      {periodo==="personalizado" && (
        <div style={{ display:"flex", gap:10, marginBottom:16, marginTop:10 }}>
          <input type="date" value={fechaInicio} onChange={e=>setFechaInicio(e.target.value)}
            style={{ border:`1px solid ${C.border}`, borderRadius:8, padding:"8px 10px", fontSize:13 }}/>
          <span style={{ alignSelf:"center", color:C.textMut, fontSize:12 }}>hasta</span>
          <input type="date" value={fechaFin} onChange={e=>setFechaFin(e.target.value)}
            style={{ border:`1px solid ${C.border}`, borderRadius:8, padding:"8px 10px", fontSize:13 }}/>
        </div>
      )}
      <div style={{ fontSize:12, color:C.textMut, margin:"12px 0 18px" }}>
        Mostrando {filtrados.length} pedido{filtrados.length===1?"":"s"} registrado{filtrados.length===1?"":"s"} entre{" "}
        {inicio.toLocaleDateString("es-PE",{day:"numeric",month:"short"})} y {fin.toLocaleDateString("es-PE",{day:"numeric",month:"short"})}
        {" · "}la liquidación documentaria incluye {incluidosLiquidacion.length} pedido{incluidosLiquidacion.length===1?"":"s"} finalizado{incluidosLiquidacion.length===1?"":"s"} (entregados o no entregados)
      </div>

      {filtrados.length===0 ? (
        <div style={{ background:C.white, borderRadius:14, padding:40, textAlign:"center",
          color:C.textMut, border:`1px solid ${C.border}` }}>
          📊 No hay pedidos registrados en este periodo
        </div>
      ) : (
      <>
        {/* KPIs principales */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(5, 1fr)", gap:12, marginBottom:20 }}>
          <KPICard icon="📦" label="Total pedidos" value={filtrados.length} color={C.navy}/>
          <KPICard icon="✅" label="Entregados" value={entregados.length} color={C.green}
            sub={finalizados>0 ? `${efectividad}% efectividad` : null}/>
          <KPICard icon="⚠️" label="No entregados" value={noEntregados.length} color={C.red}/>
          <KPICard icon="🛵" label="En ruta" value={enRuta.length} color="#7C3AED"/>
          <KPICard icon="⏳" label="Por asignar / asignados" value={sinAsignar.length+asignados.length} color={C.gold}/>
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16 }}>
          {/* Estado de pedidos: donut */}
          <div style={{ background:C.white, borderRadius:14, padding:20, border:`1px solid ${C.border}` }}>
            <div style={{ fontSize:12, fontWeight:800, color:C.navy, textTransform:"uppercase", marginBottom:16 }}>
              Distribución por estado
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:20 }}>
              <DonutChart segments={[
                { value:entregados.length, color:C.green, label:"Entregados" },
                { value:noEntregados.length, color:C.red, label:"No entregados" },
                { value:enRuta.length, color:"#7C3AED", label:"En ruta" },
                { value:asignados.length, color:"#D97706", label:"Asignados" },
                { value:sinAsignar.length, color:"#3B82F6", label:"Sin asignar" },
              ]}/>
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {[
                  ["Entregados",entregados.length,C.green],
                  ["No entregados",noEntregados.length,C.red],
                  ["En ruta",enRuta.length,"#7C3AED"],
                  ["Asignados",asignados.length,"#D97706"],
                  ["Sin asignar",sinAsignar.length,"#3B82F6"],
                ].map(([label,val,color])=>(
                  <div key={label} style={{ display:"flex", alignItems:"center", gap:8, fontSize:12 }}>
                    <span style={{ width:10, height:10, borderRadius:3, background:color, display:"inline-block" }}/>
                    <span style={{ color:C.textSec }}>{label}</span>
                    <span style={{ fontWeight:800, color:C.navy, marginLeft:"auto" }}>{val}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Cobros COD */}
          <div style={{ background:C.white, borderRadius:14, padding:20, border:`1px solid ${C.border}` }}>
            <div style={{ fontSize:12, fontWeight:800, color:C.navy, textTransform:"uppercase", marginBottom:16 }}>
              Cobros en destino (COD)
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
              <div>
                <div style={{ fontSize:11, color:C.textMut, textTransform:"uppercase" }}>Pedidos COD</div>
                <div style={{ fontSize:24, fontWeight:900, color:C.navy }}>{codPedidos.length}</div>
              </div>
              <div>
                <div style={{ fontSize:11, color:C.textMut, textTransform:"uppercase" }}>Cobrado</div>
                <div style={{ fontSize:24, fontWeight:900, color:C.green }}>S/ {codCobrado.toFixed(2)}</div>
              </div>
              <div style={{ gridColumn:"1 / -1" }}>
                <div style={{ fontSize:11, color:C.textMut, textTransform:"uppercase" }}>Pendiente por cobrar</div>
                <div style={{ fontSize:24, fontWeight:900, color:"#C2410C" }}>S/ {codPendiente.toFixed(2)}</div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16 }}>
          {/* Top distritos */}
          <div style={{ background:C.white, borderRadius:14, padding:20, border:`1px solid ${C.border}` }}>
            <div style={{ fontSize:12, fontWeight:800, color:C.navy, textTransform:"uppercase", marginBottom:16 }}>
              Top distritos
            </div>
            {topDistritos.map(([distrito,val])=>(
              <BarraHorizontal key={distrito} label={distrito} valor={val} max={maxDistrito} color={C.gold}/>
            ))}
          </div>

          {/* Tipo de servicio */}
          <div style={{ background:C.white, borderRadius:14, padding:20, border:`1px solid ${C.border}` }}>
            <div style={{ fontSize:12, fontWeight:800, color:C.navy, textTransform:"uppercase", marginBottom:16 }}>
              Tipo de servicio
            </div>
            <BarraHorizontal label="Same Day" valor={porServicio.same_day} max={filtrados.length} color="#7C3AED"/>
            <BarraHorizontal label="Next Day" valor={porServicio.next_day} max={filtrados.length} color="#0369A1"/>
            <BarraHorizontal label="Sin definir" valor={porServicio.sin_definir} max={filtrados.length} color={C.textMut}/>
          </div>
        </div>

        {/* Tendencia diaria */}
        {serieDiaria.length > 1 && (
          <div style={{ background:C.white, borderRadius:14, padding:20, border:`1px solid ${C.border}` }}>
            <div style={{ fontSize:12, fontWeight:800, color:C.navy, textTransform:"uppercase", marginBottom:8 }}>
              Tendencia diaria
            </div>
            <div style={{ fontSize:11, color:C.textMut, marginBottom:10 }}>
              <span style={{ color:C.green, fontWeight:700 }}>■</span> Entregados · Barra completa = total de pedidos del día
            </div>
            <SerieDiaria datos={serieDiaria}/>
          </div>
        )}
      </>
      )}
    </div>
  );
}

// ── ETIQUETAS CON CÓDIGO DE BARRAS (cliente) ───────────────────
function escapeHtmlEtiquetaCliente(str) {
  return (str||"").toString()
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function generarHtmlEtiquetasCliente(pedidosSel, empresa) {
  const filas = pedidosSel.map(p => {
    const tipoServicio = p.tipo_servicio==="same_day" ? "Same Day"
      : p.tipo_servicio==="next_day" ? "Next Day" : "—";
    const cod = p.cobro_destino ? `COD — S/ ${p.monto_cobrar||""}` : "Pagado";
    const codigo = escapeHtmlEtiquetaCliente(p.omd);
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
          <strong>MÉTODO DE ENVÍO:</strong> ${escapeHtmlEtiquetaCliente(tipoServicio)} &nbsp;|&nbsp;
          <strong>MODALIDAD:</strong> ${escapeHtmlEtiquetaCliente(cod)}
        </div>
        <div class="titulo-negro">
          <div style="flex:1;">REMITENTE:</div>
          <div style="flex:1;">DESTINATARIO:</div>
        </div>
        <div style="display:flex;">
          <div class="col">
            <div><strong>Empresa:</strong> ${escapeHtmlEtiquetaCliente(empresa?.nombre||"—")}</div>
            <div><strong>N° de orden:</strong> ${escapeHtmlEtiquetaCliente(p.cliente_referencia||"—")}</div>
            <div><strong>Departamento:</strong> Lima</div>
            <div><strong>Provincia:</strong> Lima</div>
            <div><strong>Fecha de ingreso:</strong> ${fmt.fecha(p.created_at)}</div>
          </div>
          <div class="col">
            <div><strong>Cliente:</strong> ${escapeHtmlEtiquetaCliente(p.dest_nombre)}</div>
            <div><strong>Dirección:</strong> ${escapeHtmlEtiquetaCliente(p.dest_direccion)}</div>
            ${p.dest_referencia ? `<div><strong>Referencia:</strong> ${escapeHtmlEtiquetaCliente(p.dest_referencia)}</div>` : ""}
            <div><strong>Departamento:</strong> Lima</div>
            <div><strong>Provincia:</strong> Lima</div>
            <div><strong>Distrito:</strong> ${escapeHtmlEtiquetaCliente(p.dest_distrito)}</div>
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

function ModalEtiquetasCliente({ pedidos, empresa, onClose }) {
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
    const html = generarHtmlEtiquetasCliente(elegidos, empresa);
    const ventana = window.open("", "_blank");
    if (!ventana) return;
    ventana.document.write(html);
    ventana.document.close();
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"#0008", zIndex:1000,
      display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ background:C.white, borderRadius:16, padding:28, width:560,
        maxHeight:"85vh", overflowY:"auto", boxShadow:"0 20px 60px #0003" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
          <div style={{ fontSize:16, fontWeight:800, color:C.navy }}>🏷️ Generar etiquetas con código de barras</div>
          <button onClick={onClose} style={{ background:"none", border:"none", fontSize:20,
            color:C.textSec, cursor:"pointer" }}>✕</button>
        </div>

        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
          <button onClick={toggleTodos}
            style={{ fontSize:12, color:"#3B82F6", background:"none", border:"none", cursor:"pointer", fontWeight:600 }}>
            {seleccionados.size===pedidos.length ? "Deseleccionar todos" : "Seleccionar todos"}
          </button>
          <span style={{ fontSize:12, color:C.textMut }}>{seleccionados.size} seleccionado{seleccionados.size===1?"":"s"}</span>
        </div>

        <div style={{ border:`1px solid ${C.border}`, borderRadius:10, overflow:"hidden", marginBottom:20 }}>
          {pedidos.length===0 && (
            <div style={{ padding:24, textAlign:"center", color:C.textMut, fontSize:13 }}>
              No hay pedidos en la vista actual
            </div>
          )}
          {pedidos.map((p,i)=>(
            <label key={p.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 14px",
              borderTop: i>0 ? `1px solid ${C.border}` : "none", cursor:"pointer",
              background: seleccionados.has(p.id) ? "#FFF7ED" : C.white }}>
              <input type="checkbox" checked={seleccionados.has(p.id)} onChange={()=>toggle(p.id)}
                style={{ width:16, height:16 }}/>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:12, fontWeight:700, color:C.navy }}>{p.omd} · {p.dest_nombre}</div>
                <div style={{ fontSize:11, color:C.textMut }}>{p.dest_distrito}</div>
              </div>
            </label>
          ))}
        </div>

        <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
          <button onClick={onClose}
            style={{ background:C.white, border:`1px solid ${C.border}`, color:C.textSec,
              padding:"9px 18px", borderRadius:8, fontSize:13, cursor:"pointer" }}>Cancelar</button>
          <button onClick={imprimir} disabled={seleccionados.size===0}
            style={{ background: seleccionados.size>0 ? `linear-gradient(135deg,${C.gold},${C.goldDk})` : "#CBD5E1",
              border:"none", color:C.navy, padding:"9px 20px", borderRadius:8,
              fontSize:13, fontWeight:800, cursor: seleccionados.size>0 ? "pointer" : "default" }}>
            🖨️ Generar e imprimir ({seleccionados.size})
          </button>
        </div>
      </div>
    </div>
  );
}

function Dashboard({ pedidos, onVerPedido }) {
  const [busqueda, setBusqueda] = useState("");
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [tipoServicio, setTipoServicio] = useState("");
  const [estado, setEstado] = useState("");

  const filtrados = pedidos.filter(p => {
    if (busqueda.trim()) {
      const q = busqueda.trim().toLowerCase();
      const match = (p.omd||"").toLowerCase().includes(q)
        || (p.dest_nombre||"").toLowerCase().includes(q)
        || (p.dest_telefono||"").toLowerCase().includes(q)
        || (p.dest_distrito||"").toLowerCase().includes(q)
        || (p.cliente_referencia||"").toLowerCase().includes(q);
      if (!match) return false;
    }
    if (fechaInicio) {
      const f = new Date(p.created_at);
      if (f < new Date(fechaInicio+"T00:00:00")) return false;
    }
    if (fechaFin) {
      const f = new Date(p.created_at);
      if (f > new Date(fechaFin+"T23:59:59")) return false;
    }
    if (tipoServicio && p.tipo_servicio !== tipoServicio) return false;
    if (estado && p.estado !== estado) return false;
    return true;
  });

  const limpiarFiltros = () => {
    setBusqueda(""); setFechaInicio(""); setFechaFin(""); setTipoServicio(""); setEstado("");
  };

  const descargarCSV = () => {
    const headers = ["Tracking Boaz","Estado","Tipo Servicio","Destinatario","Telefono","Direccion","Distrito","Fecha de Registro","Fecha Ultimo Estado"];
    const rows = filtrados.map(p => [
      p.omd, ESTADOS[p.estado]?.label||p.estado, TIPOS_SERVICIO[p.tipo_servicio]?.label||"",
      p.dest_nombre, p.dest_telefono, p.dest_direccion, p.dest_distrito,
      fmt.fechaHora(p.created_at), fmt.fechaHora(obtenerFechaUltimoEstado(p)),
    ]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws["!cols"] = headers.map(()=>({ wch:20 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pedidos");
    XLSX.writeFile(wb, `pedidos_boaz_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  return (
    <div style={{ padding:"20px 24px" }}>
      {/* Barra de búsqueda */}
      <div style={{ display:"flex", gap:10, marginBottom:14 }}>
        <input
          placeholder="Buscar por Tracking Boaz, destinatario, teléfono o distrito..."
          value={busqueda} onChange={e=>setBusqueda(e.target.value)}
          style={{ flex:1, border:`1px solid ${C.border}`, borderRadius:10,
            padding:"12px 16px", fontSize:14, color:C.textPri, outline:"none",
            boxSizing:"border-box", background:C.white }}/>
        <button
          style={{ background:`linear-gradient(135deg,${C.gold},${C.goldDk})`, border:"none",
            color:C.navy, padding:"0 22px", borderRadius:10, fontSize:13, fontWeight:800,
            cursor:"pointer", display:"flex", alignItems:"center", gap:6 }}>
          🔍 Buscar
        </button>
        <button onClick={limpiarFiltros}
          style={{ background:C.white, border:`1px solid ${C.border}`, color:C.textSec,
            padding:"0 18px", borderRadius:10, fontSize:13, fontWeight:700, cursor:"pointer" }}>
          Limpiar
        </button>
        <button onClick={descargarCSV}
          style={{ background:C.navy, border:"none", color:"#E8EAF0",
            padding:"0 18px", borderRadius:10, fontSize:13, fontWeight:700, cursor:"pointer",
            display:"flex", alignItems:"center", gap:6, whiteSpace:"nowrap" }}>
          ⬇️ Descargar Excel
        </button>
      </div>

      {/* Filtros */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:10, marginBottom:20 }}>
        <div>
          <label style={{ fontSize:11, color:C.textMut, textTransform:"uppercase",
            fontWeight:700, marginBottom:4, display:"block" }}>Fecha inicio</label>
          <input type="date" value={fechaInicio} onChange={e=>setFechaInicio(e.target.value)}
            style={{ width:"100%", border:`1px solid ${C.border}`, borderRadius:8,
              padding:"9px 10px", fontSize:13, color:C.textPri, boxSizing:"border-box" }}/>
        </div>
        <div>
          <label style={{ fontSize:11, color:C.textMut, textTransform:"uppercase",
            fontWeight:700, marginBottom:4, display:"block" }}>Fecha fin</label>
          <input type="date" value={fechaFin} onChange={e=>setFechaFin(e.target.value)}
            style={{ width:"100%", border:`1px solid ${C.border}`, borderRadius:8,
              padding:"9px 10px", fontSize:13, color:C.textPri, boxSizing:"border-box" }}/>
        </div>
        <div>
          <label style={{ fontSize:11, color:C.textMut, textTransform:"uppercase",
            fontWeight:700, marginBottom:4, display:"block" }}>Tipo de servicio</label>
          <select value={tipoServicio} onChange={e=>setTipoServicio(e.target.value)}
            style={{ width:"100%", border:`1px solid ${C.border}`, borderRadius:8,
              padding:"9px 10px", fontSize:13, color:C.textPri, boxSizing:"border-box" }}>
            <option value="">Todos</option>
            <option value="same_day">Same Day</option>
            <option value="next_day">Next Day</option>
          </select>
        </div>
        <div>
          <label style={{ fontSize:11, color:C.textMut, textTransform:"uppercase",
            fontWeight:700, marginBottom:4, display:"block" }}>Estado</label>
          <select value={estado} onChange={e=>setEstado(e.target.value)}
            style={{ width:"100%", border:`1px solid ${C.border}`, borderRadius:8,
              padding:"9px 10px", fontSize:13, color:C.textPri, boxSizing:"border-box" }}>
            <option value="">Todos</option>
            {Object.entries(ESTADOS).map(([k,v])=>(
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ fontSize:12, color:C.textMut, marginBottom:10 }}>
        {filtrados.length} pedido{filtrados.length===1?"":"s"} encontrado{filtrados.length===1?"":"s"}
      </div>

      {/* Tabla */}
      <div style={{ background:C.white, borderRadius:12, border:`1px solid ${C.border}`,
        overflow:"hidden", boxShadow:"0 2px 8px #0D1E3D0A" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
          <thead>
            <tr style={{ background:C.bg, textAlign:"left" }}>
              {["Tracking Boaz","Estado","Tipo servicio","Destinatario","Distrito","Fecha",""].map(h=>(
                <th key={h} style={{ padding:"12px 14px", fontSize:11, fontWeight:700,
                  color:C.textSec, textTransform:"uppercase", letterSpacing:"0.4px",
                  borderBottom:`1px solid ${C.border}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtrados.length===0 ? (
              <tr>
                <td colSpan={7} style={{ padding:40, textAlign:"center", color:C.textMut }}>
                  📦 No se encontraron pedidos con estos filtros
                </td>
              </tr>
            ) : filtrados.map(p=>(
              <tr key={p.id} style={{ borderBottom:`1px solid #F1F5F9` }}>
                <td style={{ padding:"12px 14px", fontWeight:800, color:C.navy }}>{p.omd}</td>
                <td style={{ padding:"12px 14px" }}>
                  <span style={{ fontSize:11, padding:"3px 10px", borderRadius:20, fontWeight:700,
                    background:ESTADOS[p.estado]?.bg, color:ESTADOS[p.estado]?.color,
                    border:`1px solid ${ESTADOS[p.estado]?.color}33` }}>
                    {ESTADOS[p.estado]?.label || p.estado}
                  </span>
                </td>
                <td style={{ padding:"12px 14px" }}>
                  {p.tipo_servicio ? (
                    <span style={{ fontSize:11, padding:"3px 10px", borderRadius:20, fontWeight:700,
                      background:TIPOS_SERVICIO[p.tipo_servicio]?.bg,
                      color:TIPOS_SERVICIO[p.tipo_servicio]?.color }}>
                      {TIPOS_SERVICIO[p.tipo_servicio]?.label || p.tipo_servicio}
                    </span>
                  ) : <span style={{ color:C.textMut }}>—</span>}
                </td>
                <td style={{ padding:"12px 14px", color:C.textPri }}>{p.dest_nombre}</td>
                <td style={{ padding:"12px 14px", color:C.textSec }}>{p.dest_distrito}</td>
                <td style={{ padding:"12px 14px", color:C.textSec }}>{fmt.fecha(p.created_at)}</td>
                <td style={{ padding:"12px 14px", textAlign:"center" }}>
                  <button onClick={()=>onVerPedido(p)} title="Ver detalle"
                    style={{ background:"none", border:"none", cursor:"pointer",
                      fontSize:18, color:C.navy, padding:4 }}>
                    👁️
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── CARGA MASIVA DE PEDIDOS (CSV / EXCEL) ──────────────────────
function CargaMasiva({ empresaId, empresa, onCargaCompleta }) {
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
      const json = await parseArchivo(file);
      const procesadas = json.map(fila => {
        const mapeada = mapearFila(fila);
        return { ...mapeada, errores: validarFila(mapeada) };
      });
      setFilas(procesadas);
    } catch (err) {
      setErrorArchivo("No se pudo leer el archivo. Verifica que sea un .csv o .xlsx válido.");
      setFilas([]);
    }
    e.target.value = "";
  };

  const confirmarCarga = async () => {
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
          const { error: errInsert } = await sb.from("pedidos").insert({
            omd: codigo,
            empresa_id: empresaId,
            cliente_referencia: fila.cliente_referencia || null,
            dest_nombre: fila.dest_nombre,
            dest_telefono: fila.dest_telefono || null,
            dest_direccion: fila.dest_direccion,
            dest_referencia: fila.dest_referencia || null,
            dest_distrito: fila.dest_distrito,
            peso_kg: fila.peso_kg || null,
            tipo_servicio: fila.tipo_servicio || null,
            cobro_destino: !!fila.cobro_destino,
            monto_cobrar: fila.cobro_destino ? (fila.monto_cobrar || null) : null,
            estado: "sin_asignar",
            dest_lat: coords?.lat||null, dest_lng: coords?.lng||null,
          });
          if (errInsert) generados.push({ ...fila, ok:false, error:errInsert.message });
          else generados.push({ ...fila, ok:true, codigo, ubicado: !!coords });
          await esperar(1100);
        } catch (filaErr) {
          generados.push({ ...fila, ok:false, error: filaErr.message || "error inesperado en esta fila" });
        }
      }
    } catch (err) {
      // seguimos igual hacia el resumen para que se vea el detalle disponible
    }
    setProgreso("");
    setProcesando(false);
    setResultado(generados);
    setFilas([]);
    onCargaCompleta();
  };

  const descargarResultado = () => {
    if (!resultado) return;
    const headers = ["N Orden Cliente","Tracking Boaz","Destinatario","Estado"];
    const rows = resultado.map(r => [r.cliente_referencia||"", r.ok?r.codigo:"—", r.dest_nombre, r.ok?"Creado":("Error: "+r.error)]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws["!cols"] = headers.map(()=>({ wch:20 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Codigos");
    XLSX.writeFile(wb, `codigos_boaz_generados_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  return (
    <div style={{ padding:"20px 24px" }}>
      <div style={{ background:C.white, borderRadius:14, padding:20, border:`1px solid ${C.border}`, marginBottom:16 }}>
        <div style={{ fontSize:14, fontWeight:800, color:C.navy, marginBottom:6 }}>
          Cargar pedidos desde CSV o Excel
        </div>
        <div style={{ fontSize:12, color:C.textSec, marginBottom:14 }}>
          Descarga la plantilla, complétala con tus pedidos y súbela aquí. A cada fila válida se le asignará automáticamente un código de seguimiento Boaz.
        </div>
        <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
          <button onClick={descargarPlantilla}
            style={{ background:C.white, border:`1px solid ${C.border}`, color:C.textSec,
              padding:"10px 16px", borderRadius:10, fontSize:13, fontWeight:700, cursor:"pointer" }}>
            📥 Descargar plantilla
          </button>
          <label style={{ background:`linear-gradient(135deg,${C.gold},${C.goldDk})`, color:C.navy,
            padding:"10px 16px", borderRadius:10, fontSize:13, fontWeight:800, cursor:"pointer",
            display:"inline-flex", alignItems:"center", gap:6 }}>
            📤 Seleccionar archivo (.csv, .xlsx)
            <input type="file" accept=".csv,.xlsx,.xls" onChange={onSeleccionarArchivo} style={{ display:"none" }}/>
          </label>
          {nombreArchivo && <div style={{ fontSize:12, color:C.textMut, alignSelf:"center" }}>{nombreArchivo}</div>}
        </div>
        {errorArchivo && (
          <div style={{ marginTop:12, background:"#FEF2F2", border:"1px solid #FECACA", borderRadius:8,
            padding:"10px 14px", color:C.red, fontSize:12 }}>{errorArchivo}</div>
        )}
      </div>

      {filas.length > 0 && (
        <div style={{ background:C.white, borderRadius:14, border:`1px solid ${C.border}`, overflow:"hidden", marginBottom:16 }}>
          <div style={{ padding:"14px 20px", borderBottom:`1px solid ${C.border}`,
            display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <div style={{ fontSize:13, fontWeight:700, color:C.navy }}>
              Vista previa — {validas.length} válida{validas.length===1?"":"s"}, {invalidas.length} con error{invalidas.length===1?"":"es"}
            </div>
            <button onClick={confirmarCarga} disabled={validas.length===0 || procesando}
              style={{ background: validas.length>0 ? C.green : "#CBD5E1", color:C.white, border:"none",
                padding:"10px 18px", borderRadius:10, fontSize:13, fontWeight:800,
                cursor: validas.length>0 && !procesando ? "pointer" : "default" }}>
              {procesando ? (progreso||"Generando códigos...") : `✅ Confirmar y cargar ${validas.length} pedido${validas.length===1?"":"s"}`}
            </button>
          </div>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
            <thead>
              <tr style={{ background:C.bg, textAlign:"left" }}>
                {["N° Orden","Destinatario","Dirección","Referencia","Distrito","Servicio","Estado"].map(h=>(
                  <th key={h} style={{ padding:"10px 12px", fontSize:10, fontWeight:700, color:C.textSec,
                    textTransform:"uppercase", borderBottom:`1px solid ${C.border}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map((f,i)=>(
                <tr key={i} style={{ borderBottom:"1px solid #F1F5F9",
                  background: f.errores.length>0 ? "#FEF2F2" : "transparent" }}>
                  <td style={{ padding:"10px 12px" }}>{f.cliente_referencia||"—"}</td>
                  <td style={{ padding:"10px 12px" }}>{f.dest_nombre||"—"}</td>
                  <td style={{ padding:"10px 12px" }}>{f.dest_direccion||"—"}</td>
                  <td style={{ padding:"10px 12px" }}>{f.dest_referencia||"—"}</td>
                  <td style={{ padding:"10px 12px" }}>{f.dest_distrito||"—"}</td>
                  <td style={{ padding:"10px 12px" }}>{TIPOS_SERVICIO[f.tipo_servicio]?.label||"—"}</td>
                  <td style={{ padding:"10px 12px" }}>
                    {f.errores.length===0
                      ? <span style={{ color:C.green, fontWeight:700 }}>✅ OK</span>
                      : <span style={{ color:C.red, fontWeight:700 }} title={f.errores.join(", ")}>❌ {f.errores[0]}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {resultado && (
        <div style={{ background:C.white, borderRadius:14, padding:20, border:`1px solid ${C.border}` }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14, flexWrap:"wrap", gap:8 }}>
            <div style={{ fontSize:14, fontWeight:800, color:C.navy }}>
              {resultado.filter(r=>r.ok).length} pedido{resultado.filter(r=>r.ok).length===1?"":"s"} creado{resultado.filter(r=>r.ok).length===1?"":"s"} correctamente
            </div>
            <div style={{ display:"flex", gap:8 }}>
              {empresa?.puede_generar_etiquetas && resultado.some(r=>r.ok) && (
                <button onClick={()=>setMostrarEtiquetas(true)}
                  style={{ background:`linear-gradient(135deg,${C.gold},${C.goldDk})`, color:C.navy, border:"none",
                    padding:"8px 16px", borderRadius:8, fontSize:12, fontWeight:800, cursor:"pointer" }}>
                  🏷️ Generar etiquetas
                </button>
              )}
              <button onClick={descargarResultado}
                style={{ background:C.navy, color:"#E8EAF0", border:"none", padding:"8px 16px",
                  borderRadius:8, fontSize:12, fontWeight:700, cursor:"pointer" }}>
                ⬇️ Descargar códigos generados
              </button>
            </div>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {resultado.map((r,i)=>(
              <div key={i} style={{ display:"flex", justifyContent:"space-between",
                padding:"8px 12px", background:C.bg, borderRadius:8, fontSize:12 }}>
                <span style={{ color:C.textSec }}>{r.cliente_referencia||"—"} · {r.dest_nombre}</span>
                <span style={{ fontWeight:700, color: r.ok?C.green:C.red }}>
                  {r.ok ? `${r.ubicado?"📍 ":"⚠️ "}${r.codigo}` : `Error: ${r.error}`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {mostrarEtiquetas && resultado && (
        <ModalEtiquetasCliente
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
            created_at: new Date().toISOString(),
          }))}
          empresa={empresa}
          onClose={()=>setMostrarEtiquetas(false)}
        />
      )}
    </div>
  );
}

// ── MODAL DE DETALLE (SOLO LECTURA) ────────────────────────────
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

function DetalleModal({ pedido: p, onClose }) {
  const historial = agruparHistorial(
    [...(p.historial||[])].sort((a,b)=> new Date(b.timestamp) - new Date(a.timestamp))
  );
  const todasLasFotos = historial.filter(h=>h.esFotoGrupo).flatMap(h=>h.urls);
  const [fotoAbierta, setFotoAbierta] = useState(null);
  const colorHeader = p.estado==="entregado" ? C.green
    : p.estado==="no_entregado" ? C.red
    : C.navy;

  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0, background:"#0D1E3DBB",
      zIndex:1000, display:"flex", alignItems:"flex-start", justifyContent:"center",
      padding:"40px 16px", overflowY:"auto" }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:C.bg, borderRadius:16,
        width:"100%", maxWidth:640, boxShadow:"0 20px 60px #00000060" }}>

        <div style={{ background:colorHeader, padding:"16px 20px", borderRadius:"16px 16px 0 0",
          display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div>
            <div style={{ fontSize:18, fontWeight:900, color:"#FFFFFF" }}>{p.omd}</div>
            <span style={{ fontSize:11, padding:"2px 10px", borderRadius:20, fontWeight:700,
              background:"rgba(255,255,255,0.22)", color:"#FFFFFF" }}>
              {ESTADOS[p.estado]?.label || p.estado}
            </span>
          </div>
          <button onClick={onClose}
            style={{ background:"none", border:"1px solid rgba(255,255,255,0.4)", color:"#FFFFFF",
              width:32, height:32, borderRadius:8, fontSize:16, cursor:"pointer" }}>✕</button>
        </div>

        <div style={{ padding:20 }}>
          <div style={{ background:C.white, borderRadius:14, padding:18,
            marginBottom:12, border:`1px solid #E2E8F0`,
            borderLeft:`4px solid ${C.gold}` }}>
            <div style={{ fontSize:11, fontWeight:700, color:C.navy, textTransform:"uppercase",
              letterSpacing:"0.8px", marginBottom:12 }}>📦 Destinatario</div>
            <div style={{ fontSize:16, fontWeight:800, color:C.textPri, marginBottom:4 }}>
              {p.dest_nombre}
            </div>
            <div style={{ fontSize:13, color:C.textSec, marginBottom:4 }}>
              📍 {p.dest_direccion}
            </div>
            {p.dest_referencia && (
              <div style={{ fontSize:12, color:C.textMut, marginBottom:4 }}>
                🏠 Ref: {p.dest_referencia}
              </div>
            )}
            <div style={{ fontSize:13, color:C.textSec }}>
              🏙️ {p.dest_distrito}
            </div>
          </div>

          <div style={{ background:C.white, borderRadius:14, padding:18,
            marginBottom:12, border:`1px solid #E2E8F0` }}>
            <div style={{ fontSize:11, fontWeight:700, color:C.navy, textTransform:"uppercase",
              letterSpacing:"0.8px", marginBottom:12 }}>📋 Paquete</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
              <div>
                <div style={{ fontSize:10, color:C.textMut, textTransform:"uppercase" }}>Peso</div>
                <div style={{ fontSize:14, fontWeight:600, color:C.textPri }}>{p.peso_kg?p.peso_kg+" kg":"—"}</div>
              </div>
              <div>
                <div style={{ fontSize:10, color:C.textMut, textTransform:"uppercase" }}>Tipo de servicio</div>
                <div style={{ fontSize:14, fontWeight:600, color:C.textPri }}>
                  {TIPOS_SERVICIO[p.tipo_servicio]?.label || "—"}
                </div>
              </div>
              {p.cliente_referencia && (
                <div>
                  <div style={{ fontSize:10, color:C.textMut, textTransform:"uppercase" }}>N° de orden (tuyo)</div>
                  <div style={{ fontSize:14, fontWeight:600, color:C.textPri }}>{p.cliente_referencia}</div>
                </div>
              )}
            </div>
            {p.cobro_destino && (
              <div style={{ marginTop:14, background:"#FFF7ED",
                border:"2px solid #FED7AA", borderRadius:10, padding:"12px 14px" }}>
                <div style={{ fontSize:12, fontWeight:700, color:"#C2410C", marginBottom:2 }}>
                  💵 COBRO EN DESTINO (COD)
                </div>
                <div style={{ fontSize:20, fontWeight:900, color:"#C2410C" }}>
                  S/ {p.monto_cobrar}
                </div>
              </div>
            )}
            {p.estado==="no_entregado" && p.motivo_no_entrega && (
              <div style={{ marginTop:14, background:"#FEF2F2",
                border:"2px solid #FECACA", borderRadius:10, padding:"12px 14px" }}>
                <div style={{ fontSize:12, fontWeight:700, color:C.red, marginBottom:2 }}>
                  ⚠️ NO ENTREGADO
                </div>
                <div style={{ fontSize:13, color:"#991B1B" }}>{p.motivo_no_entrega}</div>
              </div>
            )}
            {p.repartidor_nombre && (
              <div style={{ marginTop:14, fontSize:12, color:C.textSec }}>
                🛵 Repartidor asignado: <strong>{p.repartidor_nombre}</strong>
              </div>
            )}
          </div>

          <div style={{ background:C.white, borderRadius:14, padding:18,
            border:`1px solid #E2E8F0` }}>
            <div style={{ fontSize:11, fontWeight:700, color:C.navy, textTransform:"uppercase",
              letterSpacing:"0.8px", marginBottom:12 }}>🕒 Historial y evidencias</div>
            {historial.length===0 ? (
              <div style={{ fontSize:12, color:C.textMut, textAlign:"center", padding:"12px 0" }}>
                Sin eventos registrados aún.
              </div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                {historial.map((h,i)=>(
                  <div key={i} style={{ display:"flex", gap:10, alignItems:"flex-start",
                    borderBottom: i<historial.length-1 ? "1px solid #F1F5F9" : "none",
                    paddingBottom:10 }}>
                    <span style={{ fontSize:16 }}>{ICONOS_HIST[h.tipo]||"•"}</span>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:12, fontWeight:600, color:C.textPri }}>
                        {h.tipo==="llamada" && "Llamada al destinatario"}
                        {h.tipo==="whatsapp" && "Mensaje de WhatsApp"}
                        {h.tipo==="estado" && h.detalle}
                        {h.esFotoGrupo && "Fotos de evidencia"}
                      </div>
                      <div style={{ fontSize:11, color:C.textMut }}>
                        {fmt.fechaHora(h.timestamp)}
                      </div>
                      {h.esFotoGrupo && (
                        <div style={{ display:"flex", gap:8, marginTop:6, flexWrap:"wrap" }}>
                          {h.urls.map((url,ui)=>(
                            <img key={ui} src={url} alt="" style={{ width:90, height:90, objectFit:"cover",
                              borderRadius:6, border:"1px solid #E2E8F0", cursor:"pointer" }}
                              onClick={()=>setFotoAbierta(todasLasFotos.indexOf(url))}/>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {fotoAbierta !== null && (
        <div onClick={e=>{ e.stopPropagation(); setFotoAbierta(null); }}
          style={{ position:"fixed", inset:0, background:"#000000EE", zIndex:2000,
            display:"flex", alignItems:"center", justifyContent:"center" }}>
          <button onClick={e=>{ e.stopPropagation(); setFotoAbierta(null); }}
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
// APP PRINCIPAL
// ══════════════════════════════════════════════════════════════
export default function BoazCliente() {
  const [contacto, setContacto] = useState(null);
  const [pedidos, setPedidos] = useState([]);
  const [pedidoSel, setPedidoSel] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [vista, setVista] = useState("consulta"); // consulta | carga

  const cargar = useCallback(async () => {
    if (!contacto?.empresa_id) return;
    setCargando(true);
    const { data: reps } = await sb.from("repartidores").select("id,nombres,apellidos");
    const { data } = await sb.from("pedidos").select("*")
      .eq("empresa_id", contacto.empresa_id)
      .order("created_at",{ascending:false});
    if (data) {
      const conNombreRep = data.map(p => {
        const rep = reps?.find(r=>r.id===p.repartidor_id);
        return { ...p, repartidor_nombre: rep ? `${rep.nombres} ${rep.apellidos}` : null };
      });
      setPedidos(conNombreRep);
    }
    setCargando(false);
  },[contacto]);

  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    if (!contacto) return;
    const ch = sb.channel("cliente-rt")
      .on("postgres_changes",{event:"*",schema:"public",table:"pedidos"},cargar)
      .subscribe();
    return () => sb.removeChannel(ch);
  },[contacto,cargar]);

  if (!contacto) return <Login onLogin={setContacto} />;

  return (
    <div style={{ minHeight:"100vh", background:C.bg,
      fontFamily:"'Segoe UI','Inter',sans-serif" }}>

      <div style={{ background:C.navy, padding:"14px 24px",
        display:"flex", alignItems:"center", justifyContent:"space-between",
        position:"sticky", top:0, zIndex:100,
        boxShadow:"0 2px 12px #0D1E3D44" }}>
        <div>
          <div style={{ display:"flex", alignItems:"center", gap:4, fontSize:18, fontWeight:900 }}>
            <span style={{ color:"#E8EAF0" }}>BOA</span>
            <span style={{ color:C.gold }}>Z</span>
            <span style={{ fontSize:11, color:C.textMut, fontWeight:500, marginLeft:4 }}>Portal Cliente</span>
          </div>
          <div style={{ fontSize:11, color:C.textMut, marginTop:2 }}>
            {contacto.empresa?.nombre || "—"}
          </div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:14 }}>
          <div style={{ fontSize:12, color:C.textMut, textAlign:"right" }}>
            {contacto.nombres} {contacto.apellidos?.[0]}.
          </div>
          <button onClick={()=>{setContacto(null); setPedidoSel(null);}}
            style={{ background:"none", border:"1px solid #1E3560",
              color:C.textMut, padding:"6px 14px", borderRadius:8,
              fontSize:11, cursor:"pointer" }}>Salir</button>
        </div>
      </div>

      <div style={{ background:C.white, borderBottom:`1px solid ${C.border}`,
        padding:"0 24px", display:"flex", gap:4 }}>
        {[
          { id:"consulta", label:"📋 Consultar pedidos" },
          { id:"reportes", label:"📈 Reportes" },
          { id:"carga", label:"⬆️ Cargar pedidos" },
        ].map(t=>(
          <button key={t.id} onClick={()=>setVista(t.id)}
            style={{ background:"none", border:"none", cursor:"pointer",
              padding:"14px 16px", fontSize:13, fontWeight:700,
              color: vista===t.id ? C.navy : C.textMut,
              borderBottom: vista===t.id ? `3px solid ${C.gold}` : "3px solid transparent" }}>
            {t.label}
          </button>
        ))}
      </div>

      {cargando && pedidos.length===0 ? (
        <div style={{ padding:60, textAlign:"center", color:C.textMut, fontSize:13 }}>
          Cargando pedidos...
        </div>
      ) : vista==="carga" ? (
        <CargaMasiva empresaId={contacto.empresa_id} empresa={contacto.empresa} onCargaCompleta={()=>{ cargar(); }}/>
      ) : vista==="reportes" ? (
        <Reportes pedidos={pedidos} contacto={contacto}/>
      ) : (
        <Dashboard pedidos={pedidos} onVerPedido={setPedidoSel}/>
      )}

      {pedidoSel && (
        <DetalleModal
          pedido={pedidos.find(p=>p.id===pedidoSel.id) || pedidoSel}
          onClose={()=>setPedidoSel(null)}
        />
      )}
    </div>
  );
}
