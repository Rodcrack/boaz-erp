// BOAZ ERP — módulo "clientes" (parte de BoazERP; ver src/BoazERP.jsx)
import { useState, useEffect, useCallback, useRef, useMemo, Fragment } from "react";
import { B, BtnIco, BtnPri, BtnSec, Buscador, CARD, EstadoVacio, Ico, TAB_CONT, TAB_SEG, Tabs, XLSX, ZONAS_LIMA, asegurarXLSX, fmt, inp, lbl, normDist, obtenerTarifaEstandar, sb } from "./base.jsx";

// ══════════════════════════════════════════════════════════════
// MÓDULO 3: REPARTIDORES
// ══════════════════════════════════════════════════════════════
export function Repartidores({ repartidores, pedidos, onRefresh, toast }) {
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState(null);
  const [vista, setVista] = useState("cards");
  const emptyForm = { nombres:"", apellidos:"", dni:"", telefono:"",
    email:"", vehiculo:"moto", placa:"", zona_default:"urbano", usuario:"", password_hash:"",
    modo_pago:"por_pedido", tarifa_variable:"", sueldo_fijo_mensual:"", tipo_sueldo_fijo:"planilla" };
  const [f, setF] = useState(emptyForm);

  const guardar = async () => {
    if (!f.nombres || !f.dni) { toast("Nombre y DNI son obligatorios","error"); return; }
    const payload = { ...f, email: f.email?.trim() ? f.email.trim() : null,
      usuario: f.usuario?.trim() ? f.usuario.trim().toLowerCase() : null,
      password_hash: f.password_hash?.trim() ? f.password_hash.trim() : null,
      tarifa_variable: f.modo_pago==="por_pedido" ? (parseFloat(f.tarifa_variable)||0) : 0,
      sueldo_fijo_mensual: f.modo_pago==="sueldo_fijo" ? (parseFloat(f.sueldo_fijo_mensual)||0) : 0,
      tipo_sueldo_fijo: f.modo_pago==="sueldo_fijo" ? f.tipo_sueldo_fijo : null,
      activo:true };
    let error;
    if (editando) {
      if (!f.password_hash?.trim()) delete payload.password_hash; // PIN cifrado: vacío = no cambiar
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

  const abrirEditar = (r) => { setEditando(r); setF({...r, password_hash:""}); setModal(true); };

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
        <div style={{ ...TAB_CONT }}>
          {["cards","tabla"].map(v=>(
            <button key={v} onClick={()=>setVista(v)}
              style={TAB_SEG(vista===v)}>
              <Ico n={v==="cards"?"grid":"list"} size={14}/>{v==="cards"?"Tarjetas":"Tabla"}
            </button>
          ))}
        </div>
        <BtnPri onClick={()=>{setEditando(null);setF(emptyForm);setModal(true);}}><Ico n="plus" size={15} sw={2.4}/> Nuevo repartidor</BtnPri>
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
                boxShadow:"0 1px 2px #0D1E3D0D" }}>
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
                  {[["phone",r.telefono||"—"],["truck",r.vehiculo||"—"],
                    ["tag",r.placa||"—"],["pin",r.zona_default?.replace("_"," ")||"—"]].map(([ic,v],i)=>(
                    <div key={i} style={{ fontSize:12, color:B.textSec, display:"flex", alignItems:"center", gap:7, minWidth:0 }}><Ico n={ic} size={14} color={B.textMut}/><span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", textTransform:ic==="pin"?"capitalize":"none" }}>{v}</span></div>
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
                    borderRadius:7, cursor:"pointer", fontSize:11 }}><Ico n="edit" size={13} style={{ display:"inline-block", verticalAlign:"-2px", marginRight:5 }}/>Editar</button>
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
          borderRadius:12, overflow:"hidden", boxShadow:"0 1px 2px #0D1E3D0D" }}>
          <table style={{ width:"100%", borderCollapse:"collapse" }}>
            <thead>
              <tr style={{ background:"#F6F9FC" }}>
                {["Nombre","DNI","Teléfono","Vehículo","Placa","Zona","Pedidos","Efectividad","Estado","Acciones"].map(h=>(
                  <th key={h} style={{ padding:"10px 14px", textAlign:"left", fontSize:11, color:B.textSec, fontWeight:700, letterSpacing:"0.3px", whiteSpace:"nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {repartidores.map((r,i) => {
                const misP = pedidos.filter(p=>p.repartidor_id===r.id);
                const ent = misP.filter(p=>p.estado==="entregado").length;
                return (
                  <tr key={r.id} style={{ borderTop:`1px solid ${B.border}`,
                    background:B.white }}>
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
                letterSpacing:"0.7px", marginBottom:10 }}>Acceso a la app (/app)</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                <div><label style={lbl}>Usuario</label>
                  <input style={inp} value={f.usuario||""} placeholder="ej. lmamani"
                    onChange={e=>setF(p=>({...p,usuario:e.target.value.trim().toLowerCase()}))}/></div>
                <div><label style={lbl}>PIN de acceso</label>
                  <input style={inp} value={f.password_hash||""} placeholder={editando ? "Dejar vacío para no cambiar el PIN" : "ej. últimos 4 del DNI"}
                    onChange={e=>setF(p=>({...p,password_hash:e.target.value.trim()}))}/></div>
              </div>
              <div style={{ fontSize:10, color:B.textMut, marginTop:8 }}>
                Con estos dos datos el repartidor inicia sesión en la app móvil. Déjalos vacíos si aún no debe tener acceso.
              </div>
            </div>

            <div style={{ marginTop:12, padding:"12px 14px", background:B.bg, borderRadius:10 }}>
              <div style={{ fontSize:11, fontWeight:700, color:B.navy, textTransform:"uppercase",
                letterSpacing:"0.7px", marginBottom:10 }}>Costo de reparto (para el modelo de rentabilidad)</div>
              <label style={lbl}>¿Cómo se le paga?</label>
              <select style={{ ...inp, marginBottom:12 }} value={f.modo_pago} onChange={e=>setF(p=>({...p,modo_pago:e.target.value}))}>
                <option value="por_pedido">Tarifa fija por pedido/día entregado</option>
                <option value="sueldo_fijo">Sueldo fijo mensual (no varía por volumen)</option>
              </select>
              {f.modo_pago==="por_pedido" ? (
                <div><label style={lbl}>Tarifa por pedido/día (S/)</label>
                  <input type="number" style={inp} value={f.tarifa_variable||""} onChange={e=>setF(p=>({...p,tarifa_variable:e.target.value}))}/>
                  <div style={{ fontSize:10, color:B.textMut, marginTop:4 }}>Si conduce una unidad de transporte, esto se interpreta como tarifa por día trabajado.</div>
                </div>
              ) : (
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                  <div><label style={lbl}>Sueldo mensual (S/)</label>
                    <input type="number" style={inp} value={f.sueldo_fijo_mensual||""} onChange={e=>setF(p=>({...p,sueldo_fijo_mensual:e.target.value}))}/></div>
                  <div><label style={lbl}>Tipo (solo referencia)</label>
                    <select style={inp} value={f.tipo_sueldo_fijo||"planilla"} onChange={e=>setF(p=>({...p,tipo_sueldo_fijo:e.target.value}))}>
                      <option value="planilla">Planilla</option>
                      <option value="honorarios">Recibo por honorarios (RxH)</option>
                    </select>
                  </div>
                </div>
              )}
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
export function Clientes({ tarifasDistrito=[], empresas, pedidos, lineasNegocio, tarifariosCliente, tarifarioVehiculoCliente, tarifarioEstandar, tarifarioVehiculoEstandar, tarifasViajeCliente=[], tarifarioViajeEstandar=[], onRefresh, toast }) {
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState(null);
  const [modalTarifario, setModalTarifario] = useState(null); // guarda la empresa seleccionada
  const [modalTarifarioVehiculo, setModalTarifarioVehiculo] = useState(null);
  const [modalTarifarioViaje, setModalTarifarioViaje] = useState(null);
  const empty = { nombre:"", ruc:"", contacto:"", telefono:"", email:"", direccion:"", puede_generar_etiquetas:false, puede_ver_liquidacion:false, linea_negocio_id:"", modalidades_tarifa:[] };
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
    toast(editando?"Cliente actualizado ✓":((f.modalidades_tarifa||[]).length?"Cliente registrado ✓ — configura sus tarifas desde su tarjeta":"Cliente registrado ✓"));
    setModal(false); setEditando(null); setF(empty); onRefresh();
  };

  const [busq, setBusq] = useState("");
  const statsEmp = useMemo(() => {
    const m = {};
    for (const p of pedidos) { if (!p.empresa_id) continue; const g = m[p.empresa_id] || (m[p.empresa_id] = { n:0, ing:0 }); g.n++; g.ing += parseFloat(p.tarifa_s)||0; }
    return m;
  }, [pedidos]);
  const qc = busq.trim().toLowerCase();
  const lista = !qc ? empresas : empresas.filter(e => `${e.nombre||""} ${e.ruc||""} ${e.codigo_interno||""} ${e.contacto||""}`.toLowerCase().includes(qc));
  const editar = (e, extra={}) => { setEditando(e); setF({ ...e, ...extra }); setModal(true); };

  return (
    <div>
      <div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap", marginBottom:16 }}>
        <Buscador value={busq} onChange={setBusq} placeholder="Buscar por nombre, RUC, código o contacto" width={360}/>
        <span style={{ fontSize:12, color:B.textSec }}>{lista.length} cliente{lista.length===1?"":"s"}</span>
        <BtnPri style={{ marginLeft:"auto" }} onClick={()=>{setEditando(null);setF(empty);setModal(true);}}><Ico n="plus" size={15} sw={2.4}/> Nuevo cliente</BtnPri>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(340px,1fr))", gap:14 }}>
        {lista.map(e => {
          const st = statsEmp[e.id] || { n:0, ing:0 };
          const linea = lineasNegocio.find(ln=>ln.id===e.linea_negocio_id);
          const mods = modalidadesDe(e, tarifariosCliente, tarifarioVehiculoCliente, tarifasViajeCliente);
          const info = {
            pedido:   { n: tarifariosCliente.filter(t=>t.empresa_id===e.id && t.activo).length, uno:"tarifa", otro:"tarifas", abrir:()=>setModalTarifario(e) },
            vehiculo: { n: tarifarioVehiculoCliente.filter(t=>t.empresa_id===e.id && t.activo).length, uno:"vehículo", otro:"vehículos", abrir:()=>setModalTarifarioVehiculo(e) },
            viaje:    { n: tarifasViajeCliente.filter(t=>t.empresa_id===e.id && t.activo).length, uno:"tarifa", otro:"tarifas", abrir:()=>setModalTarifarioViaje(e) },
          };
          const dato = (ico, v) => (
            <div style={{ display:"flex", alignItems:"center", gap:7, fontSize:12, color:v?B.textSec:B.textMut, minWidth:0 }}>
              <Ico n={ico} size={14} color={B.textMut}/><span title={v||""} style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{v||"Sin registrar"}</span>
            </div>);
          const permiso = (ok, txt) => (
            <span style={{ display:"inline-flex", alignItems:"center", gap:5, fontSize:12, color:ok?"#047857":B.textMut }}>
              <Ico n={ok?"check":"xcircle"} size={14}/>{txt}
            </span>);
          return (
            <div key={e.id} className="bz-card-hover" style={{ ...CARD, padding:18, display:"flex", flexDirection:"column", gap:14 }}>
              <div style={{ display:"flex", alignItems:"flex-start", gap:12 }}>
                <div style={{ width:40, height:40, borderRadius:10, background:B.navy, color:B.goldLt, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, fontWeight:800, flexShrink:0 }}>
                  {(e.nombre||"?").trim().split(/\s+/).slice(0,2).map(w=>w[0]).join("").toUpperCase()}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                    <span style={{ fontSize:15, fontWeight:800, color:B.navy }}>{e.nombre}</span>
                    {e.codigo_interno && <span style={{ fontSize:11, fontWeight:700, color:B.textSec, background:"#F1F5F9", padding:"1px 7px", borderRadius:6 }}>{e.codigo_interno}</span>}
                  </div>
                  <div style={{ fontSize:12, color:B.textMut, marginTop:2 }}>RUC {e.ruc||"—"}{linea ? ` · ${linea.nombre}` : ""}</div>
                </div>
                <BtnIco n="edit" title="Editar cliente" onClick={()=>editar(e)}/>
              </div>

              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"8px 12px" }}>
                {dato("user", e.contacto)}{dato("phone", e.telefono)}{dato("mail", e.email)}{dato("pin", e.direccion)}
              </div>

              <div>
                <div style={{ fontSize:11, fontWeight:700, color:B.textMut, letterSpacing:"0.3px", marginBottom:6 }}>TARIFARIO</div>
                <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                  {!mods.length ? (
                    <button onClick={()=>editar(e, { modalidades_tarifa:[] })}
                      style={{ display:"inline-flex", alignItems:"center", gap:6, fontSize:12, fontWeight:600, padding:"5px 10px", borderRadius:8, cursor:"pointer", border:`1px dashed #B4530988`, background:"#FFF7ED", color:"#B45309" }}>
                      <Ico n="alert" size={14}/> Sin tarifario habilitado · elegir
                    </button>
                  ) : MODALIDADES_TARIFA.filter(m=>mods.includes(m.id)).map(m => {
                    const x = info[m.id];
                    const regla = m.id!=="pedido" ? "" : e.modo_pedido==="fijo" && e.precio_fijo_pedido!=null ? `${fmt.sol(e.precio_fijo_pedido)} fijo` : e.modo_pedido==="distrito" ? `${tarifasDistrito.filter(t=>t.empresa_id===e.id).length} distritos` : "";
                    const ok = x.n>0 || !!regla;
                    return (
                      <button key={m.id} onClick={x.abrir} className="bz-btn-sec" title={ok ? "Ver o editar tarifas" : "Configurar tarifas"}
                        style={{ display:"inline-flex", alignItems:"center", gap:6, fontSize:12, fontWeight:600, padding:"5px 10px", borderRadius:8, cursor:"pointer",
                          border:`1px solid ${ok?B.border:"#B4530966"}`, background:ok?B.white:"#FFF7ED", color:ok?B.textPri:"#B45309" }}>
                        <Ico n={m.ico} size={14} color={ok?"#047857":"#B45309"}/>{m.label}
                        <span style={{ fontWeight:500, color:ok?B.textMut:"#B45309" }}>{regla || (ok ? `${x.n} ${x.n===1?x.uno:x.otro}` : "configurar")}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div style={{ display:"flex", gap:14, flexWrap:"wrap" }}>
                {permiso(e.puede_generar_etiquetas, "Etiquetas en portal")}{permiso(e.puede_ver_liquidacion, "Liquidación en portal")}
              </div>

              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, borderTop:`1px solid ${B.border}`, paddingTop:12, marginTop:"auto" }}>
                <div>
                  <div style={{ fontSize:12, color:B.textSec }}>Pedidos</div>
                  <div style={{ fontSize:18, fontWeight:800, color:B.textPri }}>{st.n.toLocaleString("en-US")}</div>
                </div>
                <div>
                  <div style={{ fontSize:12, color:B.textSec }}>Ingresos (sin IGV)</div>
                  <div style={{ fontSize:18, fontWeight:800, color:B.textPri }}>{fmt.sol(st.ing)}</div>
                </div>
              </div>
            </div>
          );
        })}
        {lista.length===0&&(
          <div style={{ gridColumn:"1/-1", ...CARD }}>
            <EstadoVacio icono="building" titulo={empresas.length===0 ? "Aún no hay clientes" : "Ningún cliente coincide"}
              texto={empresas.length===0 ? "Registra tu primer cliente y habilita cómo se le cobra: por pedido, por vehículo o por viaje." : "Prueba con otro nombre, RUC o código."}/>
          </div>
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
            <div style={{ marginTop:16, padding:"12px 14px", background:"#FFF8EF", border:`1px solid ${B.gold}55`, borderRadius:10 }}>
              <div style={{ fontSize:12, fontWeight:800, color:B.navy, marginBottom:4 }}>Tarifario habilitado para este cliente</div>
              <div style={{ fontSize:11, color:B.textMut, marginBottom:10 }}>Marca cómo se le cobra según el acuerdo comercial. Puedes habilitar más de una; después configuras las tarifas de cada una desde su tarjeta.</div>
              <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                {MODALIDADES_TARIFA.map(m => {
                  const on = (f.modalidades_tarifa||[]).includes(m.id);
                  return (
                    <label key={m.id} style={{ display:"flex", alignItems:"center", gap:8, fontSize:12.5, color:B.textPri, cursor:"pointer" }}>
                      <input type="checkbox" checked={on} style={{ width:16, height:16 }}
                        onChange={ev=>setF(p=>{ const cur = p.modalidades_tarifa||[]; return { ...p, modalidades_tarifa: ev.target.checked ? [...cur, m.id] : cur.filter(x=>x!==m.id) }; })}/>
                      <Ico n={m.ico} size={15} color={on?B.goldDk:B.textMut}/><span><b>{m.label}</b> <span style={{ color:B.textMut }}>— {m.ayuda}</span></span>
                    </label>);
                })}
              </div>
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:12,
              padding:"10px 12px", background:B.bg, borderRadius:8 }}>
              <input type="checkbox" id="etiquetas" checked={!!f.puede_generar_etiquetas}
                onChange={e=>setF(p=>({...p,puede_generar_etiquetas:e.target.checked}))}
                style={{ width:16, height:16 }}/>
              <label htmlFor="etiquetas" style={{ fontSize:13, color:B.textPri, cursor:"pointer" }}>
                Permitir que este cliente genere sus propias etiquetas en su portal
              </label>
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:10,
              padding:"10px 12px", background:B.bg, borderRadius:8 }}>
              <input type="checkbox" id="liquidacion" checked={!!f.puede_ver_liquidacion}
                onChange={e=>setF(p=>({...p,puede_ver_liquidacion:e.target.checked}))}
                style={{ width:16, height:16 }}/>
              <label htmlFor="liquidacion" style={{ fontSize:13, color:B.textPri, cursor:"pointer" }}>
                Permitir que este cliente genere su propia Liquidación de Entregas en su portal
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
        <ModalTarifarioCliente tarifasDistrito={tarifasDistrito} empresa={modalTarifario} tarifariosCliente={tarifariosCliente} tarifarioEstandar={tarifarioEstandar}
          onClose={()=>setModalTarifario(null)} onSaved={()=>{onRefresh();}} toast={toast}/>
      )}
      {modalTarifarioVehiculo && (
        <ModalTarifarioVehiculo empresa={modalTarifarioVehiculo} tarifarioVehiculoCliente={tarifarioVehiculoCliente} tarifarioVehiculoEstandar={tarifarioVehiculoEstandar}
          onClose={()=>setModalTarifarioVehiculo(null)} onSaved={()=>{onRefresh();}} toast={toast}/>
      )}
      {modalTarifarioViaje && (
        <ModalTarifarioViaje empresa={modalTarifarioViaje} filas={tarifasViajeCliente} estandar={tarifarioViajeEstandar}
          onClose={()=>setModalTarifarioViaje(null)} onSaved={()=>{onRefresh();}} toast={toast}/>
      )}
    </div>
  );
}

