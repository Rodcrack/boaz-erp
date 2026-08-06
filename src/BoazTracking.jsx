// ══════════════════════════════════════════════════════════════
// BOAZ TRACKING PORTAL — Portal público de seguimiento
// Portal donde el destinatario busca su pedido por código BZ
// ══════════════════════════════════════════════════════════════
import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL  = "https://jeftkwjdqzkpswvaqspi.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImplZnRrd2pkcXprcHN3dmFxc3BpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4MzI0OTEsImV4cCI6MjEwMDQwODQ5MX0.Ta8Ei_wCm8ZEzD3IM-S60R0rJvI_d5BTvix_Z3W4EmY";
const sb = createClient(SUPABASE_URL, SUPABASE_ANON);

const ESTADOS = {
  sin_asignar: { label:"Registrado",    icon:"📋", color:"#3B82F6", desc:"Tu pedido está registrado en nuestro sistema." },
  asignado:    { label:"Asignado",      icon:"🛵", color:"#F59E0B", desc:"Tu pedido fue asignado a un repartidor." },
  en_ruta:     { label:"En camino",     icon:"🚐", color:"#8B5CF6", desc:"¡Tu pedido está en camino hacia ti!" },
  entregado:   { label:"Entregado",     icon:"✅", color:"#10B981", desc:"¡Tu pedido fue entregado exitosamente!" },
  no_entregado:{ label:"No entregado",  icon:"⚠️", color:"#EF4444", desc:"Tu pedido no pudo ser entregado. Nos pondremos en contacto contigo." },
};

const TIMELINE = ["sin_asignar","asignado","en_ruta","entregado"];

const fmt = {
  fecha: (d) => {
    if (!d) return "—";
    const str = typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d+"T00:00:00" : d;
    return new Date(str).toLocaleDateString("es-PE",{day:"numeric",month:"long",year:"numeric"});
  },
  hora:  (d) => d ? new Date(d).toLocaleTimeString("es-PE",{hour:"2-digit",minute:"2-digit"}) : "",
  fechaHora: (d) => d ? new Date(d).toLocaleString("es-PE",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}) : "",
};

const ICONOS_HIST = {
  llamada:"📞", whatsapp:"💬", estado:"🔄",
  foto_entrega:"📸", foto_no_entrega:"📸",
};

// Agrupa las fotos que pertenecen al mismo evento (misma marca de tiempo)
// para mostrarlas una al lado de la otra en vez de una por línea.
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

