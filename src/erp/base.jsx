// BOAZ ERP — módulo "base" (parte de BoazERP; ver src/BoazERP.jsx)
import { useState, useEffect, useCallback, useRef, useMemo, Fragment } from "react";
import { createClient } from "@supabase/supabase-js";

// Librería de Excel: se descarga solo cuando se exporta o importa un archivo (aligera la carga inicial)
export let _xlsx = null;
export const asegurarXLSX = async () => { if (!_xlsx) { const m = await import("xlsx"); _xlsx = m.utils ? m : m.default; } return _xlsx; };
export const XLSX = new Proxy({}, { get: (_, k) => { if (!_xlsx) throw new Error("XLSX no cargado"); return _xlsx[k]; } });

export const SUPABASE_URL  = "https://jeftkwjdqzkpswvaqspi.supabase.co";
export const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImplZnRrd2pkcXprcHN3dmFxc3BpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4MzI0OTEsImV4cCI6MjEwMDQwODQ5MX0.Ta8Ei_wCm8ZEzD3IM-S60R0rJvI_d5BTvix_Z3W4EmY";
export const sb = createClient(SUPABASE_URL, SUPABASE_ANON);

// ── PALETA BOAZ ──────────────────────────────────────────────
export const B = {
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
  textMut:  "#6F849E",
  green:    "#10B981",
  red:      "#EF4444",
  orange:   "#F97316",
  blue:     "#3B82F6",
};

// ── UTILIDADES ────────────────────────────────────────────────
export const fmt = {
  fecha: (d) => {
    if (!d) return "—";
    // Si es una fecha "sola" (YYYY-MM-DD, sin hora), forzamos que se interprete
    // en hora local en vez de UTC — si no, JS la corre un día hacia atrás en
    // zonas horarias negativas como Perú (UTC-5).
    const str = typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d+"T00:00:00" : d;
    return new Date(str).toLocaleDateString("es-PE",{day:"2-digit",month:"2-digit",year:"numeric"});
  },
  hora:  (d) => d ? new Date(d).toLocaleTimeString("es-PE", {hour:"2-digit",minute:"2-digit"}) : "—",
  fechaHora: (d) => d ? new Date(d).toLocaleString("es-PE",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}) : "—",
  sol:   (n) => n != null ? `S/ ${(parseFloat(n)||0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}` : "—",
};

export const ICONOS_HIST = {
  llamada:"phone", whatsapp:"message", estado:"refresh",
  foto_entrega:"camera", foto_no_entrega:"camera",
};

export const BADGE_SERVICIO = {
  same_day: { bg:"#F5F3FF", color:"#7C3AED", label:"Same Day" },
  next_day: { bg:"#EFF6FF", color:"#0369A1", label:"Next Day" },
  especial: { bg:"#FEF3E2", color:"#B45309", label:"Especial" },
};