// ── Modalidades de tarifario que se pueden habilitar por cliente ──
export const MODALIDADES_TARIFA = [
  { id:"pedido",   ico:"package", icon:"dollar", label:"Por pedido",   ayuda:"Se cobra cada entrega según ámbito, servicio y peso" },
  { id:"vehiculo", ico:"truck", icon:"truck", label:"Por vehículo", ayuda:"Se cobra por día de unidad según el tipo de vehículo" },
  { id:"viaje",    ico:"map", icon:"", label:"Por viaje",    ayuda:"Se cobra por viaje o recojo según ruta o concepto acordado" },
];
// Modalidades habilitadas de un cliente. Si todavía no se marcó ninguna, se infieren de las tarifas que ya tiene.
export const modalidadesDe = (e, tarPedido=[], tarVeh=[], tarViaje=[]) => {
  if (Array.isArray(e?.modalidades_tarifa) && e.modalidades_tarifa.length) return e.modalidades_tarifa;
  const m = [];
  if (tarPedido.some(t=>t.empresa_id===e?.id)) m.push("pedido");
  if (tarVeh.some(t=>t.empresa_id===e?.id)) m.push("vehiculo");
  if (tarViaje.some(t=>t.empresa_id===e?.id)) m.push("viaje");
  return m;
};

