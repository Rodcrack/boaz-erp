// BOAZ ERP — entrada principal: inicio de sesión, menú y carga de datos.
// Los módulos están en la carpeta ./erp/
import { useState, useEffect, useCallback, useRef, useMemo, Fragment } from "react";
import { B, EstadoVacio, Ico, ModalCambiarClave, emailValido, errorAuthEs, traducirError, PaletaComandos, ROLES_ACCESO, Toast, cargarPedidosLiviano, sb, setTarifasDistritoGlobal, traerTodo } from "./erp/base.jsx";
import { Dashboard } from "./erp/dashboard.jsx";
import { Pedidos } from "./erp/pedidos.jsx";
import { Clientes, Repartidores } from "./erp/clientes.jsx";
import { LiquidacionTransporte, Unidades } from "./erp/flota.jsx";
import { Cobranza, Cotizaciones, Facturacion, LiquidacionClientes, Liquidaciones } from "./erp/ventas.jsx";
import { Incidencias, Rentabilidad, ServiciosCliente, UsuariosAuditoria } from "./erp/operacion.jsx";
import { Gastos, Planilla } from "./erp/costos.jsx";
import { Inventario } from "./erp/inventario.jsx";
import { ConfiguracionGeneral, Reportes } from "./erp/reportes.jsx";
import { PrimerosPasos } from "./erp/ayuda.jsx";