// Agrupa las fotos de un mismo evento (mismo timestamp) para mostrarlas juntas.
export function agruparHistorial(historial) {
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

export const ESTADOS_PEDIDO = {
  sin_asignar: { bg:"#EFF6FF", color:"#1D4ED8", label:"Sin asignar" },
  asignado:    { bg:"#FFF7ED", color:"#C2410C", label:"Asignado" },
  en_ruta:     { bg:"#FFFBEB", color:"#B45309", label:"En ruta" },
  entregado:   { bg:"#ECFDF5", color:"#065F46", label:"Entregado" },
  no_entregado:{ bg:"#FEF2F2", color:"#991B1B", label:"No entregado" },
};

export const TIPOS_SERVICIO_PEDIDO = {
  same_day: { label:"Same Day", bg:"#F5F3FF", color:"#7C3AED" },
  next_day: { label:"Next Day", bg:"#EFF6FF", color:"#0369A1" },
  especial: { label:"Especial", bg:"#FFF7ED", color:"#B45309" },
};

export const TARIFAS_SAMEDAY = {
  urbano:      { XS:10, S:13, M:16 },
  semi_urbano: { XS:12, S:15, M:18 },
  periferico:  { XS:15, S:18, M:22 },
};
// tarifaPersonalizada (opcional): { tarifa_xs, tarifa_s, tarifa_m, extra_kg } negociado con un cliente.
// Si se pasa, se usa en vez del tarifario genérico por ámbito.
export const getTarifaSameDay = (ambito, kg, tarifaPersonalizada) => {
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
export const obtenerTarifaEmpresa = (empresaId, ambito, tipoServicio, tarifariosCliente) => {
  if (!empresaId) return null;
  const especifica = tarifariosCliente.find(t=>
    t.empresa_id===empresaId && t.ambito===ambito && t.activo && t.tipo_servicio===tipoServicio);
  if (especifica) return especifica;
  return tarifariosCliente.find(t=>
    t.empresa_id===empresaId && t.ambito===ambito && t.activo && !t.tipo_servicio) || null;
};

// Igual que obtenerTarifaEmpresa, pero sobre el tarifario estándar (sin cliente).
export const obtenerTarifaEstandar = (ambito, tipoServicio, tarifarioEstandar) => {
  const especifica = tarifarioEstandar.find(t=>
    t.ambito===ambito && t.activo && t.tipo_servicio===tipoServicio);
  if (especifica) return especifica;
  return tarifarioEstandar.find(t=>t.ambito===ambito && t.activo && !t.tipo_servicio) || null;
};

// ── TARIFA DE UN PEDIDO (un solo lugar para todo el ERP) ──────
// Orden: 1) precio fijo del cliente  2) tarifa del distrito del cliente  3) tarifario por ámbito/servicio/peso
// (del cliente o, si no tiene, el estándar). Al final se suma el recargo por embalaje si aplica.
export let TARIFAS_DISTRITO = [];   // lo llena la carga principal del ERP
export const setTarifasDistritoGlobal = (v) => { TARIFAS_DISTRITO = v || []; };
export const ZONAS_LIMA = {
  urbano: ["Lima","Barranco","Breña","Chorrillos","El Agustino","Jesús María","La Victoria","Lince","Magdalena del Mar","Miraflores","Pueblo Libre","Rímac","San Borja","San Isidro","San Luis","San Miguel","Santiago de Surco","Surquillo"],
  semi_urbano: ["Callao","Ate","Independencia","La Molina","Los Olivos","San Juan de Lurigancho","San Juan de Miraflores","San Martín de Porres","Santa Anita","Villa El Salvador","Villa María del Triunfo"],
  periferico: ["Comas","Ventanilla","Carabayllo","Lurigancho-Chosica","Lurín","Pachacámac","Puente Piedra"],
};
export const normDist = (t) => (t||"").toString().normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/\s+/g," ").trim();
export const ambitoDeDistrito = (d) => { const n = normDist(d); if (!n) return null; for (const a in ZONAS_LIMA) if (ZONAS_LIMA[a].some(z=>normDist(z)===n)) return a; return null; };
export const calcularTarifaPedido = ({ empresa, ambito, tipoServicio, pesoKg, distrito, embalaje }, tarifariosCliente=[], tarifarioEstandar=[]) => {
  const modo = (empresa && empresa.modo_pedido) || "tarifario";
  const amb = ambito || ambitoDeDistrito(distrito) || "urbano";
  let base = null, origen = "", aviso = "";
  if (empresa && modo==="fijo" && empresa.precio_fijo_pedido!=null && empresa.precio_fijo_pedido!=="") {
    base = parseFloat(empresa.precio_fijo_pedido)||0; origen = "precio fijo por pedido del cliente";
  } else if (empresa && modo==="distrito") {
    const d = normDist(distrito);
    const t = d && TARIFAS_DISTRITO.find(x => x.empresa_id===empresa.id && x.activo!==false && normDist(x.distrito)===d);
    if (t) { base = parseFloat(t.tarifa)||0; origen = `tarifa del distrito ${t.distrito}`; }
    else aviso = d ? "Este distrito no tiene tarifa propia para el cliente; se usa su tarifario general." : "Elige el distrito para aplicar la tarifa del cliente.";
  }
  if (base==null) {
    const tc = obtenerTarifaEmpresa(empresa && empresa.id, amb, tipoServicio, tarifariosCliente);
    const te = obtenerTarifaEstandar(amb, tipoServicio, tarifarioEstandar);
    base = getTarifaSameDay(amb, pesoKg, tc || te);
    origen = tc ? "tarifario negociado con el cliente" : te ? "tarifario estándar" : "tarifario base";
  }
  const recargo = embalaje ? (parseFloat(empresa && empresa.recargo_embalaje)||0) : 0;
  return { tarifa: Math.round((base+recargo)*100)/100, base, recargo, origen, aviso, ambito: amb };
};

// ── GEOCODIFICACIÓN GRATUITA (OpenStreetMap / Nominatim) ───────
// Convierte una dirección en texto a coordenadas lat/lng. Gratis, sin API key.
// Límite de uso: máx. 1 solicitud por segundo (por eso las cargas masivas
// esperan un poco entre cada dirección).
export async function geocodificarDireccion(direccion, distrito) {
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
export const esperar = (ms) => new Promise(r => setTimeout(r, ms));

export const ROLES_ACCESO = {
  admin: ["dashboard","ayuda","pedidos","servicios","repartidores","unidades","incidencias","inventario","clientes","cotizaciones","catalogo","liquidacion-clientes","facturacion","cobranza","liquidaciones","liquidacion-transporte","planilla","gastos","reportes","rentabilidad","usuarios","configuracion"],
  operaciones: ["dashboard","ayuda","pedidos","servicios","repartidores","unidades","incidencias","inventario","clientes","cotizaciones","catalogo"],
  finanzas: ["dashboard","ayuda","servicios","clientes","cotizaciones","catalogo","liquidacion-clientes","facturacion","cobranza","liquidaciones","liquidacion-transporte","planilla","gastos","reportes","rentabilidad"],
};
export const Chip = ({ estado, size="sm" }) => {
  const s = ESTADOS_PEDIDO[estado] || { bg:"#F3F4F6", color:"#374151", label: estado };
  return (
    <span style={{ background: s.bg, color: s.color, padding: size==="sm" ? "3px 10px" : "5px 14px",
      borderRadius: 20, fontSize: size==="sm" ? 11 : 12, fontWeight: 700, whiteSpace:"nowrap",
      border: `1px solid ${s.color}22` }}>
      {s.label}
    </span>
  );
};

// ── ERRORES EN LENGUAJE HUMANO ────────────────────────────────
// Los errores de la base de datos llegan en inglés técnico ("permission denied for table…").
// Aquí se traducen a qué pasó y qué hacer. El texto original se conserva como "detalle técnico".
const NOMBRE_TABLA = {
  pedidos:"pedidos", empresas:"clientes", repartidores:"repartidores", facturas:"facturas", gastos:"gastos", liquidaciones:"liquidaciones de repartidores",
  liquidacion_pedidos:"liquidaciones de repartidores", unidades_transporte:"unidades de la flota", asignaciones_unidad:"asignaciones de unidades",
  dias_servicio_unidad:"calendario de servicio", vehiculo_documentos:"documentos de flota", incidencias:"incidencias", cotizaciones:"cotizaciones",
  usuarios:"usuarios", roles_permisos:"roles y permisos", auditoria:"auditoría", personal_planilla:"personal en planilla", terceros_planilla:"terceros",
  pagos_planilla:"pagos de planilla", pagos_terceros:"pagos a terceros", tarifarios_cliente:"tarifas por pedido", tarifario_estandar:"tarifario estándar",
  tarifarios_vehiculo_cliente:"tarifas por vehículo", tarifario_vehiculo_estandar:"tarifario estándar por unidad", tarifarios_viaje_cliente:"tarifas por viaje",
  tarifario_viaje_estandar:"tarifario estándar por viaje", tarifas_distrito_cliente:"tarifas por distrito", servicios_cliente:"viajes y servicios",
  lineas_negocio:"líneas de negocio", tipos_servicio:"tipos de servicio", configuracion_recargos:"recargo por feriados", productos:"productos",
  producto_variantes:"productos", inventario_movimientos:"movimientos de inventario", ordenes_despacho:"órdenes de despacho", clientes_usuarios:"usuarios del portal",
  empresas_codigo_seq:"código de clientes",
};
const CAMPO = { ruc:"RUC", placa:"placa", codigo:"código", codigo_interno:"código", dni:"DNI", usuario:"usuario", usuario_app:"usuario de la app", email:"correo",
  omd:"tracking", numero:"número", serie:"serie", nombre:"nombre", nombres:"nombres", empresa_id:"cliente", repartidor_id:"repartidor", unidad_id:"unidad",
  fecha:"fecha", monto:"monto", tarifa:"tarifa", concepto:"concepto", distrito:"distrito", sku:"SKU", periodo:"período", cantidad:"cantidad",
  tarifa_unit:"tarifa", tarifa_dia:"tarifa por día", modo_pedido:"forma de cobro por pedido", precio_fijo_pedido:"precio fijo por pedido",
  recargo_embalaje:"recargo por embalaje", modalidades_tarifa:"modalidad de cobro", fecha_pago:"fecha de pago", con_embalaje:"embalaje", estado:"estado", tipo:"tipo" };
const FEMENINO = new Set(["placa","fecha","tarifa","serie","cantidad","tarifa_unit","tarifa_dia","forma de cobro por pedido","modalidad de cobro","fecha_pago"]);
const conArticulo = (c) => `${FEMENINO.has(c) ? "esa misma" : "ese mismo"} ${nomCampo(c)}`;
const nomTabla = (t) => NOMBRE_TABLA[t] || (t||"").replace(/_/g," ");
const nomCampo = (c) => CAMPO[c] || (c||"").replace(/_/g," ");
const SQL_VERIF = "Pide a quien administra el sistema que ejecute en Supabase el SQL pendiente (verificar_instalacion_boaz.sql muestra cuál falta).";
const REGLAS_ERROR = [
  [/sesion_invalida|jwt expired|invalid jwt|refresh token|not authenticated|auth session missing/i, () => "Tu sesión expiró. Cierra sesión y vuelve a entrar."],
  [/invalid login credentials/i, () => "Correo o contraseña incorrectos."],
  [/email not confirmed/i, () => "Este correo aún no está confirmado. Revisa la bandeja de entrada o pide que lo confirmen en Supabase."],
  [/failed to fetch|networkerror|network request failed|load failed|err_internet|timeout|timed out|fetch failed/i, () => "No hay conexión con el servidor. Revisa tu internet e intenta de nuevo."],
  [/too many|rate limit|demasiados intentos/i, () => "Demasiados intentos seguidos. Espera un minuto y vuelve a intentar."],
  [/permission denied for (?:table|relation|view) "?(\w+)"?/i, (m) => `No tienes permiso para modificar ${nomTabla(m[1])}. Pide a un administrador que lo habilite en Usuarios y auditoría → Roles y permisos.`],
  [/permission denied for sequence "?(\w+)"?/i, (m) => `No se pudo generar el ${nomTabla(m[1])} porque falta un permiso en la base de datos. Pide a quien administra el sistema que ejecute fix_secuencias_boaz.sql en Supabase.`],
  [/permission denied for function "?(\w+)"?/i, () => `No tienes permiso para esta acción. Si eres administrador, ${SQL_VERIF.charAt(0).toLowerCase()+SQL_VERIF.slice(1)}`],
  [/new row violates row-level security policy(?: for table "?(\w+)"?)?|row-level security/i, (m) => `Tu usuario no tiene permiso para guardar ${m[1] ? nomTabla(m[1]) : "este dato"}. Revisa que tu cuenta esté activa y que tu rol tenga acceso a este módulo.`],
  [/relation "?(?:public\.)?(\w+)"? does not exist|could not find the table '?(?:public\.)?(\w+)'?/i, (m) => `Falta activar «${nomTabla(m[1]||m[2])}» en la base de datos. ${SQL_VERIF}`],
  [/column "?(?:\w+\.)?(\w+)"? (?:of relation "?\w+"? )?does not exist|could not find the '?(\w+)'? column/i, (m) => `La base de datos no tiene el campo «${nomCampo(m[1]||m[2])}»: falta una actualización. ${SQL_VERIF}`],
  [/function .*?(\w+)\(.*\) does not exist|could not find the function/i, () => `Falta una función en la base de datos. ${SQL_VERIF}`],
  [/duplicate key value violates unique constraint "?(\w+)"?(?:[\s\S]*Key \((\w+)\))?/i, (m) => { const c = m[2] || (Object.keys(CAMPO).find(k => (m[1]||"").includes(k))); return c ? `Ya existe un registro con ${conArticulo(c)}. Revisa que no esté duplicado.` : "Ya existe un registro igual. Revisa que no esté duplicado."; }],
  [/update or delete on table "?(\w+)"? violates foreign key constraint[\s\S]*on table "?(\w+)"?/i, (m) => `No se puede eliminar porque tiene ${nomTabla(m[2])} vinculados. Elimina o reasigna esos registros primero, o desactívalo en lugar de borrarlo.`],
  [/violates foreign key constraint/i, () => "El registro al que haces referencia ya no existe (por ejemplo, un cliente o repartidor eliminado). Recarga la página y vuelve a elegirlo."],
  [/null value in column "?(\w+)"?/i, (m) => `Falta completar el campo «${nomCampo(m[1])}».`],
  [/violates check constraint "?(\w+)"?/i, (m) => { const c = Object.keys(CAMPO).find(k => (m[1]||"").includes(k)); return `Un valor no es válido${c ? ` en «${nomCampo(c)}»` : ""}: revisa que los montos no sean negativos y que las opciones elegidas sean de la lista.`; }],
  [/invalid input syntax for type (\w+)/i, (m) => /date|time/i.test(m[1]) ? "Una fecha no tiene el formato correcto." : /uuid/i.test(m[1]) ? "Falta elegir un elemento de la lista (cliente, repartidor u otro)." : "Un campo numérico tiene texto o un formato incorrecto. Usa solo números y punto decimal."],
  [/value too long for type/i, () => "Uno de los textos es demasiado largo. Acórtalo e intenta de nuevo."],
  [/numeric field overflow|out of range/i, () => "Un número es demasiado grande. Revisa los montos o cantidades."],
  [/payload too large|exceeded the maximum allowed size|entity too large/i, () => "El archivo es demasiado grande. Usa uno más liviano (por ejemplo, una foto en menor resolución)."],
  [/bucket not found/i, () => `Falta configurar el almacenamiento de archivos en Supabase. ${SQL_VERIF}`],
  [/the resource already exists/i, () => "Ya existe un archivo con ese nombre. Cámbiale el nombre e intenta de nuevo."],
  [/xlsx no cargado|exceljs|no se pudo cargar el generador/i, () => "No se pudo cargar la herramienta de Excel. Revisa tu conexión y vuelve a intentar."],
];
// Devuelve { texto, tecnico } — texto listo para mostrar; tecnico es el original si se tradujo
export function traducirError(msg) {
  const original = String(msg||"");
  for (const [re, fn] of REGLAS_ERROR) {
    const m = original.match(re);
    if (!m) continue;
    // Conserva solo una introducción en español escrita por el ERP ("No se pudo guardar la nota: …"); nunca restos en inglés
    const cab = original.includes(":") ? original.slice(0, original.indexOf(":")).trim() : "";
    let prefijo = /^(no se pud|error (al|preparando|guardando|cargando)|no fue posible)/i.test(cab) ? cab : "";
    // Si el código ya traía un consejo específico ("— falta ejecutar X.sql"), se mantiene
    const pista = (original.match(/—\s*(falta ejecutar[^]*)$/i)||[])[1];
    let texto = fn(m);
    // Evita repetir la misma idea ("No se pudo eliminar. No se puede eliminar…")
    const verbo = (prefijo.match(/(\w+)\s*$/)||[])[1];
    if (verbo && texto.slice(0,60).toLowerCase().includes(verbo.toLowerCase())) prefijo = "";
    if (pista && /base de datos|SQL/i.test(texto)) texto = texto.replace(SQL_VERIF, `Falta ejecutar ${pista.replace(/^falta ejecutar\s*/i,"")}.`);
    return { texto: (prefijo ? prefijo + ". " : "") + texto, tecnico: original };
  }
  return { texto: original, tecnico: null };
}

// ── TOAST ─────────────────────────────────────────────────────
export function Toast({ msg, tipo, onClose }) {
  const esError = tipo==="error";
  const { texto, tecnico } = esError ? traducirError(msg) : { texto: msg, tecnico: null };
  const [verDetalle, setVerDetalle] = useState(false);
  const [fijo, setFijo] = useState(false);
  // Los errores se quedan más tiempo (hay que leerlos); si el usuario abre el detalle, no se cierran solos
  useEffect(() => { if (fijo) return; const t = setTimeout(onClose, esError ? 9000 : 3500); return () => clearTimeout(t); }, [onClose, esError, fijo]);
  useEffect(() => { if (tecnico) console.warn("[Boaz ERP] Error técnico:", tecnico); }, [tecnico]);
  return (
    <div className="bz-toast" role={esError ? "alert" : "status"} style={{ position:"fixed", bottom:24, right:24, zIndex:9999, maxWidth:440,
      background: esError ? "#B91C1C" : tipo==="warn" ? "#C2410C" : "#047857",
      color:"#fff", padding:"13px 16px", borderRadius:12, fontWeight:600,
      fontSize:13, lineHeight:1.45, boxShadow:"0 8px 32px #0003", display:"flex", alignItems:"flex-start", gap:10 }}>
      <Ico n={esError?"xcircle":tipo==="warn"?"alert":"check"} size={18} color="#fff" style={{ marginTop:1 }}/>
      <div style={{ flex:1, minWidth:0 }}>
        <div>{texto}</div>
        {tecnico && (
          <button onClick={()=>{ setVerDetalle(v=>!v); setFijo(true); }} style={{ marginTop:6, background:"none", border:"none", color:"#FECACA", fontSize:11.5, fontWeight:600, cursor:"pointer", padding:0, textDecoration:"underline" }}>
            {verDetalle ? "Ocultar detalle técnico" : "Ver detalle técnico"}</button>
        )}
        {verDetalle && tecnico && <div style={{ marginTop:6, padding:"6px 8px", background:"#00000026", borderRadius:6, fontSize:11.5, fontWeight:400, fontFamily:"ui-monospace,Consolas,monospace", wordBreak:"break-word", userSelect:"text" }}>{tecnico}</div>}
      </div>
      {(esError || fijo) && <button onClick={onClose} aria-label="Cerrar aviso" style={{ background:"none", border:"none", color:"#fff", opacity:.8, cursor:"pointer", padding:0, display:"flex" }}><Ico n="x" size={16}/></button>}
    </div>
  );
}

// ── MODAL CONFIRM ─────────────────────────────────────────────
export function Confirm({ msg, onOk, onCancel }) {
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
export const inp = { background:B.bg, border:`1px solid ${B.border}`, color:B.textPri,
  borderRadius:8, padding:"9px 12px", fontSize:13, width:"100%", outline:"none" };
export const lbl = { fontSize:12, color:B.textSec, fontWeight:600, marginBottom:5, display:"block" };
export const BtnPri = ({ children, onClick, disabled, style={}, ...resto }) => (
  <button onClick={onClick} disabled={disabled} {...resto}
    className="bz-btn-pri" style={{ background:"#D46A08",
      border:"none", color:"#fff", padding:"9px 16px", borderRadius:8,
      cursor: disabled?"not-allowed":"pointer", fontSize:13, fontWeight:700,
      opacity: disabled?0.6:1, display:"inline-flex", alignItems:"center", justifyContent:"center", gap:7,
      whiteSpace:"nowrap", ...style }}>
    {children}
  </button>
);
export const BtnSec = ({ children, onClick, style={}, ...resto }) => (
  <button onClick={onClick} {...resto}
    className="bz-btn-sec" style={{ background:B.white, border:`1px solid ${B.border}`,
      color:B.textPri, padding:"8px 14px", borderRadius:8, fontWeight:600,
      cursor:"pointer", fontSize:13, display:"inline-flex", alignItems:"center", justifyContent:"center", gap:7,
      whiteSpace:"nowrap", ...style }}>
    {children}
  </button>
);

// ══════════════════════════════════════════════════════════════
// UI KIT (Fase 1): íconos, estilos globales, estados de carga/vacío
// ══════════════════════════════════════════════════════════════
export const ICONOS = {
  dashboard:'<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
  package:'<path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/><path d="M12 22V12"/><path d="m3.3 7 8.7 5 8.7-5"/>',
  bike:'<circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/>',
  truck:'<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
  warehouse:'<path d="M22 8.35V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.35A2 2 0 0 1 3.26 6.5l8-3.2a2 2 0 0 1 1.48 0l8 3.2A2 2 0 0 1 22 8.35Z"/><path d="M6 18h12"/><path d="M6 14h12"/>',
  building:'<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01"/>',
  mail:'<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  tag:'<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><path d="M7.5 7.5h.01"/>',
  filetext:'<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  receipt:'<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 17.5v-11"/>',
  wallet:'<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
  calendar:'<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  banknote:'<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/>',
  users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  chart:'<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M18 17V9M13 17V5M8 17v-3"/>',
  settings:'<path d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4"/>',
  search:'<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  refresh:'<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  chevdown:'<path d="m6 9 6 6 6-6"/>',
  alert:'<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  logout:'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  check:'<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  panel:'<path d="m11 17-5-5 5-5"/><path d="m18 17-5-5 5-5"/>',
  panelr:'<path d="m13 17 5-5-5-5"/><path d="m6 17 5-5-5-5"/>',
  wrench:'<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  trend:'<path d="M22 7 13.5 15.5 8.5 10.5 2 17"/><path d="M16 7h6v6"/>',
  dollar:'<path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  map:'<path d="M9 3 3 5v16l6-2 6 2 6-2V3l-6 2-6-2z"/><path d="M9 3v16"/><path d="M15 5v16"/>',
  menu:'<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/>',
  x:'<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  arrow:'<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  shield:'<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
  xcircle:'<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
  edit:'<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
  trash:'<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M10 11v6"/><path d="M14 11v6"/>',
  upload:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
  download:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  pin:'<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
  plus:'<path d="M5 12h14"/><path d="M12 5v14"/>',
  eye:'<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
  chevleft:'<path d="m15 18-6-6 6-6"/>',
  chevright:'<path d="m9 18 6-6-6-6"/>',
  chevup:'<path d="m18 15-6-6-6 6"/>',
  clock:'<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  sparkles:'<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/>',
  user:'<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  phone:'<path d="M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384"/>',
  filter:'<path d="M10 20a1 1 0 0 0 .553.895l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .517-1.341L21.74 4.67A1 1 0 0 0 21 3H3a1 1 0 0 0-.742 1.67l7.225 7.989A2 2 0 0 1 10 14z"/>',
  camera:'<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
  grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>',
  list:'<path d="M3 12h.01"/><path d="M3 18h.01"/><path d="M3 6h.01"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M8 6h13"/>',
  message:'<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
  columns:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/><path d="M15 3v18"/>',
  printer:'<path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6"/><rect x="6" y="14" width="12" height="8" rx="1"/>',
  help:'<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  book:'<path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>',
  inbox:'<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
};
export const diaLocal = (d=new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
export const escHTML = (v) => String(v==null?"":v).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

// Pedidos sin la columna pesada "historial" (fotos/GPS); usa la función pedidos_lista() y,
// si todavía no existe en Supabase, cae al método anterior.
export const cargarPedidosLiviano = async () => {
  try {
    const r = await traerTodo(() => sb.rpc("pedidos_lista"));
    if (!r.error && Array.isArray(r.data)) return r;
  } catch {}
  return traerTodo(() => sb.from("pedidos").select("*").order("created_at",{ascending:false}).order("id"));
};

// Trae TODAS las filas de una consulta (Supabase corta en 1.000 por pedido)
export const traerTodo = async (armar, tam=1000) => {
  let desde = 0, acc = [];
  for (;;) {
    const { data, error } = await armar().range(desde, desde+tam-1);
    if (error) return { data:null, error };
    acc = acc.concat(data||[]);
    if (!data || data.length < tam) return { data:acc, error:null };
    desde += tam;
  }
};
export function Ico({ n, size=18, color="currentColor", sw=1.8, style }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw}
    strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink:0, display:"block", ...style }}
    dangerouslySetInnerHTML={{ __html: ICONOS[n] || "" }}/>;
}

// Estilos globales + tipografía Inter (se inyecta una sola vez)
if (typeof document !== "undefined" && !document.getElementById("bz-css")) {
  try {
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap";
    document.head.appendChild(l);
    const st = document.createElement("style");
    st.id = "bz-css";
    st.textContent = `
      body, button, input, select, textarea { font-family:'Inter','Segoe UI',sans-serif; font-variant-numeric:tabular-nums; }
      input, select, textarea { box-sizing:border-box; max-width:100%; }
      @keyframes spin { to { transform:rotate(360deg); } }
      @keyframes bz-shimmer { 0%{background-position:-400px 0} 100%{background-position:400px 0} }
      @keyframes bz-pop { from{opacity:0; transform:translateY(-6px) scale(.98)} to{opacity:1; transform:none} }
      .bz-skel { background:linear-gradient(90deg,#E6EDF5 25%,#F3F7FB 37%,#E6EDF5 63%); background-size:800px 100%; animation:bz-shimmer 1.3s infinite linear; border-radius:8px; }
      tbody tr:hover { background:#EEF3F9 !important; }
      input:focus, select:focus, textarea:focus { border-color:#E8780A !important; box-shadow:0 0 0 3px #E8780A22; outline:none; }
      ::-webkit-scrollbar { width:8px; height:8px; } ::-webkit-scrollbar-thumb { background:#C5D2E0; border-radius:8px; } ::-webkit-scrollbar-track { background:transparent; }
      .bz-nav-item:hover { background:#1E3A5F55 !important; color:#E8EAF0 !important; }
      @media (max-width:900px) {
        table { display:block; max-width:100%; overflow-x:auto; -webkit-overflow-scrolling:touch; }
        [style*="grid-template-columns"] { grid-template-columns:repeat(auto-fit,minmax(150px,1fr)) !important; }
        [style*="position: fixed"] > div { max-width:96vw !important; max-height:92vh; overflow-y:auto; }
        select, input, textarea { font-size:16px; }
        button { min-height:34px; }
      }
      @media (max-width:900px) { .bz-mapa-grid { grid-template-columns:1fr !important; } .bz-oculta-movil { display:none !important; } }
      .bz-overlay-nav { position:fixed; inset:0; background:#0D1E3D88; z-index:40; }
      .bz-btn-pri { transition:background .12s, box-shadow .12s; } .bz-btn-pri:hover:not(:disabled) { background:#B95C07 !important; box-shadow:0 2px 8px #E8780A44; }
      .bz-btn-sec { transition:background .12s, border-color .12s; } .bz-btn-sec:hover { background:#F0F4F8 !important; border-color:#B4C4D6 !important; }
      .bz-btnico { transition:background .12s, color .12s; } .bz-btnico:hover { background:#E6EDF5 !important; color:#0D1E3D !important; }
      .bz-th-orden:hover { color:#0D1E3D !important; }
      button:focus-visible, a:focus-visible { outline:2px solid #E8780A; outline-offset:2px; }
      .bz-tabla td, .bz-tabla th { border-bottom:1px solid #E3EAF2; } .bz-tabla tbody tr:last-child td { border-bottom:none; }
      @keyframes bz-slide { from{transform:translateX(40px); opacity:0} to{transform:none; opacity:1} }
      .bz-panel { animation:bz-slide .18s ease-out; }
      .bz-fila-sel td { background:#FFF7ED !important; }
      .bz-ayuda { position:relative; display:inline-flex; vertical-align:middle; margin-left:5px; color:#8FA3BA; cursor:help; }
      .bz-ayuda:hover, .bz-ayuda:focus-within { color:#E8780A; }
      .bz-ayuda-txt { display:none; position:absolute; left:50%; bottom:calc(100% + 8px); transform:translateX(-50%); width:260px; max-width:70vw; background:#0D1E3D; color:#E8EAF0; font-size:12px; font-weight:400; line-height:1.45; text-transform:none; letter-spacing:0; padding:9px 11px; border-radius:8px; box-shadow:0 8px 24px #0D1E3D44; z-index:400; white-space:normal; text-align:left; pointer-events:none; }
      .bz-ayuda-txt::after { content:""; position:absolute; top:100%; left:50%; margin-left:-6px; border:6px solid transparent; border-top-color:#0D1E3D; }
      .bz-ayuda:hover .bz-ayuda-txt, .bz-ayuda:focus-within .bz-ayuda-txt { display:block; }
      .bz-ayuda.bz-ayuda-der .bz-ayuda-txt { left:auto; right:-6px; transform:none; } .bz-ayuda.bz-ayuda-der .bz-ayuda-txt::after { left:auto; right:10px; margin-left:0; }
      .bz-ayuda.bz-ayuda-abajo .bz-ayuda-txt { bottom:auto; top:calc(100% + 8px); } .bz-ayuda.bz-ayuda-abajo .bz-ayuda-txt::after { top:auto; bottom:100%; border-top-color:transparent; border-bottom-color:#0D1E3D; }
      @media (max-width:760px) { .bz-toast { top:12px !important; bottom:auto !important; left:12px !important; right:12px !important; justify-content:center; } }
      .bz-card-hover { transition:box-shadow .15s, transform .15s; } .bz-card-hover:hover { box-shadow:0 8px 24px #0D1E3D1A !important; transform:translateY(-1px); }
    `;
    document.head.appendChild(st);
  } catch {}
}

// Carga con esqueleto animado (reemplaza el texto "Cargando...")
export function Cargando({ filas=4 }) {
  return (
    <div style={{ padding:20, display:"flex", flexDirection:"column", gap:12 }}>
      {Array.from({ length:filas }).map((_,i) => <div key={i} className="bz-skel" style={{ height:i===0?22:16, width:i===0?"40%":`${95-i*8}%` }}/>)}
    </div>
  );
}
// Estado vacío con ícono y mensaje
export function EstadoVacio({ icono="inbox", titulo, texto, children, pasos, ir, onIr }) {
  return (
    <div style={{ padding:"40px 20px", textAlign:"center" }}>
      <div style={{ width:52, height:52, margin:"0 auto 12px", borderRadius:14, background:B.bg, display:"flex", alignItems:"center", justifyContent:"center", color:B.textMut }}>
        <Ico n={icono} size={24}/>
      </div>
      <div style={{ fontSize:14, fontWeight:700, color:B.textPri }}>{titulo}</div>
      {texto && <div style={{ fontSize:12, color:B.textSec, marginTop:4, maxWidth:520, margin:"4px auto 0" }}>{texto}</div>}
      {pasos && pasos.length>0 && (
        <ol style={{ textAlign:"left", display:"inline-block", margin:"16px auto 0", padding:"12px 16px 12px 34px", background:"#F6F9FC", borderRadius:10, fontSize:12.5, color:B.textPri, lineHeight:1.6, maxWidth:520 }}>
          {pasos.map((t,i)=><li key={i}>{t}</li>)}
        </ol>
      )}
      {(children || (ir && onIr)) && <div style={{ marginTop:14, display:"flex", gap:8, justifyContent:"center", flexWrap:"wrap" }}>
        {children}
        {ir && onIr && <BtnSec onClick={()=>onIr(ir.id)}>{ir.label} <Ico n="arrow" size={14}/></BtnSec>}
      </div>}
    </div>
  );
}


// ══════════════════════════════════════════════════════════════
// SISTEMA DE DISEÑO v2: piezas únicas que usan todos los módulos
// ══════════════════════════════════════════════════════════════
export const CARD = { background:B.white, border:`1px solid ${B.border}`, borderRadius:12, boxShadow:"0 1px 2px #0D1E3D0D" };
export const TD  = { padding:"12px 14px", fontSize:13, color:B.textPri, verticalAlign:"middle" };
export const TDN = { ...TD, textAlign:"right", whiteSpace:"nowrap" };   // celdas numéricas: a la derecha, sin partir
export const TDS = { ...TD, color:B.textSec };

// Cerrar la ventana emergente superior con la tecla Esc (vale para todas las ventanas del ERP)
if (typeof document !== "undefined" && !window.__bzEsc) {
  window.__bzEsc = true;
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const capas = [...document.querySelectorAll('div[style*="inset: 0"]')].filter(d => d.style.position==="fixed");
    const capa = capas[capas.length-1];
    if (!capa) return;
    const bs = [...capa.querySelectorAll("button")];
    const cerrar = bs.find(b => b.textContent.trim()==="✕" || b.getAttribute("aria-label")==="Cerrar") || bs.find(b => /^(Cancelar|Cerrar)$/.test(b.textContent.trim()));
    if (cerrar) { e.preventDefault(); cerrar.click(); }
  });
}

