// ══════════════════════════════════════════════════════════════
// BOAZ APP — App móvil del repartidor (PWA)
// v3 — flujo asignado→en_ruta→entregado/no_entregado, evidencias
// fotográficas, GPS, historial de contactos, cola offline,
// liquidación COD
// ══════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

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

const MOTIVOS_NO_ENTREGA = [
  "Cliente ausente",
  "Dirección incorrecta / no ubicable",
  "Rechazado por el cliente",
  "Cliente reprogramó entrega",
  "Zona de riesgo / acceso restringido",
  "Producto dañado",
  "Documentación incompleta",
  "Otro",
];

const fmt = {
  fecha: (d) => {
    if (!d) return "—";
    const str = typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d+"T00:00:00" : d;
    return new Date(str).toLocaleDateString("es-PE",{day:"numeric",month:"short"});
  },
  hora:  (d) => d ? new Date(d).toLocaleTimeString("es-PE",{hour:"2-digit",minute:"2-digit"}) : "",
  fechaHora: (d) => d ? new Date(d).toLocaleString("es-PE",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}) : "",
};

const ICONOS_HIST = {
  llamada:"📞", whatsapp:"💬", estado:"🔄",
  foto_entrega:"📸", foto_no_entrega:"📸",
};

// ── HELPERS: GPS, COMPRESIÓN, COLA OFFLINE ─────────────────────
function obtenerGPS() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 15000 }
    );
  });
}

function comprimirImagen(file, maxWidth = 900, calidad = 0.72) {
  return new Promise((resolve, reject) => {
    const limite = setTimeout(() => {
      reject(new Error("La foto tardó demasiado en procesarse. Intenta con otra foto o revisa tu conexión."));
    }, 20000);

    const reader = new FileReader();
    reader.onerror = () => {
      clearTimeout(limite);
      reject(new Error("No se pudo leer el archivo de la foto."));
    };
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => {
        clearTimeout(limite);
        reject(new Error("La foto está dañada o en un formato no compatible. Vuelve a tomarla."));
      };
      img.onload = () => {
        try {
          const scale = Math.min(1, maxWidth / img.width);
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          canvas.toBlob((blob) => {
            clearTimeout(limite);
            if (blob) resolve(blob);
            else reject(new Error("No se pudo comprimir la foto."));
          }, "image/jpeg", calidad);
        } catch (err) {
          clearTimeout(limite);
          reject(err);
        }
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function blobToBase64(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

async function base64ToBlob(base64) {
  const r = await fetch(base64);
  return r.blob();
}

const QUEUE_KEY = "boaz_pending_sync_v1";
function leerCola() {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]"); }
  catch { return []; }
}
function guardarCola(q) { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); }
function encolar(accion) {
  const q = leerCola();
  q.push({ ...accion, _id: Date.now() + "_" + Math.random().toString(36).slice(2) });
  guardarCola(q);
  return q.length;
}

async function subirFotosYUrls(pedidoId, tipoEvento, blobsOBase64) {
  const subidas = blobsOBase64.map(async (blob, i) => {
    if (typeof blob === "string") blob = await base64ToBlob(blob);
    const path = `${pedidoId}/${tipoEvento}_${Date.now()}_${i}_${Math.random().toString(36).slice(2,6)}.jpg`;
    const { error } = await sb.storage.from("evidencias").upload(path, blob, { upsert: true, contentType: "image/jpeg" });
    if (error) throw error;
    const { data } = sb.storage.from("evidencias").getPublicUrl(path);
    return data.publicUrl;
  });
  return Promise.all(subidas);
}

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

// Guarda un cambio de estado (entregado / no_entregado) con sus fotos y GPS.
// Intenta online primero; si falla, encola en localStorage (con las fotos
// ya comprimidas en base64) para sincronizar cuando vuelva la conexión.
function pareceProblemaDeConexion(e) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const msg = (e?.message || "").toLowerCase();
  return /network|fetch|failed to fetch|conexi[oó]n|internet|timeout/.test(msg);
}

async function guardarEvidenciaYEstado({ pedidoId, nuevoEstado, fotosFiles, motivo, responsable, recibidoPor, comentario }) {
  const [gpsPos, comprimidas] = await Promise.all([
    obtenerGPS(),
    Promise.all(fotosFiles.map(f => comprimirImagen(f.file))),
  ]);
  const timestamp = new Date().toISOString();

  const payload = { estado: nuevoEstado };
  if (nuevoEstado === "entregado") {
    payload.fecha_entrega = timestamp;
    payload.recibido_por = recibidoPor;
    payload.comentario_entrega = comentario || null;
  }
  if (nuevoEstado === "no_entregado") {
    payload.motivo_no_entrega = motivo;
    payload.comentario_no_entrega = comentario || null;
  }
  const tipoEvento = nuevoEstado === "entregado" ? "foto_entrega" : "foto_no_entrega";
  const detalleEvento = nuevoEstado === "entregado"
    ? `Entregado a ${recibidoPor}${comentario ? " — "+comentario : ""}`
    : `No entregado: ${motivo}${comentario ? " — "+comentario : ""}`;

  try {
    const urls = await subirFotosYUrls(pedidoId, tipoEvento, comprimidas);
    const eventos = [
      { tipo: "estado", detalle: detalleEvento, timestamp, lat: gpsPos?.lat, lng: gpsPos?.lng },
      ...urls.map((u) => ({ tipo: tipoEvento, url: u, timestamp, lat: gpsPos?.lat, lng: gpsPos?.lng })),
    ];
    const { data: actual } = await sb.from("pedidos").select("historial").eq("id", pedidoId).single();
    const historialActual = actual?.historial || [];
    const { error } = await sb.from("pedidos").update({
      ...payload,
      historial: [...historialActual, ...eventos],
    }).eq("id", pedidoId);
    if (error) throw error;
    return { ok: true, offline: false };
  } catch (e) {
    if (!pareceProblemaDeConexion(e)) {
      // No parece un problema de conexión real — no lo escondemos en la cola
      // offline. Dejamos que el error real llegue a quien llamó esta función.
      throw e;
    }
    const fotosBase64 = [];
    for (const blob of comprimidas) fotosBase64.push(await blobToBase64(blob));
    encolar({
      tipo: "evidencia", pedidoId, payload, tipoEvento, detalleEvento,
      timestamp, lat: gpsPos?.lat, lng: gpsPos?.lng, fotosBase64,
    });
    return { ok: true, offline: true };
  }
}

async function registrarContacto(pedidoId, tipo) {
  const gpsPos = await obtenerGPS();
  const evento = { tipo, timestamp: new Date().toISOString(), lat: gpsPos?.lat, lng: gpsPos?.lng };
  try {
    const { data: actual } = await sb.from("pedidos").select("historial").eq("id", pedidoId).single();
    const historialActual = actual?.historial || [];
    const { error } = await sb.from("pedidos").update({ historial: [...historialActual, evento] }).eq("id", pedidoId);
    if (error) throw error;
  } catch (e) {
    encolar({ tipo: "contacto", pedidoId, evento });
  }
}

async function iniciarRutaMasivo(pedidoIds) {
  const gpsPos = await obtenerGPS();
  const timestamp = new Date().toISOString();
  const payload = { estado: "en_ruta", fecha_inicio_ruta: timestamp };
  try {
    const { error } = await sb.from("pedidos").update(payload).in("id", pedidoIds);
    if (error) throw error;
    return { ok: true, offline: false };
  } catch (e) {
    encolar({ tipo: "iniciar_ruta", pedidoIds, payload, timestamp, lat: gpsPos?.lat, lng: gpsPos?.lng });
    return { ok: true, offline: true };
  }
}

// ── RUTEO: distancia y vecino más cercano ──────────────────────
function distanciaKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2-lat1) * Math.PI/180;
  const dLng = (lng2-lng1) * Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// Ordena por vecino más cercano partiendo del origen (GPS del repartidor).
// Requiere que TODOS los pedidos tengan dest_lat/dest_lng.
function rutaPorVecinoCercano(pedidos, origen) {
  const restantes = [...pedidos];
  const ruta = [];
  let actual = origen;
  while (restantes.length) {
    let mejorIdx = 0, mejorDist = Infinity;
    restantes.forEach((p,i) => {
      const d = distanciaKm(actual.lat, actual.lng, p.dest_lat, p.dest_lng);
      if (d < mejorDist) { mejorDist = d; mejorIdx = i; }
    });
    const siguiente = restantes.splice(mejorIdx,1)[0];
    ruta.push(siguiente);
    actual = { lat: siguiente.dest_lat, lng: siguiente.dest_lng };
  }
  return ruta;
}

// Ruteo automático: usa GPS+coordenadas si están disponibles (óptimo real);
// si faltan coordenadas, agrupa por distrito/dirección (aproximación básica).
async function calcularRutaAutomatica(pedidos) {
  const todosConCoords = pedidos.every(p => p.dest_lat && p.dest_lng);
  if (todosConCoords) {
    const gps = await obtenerGPS();
    if (gps) {
      return { ruta: rutaPorVecinoCercano(pedidos, gps), optimo: true };
    }
  }
  const ordenados = [...pedidos].sort((a,b) =>
    (a.dest_distrito||"").localeCompare(b.dest_distrito||"") ||
    (a.dest_direccion||"").localeCompare(b.dest_direccion||"")
  );
  return { ruta: ordenados, optimo: false };
}

async function guardarOrdenRuta(pedidosEnOrden) {
  await Promise.all(pedidosEnOrden.map((p, i) =>
    sb.from("pedidos").update({ orden_ruta: i }).eq("id", p.id)
  ));
}

async function procesarCola() {
  const q = leerCola();
  if (!q.length) return { ok: 0, fail: 0 };
  const restantes = [];
  let ok = 0;
  for (const accion of q) {
    try {
      if (accion.tipo === "iniciar_ruta") {
        const { error } = await sb.from("pedidos").update(accion.payload).in("id", accion.pedidoIds);
        if (error) throw error;
        ok++;
        continue;
      }
      if (accion.tipo === "contacto") {
        const { data: actual } = await sb.from("pedidos").select("historial").eq("id", accion.pedidoId).single();
        const historialActual = actual?.historial || [];
        const { error } = await sb.from("pedidos").update({ historial: [...historialActual, accion.evento] }).eq("id", accion.pedidoId);
        if (error) throw error;
        ok++;
        continue;
      }
      if (accion.tipo === "evidencia") {
        const urls = await subirFotosYUrls(accion.pedidoId, accion.tipoEvento, accion.fotosBase64 || []);
        const eventos = [
          { tipo: "estado", detalle: accion.detalleEvento, timestamp: accion.timestamp, lat: accion.lat, lng: accion.lng },
          ...urls.map((u) => ({ tipo: accion.tipoEvento, url: u, timestamp: accion.timestamp, lat: accion.lat, lng: accion.lng })),
        ];
        const { data: actual } = await sb.from("pedidos").select("historial").eq("id", accion.pedidoId).single();
        const historialActual = actual?.historial || [];
        const { error } = await sb.from("pedidos").update({
          ...accion.payload,
          historial: [...historialActual, ...eventos],
        }).eq("id", accion.pedidoId);
        if (error) throw error;
        ok++;
        continue;
      }
      restantes.push(accion); // tipo desconocido, no se pierde
    } catch (e) {
      restantes.push(accion);
    }
  }
  guardarCola(restantes);
  return { ok, fail: restantes.length };
}

// ── PANTALLA LOGIN ─────────────────────────────────────────────
function Login({ onLogin }) {
  const [usuario, setUsuario] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  const entrar = async () => {
    if (!usuario.trim() || !pin.trim()) { setError("Ingresa tu usuario y PIN"); return; }
    setCargando(true); setError("");
    const { data, error: err } = await sb.rpc("verificar_login_repartidor", {
      p_usuario: usuario.trim(), p_pin: pin.trim(),
    });
    setCargando(false);
    if (err || !data || data.length===0) { setError("Usuario o PIN incorrecto"); return; }
    onLogin(data[0]);
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
          Portal Repartidor
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
          ¿Problemas? Llama a Boaz: +51 960 622 471
        </div>
      </div>
    </div>
  );
}

// ── COMPONENTE: CAPTURA DE FOTOS ───────────────────────────────
function CapturaFotos({ fotos, setFotos, minimo = 2, label = "Evidencias" }) {
  const inputCamara = useRef();
  const inputGaleria = useRef();
  const [procesando, setProcesando] = useState(false);
  const agregarFoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setProcesando(true);
    const archivoFinal = await convertirSiEsHeic(file);
    setProcesando(false);
    setFotos(prev => [...prev, { file: archivoFinal, preview: URL.createObjectURL(archivoFinal), rota:false }]);
  };
  const marcarRota = (i) => setFotos(prev => prev.map((f,idx)=> idx===i ? { ...f, rota:true } : f));
  const quitar = (i) => setFotos(prev => prev.filter((_,idx)=>idx!==i));
  const completo = fotos.length >= minimo;
  const hayRotas = fotos.some(f=>f.rota);

  return (
    <div>
      <div style={{ fontSize:11, fontWeight:700, color: completo?C.green:C.navy,
        textTransform:"uppercase", marginBottom:8 }}>
        📷 {label} — {fotos.length}/{minimo} mínimo {completo && "✓"}
      </div>
      <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:10 }}>
        {fotos.map((f,i)=>(
          <div key={i} style={{ position:"relative", width:70, height:70 }}>
            {f.rota ? (
              <div style={{ width:70, height:70, borderRadius:8, border:`2px solid ${C.red}`,
                background:"#FEF2F2", display:"flex", alignItems:"center", justifyContent:"center",
                fontSize:22 }}>⚠️</div>
            ) : (
              <img src={f.preview} alt="" onError={()=>marcarRota(i)}
                style={{ width:70, height:70, objectFit:"cover",
                borderRadius:8, border:"1px solid #E2E8F0" }}/>
            )}
            <button onClick={()=>quitar(i)} style={{ position:"absolute", top:-6, right:-6,
              width:20, height:20, borderRadius:"50%", background:C.red, color:"#fff",
              border:"none", fontSize:11, cursor:"pointer", lineHeight:"20px" }}>×</button>
          </div>
        ))}
      </div>
      {hayRotas && (
        <div style={{ fontSize:11, color:C.red, marginBottom:8, fontWeight:600 }}>
          ⚠️ Una o más fotos no cargaron bien. Quítalas (×) y vuelve a tomarlas antes de guardar.
        </div>
      )}
      {procesando && (
        <div style={{ fontSize:11, color:C.gold, marginBottom:8, fontWeight:600 }}>
          ⏳ Procesando foto...
        </div>
      )}
      <div style={{ display:"flex", gap:8, marginBottom:6 }}>
        <button onClick={()=>inputCamara.current?.click()}
          style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:6,
            padding:"12px 10px", borderRadius:10, border:`2px dashed ${C.gold}`,
            background:"#FFF8EF", color:C.goldDk, fontSize:13, fontWeight:700, cursor:"pointer" }}>
          📸 Tomar foto
        </button>
        <button onClick={()=>inputGaleria.current?.click()}
          style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:6,
            padding:"12px 10px", borderRadius:10, border:`2px dashed ${C.navyLt}`,
            background:"#F0F4F8", color:C.navy, fontSize:13, fontWeight:700, cursor:"pointer" }}>
          🖼️ Subir de galería
        </button>
        <input ref={inputCamara} type="file" accept="image/*" capture="environment"
          style={{display:"none"}} onChange={agregarFoto}/>
        <input ref={inputGaleria} type="file" accept="image/*"
          style={{display:"none"}} onChange={agregarFoto}/>
      </div>
      {!completo && (
        <div style={{ fontSize:11, color:C.textMut }}>Toma o sube al menos {minimo} fotos para continuar.</div>
      )}
    </div>
  );
}

