// ══════════════════════════════════════════════════════════════
// BOAZ APP — App móvil del repartidor (PWA)
// Funciona en el navegador del celular como app nativa
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
  white:"#FFFFFF", bg:"#F0F4F8",
  green:"#10B981", red:"#EF4444", orange:"#F97316",
  textPri:"#0D1E3D", textSec:"#4A6080", textMut:"#8FA3BA",
};

const ESTADOS = {
  sin_asignar: { label:"Sin asignar", color:"#3B82F6", bg:"#EFF6FF" },
  asignado:    { label:"Asignado",    color:"#D97706", bg:"#FFFBEB" },
  en_ruta:     { label:"En ruta",     color:"#7C3AED", bg:"#F5F3FF" },
  entregado:   { label:"Entregado",   color:"#059669", bg:"#ECFDF5" },
  devuelto:    { label:"Devuelto",    color:"#DC2626", bg:"#FEF2F2" },
  incidencia:  { label:"Incidencia",  color:"#EA580C", bg:"#FFF7ED" },
};

const fmt = {
  fecha: (d) => d ? new Date(d).toLocaleDateString("es-PE",{day:"numeric",month:"short"}) : "—",
  hora:  (d) => d ? new Date(d).toLocaleTimeString("es-PE",{hour:"2-digit",minute:"2-digit"}) : "",
};

// ── PANTALLA LOGIN ─────────────────────────────────────────────
function Login({ onLogin }) {
  const [repartidores, setRepartidores] = useState([]);
  const [sel, setSel] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    sb.from("repartidores").select("id,nombres,apellidos,activo")
      .eq("activo",true).order("nombres")
      .then(({data})=>{ if(data) setRepartidores(data); });
  }, []);

  const entrar = () => {
    if (!sel) { setError("Selecciona tu nombre"); return; }
    const rep = repartidores.find(r=>r.id===sel);
    if (!rep) { setError("Repartidor no encontrado"); return; }
    // PIN simple: últimos 4 dígitos del DNI (configurable)
    // Por ahora cualquier PIN de 4 dígitos funciona en demo
    if (pin.length < 4) { setError("Ingresa tu PIN de 4 dígitos"); return; }
    onLogin(rep);
  };

  return (
    <div style={{ minHeight:"100vh", background:C.navy,
      display:"flex", flexDirection:"column", alignItems:"center",
      justifyContent:"center", padding:24, fontFamily:"'Segoe UI',sans-serif" }}>

      {/* Logo */}
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

      {/* Form */}
      <div style={{ background:C.navyMd, borderRadius:20, padding:28,
        width:"100%", maxWidth:340, border:"1px solid #1E3560",
        boxShadow:"0 20px 60px #00000060" }}>
        <div style={{ fontSize:15, fontWeight:700, color:"#E8EAF0",
          marginBottom:20, textAlign:"center" }}>Iniciar sesión</div>

        <div style={{ marginBottom:14 }}>
          <label style={{ fontSize:11, color:C.textMut, textTransform:"uppercase",
            letterSpacing:"0.7px", marginBottom:6, display:"block" }}>Soy repartidor</label>
          <select value={sel} onChange={e=>setSel(e.target.value)}
            style={{ width:"100%", background:"#0D1E3D", border:"1px solid #1E3560",
              color:"#E8EAF0", borderRadius:10, padding:"12px 14px",
              fontSize:14, outline:"none" }}>
            <option value="">— Selecciona tu nombre —</option>
            {repartidores.map(r=>(
              <option key={r.id} value={r.id}>{r.nombres} {r.apellidos}</option>
            ))}
          </select>
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

        <button onClick={entrar}
          style={{ width:"100%", background:`linear-gradient(135deg,${C.gold},${C.goldDk})`,
            border:"none", color:C.navy, padding:14, borderRadius:12,
            fontSize:15, fontWeight:800, cursor:"pointer", letterSpacing:"0.5px" }}>
          Entrar →
        </button>

        <div style={{ textAlign:"center", marginTop:16, fontSize:11, color:"#2A3F60" }}>
          ¿Problemas? Llama a Boaz: +51 960 622 471
        </div>
      </div>
    </div>
  );
}