// Mini gráfico de tendencia
export function Sparkline({ datos, color=B.navy, w=90, h=28 }) {
  if (!datos || datos.length<2) return null;
  const max = Math.max(...datos), min = Math.min(...datos), rg = (max-min)||1;
  const pts = datos.map((v,i)=>[ (i/(datos.length-1))*(w-4)+2, h-3-((v-min)/rg)*(h-8) ]);
  const d = pts.map((p,i)=>(i?"L":"M")+p[0].toFixed(1)+" "+p[1].toFixed(1)).join(" ");
  return (
    <svg width={w} height={h} style={{ display:"block" }}>
      <path d={d+` L${w-2} ${h} L2 ${h} Z`} fill={color+"18"}/>
      <path d={d} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round"/>
      <circle cx={pts[pts.length-1][0]} cy={pts[pts.length-1][1]} r={2.6} fill={color}/>
    </svg>
  );
}

// Tarjeta de indicador (única para todo el ERP)
export function Kpi({ icon, label, valor, sub, color=B.navy, cv, delta, deltaTxt="", invertir=false, serie, ayuda }) {
  const bueno = delta==null ? null : (invertir ? delta<=0 : delta>=0);
  return (
    <div className="bz-card-hover" style={{ ...CARD, padding:"16px 18px", minWidth:0 }}>
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
        {icon && <div style={{ width:28, height:28, borderRadius:8, background:`${color}14`, color, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}><Ico n={icon} size={16}/></div>}
        <div style={{ fontSize:12, fontWeight:600, color:B.textSec, flex:1, minWidth:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }} title={label}>{label}{ayuda && <Ayuda k={ayuda} size={13}/>}</div>
        {delta!=null && <span style={{ fontSize:11, fontWeight:700, padding:"2px 7px", borderRadius:8, whiteSpace:"nowrap", background: bueno?"#ECFDF5":"#FEF2F2", color: bueno?"#047857":"#B91C1C" }}>{delta>=0?"▲":"▼"} {Math.abs(delta)}%{deltaTxt}</span>}
      </div>
      <div style={{ display:"flex", alignItems:"flex-end", justifyContent:"space-between", gap:8 }}>
        <div style={{ fontSize:24, fontWeight:800, color:cv||B.textPri, lineHeight:1.1, whiteSpace:"nowrap" }}>{valor}</div>
        {serie && <Sparkline datos={serie} color={color}/>}
      </div>
      {sub && <div style={{ fontSize:12, color:B.textSec, marginTop:6 }}>{sub}</div>}
    </div>
  );
}

export const KpiDS = Kpi;
// Tarjeta compacta para módulos con su propio atajo Kpi({t,v,c,s}): mismo diseño, valor en verde/rojo solo si significa algo
export const kpiMini = ({ t, v, c, s, i }) => (
  <div style={{ flex:"1 1 170px", minWidth:0, display:"grid" }}>
    <KpiDS icon={i} label={t} valor={v} sub={s} color={c||B.navy} cv={c===B.green?"#047857":c===B.red?"#B91C1C":c===B.orange?"#B45309":undefined}/>
  </div>);
export const TAB_SEG = (on) => ({ display:"flex", alignItems:"center", gap:7, padding:"6px 14px", borderRadius:8, border:"none", cursor:"pointer", whiteSpace:"nowrap",
  fontSize:13, fontWeight:on?700:500, background:on?B.white:"transparent", color:on?B.navy:B.textSec, boxShadow:on?"0 1px 2px #0D1E3D22":"none" });
export const TAB_CONT = { display:"inline-flex", gap:2, padding:3, background:"#E3EAF2", borderRadius:10, maxWidth:"100%", overflowX:"auto" };

// Pestañas: tipo "linea" (secciones de una pantalla) o "segmento" (filtros de una lista)
export function Tabs({ tabs, valor, onChange, tipo="segmento", style }) {
  if (tipo==="linea") return (
    <div style={{ display:"flex", gap:4, borderBottom:`1px solid ${B.border}`, overflowX:"auto", ...style }}>
      {tabs.map(t => { const on = valor===t.id; return (
        <button key={t.id} onClick={()=>onChange(t.id)}
          style={{ display:"flex", alignItems:"center", gap:7, padding:"10px 14px", background:"none", border:"none", cursor:"pointer", whiteSpace:"nowrap",
            fontSize:13, fontWeight:on?700:500, color:on?B.navy:B.textSec, borderBottom:`2px solid ${on?B.gold:"transparent"}`, marginBottom:-1 }}>
          {t.i && <Ico n={t.i} size={16} color={on?B.gold:B.textMut}/>}{t.l}
          {t.n!=null && <span style={{ fontSize:11, fontWeight:700, padding:"1px 7px", borderRadius:10, background:on?`${B.gold}1F`:"#E6EDF5", color:on?B.goldDk:B.textSec }}>{t.n}</span>}
        </button>); })}
    </div>
  );
  return (
    <div style={{ display:"inline-flex", gap:2, padding:3, background:"#E3EAF2", borderRadius:10, maxWidth:"100%", overflowX:"auto", ...style }}>
      {tabs.map(t => { const on = valor===t.id; return (
        <button key={t.id} onClick={()=>onChange(t.id)}
          style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 12px", borderRadius:8, border:"none", cursor:"pointer", whiteSpace:"nowrap",
            fontSize:12, fontWeight:on?700:500, background:on?B.white:"transparent", color:on?B.navy:B.textSec, boxShadow:on?"0 1px 2px #0D1E3D22":"none" }}>
          {t.l}
          {t.n!=null && <span style={{ fontSize:11, fontWeight:700, color:on?B.goldDk:B.textMut }}>{t.n}</span>}
        </button>); })}
    </div>
  );
}