export default function BoazTracking() {
  const [codigo, setCodigo] = useState("");
  const [pedido, setPedido] = useState(null);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState("");

  const buscar = async (valorDirecto) => {
    const valorEntrada = (valorDirecto ?? codigo).trim();
    if (!valorEntrada) return;
    setBuscando(true); setError(""); setPedido(null);

    // Normaliza lo que pegue o escriba el usuario: mayúsculas, sin espacios.
    const limpio = valorEntrada.toUpperCase().replace(/\s+/g,"");
    const soloDigitos = limpio.replace(/^BZ-?/,"");

    const candidatos = [
      limpio,                              // tal cual lo pegó (nuevo formato: BZ + 10 dígitos)
      "BZ" + soloDigitos,                  // por si escribió solo los dígitos
      "BZ" + soloDigitos.padStart(10,"0"), // por si le faltan ceros a la izquierda
      "BZ-" + soloDigitos,                 // formato antiguo (compatibilidad)
      "BZ-" + soloDigitos.padStart(4,"0"),
      "BZ-" + soloDigitos.padStart(6,"0"),
    ];
    let data = null, err = null;
    for (const bz of candidatos) {
      const res = await sb.from("pedidos").select("*").eq("omd", bz).single();
      if (res.data) { data = res.data; break; }
      err = res.error;
    }
    if (err || !data) {
      setError("No encontramos ningún pedido con ese código. Verifica e intenta nuevamente.");
    } else {
      setPedido(data);
    }
    setBuscando(false);
  };

  const estadoActual = pedido ? (ESTADOS[pedido.estado] || ESTADOS.sin_asignar) : null;
  const idxActual = pedido ? TIMELINE.indexOf(pedido.estado) : -1;
  const esFinal = pedido?.estado === "no_entregado";

  // Si la página se abre con ?codigo=BZ... (por ejemplo, enlazada desde la web
  // comercial), precarga el código y busca automáticamente.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const desdeUrl = params.get("codigo") || params.get("omd") || params.get("tracking");
    if (desdeUrl) {
      setCodigo(desdeUrl);
      buscar(desdeUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ minHeight:"100vh", background:"#0D1E3D",
      fontFamily:"'Segoe UI','Inter',sans-serif", padding:"0 0 60px" }}>

      {/* Header */}
      <div style={{ background:"#0D1E3D", padding:"24px 0 20px",
        borderBottom:"1px solid #1E3560", textAlign:"center" }}>
        <div style={{ display:"inline-flex", alignItems:"center", gap:4, marginBottom:8 }}>
          <span style={{ fontSize:32, fontWeight:900, color:"#E8EAF0",
            letterSpacing:"2px" }}>BOA</span>
          <span style={{ fontSize:32, fontWeight:900, color:"#8B6914",
            letterSpacing:"2px" }}>Z</span>
        </div>
        <div style={{ fontSize:13, color:"#8FA3BA", fontStyle:"italic" }}>
          Con Boaz, tu negocio no para.
        </div>
      </div>

      {/* Hero búsqueda */}
      <div style={{ maxWidth:640, margin:"48px auto 0", padding:"0 20px" }}>
        <div style={{ textAlign:"center", marginBottom:32 }}>
          <div style={{ fontSize:28, fontWeight:800, color:"#F3F4F6", marginBottom:8 }}>
            Rastrea tu pedido
          </div>
          <div style={{ fontSize:15, color:"#8FA3BA" }}>
            Ingresa tu Tracking Boaz para ver el estado de tu envío en tiempo real
          </div>
        </div>

        {/* Input de búsqueda */}
        <div style={{ display:"flex", gap:10, marginBottom:12 }}>
          <div style={{ flex:1 }}>
            <input
              placeholder="BZ0000000004"
              value={codigo}
              onChange={e=>setCodigo(e.target.value)}
              onPaste={e=>{
                e.preventDefault();
                const texto = (e.clipboardData || window.clipboardData).getData("text");
                setCodigo(texto.trim());
              }}
              onKeyDown={e=>e.key==="Enter"&&buscar()}
              style={{ width:"100%", background:"#152848", border:"1px solid #1E3560",
                color:"#F3F4F6", borderRadius:12, padding:"14px 16px",
                fontSize:16, outline:"none", boxSizing:"border-box",
                letterSpacing:"1px", fontWeight:600 }}
            />
          </div>
          <button onClick={buscar} disabled={buscando||!codigo}
            style={{ background:"linear-gradient(135deg,#F5A623,#D4891A)",
              border:"none", color:"#0D1E3D", padding:"14px 28px", borderRadius:12,
              cursor:buscando||!codigo?"not-allowed":"pointer",
              fontSize:14, fontWeight:800, opacity:!codigo?0.6:1,
              whiteSpace:"nowrap" }}>
            {buscando?"Buscando...":"🔍 Rastrear"}
          </button>
        </div>

        {error && (
          <div style={{ background:"#2D0707", border:"1px solid #EF444444",
            borderRadius:10, padding:"12px 16px", color:"#FCA5A5", fontSize:13,
            marginBottom:20, textAlign:"center" }}>
            ❌ {error}
          </div>
        )}

        {/* Resultado */}
        {pedido && (
          <div style={{ marginTop:24 }}>
            {/* Card principal */}
            <div style={{ background:"#152848", border:"1px solid #1E3560",
              borderRadius:16, overflow:"hidden",
              boxShadow:"0 20px 60px #00000060" }}>

              {/* Banner estado */}
              <div style={{ background:`${estadoActual.color}22`,
                borderBottom:`3px solid ${estadoActual.color}`,
                padding:"20px 24px", display:"flex", alignItems:"center", gap:16 }}>
                <div style={{ fontSize:40 }}>{estadoActual.icon}</div>
                <div>
                  <div style={{ fontSize:11, color:"#8FA3BA", textTransform:"uppercase",
                    letterSpacing:"1px", marginBottom:4 }}>Estado actual</div>
                  <div style={{ fontSize:22, fontWeight:800, color:estadoActual.color }}>
                    {estadoActual.label}
                  </div>
                  <div style={{ fontSize:13, color:"#9CA3AF", marginTop:4 }}>
                    {estadoActual.desc}
                  </div>
                </div>
                <div style={{ marginLeft:"auto", textAlign:"right" }}>
                  <div style={{ fontSize:11, color:"#8FA3BA" }}>Tracking Boaz</div>
                  <div style={{ fontSize:20, fontWeight:900, color:"#F5A623",
                    letterSpacing:"1px" }}>{pedido.omd}</div>
                </div>
              </div>

              {/* Timeline */}
              {!esFinal && (
                <div style={{ padding:"24px", borderBottom:"1px solid #1E3560" }}>
                  <div style={{ display:"flex", alignItems:"flex-start", position:"relative" }}>
                    {/* Línea de fondo */}
                    <div style={{ position:"absolute", top:14, left:14, right:14, height:3,
                      background:"#1E3560", zIndex:0 }}/>
                    {/* Línea progreso */}
                    <div style={{ position:"absolute", top:14, left:14, height:3,
                      background:"#F5A623", zIndex:1, transition:"width 0.5s",
                      width: idxActual<0?"0%":
                             idxActual===0?"0%":
                             idxActual===1?"33%":
                             idxActual===2?"66%":"100%" }}/>
                    {TIMELINE.map((t,i) => {
                      const e = ESTADOS[t];
                      const done = idxActual >= i;
                      const active = idxActual === i;
                      return (
                        <div key={t} style={{ flex:1, textAlign:"center", position:"relative", zIndex:2 }}>
                          <div style={{ width:28, height:28, borderRadius:"50%",
                            background: done?"#F5A623":"#1E3560",
                            border:`3px solid ${done?"#F5A623":"#1E3560"}`,
                            margin:"0 auto 8px",
                            display:"flex", alignItems:"center", justifyContent:"center",
                            fontSize:12, boxShadow: active?"0 0 0 4px #F5A62344":"none",
                            transition:"all 0.3s" }}>
                            {done?"✓":""}
                          </div>
                          <div style={{ fontSize:11, fontWeight: active?700:400,
                            color: done?"#F5A623":"#4A6080" }}>{e.label}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Datos del pedido */}
              <div style={{ padding:"20px 24px",
                display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
                <div>
                  <div style={{ fontSize:11, color:"#8FA3BA", textTransform:"uppercase",
                    letterSpacing:"0.8px", marginBottom:12, fontWeight:700 }}>Tu pedido</div>
                  {[
                    ["Destinatario", pedido.dest_nombre],
                    ["Dirección", pedido.dest_direccion],
                    ["Distrito", pedido.dest_distrito||"—"],
                    ["Referencia", pedido.dest_referencia||"—"],
                  ].map(([k,v])=>(
                    <div key={k} style={{ marginBottom:10 }}>
                      <div style={{ fontSize:10, color:"#4A6080" }}>{k}</div>
                      <div style={{ fontSize:13, color:"#E8EAF0", fontWeight:500 }}>{v||"—"}</div>
                    </div>
                  ))}
                </div>
                <div>
                  <div style={{ fontSize:11, color:"#8FA3BA", textTransform:"uppercase",
                    letterSpacing:"0.8px", marginBottom:12, fontWeight:700 }}>Información</div>
                  {[
                    ["Peso", pedido.peso_kg?pedido.peso_kg+" kg":"—"],
                    ["Fecha programada", fmt.fecha(pedido.fecha_programada)],
                    ["Fecha entrega", (pedido.estado==="entregado" && pedido.fecha_entrega)?fmt.fecha(pedido.fecha_entrega)+" "+fmt.hora(pedido.fecha_entrega):"Pendiente"],
                    ["Cobro en destino", pedido.cobro_destino?`S/ ${pedido.monto_cobrar}`:"No aplica"],
                  ].map(([k,v])=>(
                    <div key={k} style={{ marginBottom:10 }}>
                      <div style={{ fontSize:10, color:"#4A6080" }}>{k}</div>
                      <div style={{ fontSize:13, color:"#E8EAF0", fontWeight:500 }}>{v||"—"}</div>
                    </div>
                  ))}
                </div>
              </div>

              {esFinal && pedido.motivo_no_entrega && (
                <div style={{ padding:"0 24px 20px" }}>
                  <div style={{ background:"#2D0707", border:"1px solid #EF444444",
                    borderRadius:10, padding:"14px 16px" }}>
                    <div style={{ fontSize:11, color:"#FCA5A5", textTransform:"uppercase",
                      fontWeight:700, marginBottom:4 }}>Motivo</div>
                    <div style={{ fontSize:13, color:"#F3F4F6" }}>{pedido.motivo_no_entrega}</div>
                  </div>
                </div>
              )}

              {/* Historial completo: cambios de estado, llamadas y fotos de evidencia */}
              {(() => {
                const historialAgrupado = agruparHistorial(
                  [...(pedido.historial||[])].sort((a,b)=> new Date(b.timestamp) - new Date(a.timestamp))
                );
                if (historialAgrupado.length === 0) return null;
                return (
                  <div style={{ padding:"0 24px 20px" }}>
                    <div style={{ fontSize:11, color:"#8FA3BA", textTransform:"uppercase",
                      letterSpacing:"0.8px", marginBottom:12, fontWeight:700 }}>Historial del pedido</div>
                    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                      {historialAgrupado.map((h,i)=>(
                        <div key={i} style={{ display:"flex", gap:10, alignItems:"flex-start",
                          borderBottom: i<historialAgrupado.length-1 ? "1px solid #1E3560" : "none",
                          paddingBottom:12 }}>
                          <span style={{ fontSize:16 }}>{ICONOS_HIST[h.tipo]||"•"}</span>
                          <div style={{ flex:1 }}>
                            <div style={{ fontSize:13, fontWeight:600, color:"#E8EAF0" }}>
                              {h.tipo==="llamada" && "Llamada al destinatario"}
                              {h.tipo==="whatsapp" && "Mensaje de WhatsApp"}
                              {h.tipo==="estado" && h.detalle}
                              {h.esFotoGrupo && "Fotos de evidencia"}
                            </div>
                            <div style={{ fontSize:11, color:"#8FA3BA" }}>{fmt.fechaHora(h.timestamp)}</div>
                            {h.esFotoGrupo && (
                              <div style={{ display:"flex", gap:8, marginTop:8, flexWrap:"wrap" }}>
                                {h.urls.map((url,ui)=>(
                                  <img key={ui} src={url} alt="" onClick={()=>window.open(url,"_blank")}
                                    style={{ width:80, height:80, objectFit:"cover", borderRadius:8,
                                      border:"1px solid #1E3560", cursor:"pointer" }}/>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Footer contacto */}
              <div style={{ background:"#0D1E3D", padding:"16px 24px",
                display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div style={{ fontSize:12, color:"#4A6080" }}>
                  ¿Tienes alguna consulta?
                </div>
                <a href="https://wa.me/51960622471" target="_blank"
                  style={{ background:"#25D366", color:"#fff",
                    padding:"8px 16px", borderRadius:8, fontSize:12,
                    fontWeight:700, textDecoration:"none", display:"flex",
                    alignItems:"center", gap:6 }}>
                  💬 WhatsApp Boaz
                </a>
              </div>
            </div>

            {/* Buscar otro */}
            <div style={{ textAlign:"center", marginTop:16 }}>
              <button onClick={()=>{setPedido(null);setCodigo("");setError("");}}
                style={{ background:"none", border:"none", color:"#8FA3BA",
                  fontSize:13, cursor:"pointer", textDecoration:"underline" }}>
                Buscar otro pedido
              </button>
            </div>
          </div>
        )}

        {/* Ejemplo si no hay pedido */}
        {!pedido && !error && !buscando && (
          <div style={{ textAlign:"center", marginTop:40, color:"#4A6080" }}>
            <div style={{ fontSize:40, marginBottom:12 }}>📦</div>
            <div style={{ fontSize:13 }}>Ingresa tu Tracking Boaz para comenzar</div>
            <div style={{ fontSize:11, marginTop:6, color:"#2A3F60" }}>Ejemplo: BZ0000000004</div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ textAlign:"center", marginTop:60, color:"#2A3F60", fontSize:11 }}>
        <div style={{ marginBottom:4 }}>Grupo Boaz S.A.C. · RUC 20613172301 · El Agustino, Lima</div>
        <div>contacto@boaz.com.pe · +51 960 622 471 · www.boaz.com.pe</div>
      </div>
    </div>
  );
}