// ── PANTALLA INICIO ───────────────────────────────────────────
function Inicio({ repartidor, pedidos, onVerPedido, onLogout }) {
  const hoy = new Date().toISOString().split("T")[0];
  const misP = pedidos.filter(p=>
    p.repartidor_id===repartidor.id &&
    (p.estado==="asignado"||p.estado==="en_ruta")
  );
  const entregadosHoy = pedidos.filter(p=>
    p.repartidor_id===repartidor.id &&
    p.estado==="entregado" &&
    p.fecha_entrega?.startsWith(hoy)
  );
  const ingresoHoy = entregadosHoy.reduce((a,p)=>a+(parseFloat(p.tarifa_s)||0),0);

  return (
    <div style={{ padding:16 }}>
      {/* Header rep */}
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

      {/* KPIs del día */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginBottom:16 }}>
        {[
          { label:"Pendientes", value: misP.length, color:C.gold, icon:"📋" },
          { label:"Entregados", value: entregadosHoy.length, color:C.green, icon:"✅" },
          { label:"Ingresos", value:`S/${ingresoHoy}`, color:C.navy, icon:"💰" },
        ].map((k,i)=>(
          <div key={i} style={{ background:C.white, borderRadius:12, padding:14,
            textAlign:"center", border:`1px solid ${C.border}`,
            boxShadow:"0 2px 8px #0D1E3D0A",
            borderTop:`3px solid ${k.color}` }}>
            <div style={{ fontSize:20, marginBottom:4 }}>{k.icon}</div>
            <div style={{ fontSize:20, fontWeight:800, color:C.textPri }}>{k.value}</div>
            <div style={{ fontSize:10, color:C.textMut, textTransform:"uppercase" }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Pedidos pendientes */}
      <div style={{ fontSize:13, fontWeight:700, color:C.textPri, marginBottom:10 }}>
        Mis pedidos de hoy ({misP.length})
      </div>

      {misP.length===0 ? (
        <div style={{ background:C.white, borderRadius:14, padding:32,
          textAlign:"center", color:C.textMut, border:`1px solid #E2E8F0` }}>
          <div style={{ fontSize:36, marginBottom:8 }}>🎉</div>
          <div style={{ fontSize:14, fontWeight:600 }}>¡Sin pedidos pendientes!</div>
          <div style={{ fontSize:12, marginTop:4 }}>Todos los pedidos están atendidos.</div>
        </div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {misP.map(p => (
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
                <span style={{ fontSize:14, fontWeight:800, color:C.navy }}>S/ {p.tarifa_s}</span>
              </div>
              {p.cobro_destino && (
                <div style={{ marginTop:8, background:"#FFF7ED",
                  border:"1px solid #FED7AA", borderRadius:8, padding:"6px 10px",
                  fontSize:11, color:"#C2410C", fontWeight:600 }}>
                  💵 Cobrar en destino: S/ {p.monto_cobrar}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── PANTALLA DETALLE PEDIDO ───────────────────────────────────
function DetallePedido({ pedido: p, onVolver, onActualizar, toast }) {
  const [cambiando, setCambiando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [gps, setGps] = useState(null);
  const fileRef = useRef();

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => {}
      );
    }
  }, []);

  const cambiarEstado = async (nuevoEstado) => {
    setCambiando(true);
    const extra = {};
    if (nuevoEstado==="entregado") extra.fecha_entrega = new Date().toISOString();
    if (nuevoEstado==="en_ruta" && gps) {
      extra.dest_lat = gps.lat;
      extra.dest_lng = gps.lng;
    }
    if (nuevoEstado==="devuelto") extra.motivo_devol = motivo;

    const { error } = await sb.from("pedidos").update({
      estado:nuevoEstado,...extra
    }).eq("id",p.id);
    if (error) { toast("Error: "+error.message,"error"); setCambiando(false); return; }
    toast(nuevoEstado==="entregado"?"¡Pedido entregado! ✓":"Estado actualizado ✓");
    setCambiando(false);
    onActualizar();
    onVolver();
  };

  const abrirMapa = () => {
    const addr = encodeURIComponent(`${p.dest_direccion}, ${p.dest_distrito}, Lima, Perú`);
    window.open(`https://www.google.com/maps/search/?api=1&query=${addr}`, "_blank");
  };

  const llamarCliente = () => {
    if (p.dest_telefono) window.open(`tel:${p.dest_telefono}`);
  };

  const whatsappCliente = () => {
    const tel = p.dest_telefono?.replace(/\D/g,"");
    if (tel) window.open(`https://wa.me/51${tel}?text=Hola ${p.dest_nombre}, soy repartidor de Boaz. Estoy llegando a entregar tu pedido ${p.omd}.`,"_blank");
  };

  return (
    <div style={{ padding:16 }}>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
        <button onClick={onVolver}
          style={{ background:C.white, border:`1px solid #E2E8F0`,
            color:C.textSec, padding:"8px 14px", borderRadius:10,
            fontSize:13, cursor:"pointer", fontWeight:600 }}>← Volver</button>
        <div>
          <div style={{ fontSize:18, fontWeight:900, color:C.navy }}>{p.omd}</div>
          <span style={{ fontSize:11, padding:"2px 10px", borderRadius:20, fontWeight:700,
            background:ESTADOS[p.estado]?.bg, color:ESTADOS[p.estado]?.color }}>
            {ESTADOS[p.estado]?.label}
          </span>
        </div>
      </div>

      {/* Datos destinatario */}
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
        <div style={{ fontSize:13, color:C.textSec, marginBottom:12 }}>
          🏙️ {p.dest_distrito}
        </div>

        {/* Botones acción rápida */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8 }}>
          <button onClick={abrirMapa}
            style={{ background:C.navy, color:C.white, border:"none",
              padding:"10px 6px", borderRadius:10, fontSize:11,
              fontWeight:700, cursor:"pointer", textAlign:"center" }}>
            🗺️ Navegar
          </button>
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

      {/* Info paquete */}
      <div style={{ background:C.white, borderRadius:14, padding:18,
        marginBottom:12, border:`1px solid #E2E8F0` }}>
        <div style={{ fontSize:11, fontWeight:700, color:C.navy, textTransform:"uppercase",
          letterSpacing:"0.8px", marginBottom:12 }}>📋 Paquete</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          {[
            ["Peso",p.peso_kg?p.peso_kg+" kg":"—"],
            ["Tarifa","S/ "+p.tarifa_s],
            ["Ámbito",p.ambito?.replace("_"," ")||"—"],
            ["Programado",fmt.fecha(p.fecha_programada)],
          ].map(([k,v])=>(
            <div key={k}>
              <div style={{ fontSize:10, color:C.textMut, textTransform:"uppercase" }}>{k}</div>
              <div style={{ fontSize:14, fontWeight:600, color:C.textPri, textTransform:"capitalize" }}>{v}</div>
            </div>
          ))}
        </div>
        {p.cobro_destino && (
          <div style={{ marginTop:14, background:"#FFF7ED",
            border:"2px solid #FED7AA", borderRadius:10, padding:"12px 14px" }}>
            <div style={{ fontSize:12, fontWeight:700, color:"#C2410C", marginBottom:2 }}>
              💵 COBRO EN DESTINO
            </div>
            <div style={{ fontSize:20, fontWeight:900, color:"#C2410C" }}>
              S/ {p.monto_cobrar}
            </div>
            <div style={{ fontSize:11, color:"#D97706" }}>Cobrar antes de entregar el paquete</div>
          </div>
        )}
      </div>

      {/* Cambiar estado */}
      <div style={{ background:C.white, borderRadius:14, padding:18,
        marginBottom:12, border:`1px solid #E2E8F0` }}>
        <div style={{ fontSize:11, fontWeight:700, color:C.navy, textTransform:"uppercase",
          letterSpacing:"0.8px", marginBottom:14 }}>🔄 Actualizar estado</div>

        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {p.estado==="asignado" && (
            <button onClick={()=>cambiarEstado("en_ruta")} disabled={cambiando}
              style={{ background:`linear-gradient(135deg,#7C3AED,#6D28D9)`,
                color:C.white, border:"none", padding:16, borderRadius:12,
                fontSize:15, fontWeight:800, cursor:"pointer" }}>
              🚀 Salir a ruta
            </button>
          )}

          {(p.estado==="asignado"||p.estado==="en_ruta") && (
            <button onClick={()=>cambiarEstado("entregado")} disabled={cambiando}
              style={{ background:`linear-gradient(135deg,${C.green},#059669)`,
                color:C.white, border:"none", padding:16, borderRadius:12,
                fontSize:15, fontWeight:800, cursor:"pointer" }}>
              ✅ Marcar entregado
            </button>
          )}

          {(p.estado==="asignado"||p.estado==="en_ruta") && (
            <div>
              <input placeholder="Motivo de devolución..."
                value={motivo} onChange={e=>setMotivo(e.target.value)}
                style={{ width:"100%", background:C.bg, border:`1px solid #E2E8F0`,
                  borderRadius:10, padding:"10px 14px", fontSize:13,
                  marginBottom:8, boxSizing:"border-box", color:C.textPri }}/>
              <button onClick={()=>cambiarEstado("devuelto")}
                disabled={cambiando||!motivo}
                style={{ width:"100%", background:motivo?"#DC2626":"#F3F4F6",
                  color:motivo?C.white:C.textMut, border:"none", padding:14,
                  borderRadius:12, fontSize:14, fontWeight:700,
                  cursor:motivo?"pointer":"not-allowed" }}>
                ↩️ Devolver pedido
              </button>
            </div>
          )}

          {(p.estado==="asignado"||p.estado==="en_ruta") && (
            <button onClick={()=>cambiarEstado("incidencia")} disabled={cambiando}
              style={{ background:"transparent", border:`2px solid ${C.orange}`,
                color:C.orange, padding:12, borderRadius:12,
                fontSize:13, fontWeight:700, cursor:"pointer" }}>
              ⚠️ Reportar incidencia
            </button>
          )}
        </div>
      </div>

      {/* GPS */}
      {gps && (
        <div style={{ background:C.white, borderRadius:14, padding:14,
          border:`1px solid #E2E8F0`, fontSize:12, color:C.textMut,
          textAlign:"center" }}>
          📍 GPS activo · {gps.lat.toFixed(4)}, {gps.lng.toFixed(4)}
        </div>
      )}
    </div>
  );
}

// ── PANTALLA LIQUIDACIÓN ──────────────────────────────────────
function MiLiquidacion({ repartidor, pedidos }) {
  const hoy = new Date().toISOString().split("T")[0];
  const entregadosHoy = pedidos.filter(p=>
    p.repartidor_id===repartidor.id &&
    p.estado==="entregado" &&
    p.fecha_entrega?.startsWith(hoy)
  );
  const totalHoy = entregadosHoy.reduce((a,p)=>a+(parseFloat(p.tarifa_s)||0),0);
  const cobrosDestino = entregadosHoy.filter(p=>p.cobro_destino);
  const totalCobros = cobrosDestino.reduce((a,p)=>a+(parseFloat(p.monto_cobrar)||0),0);

  return (
    <div style={{ padding:16 }}>
      <div style={{ fontSize:16, fontWeight:800, color:C.textPri, marginBottom:16 }}>
        Mi liquidación de hoy
      </div>

      {/* Resumen */}
      <div style={{ background:`linear-gradient(135deg,${C.navy},${C.navyLt})`,
        borderRadius:16, padding:20, marginBottom:16, color:C.white }}>
        <div style={{ fontSize:11, color:C.textMut, textTransform:"uppercase",
          marginBottom:4 }}>Total ganado hoy</div>
        <div style={{ fontSize:36, fontWeight:900, color:C.gold }}>
          S/ {totalHoy.toFixed(2)}
        </div>
        <div style={{ fontSize:12, color:"#8FA3BA", marginTop:4 }}>
          {entregadosHoy.length} entregas completadas
        </div>
        {totalCobros > 0 && (
          <div style={{ marginTop:12, background:"#F5A62322",
            border:"1px solid #F5A62344", borderRadius:10, padding:"10px 14px" }}>
            <div style={{ fontSize:11, color:C.gold }}>💵 Cobros en destino pendientes</div>
            <div style={{ fontSize:20, fontWeight:800, color:C.gold }}>S/ {totalCobros.toFixed(2)}</div>
          </div>
        )}
      </div>

      {/* Detalle */}
      {entregadosHoy.length > 0 ? (
        <div>
          <div style={{ fontSize:12, fontWeight:700, color:C.textSec,
            textTransform:"uppercase", marginBottom:10 }}>Detalle de entregas</div>
          {entregadosHoy.map(p=>(
            <div key={p.id} style={{ background:C.white, borderRadius:12, padding:14,
              marginBottom:8, border:`1px solid #E2E8F0`,
              display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div>
                <div style={{ fontSize:13, fontWeight:700, color:C.navy }}>{p.omd}</div>
                <div style={{ fontSize:12, color:C.textSec }}>{p.dest_nombre}</div>
                <div style={{ fontSize:11, color:C.textMut }}>{p.dest_distrito} · {fmt.hora(p.fecha_entrega)}</div>
              </div>
              <div style={{ textAlign:"right" }}>
                <div style={{ fontSize:16, fontWeight:800, color:C.navy }}>S/ {p.tarifa_s}</div>
                {p.cobro_destino && (
                  <div style={{ fontSize:11, color:C.orange, fontWeight:700 }}>
                    +S/{p.monto_cobrar} cobro
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Total */}
          <div style={{ background:C.bg, borderRadius:12, padding:16, marginTop:8,
            border:`2px solid ${C.gold}44` }}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
              <span style={{ fontSize:13, color:C.textSec }}>Subtotal entregas</span>
              <span style={{ fontSize:13, fontWeight:700, color:C.textPri }}>S/ {totalHoy.toFixed(2)}</span>
            </div>
            {totalCobros > 0 && (
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
                <span style={{ fontSize:13, color:C.orange }}>Cobros a entregar a Boaz</span>
                <span style={{ fontSize:13, fontWeight:700, color:C.orange }}>S/ {totalCobros.toFixed(2)}</span>
              </div>
            )}
            <div style={{ height:1, background:C.gold, opacity:0.3, margin:"8px 0" }}/>
            <div style={{ display:"flex", justifyContent:"space-between" }}>
              <span style={{ fontSize:14, fontWeight:700, color:C.navy }}>TOTAL A RECIBIR</span>
              <span style={{ fontSize:18, fontWeight:900, color:C.gold }}>S/ {totalHoy.toFixed(2)}</span>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ background:C.white, borderRadius:14, padding:32,
          textAlign:"center", color:C.textMut, border:`1px solid #E2E8F0` }}>
          <div style={{ fontSize:32, marginBottom:8 }}>📋</div>
          <div style={{ fontSize:14 }}>Sin entregas registradas hoy</div>
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
      {/* Card perfil */}
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

      {/* Stats */}
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

      {/* Info */}
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
  const [toast, setToast] = useState(null);

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

  if (!repartidor) return <Login onLogin={r=>{setRepartidor(r);}} />;

  const pendientes = pedidos.filter(p=>p.estado==="asignado"||p.estado==="en_ruta");

  const NAV = [
    { id:"inicio",       icon:"🏠", label:"Inicio",    badge: pendientes.length||null },
    { id:"liquidacion",  icon:"💰", label:"Mi pago" },
    { id:"perfil",       icon:"👤", label:"Perfil" },
  ];

  return (
    <div style={{ minHeight:"100vh", background:C.bg,
      fontFamily:"'Segoe UI','Inter',sans-serif",
      maxWidth:430, margin:"0 auto", position:"relative" }}>

      {/* Header app */}
      <div style={{ background:C.navy, padding:"12px 16px",
        display:"flex", alignItems:"center", justifyContent:"space-between",
        position:"sticky", top:0, zIndex:100,
        boxShadow:"0 2px 12px #0D1E3D44" }}>
        <div style={{ display:"flex", alignItems:"center", gap:4, fontSize:18, fontWeight:900 }}>
          <span style={{ color:"#E8EAF0" }}>BOA</span>
          <span style={{ color:C.gold }}>Z</span>
          <span style={{ fontSize:11, color:C.textMut, fontWeight:500, marginLeft:4 }}>App</span>
        </div>
        <div style={{ fontSize:12, color:C.textMut }}>
          {repartidor.nombres} {repartidor.apellidos?.[0]}.
        </div>
      </div>

      {/* Contenido */}
      <div style={{ paddingBottom:80 }}>
        {pedidoSel ? (
          <DetallePedido
            pedido={pedidoSel}
            onVolver={()=>setPedidoSel(null)}
            onActualizar={cargar}
            toast={showToast}
          />
        ) : (
          <>
            {tab==="inicio"      && <Inicio repartidor={repartidor} pedidos={pedidos} onVerPedido={setPedidoSel} onLogout={()=>setRepartidor(null)}/>}
            {tab==="liquidacion" && <MiLiquidacion repartidor={repartidor} pedidos={pedidos}/>}
            {tab==="perfil"      && <MiPerfil repartidor={repartidor} pedidos={pedidos} onLogout={()=>setRepartidor(null)}/>}
          </>
        )}
      </div>

      {/* Bottom nav */}
      {!pedidoSel && (
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

      {/* Toast */}
      {toast && (
        <div style={{ position:"fixed", top:70, left:"50%",
          transform:"translateX(-50%)", zIndex:9999,
          background:toast.tipo==="error"?C.red:C.green,
          color:C.white, padding:"10px 20px", borderRadius:20,
          fontSize:13, fontWeight:700, boxShadow:"0 4px 20px #0003",
          whiteSpace:"nowrap" }}>
          {toast.tipo==="error"?"❌":"✅"} {toast.msg}
        </div>
      )}
    </div>
  );
}
