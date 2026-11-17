// BOAZ ERP — módulo "flota" (parte de BoazERP; ver src/BoazERP.jsx)
import { useState, useEffect, useCallback, useRef, useMemo, Fragment } from "react";
import { Ayuda, B, BtnPri, BtnSec, EstadoVacio, Ico, Kpi, TAB_CONT, TAB_SEG, diaLocal, fmt, inp, lbl, sb } from "./base.jsx";
import { esFeriadoPeru } from "./ventas.jsx";
import { FlotaDocs } from "./operacion.jsx";

// ══════════════════════════════════════════════════════════════
// MÓDULO: UNIDADES DE TRANSPORTE (clientes de Transporte y Carga)
// ══════════════════════════════════════════════════════════════
// Cálculos financieros de asignaciones de unidades — compartidos entre
// el módulo Unidades (operación) y Liquidación Transporte (finanzas).
export function calcularDiasAsignacion(a, diasServicio) {
  const registrados = diasServicio.filter(d=>d.asignacion_id===a.id);
  if (registrados.length > 0) {
    return registrados.filter(d=>d.prestado).length;
  }
  const inicio = new Date(a.fecha_inicio+"T00:00:00");
  const fin = a.fecha_fin ? new Date(a.fecha_fin+"T00:00:00") : new Date();
  return Math.max(1, Math.round((fin-inicio)/86400000)+1);
}
// Si hay calendario real (con fechas exactas), suma día por día y aplica el
// recargo de feriado a cada día que corresponda. Sin calendario, usa la
// estimación plana anterior (no se puede aplicar recargo sin fechas exactas).
export function calcularMontoAsignacion(a, diasServicio, recargoFeriadoPct=0) {
  const registrosCalendario = diasServicio.filter(d=>d.asignacion_id===a.id);
  const tarifaDia = parseFloat(a.tarifa_dia)||0;
  if (registrosCalendario.length > 0) {
    return registrosCalendario.filter(d=>d.prestado).reduce((sum,d)=>{
      const recargo = esFeriadoPeru(d.fecha) ? tarifaDia*(recargoFeriadoPct/100) : 0;
      return sum + tarifaDia + recargo;
    }, 0);
  }
  return calcularDiasAsignacion(a, diasServicio) * tarifaDia;
}
export const calcularIGVAsignacion = (a, diasServicio, recargoFeriadoPct=0) => calcularMontoAsignacion(a, diasServicio, recargoFeriadoPct) * 0.18;
export const calcularTotalConIGVAsignacion = (a, diasServicio, recargoFeriadoPct=0) => calcularMontoAsignacion(a, diasServicio, recargoFeriadoPct) * 1.18;