// Etiqueta de estado
export const TONOS = { ok:["#ECFDF5","#047857"], warn:["#FFF7ED","#B45309"], error:["#FEF2F2","#B91C1C"], info:["#EFF6FF","#1D4ED8"], neutro:["#F1F5F9","#475569"] };
export function Etiqueta({ tono="neutro", children }) {
  const [bg,c] = TONOS[tono] || TONOS.neutro;
  return <span style={{ display:"inline-flex", alignItems:"center", gap:6, background:bg, color:c, padding:"3px 10px", borderRadius:20, fontSize:11, fontWeight:700, whiteSpace:"nowrap" }}>
    <span style={{ width:6, height:6, borderRadius:"50%", background:c }}/>{children}</span>;
}

// Botón de ícono para acciones de fila
export function BtnIco({ n, title, onClick, color=B.textSec }) {
  return <button className="bz-btnico" onClick={onClick} title={title} aria-label={title}
    style={{ width:30, height:30, borderRadius:8, border:"none", background:"transparent", color, cursor:"pointer", display:"inline-flex", alignItems:"center", justifyContent:"center" }}>
    <Ico n={n} size={16}/></button>;
}

// Buscador con ícono
export function Buscador({ value, onChange, placeholder="Buscar…", width=320 }) {
  return (
    <div style={{ position:"relative", width, maxWidth:"100%" }}>
      <Ico n="search" size={16} color={B.textMut} style={{ position:"absolute", left:11, top:"50%", transform:"translateY(-50%)", pointerEvents:"none" }}/>
      <input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder}
        style={{ ...inp, background:B.white, paddingLeft:34 }}/>
    </div>
  );
}