// ── PANTALLA INICIO ───────────────────────────────────────────
// ── PANTALLA: ORDENAR MI RUTA (arrastre táctil + automático) ──
const ALTO_FILA = 68;

function OrdenarRuta({ pedidosIniciales, onVolver, onGuardado, toast }) {
  const [orden, setOrden] = useState(pedidosIniciales);
  const [arrastreId, setArrastreId] = useState(null);
  const [offsetY, setOffsetY] = useState(0);
  const [guardando, setGuardando] = useState(false);
  const [calculando, setCalculando] = useState(false);
  const startYRef = useRef(0);
  const indexInicialRef = useRef(0);

  const onPointerDown = (e, id, index) => {
    startYRef.current = e.clientY;
    indexInicialRef.current = index;
    setOffsetY(0);
    setArrastreId(id);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (arrastreId==null) return;
    const delta = e.clientY - startYRef.current;
    setOffsetY(delta);
    const desplazamiento = Math.round(delta / ALTO_FILA);
    const idxActual = orden.findIndex(p=>p.id===arrastreId);
    const idxObjetivo = Math.min(orden.length-1, Math.max(0, indexInicialRef.current + desplazamiento));
    if (idxObjetivo !== idxActual) {
      setOrden(prev => {
        const nuevo = [...prev];
        const [item] = nuevo.splice(idxActual,1);
        nuevo.splice(idxObjetivo,0,item);
        return nuevo;
      });
    }
  };
  const onPointerUp = () => { setArrastreId(null); setOffsetY(0); };

  const ejecutarAutomatico = async () => {
    setCalculando(true);
    const { ruta, optimo } = await calcularRutaAutomatica(orden);
    setOrden(ruta);
    setCalculando(false);
    toast(optimo
      ? "Ruta calculada según tu ubicación y la distancia a cada destino ✓"
      : "Ordenado por zona/dirección — faltan coordenadas para un ruteo 100% óptimo","warn");
  };

  const guardar = async () => {
    setGuardando(true);
    await guardarOrdenRuta(orden);
    setGuardando(false);
    toast("Orden de ruta guardado ✓");
    onGuardado(orden);
  };

  return (
    <div style={{ padding:16 }}>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:16 }}>
        <button onClick={onVolver}
          style={{ background:C.white, border:`1px solid #E2E8F0`,
            color:C.textSec, padding:"8px 14px", borderRadius:10,
            fontSize:13, cursor:"pointer", fontWeight:600 }}>← Volver</button>
        <div style={{ fontSize:16, fontWeight:800, color:C.navy }}>🗺️ Ordenar mi ruta</div>
      </div>

      <div style={{ fontSize:12, color:C.textMut, marginBottom:14 }}>
        Arrastra ⠿ para reordenar manualmente, o usa el ruteo automático.
      </div>

      <button onClick={ejecutarAutomatico} disabled={calculando}
        style={{ width:"100%", background:`linear-gradient(135deg,#7C3AED,#6D28D9)`,
          color:C.white, border:"none", padding:14, borderRadius:12,
          fontSize:14, fontWeight:800, cursor: calculando?"default":"pointer",
          marginBottom:16 }}>
        {calculando ? "Calculando..." : "🎯 Ruteo automático"}
      </button>

      <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:16 }}>
        {orden.map((p,i)=>{
          const esArrastrado = p.id===arrastreId;
          return (
            <div key={p.id}
              style={{ display:"flex", alignItems:"center", gap:10,
                background:C.white, borderRadius:12, padding:"10px 12px",
                border:`1px solid #E2E8F0`, height:ALTO_FILA-14,
                position:"relative",
                transform: esArrastrado ? `translateY(${offsetY}px)` : "none",
                zIndex: esArrastrado?10:1,
                boxShadow: esArrastrado?"0 8px 20px #0003":"0 1px 3px #0D1E3D0A",
                transition: esArrastrado?"none":"transform 0.15s" }}>
              <div onPointerDown={(e)=>onPointerDown(e,p.id,i)}
                onPointerMove={onPointerMove} onPointerUp={onPointerUp}
                style={{ cursor:"grab", fontSize:20, color:C.textMut, padding:"4px 6px",
                  touchAction:"none", userSelect:"none" }}>⠿</div>
              <div style={{ width:24, height:24, borderRadius:"50%", background:C.gold,
                color:C.navy, fontWeight:800, fontSize:12, display:"flex",
                alignItems:"center", justifyContent:"center", flexShrink:0 }}>{i+1}</div>
              <div style={{ flex:1, overflow:"hidden" }}>
                <div style={{ fontSize:13, fontWeight:700, color:C.navy,
                  whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                  {p.omd} · {p.dest_nombre}
                </div>
                <div style={{ fontSize:11, color:C.textMut,
                  whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                  {p.dest_distrito}{!p.dest_lat && " · sin coordenadas"}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <button onClick={guardar} disabled={guardando}
        style={{ width:"100%", background:`linear-gradient(135deg,${C.green},#059669)`,
          color:C.white, border:"none", padding:16, borderRadius:12,
          fontSize:15, fontWeight:800, cursor: guardando?"default":"pointer" }}>
        {guardando ? "Guardando..." : "💾 Guardar orden de ruta"}
      </button>
    </div>
  );
}

// ── PANTALLA: MAPA DE MI RUTA (Leaflet + OpenStreetMap, gratuito) ──
function cargarLeaflet() {
  return new Promise((resolve) => {
    if (window.L) { resolve(window.L); return; }
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(link);
    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.onload = () => resolve(window.L);
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });
}

// ── Conversión HEIC/HEIF → JPEG ─────────────────────────────────
// Algunos celulares (sobre todo Samsung/Xiaomi con "formato eficiente"
// activado) guardan las fotos de galería en formato HEIC/HEIF, que los
// navegadores no pueden mostrar directamente. Lo convertimos a JPEG
// automáticamente al seleccionarlas.
function cargarHeic2Any() {
  return new Promise((resolve) => {
    if (window.heic2any) { resolve(window.heic2any); return; }
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js";
    script.onload = () => resolve(window.heic2any);
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });
}

function esPosibleHeic(file) {
  const tipo = (file.type || "").toLowerCase();
  const nombre = (file.name || "").toLowerCase();
  return tipo.includes("heic") || tipo.includes("heif") ||
    nombre.endsWith(".heic") || nombre.endsWith(".heif");
}

// Si el archivo es HEIC/HEIF, lo convierte a JPEG. Si no, lo devuelve tal cual.
async function convertirSiEsHeic(file) {
  if (!esPosibleHeic(file)) return file;
  const heic2any = await cargarHeic2Any();
  if (!heic2any) return file; // si no cargó la librería, seguimos con el original (fallará más claro después)
  try {
    const resultado = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.85 });
    const blob = Array.isArray(resultado) ? resultado[0] : resultado;
    return new File([blob], (file.name||"foto").replace(/\.(heic|heif)$/i, ".jpg"), { type: "image/jpeg" });
  } catch (e) {
    return file; // si falla la conversión, seguimos con el original
  }
}

function MapaRuta({ pedidos, onVolver, onVerPedido }) {
  const mapaRef = useRef(null);
  const contenedorRef = useRef(null);
  const [cargando, setCargando] = useState(true);
  const [errorMapa, setErrorMapa] = useState("");

  const pedidosNumerados = pedidos.map((p,i) => ({ ...p, _num: i+1 }));
  const conCoords = pedidosNumerados.filter(p => p.dest_lat && p.dest_lng);
  const sinCoords = pedidos.length - conCoords.length;

  useEffect(() => {
    let activo = true;
    (async () => {
      const L = await cargarLeaflet();
      if (!L) { setErrorMapa("No se pudo cargar el mapa. Verifica tu conexión a internet."); setCargando(false); return; }
      const gps = await obtenerGPS();
      if (!activo || !contenedorRef.current) return;

      const centro = gps ? [gps.lat, gps.lng]
        : conCoords.length ? [conCoords[0].dest_lat, conCoords[0].dest_lng]
        : [-12.0464, -77.0428]; // Lima, por defecto

      const mapa = L.map(contenedorRef.current).setView(centro, 13);
      mapaRef.current = mapa;
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
      }).addTo(mapa);

      if (gps) {
        L.circleMarker([gps.lat, gps.lng], { radius:9, color:"#fff", weight:3,
          fillColor:"#7C3AED", fillOpacity:1 }).addTo(mapa).bindPopup("📍 Tú estás aquí");
      }

      const bounds = [];
      if (gps) bounds.push([gps.lat, gps.lng]);
      conCoords.forEach((p) => {
        const color = p.estado==="entregado" ? "#10B981" : p.estado==="no_entregado" ? "#EF4444" : "#E87722";
        const icono = L.divIcon({
          html: `<div style="background:${color};color:#fff;border-radius:50%;width:26px;height:26px;
            display:flex;align-items:center;justify-content:center;font-weight:800;font-size:12px;
            border:2px solid #fff;box-shadow:0 2px 6px #0004;">${p._num}</div>`,
          className: "", iconSize:[26,26], iconAnchor:[13,13],
        });
        L.marker([p.dest_lat, p.dest_lng], { icon: icono }).addTo(mapa)
          .on("click", () => onVerPedido(p));
        bounds.push([p.dest_lat, p.dest_lng]);
      });

      if (bounds.length > 1) mapa.fitBounds(bounds, { padding:[40,40] });
      setCargando(false);
    })();
    return () => { if (mapaRef.current) { mapaRef.current.remove(); mapaRef.current = null; } activo = false; };
  }, []);

  return (
    <div style={{ padding:16 }}>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:14 }}>
        <button onClick={onVolver}
          style={{ background:C.white, border:`1px solid #E2E8F0`,
            color:C.textSec, padding:"8px 14px", borderRadius:10,
            fontSize:13, cursor:"pointer", fontWeight:600 }}>← Volver</button>
        <div style={{ fontSize:16, fontWeight:800, color:C.navy }}>🗺️ Mapa de mi ruta</div>
      </div>

      {sinCoords > 0 && (
        <div style={{ background:"#FFFBEB", border:"1px solid #FDE68A", borderRadius:10,
          padding:"10px 14px", marginBottom:12, fontSize:12, color:"#92400E", fontWeight:600 }}>
          ⚠️ {sinCoords} pedido{sinCoords===1?"":"s"} sin coordenadas — no se muestra{sinCoords===1?"":"n"} en el mapa.
        </div>
      )}
      {conCoords.length > 0 && (
        <div style={{ fontSize:11, color:C.textMut, marginBottom:10 }}>
          👆 Toca un punto en el mapa para ver el detalle de ese pedido.
        </div>
      )}

      <div style={{ position:"relative", borderRadius:14, overflow:"hidden",
        border:"1px solid #E2E8F0", height:420 }}>
        {cargando && (
          <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center",
            justifyContent:"center", background:C.bg, zIndex:10, fontSize:13, color:C.textMut }}>
            Cargando mapa...
          </div>
        )}
        {errorMapa && (
          <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center",
            justifyContent:"center", background:C.bg, zIndex:10, fontSize:13, color:C.red,
            textAlign:"center", padding:20 }}>
            {errorMapa}
          </div>
        )}
        <div ref={contenedorRef} style={{ width:"100%", height:"100%" }}/>
      </div>
    </div>
  );
}

