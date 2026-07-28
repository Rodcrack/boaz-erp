// ══════════════════════════════════════════════════════════════
// BOAZ CLIENTE — Portal de visibilidad para clientes (empresas)
// Login por contacto, ve todos los pedidos históricos de su
// empresa, con estado, historial de evidencias y comunicación.
// Solo lectura.
// ══════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback } from "react";
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

const ICONOS_HIST = {
  llamada:"📞", whatsapp:"💬", estado:"🔄",
  foto_entrega:"📸", foto_no_entrega:"📸",
};

const fmt = {
  fecha: (d) => d ? new Date(d).toLocaleDateString("es-PE",{day:"numeric",month:"short",year:"numeric"}) : "—",
  hora:  (d) => d ? new Date(d).toLocaleTimeString("es-PE",{hour:"2-digit",minute:"2-digit"}) : "",
  fechaHora: (d) => d ? new Date(d).toLocaleString("es-PE",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}) : "",
};

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
    const { data: contacto, error: err1 } = await sb.from("clientes_usuarios")
      .select("id,nombres,apellidos,usuario,password_hash,activo,empresa_id")
      .eq("usuario", usuario.trim().toLowerCase())
      .eq("activo", true)
      .maybeSingle();
    if (err1 || !contacto) { setError("Usuario no encontrado"); setCargando(false); return; }
    if (pin !== contacto.password_hash) { setError("PIN incorrecto"); setCargando(false); return; }

    const { data: empresa } = await sb.from("empresas")
      .select("id,nombre,ruc,contacto,telefono,email")
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
        || (p.dest_distrito||"").toLowerCase().includes(q);
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

  return (
    <div style={{ padding:"20px 24px" }}>
      {/* Barra de búsqueda */}
      <div style={{ display:"flex", gap:10, marginBottom:14 }}>
        <input
          placeholder="Buscar por código Boaz, tracking, destinatario, teléfono o distrito..."
          value={busqueda} onChange={e=>setBusqueda(e.target.value)}
          style={{ flex:1, border:`1px solid ${C.border}`, borderRadius:10,
            padding:"12px 16px", fontSize:14, color:C.textPri, outline:"none",
            boxSizing:"border-box", background:C.white }}/>
        <button onClick={limpiarFiltros}
          style={{ background:C.white, border:`1px solid ${C.border}`, color:C.textSec,
            padding:"0 18px", borderRadius:10, fontSize:13, fontWeight:700, cursor:"pointer" }}>
          Limpiar
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
              {["Código Boaz","Estado","Tipo servicio","Destinatario","Distrito","Fecha",""].map(h=>(
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

// ── MODAL DE DETALLE (SOLO LECTURA) ────────────────────────────
function DetalleModal({ pedido: p, onClose }) {
  const historial = [...(p.historial||[])].sort((a,b)=> new Date(b.timestamp) - new Date(a.timestamp));

  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0, background:"#0D1E3DBB",
      zIndex:1000, display:"flex", alignItems:"flex-start", justifyContent:"center",
      padding:"40px 16px", overflowY:"auto" }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:C.bg, borderRadius:16,
        width:"100%", maxWidth:640, boxShadow:"0 20px 60px #00000060" }}>

        <div style={{ background:C.navy, padding:"16px 20px", borderRadius:"16px 16px 0 0",
          display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div>
            <div style={{ fontSize:18, fontWeight:900, color:"#E8EAF0" }}>{p.omd}</div>
            <span style={{ fontSize:11, padding:"2px 10px", borderRadius:20, fontWeight:700,
              background:ESTADOS[p.estado]?.bg, color:ESTADOS[p.estado]?.color }}>
              {ESTADOS[p.estado]?.label || p.estado}
            </span>
          </div>
          <button onClick={onClose}
            style={{ background:"none", border:"1px solid #1E3560", color:C.textMut,
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
                        {(h.tipo==="foto_entrega"||h.tipo==="foto_no_entrega") && "Foto de evidencia"}
                      </div>
                      <div style={{ fontSize:11, color:C.textMut }}>
                        {fmt.fechaHora(h.timestamp)}
                      </div>
                      {h.url && (
                        <img src={h.url} alt="" style={{ width:90, height:90, objectFit:"cover",
                          borderRadius:6, marginTop:6, border:"1px solid #E2E8F0", cursor:"pointer" }}
                          onClick={()=>window.open(h.url,"_blank")}/>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
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

      {cargando && pedidos.length===0 ? (
        <div style={{ padding:60, textAlign:"center", color:C.textMut, fontSize:13 }}>
          Cargando pedidos...
        </div>
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