// Encabezado de columna (con orden opcional)
export function Th({ children, col, orden, onOrden, align="left", style, ayuda }) {
  const on = col && orden && orden.col===col;
  return (
    <th onClick={()=>col && onOrden && onOrden(col)} className={col?"bz-th-orden":undefined}
      style={{ padding:"10px 14px", textAlign:align, fontSize:11, fontWeight:700, color:on?B.navy:B.textSec, background:"#F6F9FC",
        letterSpacing:"0.3px", whiteSpace:"nowrap", userSelect:"none", cursor:col?"pointer":"default", ...style }}>
      <span style={{ display:"inline-flex", alignItems:"center", gap:4 }}>
        {children}
        {col && <Ico n={on && orden.dir==="desc" ? "chevdown" : "chevup"} size={12} sw={2.4} style={{ opacity:on?1:0.25 }}/>}
        {ayuda && <Ayuda k={ayuda} size={13}/>}
      </span>
    </th>
  );
}

// Paginación: devuelve las filas visibles y el pie listo para poner bajo la tabla
export function usePaginacion(filas, tamInicial=25, nombre="registros") {
  const [pag, setPag] = useState(1);
  const [tam, setTam] = useState(tamInicial);
  const total = filas.length, paginas = Math.max(1, Math.ceil(total/tam)), p = Math.min(pag, paginas);
  const visibles = filas.slice((p-1)*tam, p*tam);
  const btn = (dis) => ({ width:30, height:30, borderRadius:8, border:`1px solid ${B.border}`, background:B.white, color:dis?B.border:B.textPri, cursor:dis?"default":"pointer", display:"inline-flex", alignItems:"center", justifyContent:"center" });
  const pie = (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, flexWrap:"wrap", padding:"10px 14px", borderTop:`1px solid ${B.border}`, background:"#FBFCFE", fontSize:12, color:B.textSec }}>
      <span>{total===0 ? `Sin ${nombre}` : <>Mostrando <b style={{ color:B.textPri }}>{(p-1)*tam+1}–{Math.min(p*tam,total)}</b> de <b style={{ color:B.textPri }}>{total.toLocaleString("en-US")}</b> {nombre}</>}</span>
      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
        <span>Filas</span>
        <select value={tam} onChange={e=>{ setTam(parseInt(e.target.value)); setPag(1); }} aria-label="Filas por página"
          style={{ ...inp, width:"auto", padding:"5px 8px", fontSize:12, background:B.white }}>
          {[25,50,100,200].map(n=><option key={n} value={n}>{n}</option>)}
        </select>
        <button style={btn(p<=1)} disabled={p<=1} onClick={()=>setPag(p-1)} aria-label="Página anterior"><Ico n="chevleft" size={15}/></button>
        <span style={{ minWidth:64, textAlign:"center" }}>Pág. <b style={{ color:B.textPri }}>{p}</b> de {paginas}</span>
        <button style={btn(p>=paginas)} disabled={p>=paginas} onClick={()=>setPag(p+1)} aria-label="Página siguiente"><Ico n="chevright" size={15}/></button>
      </div>
    </div>
  );
  return { visibles, pie, irA:setPag };
}