// ── PANTALLA: RUTA FINALIZADA (mensaje de cierre del día) ──────
function PantallaFinalRuta({ resumen, repartidor, onCerrar }) {
  const fmtHora = (iso) => iso ? new Date(iso).toLocaleTimeString("es-PE",{hour:"2-digit",minute:"2-digit"}) : "—";
  const duracionMin = resumen.horaInicio && resumen.horaFin
    ? Math.round((new Date(resumen.horaFin) - new Date(resumen.horaInicio)) / 60000)
    : null;
  const horas = duracionMin!=null ? Math.floor(duracionMin/60) : null;
  const mins = duracionMin!=null ? duracionMin%60 : null;

  return (
    <div style={{ minHeight:"100vh", background:`linear-gradient(135deg,${C.navy},${C.navyLt})`,
      display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
      padding:24, textAlign:"center" }}>
      <div style={{ fontSize:64, marginBottom:16 }}>🎉</div>
      <div style={{ fontSize:22, fontWeight:900, color:"#E8EAF0", marginBottom:6 }}>
        ¡Buen trabajo, {repartidor.nombres}!
      </div>
      <div style={{ fontSize:14, color:C.textMut, marginBottom:28, maxWidth:280 }}>
        Terminaste tu ruta de hoy. Descansa, mañana volvemos 💪
      </div>

      <div style={{ background:C.navyMd, borderRadius:16, padding:24, width:"100%", maxWidth:320,
        border:"1px solid #1E3560", marginBottom:28 }}>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:20 }}>
          <div>
            <div style={{ fontSize:28, fontWeight:900, color:C.green }}>{resumen.entregados}</div>
            <div style={{ fontSize:10, color:C.textMut, textTransform:"uppercase" }}>Entregados</div>
          </div>
          <div>
            <div style={{ fontSize:28, fontWeight:900, color:C.red }}>{resumen.noEntregados}</div>
            <div style={{ fontSize:10, color:C.textMut, textTransform:"uppercase" }}>No entregados</div>
          </div>
        </div>
        <div style={{ borderTop:"1px solid #1E3560", paddingTop:16,
          display:"flex", justifyContent:"space-between", fontSize:12 }}>
          <div>
            <div style={{ color:C.textMut }}>Inicio</div>
            <div style={{ color:"#E8EAF0", fontWeight:700 }}>{fmtHora(resumen.horaInicio)}</div>
          </div>
          <div>
            <div style={{ color:C.textMut }}>Fin</div>
            <div style={{ color:"#E8EAF0", fontWeight:700 }}>{fmtHora(resumen.horaFin)}</div>
          </div>
          {duracionMin!=null && (
            <div>
              <div style={{ color:C.textMut }}>Duración</div>
              <div style={{ color:C.gold, fontWeight:700 }}>{horas}h {mins}m</div>
            </div>
          )}
        </div>
      </div>

      <button onClick={onCerrar}
        style={{ background:`linear-gradient(135deg,${C.gold},${C.goldDk})`,
          border:"none", color:C.navy, padding:"14px 32px", borderRadius:12,
          fontSize:14, fontWeight:800, cursor:"pointer" }}>
        Volver al inicio
      </button>
    </div>
  );
}