// Editor del tarifario por viaje (del cliente o el estándar si empresa=null)
export function ModalTarifarioViaje({ empresa, filas, estandar=[], onClose, onSaved, toast }) {
  const esEstandar = !empresa;
  const tabla = esEstandar ? "tarifario_viaje_estandar" : "tarifarios_viaje_cliente";
  const TIPOS_VEHICULO = ["moto","bicicleta","auto","furgoneta","minivan","van","porter","camion"];
  const origen = esEstandar ? filas : filas.filter(t=>t.empresa_id===empresa.id);
  const [rows, setRows] = useState(() => origen.map(t=>({ id:t.id, concepto:t.concepto||"", tipo_vehiculo:t.tipo_vehiculo||"", unidad:t.unidad||"viaje", tarifa:t.tarifa??"", activo:t.activo!==false })));
  const [quitados, setQuitados] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const set = (i, k, v) => setRows(p => p.map((r,j)=> j===i ? { ...r, [k]:v } : r));
  const agregar = () => setRows(p => [...p, { id:null, concepto:"", tipo_vehiculo:"", unidad:"viaje", tarifa:"", activo:true }]);
  const quitar = (i) => { const r = rows[i]; if (r.id) setQuitados(q=>[...q, r.id]); setRows(p=>p.filter((_,j)=>j!==i)); };
  const cargarEstandar = () => {
    const nuevas = estandar.filter(s=>s.activo && !rows.some(r=>r.concepto.trim().toLowerCase()===(s.concepto||"").trim().toLowerCase() && (r.tipo_vehiculo||"")===(s.tipo_vehiculo||"")))
      .map(s=>({ id:null, concepto:s.concepto, tipo_vehiculo:s.tipo_vehiculo||"", unidad:s.unidad||"viaje", tarifa:s.tarifa, activo:true }));
    if (!nuevas.length) { toast("No hay tarifas estándar nuevas para copiar","error"); return; }
    setRows(p=>[...p, ...nuevas]); toast(`${nuevas.length} tarifa${nuevas.length===1?"":"s"} copiada${nuevas.length===1?"":"s"} — revisa y guarda`);
  };
  const guardar = async () => {
    const validas = rows.filter(r=>r.concepto.trim() || r.tarifa!=="");
    for (const r of validas) {
      if (!r.concepto.trim()) { toast("Cada tarifa necesita un concepto o ruta","error"); return; }
      if (r.tarifa==="" || isNaN(parseFloat(r.tarifa))) { toast(`Falta la tarifa de "${r.concepto}"`,"error"); return; }
    }
    setGuardando(true);
    let fallo = null;
    if (quitados.length) { const { error } = await sb.from(tabla).delete().in("id", quitados); if (error) fallo = error; }
    for (const r of validas) {
      const cuerpo = { concepto:r.concepto.trim(), tipo_vehiculo:r.tipo_vehiculo||null, unidad:r.unidad, tarifa:parseFloat(r.tarifa), activo:r.activo, ...(esEstandar?{}:{ empresa_id:empresa.id }) };
      const { error } = r.id ? await sb.from(tabla).update(cuerpo).eq("id", r.id) : await sb.from(tabla).insert([cuerpo]);
      if (error) { fallo = error; break; }
    }
    setGuardando(false);
    if (fallo) { toast("Error: "+fallo.message+" (¿ejecutaste tarifarios_v2_boaz.sql?)","error"); return; }
    toast("Tarifario por viaje guardado ✓"); onSaved(); onClose();
  };
  return (
    <div style={{ position:"fixed", inset:0, background:"#0008", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ background:B.white, borderRadius:16, padding:24, width:760, maxWidth:"100%", maxHeight:"88vh", overflowY:"auto", boxShadow:"0 20px 60px #0003" }}>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
          <div style={{ fontSize:16, fontWeight:800, color:B.navy }}>Tarifario por viaje — {esEstandar ? "estándar (propuesta base)" : empresa.nombre}</div>
          <button onClick={onClose} style={{ background:"none", border:"none", fontSize:20, color:B.textSec, cursor:"pointer" }}>✕</button>
        </div>
        <div style={{ fontSize:12, color:B.textMut, marginBottom:14 }}>
          Cada fila es una tarifa acordada: una ruta o concepto (ej. "Recojo en almacén", "Lima – Callao"), el tipo de vehículo si aplica y su precio. Usa <b>Por recojo</b> para cobros por visita de recojo.
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {rows.length===0 && <div style={{ padding:20, textAlign:"center", fontSize:12, color:B.textMut, border:`1px dashed ${B.border}`, borderRadius:10 }}>Aún no hay tarifas. Agrega la primera.</div>}
          {rows.map((r,i)=>(
            <div key={i} style={{ display:"grid", gridTemplateColumns:"2fr 1.1fr 1fr 0.9fr auto auto", gap:8, alignItems:"end", padding:10, border:`1px solid ${B.border}`, borderRadius:10, background:r.activo?"#FFF8EF":B.bg, opacity:r.activo?1:.65 }}>
              <div><label style={{ ...lbl, marginBottom:3 }}>Ruta o concepto</label><input style={inp} value={r.concepto} placeholder="ej. Recojo en almacén" onChange={e=>set(i,"concepto",e.target.value)}/></div>
              <div><label style={{ ...lbl, marginBottom:3 }}>Vehículo</label>
                <select style={inp} value={r.tipo_vehiculo} onChange={e=>set(i,"tipo_vehiculo",e.target.value)}>
                  <option value="">Cualquiera</option>{TIPOS_VEHICULO.map(t=><option key={t} value={t}>{t}</option>)}
                </select></div>
              <div><label style={{ ...lbl, marginBottom:3 }}>Se cobra</label>
                <select style={inp} value={r.unidad} onChange={e=>set(i,"unidad",e.target.value)}>
                  <option value="viaje">Por viaje</option><option value="recojo">Por recojo</option>
                </select></div>
              <div><label style={{ ...lbl, marginBottom:3 }}>Tarifa (S/)</label><input type="number" style={inp} value={r.tarifa} onChange={e=>set(i,"tarifa",e.target.value)}/></div>
              <label style={{ display:"flex", alignItems:"center", gap:5, fontSize:11, color:B.textSec, paddingBottom:8, cursor:"pointer" }}><input type="checkbox" checked={r.activo} onChange={e=>set(i,"activo",e.target.checked)}/>Activa</label>
              <BtnIco n="trash" title="Quitar" color="#B91C1C" onClick={()=>quitar(i)}/>
            </div>
          ))}
        </div>
        <div style={{ display:"flex", gap:12, marginTop:12, alignItems:"center", flexWrap:"wrap" }}>
          <button onClick={agregar} style={{ fontSize:12, fontWeight:700, color:B.blue, background:"none", border:`1px solid ${B.border}`, borderRadius:8, padding:"7px 12px", cursor:"pointer" }}>+ Agregar tarifa</button>
          {!esEstandar && <button onClick={cargarEstandar} style={{ fontSize:12, fontWeight:600, color:B.blue, background:"none", border:"none", cursor:"pointer" }}>Cargar desde el estándar</button>}
        </div>
        <div style={{ display:"flex", gap:10, justifyContent:"flex-end", marginTop:18 }}>
          <BtnSec onClick={onClose}>Cerrar</BtnSec>
          <BtnPri onClick={guardar} disabled={guardando}>{guardando?"Guardando...":"Guardar tarifario"}</BtnPri>
        </div>
      </div>
    </div>
  );
}