// Glosario: explicación corta de los conceptos propios del ERP. Se usa en los tooltips (?) y en Primeros pasos.
export const GLOSARIO = {
  ambito: ["Ámbito", "Zona de Lima donde se entrega: Urbano (centro), Semi urbano o Periférico. Define la tarifa base del pedido. El distrito decide el ámbito."],
  tamano: ["Tamaño", "Banda de peso del paquete: XS hasta 1 kg, S hasta 3 kg, M hasta 7 kg. Sobre 7 kg se cobra un extra por kilo."],
  servicio: ["Tipo de servicio", "Same Day se entrega el mismo día; Next Day al día siguiente; Especial es un servicio cotizado aparte."],
  tracking: ["Tracking Boaz", "Código único que Boaz asigna a cada pedido. Es el que el destinatario usa para rastrear en la web."],
  orden: ["N° de orden", "Número con el que el cliente identifica el pedido en su propio sistema. Es opcional, pero ayuda a conciliar con él."],
  cod: ["Cobro en destino (COD)", "El repartidor cobra al destinatario al entregar. Ese dinero es del cliente: queda «sin rendir» hasta que el repartidor lo entrega a Boaz."],
  rendir: ["Rendir", "Entregar a Boaz el dinero cobrado en destino. Se registra en Cobranza → Contraentrega."],
  lote: ["Lote", "Grupo de pedidos cargados juntos desde un Excel. Permite asignarlos y rastrearlos como un conjunto."],
  geocodificar: ["Geocodificar", "Convertir la dirección escrita en un punto del mapa. Sin esto el pedido no aparece en el mapa del repartidor."],
  modalidad: ["Modalidad de cobro", "Cómo se le cobra al cliente: por pedido (cada entrega), por vehículo (unidad por día) o por viaje (recojo o ruta). Un cliente puede tener más de una."],
  modo_pedido: ["Forma de cobro por pedido", "Según tarifario (ámbito, servicio y peso), precio fijo por pedido, o tarifa por distrito. Se define en Clientes → «Cómo se cobra»."],
  embalaje: ["Recargo por embalaje", "Monto extra que se suma solo a los pedidos marcados como «requiere embalaje» (por ejemplo, pedidos de agencia)."],
  tarifa_dia: ["Tarifa por día", "Lo que se cobra por cada día que una unidad trabaja para el cliente. Se multiplica por los días del calendario de servicio."],
  recargo_periferico: ["Recargo periférico", "Monto adicional a la tarifa por día cuando la unidad trabaja en zona periférica."],
  recargo_feriado: ["Recargo por feriado", "Porcentaje que se suma a la tarifa por día cuando un día de servicio cae en feriado oficial de Perú."],
  prefacturacion: ["Pre-facturación", "Resumen de todo lo que se le cobra a un cliente en un período (pedidos, unidades, servicios). Sirve para revisar y acordar antes de emitir la factura."],
  detraccion: ["Detracción", "Porcentaje de la factura que el cliente deposita en la cuenta de detracciones del Banco de la Nación, no a Boaz. El neto a cobrar es el total menos la detracción."],
  igv: ["IGV", "Impuesto General a las Ventas (18%). Las tarifas del ERP son sin IGV; se suma al facturar."],
  liquidacion_rep: ["Liquidación de repartidor", "Cálculo de lo que Boaz le paga a un repartidor por un período, según sus entregas o su sueldo fijo."],
  liquidacion_cliente: ["Liquidación formato Boaz", "Documento Excel con el formato oficial de Boaz que se envía al cliente como sustento de la factura."],
  servicio_cotizado: ["Servicio cotizado", "Trabajo eventual con precio acordado en el momento (una unidad exclusiva, entregas extra). Se registra en Viajes y servicios con su referencia."],
  asignacion: ["Asignación de unidad", "Vínculo entre una unidad de la flota y un cliente, con fecha de inicio, tarifa por día y calendario de días trabajados."],
  calendario: ["Calendario de servicio", "Días exactos en que la unidad trabajó para el cliente. Si no se registra, el ERP estima por el rango de fechas."],
  antiguedad: ["Antigüedad", "Días desde que se emitió la factura. A más días sin cobrar, más urgente el seguimiento."],
  margen: ["Margen", "Ingresos sin IGV menos egresos (gastos, pagos a repartidores, planilla y terceros)."],
  efectividad: ["Efectividad", "Porcentaje de pedidos entregados sobre el total de pedidos finalizados (entregados + no entregados)."],
  rol: ["Rol", "Define qué módulos puede ver cada usuario: admin ve todo; operaciones y finanzas ven solo lo suyo. Se ajusta en Roles y permisos."],
  modo_pago_rep: ["Modo de pago del repartidor", "Por pedido (una tarifa por cada entrega) o sueldo fijo mensual. Define cómo se calcula su liquidación."],
};
// Botón (?) con explicación al pasar el mouse o enfocar. Se usa junto a etiquetas y encabezados.
export function Ayuda({ k, texto, size=14, derecha }) {
  const g = k && GLOSARIO[k];
  const t = texto || (g && g[1]);
  const [pos, setPos] = useState("");
  if (!t) return null;
  // Si está cerca del borde superior o derecho, el texto se abre hacia abajo o a la izquierda
  const ubicar = (e) => { const r = e.currentTarget.getBoundingClientRect(); setPos((r.top<120?" bz-ayuda-abajo":"")+(derecha||r.right>window.innerWidth-150?" bz-ayuda-der":"")); };
  return (
    <span className={"bz-ayuda"+pos} tabIndex={0} role="img" aria-label={t} onMouseEnter={ubicar} onFocus={ubicar}>
      <Ico n="help" size={size}/>
      <span className="bz-ayuda-txt">{g && <b style={{ display:"block", color:"#FFB347", marginBottom:3 }}>{g[0]}</b>}{t}</span>
    </span>
  );
}

