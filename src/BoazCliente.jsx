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

const FILTROS = [
  { id:"todos",        label:"Todos" },
  { id:"en_curso",     label:"En curso" },
  { id:"entregado",    label:"Entregados" },
  { id:"no_entregado", label:"No entregados" },
];

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

// ── LISTA DE PEDIDOS ───────────────────────────────────────────
function ListaPedidos({ pedidos, onVerPedido, filtro, setFiltro }) {
  const filtrados = pedidos.filter(p => {
    if (filtro==="todos") return true;
    if (filtro==="en_curso") return p.estado==="asignado" || p.estado==="en_ruta" || p.estado==="sin_asignar";
    return p.estado===filtro;
  });

  const conteos = {
    todos: pedidos.length,
    en_curso: pedidos.filter(p=>p.estado==="asignado"||p.estado==="en_ruta"||p.estado==="sin_asignar").length,
    entregado: pedidos.filter(p=>p.estado==="entregado").length,
    no_entregado: pedidos.filter(p=>p.estado==="no_entregado").length,
  };

  return (
    <div style={{ padding:16 }}>
      <div style={{ display:"flex", gap:8, overflowX:"auto", marginBottom:16, paddingBottom:4 }}>
        {FILTROS.map(f=>(
          <button key={f.id} onClick={()=>setFiltro(f.id)}
            style={{ flexShrink:0, padding:"8px 14px", borderRadius:20, fontSize:12, fontWeight:700,
              cursor:"pointer", whiteSpace:"nowrap",
              border: filtro===f.id ? `2px solid ${C.gold}` : `1px solid #E2E8F0`,
              background: filtro===f.id ? "#FFF8EF" : C.white,
              color: filtro===f.id ? C.goldDk : C.textSec }}>
            {f.label} ({conteos[f.id]})
          </button>
        ))}
      </div>

      {filtrados.length===0 ? (
        <div style={{ background:C.white, borderRadius:14, padding:32,
          textAlign:"center", color:C.textMut, border:`1px solid #E2E8F0` }}>
          <div style={{ fontSize:36, marginBottom:8 }}>📦</div>
          <div style={{ fontSize:14, fontWeight:600 }}>Sin pedidos en esta categoría</div>
        </div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {filtrados.map(p=>(
            <div key={p.id} onClick={()=>onVerPedido(p)}
              style={{ background:C.white, borderRadius:14, padding:16,
                border:`1px solid #E2E8F0`, cursor:"pointer",
                boxShadow:"0 2px 8px #0D1E3D0A",
                borderLeft:`4px solid ${ESTADOS[p.estado]?.color||C.gold}` }}>
              <div style={{ display:"flex", justifyContent:"space-between",
                alignItems:"flex-start", marginBottom:8 }}>
                <div style={{ fontSize:14, fontWeight:800, color:C.navy }}>{p.omd}</div>
                <span style={{ fontSize:11, padding:"3px 10px", borderRadius:20,
                  fontWeight:700, background:ESTADOS[p.estado]?.bg,
                  color:ESTADOS[p.estado]?.color, border:`1px solid ${ESTADOS[p.estado]?.color}33` }}>
                  {ESTADOS[p.estado]?.label || p.estado}
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
                <span style={{ fontSize:11, color:C.textMut }}>{fmt.fecha(p.created_at)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── DETALLE DE PEDIDO (SOLO LECTURA) ───────────────────────────
function DetallePedido({ pedido: p, onVolver }) {
  const historial = [...(p.historial||[])].sort((a,b)=> new Date(b.timestamp) - new Date(a.timestamp));

  return (
    <div style={{ padding:16 }}>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
        <button onClick={onVolver}
          style={{ background:C.white, border:`1px solid #E2E8F0`,
            color:C.textSec, padding:"8px 14px", borderRadius:10,
            fontSize:13, cursor:"pointer", fontWeight:600 }}>← Volver</button>
        <div>
          <div style={{ fontSize:18, fontWeight:900, color:C.navy }}>{p.omd}</div>
          <span style={{ fontSize:11, padding:"2px 10px", borderRadius:20, fontWeight:700,
            background:ESTADOS[p.estado]?.bg, color:ESTADOS[p.estado]?.color }}>
            {ESTADOS[p.estado]?.label || p.estado}
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
  );
}

// ══════════════════════════════════════════════════════════════
// APP PRINCIPAL
// ══════════════════════════════════════════════════════════════
export default function BoazCliente() {
  const [contacto, setContacto] = useState(null);
  const [pedidos, setPedidos] = useState([]);
  const [pedidoSel, setPedidoSel] = useState(null);
  const [filtro, setFiltro] = useState("todos");
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
      fontFamily:"'Segoe UI','Inter',sans-serif",
      maxWidth:480, margin:"0 auto", position:"relative" }}>

      <div style={{ background:C.navy, padding:"14px 16px",
        display:"flex", alignItems:"center", justifyContent:"space-between",
        position:"sticky", top:0, zIndex:100,
        boxShadow:"0 2px 12px #0D1E3D44" }}>
        <div>
          <div style={{ display:"flex", alignItems:"center", gap:4, fontSize:18, fontWeight:900 }}>
            <span style={{ color:"#E8EAF0" }}>BOA</span>
            <span style={{ color:C.gold }}>Z</span>
            <span style={{ fontSize:11, color:C.textMut, fontWeight:500, marginLeft:4 }}>Cliente</span>
          </div>
          <div style={{ fontSize:11, color:C.textMut, marginTop:2 }}>
            {contacto.empresa?.nombre || "—"}
          </div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ fontSize:12, color:C.textMut, textAlign:"right" }}>
            {contacto.nombres} {contacto.apellidos?.[0]}.
          </div>
          <button onClick={()=>{setContacto(null); setPedidoSel(null);}}
            style={{ background:"none", border:"1px solid #1E3560",
              color:C.textMut, padding:"6px 12px", borderRadius:8,
              fontSize:11, cursor:"pointer" }}>Salir</button>
        </div>
      </div>

      {cargando && pedidos.length===0 ? (
        <div style={{ padding:40, textAlign:"center", color:C.textMut, fontSize:13 }}>
          Cargando pedidos...
        </div>
      ) : pedidoSel ? (
        <DetallePedido
          pedido={pedidos.find(p=>p.id===pedidoSel.id) || pedidoSel}
          onVolver={()=>setPedidoSel(null)}
        />
      ) : (
        <ListaPedidos pedidos={pedidos} onVerPedido={setPedidoSel} filtro={filtro} setFiltro={setFiltro}/>
      )}
    </div>
  );
}