export function Unidades({ unidades, asignaciones, empresas, tiposServicio, repartidores, tarifarioVehiculoCliente=[], tarifarioVehiculoEstandar=[], onRefresh, toast, onIr }) {
  const [vista, setVista] = useState("asignaciones");
  const [modalUnidad, setModalUnidad] = useState(false);
  const [modalAsignacion, setModalAsignacion] = useState(false);
  const [editandoUnidad, setEditandoUnidad] = useState(null);
  const [editandoAsignacion, setEditandoAsignacion] = useState(null);

  const finalizarAsignacion = async (a) => {
    const hoy = diaLocal();
    const { error } = await sb.from("asignaciones_unidad").update({ fecha_fin: hoy, estado:"finalizada" }).eq("id", a.id);
    if (error) { toast("Error: "+error.message, "error"); return; }
    toast("Asignación finalizada ✓");
    onRefresh();
  };

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
        <div style={{ ...TAB_CONT }}>
          {[["asignaciones","Asignaciones"],["unidades","Flota"],["docs","Documentos y mantenimiento"]].map(([id,label])=>(
            <button key={id} onClick={()=>setVista(id)}
              style={TAB_SEG(vista===id)}>
              {label}
            </button>
          ))}
        </div>
        {vista==="docs" ? null : vista==="unidades" ? (
          <BtnPri onClick={()=>{setEditandoUnidad(null); setModalUnidad(true);}}><Ico n="plus" size={15} sw={2.4}/> Nueva unidad</BtnPri>
        ) : (
          <BtnPri onClick={()=>{setEditandoAsignacion(null); setModalAsignacion(true);}}><Ico n="plus" size={15} sw={2.4}/> Nueva asignación</BtnPri>
        )}
      </div>

      <div style={{ fontSize:12, color:B.textMut, marginBottom:14 }}>
        {vista==="docs"
          ? "Vencimientos de SOAT, revisión técnica y seguro, y estado del mantenimiento de cada vehículo."
          : vista==="unidades"
          ? "Tu flota disponible para clientes de Transporte y Carga."
          : "A qué cliente está asignada cada unidad y por cuánto tiempo. Para ver el cálculo de días, IGV y monto a facturar, ve a Finanzas → Liq. Transporte."}
      </div>

      {vista==="docs" ? <FlotaDocs unidades={unidades} repartidores={repartidores} toast={toast} onIr={onIr}/> : vista==="unidades" ? (
        <div style={{ background:B.white, border:`1px solid ${B.border}`, borderRadius:12, overflow:"hidden", boxShadow:"0 1px 2px #0D1E3D0D" }}>
          <table style={{ width:"100%", borderCollapse:"collapse" }}>
            <thead><tr style={{ background:"#F6F9FC" }}>
              {["Placa","Tipo","Conductor","Teléfono","Estado","Acciones"].map(h=>(
                <th key={h} style={{ padding:"10px 14px", textAlign:"left", fontSize:11, color:B.textSec, fontWeight:700, letterSpacing:"0.3px", whiteSpace:"nowrap" }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {unidades.map((u,i)=>{
                const conductor = repartidores.find(r=>r.id===u.repartidor_id);
                return (
                <tr key={u.id} style={{ borderTop:`1px solid ${B.border}`, background:B.white }}>
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
              {unidades.length===0 && <tr><td colSpan={6}><EstadoVacio icono="truck" titulo="Aún no hay unidades en la flota" texto="Una unidad es un vehículo (placa y tipo) que puedes asignar a un cliente por día. Es la base de los clientes que pagan por vehículo, como Deliverman."
                pasos={["Pulsa «Nueva unidad» y registra placa, tipo de vehículo y conductor habitual.","En la pestaña Asignaciones, vincúlala a un cliente con su tarifa por día.","En Documentos y mantenimiento, carga SOAT y revisión técnica para recibir avisos de vencimiento."]}/></td></tr>}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ background:B.white, border:`1px solid ${B.border}`, borderRadius:12, overflow:"hidden", boxShadow:"0 1px 2px #0D1E3D0D" }}>
          <table style={{ width:"100%", borderCollapse:"collapse" }}>
            <thead><tr style={{ background:"#F6F9FC" }}>
              {["Unidad","Cliente","Servicio","Desde","Hasta","Estado","Acciones"].map(h=>(
                <th key={h} style={{ padding:"10px 12px", textAlign:"left", fontSize:11, color:B.textSec, fontWeight:700, letterSpacing:"0.3px", whiteSpace:"nowrap" }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {asignaciones.map((a,i)=>{
                const unidad = unidades.find(u=>u.id===a.unidad_id);
                const empresa = empresas.find(e=>e.id===a.empresa_id);
                const servicio = tiposServicio.find(t=>t.id===a.tipo_servicio_id);
                return (
                  <tr key={a.id} style={{ borderTop:`1px solid ${B.border}`, background:B.white }}>
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
                        <button onClick={()=>{setEditandoAsignacion(a); setModalAsignacion(true);}} style={{ fontSize:11, color:B.gold, background:"none", border:"none", cursor:"pointer" }}><Ico n="edit" size={13} style={{ display:"inline-block", verticalAlign:"-2px", marginRight:5 }}/>Editar</button>
                        {a.estado==="activa" && (
                          <button onClick={()=>finalizarAsignacion(a)} style={{ fontSize:11, color:B.red, background:"none", border:"none", cursor:"pointer" }}>Finalizar</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {asignaciones.length===0 && <tr><td colSpan={7}><EstadoVacio icono="calendar" titulo="Aún no hay unidades asignadas a clientes" texto="Una asignación dice qué unidad trabaja para qué cliente, desde cuándo y a qué tarifa por día. Con eso Liq. Transporte y Pre-facturación calculan lo que se cobra."
                pasos={["Primero registra la unidad en la pestaña Flota.","Pulsa «Nueva asignación», elige unidad, cliente y fecha de inicio; la tarifa por día se sugiere desde el tarifario.","Cada día trabajado márcalo en «Calendario» para que el cobro sea exacto (si no, se estima por el rango de fechas)."]}/></td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {modalUnidad && (
        <ModalUnidad unidad={editandoUnidad} repartidores={repartidores} onClose={()=>setModalUnidad(false)}
          onSaved={()=>{setModalUnidad(false); onRefresh();}} toast={toast}/>
      )}
      {modalAsignacion && (
        <ModalAsignacionUnidad unidades={unidades} empresas={empresas} tiposServicio={tiposServicio} repartidores={repartidores} tarifarioVehiculoCliente={tarifarioVehiculoCliente} tarifarioVehiculoEstandar={tarifarioVehiculoEstandar}
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
export function LiquidacionTransporte({ unidades, asignaciones, empresas, tiposServicio, diasServicio, recargoFeriadoPct, onRefresh, toast, onIr }) {
  const [modalCalendario, setModalCalendario] = useState(null);

  const marcarLiquidado = async (a) => {
    const { error } = await sb.from("asignaciones_unidad").update({ liquidado:true }).eq("id", a.id);
    if (error) { toast("Error: "+error.message, "error"); return; }
    toast("Marcado como liquidado ✓");
    onRefresh();
  };

  const totalPendiente = asignaciones
    .filter(a=>!a.liquidado)
    .reduce((sum,a)=>sum+calcularTotalConIGVAsignacion(a, diasServicio, recargoFeriadoPct), 0);

  return (
    <div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:14, marginBottom:20 }}>
        {[
          { label:"Asignaciones activas", value: asignaciones.filter(a=>a.estado==="activa").length, icon:"truck", color:B.gold },
          { label:"Pendientes de liquidar", value: asignaciones.filter(a=>!a.liquidado).length, icon:"clock", color:B.red },
          { label:"Total pendiente (con IGV)", value: fmt.sol(totalPendiente), icon:"dollar", color:B.green },
        ].map((k,i)=><Kpi key={i} icon={k.icon} label={k.label} valor={k.value} sub={k.sub} color={k.color}/>)}
      </div>

      <div style={{ background:B.white, border:`1px solid ${B.border}`, borderRadius:12, overflow:"hidden", boxShadow:"0 1px 2px #0D1E3D0D" }}>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead><tr style={{ background:"#F6F9FC" }}>
            {["Unidad","Cliente","Servicio","Desde","Hasta","Días","Tarifa/día","Subtotal","IGV (18%)","Total a facturar","Estado","Acciones"].map(h=>(
              <th key={h} style={{ padding:"10px 12px", textAlign:"left", fontSize:11, color:B.textSec, fontWeight:700, letterSpacing:"0.3px", whiteSpace:"nowrap" }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {asignaciones.map((a,i)=>{
              const unidad = unidades.find(u=>u.id===a.unidad_id);
              const empresa = empresas.find(e=>e.id===a.empresa_id);
              const servicio = tiposServicio.find(t=>t.id===a.tipo_servicio_id);
              const dias = calcularDiasAsignacion(a, diasServicio);
              const monto = calcularMontoAsignacion(a, diasServicio, recargoFeriadoPct);
              const igv = calcularIGVAsignacion(a, diasServicio, recargoFeriadoPct);
              const totalConIGV = calcularTotalConIGVAsignacion(a, diasServicio, recargoFeriadoPct);
              const tieneRegistro = diasServicio.some(d=>d.asignacion_id===a.id);
              return (
                <tr key={a.id} style={{ borderTop:`1px solid ${B.border}`, background:B.white }}>
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
                      <button onClick={()=>setModalCalendario(a)} style={{ fontSize:11, color:B.blue, background:"none", border:"none", cursor:"pointer" }}>Calendario</button>
                      {!a.liquidado && a.estado==="finalizada" && (
                        <button onClick={()=>marcarLiquidado(a)} style={{ fontSize:11, color:B.green, background:"none", border:"none", cursor:"pointer" }}>Liquidar</button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {asignaciones.length===0 && <tr><td colSpan={12}><EstadoVacio icono="calendar" titulo="Nada que liquidar todavía" texto="Aquí se calcula cuánto se le cobra a cada cliente por sus unidades (días trabajados × tarifa por día, más recargo por feriados). Aparece en cuanto haya asignaciones en Flota." ir={{ id:"unidades", label:"Ir a Flota" }} onIr={onIr}/></td></tr>}
          </tbody>
        </table>
      </div>

      {modalCalendario && (
        <ModalCalendarioServicio asignacion={modalCalendario}
          diasServicio={diasServicio.filter(d=>d.asignacion_id===modalCalendario.id)}
          unidad={unidades.find(u=>u.id===modalCalendario.unidad_id)}
          empresa={empresas.find(e=>e.id===modalCalendario.empresa_id)}
          recargoFeriadoPct={recargoFeriadoPct}
          onClose={()=>setModalCalendario(null)} onCambio={onRefresh} toast={toast}/>
      )}
    </div>
  );
}

export function ModalCalendarioServicio({ asignacion, diasServicio, unidad, empresa, recargoFeriadoPct, onClose, onCambio, toast }) {
  const [inicializando, setInicializando] = useState(true);

  const fechas = useMemo(() => {
    const arr = [];
    const inicio = new Date(asignacion.fecha_inicio+"T00:00:00");
    const fin = asignacion.fecha_fin ? new Date(asignacion.fecha_fin+"T00:00:00") : new Date();
    let cur = new Date(inicio);
    while (cur <= fin) {
      arr.push(diaLocal(cur));
      cur.setDate(cur.getDate()+1);
    }
    return arr;
  }, [asignacion.fecha_inicio, asignacion.fecha_fin]);

  const mesesDisponibles = useMemo(() => {
    const set = new Set(fechas.map(f=>f.slice(0,7)));
    return Array.from(set).sort();
  }, [fechas]);
  const [mesActivo, setMesActivo] = useState(null);
  useEffect(() => {
    if (mesesDisponibles.length && !mesActivo) {
      const hoyMes = new Date().toISOString().slice(0,7);
      setMesActivo(mesesDisponibles.includes(hoyMes) ? hoyMes : mesesDisponibles[mesesDisponibles.length-1]);
    }
  }, [mesesDisponibles]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const feriadosActivos = fechas.filter(f => mapa[f] === true && esFeriadoPeru(f)).length;
  const subtotal = calcularMontoAsignacion(asignacion, diasServicio, recargoFeriadoPct);
  const igv = subtotal * 0.18;
  const totalConIGV = subtotal * 1.18;

  const fechasDelMes = mesActivo ? fechas.filter(f=>f.startsWith(mesActivo)) : [];
  const idxMes = mesesDisponibles.indexOf(mesActivo);
  const labelMes = mesActivo
    ? new Date(mesActivo+"-01T12:00:00").toLocaleDateString("es-PE",{month:"long",year:"numeric"})
    : "";

  return (
    <div style={{ position:"fixed", inset:0, background:"#0008", zIndex:1000,
      display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ background:B.white, borderRadius:16, padding:28, width:560,
        maxHeight:"85vh", overflowY:"auto", boxShadow:"0 20px 60px #0003" }}>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
          <div style={{ fontSize:16, fontWeight:800, color:B.navy }}>Calendario de servicio</div>
          <button onClick={onClose} style={{ background:"none", border:"none", fontSize:20,
            color:B.textSec, cursor:"pointer" }}>✕</button>
        </div>
        <div style={{ fontSize:12, color:B.textSec, marginBottom:16 }}>
          {unidad?.placa||"—"} — {empresa?.nombre||"—"}
        </div>
        <div style={{ background:B.bg, borderRadius:10, padding:"12px 16px", marginBottom:16 }}>
          <div style={{ fontSize:12, color:B.textSec, marginBottom:10 }}>
            Todos los días empiezan sin marcar. Toca cada día que sí tuvo servicio para activarlo.
            {recargoFeriadoPct>0 && ` Los feriados llevan +${recargoFeriadoPct}% de recargo automático.`}
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:10, textAlign:"center" }}>
            <div>
              <div style={{ fontSize:18, fontWeight:900, color:B.navy }}>{totalPrestados}</div>
              <div style={{ fontSize:9, color:B.textMut, textTransform:"uppercase" }}>Días{feriadosActivos>0?` (${feriadosActivos} fer.)`:""}</div>
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
          <>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
              <button onClick={()=>setMesActivo(mesesDisponibles[idxMes-1])} disabled={idxMes<=0}
                style={{ background:"none", border:`1px solid ${B.border}`, borderRadius:8, width:32, height:32,
                  cursor: idxMes<=0?"default":"pointer", opacity: idxMes<=0?0.3:1, fontSize:14 }}>‹</button>
              <div style={{ fontSize:14, fontWeight:700, color:B.navy, textTransform:"capitalize" }}>{labelMes}</div>
              <button onClick={()=>setMesActivo(mesesDisponibles[idxMes+1])} disabled={idxMes>=mesesDisponibles.length-1}
                style={{ background:"none", border:`1px solid ${B.border}`, borderRadius:8, width:32, height:32,
                  cursor: idxMes>=mesesDisponibles.length-1?"default":"pointer", opacity: idxMes>=mesesDisponibles.length-1?0.3:1, fontSize:14 }}>›</button>
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(66px, 1fr))", gap:8 }}>
              {fechasDelMes.map(f => {
                const prestado = mapa[f] === true;
                const feriado = esFeriadoPeru(f);
                const fechaObj = new Date(f+"T12:00:00");
                const bg = prestado && feriado ? "linear-gradient(135deg, #ECFDF5 50%, #FEF2F2 50%)"
                  : prestado ? "#ECFDF5" : feriado ? "#FEF2F2" : B.bg;
                const borderColor = prestado && feriado ? B.gold : prestado ? B.green : feriado ? B.red : B.border;
                const textColor = prestado && feriado ? B.goldDk : prestado ? B.green : feriado ? B.red : B.textMut;
                return (
                  <button key={f} onClick={()=>toggle(f, prestado)}
                    style={{ padding:"10px 4px", borderRadius:8, border:`2px solid ${borderColor}`,
                      background: bg, cursor:"pointer", textAlign:"center", position:"relative" }}>
                    <div style={{ fontSize:9, color:B.textMut, textTransform:"uppercase" }}>
                      {fechaObj.toLocaleDateString("es-PE",{weekday:"short"})}
                    </div>
                    <div style={{ fontSize:14, fontWeight:800, color:textColor }}>
                      {fechaObj.getDate()}
                    </div>
                    {feriado && (
                      <div style={{ fontSize:8, color:B.red, fontWeight:700, marginTop:1 }}>feriado</div>
                    )}
                  </button>
                );
              })}
            </div>

            <div style={{ display:"flex", gap:14, marginTop:14, fontSize:10, color:B.textMut, flexWrap:"wrap" }}>
              <span><span style={{ display:"inline-block", width:10, height:10, background:"#ECFDF5", border:`1.5px solid ${B.green}`, borderRadius:3, marginRight:4 }}/>Activo</span>
              <span><span style={{ display:"inline-block", width:10, height:10, background:"#FEF2F2", border:`1.5px solid ${B.red}`, borderRadius:3, marginRight:4 }}/>Feriado</span>
              <span><span style={{ display:"inline-block", width:10, height:10, background:"linear-gradient(135deg,#ECFDF5 50%,#FEF2F2 50%)", border:`1.5px solid ${B.gold}`, borderRadius:3, marginRight:4 }}/>Activo + Feriado (con recargo)</span>
            </div>
          </>
        )}

        <div style={{ display:"flex", justifyContent:"flex-end", marginTop:20 }}>
          <BtnPri onClick={onClose}>Listo</BtnPri>
        </div>
      </div>
    </div>
  );
}

export function ModalUnidad({ unidad, repartidores, onClose, onSaved, toast }) {
  const [f, setF] = useState(unidad || { placa:"", tipo_vehiculo:"moto", repartidor_id:"", auxiliar_id:"" });
  const guardar = async () => {
    if (!f.placa) { toast("La placa es obligatoria","error"); return; }
    const payload = { placa:f.placa, tipo_vehiculo:f.tipo_vehiculo, repartidor_id:f.repartidor_id||null, auxiliar_id:f.auxiliar_id||null };
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
        <select style={{ ...inp, marginBottom:12 }} value={f.repartidor_id||""} onChange={e=>setF(p=>({...p,repartidor_id:e.target.value}))}>
          <option value="">— Sin asignar —</option>
          {repartidores.filter(r=>r.activo).map(r=>(
            <option key={r.id} value={r.id}>{r.nombres} {r.apellidos}{r.telefono?` — ${r.telefono}`:""}</option>
          ))}
        </select>
        <label style={lbl}>Auxiliar (opcional)</label>
        <select style={{ ...inp, marginBottom:6 }} value={f.auxiliar_id||""} onChange={e=>setF(p=>({...p,auxiliar_id:e.target.value}))}>
          <option value="">— Sin auxiliar —</option>
          {repartidores.filter(r=>r.activo).map(r=>(
            <option key={r.id} value={r.id}>{r.nombres} {r.apellidos}{r.telefono?` — ${r.telefono}`:""}</option>
          ))}
        </select>
        <div style={{ fontSize:11, color:B.textMut, marginBottom:20 }}>
          ¿El conductor todavía no está registrado? Créalo primero en el módulo <strong>Repartidores</strong> — así puede usarse tanto para pedidos de última milla como para unidades de transporte. Ahí mismo configuras cómo se le paga a cada uno, para que el modelo de rentabilidad calcule el costo real.
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

export function ModalAsignacionUnidad({ unidades, empresas, tiposServicio, repartidores, tarifarioVehiculoCliente=[], tarifarioVehiculoEstandar=[], asignacion, onClose, onSaved, toast }) {
  const [f, setF] = useState(asignacion || {
    unidad_id:"", empresa_id:"", tipo_servicio_id:"",
    fecha_inicio: diaLocal(),
    tarifa_dia:"", notas:"",
  });
  // Tarifa sugerida: primero la del cliente para ese tipo de vehículo, si no la del estándar
  const tarifaSugerida = (() => {
    const un = unidades.find(x=>x.id===f.unidad_id);
    const tv = (un?.tipo_vehiculo||"").toLowerCase();
    if (!tv) return null;
    const c = tarifarioVehiculoCliente.find(t=>t.empresa_id===f.empresa_id && (t.tipo_vehiculo||"").toLowerCase()===tv && t.activo);
    if (c) return { monto: parseFloat(c.tarifa_base)||0, origen:"del cliente" };
    const e = tarifarioVehiculoEstandar.find(t=>(t.tipo_vehiculo||"").toLowerCase()===tv && t.activo);
    return e ? { monto: parseFloat(e.tarifa_base)||0, origen:"estándar" } : null;
  })();
  useEffect(() => {
    if (!asignacion && tarifaSugerida && (f.tarifa_dia===""||f.tarifa_dia==null)) setF(p=>({ ...p, tarifa_dia: tarifaSugerida.monto }));
  }, [f.unidad_id, f.empresa_id]);
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
          <div><label style={lbl}>Tarifa por día (S/)<Ayuda k="tarifa_dia"/></label>
            <input type="number" style={inp} value={f.tarifa_dia} onChange={e=>setF(p=>({...p,tarifa_dia:e.target.value}))}/>
            {tarifaSugerida && parseFloat(f.tarifa_dia)!==tarifaSugerida.monto && (
              <button type="button" onClick={()=>setF(p=>({...p,tarifa_dia:tarifaSugerida.monto}))}
                style={{ marginTop:4, fontSize:11, color:B.blue, background:"none", border:"none", cursor:"pointer", padding:0 }}>
                Usar tarifario {tarifaSugerida.origen}: S/ {tarifaSugerida.monto}
              </button>)}
          </div>
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