// Título de sección dentro de una pantalla
export function SeccionTitulo({ children, nota }) {
  return <div style={{ fontSize:13, fontWeight:700, color:B.textPri, margin:"0 0 10px" }}>{children}{nota && <span style={{ fontWeight:400, color:B.textMut }}> · {nota}</span>}</div>;
}

// ── BÚSQUEDA GLOBAL (Ctrl+K) ──────────────────────────────────
export function PaletaComandos({ onCerrar, onIr, modulos, pedidos, empresas, unidades, repartidores }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const ref = useRef(null);
  useEffect(() => { ref.current && ref.current.focus(); }, []);
  const norm = (t) => (t||"").toString().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"");
  const resultados = useMemo(() => {
    const t = norm(q).trim();
    const out = [];
    modulos.filter(m => !t || norm(m.label).includes(t) || norm(m.grupo).includes(t)).slice(0, t?6:20)
      .forEach(m => out.push({ k:"m"+m.id, tipo:"Módulo", titulo:m.label, sub:m.grupo, icono:m.icon, ir:m.id }));
    if (t.length >= 2) {
      empresas.filter(e => norm(e.nombre).includes(t) || norm(e.ruc).includes(t)).slice(0,5)
        .forEach(e => out.push({ k:"e"+e.id, tipo:"Cliente", titulo:e.nombre, sub:e.ruc?`RUC ${e.ruc}`:"", icono:"building", ir:"clientes" }));
      repartidores.filter(r => norm(`${r.nombres} ${r.apellidos} ${r.placa||""}`).includes(t)).slice(0,5)
        .forEach(r => out.push({ k:"r"+r.id, tipo:"Repartidor", titulo:`${r.nombres||""} ${r.apellidos||""}`.trim(), sub:r.placa||r.vehiculo||"", icono:"bike", ir:"repartidores" }));
      unidades.filter(u => norm(`${u.placa} ${u.conductor_nombre||""}`).includes(t)).slice(0,5)
        .forEach(u => out.push({ k:"u"+u.id, tipo:"Unidad", titulo:u.placa, sub:u.conductor_nombre||u.tipo_vehiculo||"", icono:"truck", ir:"unidades" }));
      pedidos.filter(p => norm(`${p.omd} ${p.cliente_referencia||""} ${p.dest_nombre||""}`).includes(t)).slice(0,6)
        .forEach(p => out.push({ k:"p"+p.id, tipo:"Pedido", titulo:p.omd||"(sin tracking)", sub:`${p.dest_nombre||""}${p.cliente_referencia?` · ${p.cliente_referencia}`:""}`, icono:"package", ir:"pedidos" }));
    }
    return out;
  }, [q, modulos, pedidos, empresas, unidades, repartidores]);
  useEffect(() => { setSel(0); }, [q]);
  const onKey = (e) => {
    if (e.key==="Escape") onCerrar();
    else if (e.key==="ArrowDown") { e.preventDefault(); setSel(s => Math.min(s+1, resultados.length-1)); }
    else if (e.key==="ArrowUp") { e.preventDefault(); setSel(s => Math.max(s-1, 0)); }
    else if (e.key==="Enter" && resultados[sel]) { onIr(resultados[sel].ir); onCerrar(); }
  };
  return (
    <div onClick={onCerrar} style={{ position:"fixed", inset:0, background:"#0D1E3D88", zIndex:3000, display:"flex", justifyContent:"center", alignItems:"flex-start", paddingTop:"12vh" }}>
      <div onClick={e=>e.stopPropagation()} style={{ width:560, maxWidth:"92vw", background:B.white, borderRadius:16, boxShadow:"0 24px 70px #0008", overflow:"hidden", animation:"bz-pop .15s ease-out" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, padding:"14px 18px", borderBottom:`1px solid ${B.border}` }}>
          <Ico n="search" size={18} color={B.textMut}/>
          <input ref={ref} value={q} onChange={e=>setQ(e.target.value)} onKeyDown={onKey}
            placeholder="Buscar módulo, pedido, cliente, repartidor o placa…"
            style={{ flex:1, border:"none", outline:"none", fontSize:15, background:"transparent", color:B.textPri, padding:0, boxShadow:"none" }}/>
          <span style={{ fontSize:10, color:B.textMut, border:`1px solid ${B.border}`, borderRadius:6, padding:"2px 6px" }}>Esc</span>
        </div>
        <div style={{ maxHeight:"50vh", overflowY:"auto", padding:8 }}>
          {resultados.length===0 && <div style={{ padding:24, textAlign:"center", color:B.textMut, fontSize:13 }}>Sin resultados</div>}
          {resultados.map((r,i) => (
            <div key={r.k} onClick={()=>{ onIr(r.ir); onCerrar(); }} onMouseEnter={()=>setSel(i)}
              style={{ display:"flex", alignItems:"center", gap:12, padding:"9px 12px", borderRadius:10, cursor:"pointer",
                background: i===sel ? `${B.gold}18` : "transparent" }}>
              <div style={{ width:32, height:32, borderRadius:8, background:B.bg, color:B.navy, display:"flex", alignItems:"center", justifyContent:"center" }}><Ico n={r.icono} size={16}/></div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13, fontWeight:600, color:B.textPri, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{r.titulo}</div>
                {r.sub && <div style={{ fontSize:11, color:B.textMut, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{r.sub}</div>}
              </div>
              <span style={{ fontSize:10, fontWeight:700, color:B.textSec, background:B.bg, borderRadius:6, padding:"2px 8px" }}>{r.tipo}</span>
            </div>
          ))}
        </div>
        <div style={{ padding:"8px 16px", borderTop:`1px solid ${B.border}`, fontSize:11, color:B.textMut, display:"flex", gap:14 }}>
          <span>↑↓ navegar</span><span>Enter abrir</span><span style={{ marginLeft:"auto" }}>Ctrl + K</span>
        </div>
      </div>
    </div>
  );
}