// Agrupa los pedidos "asignado" de un repartidor por lote (cada carga masiva
// es un lote). Devuelve qué se puede iniciar/mostrar ahora y qué queda en espera
// hasta que termine la ruta activa. Se usa igual en Inicio, Ordenar ruta y Mapa,
// para que los tres muestren siempre el mismo conjunto de pedidos.
function calcularPedidosActivos(pedidos, repartidorId, rutaActiva) {
  const misAsignados = pedidos.filter(p=>p.repartidor_id===repartidorId && p.estado==="asignado");
  const misEnRuta = pedidos.filter(p=>p.repartidor_id===repartidorId && p.estado==="en_ruta");

  const asignadosPorLote = {};
  misAsignados.forEach(p => {
    const key = p.lote_id || "_manual";
    (asignadosPorLote[key] = asignadosPorLote[key] || []).push(p);
  });
  const manuales = asignadosPorLote["_manual"] || [];
  const lotesReales = Object.keys(asignadosPorLote).filter(k=>k!=="_manual");

  let pedidosIniciables = [];
  let pedidosEnEspera = [];
  let loteAIniciar = null;
  if (!rutaActiva) {
    if (lotesReales.length > 0) {
      loteAIniciar = lotesReales.sort((a,b) => {
        const minA = Math.min(...asignadosPorLote[a].map(p=>new Date(p.created_at).getTime()));
        const minB = Math.min(...asignadosPorLote[b].map(p=>new Date(p.created_at).getTime()));
        return minA - minB;
      })[0];
      pedidosIniciables = [...manuales, ...asignadosPorLote[loteAIniciar]];
    } else {
      pedidosIniciables = manuales;
    }
  } else {
    pedidosIniciables = manuales;
    pedidosEnEspera = lotesReales.flatMap(k=>asignadosPorLote[k]);
  }

  const misP = [...misEnRuta, ...pedidosIniciables].sort((a,b) => {
    const oa = a.orden_ruta ?? 999999, ob = b.orden_ruta ?? 999999;
    return oa - ob;
  });

  return { misEnRuta, pedidosIniciables, pedidosEnEspera, loteAIniciar, misP };
}