// Forma de cobro por pedido del cliente: tarifario (ámbito/servicio/peso), precio fijo o por distrito, más el recargo por embalaje
export function FormaCobroPedido({ empresa, tarifasDistrito=[], onSaved, toast }) {
  const [modo, setModo] = useState(empresa.modo_pedido || "tarifario");
  const [precio, setPrecio] = useState(empresa.precio_fijo_pedido!=null ? String(empresa.precio_fijo_pedido) : "");
  const [recargo, setRecargo] = useState(parseFloat(empresa.recargo_embalaje)>0 ? String(empresa.recargo_embalaje) : "");
  const [filas, setFilas] = useState(() => tarifasDistrito.filter(t=>t.empresa_id===empresa.id).map(t=>({ distrito:t.distrito, tarifa:String(t.tarifa) })));
  const [guardando, setGuardando] = useState(false);
  const todos = useMemo(() => [...ZONAS_LIMA.urbano, ...ZONAS_LIMA.semi_urbano, ...ZONAS_LIMA.periferico].sort((a,b)=>a.localeCompare(b)), []);
  const setFila = (i, k, v) => setFilas(prev => prev.map((f,j) => j===i ? { ...f, [k]:v } : f));

  const importar = async (archivo) => {
    if (!archivo) return;
    try {
      await asegurarXLSX();
      const wb = XLSX.read(await archivo.arrayBuffer(), { type:"array" });
      const datos = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval:"" });
      const nuevas = [];
      for (const r of datos) {
        let d = "", t = null;
        for (const k of Object.keys(r)) { const n = normDist(k); if (n.includes("distrito")) d = String(r[k]).trim(); else if (/tarifa|precio|costo|monto/.test(n)) t = parseFloat(String(r[k]).replace(",", ".")); }
        if (d && t!=null && !isNaN(t)) nuevas.push({ distrito:d, tarifa:String(t) });
      }
      if (!nuevas.length) { toast("No encontré filas válidas. El Excel debe tener las columnas «Distrito» y «Tarifa».","error"); return; }
      setFilas(prev => { const m = new Map(prev.map(f=>[normDist(f.distrito), f])); for (const f of nuevas) m.set(normDist(f.distrito), f); return [...m.values()]; });
      toast(`${nuevas.length} distrito${nuevas.length===1?"":"s"} cargado${nuevas.length===1?"":"s"} — revisa y guarda`);
    } catch (e) { toast("No se pudo leer el archivo: "+(e.message||e), "error"); }
  };

  const guardar = async () => {
    if (modo==="fijo" && !(parseFloat(precio)>0)) { toast("Indica el precio fijo por pedido","error"); return; }
    const validas = filas.filter(f => f.distrito.trim() && parseFloat(f.tarifa)>=0 && f.tarifa!=="");
    if (modo==="distrito") {
      if (!validas.length) { toast("Agrega al menos un distrito con su tarifa","error"); return; }
      const vistos = new Set(); for (const f of validas) { const k = normDist(f.distrito); if (vistos.has(k)) { toast(`El distrito «${f.distrito}» está repetido`,"error"); return; } vistos.add(k); }
    }
    setGuardando(true);
    const falta = (m) => /column|relation|does not exist|schema cache/i.test(m||"") ? " — falta ejecutar tarifarios_v3_boaz.sql en Supabase" : "";
    let { error } = await sb.from("empresas").update({ modo_pedido:modo, precio_fijo_pedido: modo==="fijo" ? parseFloat(precio) : (parseFloat(precio)||null), recargo_embalaje: parseFloat(recargo)||0 }).eq("id", empresa.id);
    if (!error && (modo==="distrito" || validas.length || tarifasDistrito.some(t=>t.empresa_id===empresa.id))) {
      ({ error } = await sb.from("tarifas_distrito_cliente").delete().eq("empresa_id", empresa.id));
      if (!error && validas.length) ({ error } = await sb.from("tarifas_distrito_cliente").insert(validas.map(f => ({ empresa_id:empresa.id, distrito:f.distrito.trim(), tarifa:parseFloat(f.tarifa), activo:true }))));
    }
    setGuardando(false);
    if (error) { toast("Error: "+error.message+falta(error.message),"error"); return; }
    toast("Forma de cobro guardada ✓"); onSaved && onSaved();
  };

  return (
    <div style={{ border:`1px solid ${B.border}`, borderRadius:12, padding:16, marginBottom:18, background:"#FBFCFE" }}>
      <div style={{ fontSize:13, fontWeight:700, color:B.navy, marginBottom:4 }}>Cómo se cobra cada pedido</div>
      <div style={{ fontSize:12, color:B.textMut, marginBottom:10 }}>Define la regla principal de este cliente. El tarifario por ámbito de abajo se usa cuando la regla no aplica (por ejemplo, un distrito sin tarifa).</div>
      <Tabs valor={modo} onChange={setModo} tabs={[{ id:"tarifario", l:"Según tarifario" }, { id:"fijo", l:"Precio fijo por pedido" }, { id:"distrito", l:"Por distrito" }]}/>

      {modo==="tarifario" && <div style={{ fontSize:12, color:B.textSec, marginTop:10 }}>Cada pedido se cobra según ámbito, tipo de servicio y peso, con el tarifario de este cliente o, si no tiene, el estándar.</div>}
      {modo==="fijo" && (
        <div style={{ marginTop:12, display:"flex", alignItems:"flex-end", gap:10, flexWrap:"wrap" }}>
          <div><label style={lbl}>Precio por pedido (S/, sin IGV)</label>
            <input type="number" step="0.01" min="0" style={{ ...inp, width:180, background:B.white }} value={precio} onChange={e=>setPrecio(e.target.value)} placeholder="Ej. 4.00"/></div>
          <div style={{ fontSize:12, color:B.textSec, paddingBottom:10 }}>Todos los pedidos de este cliente se cobran a este precio, sin importar distrito ni peso.</div>
        </div>
      )}
      {modo==="distrito" && (
        <div style={{ marginTop:12 }}>
          <datalist id="bz-distritos">{todos.map(d=><option key={d} value={d}/>)}</datalist>
          {filas.length>0 && (
            <div style={{ display:"grid", gridTemplateColumns:"1fr 140px 34px", gap:"6px 8px", alignItems:"center", marginBottom:8, maxHeight:230, overflowY:"auto", paddingRight:4 }}>
              <div style={{ fontSize:11, fontWeight:700, color:B.textMut }}>DISTRITO</div><div style={{ fontSize:11, fontWeight:700, color:B.textMut }}>TARIFA (S/)</div><div/>
              {filas.map((f,i) => (<Fragment key={i}>
                <input list="bz-distritos" style={{ ...inp, background:B.white }} value={f.distrito} onChange={e=>setFila(i,"distrito",e.target.value)} placeholder="Distrito" aria-label="Distrito"/>
                <input type="number" step="0.01" min="0" style={{ ...inp, background:B.white }} value={f.tarifa} onChange={e=>setFila(i,"tarifa",e.target.value)} placeholder="0.00" aria-label="Tarifa"/>
                <BtnIco n="trash" title="Quitar distrito" color="#B91C1C" onClick={()=>setFilas(prev=>prev.filter((_,j)=>j!==i))}/>
              </Fragment>))}
            </div>
          )}
          <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
            <BtnSec onClick={()=>setFilas(prev=>[...prev, { distrito:"", tarifa:"" }])}><Ico n="plus" size={15}/> Agregar distrito</BtnSec>
            <label className="bz-btn-sec" style={{ display:"inline-flex", alignItems:"center", gap:7, background:B.white, border:`1px solid ${B.border}`, color:B.textPri, padding:"8px 14px", borderRadius:8, fontWeight:600, fontSize:13, cursor:"pointer" }}>
              <Ico n="upload" size={15}/> Cargar desde Excel
              <input type="file" accept=".xlsx,.xls,.csv" style={{ display:"none" }} onChange={e=>{ importar(e.target.files[0]); e.target.value=""; }}/>
            </label>
            <span style={{ fontSize:12, color:B.textMut }}>El Excel debe tener las columnas «Distrito» y «Tarifa». {filas.length>0 && `${filas.length} distrito${filas.length===1?"":"s"}.`}</span>
          </div>
        </div>
      )}

      <div style={{ display:"flex", alignItems:"flex-end", gap:10, flexWrap:"wrap", marginTop:14, paddingTop:14, borderTop:`1px solid ${B.border}` }}>
        <div><label style={lbl}>Recargo por embalaje (S/, opcional)</label>
          <input type="number" step="0.01" min="0" style={{ ...inp, width:180, background:B.white }} value={recargo} onChange={e=>setRecargo(e.target.value)} placeholder="0.00"/></div>
        <div style={{ fontSize:12, color:B.textSec, flex:"1 1 200px", paddingBottom:10 }}>Se suma solo a los pedidos que marques con «Requiere embalaje» (por ejemplo, pedidos de agencia).</div>
        <BtnPri onClick={guardar} disabled={guardando}>{guardando ? "Guardando…" : "Guardar forma de cobro"}</BtnPri>
      </div>
    </div>
  );
}