export function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  const [aviso, setAviso] = useState("");

  const recuperar = async () => {
    setAviso(""); setError("");
    if (!emailValido(email)) { setError("Escribe tu correo arriba y vuelve a pulsar «¿Olvidaste tu contraseña?»."); return; }
    setCargando(true);
    const { error } = await sb.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: window.location.origin + window.location.pathname });
    setCargando(false);
    if (error) { setError(errorAuthEs(error.message)); return; }
    setAviso("Si el correo tiene una cuenta, te llegará un enlace para crear una contraseña nueva. Revisa también la carpeta de spam.");
  };

  const entrar = async () => {
    if (!email || !password) { setError("Completa email y contraseña"); return; }
    setCargando(true); setError("");
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) { setError(/invalid login credentials/i.test(error.message||"") ? "Correo o contraseña incorrectos." : traducirError(error.message).texto); setCargando(false); return; }
    onLogin(data.session);
  };

  return (
    <div style={{ minHeight:"100vh", background:`radial-gradient(1200px 600px at 20% 0%, ${B.navyLt} 0%, ${B.navy} 60%)`, display:"flex",
      alignItems:"center", justifyContent:"center",
      fontFamily:"'Inter','Segoe UI',sans-serif" }}>
      <div style={{ width:360, background:B.navyMd, border:`1px solid ${B.navyBdr}`,
        borderRadius:16, padding:32, boxShadow:"0 20px 60px #0006" }}>
        <div style={{ textAlign:"center", marginBottom:24 }}>
          <div style={{ display:"inline-flex", alignItems:"center", gap:2, marginBottom:6 }}>
            <span style={{ fontSize:28, fontWeight:900, color:"#E8EAF0" }}>BOA</span>
            <span style={{ fontSize:28, fontWeight:900, color:B.gold }}>Z</span>
            <span style={{ fontSize:12, color:"#8FA3BA", marginLeft:6, fontWeight:500 }}>ERP</span>
          </div>
          <div style={{ fontSize:12, color:"#8FA3BA" }}>Panel administrativo</div>
          <div style={{ fontSize:11, color:B.gold, marginTop:6, fontWeight:600 }}>Con Boaz, tu negocio no para</div>
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
          style={{ width:"100%", background:"#D46A08",
            border:"none", color:"#fff", padding:"11px", borderRadius:8,
            cursor:cargando?"not-allowed":"pointer", fontSize:13, fontWeight:800 }}>
          {cargando?"Procesando...":"Ingresar"}
        </button>
        {aviso && <div role="status" style={{ background:"#052e1a", border:"1px solid #22C55E55", borderRadius:8, padding:"10px 12px", color:"#86EFAC", fontSize:12, marginTop:12, textAlign:"center", lineHeight:1.5 }}>{aviso}</div>}
        <button onClick={recuperar} disabled={cargando} style={{ display:"block", margin:"14px auto 0", background:"none", border:"none", color:"#8FA3BA", fontSize:12, cursor:"pointer", textDecoration:"underline" }}>¿Olvidaste tu contraseña?</button>
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

  // null | "voluntario" | "primer_ingreso" | "recuperacion"
  const [cambiarClave, setCambiarClave] = useState(null);
  useEffect(() => {
    // Al volver desde el enlace «¿Olvidaste tu contraseña?», Supabase avisa PASSWORD_RECOVERY
    const esRecuperacion = /type=recovery/.test(window.location.hash || "");
    if (esRecuperacion) setCambiarClave("recuperacion");
    const { data:sub } = sb.auth.onAuthStateChange((evento, session) => {
      if (evento==="PASSWORD_RECOVERY") { setCambiarClave("recuperacion"); if (session) cargarUsuario(session); }
    });
    sb.auth.getSession().then(({data}) => {
      if (data.session) cargarUsuario(data.session);
      else setVerificando(false);
    });
    return () => { try { sub.subscription.unsubscribe(); } catch {} };
  }, []);

  const cargarUsuario = async (session) => {
    const { data } = await sb.from("usuarios").select("*").eq("id", session.user.id).single();
    setSesion(session); setUsuario(data); setVerificando(false);
    if (session?.user?.user_metadata?.debe_cambiar_clave) setCambiarClave(c => c || "primer_ingreso");
  };
  const claveCambiada = async () => {
    setCambiarClave(null);
    if (window.location.hash) history.replaceState(null, "", window.location.pathname + window.location.search);
    const { data } = await sb.auth.getSession(); if (data.session) setSesion(data.session);
  };

  const cerrarSesion = async () => {
    await sb.auth.signOut();
    setSesion(null); setUsuario(null); setCambiarClave(null);
  };
  const [seccion, setSeccionBase] = useState("dashboard");
  const [tabConfig, setTabConfig] = useState({ tab:"tarifas", n:0 });
  const setSeccion = useCallback((id) => { if (id==="catalogo") { setTabConfig(t => ({ tab:"tarifas", n:t.n+1 })); setSeccionBase("configuracion"); } else setSeccionBase(id); }, []);
  // Conteos ligeros para la página Primeros pasos
  const [nFacturasAyuda, setNFacturasAyuda] = useState(0);
  const [nUsuariosAyuda, setNUsuariosAyuda] = useState(1);
  useEffect(() => {
    if (seccion!=="ayuda") return;
    let vivo = true;
    (async () => { try {
      const [f,u] = await Promise.all([sb.from("facturas").select("id",{count:"exact",head:true}), sb.from("usuarios").select("id",{count:"exact",head:true})]);
      if (vivo) { if (f.count!=null) setNFacturasAyuda(f.count); if (u.count!=null) setNUsuariosAyuda(Math.max(1,u.count)); }
    } catch {} })();
    return () => { vivo = false; };
  }, [seccion]);
  const [pedidos, setPedidos] = useState([]);
  const [repartidores, setRepartidores] = useState([]);
  const [empresas, setEmpresas] = useState([]);
  const [liquidaciones, setLiquidaciones] = useState([]);
  const [cotizNuevas, setCotizNuevas] = useState(0);
  const [incAbiertasNav, setIncAbiertasNav] = useState(0);
  const [lineasNegocio, setLineasNegocio] = useState([]);
  const [tiposServicio, setTiposServicio] = useState([]);
  const [unidades, setUnidades] = useState([]);
  const [asignacionesUnidad, setAsignacionesUnidad] = useState([]);
  const [tarifariosCliente, setTarifariosCliente] = useState([]);
  const [tarifarioVehiculoCliente, setTarifarioVehiculoCliente] = useState([]);
  const [tarifarioEstandar, setTarifarioEstandar] = useState([]);
  const [tarifarioVehiculoEstandar, setTarifarioVehiculoEstandar] = useState([]);
  const [tarifasViajeCliente, setTarifasViajeCliente] = useState([]);
  const [tarifasDistrito, setTarifasDistrito] = useState([]);
  const [tarifarioViajeEstandar, setTarifarioViajeEstandar] = useState([]);
  const [recargoFeriadoPct, setRecargoFeriadoPct] = useState(0);
  const [diasServicio, setDiasServicio] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [toast, setToast] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const showToast = useCallback((msg, tipo="ok") => setToast({msg,tipo}), []);

  const cargar = useCallback(async (opts={}) => {
    if (!opts.silencioso) setCargando(true);
    try {
      const [p,r,e,l,ln,ts,u,au,tc,ds,tv,te,tve,cr,tvj,tvje,tdc] = await Promise.all([
        cargarPedidosLiviano(),
        sb.from("repartidores").select("*").order("nombres"),
        sb.from("empresas").select("*").order("nombre"),
        traerTodo(() => sb.from("liquidaciones").select("*").order("created_at",{ascending:false}).order("id")),
        sb.from("lineas_negocio").select("*").order("codigo"),
        sb.from("tipos_servicio").select("*").order("codigo"),
        sb.from("unidades_transporte").select("*").order("placa"),
        sb.from("asignaciones_unidad").select("*").order("fecha_inicio",{ascending:false}),
        sb.from("tarifarios_cliente").select("*"),
        traerTodo(() => sb.from("dias_servicio_unidad").select("*").order("id")),
        sb.from("tarifarios_vehiculo_cliente").select("*"),
        sb.from("tarifario_estandar").select("*"),
        sb.from("tarifario_vehiculo_estandar").select("*"),
        sb.from("configuracion_recargos").select("*").limit(1).maybeSingle(),
        sb.from("tarifarios_viaje_cliente").select("*"),
        sb.from("tarifario_viaje_estandar").select("*").order("concepto"),
        sb.from("tarifas_distrito_cliente").select("*").order("distrito"),
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
      if(tvj.data) setTarifasViajeCliente(tvj.data);
      if(tvje.data) setTarifarioViajeEstandar(tvje.data);
      if(tdc && tdc.data) { setTarifasDistritoGlobal(tdc.data); setTarifasDistrito(tdc.data); }
    } catch(err) { console.error(err); }
    if (!opts.silencioso) setCargando(false);
  }, []);

  const cargarSilencioso = useCallback(() => cargar({ silencioso:true }), [cargar]);

  // Contador de cotizaciones nuevas (formulario de la web) para la insignia del menú
  useEffect(() => {
    let vivo = true;
    const contar = async () => {
      const { count } = await sb.from("cotizaciones").select("id", { count:"exact", head:true }).eq("estado","nueva");
      if (vivo && count != null) setCotizNuevas(count);
      try { const r = await sb.from("incidencias").select("id", { count:"exact", head:true }).eq("estado","abierta"); if (vivo && r.count != null) setIncAbiertasNav(r.count); } catch {}
    };
    contar();
    const t = setInterval(contar, 60000);
    return () => { vivo = false; clearInterval(t); };
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  // Realtime
  useEffect(() => {
    let t = null;
    const ch = sb.channel("boaz-rt")
      .on("postgres_changes",{event:"*",schema:"public",table:"pedidos"},() => { clearTimeout(t); t = setTimeout(() => cargarSilencioso(), 1500); })
      .subscribe();
    return () => { clearTimeout(t); sb.removeChannel(ch); };
  }, [cargarSilencioso]);

  const NAV = [
    { section:"OPERACIÓN" },
    { id:"dashboard",    icon:"dashboard", label:"Dashboard" },
    { id:"ayuda",        icon:"book",      label:"Primeros pasos" },
    { id:"pedidos",      icon:"package",   label:"Pedidos",
      badge: pedidos.filter(p=>p.estado==="sin_asignar").length || null },
    { id:"servicios",    icon:"map",       label:"Viajes y servicios" },
    { id:"repartidores", icon:"bike",      label:"Repartidores" },
    { id:"unidades",     icon:"truck",     label:"Flota" },
    { id:"incidencias",  icon:"alert",     label:"Incidencias", badge: incAbiertasNav || null },
    { section:"ALMACÉN" },
    { id:"inventario",   icon:"warehouse", label:"Inventario" },
    { section:"COMERCIAL" },
    { id:"clientes",     icon:"building",  label:"Clientes" },
    { id:"cotizaciones", icon:"mail",      label:"Cotizaciones", badge: cotizNuevas || null },
    { section:"VENTAS Y COBRANZA" },
    { id:"liquidacion-clientes", icon:"filetext", label:"Pre-facturación" },
    { id:"facturacion",  icon:"receipt",   label:"Facturación" },
    { id:"cobranza",     icon:"dollar",    label:"Cobranza" },
    { section:"COSTOS Y PAGOS" },
    { id:"liquidaciones",icon:"wallet",    label:"Liq. Repartidores",
      badge: liquidaciones.filter(l=>l.estado==="pendiente").length || null },
    { id:"liquidacion-transporte", icon:"calendar", label:"Liq. Transporte" },
    { id:"planilla",     icon:"users",     label:"Planilla" },
    { id:"gastos",       icon:"banknote",  label:"Gastos" },
    { section:"ANÁLISIS" },
    { id:"reportes",     icon:"chart",     label:"Reportes" },
    { id:"rentabilidad", icon:"trend",     label:"Rentabilidad" },
    { section:"SISTEMA" },
    { id:"usuarios",     icon:"shield",    label:"Usuarios y auditoría" },
    { id:"configuracion",icon:"settings",  label:"Configuración" },
  ];

  const [anchoVentana, setAnchoVentana] = useState(() => typeof window!=="undefined" ? window.innerWidth : 1200);
  const [drawerNav, setDrawerNav] = useState(false);
  useEffect(() => {
    const f = () => setAnchoVentana(window.innerWidth);
    window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, []);
  const esMovil = anchoVentana <= 900;
  const navAbierto = esMovil ? true : sidebarOpen;
  const sideW = esMovil ? 250 : (sidebarOpen ? 220 : 60);
  
  const [permisosDB, setPermisosDB] = useState(null);
  const cargarPermisos = useCallback(async () => {
    try {
      const { data, error } = await sb.from("roles_permisos").select("rol,modulos");
      if (!error && data && data.length) { const m = {}; data.forEach(r => { m[r.rol] = r.modulos||[]; }); setPermisosDB(m); }
    } catch {}
  }, []);
  useEffect(() => { if (usuario) cargarPermisos(); }, [usuario, cargarPermisos]);
  const [paleta, setPaleta] = useState(false);
  useEffect(() => {
    const h = (e) => { if ((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==="k") { e.preventDefault(); setPaleta(v=>!v); } };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
  const [secAbiertas, setSecAbiertas] = useState(() => {
    try { return JSON.parse(localStorage.getItem("boaz_nav_abiertas")||"{}"); } catch { return {}; }
  });
  const toggleSec = (nombre) => setSecAbiertas(prev => {
    const nuevo = { ...prev, [nombre]: !prev[nombre] };
    try { localStorage.setItem("boaz_nav_abiertas", JSON.stringify(nuevo)); } catch {}
    return nuevo;
  });
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

  const modulosRol = usuario.rol==="admin" ? ROLES_ACCESO.admin : [...new Set(["dashboard","ayuda", ...((permisosDB && permisosDB[usuario.rol]) || ROLES_ACCESO[usuario.rol] || [])])];
  // «Tarifas y servicios» ahora vive dentro de Configuración: quien tenga permiso de catálogo también ve Configuración
  const accesoConfig = modulosRol.includes("configuracion") || modulosRol.includes("catalogo");
  const puedeVer = (id) => modulosRol.includes(id) || (id==="configuracion" && accesoConfig);
  const navVisible = NAV.filter(n => n.section || puedeVer(n.id)).filter((n,i,arr) => !n.section || (arr[i+1] && !arr[i+1].section));
  const seccionOk = puedeVer(seccion);
  const navConSeccion = (() => { let act = null; return navVisible.map(n => { if (n.section) act = n.section; return { ...n, _sec: act }; }); })();
  const modulosLista = (() => {
    const base = navConSeccion.filter(x=>!x.section).map(x=>({ id:x.id, label:x.label, icon:x.icon, grupo:x._sec }));
    if (!modulosRol.includes("catalogo")) return base;
    const i = base.findIndex(x=>x.id==="configuracion");
    const cat = { id:"catalogo", label:"Tarifarios y servicios", icon:"tag", grupo:"SISTEMA" };
    return i>=0 ? [...base.slice(0,i), cat, ...base.slice(i)] : [...base, cat];
  })();
  const contieneActiva = (nombre) => navConSeccion.some(x => !x.section && x._sec===nombre && x.id===seccion);
  const badgeSec = (nombre) => navConSeccion.filter(x => !x.section && x._sec===nombre).reduce((t,x)=>t+(x.badge||0),0);
  
  return (
    <div style={{ display:"flex", height:"100vh", background:B.bg,
      color:B.textPri, fontFamily:"'Inter','Segoe UI',sans-serif", overflow:"hidden" }}>

      {/* SIDEBAR */}
      {esMovil && drawerNav && <div className="bz-overlay-nav" onClick={()=>setDrawerNav(false)}/>}
      <div style={{ width:sideW, background:B.navy, display:"flex",
        flexDirection:"column", flexShrink:0, transition: esMovil ? "transform .22s" : "width 0.2s",
        boxShadow:"4px 0 20px #0D1E3D33", overflow:"hidden",
        ...(esMovil ? { position:"fixed", top:0, bottom:0, left:0, zIndex:50, transform: drawerNav ? "none" : "translateX(-105%)" } : {}) }}>

        {/* Logo */}
        <div style={{ padding:"18px 14px 14px", borderBottom:"1px solid #1E3560",
          display:"flex", alignItems:"center", gap:10, minHeight:70 }}>
          <div style={{ width:36, height:36, flexShrink:0,
            background:"#D46A08",
            borderRadius:10, display:"flex", alignItems:"center",
            justifyContent:"center", fontSize:18, fontWeight:800 }}>B</div>
          {navAbierto && (
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
          <button onClick={()=> esMovil ? setDrawerNav(false) : setSidebarOpen(s=>!s)}
            style={{ marginLeft:"auto", background:"none", border:"none",
              color:"#8FA3BA", cursor:"pointer", fontSize:16, flexShrink:0 }}>
            <Ico n={esMovil?"x":(sidebarOpen?"panel":"panelr")} size={18}/>
          </button>
        </div>

        {/* Nav */}
        <nav style={{ flex:1, padding:"12px 8px", overflowY:"auto" }}>
          
  {navConSeccion.map((n,i) => {
            if (n.section) {
              if (!navAbierto) return <div key={i} style={{ margin:"8px 0", height:1, background:"#1E3560" }}/>;
              const cerrada = !secAbiertas[n.section] && !contieneActiva(n.section);
              const bs = cerrada ? badgeSec(n.section) : 0;
              return (
                <div key={i} onClick={()=>toggleSec(n.section)}
                  style={{ display:"flex", alignItems:"center", justifyContent:"space-between", cursor:"pointer",
                    fontSize:10, fontWeight:700, color:"#8FA3BA", letterSpacing:"1.2px",
                    textTransform:"uppercase", padding:"10px 8px 6px", userSelect:"none" }}>
                  <span>{n.section}</span>
                  <span style={{ display:"flex", alignItems:"center", gap:6 }}>
                    {bs ? <span style={{ background:B.red, color:"#fff", fontSize:9, fontWeight:700, padding:"2px 6px", borderRadius:10 }}>{bs}</span> : null}
                    <span style={{ fontSize:9, display:"inline-block", transition:"transform .15s", transform: cerrada?"rotate(-90deg)":"none" }}>▼</span>
                  </span>
                </div>
              );
            }
            if (navAbierto && !secAbiertas[n._sec] && !contieneActiva(n._sec)) return null;
            const active = seccion===n.id;
            return (
              <div key={n.id} className="bz-nav-item" onClick={()=>{ setSeccion(n.id); setDrawerNav(false); }}
                style={{ display:"flex", alignItems:"center", gap:10,
                  padding: navAbierto?"10px 10px":"10px 0",
                  justifyContent: navAbierto?"flex-start":"center",
                  borderRadius:8, cursor:"pointer", marginBottom:2,
                  background: active?`linear-gradient(135deg,${B.gold}22,${B.gold}11)`:"transparent",
                  borderLeft: active?`3px solid ${B.gold}`:"3px solid transparent",
                  color: active?B.gold:"#8FA3BA",
                  fontWeight: active?700:400, fontSize:13, transition:"all 0.15s" }}>
                <Ico n={n.icon} size={18}/>
                {navAbierto && <span style={{ flex:1, whiteSpace:"nowrap" }}>{n.label}</span>}
                {navAbierto && n.badge ? (
                  <span style={{ background:B.red, color:"#fff", fontSize:10, minWidth:18, textAlign:"center",
                    fontWeight:700, padding:"2px 6px", borderRadius:10 }}>{n.badge>99?"99+":n.badge}</span>
                ) : null}
              </div>
            );
          })}
        </nav>

        {/* Footer */}
        {navAbierto && (
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
          padding: esMovil ? "10px 12px" : "12px 24px", gap: esMovil ? 8 : 0, background:B.white,
          borderBottom:`1px solid ${B.border}`,
          boxShadow:"0 1px 2px #0D1E3D0D", flexShrink:0 }}>
          {esMovil && <button onClick={()=>setDrawerNav(true)} aria-label="Menú"
            style={{ background:B.bg, border:`1px solid ${B.border}`, borderRadius:8, padding:"7px 9px", cursor:"pointer", color:B.navy, display:"flex", flexShrink:0 }}><Ico n="menu" size={20}/></button>}
          <div style={{ minWidth:0, flex: esMovil ? 1 : "none" }}>
            <div className="bz-oculta-movil" style={{ fontSize:11, color:B.textMut, fontWeight:600, letterSpacing:"0.6px", textTransform:"uppercase", marginBottom:2 }}>
              {navConSeccion.find(n=>n.id===seccion)?._sec || "Boaz ERP"}
            </div>
            <div style={{ fontSize: esMovil?16:19, fontWeight:800, color:B.navy, display:"flex", alignItems:"center", gap:8, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
              <Ico n={NAV.find(n=>n.id===seccion)?.icon} size={20} color={B.gold}/>
              {NAV.find(n=>n.id===seccion)?.label}
            </div>
          </div>
          <button onClick={()=>setPaleta(true)} aria-label="Buscar"
            style={{ flex: esMovil ? "0 0 auto" : "0 1 380px", margin: esMovil ? 0 : "0 20px", display:"flex", alignItems:"center", gap:10, background:B.bg,
              border:`1px solid ${B.border}`, borderRadius:10, padding:"9px 14px", cursor:"pointer", color:B.textMut, fontSize:13, textAlign:"left" }}>
            <Ico n="search" size={16}/>
            <span className="bz-oculta-movil" style={{ flex:1 }}>Buscar pedido, cliente, placa…</span>
            <span className="bz-oculta-movil" style={{ fontSize:10, border:`1px solid ${B.border}`, borderRadius:6, padding:"2px 6px", background:B.white }}>Ctrl K</span>
          </button>
          <div style={{ display:"flex", gap: esMovil ? 6 : 10, alignItems:"center", flexShrink:0 }}>
            <button onClick={cargar} aria-label="Actualizar"
              style={{ background:B.bg, border:`1px solid ${B.border}`,
                color:B.textSec, padding: esMovil ? "9px 10px" : "7px 14px", borderRadius:8,
                cursor:"pointer", fontSize:12, display:"flex", alignItems:"center", gap:6 }}><Ico n="refresh" size={esMovil?16:14}/> <span className="bz-oculta-movil">Actualizar</span></button>
            {!esMovil && <button onClick={()=>setSeccion("ayuda")} title="Primeros pasos, preguntas frecuentes y glosario" aria-label="Ayuda"
              style={{ background: seccion==="ayuda" ? `${B.gold}1A` : B.bg, border:`1px solid ${seccion==="ayuda" ? B.gold : B.border}`, color: seccion==="ayuda" ? B.goldDk : B.textSec,
                width:34, height:34, borderRadius:8, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}><Ico n="help" size={17}/></button>}
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
  <div className="bz-oculta-movil" style={{ textAlign:"right" }}>
    <div style={{ fontSize:12, fontWeight:700, color:B.navy }}>{usuario.nombre}</div>
    <div style={{ fontSize:10, color:B.textMut, textTransform:"capitalize" }}>{usuario.rol}</div>
  </div>
  <div className="bz-oculta-movil" style={{ width:36, height:36,
    background:`linear-gradient(135deg,${B.navy},${B.navyLt})`,
    borderRadius:"50%", display:"flex", alignItems:"center",
    justifyContent:"center", fontSize:14, fontWeight:800, color:B.gold }}>
    {usuario.nombre?.[0]}
  </div>
  <button onClick={()=>setCambiarClave("voluntario")} aria-label="Cambiar mi contraseña" title="Cambiar mi contraseña"
    style={{ background:"none", border:`1px solid ${B.border}`, color:B.textSec,
      padding: esMovil ? "9px 10px" : "6px 8px", borderRadius:6, cursor:"pointer", display:"flex", alignItems:"center" }}><Ico n="key" size={13}/></button>
  <button onClick={cerrarSesion} aria-label="Salir"
    style={{ background:"none", border:`1px solid ${B.border}`, color:B.textSec,
      fontSize:11, padding: esMovil ? "9px 10px" : "6px 10px", borderRadius:6, cursor:"pointer", display:"flex", alignItems:"center", gap:5 }}><Ico n="logout" size={13}/> <span className="bz-oculta-movil">Salir</span></button>
</div>
</div>
</div>
        {/* Contenido */}
        <div style={{ flex:1, overflowY:"auto", padding: esMovil ? 12 : 24 }}>
          {cargando ? (
            <div style={{ display:"flex", flexDirection:"column", alignItems:"center",
              justifyContent:"center", height:"100%", gap:16 }}>
              <div style={{ width:48, height:48,
                background:"#D46A08",
                borderRadius:12, display:"flex", alignItems:"center",
                justifyContent:"center", color:"#fff", animation:"spin 1s linear infinite" }}><Ico n="package" size={26}/></div>
              <div style={{ fontSize:14, color:B.textMut }}>Cargando Boaz ERP...</div>
            </div>
          ) : (
            <>
              {!seccionOk && <EstadoVacio icono="shield" titulo="Sin acceso a este módulo" texto="Tu rol no tiene permiso para verlo. Pide a un administrador que lo habilite."/>}
              {seccionOk && seccion==="dashboard"     && <Dashboard pedidos={pedidos} repartidores={repartidores} liquidaciones={liquidaciones} empresas={empresas} asignaciones={asignacionesUnidad} diasServicio={diasServicio} recargoFeriadoPct={recargoFeriadoPct} cotizNuevas={cotizNuevas} modulos={modulosRol} onIr={setSeccion}/>}
              {seccionOk && seccion==="pedidos"       && <Pedidos pedidos={pedidos} repartidores={repartidores} empresas={empresas} tarifariosCliente={tarifariosCliente} tarifarioEstandar={tarifarioEstandar} onRefresh={cargarSilencioso} toast={showToast}/>}
              {seccionOk && seccion==="repartidores"  && <Repartidores repartidores={repartidores} pedidos={pedidos} onRefresh={cargarSilencioso} toast={showToast}/>}
              {seccionOk && seccion==="unidades"      && <Unidades unidades={unidades} asignaciones={asignacionesUnidad} empresas={empresas} tiposServicio={tiposServicio} repartidores={repartidores} tarifarioVehiculoCliente={tarifarioVehiculoCliente} tarifarioVehiculoEstandar={tarifarioVehiculoEstandar} onRefresh={cargarSilencioso} toast={showToast} onIr={setSeccion}/>}
              {seccionOk && seccion==="inventario"    && <Inventario empresas={empresas} toast={showToast}/>}
              {seccionOk && seccion==="clientes"      && <Clientes empresas={empresas} tarifasDistrito={tarifasDistrito} pedidos={pedidos} lineasNegocio={lineasNegocio} tarifariosCliente={tarifariosCliente} tarifarioVehiculoCliente={tarifarioVehiculoCliente} tarifarioEstandar={tarifarioEstandar} tarifarioVehiculoEstandar={tarifarioVehiculoEstandar} tarifasViajeCliente={tarifasViajeCliente} tarifarioViajeEstandar={tarifarioViajeEstandar} onRefresh={cargarSilencioso} toast={showToast}/>}
              {seccionOk && seccion==="cotizaciones"  && <Cotizaciones toast={showToast} onCambio={setCotizNuevas}/>}
                            {seccionOk && seccion==="liquidaciones" && <Liquidaciones repartidores={repartidores} pedidos={pedidos} liquidaciones={liquidaciones} onRefresh={cargarSilencioso} toast={showToast}/>}
              {seccionOk && seccion==="liquidacion-transporte" && <LiquidacionTransporte onIr={setSeccion} unidades={unidades} asignaciones={asignacionesUnidad} empresas={empresas} tiposServicio={tiposServicio} diasServicio={diasServicio} recargoFeriadoPct={recargoFeriadoPct} onRefresh={cargarSilencioso} toast={showToast}/>}
              {seccionOk && seccion==="liquidacion-clientes" && <LiquidacionClientes pedidos={pedidos} empresas={empresas} unidades={unidades} asignacionesUnidad={asignacionesUnidad} diasServicio={diasServicio} tarifarioVehiculoEstandar={tarifarioVehiculoEstandar} recargoFeriadoPct={recargoFeriadoPct} toast={showToast}/>}
              {seccionOk && seccion==="facturacion"   && <Facturacion empresas={empresas} pedidos={pedidos} tiposServicio={tiposServicio} usuario={usuario} toast={showToast}/>}
              {seccionOk && seccion==="servicios"     && <ServiciosCliente empresas={empresas} repartidores={repartidores} unidades={unidades} tarifasViajeCliente={tarifasViajeCliente} tarifarioViajeEstandar={tarifarioViajeEstandar} usuario={usuario} toast={showToast}/>}
              {seccionOk && seccion==="incidencias"   && <Incidencias pedidos={pedidos} empresas={empresas} repartidores={repartidores} usuario={usuario} toast={showToast}/>}
              {seccionOk && seccion==="usuarios"      && <UsuariosAuditoria usuario={usuario} navModulos={modulosLista} onPermisosCambio={cargarPermisos} toast={showToast}/>}
              {seccionOk && seccion==="cobranza"      && <Cobranza pedidos={pedidos} empresas={empresas} repartidores={repartidores} onRefresh={cargarSilencioso} toast={showToast}/>}
              {seccionOk && seccion==="gastos"        && <Gastos unidades={unidades} repartidores={repartidores} usuario={usuario} toast={showToast}/>}
              {seccionOk && seccion==="planilla"      && <Planilla toast={showToast} repartidores={repartidores}/>}
              {seccionOk && seccion==="rentabilidad"  && <Rentabilidad pedidos={pedidos} empresas={empresas} repartidores={repartidores} unidades={unidades} asignaciones={asignacionesUnidad} diasServicio={diasServicio} recargoFeriadoPct={recargoFeriadoPct} toast={showToast}/>}
              {seccionOk && seccion==="reportes"      && <Reportes pedidos={pedidos} repartidores={repartidores} empresas={empresas} toast={showToast} onIr={setSeccion}/>}
              {seccionOk && seccion==="configuracion" && <ConfiguracionGeneral key={tabConfig.n} verTarifas={modulosRol.includes("catalogo")} verEmpresa={modulosRol.includes("configuracion")} tabInicial={tabConfig.tab}
                propsCatalogo={{ empresas:empresas, tarifasDistrito:tarifasDistrito, tarifariosCliente:tarifariosCliente, tarifarioVehiculoCliente:tarifarioVehiculoCliente, tarifasViajeCliente:tarifasViajeCliente, tarifarioViajeEstandar:tarifarioViajeEstandar, lineasNegocio:lineasNegocio, tiposServicio:tiposServicio, tarifarioEstandar:tarifarioEstandar, tarifarioVehiculoEstandar:tarifarioVehiculoEstandar, recargoFeriadoPct:recargoFeriadoPct, }} onRefresh={cargarSilencioso} toast={showToast} onIr={setSeccion}/>}
              {seccionOk && seccion==="ayuda"         && <PrimerosPasos empresas={empresas} repartidores={repartidores} unidades={unidades} pedidos={pedidos} nFacturas={nFacturasAyuda} nUsuarios={nUsuariosAyuda} onIr={setSeccion}/>}
            </>
          )}
        </div>
      </div>

      {toast && <Toast msg={toast.msg} tipo={toast.tipo} onClose={()=>setToast(null)}/>}
      {cambiarClave && <ModalCambiarClave motivo={cambiarClave} toast={showToast} onListo={claveCambiada} onCancelar={()=>setCambiarClave(null)}/>}
      {paleta && <PaletaComandos onCerrar={()=>setPaleta(false)} onIr={setSeccion}
        modulos={modulosLista}
        pedidos={pedidos} empresas={empresas} unidades={unidades} repartidores={repartidores}/>}
    </div>
  );
}