function Inicio({ repartidor, pedidos, onVerPedido, onLogout, onIniciarRuta, iniciando, onOrdenarRuta, onVerMapa, rutaActiva, onFinalizarRuta }) {
  const [filtroLista, setFiltroLista] = useState("ruta");
  const hoy = new Date().toISOString().split("T")[0];
  const { misEnRuta, pedidosIniciables, pedidosEnEspera, loteAIniciar, misP } =
    calcularPedidosActivos(pedidos, repartidor.id, rutaActiva);
  const entregadosHoy = pedidos.filter(p=>
    p.repartidor_id===repartidor.id && p.estado==="entregado" && p.fecha_entrega?.startsWith(hoy)
  );
  const noEntregadosHoy = pedidos.filter(p=>
    p.repartidor_id===repartidor.id && p.estado==="no_entregado"
  );
  const listaActual = filtroLista==="ruta" ? misP : filtroLista==="entregados" ? entregadosHoy : noEntregadosHoy;

  return (
    <div style={{ padding:16 }}>
      <div style={{ background:`linear-gradient(135deg,${C.navy},${C.navyLt})`,
        borderRadius:16, padding:20, marginBottom:16,
        display:"flex", alignItems:"center", gap:14 }}>
        <div style={{ width:52, height:52, borderRadius:"50%",
          background:`linear-gradient(135deg,${C.gold},${C.goldDk})`,
          display:"flex", alignItems:"center", justifyContent:"center",
          fontSize:20, fontWeight:900, color:C.navy, flexShrink:0 }}>
          {repartidor.nombres?.[0]}{repartidor.apellidos?.[0]}
        </div>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:16, fontWeight:800, color:"#E8EAF0" }}>
            {repartidor.nombres} {repartidor.apellidos}
          </div>
          <div style={{ fontSize:11, color:C.textMut }}>
            <span style={{ color:C.green }}>● </span>En línea · {fmt.fecha(new Date().toISOString())}
          </div>
        </div>
        <button onClick={onLogout}
          style={{ background:"none", border:"1px solid #1E3560",
            color:C.textMut, padding:"6px 12px", borderRadius:8,
            fontSize:11, cursor:"pointer" }}>Salir</button>
      </div>

      {pedidosIniciables.length > 0 && (
        <button onClick={()=>onIniciarRuta(pedidosIniciables, loteAIniciar)}
          disabled={iniciando}
          style={{ width:"100%", background:`linear-gradient(135deg,#7C3AED,#6D28D9)`,
            color:C.white, border:"none", padding:16, borderRadius:14,
            fontSize:15, fontWeight:800, cursor: iniciando?"default":"pointer",
            marginBottom:16, boxShadow:"0 6px 16px #6D28D944" }}>
          {iniciando ? "Iniciando..." : `🚀 Iniciar Ruta (${pedidosIniciables.length} pedido${pedidosIniciables.length===1?"":"s"})`}
        </button>
      )}

      {pedidosEnEspera.length > 0 && (
        <div style={{ background:"#FFFBEB", border:"1px solid #FDE68A", borderRadius:12,
          padding:"10px 14px", marginBottom:16, fontSize:12, color:"#92400E", fontWeight:600 }}>
          📦 Tienes {pedidosEnEspera.length} pedido{pedidosEnEspera.length===1?"":"s"} de una nueva carga esperando — se habilitará{pedidosEnEspera.length===1?"":"n"} cuando termines tu ruta actual.
        </div>
      )}

      {misEnRuta.length===0 && rutaActiva && (
        <button onClick={onFinalizarRuta}
          style={{ width:"100%", background:`linear-gradient(135deg,${C.green},#059669)`,
            color:C.white, border:"none", padding:16, borderRadius:14,
            fontSize:15, fontWeight:800, cursor:"pointer",
            marginBottom:16, boxShadow:"0 6px 16px #10B98144" }}>
          🏁 Finalizar mi ruta de hoy
        </button>
      )}

      {misP.length > 1 && (
        <button onClick={onOrdenarRuta}
          style={{ width:"100%", background:C.white, border:`2px solid ${C.gold}`,
            color:C.goldDk, padding:12, borderRadius:14,
            fontSize:13, fontWeight:800, cursor:"pointer", marginBottom:10 }}>
          🗺️ Ordenar mi ruta ({misP.length} pedidos)
        </button>
      )}

      {misP.length > 0 && (
        <button onClick={onVerMapa}
          style={{ width:"100%", background:C.white, border:`2px solid #7C3AED`,
            color:"#7C3AED", padding:12, borderRadius:14,
            fontSize:13, fontWeight:800, cursor:"pointer", marginBottom:16 }}>
          📍 Ver mapa de mi ruta
        </button>
      )}

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginBottom:16 }}>
        {[
          { id:"ruta", label:"En ruta", value: misP.length, color:"#7C3AED", icon:"🛵" },
          { id:"entregados", label:"Entregados", value: entregadosHoy.length, color:C.green, icon:"✅" },
          { id:"no_entregados", label:"No entreg.", value: noEntregadosHoy.length, color:C.red, icon:"⚠️" },
        ].map((k,i)=>(
          <div key={i} onClick={()=>setFiltroLista(k.id)}
            style={{ background:C.white, borderRadius:12, padding:14,
              textAlign:"center", cursor:"pointer",
              border: filtroLista===k.id ? `2px solid ${k.color}` : `1px solid ${C.border}`,
              boxShadow: filtroLista===k.id ? `0 4px 12px ${k.color}33` : "0 2px 8px #0D1E3D0A",
              borderTop:`3px solid ${k.color}`, transition:"all 0.15s" }}>
            <div style={{ fontSize:20, marginBottom:4 }}>{k.icon}</div>
            <div style={{ fontSize:20, fontWeight:800, color:C.textPri }}>{k.value}</div>
            <div style={{ fontSize:10, color: filtroLista===k.id ? k.color : C.textMut,
              textTransform:"uppercase", fontWeight: filtroLista===k.id ? 700 : 400 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {listaActual.length===0 ? (
        <div style={{ background:C.white, borderRadius:14, padding:32,
          textAlign:"center", color:C.textMut, border:`1px solid #E2E8F0` }}>
          <div style={{ fontSize:36, marginBottom:8 }}>
            {filtroLista==="ruta" ? "🎉" : filtroLista==="entregados" ? "📦" : "✅"}
          </div>
          <div style={{ fontSize:14, fontWeight:600 }}>
            {filtroLista==="ruta" ? "¡Sin pedidos pendientes!" : filtroLista==="entregados" ? "Aún no hay entregas hoy" : "Sin pedidos no entregados"}
          </div>
        </div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {listaActual.map((p,i) => (
            <div key={p.id} onClick={()=>onVerPedido(p)}
              style={{ background:C.white, borderRadius:14, padding:16,
                border:`1px solid #E2E8F0`, cursor:"pointer",
                boxShadow:"0 2px 8px #0D1E3D0A", position:"relative",
                paddingLeft: filtroLista==="ruta" ? 44 : 16,
                borderLeft:`4px solid ${ESTADOS[p.estado]?.color||C.gold}` }}>
              {filtroLista==="ruta" && (
                <div style={{ position:"absolute", left:14, top:16, width:24, height:24,
                  borderRadius:"50%", background:C.gold, color:C.navy, fontWeight:800,
                  fontSize:12, display:"flex", alignItems:"center", justifyContent:"center" }}>
                  {i+1}
                </div>
              )}
              <div style={{ display:"flex", justifyContent:"space-between",
                alignItems:"flex-start", marginBottom:8 }}>
                <div>
                  <div style={{ fontSize:14, fontWeight:800, color:C.navy }}>{p.omd}</div>
                  {p.cliente_referencia && (
                    <div style={{ fontSize:10, color:C.textMut }}>N° Orden: {p.cliente_referencia}</div>
                  )}
                </div>
                <span style={{ fontSize:11, padding:"3px 10px", borderRadius:20,
                  fontWeight:700, background:ESTADOS[p.estado]?.bg,
                  color:ESTADOS[p.estado]?.color, border:`1px solid ${ESTADOS[p.estado]?.color}33` }}>
                  {ESTADOS[p.estado]?.label}
                </span>
              </div>
              <div style={{ fontSize:14, fontWeight:600, color:C.textPri, marginBottom:4 }}>
                {p.dest_nombre}
              </div>
              <div style={{ fontSize:12, color:C.textSec, marginBottom:4 }}>
                📍 {p.dest_direccion}
              </div>
              <div style={{ display:"flex", justifyContent:"space-between",
                alignItems:"center", marginTop:8 }}>
                <span style={{ fontSize:11, color:C.textMut }}>{p.dest_distrito}</span>
                <span style={{ fontSize:12, fontWeight:800,
                  color: p.cobro_destino ? "#C2410C" : C.green }}>
                  {p.cobro_destino ? "COD" : "Pagado"}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── PANTALLA DETALLE PEDIDO ───────────────────────────────────
function DetallePedido({ pedido: p, onVolver, onActualizar, onActualizarLocal, toast }) {
  const [vista, setVista] = useState("detalle"); // detalle | entrega | no_entrega
  const [guardando, setGuardando] = useState(false);
  const [fotos, setFotos] = useState([]);
  const [motivo, setMotivo] = useState("");
  const [detalleOtro, setDetalleOtro] = useState("");
  const [recibidoPor, setRecibidoPor] = useState("");
  const [comentario, setComentario] = useState("");

  const confirmarEvidencia = async (nuevoEstado) => {
    if (fotos.length < 2) { toast("Se requieren mínimo 2 fotos de evidencia","error"); return; }
    if (fotos.some(f=>f.rota)) { toast("Quita las fotos dañadas y vuelve a tomarlas antes de guardar","error"); return; }
    if (nuevoEstado === "entregado" && !recibidoPor) {
      toast("Selecciona quién recibió el pedido","error"); return;
    }
    if (nuevoEstado === "no_entregado" && !motivo) {
      toast("Selecciona un motivo","error"); return;
    }
    setGuardando(true);
    const motivoFinal = motivo === "Otro" ? (detalleOtro || "Otro") : motivo;
    try {
      const { offline } = await guardarEvidenciaYEstado({
        pedidoId: p.id, nuevoEstado, fotosFiles: fotos,
        motivo: motivoFinal, responsable: "",
        recibidoPor, comentario: comentario.trim(),
      });
      onActualizarLocal(p.id, nuevoEstado === "entregado"
        ? { estado:"entregado", fecha_entrega:new Date().toISOString(), recibido_por:recibidoPor, comentario_entrega:comentario.trim()||null }
        : { estado:"no_entregado", motivo_no_entrega:motivoFinal, comentario_no_entrega:comentario.trim()||null });
      toast(offline
        ? "Sin conexión: guardado en el equipo, se sincronizará al recuperar señal ⏳"
        : (nuevoEstado==="entregado" ? "¡Pedido entregado! ✓" : "Registrado como no entregado ✓"));
      onVolver();
    } catch (err) {
      toast(err.message || "No se pudo guardar. Vuelve a tomar las fotos e intenta de nuevo.", "error");
    } finally {
      setGuardando(false);
    }
  };

  const abrirGoogleMaps = () => {
    const addr = encodeURIComponent(`${p.dest_direccion}, ${p.dest_distrito}, Lima, Perú`);
    window.open(`https://www.google.com/maps/search/?api=1&query=${addr}`, "_blank");
  };
  const abrirWaze = () => {
    const addr = encodeURIComponent(`${p.dest_direccion}, ${p.dest_distrito}, Lima, Perú`);
    window.open(`https://waze.com/ul?q=${addr}&navigate=yes`, "_blank");
  };
  const llamarCliente = () => {
    if (!p.dest_telefono) return;
    registrarContacto(p.id, "llamada");
    window.open(`tel:${p.dest_telefono}`);
  };
  const whatsappCliente = () => {
    const tel = p.dest_telefono?.replace(/\D/g,"");
    if (!tel) return;
    registrarContacto(p.id, "whatsapp");
    window.open(`https://wa.me/51${tel}?text=Hola ${p.dest_nombre}, soy repartidor de Boaz. Estoy llegando a entregar tu pedido ${p.omd}.`,"_blank");
  };

  const historial = agruparHistorial(
    [...(p.historial||[])].sort((a,b)=> new Date(b.timestamp) - new Date(a.timestamp))
  );
  const todasLasFotos = historial.filter(h=>h.esFotoGrupo).flatMap(h=>h.urls);
  const [fotoAbierta, setFotoAbierta] = useState(null); // índice dentro de todasLasFotos

  // ── Sub-vista: capturar evidencias (entrega o no entrega) ──
  if (vista === "entrega" || vista === "no_entrega") {
    const esEntrega = vista === "entrega";
    return (
      <div style={{ padding:16 }}>
        <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
          <button onClick={()=>setVista("detalle")}
            style={{ background:C.white, border:`1px solid #E2E8F0`,
              color:C.textSec, padding:"8px 14px", borderRadius:10,
              fontSize:13, cursor:"pointer", fontWeight:600 }}>← Cancelar</button>
          <div style={{ fontSize:16, fontWeight:800, color: esEntrega?C.green:C.red }}>
            {esEntrega ? "✅ Confirmar entrega" : "⚠️ Registrar no entrega"}
          </div>
        </div>

        {esEntrega && (
          <div style={{ background:C.white, borderRadius:14, padding:18,
            marginBottom:14, border:`1px solid #E2E8F0` }}>
            <div style={{ fontSize:11, fontWeight:700, color:C.navy, textTransform:"uppercase",
              marginBottom:10 }}>Recibido por</div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:14 }}>
              {["Titular","Conserje","Familiar"].map(r=>(
                <button key={r} onClick={()=>setRecibidoPor(r)}
                  style={{ padding:"8px 14px", borderRadius:20, fontSize:12, fontWeight:700,
                    cursor:"pointer",
                    border: recibidoPor===r ? `2px solid ${C.green}` : `1px solid #E2E8F0`,
                    background: recibidoPor===r ? "#ECFDF5" : C.white,
                    color: recibidoPor===r ? C.green : C.textSec }}>
                  {r}
                </button>
              ))}
            </div>
            <div style={{ fontSize:11, fontWeight:700, color:C.navy, textTransform:"uppercase",
              marginBottom:8 }}>Comentarios (opcional)</div>
            <textarea placeholder="Notas adicionales sobre la entrega..."
              value={comentario} onChange={e=>setComentario(e.target.value)}
              rows={2}
              style={{ width:"100%", border:"1px solid #E2E8F0", borderRadius:10,
                padding:"10px 14px", fontSize:13, boxSizing:"border-box", resize:"vertical",
                fontFamily:"inherit" }}/>
          </div>
        )}

        {!esEntrega && (
          <div style={{ background:C.white, borderRadius:14, padding:18,
            marginBottom:14, border:`1px solid #E2E8F0` }}>
            <div style={{ fontSize:11, fontWeight:700, color:C.navy, textTransform:"uppercase",
              marginBottom:10 }}>Motivo</div>
            <select value={motivo} onChange={e=>setMotivo(e.target.value)}
              style={{ width:"100%", border:"1px solid #E2E8F0", borderRadius:10,
                padding:"12px 14px", fontSize:13, color:C.textPri, marginBottom:10,
                boxSizing:"border-box" }}>
              <option value="">— Selecciona un motivo —</option>
              {MOTIVOS_NO_ENTREGA.map(m=><option key={m} value={m}>{m}</option>)}
            </select>
            {motivo==="Otro" && (
              <input placeholder="Detalla el motivo..."
                value={detalleOtro} onChange={e=>setDetalleOtro(e.target.value)}
                style={{ width:"100%", border:"1px solid #E2E8F0", borderRadius:10,
                  padding:"10px 14px", fontSize:13, boxSizing:"border-box" }}/>
            )}
          </div>
        )}

        <div style={{ background:C.white, borderRadius:14, padding:18,
          marginBottom:14, border:`1px solid #E2E8F0` }}>
          <CapturaFotos fotos={fotos} setFotos={setFotos} minimo={2}
            label={esEntrega ? "Fotos de entrega" : "Fotos de evidencia"} />

          {!esEntrega && (
            <div style={{ marginTop:14, paddingTop:14, borderTop:"1px solid #F1F5F9" }}>
              <div style={{ fontSize:11, fontWeight:700, color:C.navy, textTransform:"uppercase",
                marginBottom:8 }}>Comentarios (opcional)</div>
              <textarea placeholder="Notas adicionales sobre la incidencia..."
                value={comentario} onChange={e=>setComentario(e.target.value)}
                rows={2}
                style={{ width:"100%", border:"1px solid #E2E8F0", borderRadius:10,
                  padding:"10px 14px", fontSize:13, boxSizing:"border-box", resize:"vertical",
                  fontFamily:"inherit" }}/>
            </div>
          )}
        </div>

        <button onClick={()=>confirmarEvidencia(esEntrega ? "entregado" : "no_entregado")}
          disabled={guardando}
          style={{ width:"100%", background: esEntrega
              ? `linear-gradient(135deg,${C.green},#059669)`
              : `linear-gradient(135deg,${C.red},#B91C1C)`,
            color:C.white, border:"none", padding:16, borderRadius:12,
            fontSize:15, fontWeight:800, cursor: guardando?"default":"pointer" }}>
          {guardando ? "Guardando..." : (esEntrega ? "Confirmar entrega" : "Confirmar no entrega")}
        </button>
      </div>
    );
  }

  // ── Vista principal de detalle ──
  return (
    <div style={{ padding:16 }}>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
        <button onClick={onVolver}
          style={{ background:C.white, border:`1px solid #E2E8F0`,
            color:C.textSec, padding:"8px 14px", borderRadius:10,
            fontSize:13, cursor:"pointer", fontWeight:600 }}>← Volver</button>
        <div>
          <div style={{ fontSize:18, fontWeight:900, color:C.navy }}>{p.omd}</div>
          {p.cliente_referencia && (
            <div style={{ fontSize:11, color:C.textMut, marginBottom:2 }}>N° Orden: {p.cliente_referencia}</div>
          )}
          <span style={{ fontSize:11, padding:"2px 10px", borderRadius:20, fontWeight:700,
            background:ESTADOS[p.estado]?.bg, color:ESTADOS[p.estado]?.color }}>
            {ESTADOS[p.estado]?.label}
          </span>
        </div>
      </div>

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
        <div style={{ fontSize:13, color:C.textSec, marginBottom:4 }}>
          🏙️ {p.dest_distrito}
        </div>
        {p.dest_referencia && (
          <div style={{ fontSize:12, color:C.textMut, marginBottom:12 }}>
            🏠 Ref: {p.dest_referencia}
          </div>
        )}
        {!p.dest_referencia && <div style={{ marginBottom:8 }}/>}

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:8 }}>
          <button onClick={abrirGoogleMaps}
            style={{ background:C.navy, color:C.white, border:"none",
              padding:"10px 6px", borderRadius:10, fontSize:11,
              fontWeight:700, cursor:"pointer", textAlign:"center" }}>
            🗺️ Google Maps
          </button>
          <button onClick={abrirWaze}
            style={{ background:"#33CCFF", color:C.navy, border:"none",
              padding:"10px 6px", borderRadius:10, fontSize:11,
              fontWeight:700, cursor:"pointer", textAlign:"center" }}>
            🚗 Waze
          </button>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
          <button onClick={llamarCliente}
            style={{ background:C.green, color:C.white, border:"none",
              padding:"10px 6px", borderRadius:10, fontSize:11,
              fontWeight:700, cursor:"pointer", textAlign:"center" }}>
            📞 Llamar
          </button>
          <button onClick={whatsappCliente}
            style={{ background:"#25D366", color:C.white, border:"none",
              padding:"10px 6px", borderRadius:10, fontSize:11,
              fontWeight:700, cursor:"pointer", textAlign:"center" }}>
            💬 WhatsApp
          </button>
        </div>
      </div>

      <div style={{ background:C.white, borderRadius:14, padding:18,
        marginBottom:12, border:`1px solid #E2E8F0` }}>
        <div style={{ fontSize:11, fontWeight:700, color:C.navy, textTransform:"uppercase",
          letterSpacing:"0.8px", marginBottom:12 }}>📋 Paquete</div>
        <div>
          <div style={{ fontSize:10, color:C.textMut, textTransform:"uppercase" }}>Peso</div>
          <div style={{ fontSize:14, fontWeight:600, color:C.textPri }}>{p.peso_kg?p.peso_kg+" kg":"—"}</div>
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
            <div style={{ fontSize:11, color:"#D97706" }}>Cobrar antes de entregar el paquete y rendir a Boaz al final de la ruta</div>
          </div>
        )}
        {p.estado==="no_entregado" && p.motivo_no_entrega && (
          <div style={{ marginTop:14, background:"#FEF2F2",
            border:"2px solid #FECACA", borderRadius:10, padding:"12px 14px" }}>
            <div style={{ fontSize:12, fontWeight:700, color:C.red, marginBottom:2 }}>
              ⚠️ NO ENTREGADO
            </div>
            <div style={{ fontSize:13, color:"#991B1B" }}>{p.motivo_no_entrega}</div>
            {p.comentario_no_entrega && (
              <div style={{ fontSize:12, color:"#991B1B", marginTop:6, fontStyle:"italic" }}>{p.comentario_no_entrega}</div>
            )}
          </div>
        )}
        {p.estado==="entregado" && p.recibido_por && (
          <div style={{ marginTop:14, background:"#ECFDF5",
            border:"2px solid #A7F3D0", borderRadius:10, padding:"12px 14px" }}>
            <div style={{ fontSize:12, fontWeight:700, color:C.green, marginBottom:2 }}>
              ✅ RECIBIDO POR: {p.recibido_por?.toUpperCase()}
            </div>
            {p.comentario_entrega && (
              <div style={{ fontSize:13, color:"#065F46" }}>{p.comentario_entrega}</div>
            )}
          </div>
        )}
      </div>

      <div style={{ background:C.white, borderRadius:14, padding:18,
        marginBottom:12, border:`1px solid #E2E8F0` }}>
        <div style={{ fontSize:11, fontWeight:700, color:C.navy, textTransform:"uppercase",
          letterSpacing:"0.8px", marginBottom:14 }}>🔄 Actualizar estado</div>

        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {p.estado==="en_ruta" && (
            <>
              <button onClick={()=>{ setFotos([]); setRecibidoPor(""); setComentario(""); setVista("entrega"); }}
                style={{ background:`linear-gradient(135deg,${C.green},#059669)`,
                  color:C.white, border:"none", padding:16, borderRadius:12,
                  fontSize:15, fontWeight:800, cursor:"pointer" }}>
                ✅ Marcar entregado
              </button>
              <button onClick={()=>{ setFotos([]); setMotivo(""); setDetalleOtro(""); setComentario(""); setVista("no_entrega"); }}
                style={{ background:`linear-gradient(135deg,${C.red},#B91C1C)`,
                  color:C.white, border:"none", padding:16, borderRadius:12,
                  fontSize:15, fontWeight:800, cursor:"pointer" }}>
                ⚠️ No entregado
              </button>
            </>
          )}
          {p.estado==="asignado" && (
            <div style={{ background:"#FFFBEB", border:"1px solid #FDE68A", borderRadius:12,
              padding:"14px 16px", textAlign:"center" }}>
              <div style={{ fontSize:22, marginBottom:6 }}>🚦</div>
              <div style={{ fontSize:13, fontWeight:700, color:"#92400E", marginBottom:4 }}>
                Todavía no puedes gestionar este pedido
              </div>
              <div style={{ fontSize:12, color:"#92400E" }}>
                Primero inicia tu ruta desde la pantalla de Inicio para poder marcarlo como entregado o no entregado.
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{ background:C.white, borderRadius:14, padding:18,
        border:`1px solid #E2E8F0` }}>
        <div style={{ fontSize:11, fontWeight:700, color:C.navy, textTransform:"uppercase",
          letterSpacing:"0.8px", marginBottom:12 }}>🕒 Historial</div>
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
                    {h.tipo==="llamada" && "Llamada al cliente"}
                    {h.tipo==="whatsapp" && "Mensaje de WhatsApp"}
                    {h.tipo==="estado" && h.detalle}
                    {h.esFotoGrupo && "Fotos de evidencia"}
                  </div>
                  <div style={{ fontSize:11, color:C.textMut }}>
                    {fmt.fechaHora(h.timestamp)}
                    {h.lat && ` · GPS ${h.lat.toFixed(4)}, ${h.lng.toFixed(4)}`}
                  </div>
                  {h.esFotoGrupo && (
                    <div style={{ display:"flex", gap:8, marginTop:6, flexWrap:"wrap" }}>
                      {h.urls.map((url,ui)=>(
                        <img key={ui} src={url} alt=""
                          onClick={()=>setFotoAbierta(todasLasFotos.indexOf(url))}
                          style={{ width:60, height:60, objectFit:"cover",
                          borderRadius:6, border:"1px solid #E2E8F0", cursor:"pointer" }}/>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
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

// ── PANTALLA MI LIQUIDACIÓN (COD) ─────────────────────────────
function MiLiquidacion({ repartidor, pedidos, onMarcarLiquidado, liquidando }) {
  const misCOD = pedidos.filter(p=>
    p.repartidor_id===repartidor.id && p.estado==="entregado" && p.cobro_destino
  );
  const porRendir = misCOD.filter(p=>!p.liquidado_cod);
  const yaLiquidados = misCOD.filter(p=>p.liquidado_cod);
  const totalPorRendir = porRendir.reduce((a,p)=>a+(parseFloat(p.monto_cobrar)||0),0);
  const totalLiquidado = yaLiquidados.reduce((a,p)=>a+(parseFloat(p.monto_cobrar)||0),0);

  return (
    <div style={{ padding:16 }}>
      <div style={{ fontSize:16, fontWeight:800, color:C.textPri, marginBottom:16 }}>
        Mi liquidación COD
      </div>

      <div style={{ background:`linear-gradient(135deg,${C.navy},${C.navyLt})`,
        borderRadius:16, padding:20, marginBottom:16, color:C.white }}>
        <div style={{ fontSize:11, color:C.textMut, textTransform:"uppercase",
          marginBottom:4 }}>Total por rendir a Boaz</div>
        <div style={{ fontSize:36, fontWeight:900, color:C.gold }}>
          S/ {totalPorRendir.toFixed(2)}
        </div>
        <div style={{ fontSize:12, color:"#8FA3BA", marginTop:4 }}>
          {porRendir.length} entrega{porRendir.length===1?"":"s"} con cobro en efectivo (COD)
        </div>
      </div>

      {porRendir.length > 0 ? (
        <>
          <div style={{ fontSize:12, fontWeight:700, color:C.textSec,
            textTransform:"uppercase", marginBottom:10 }}>Pedidos pendientes de rendir</div>
          {porRendir.map(p=>(
            <div key={p.id} style={{ background:C.white, borderRadius:12, padding:14,
              marginBottom:8, border:`1px solid #E2E8F0`,
              display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div>
                <div style={{ fontSize:13, fontWeight:700, color:C.navy }}>{p.omd}</div>
                <div style={{ fontSize:12, color:C.textSec }}>{p.dest_nombre}</div>
                <div style={{ fontSize:11, color:C.textMut }}>{p.dest_distrito} · {fmt.hora(p.fecha_entrega)}</div>
              </div>
              <div style={{ fontSize:16, fontWeight:800, color:"#C2410C" }}>S/ {p.monto_cobrar}</div>
            </div>
          ))}

          <button onClick={()=>onMarcarLiquidado(porRendir.map(p=>p.id))}
            disabled={liquidando}
            style={{ width:"100%", background:`linear-gradient(135deg,${C.gold},${C.goldDk})`,
              color:C.navy, border:"none", padding:16, borderRadius:12,
              fontSize:15, fontWeight:800, cursor: liquidando?"default":"pointer",
              marginTop:8 }}>
            {liquidando ? "Registrando..." : `💰 Marcar como liquidado a Boaz (S/ ${totalPorRendir.toFixed(2)})`}
          </button>
        </>
      ) : (
        <div style={{ background:C.white, borderRadius:14, padding:32,
          textAlign:"center", color:C.textMut, border:`1px solid #E2E8F0` }}>
          <div style={{ fontSize:32, marginBottom:8 }}>✅</div>
          <div style={{ fontSize:14 }}>No tienes cobros COD pendientes de rendir</div>
        </div>
      )}

      {yaLiquidados.length > 0 && (
        <div style={{ marginTop:20 }}>
          <div style={{ fontSize:12, fontWeight:700, color:C.textSec,
            textTransform:"uppercase", marginBottom:10 }}>
            Ya liquidado ({yaLiquidados.length} pedidos · S/ {totalLiquidado.toFixed(2)})
          </div>
          {yaLiquidados.map(p=>(
            <div key={p.id} style={{ background:"#F8FAFC", borderRadius:12, padding:12,
              marginBottom:6, border:`1px solid #E2E8F0`,
              display:"flex", justifyContent:"space-between", alignItems:"center", opacity:0.7 }}>
              <div style={{ fontSize:12, color:C.textSec }}>{p.omd} · {p.dest_nombre}</div>
              <div style={{ fontSize:13, fontWeight:700, color:C.textMut }}>S/ {p.monto_cobrar} ✓</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── PANTALLA MI PERFIL ────────────────────────────────────────
function MiPerfil({ repartidor, pedidos, onLogout }) {
  const total = pedidos.filter(p=>p.repartidor_id===repartidor.id).length;
  const ent = pedidos.filter(p=>p.repartidor_id===repartidor.id&&p.estado==="entregado").length;
  const ef = total ? Math.round(ent/total*100) : 0;

  return (
    <div style={{ padding:16 }}>
      <div style={{ background:`linear-gradient(135deg,${C.navy},${C.navyLt})`,
        borderRadius:16, padding:24, marginBottom:16, textAlign:"center" }}>
        <div style={{ width:72, height:72, borderRadius:"50%",
          background:`linear-gradient(135deg,${C.gold},${C.goldDk})`,
          display:"flex", alignItems:"center", justifyContent:"center",
          fontSize:28, fontWeight:900, color:C.navy, margin:"0 auto 12px" }}>
          {repartidor.nombres?.[0]}{repartidor.apellidos?.[0]}
        </div>
        <div style={{ fontSize:20, fontWeight:800, color:"#E8EAF0" }}>
          {repartidor.nombres} {repartidor.apellidos}
        </div>
        <div style={{ fontSize:12, color:C.textMut, marginTop:4 }}>
          Repartidor Boaz
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginBottom:16 }}>
        {[
          { label:"Total", value:total, color:C.navy },
          { label:"Entregados", value:ent, color:C.green },
          { label:"Efectividad", value:ef+"%", color:C.gold },
        ].map((s,i)=>(
          <div key={i} style={{ background:C.white, borderRadius:12, padding:14,
            textAlign:"center", border:`1px solid #E2E8F0`,
            borderTop:`3px solid ${s.color}` }}>
            <div style={{ fontSize:22, fontWeight:800, color:s.color }}>{s.value}</div>
            <div style={{ fontSize:10, color:C.textMut, textTransform:"uppercase" }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ background:C.white, borderRadius:14, padding:18,
        border:`1px solid #E2E8F0`, marginBottom:16 }}>
        <div style={{ fontSize:11, fontWeight:700, color:C.navy, textTransform:"uppercase",
          letterSpacing:"0.8px", marginBottom:12 }}>Mis datos</div>
        {[
          ["📱","Teléfono",repartidor.telefono||"—"],
          ["✉️","Email",repartidor.email||"—"],
          ["🚗","Vehículo",repartidor.vehiculo||"—"],
          ["🔑","Placa",repartidor.placa||"—"],
          ["📍","Zona",repartidor.zona_default?.replace("_"," ")||"—"],
        ].map(([ic,k,v])=>(
          <div key={k} style={{ display:"flex", gap:10, padding:"8px 0",
            borderBottom:`1px solid #F1F5F9` }}>
            <span style={{ fontSize:16 }}>{ic}</span>
            <span style={{ fontSize:12, color:C.textSec, flex:1 }}>{k}</span>
            <span style={{ fontSize:12, fontWeight:600, color:C.textPri,
              textTransform:"capitalize" }}>{v}</span>
          </div>
        ))}
      </div>

      <button onClick={onLogout}
        style={{ width:"100%", background:"transparent",
          border:`2px solid ${C.red}`, color:C.red, padding:14,
          borderRadius:12, fontSize:14, fontWeight:700, cursor:"pointer" }}>
        Cerrar sesión
      </button>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// APP PRINCIPAL
// ══════════════════════════════════════════════════════════════
export default function BoazApp() {
  const [repartidor, setRepartidor] = useState(null);
  const [pedidos, setPedidos] = useState([]);
  const [tab, setTab] = useState("inicio");
  const [pedidoSel, setPedidoSel] = useState(null);
  const [ordenandoRuta, setOrdenandoRuta] = useState(false);
  const [viendoMapa, setViendoMapa] = useState(false);
  const [toast, setToast] = useState(null);
  const [iniciandoRuta, setIniciandoRuta] = useState(false);
  const [liquidando, setLiquidando] = useState(false);
  const [pendientesSync, setPendientesSync] = useState(leerCola().length);
  const [rutaActiva, setRutaActiva] = useState(null);
  const [pantallaFinal, setPantallaFinal] = useState(null); // resumen a mostrar tras finalizar

  const showToast = useCallback((msg, tipo="ok") => {
    setToast({msg,tipo});
    setTimeout(()=>setToast(null),3000);
  },[]);

  const cargar = useCallback(async () => {
    if (!repartidor) return;
    const { data } = await sb.from("pedidos").select("*")
      .eq("repartidor_id", repartidor.id)
      .order("created_at",{ascending:false});
    if (data) setPedidos(data);
    const hoy = new Date().toISOString().split("T")[0];
    const { data: ruta } = await sb.from("rutas_repartidor").select("*")
      .eq("repartidor_id", repartidor.id).eq("fecha", hoy).is("hora_fin", null)
      .order("created_at",{ascending:false}).limit(1).maybeSingle();
    setRutaActiva(ruta || null);
  },[repartidor]);

  useEffect(() => { cargar(); }, [cargar]);

  // Realtime
  useEffect(() => {
    if (!repartidor) return;
    const ch = sb.channel("app-rt")
      .on("postgres_changes",{event:"*",schema:"public",table:"pedidos"},cargar)
      .subscribe();
    return () => sb.removeChannel(ch);
  },[repartidor,cargar]);

  // Sincronización de la cola offline
  const [sincronizando, setSincronizando] = useState(false);
  const sincronizar = useCallback(async (manual=false) => {
    if (leerCola().length === 0) {
      if (manual) { setSincronizando(true); await cargar(); setSincronizando(false); showToast("Actualizado ✓"); }
      return;
    }
    if (manual) setSincronizando(true);
    const { ok, fail } = await procesarCola();
    setPendientesSync(leerCola().length);
    await cargar();
    if (manual) setSincronizando(false);
    if (ok > 0) showToast(`${ok} cambio${ok===1?"":"s"} sincronizado${ok===1?"":"s"} ✓`);
    if (fail > 0) showToast(`${fail} pendiente${fail===1?"":"s"} de sincronizar`,"error");
  },[cargar, showToast]);

  useEffect(() => {
    sincronizar();
    const onOnline = () => sincronizar();
    window.addEventListener("online", onOnline);
    const interval = setInterval(sincronizar, 30000);
    return () => { window.removeEventListener("online", onOnline); clearInterval(interval); };
  }, [sincronizar]);

  // Actualización local optimista (para que la UI responda aunque esté offline)
  const actualizarLocal = useCallback((pedidoId, cambios) => {
    setPedidos(prev => prev.map(p => p.id===pedidoId ? { ...p, ...cambios } : p));
  },[]);

  const iniciarRuta = async (pedidosASumar, loteId) => {
    const ids = (pedidosASumar||[]).map(p=>p.id);
    if (!ids.length) return;
    setIniciandoRuta(true);
    const { offline } = await iniciarRutaMasivo(ids);
    setIniciandoRuta(false);
    setPedidos(prev => prev.map(p => ids.includes(p.id) ? { ...p, estado:"en_ruta" } : p));
    setPendientesSync(leerCola().length);
    showToast(offline ? "Sin conexión: se sincronizará al recuperar señal ⏳" : `Ruta iniciada con ${ids.length} pedidos ✓`);

    if (!rutaActiva) {
      const hoy = new Date().toISOString().split("T")[0];
      const { data } = await sb.from("rutas_repartidor").insert([{
        repartidor_id: repartidor.id, fecha: hoy, lote_id: loteId||null,
        hora_inicio: new Date().toISOString(), total_pedidos: ids.length,
      }]).select().single();
      if (data) setRutaActiva(data);
    }
  };

  const finalizarRuta = async () => {
    if (!rutaActiva) return;
    // Cuenta solo lo resuelto desde que se inició ESTA ruta (no todo el día),
    // para no mezclar los números con otra ruta ya cerrada antes hoy mismo.
    const entregadosRuta = pedidos.filter(p=>
      p.repartidor_id===repartidor.id && p.estado==="entregado" &&
      p.fecha_entrega && p.fecha_entrega >= rutaActiva.hora_inicio
    ).length;
    const noEntregadosRuta = pedidos.filter(p=>
      p.repartidor_id===repartidor.id && p.estado==="no_entregado" &&
      p.historial?.some(h=>h.tipo==="estado" && h.timestamp >= rutaActiva.hora_inicio)
    ).length;
    const horaFin = new Date().toISOString();
    await sb.from("rutas_repartidor").update({
      hora_fin: horaFin, entregados: entregadosRuta, no_entregados: noEntregadosRuta,
    }).eq("id", rutaActiva.id);
    setPantallaFinal({
      horaInicio: rutaActiva.hora_inicio, horaFin,
      entregados: entregadosRuta, noEntregados: noEntregadosRuta,
    });
    setRutaActiva(null);
  };

  const marcarLiquidado = async (ids) => {
    if (!ids.length) return;
    setLiquidando(true);
    const { error } = await sb.from("pedidos").update({ liquidado_cod:true }).in("id", ids);
    setLiquidando(false);
    if (error) { showToast("Error: "+error.message,"error"); return; }
    setPedidos(prev => prev.map(p => ids.includes(p.id) ? { ...p, liquidado_cod:true } : p));
    showToast("Liquidación registrada ✓");
  };

  if (!repartidor) return <Login onLogin={r=>{setRepartidor(r);}} />;

  const pendientes = pedidos.filter(p=>p.estado==="asignado"||p.estado==="en_ruta");

  const NAV = [
    { id:"inicio",       icon:"🏠", label:"Inicio",    badge: pendientes.length||null },
    { id:"liquidacion",  icon:"💰", label:"Liquidación" },
    { id:"perfil",       icon:"👤", label:"Perfil" },
  ];

  return (
    <div style={{ minHeight:"100vh", background:C.bg,
      fontFamily:"'Segoe UI','Inter',sans-serif",
      maxWidth:430, margin:"0 auto", position:"relative" }}>

      <div style={{ background:C.navy, padding:"12px 16px",
        display:"flex", alignItems:"center", justifyContent:"space-between",
        position:"sticky", top:0, zIndex:100,
        boxShadow:"0 2px 12px #0D1E3D44" }}>
        <div style={{ display:"flex", alignItems:"center", gap:4, fontSize:18, fontWeight:900 }}>
          <span style={{ color:"#E8EAF0" }}>BOA</span>
          <span style={{ color:C.gold }}>Z</span>
          <span style={{ fontSize:11, color:C.textMut, fontWeight:500, marginLeft:4 }}>App</span>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          {pendientesSync > 0 && (
            <span title="Cambios pendientes de sincronizar" style={{ fontSize:10, color:C.gold,
              background:"#2A1F0D", padding:"3px 8px", borderRadius:10, fontWeight:700 }}>
              ⏳ {pendientesSync}
            </span>
          )}
          <button onClick={()=>sincronizar(true)} disabled={sincronizando}
            title="Forzar sincronización"
            style={{ background:"none", border:"none", cursor: sincronizando?"default":"pointer",
              fontSize:16, padding:4, lineHeight:1,
              animation: sincronizando ? "girar 1s linear infinite" : "none" }}>
            🔄
          </button>
          <style>{`@keyframes girar { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }`}</style>
          <div style={{ fontSize:12, color:C.textMut }}>
            {repartidor.nombres} {repartidor.apellidos?.[0]}.
          </div>
        </div>
      </div>

      <div style={{ paddingBottom:80 }}>
        {pedidoSel ? (
          <DetallePedido
            pedido={pedidos.find(p=>p.id===pedidoSel.id) || pedidoSel}
            onVolver={()=>setPedidoSel(null)}
            onActualizar={cargar}
            onActualizarLocal={actualizarLocal}
            toast={showToast}
          />
        ) : ordenandoRuta ? (
          <OrdenarRuta
            pedidosIniciales={calcularPedidosActivos(pedidos, repartidor.id, rutaActiva).misP}
            onVolver={()=>setOrdenandoRuta(false)}
            onGuardado={(ordenGuardado)=>{
              setPedidos(prev => prev.map(p => {
                const idx = ordenGuardado.findIndex(o=>o.id===p.id);
                return idx>=0 ? { ...p, orden_ruta: idx } : p;
              }));
              setOrdenandoRuta(false);
            }}
            toast={showToast}
          />
        ) : pantallaFinal ? (
          <PantallaFinalRuta resumen={pantallaFinal} repartidor={repartidor}
            onCerrar={()=>setPantallaFinal(null)}/>
        ) : viendoMapa ? (
          <MapaRuta
            pedidos={calcularPedidosActivos(pedidos, repartidor.id, rutaActiva).misP}
            onVolver={()=>setViendoMapa(false)}
            onVerPedido={setPedidoSel}
          />
        ) : (
          <>
            {tab==="inicio"      && <Inicio repartidor={repartidor} pedidos={pedidos} onVerPedido={setPedidoSel} onLogout={()=>setRepartidor(null)} onIniciarRuta={iniciarRuta} iniciando={iniciandoRuta} onOrdenarRuta={()=>setOrdenandoRuta(true)} onVerMapa={()=>setViendoMapa(true)} rutaActiva={rutaActiva} onFinalizarRuta={finalizarRuta}/>}
            {tab==="liquidacion" && <MiLiquidacion repartidor={repartidor} pedidos={pedidos} onMarcarLiquidado={marcarLiquidado} liquidando={liquidando}/>}
            {tab==="perfil"      && <MiPerfil repartidor={repartidor} pedidos={pedidos} onLogout={()=>setRepartidor(null)}/>}
          </>
        )}
      </div>

      {!pedidoSel && !ordenandoRuta && !viendoMapa && !pantallaFinal && (
        <div style={{ position:"fixed", bottom:0, left:"50%", transform:"translateX(-50%)",
          width:"100%", maxWidth:430, background:C.white,
          borderTop:`1px solid #E2E8F0`, display:"flex",
          boxShadow:"0 -4px 20px #0D1E3D14", zIndex:100 }}>
          {NAV.map(n=>(
            <button key={n.id} onClick={()=>setTab(n.id)}
              style={{ flex:1, background:"none", border:"none",
                padding:"10px 0 12px", cursor:"pointer",
                display:"flex", flexDirection:"column", alignItems:"center", gap:3,
                color: tab===n.id?C.navy:C.textMut,
                borderTop: tab===n.id?`3px solid ${C.gold}`:"3px solid transparent",
                transition:"all 0.15s", position:"relative" }}>
              <span style={{ fontSize:20 }}>{n.icon}</span>
              <span style={{ fontSize:10, fontWeight: tab===n.id?700:400 }}>{n.label}</span>
              {n.badge&&n.badge>0&&(
                <span style={{ position:"absolute", top:6, right:"calc(50% - 18px)",
                  background:C.red, color:C.white, fontSize:9, fontWeight:800,
                  padding:"1px 5px", borderRadius:10 }}>{n.badge}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {toast && (
        <div style={{ position:"fixed", top:70, left:"50%",
          transform:"translateX(-50%)", zIndex:9999,
          background:toast.tipo==="error"?C.red:toast.tipo==="warn"?C.orange:C.green,
          color:C.white, padding:"10px 20px", borderRadius:20,
          fontSize:13, fontWeight:700, boxShadow:"0 4px 20px #0003",
          maxWidth:360, textAlign:"center" }}>
          {toast.tipo==="error"?"❌":toast.tipo==="warn"?"⚠️":"✅"} {toast.msg}
        </div>
      )}
    </div>
  );
}