export function ModalTarifarioCliente({ empresa, tarifasDistrito=[], tarifariosCliente, tarifarioEstandar, onClose, onSaved, toast }) {
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
          <div style={{ fontSize:16, fontWeight:800, color:B.navy }}>Tarifario por pedido — {empresa.nombre}</div>
          <button onClick={onClose} style={{ background:"none", border:"none", fontSize:20,
            color:B.textSec, cursor:"pointer" }}>✕</button>
        </div>
        <FormaCobroPedido empresa={empresa} tarifasDistrito={tarifasDistrito} onSaved={()=>{ onSaved && onSaved(); onClose(); }} toast={toast}/>
        <div style={{ fontSize:13, fontWeight:700, color:B.navy, marginBottom:4 }}>Tarifario por ámbito, servicio y peso</div>
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
          Habilitar tarifario "{SERVICIOS.find(s=>s.id===servicioTab).label}" completo desde el estándar
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
                    Cargar desde el estándar
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

export function ModalTarifarioEstandar({ tarifarioEstandar, onClose, onSaved, toast }) {
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
          <div style={{ fontSize:16, fontWeight:800, color:B.navy }}>Tarifario estándar (propuesta base)</div>
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

export function ModalTarifarioVehiculoEstandar({ tarifarioVehiculoEstandar, onClose, onSaved, toast }) {
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
          <div style={{ fontSize:16, fontWeight:800, color:B.navy }}>Tarifario estándar por unidad</div>
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

export function ModalTarifarioVehiculo({ empresa, tarifarioVehiculoCliente, tarifarioVehiculoEstandar, onClose, onSaved, toast }) {
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
          <div style={{ fontSize:16, fontWeight:800, color:B.navy }}>Tarifario por vehículo — {empresa.nombre}</div>
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
                      Cargar desde el estándar
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

