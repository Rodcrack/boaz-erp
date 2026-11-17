// BOAZ ERP — módulo "operacion" (parte de BoazERP; ver src/BoazERP.jsx)
import { useState, useEffect, useCallback, useRef, useMemo, Fragment } from "react";
import { Ayuda, B, BtnIco, BtnPri, BtnSec, Buscador, CARD, Cargando, Confirm, EstadoVacio, Etiqueta, Ico, Kpi, KpiDS, TAB_CONT, TAB_SEG, Tabs, XLSX, asegurarXLSX, diaLocal, fmt, inp, kpiMini, lbl, sb, usePaginacion } from "./base.jsx";
import { esFeriadoPeru } from "./ventas.jsx";
import { solN } from "./costos.jsx";

// ══════════════════════════════════════════════════════════════
// FASE 3: Flota (documentos y mantenimiento), Rentabilidad, Directorio de personas
// ══════════════════════════════════════════════════════════════
export const TIPOS_DOC_VEH = ["SOAT","Revisión técnica","Seguro vehicular","Tarjeta de propiedad","Permiso MTC","Otro"];
export const COLS_DOC = ["SOAT","Revisión técnica","Seguro vehicular"];
export const diasHasta = (f) => f ? Math.round((new Date(String(f).slice(0,10)+"T00:00:00") - new Date(diaLocal()+"T00:00:00"))/86400000) : null;
export const estadoVenc = (f) => {
  const d = diasHasta(f);
  if (d===null) return { k:"sin", color:B.textMut, bg:B.bg, txt:"Sin registrar" };
  if (d<0) return { k:"venc", color:B.red, bg:"#FEF2F2", txt:`Vencido hace ${-d} d` };
  if (d<=30) return { k:"pronto", color:"#B45309", bg:"#FFF7ED", txt:`Vence en ${d} d` };
  return { k:"ok", color:B.green, bg:"#ECFDF5", txt:fmt.fecha(f) };
};

export function FlotaDocs({ unidades, repartidores, toast, onIr }) {
  const [docs, setDocs] = useState([]);
  const [mant, setMant] = useState([]);
  const [gastos90, setGastos90] = useState({});
  const [cargando, setCargando] = useState(true);
  const [form, setForm] = useState(null);
  const [subiendo, setSubiendo] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);
  const [verHist, setVerHist] = useState(null);

  const placas = useMemo(() => {
    const s = new Set();
    unidades.filter(u=>u.activo!==false).forEach(u => u.placa && s.add(u.placa.toUpperCase()));
    repartidores.filter(r=>r.activo && r.placa).forEach(r => s.add(r.placa.toUpperCase()));
    return [...s].sort();
  }, [unidades, repartidores]);

  const cargar = async () => {
    setCargando(true);
    const lim = new Date(); lim.setDate(lim.getDate()-90);
    const [d, m, g] = await Promise.all([
      sb.from("vehiculo_documentos").select("*").order("fecha_vencimiento", { ascending:false }),
      sb.from("gastos").select("placa,categoria,fecha,km,proximo_mant_km,proximo_mant_fecha").not("placa","is",null).order("fecha",{ascending:false}).limit(3000),
      sb.from("gastos").select("placa,monto,tipo,fecha").eq("tipo","egreso").not("placa","is",null).gte("fecha", diaLocal(lim)),
    ]);
    if (d.error) toast("No se pudieron cargar los documentos: " + d.error.message + " (¿ejecutaste flota_rentab_boaz.sql?)", "error"); else setDocs(d.data||[]);
    if (!m.error) setMant(m.data||[]);
    if (!g.error) { const t = {}; (g.data||[]).forEach(x => { const p = x.placa.toUpperCase(); t[p] = (t[p]||0) + (parseFloat(x.monto)||0); }); setGastos90(t); }
    setCargando(false);
  };
  useEffect(() => { cargar(); }, []);

  // último documento por placa + tipo (el de vencimiento más lejano)
  const ultimo = useMemo(() => {
    const m = {};
    docs.forEach(d => { const k = `${(d.placa||"").toUpperCase()}|${d.tipo}`; if (!m[k] || (d.fecha_vencimiento||"") > (m[k].fecha_vencimiento||"")) m[k] = d; });
    return m;
  }, [docs]);

  const mantPorPlaca = useMemo(() => {
    const out = {}; const ultKm = {};
    mant.forEach(r => { const p = r.placa.toUpperCase(); if (r.km && !(p in ultKm)) ultKm[p] = r.km; });
    mant.forEach(r => {
      const p = r.placa.toUpperCase();
      if (!["Mantenimiento","Reparación"].includes(r.categoria) || out[p]) return;
      out[p] = { fecha:r.fecha, proxFecha:r.proximo_mant_fecha, proxKm:r.proximo_mant_km, km:ultKm[p] };
    });
    return out;
  }, [mant]);

  const estMant = (p) => {
    const m = mantPorPlaca[p];
    if (!m) return { k:"sin", color:B.textMut, bg:B.bg, txt:"Sin registros" };
    let k = "ok", txt = `Último ${fmt.fecha(m.fecha)}`;
    if (m.proxFecha) { const e = estadoVenc(m.proxFecha); k = e.k; txt = e.k==="venc" ? `Mant. ${e.txt.toLowerCase()}` : e.k==="pronto" ? `Mant. ${e.txt.toLowerCase()}` : `Próx. ${fmt.fecha(m.proxFecha)}`; }
    if (m.proxKm && m.km) { const falta = m.proxKm - m.km; if (falta<=0) { k="venc"; txt=`Pasó el km (${m.proxKm.toLocaleString()})`; } else if (falta<=500 && k!=="venc") { k="pronto"; txt=`Faltan ${falta} km`; } }
    const c = { ok:[B.green,"#ECFDF5"], pronto:["#B45309","#FFF7ED"], venc:[B.red,"#FEF2F2"] }[k] || [B.textMut,B.bg];
    return { k, color:c[0], bg:c[1], txt };
  };

  const resumen = useMemo(() => {
    let venc=0, pronto=0;
    placas.forEach(p => { COLS_DOC.forEach(t => { const d = ultimo[`${p}|${t}`]; if (!d) return; const e = estadoVenc(d.fecha_vencimiento); if (e.k==="venc") venc++; else if (e.k==="pronto") pronto++; }); const em = estMant(p); if (em.k==="venc") venc++; else if (em.k==="pronto") pronto++; });
    return { venc, pronto };
  }, [placas, ultimo, mantPorPlaca]);

  const nuevo = (placa="", tipo="SOAT") => setForm({ placa, tipo, numero:"", fecha_emision:"", fecha_vencimiento:"", proveedor:"", monto:"", archivo_url:"", notas:"" });
  const editar = (d) => setForm({ ...d, numero:d.numero||"", fecha_emision:d.fecha_emision||"", fecha_vencimiento:d.fecha_vencimiento||"", proveedor:d.proveedor||"", monto:d.monto??"", archivo_url:d.archivo_url||"", notas:d.notas||"" });
  const set = (k,v) => setForm(f => ({ ...f, [k]:v }));
  const subir = async (file) => {
    if (!file) return; setSubiendo(true);
    try {
      const ext = (file.name.split(".").pop()||"jpg").toLowerCase();
      const ruta = `flota/${Date.now()}_${Math.random().toString(36).slice(2,7)}.${ext}`;
      const { error } = await sb.storage.from("evidencias").upload(ruta, file, { contentType:file.type||undefined });
      if (error) throw error;
      set("archivo_url", sb.storage.from("evidencias").getPublicUrl(ruta).data.publicUrl);
    } catch (e) { toast("No se pudo subir el archivo: " + (e.message||e), "error"); }
    setSubiendo(false);
  };
  const guardar = async () => {
    if (!form.placa || !form.fecha_vencimiento) { toast("Indica la placa y la fecha de vencimiento", "error"); return; }
    const reg = { placa:form.placa.toUpperCase().trim(), tipo:form.tipo, numero:form.numero||null, fecha_emision:form.fecha_emision||null, fecha_vencimiento:form.fecha_vencimiento,
      proveedor:form.proveedor||null, monto:form.monto===""?null:Number(form.monto), archivo_url:form.archivo_url||null, notas:form.notas||null };
    const r = form.id ? await sb.from("vehiculo_documentos").update(reg).eq("id", form.id) : await sb.from("vehiculo_documentos").insert(reg);
    if (r.error) { toast("Error al guardar: " + r.error.message, "error"); return; }
    toast("Documento guardado ✓"); setForm(null); cargar();
  };
  const eliminar = async () => {
    const { error } = await sb.from("vehiculo_documentos").delete().eq("id", confirmDel.id);
    if (error) toast("No se pudo eliminar: " + error.message, "error"); else { toast("Documento eliminado"); cargar(); }
    setConfirmDel(null);
  };

  const th = { textAlign:"left", padding:"10px 14px", fontSize:11, fontWeight:700, color:B.textSec, background:"#F6F9FC", letterSpacing:".3px", borderBottom:"1px solid #E3EAF2", whiteSpace:"nowrap" };
  const td = { padding:"12px 14px", fontSize:13, borderBottom:"1px solid #E3EAF2", verticalAlign:"middle" };
  const Pill = ({ e, onClick }) => (
    <button onClick={onClick} style={{ background:e.bg, color:e.color, border:`1px solid ${e.color}33`, borderRadius:20, padding:"3px 10px", fontSize:11, fontWeight:700, cursor:"pointer", whiteSpace:"nowrap" }}>{e.txt}</button>
  );
  const card = CARD;

  return (
    <div>
      <div style={{ display:"flex", gap:12, flexWrap:"wrap", marginBottom:14, alignItems:"stretch" }}>
        <div style={{ flex:"1 1 150px", minWidth:0, display:"grid" }}><KpiDS icon="alert" label="Vencidos" valor={resumen.venc} color={B.red} cv="#B91C1C"/></div>
        <div style={{ flex:"1 1 150px", minWidth:0, display:"grid" }}><KpiDS icon="clock" label="Vencen en 30 días" valor={resumen.pronto} color={B.orange} cv="#B45309"/></div>
        <div style={{ flex:"1 1 150px", minWidth:0, display:"grid" }}><KpiDS icon="truck" label="Vehículos" valor={placas.length} color={B.navy}/></div>
        <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:8 }}>
          <BtnSec onClick={()=>onIr && onIr("gastos")}><Ico n="plus" size={15}/> Registrar mantenimiento (Gastos)</BtnSec>
          <BtnPri onClick={()=>nuevo()}><Ico n="plus" size={15} sw={2.4}/> Documento</BtnPri>
        </div>
      </div>

      <div style={{ ...card, overflowX:"auto" }}>
        {cargando ? <Cargando filas={5}/> : placas.length===0 ?
          <EstadoVacio icono="truck" titulo="Sin vehículos" texto="Registra unidades o asigna placa a tus repartidores para controlar sus documentos."/> :
          <table style={{ width:"100%", borderCollapse:"collapse" }}>
            <thead><tr><th style={th}>Placa</th>{COLS_DOC.map(t=><th key={t} style={th}>{t}</th>)}<th style={th}>Mantenimiento</th><th style={{...th,textAlign:"right"}}>Gasto 90 días</th><th style={th}></th></tr></thead>
            <tbody>{placas.map(p => (
              <tr key={p}>
                <td style={{...td,fontWeight:800,color:B.navy}}>{p}</td>
                {COLS_DOC.map(t => { const d = ultimo[`${p}|${t}`]; return (
                  <td key={t} style={td}><Pill e={estadoVenc(d?.fecha_vencimiento)} onClick={()=> d ? editar(d) : nuevo(p,t)}/></td>); })}
                <td style={td}><Pill e={estMant(p)} onClick={()=>onIr && onIr("gastos")}/></td>
                <td style={{...td,textAlign:"right"}}>{solN(gastos90[p]||0)}</td>
                <td style={{...td,whiteSpace:"nowrap",textAlign:"right"}}><button onClick={()=>setVerHist(p)} style={{ background:"none", border:"none", color:B.blue, fontSize:12, fontWeight:700, cursor:"pointer" }}>Documentos</button></td>
              </tr>))}</tbody>
          </table>}
      </div>
      <div style={{ fontSize:11, color:B.textMut, marginTop:8 }}>Haz clic en una etiqueta para editar o registrar el documento. El mantenimiento viene de los gastos con categoría Mantenimiento o Reparación (próxima fecha o kilometraje).</div>

      {verHist && (
        <div style={{ position:"fixed", inset:0, background:"#0008", zIndex:1500, display:"flex", alignItems:"center", justifyContent:"center", padding:12 }}>
          <div style={{ background:B.white, borderRadius:16, padding:24, width:680, maxWidth:"100%", maxHeight:"88vh", overflowY:"auto" }}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:12 }}>
              <div style={{ fontSize:16, fontWeight:800, color:B.navy }}>Documentos de {verHist}</div>
              <button onClick={()=>setVerHist(null)} style={{ background:"none", border:"none", cursor:"pointer", color:B.textSec }}><Ico n="x" size={18}/></button>
            </div>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead><tr><th style={th}>Tipo</th><th style={th}>N°</th><th style={th}>Vence</th><th style={th}></th></tr></thead>
              <tbody>{docs.filter(d=>(d.placa||"").toUpperCase()===verHist).sort((a,b)=>(b.fecha_vencimiento||"").localeCompare(a.fecha_vencimiento||"")).map(d => (
                <tr key={d.id}><td style={td}>{d.tipo}</td><td style={td}>{d.numero||"—"}</td><td style={td}>{fmt.fecha(d.fecha_vencimiento)}</td>
                  <td style={{...td,textAlign:"right",whiteSpace:"nowrap"}}>
                    {d.archivo_url && <a href={d.archivo_url} target="_blank" rel="noreferrer" style={{ fontSize:12, color:B.blue, marginRight:10 }}>Ver</a>}
                    <BtnIco n="edit" title="Editar" onClick={()=>{setVerHist(null);editar(d);}}/>
                    <BtnIco n="trash" title="Eliminar" color="#B91C1C" onClick={()=>setConfirmDel(d)}/></td></tr>))}</tbody>
            </table>
            {docs.filter(d=>(d.placa||"").toUpperCase()===verHist).length===0 && <div style={{ padding:20, textAlign:"center", color:B.textMut, fontSize:13 }}>Sin documentos registrados</div>}
            <div style={{ marginTop:14, textAlign:"right" }}><BtnPri onClick={()=>{const p=verHist;setVerHist(null);nuevo(p);}}><Ico n="plus" size={15} sw={2.4}/> Documento</BtnPri></div>
          </div>
        </div>)}

      {form && (
        <div style={{ position:"fixed", inset:0, background:"#0008", zIndex:1600, display:"flex", alignItems:"center", justifyContent:"center", padding:12 }}>
          <div style={{ background:B.white, borderRadius:16, padding:24, width:500, maxWidth:"100%", maxHeight:"92vh", overflowY:"auto", boxShadow:"0 20px 60px #0003" }}>
            <div style={{ fontSize:17, fontWeight:800, color:B.navy, marginBottom:14 }}>{form.id?"Editar":"Nuevo"} documento</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
              <div><label style={lbl}>Placa</label><input style={inp} list="placas-flota" value={form.placa} onChange={e=>set("placa",e.target.value.toUpperCase())}/><datalist id="placas-flota">{placas.map(p=><option key={p} value={p}/>)}</datalist></div>
              <div><label style={lbl}>Tipo</label><select style={inp} value={form.tipo} onChange={e=>set("tipo",e.target.value)}>{TIPOS_DOC_VEH.map(t=><option key={t}>{t}</option>)}</select></div>
              <div><label style={lbl}>N° de póliza / documento</label><input style={inp} value={form.numero} onChange={e=>set("numero",e.target.value)}/></div>
              <div><label style={lbl}>Proveedor / entidad</label><input style={inp} value={form.proveedor} onChange={e=>set("proveedor",e.target.value)}/></div>
              <div><label style={lbl}>Fecha de emisión</label><input type="date" style={inp} value={form.fecha_emision} onChange={e=>set("fecha_emision",e.target.value)}/></div>
              <div><label style={lbl}>Fecha de vencimiento</label><input type="date" style={inp} value={form.fecha_vencimiento} onChange={e=>set("fecha_vencimiento",e.target.value)}/></div>
              <div><label style={lbl}>Costo (S/)</label><input type="number" step="0.01" style={inp} value={form.monto} onChange={e=>set("monto",e.target.value)}/></div>
              <div><label style={lbl}>Archivo (foto o PDF)</label><input type="file" accept="image/*,application/pdf" onChange={e=>subir(e.target.files[0])} style={{ fontSize:12 }}/>{subiendo && <span style={{ fontSize:12, color:B.textSec }}> Subiendo…</span>}{form.archivo_url && <div><a href={form.archivo_url} target="_blank" rel="noreferrer" style={{ fontSize:12, color:B.blue }}>Ver adjunto</a></div>}</div>
              <div style={{ gridColumn:"1/-1" }}><label style={lbl}>Notas</label><textarea style={{...inp,minHeight:46}} value={form.notas} onChange={e=>set("notas",e.target.value)}/></div>
            </div>
            <div style={{ fontSize:11, color:B.textMut, marginTop:8 }}>Al renovar, registra un documento nuevo: el anterior queda en el historial.</div>
            <div style={{ display:"flex", justifyContent:"flex-end", gap:10, marginTop:14 }}><BtnSec onClick={()=>setForm(null)}>Cancelar</BtnSec><BtnPri onClick={guardar} disabled={subiendo}>Guardar</BtnPri></div>
          </div>
        </div>)}
      {confirmDel && <Confirm msg={`Se eliminará el documento ${confirmDel.tipo} de ${confirmDel.placa}.`} onOk={eliminar} onCancel={()=>setConfirmDel(null)}/>}
    </div>
  );
}

// ── RENTABILIDAD POR CLIENTE ──────────────────────────────────
export const dia10 = (v) => String(v||"").slice(0,10);
export const costoDiaPersona = (r) => !r ? 0 : (r.modo_pago==="sueldo_fijo" ? (parseFloat(r.sueldo_fijo_mensual)||0)/30 : (parseFloat(r.tarifa_variable)||0));
export function montoAsignacionPeriodo(a, diasServicio, desde, hasta, pct) {
  const tarifa = parseFloat(a.tarifa_dia)||0;
  const reg = diasServicio.filter(d => d.asignacion_id===a.id);
  if (reg.length>0) {
    const l = reg.filter(d => d.prestado && dia10(d.fecha)>=desde && dia10(d.fecha)<=hasta);
    return { dias:l.length, monto:l.reduce((s,d)=>s+tarifa+(esFeriadoPeru(dia10(d.fecha))?tarifa*(pct/100):0),0) };
  }
  const ini = dia10(a.fecha_inicio) > desde ? dia10(a.fecha_inicio) : desde;
  const finA = a.fecha_fin ? dia10(a.fecha_fin) : hasta;
  const fin = finA < hasta ? finA : hasta;
  if (fin < ini) return { dias:0, monto:0 };
  const dias = Math.round((new Date(fin+"T00:00:00")-new Date(ini+"T00:00:00"))/86400000)+1;
  return { dias, monto:dias*tarifa };
}

export function Rentabilidad({ pedidos, empresas, repartidores, unidades, asignaciones, diasServicio, recargoFeriadoPct, toast }) {
  const [desde, setDesde] = useState(diaLocal().slice(0,8)+"01");
  const [hasta, setHasta] = useState(diaLocal());
  const [gastos, setGastos] = useState([]);
  const [incs, setIncs] = useState([]);
  const [servs, setServs] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [orden, setOrden] = useState("margen");

  useEffect(() => {
    let vivo = true;
    (async () => {
      setCargando(true);
      const { data, error } = await sb.from("gastos").select("placa,monto,categoria,tipo,fecha").eq("tipo","egreso").gte("fecha", desde).lte("fecha", hasta);
      const inc = await sb.from("incidencias").select("empresa_id,costo_s,created_at").gt("costo_s", 0).gte("created_at", desde+"T00:00:00").lte("created_at", hasta+"T23:59:59");
      if (!vivo) return;
      if (error) { toast("No se pudieron leer los gastos: " + error.message, "error"); setGastos([]); } else setGastos(data||[]);
      setIncs(inc.error ? [] : (inc.data||[]));
      try { const sv = await cargarServicios(desde, hasta, ""); if (vivo) setServs(sv.error ? [] : (sv.data||[]).filter(x=>x.estado==="realizado")); } catch { if (vivo) setServs([]); }
      setCargando(false);
    })();
    return () => { vivo = false; };
  }, [desde, hasta]);

  const modelo = useMemo(() => {
    const dPeriodo = Math.max(1, Math.round((new Date(hasta+"T00:00:00")-new Date(desde+"T00:00:00"))/86400000)+1);
    const filas = {};
    const fila = (id) => filas[id] || (filas[id] = { id, nombre:(empresas.find(e=>e.id===id)||{}).nombre||"Sin cliente", ingUM:0, ingTR:0, pedidos:0, diasTR:0, cPers:0, cVeh:0, cInc:0 });
    const rep = (id) => repartidores.find(r=>r.id===id);
    const repsAdv = new Set();

    // — Última milla
    const entregados = pedidos.filter(p => p.estado==="entregado" && p.fecha_entrega && diaLocal(new Date(p.fecha_entrega))>=desde && diaLocal(new Date(p.fecha_entrega))<=hasta);
    const porRep = {};
    entregados.forEach(p => {
      const f = fila(p.empresa_id||"—"); f.ingUM += parseFloat(p.tarifa_s)||0; f.pedidos++;
      (porRep[p.repartidor_id||"—"] = porRep[p.repartidor_id||"—"] || []).push(p);
    });

    // — Transporte
    const asigPeriodo = [];
    asignaciones.forEach(a => {
      const r = montoAsignacionPeriodo(a, diasServicio, desde, hasta, recargoFeriadoPct||0);
      if (r.dias>0) asigPeriodo.push({ a, ...r });
    });
    const choferesTransporte = new Set();
    const diasUnidad = {};
    asigPeriodo.forEach(({ a, dias, monto }) => {
      const f = fila(a.empresa_id||"—"); f.ingTR += monto; f.diasTR += dias;
      const u = unidades.find(x => x.id===a.unidad_id);
      diasUnidad[a.unidad_id] = (diasUnidad[a.unidad_id]||0) + dias;
      if (u) [u.repartidor_id, u.auxiliar_id].filter(Boolean).forEach(rid => {
        choferesTransporte.add(rid);
        const r = rep(rid); if (r && !(parseFloat(r.tarifa_variable)>0 || parseFloat(r.sueldo_fijo_mensual)>0)) repsAdv.add(rid);
        f.cPers += costoDiaPersona(r) * dias;
      });
    });

    // — Costo de repartidores en última milla
    let sueldosAsignados = 0;
    Object.entries(porRep).forEach(([rid, ps]) => {
      const r = rep(rid);
      if (!r) return;
      if (!(parseFloat(r.tarifa_variable)>0 || parseFloat(r.sueldo_fijo_mensual)>0)) repsAdv.add(rid);
      if (r.modo_pago==="sueldo_fijo") {
        if (choferesTransporte.has(rid)) return; // su sueldo se cargó a transporte
        const total = (parseFloat(r.sueldo_fijo_mensual)||0) * dPeriodo/30;
        sueldosAsignados += total;
        ps.forEach(p => { fila(p.empresa_id||"—").cPers += total/ps.length; });
      } else {
        ps.forEach(p => { fila(p.empresa_id||"—").cPers += parseFloat(r.tarifa_variable)||0; });
      }
    });

    // sueldos fijos de personal activo que no se pudieron atribuir
    let sueldosSinAsignar = 0;
    repartidores.filter(r => r.activo && r.modo_pago==="sueldo_fijo").forEach(r => {
      const total = (parseFloat(r.sueldo_fijo_mensual)||0) * dPeriodo/30;
      const dias = asigPeriodo.reduce((s,x)=>{ const u = unidades.find(y=>y.id===x.a.unidad_id); return s + (u && (u.repartidor_id===r.id||u.auxiliar_id===r.id) ? x.dias : 0); }, 0);
      const cargado = (porRep[r.id] && !choferesTransporte.has(r.id)) ? total : Math.min(total, (parseFloat(r.sueldo_fijo_mensual)||0)/30*dias);
      sueldosSinAsignar += Math.max(0, total - cargado);
    });

    // — Gastos de vehículos
    let gastosGenerales = 0;
    gastos.forEach(g => {
      const monto = parseFloat(g.monto)||0; const placa = (g.placa||"").toUpperCase();
      if (!placa) { gastosGenerales += monto; return; }
      const u = unidades.find(x => (x.placa||"").toUpperCase()===placa);
      if (u && diasUnidad[u.id]>0) {
        asigPeriodo.filter(x=>x.a.unidad_id===u.id).forEach(x => { fila(x.a.empresa_id||"—").cVeh += monto * x.dias/diasUnidad[u.id]; });
        return;
      }
      const r = repartidores.find(x => (x.placa||"").toUpperCase()===placa);
      if (r && porRep[r.id]?.length) { porRep[r.id].forEach(p => { fila(p.empresa_id||"—").cVeh += monto/porRep[r.id].length; }); return; }
      gastosGenerales += monto;
    });

    incs.forEach(i => { fila(i.empresa_id||"—").cInc += parseFloat(i.costo_s)||0; });
    servs.forEach(x => { fila(x.empresa_id||"—").ingTR += parseFloat(x.monto)||0; });   // viajes, recojos y servicios cotizados
    const lista = Object.values(filas).map(f => {
      const ing = f.ingUM + f.ingTR, cost = f.cPers + f.cVeh + f.cInc, margen = ing - cost;
      return { ...f, ing, cost, margen, pct: ing>0 ? margen/ing*100 : null };
    });
    const tot = lista.reduce((t,f)=>({ ing:t.ing+f.ing, cost:t.cost+f.cost, margen:t.margen+f.margen, pers:t.pers+f.cPers, veh:t.veh+f.cVeh, inc:t.inc+f.cInc }), { ing:0, cost:0, margen:0, pers:0, veh:0, inc:0 });
    return { lista, tot, gastosGenerales, sueldosSinAsignar, sinCosto:[...repsAdv].map(id => { const r = rep(id); return r ? `${r.nombres||""} ${r.apellidos||""}`.trim() : ""; }).filter(Boolean) };
  }, [pedidos, empresas, repartidores, unidades, asignaciones, diasServicio, recargoFeriadoPct, gastos, incs, servs, desde, hasta]);

  const lista = [...modelo.lista].sort((a,b) => orden==="pct" ? (b.pct??-999)-(a.pct??-999) : orden==="ing" ? b.ing-a.ing : b.margen-a.margen);
  const resultadoOp = modelo.tot.margen - modelo.gastosGenerales - modelo.sueldosSinAsignar;

  const mes = (delta) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth()+delta); const ini = diaLocal(d); const fin = new Date(d.getFullYear(), d.getMonth()+1, 0); setDesde(ini); setHasta(delta===0 ? diaLocal() : diaLocal(fin)); };
  const exportar = async () => {
    await asegurarXLSX();
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(lista.map(f => ({ Cliente:f.nombre, "Ingreso última milla":+f.ingUM.toFixed(2), "Ingreso transporte y servicios":+f.ingTR.toFixed(2), "Ingreso total":+f.ing.toFixed(2), "Costo personal":+f.cPers.toFixed(2), "Gasto vehículos":+f.cVeh.toFixed(2), "Incidencias":+f.cInc.toFixed(2), "Margen":+f.margen.toFixed(2), "Margen %":f.pct==null?"":+f.pct.toFixed(1), Pedidos:f.pedidos, "Días transporte":f.diasTR }))), "Rentabilidad");
    XLSX.writeFile(wb, `rentabilidad_boaz_${desde}_a_${hasta}.xlsx`);
  };

  const card = CARD;
  const th = { textAlign:"right", padding:"10px 14px", fontSize:11, fontWeight:700, color:B.textSec, background:"#F6F9FC", letterSpacing:".3px", borderBottom:"1px solid #E3EAF2", whiteSpace:"nowrap" };
  const td = { padding:"12px 14px", fontSize:13, borderBottom:"1px solid #E3EAF2", textAlign:"right" };
  const Kpi = kpiMini;

  return (
    <div>
      <div style={{ display:"flex", gap:10, flexWrap:"wrap", alignItems:"flex-end", marginBottom:14 }}>
        <div><label style={lbl}>Desde</label><input type="date" style={{...inp,width:150}} value={desde} onChange={e=>setDesde(e.target.value)}/></div>
        <div><label style={lbl}>Hasta</label><input type="date" style={{...inp,width:150}} value={hasta} onChange={e=>setHasta(e.target.value)}/></div>
        <BtnSec onClick={()=>mes(0)}>Este mes</BtnSec><BtnSec onClick={()=>mes(-1)}>Mes anterior</BtnSec>
        <div style={{ marginLeft:"auto" }}><BtnSec onClick={exportar}><Ico n="download" size={15}/> Excel</BtnSec></div>
      </div>

      <div style={{ display:"flex", gap:12, flexWrap:"wrap", marginBottom:14 }}>
        <Kpi t="Ingresos" v={solN(modelo.tot.ing)} c={B.navy} s="última milla + transporte, sin IGV"/>
        <Kpi t="Costos directos" v={solN(modelo.tot.cost)} c={B.orange} s={`personal ${solN(modelo.tot.pers)} · vehículos ${solN(modelo.tot.veh)} · incidencias ${solN(modelo.tot.inc)}`}/>
        <Kpi t="Margen directo" v={solN(modelo.tot.margen)} c={modelo.tot.margen>=0?B.green:B.red} s={modelo.tot.ing>0?`${(modelo.tot.margen/modelo.tot.ing*100).toFixed(1)}% de los ingresos`:""}/>
        <Kpi t="Resultado operativo" v={solN(resultadoOp)} c={resultadoOp>=0?B.green:B.red} s={`tras gastos generales ${solN(modelo.gastosGenerales)} y sueldos sin asignar ${solN(modelo.sueldosSinAsignar)}`}/>
      </div>

      {modelo.sinCosto.length>0 && (
        <div style={{ background:"#FFF7ED", border:"1px solid #FDBA74", borderRadius:10, padding:"10px 14px", marginBottom:12, fontSize:12, color:"#9A3412" }}>
          <b>Atención:</b> estas personas no tienen costo configurado (tarifa o sueldo) y se están contando en S/ 0: {modelo.sinCosto.slice(0,6).join(", ")}{modelo.sinCosto.length>6?"…":""}. Configúralo en Repartidores para que el margen sea real.
        </div>)}

      <div style={{ ...card, overflowX:"auto" }}>
        {cargando ? <Cargando filas={5}/> : lista.length===0 ?
          <EstadoVacio icono="chart" titulo="Sin actividad en el período" texto="No hay pedidos entregados ni días de transporte entre estas fechas."/> :
          <table style={{ width:"100%", borderCollapse:"collapse" }}>
            <thead><tr>
              <th style={{...th,textAlign:"left"}}>Cliente</th><th style={th}>Ing. última milla</th><th style={th} title="Unidades por día + viajes, recojos y servicios cotizados">Ing. transporte y servicios</th><th style={th}>Costo personal</th><th style={th}>Gasto vehículos</th><th style={th}>Incidencias</th>
              <th style={{...th,cursor:"pointer",color:orden==="margen"?B.navy:B.textSec}} onClick={()=>setOrden("margen")}>Margen {orden==="margen"?"▼":""}</th>
              <th style={{...th,cursor:"pointer",color:orden==="pct"?B.navy:B.textSec}} onClick={()=>setOrden("pct")}>Margen % {orden==="pct"?"▼":""}</th></tr></thead>
            <tbody>{lista.map(f => (
              <tr key={f.id}>
                <td style={{...td,textAlign:"left",fontWeight:600}}>{f.nombre}<div style={{ fontSize:11, color:B.textMut, fontWeight:400 }}>{f.pedidos} pedido{f.pedidos===1?"":"s"}{f.diasTR?` · ${f.diasTR} día${f.diasTR===1?"":"s"} de transporte`:""}</div></td>
                <td style={td}>{solN(f.ingUM)}</td><td style={td}>{solN(f.ingTR)}</td><td style={td}>{solN(f.cPers)}</td><td style={td}>{solN(f.cVeh)}</td><td style={td}>{solN(f.cInc)}</td>
                <td style={{...td,fontWeight:800,color:f.margen>=0?B.green:B.red}}>{solN(f.margen)}</td>
                <td style={td}>{f.pct==null?"—":<span style={{ background:f.pct>=30?"#ECFDF5":f.pct>=10?"#FFF7ED":"#FEF2F2", color:f.pct>=30?B.green:f.pct>=10?"#B45309":B.red, fontWeight:800, fontSize:12, padding:"2px 9px", borderRadius:20 }}>{f.pct.toFixed(1)}%</span>}</td>
              </tr>))}</tbody>
          </table>}
      </div>

      <div style={{ ...card, padding:"14px 18px", marginTop:14, fontSize:12, color:B.textSec, lineHeight:1.6 }}>
        <div style={{ fontWeight:800, color:B.navy, marginBottom:4 }}>Cómo se calcula</div>
        • <b>Ingresos:</b> tarifa de pedidos entregados en el período, más los días de transporte prestados por cada asignación (con recargo de feriado).<br/>
        • <b>Costo de personal:</b> repartidores por pedido = su tarifa por pedido; con sueldo fijo = sueldo del período repartido entre sus pedidos. Choferes y auxiliares de unidades = costo diario por cada día asignado al cliente.<br/>
        • <b>Gastos de vehículos:</b> los gastos con placa se reparten entre los clientes de esa unidad según los días asignados, o entre los pedidos del repartidor dueño de la placa. Los gastos sin placa son generales y no se reparten.<br/>
        • <b>Incidencias:</b> el costo registrado en el módulo Incidencias (reposiciones y compensaciones) se carga al cliente del pedido.<br/>
        • Es una estimación operativa: no incluye planilla administrativa ni impuestos.
      </div>
    </div>
  );
}

// ── DIRECTORIO DE PERSONAS (vista unificada con detección de duplicados) ──
export const normDoc = (v) => { let d = (v||"").toString().replace(/\D/g,""); if (d.length===11 && d.startsWith("10")) d = d.slice(2,10); return d; };
export function DirectorioPersonas({ personal, terceros, repartidores }) {
  const [busq, setBusq] = useState("");
  const [soloDup, setSoloDup] = useState(false);
  const filas = useMemo(() => {
    const l = [];
    personal.forEach(p => l.push({ k:"pl"+p.id, origen:"Planilla", nombre:`${p.nombres||""} ${p.apellidos||""}`.trim(), doc:normDoc(p.dni), rol:p.cargo||"Trabajador", activo:p.activo!==false }));
    terceros.forEach(t => l.push({ k:"tr"+t.id, origen:"Tercero", nombre:t.nombre||"", doc:normDoc(t.ruc_dni), rol:t.servicio||"Honorarios/Factura", activo:t.activo!==false }));
    repartidores.forEach(r => l.push({ k:"rp"+r.id, origen:"Repartidor", nombre:`${r.nombres||""} ${r.apellidos||""}`.trim(), doc:normDoc(r.dni), rol:`${r.vehiculo||"Repartidor"}${r.tipo_sueldo_fijo?` · ${r.tipo_sueldo_fijo}`:""}`, activo:!!r.activo }));
    const grupos = {};
    l.forEach(x => { if (x.doc) (grupos[x.doc] = grupos[x.doc] || []).push(x); });
    l.forEach(x => { const g = x.doc && grupos[x.doc]; x.dup = !!(g && new Set(g.map(y=>y.origen)).size>1); x.otros = x.dup ? [...new Set(g.map(y=>y.origen).filter(o=>o!==x.origen))] : []; });
    return l.sort((a,b)=>a.nombre.localeCompare(b.nombre));
  }, [personal, terceros, repartidores]);
  const nDup = new Set(filas.filter(f=>f.dup).map(f=>f.doc)).size;
  const q = busq.trim().toLowerCase();
  const vis = filas.filter(f => (!soloDup || f.dup) && (!q || `${f.nombre} ${f.doc} ${f.rol}`.toLowerCase().includes(q)));
  const colores = { Planilla:[B.navy,"#E8EEF7"], Tercero:["#7C3AED","#F3EEFF"], Repartidor:[B.goldDk,"#FFF4E5"] };
  const td = { padding:"12px 14px", fontSize:13, borderBottom:"1px solid #E3EAF2" };
  return (
    <div>
      <div style={{ fontSize:12, color:B.textSec, marginBottom:12 }}>Vista unificada de todas las personas del sistema: planilla, terceros y repartidores. Detecta a quien está registrado en más de un lugar por su DNI o RUC.</div>
      <div style={{ display:"flex", gap:10, flexWrap:"wrap", alignItems:"center", marginBottom:12 }}>
        <input style={{ ...inp, width:260 }} placeholder="Buscar nombre o documento…" value={busq} onChange={e=>setBusq(e.target.value)}/>
        <label style={{ fontSize:12, color:B.textSec, display:"flex", alignItems:"center", gap:6 }}><input type="checkbox" checked={soloDup} onChange={e=>setSoloDup(e.target.checked)}/> Solo posibles duplicados</label>
        <span style={{ marginLeft:"auto", fontSize:12, fontWeight:700, color:nDup?B.orange:B.green }}>{nDup ? `${nDup} persona${nDup===1?"":"s"} en más de un registro` : "Sin duplicados detectados"}</span>
      </div>
      <div style={{ background:B.white, border:`1px solid ${B.border}`, borderRadius:12, overflowX:"auto" }}>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead><tr style={{ background:"#F6F9FC" }}>{["Nombre","Documento","Registrado en","Rol / detalle","Estado","Alerta"].map(h=><th key={h} style={{ padding:"9px 12px", textAlign:"left", fontSize:11, color:B.textSec, fontWeight:700, letterSpacing:"0.3px", whiteSpace:"nowrap" }}>{h}</th>)}</tr></thead>
          <tbody>{vis.map(f => (
            <tr key={f.k}>
              <td style={{...td,fontWeight:600}}>{f.nombre||"—"}</td><td style={td}>{f.doc||"—"}</td>
              <td style={td}><span style={{ background:colores[f.origen][1], color:colores[f.origen][0], fontSize:11, fontWeight:700, padding:"2px 9px", borderRadius:20 }}>{f.origen}</span></td>
              <td style={{...td,color:B.textSec}}>{f.rol}</td>
              <td style={td}>{f.activo ? <span style={{ color:B.green, fontWeight:700, fontSize:12 }}>Activo</span> : <span style={{ color:B.textMut, fontSize:12 }}>Inactivo</span>}</td>
              <td style={td}>{f.dup && <span style={{ background:"#FFF7ED", color:"#B45309", fontSize:11, fontWeight:700, padding:"2px 9px", borderRadius:20 }}>También en {f.otros.join(", ")}</span>}</td>
            </tr>))}</tbody>
        </table>
        {vis.length===0 && <EstadoVacio icono="users" titulo="Sin resultados"/>}
      </div>
      <div style={{ fontSize:11, color:B.textMut, marginTop:8 }}>Una misma persona puede estar legítimamente en dos lugares (por ejemplo, un repartidor con recibo por honorarios que también figura como tercero). Revisa los casos marcados y deja un solo registro de pago para evitar pagar dos veces.</div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// FASE 4: Usuarios y roles, auditoría, incidencias
// ══════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════
// VIAJES, RECOJOS Y SERVICIOS COTIZADOS
// Lo que se cobra a un cliente fuera de los pedidos y de la unidad por día.
// ══════════════════════════════════════════════════════════════
export const TIPOS_SERV = {
  recojo:   { label:"Recojo",            ico:"package", tono:"info",   ayuda:"Visita para recoger mercadería (se cobra por recojo)" },
  viaje:    { label:"Viaje",             ico:"map",     tono:"ok",     ayuda:"Traslado o ruta acordada (se cobra por viaje)" },
  especial: { label:"Servicio cotizado", ico:"filetext", tono:"warn",  ayuda:"Servicio eventual con precio cotizado en el momento" },
};
export const ESTADOS_SERV = { pendiente:["Pendiente","warn"], realizado:["Realizado","ok"], anulado:["Anulado","neutro"] };
export const cargarServicios = async (desde, hasta, empresaId) => {
  let q = sb.from("servicios_cliente").select("*").order("fecha",{ascending:false});
  if (desde) q = q.gte("fecha", desde);
  if (hasta) q = q.lte("fecha", hasta);
  if (empresaId) q = q.eq("empresa_id", empresaId);
  return q;
};

export function ServiciosCliente({ empresas=[], repartidores=[], unidades=[], tarifasViajeCliente=[], tarifarioViajeEstandar=[], usuario, toast }) {
  const hoy = diaLocal();
  const [filas, setFilas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [faltaSql, setFaltaSql] = useState(false);
  const [desde, setDesde] = useState(hoy.slice(0,8)+"01");
  const [hasta, setHasta] = useState(hoy);
  const [fEmp, setFEmp] = useState("");
  const [fTipo, setFTipo] = useState("todos");
  const [fFact, setFFact] = useState("todos");
  const [busq, setBusq] = useState("");
  const [form, setForm] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data, error } = await cargarServicios(desde, hasta, "");
    if (error) { setFaltaSql(/relation|does not exist|schema cache/i.test(error.message||"")); setFilas([]); }
    else { setFaltaSql(false); setFilas(data||[]); }
    setCargando(false);
  }, [desde, hasta]);
  useEffect(() => { cargar(); }, [cargar]);

  const nomEmp = useMemo(() => { const m = {}; for (const e of empresas) m[e.id] = e.nombre; return m; }, [empresas]);
  const q = busq.trim().toLowerCase();
  const filtrados = filas.filter(f =>
    (!fEmp || f.empresa_id===fEmp) && (fTipo==="todos" || f.tipo===fTipo) &&
    (fFact==="todos" || (fFact==="si" ? f.facturado : !f.facturado && f.estado!=="anulado")) &&
    (!q || `${f.concepto||""} ${nomEmp[f.empresa_id]||""} ${f.placa||""} ${f.cotizacion_ref||""}`.toLowerCase().includes(q)));
  const pg = usePaginacion(filtrados, 25, "servicios");
  const vigentes = filtrados.filter(f => f.estado!=="anulado");
  const total = vigentes.reduce((t,f)=>t+(parseFloat(f.monto)||0),0);
  const porFacturar = vigentes.filter(f=>!f.facturado && f.estado==="realizado");
  const montoPorFacturar = porFacturar.reduce((t,f)=>t+(parseFloat(f.monto)||0),0);
  const cuenta = (t) => filas.filter(f=>f.tipo===t).length;

  // Formulario
  const nuevo = () => setForm({ empresa_id:fEmp||"", fecha:hoy, tipo:"recojo", concepto:"", tipo_vehiculo:"", placa:"", repartidor_id:"", cantidad:"1", tarifa_unit:"", cotizacion_ref:"", notas:"", estado:"realizado" });
  const editar = (f) => setForm({ ...f, cantidad:String(f.cantidad??1), tarifa_unit:String(f.tarifa_unit??""), tipo_vehiculo:f.tipo_vehiculo||"", placa:f.placa||"", repartidor_id:f.repartidor_id||"", cotizacion_ref:f.cotizacion_ref||"", notas:f.notas||"" });
  const set = (k,v) => setForm(p => ({ ...p, [k]:v }));
  // Tarifas acordadas que aplican al cliente y tipo elegidos (las del cliente primero; si no tiene, las estándar)
  const opciones = useMemo(() => {
    if (!form || form.tipo==="especial") return [];
    const delCliente = tarifasViajeCliente.filter(t => t.empresa_id===form.empresa_id && t.activo!==false && (t.unidad||"viaje")===form.tipo);
    const base = delCliente.length ? delCliente.map(t=>({ ...t, origen:"cliente" })) : tarifarioViajeEstandar.filter(t => t.activo!==false && (t.unidad||"viaje")===form.tipo).map(t=>({ ...t, origen:"estándar" }));
    return base;
  }, [form && form.empresa_id, form && form.tipo, tarifasViajeCliente, tarifarioViajeEstandar]);
  const elegirTarifa = (id) => { const t = opciones.find(o=>String(o.id)===String(id)); if (!t) return; setForm(p => ({ ...p, concepto:t.concepto, tarifa_unit:String(t.tarifa), tipo_vehiculo:t.tipo_vehiculo||p.tipo_vehiculo })); };
  const montoForm = form ? Math.round((parseFloat(form.cantidad)||0)*(parseFloat(form.tarifa_unit)||0)*100)/100 : 0;

  const guardar = async () => {
    if (!form.empresa_id) { toast("Elige el cliente","error"); return; }
    if (!form.concepto.trim()) { toast("Indica el concepto del servicio","error"); return; }
    if (!(parseFloat(form.cantidad)>0)) { toast("La cantidad debe ser mayor que cero","error"); return; }
    if (form.tarifa_unit==="" || !(parseFloat(form.tarifa_unit)>=0)) { toast("Indica la tarifa","error"); return; }
    setGuardando(true);
    const fila = { empresa_id:form.empresa_id, fecha:form.fecha, tipo:form.tipo, concepto:form.concepto.trim(), tipo_vehiculo:form.tipo_vehiculo||null, placa:(form.placa||"").trim().toUpperCase()||null,
      repartidor_id:form.repartidor_id||null, cantidad:parseFloat(form.cantidad), tarifa_unit:parseFloat(form.tarifa_unit), monto:montoForm,
      cotizacion_ref:(form.cotizacion_ref||"").trim()||null, notas:(form.notas||"").trim()||null, estado:form.estado };
    const { error } = form.id ? await sb.from("servicios_cliente").update(fila).eq("id", form.id)
      : await sb.from("servicios_cliente").insert([{ ...fila, creado_por:(usuario && (usuario.nombre||usuario.email))||null }]);
    setGuardando(false);
    if (error) { toast("Error: "+error.message+(/relation|does not exist|schema cache/i.test(error.message||"") ? " — falta ejecutar servicios_cliente_boaz.sql en Supabase" : ""),"error"); return; }
    toast(form.id ? "Servicio actualizado ✓" : "Servicio registrado ✓"); setForm(null); cargar();
  };
  const marcarFacturado = async (f, valor) => {
    const { error } = await sb.from("servicios_cliente").update({ facturado:valor }).eq("id", f.id);
    if (error) { toast("Error: "+error.message,"error"); return; }
    toast(valor ? "Marcado como facturado ✓" : "Vuelve a estar por facturar ✓"); cargar();
  };
  const eliminar = async () => {
    const { error } = await sb.from("servicios_cliente").delete().eq("id", confirmDel.id);
    setConfirmDel(null);
    if (error) { toast("Error: "+error.message,"error"); return; }
    toast("Servicio eliminado ✓"); cargar();
  };
  const exportar = async () => {
    try {
      await asegurarXLSX();
      const nomRep = (id) => { const r = repartidores.find(x=>x.id===id); return r ? `${r.nombres} ${r.apellidos}` : ""; };
      const datos = filtrados.map(f => ({ Fecha:f.fecha, Cliente:nomEmp[f.empresa_id]||"", Tipo:(TIPOS_SERV[f.tipo]||{}).label||f.tipo, Concepto:f.concepto, Vehículo:f.tipo_vehiculo||"", Placa:f.placa||"", Conductor:nomRep(f.repartidor_id),
        Cantidad:parseFloat(f.cantidad)||0, "Tarifa (S/)":parseFloat(f.tarifa_unit)||0, "Monto sin IGV (S/)":parseFloat(f.monto)||0, "Cotización / ref.":f.cotizacion_ref||"", Estado:(ESTADOS_SERV[f.estado]||[f.estado])[0], Facturado:f.facturado?"Sí":"No", Notas:f.notas||"" }));
      const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(datos), "Servicios");
      XLSX.writeFile(wb, `viajes_servicios_boaz_${desde}_${hasta}.xlsx`);
    } catch (e) { toast("No se pudo exportar: "+(e.message||e), "error"); }
  };

  const th = { textAlign:"left", padding:"10px 14px", fontSize:11, fontWeight:700, color:B.textSec, background:"#F6F9FC", letterSpacing:".3px", borderBottom:"1px solid #E3EAF2", whiteSpace:"nowrap" };
  const td = { padding:"12px 14px", fontSize:13, borderBottom:"1px solid #E3EAF2", color:B.textPri, verticalAlign:"middle" };

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:10, marginBottom:16 }}>
        <div style={{ fontSize:13, color:B.textSec, maxWidth:640 }}>Recojos, viajes y servicios cotizados que se cobran a un cliente además de sus pedidos o de su unidad por día. Lo registrado aquí aparece en la Pre-facturación del cliente.</div>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          <BtnSec onClick={exportar}><Ico n="download" size={15}/> Excel</BtnSec>
          <BtnPri onClick={nuevo}><Ico n="plus" size={15} sw={2.4}/> Registrar servicio</BtnPri>
        </div>
      </div>

      {faltaSql && (
        <div style={{ background:"#FFF7ED", border:"1px solid #FDBA74", borderRadius:12, padding:"12px 14px", marginBottom:14, fontSize:13, color:"#9A3412", display:"flex", gap:8, alignItems:"flex-start" }}>
          <Ico n="alert" size={16}/><div>Falta activar este módulo en la base de datos: ejecuta <b>servicios_cliente_boaz.sql</b> en Supabase (SQL Editor) y recarga la página.</div>
        </div>
      )}

      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14, marginBottom:16 }}>
        <Kpi icon="map" label="Servicios en el período" valor={vigentes.length.toLocaleString("en-US")} sub={`${cuenta("recojo")} recojos · ${cuenta("viaje")} viajes · ${cuenta("especial")} cotizados`}/>
        <Kpi icon="dollar" label="Monto del período (sin IGV)" valor={fmt.sol(total)} color={B.goldDk}/>
        <Kpi icon="clock" label="Por facturar" valor={fmt.sol(montoPorFacturar)} sub={`${porFacturar.length} servicio${porFacturar.length===1?"":"s"} realizado${porFacturar.length===1?"":"s"}`} color={B.orange} cv={montoPorFacturar>0?"#B45309":undefined}/>
        <Kpi icon="check" label="Ya facturado" valor={fmt.sol(total-vigentes.filter(f=>!f.facturado).reduce((t,f)=>t+(parseFloat(f.monto)||0),0))} color={B.green}/>
      </div>

      <div style={{ ...CARD, padding:14, marginBottom:12, display:"flex", gap:12, flexWrap:"wrap", alignItems:"flex-end" }}>
        <div><label style={lbl}>Desde</label><input type="date" style={{ ...inp, background:B.white, width:155 }} value={desde} onChange={e=>setDesde(e.target.value)}/></div>
        <div><label style={lbl}>Hasta</label><input type="date" style={{ ...inp, background:B.white, width:155 }} value={hasta} onChange={e=>setHasta(e.target.value)}/></div>
        <div style={{ flex:"1 1 200px", minWidth:0 }}><label style={lbl}>Cliente</label>
          <select style={{ ...inp, background:B.white }} value={fEmp} onChange={e=>setFEmp(e.target.value)}><option value="">Todos</option>{empresas.map(e=><option key={e.id} value={e.id}>{e.nombre}</option>)}</select></div>
        <div><label style={lbl}>Facturación</label>
          <select style={{ ...inp, background:B.white, width:160 }} value={fFact} onChange={e=>setFFact(e.target.value)}><option value="todos">Todos</option><option value="no">Por facturar</option><option value="si">Facturados</option></select></div>
        <div style={{ flex:"1 1 200px", minWidth:0 }}><label style={lbl}>Buscar</label><Buscador value={busq} onChange={setBusq} placeholder="Concepto, placa o cotización" width="100%"/></div>
      </div>
      <Tabs valor={fTipo} onChange={setFTipo} style={{ marginBottom:12 }}
        tabs={[{ id:"todos", l:"Todos", n:filas.length }, ...Object.keys(TIPOS_SERV).map(t=>({ id:t, l:TIPOS_SERV[t].label+"s", n:cuenta(t) }))].map(t=> t.id==="especial" ? { ...t, l:"Servicios cotizados" } : t)}/>

      <div style={{ ...CARD, overflow:"hidden" }}>
        {cargando ? <Cargando filas={5}/> : filtrados.length===0 ? (
          <EstadoVacio icono="map" titulo={filas.length===0 ? "Aún no hay servicios en este período" : "Ningún servicio coincide"}
            texto={filas.length===0 ? "Registra aquí los recojos, viajes o servicios cotizados para que entren en la facturación del cliente." : "Cambia las fechas o los filtros."}>
            {filas.length===0 && !faltaSql && <BtnPri onClick={nuevo}><Ico n="plus" size={15} sw={2.4}/> Registrar servicio</BtnPri>}
          </EstadoVacio>
        ) : (<>
          <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse" }}>
            <thead><tr><th style={th}>Fecha</th><th style={th}>Cliente</th><th style={th}>Tipo</th><th style={th}>Concepto</th><th style={th}>Unidad</th><th style={{...th,textAlign:"right"}}>Cant.</th><th style={{...th,textAlign:"right"}}>Tarifa</th><th style={{...th,textAlign:"right"}}>Monto</th><th style={th}>Estado</th><th style={th}></th></tr></thead>
            <tbody>{pg.visibles.map(f => { const t = TIPOS_SERV[f.tipo] || TIPOS_SERV.especial; const e = ESTADOS_SERV[f.estado] || ESTADOS_SERV.realizado; const anul = f.estado==="anulado"; return (
              <tr key={f.id} style={{ opacity:anul?0.55:1 }}>
                <td style={{...td,whiteSpace:"nowrap"}}>{fmt.fecha(f.fecha)}</td>
                <td style={{...td,fontWeight:600}}>{nomEmp[f.empresa_id]||"—"}</td>
                <td style={td}><Etiqueta tono={t.tono}>{t.label}</Etiqueta></td>
                <td style={td}>{f.concepto}{f.cotizacion_ref && <div style={{ fontSize:12, color:B.textMut }}>Ref. {f.cotizacion_ref}</div>}</td>
                <td style={{...td,color:B.textSec,whiteSpace:"nowrap"}}>{f.placa || (f.tipo_vehiculo ? <span style={{ textTransform:"capitalize" }}>{f.tipo_vehiculo}</span> : "—")}</td>
                <td style={{...td,textAlign:"right"}}>{parseFloat(f.cantidad)||0}</td>
                <td style={{...td,textAlign:"right",whiteSpace:"nowrap",color:B.textSec}}>{fmt.sol(f.tarifa_unit)}</td>
                <td style={{...td,textAlign:"right",whiteSpace:"nowrap",fontWeight:700,textDecoration:anul?"line-through":"none"}}>{fmt.sol(f.monto)}</td>
                <td style={td}>{f.facturado ? <Etiqueta tono="ok">Facturado</Etiqueta> : <Etiqueta tono={e[1]}>{e[0]}</Etiqueta>}</td>
                <td style={{...td,padding:"6px 10px"}}>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"flex-end", gap:4, whiteSpace:"nowrap" }}>
                    {!anul && f.estado==="realizado" && (
                      <button className="bz-btn-sec" onClick={()=>marcarFacturado(f, !f.facturado)}
                        style={{ fontSize:12, fontWeight:600, color:f.facturado?B.textSec:"#047857", background:B.white, border:`1px solid ${B.border}`, borderRadius:8, padding:"5px 10px", cursor:"pointer" }}>{f.facturado ? "Quitar facturado" : "Marcar facturado"}</button>)}
                    <BtnIco n="edit" title="Editar servicio" onClick={()=>editar(f)}/>
                    {!f.facturado && <BtnIco n="trash" title="Eliminar servicio" color="#B91C1C" onClick={()=>setConfirmDel(f)}/>}
                  </div>
                </td>
              </tr>); })}</tbody>
          </table>
          </div>
          {pg.pie}
        </>)}
      </div>

      {form && (
        <div style={{ position:"fixed", inset:0, background:"#0008", zIndex:1500, display:"flex", alignItems:"center", justifyContent:"center", padding:12 }}>
          <div style={{ background:B.white, borderRadius:16, padding:24, width:600, maxWidth:"100%", maxHeight:"92vh", overflowY:"auto", boxShadow:"0 20px 60px #0003" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
              <div style={{ fontSize:17, fontWeight:800, color:B.navy }}>{form.id ? "Editar servicio" : "Registrar servicio"}</div>
              <button onClick={()=>setForm(null)} style={{ background:"none", border:"none", fontSize:20, color:B.textSec, cursor:"pointer" }}>✕</button>
            </div>
            <label style={lbl}>Tipo de servicio</label>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, marginBottom:14 }}>
              {Object.entries(TIPOS_SERV).map(([id,t]) => { const on = form.tipo===id; return (
                <button key={id} onClick={()=>set("tipo",id)} title={t.ayuda}
                  style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 12px", borderRadius:10, cursor:"pointer", textAlign:"left", fontSize:13, fontWeight:on?700:500,
                    border:`1px solid ${on?B.gold:B.border}`, background:on?"#FFF7ED":B.white, color:on?B.goldDk:B.textPri }}>
                  <Ico n={t.ico} size={16}/>{t.label}
                </button>); })}
            </div>
            <div style={{ fontSize:12, color:B.textMut, marginTop:-8, marginBottom:14 }}>{TIPOS_SERV[form.tipo].ayuda}.</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
              <div><label style={lbl}>Cliente</label>
                <select style={inp} value={form.empresa_id} onChange={e=>set("empresa_id",e.target.value)}><option value="">— Selecciona —</option>{empresas.map(e=><option key={e.id} value={e.id}>{e.nombre}</option>)}</select></div>
              <div><label style={lbl}>Fecha del servicio</label><input type="date" style={inp} value={form.fecha} onChange={e=>set("fecha",e.target.value)}/></div>
              {opciones.length>0 && (
                <div style={{ gridColumn:"1/-1" }}><label style={lbl}>Tarifa acordada ({opciones[0].origen==="cliente" ? "tarifario del cliente" : "tarifario estándar"})</label>
                  <select style={inp} value="" onChange={e=>elegirTarifa(e.target.value)}>
                    <option value="">Elegir para completar concepto y precio…</option>
                    {opciones.map(o=><option key={o.id} value={o.id}>{o.concepto}{o.tipo_vehiculo?` · ${o.tipo_vehiculo}`:""} — {fmt.sol(o.tarifa)}</option>)}
                  </select></div>
              )}
              {form.tipo!=="especial" && form.empresa_id && opciones.length===0 && (
                <div style={{ gridColumn:"1/-1", fontSize:12, color:"#B45309", background:"#FFF7ED", border:"1px solid #FDBA7488", borderRadius:8, padding:"8px 10px" }}>
                  Este cliente no tiene tarifas por {form.tipo} configuradas. Puedes escribir el concepto y el precio a mano, o configurarlas en Clientes → Por viaje.
                </div>
              )}
              <div style={{ gridColumn:"1/-1" }}><label style={lbl}>Concepto</label>
                <input style={inp} value={form.concepto} onChange={e=>set("concepto",e.target.value)} placeholder={form.tipo==="recojo" ? "Ej. Recojo en almacén" : form.tipo==="viaje" ? "Ej. Lima – Callao" : "Ej. Unidad exclusiva a Huacho"}/></div>
              <div><label style={lbl}>{form.tipo==="recojo" ? "N° de recojos" : form.tipo==="viaje" ? "N° de viajes" : "Cantidad"}</label>
                <input type="number" min="0" step="1" style={inp} value={form.cantidad} onChange={e=>set("cantidad",e.target.value)}/></div>
              <div><label style={lbl}>{form.tipo==="especial" ? "Precio cotizado (S/, sin IGV)" : "Tarifa unitaria (S/, sin IGV)"}</label>
                <input type="number" min="0" step="0.01" style={inp} value={form.tarifa_unit} onChange={e=>set("tarifa_unit",e.target.value)} placeholder="0.00"/></div>
              {form.tipo==="especial" && <div style={{ gridColumn:"1/-1" }}><label style={lbl}>N° de cotización o referencia del acuerdo</label>
                <input style={inp} value={form.cotizacion_ref} onChange={e=>set("cotizacion_ref",e.target.value)} placeholder="Ej. COT-014, correo del 12/11, WhatsApp de Naim"/></div>}
              <div><label style={lbl}>Placa (opcional)</label>
                <input style={inp} list="bz-placas-serv" value={form.placa} onChange={e=>set("placa",e.target.value.toUpperCase())} placeholder="Ej. ABC-123"/>
                <datalist id="bz-placas-serv">{unidades.map(u=><option key={u.id} value={u.placa}/>)}</datalist></div>
              <div><label style={lbl}>Conductor (opcional)</label>
                <select style={inp} value={form.repartidor_id} onChange={e=>set("repartidor_id",e.target.value)}><option value="">—</option>{repartidores.filter(r=>r.activo).map(r=><option key={r.id} value={r.id}>{r.nombres} {r.apellidos}</option>)}</select></div>
              <div><label style={lbl}>Estado</label>
                <select style={inp} value={form.estado} onChange={e=>set("estado",e.target.value)}><option value="realizado">Realizado</option><option value="pendiente">Pendiente (programado)</option><option value="anulado">Anulado</option></select></div>
              <div style={{ gridColumn:"1/-1" }}><label style={lbl}>Notas</label><textarea style={{ ...inp, minHeight:50 }} value={form.notas} onChange={e=>set("notas",e.target.value)}/></div>
            </div>
            <div style={{ background:`${B.navy}08`, border:`1px solid ${B.gold}44`, borderRadius:10, padding:14, marginTop:14, display:"flex", gap:28, flexWrap:"wrap" }}>
              <div><div style={{ fontSize:12, color:B.textSec }}>Monto (sin IGV)</div><div style={{ fontSize:22, fontWeight:800, color:B.goldDk }}>{fmt.sol(montoForm)}</div></div>
              <div><div style={{ fontSize:12, color:B.textSec }}>IGV (18%)</div><div style={{ fontSize:15, fontWeight:600, color:B.textSec, marginTop:6 }}>{fmt.sol(montoForm*0.18)}</div></div>
              <div><div style={{ fontSize:12, color:B.textSec }}>Total con IGV</div><div style={{ fontSize:15, fontWeight:700, color:B.navy, marginTop:6 }}>{fmt.sol(montoForm*1.18)}</div></div>
            </div>
            <div style={{ display:"flex", justifyContent:"flex-end", gap:10, marginTop:18 }}>
              <BtnSec onClick={()=>setForm(null)}>Cancelar</BtnSec>
              <BtnPri onClick={guardar} disabled={guardando}>{guardando ? "Guardando…" : (form.id ? "Guardar cambios" : "Registrar servicio")}</BtnPri>
            </div>
          </div>
        </div>
      )}
      {confirmDel && <Confirm msg={`Se eliminará «${confirmDel.concepto}» por ${fmt.sol(confirmDel.monto)}. No se puede deshacer.`} onOk={eliminar} onCancel={()=>setConfirmDel(null)}/>}
    </div>
  );
}

export const TIPOS_INCIDENCIA = ["Daño del producto","Extravío","Cliente ausente","Dirección errónea","Rechazo del destinatario","Retraso","Reclamo del cliente","Otro"];
export const ESTADOS_INC = { abierta:{ label:"Abierta", c:"#B91C1C", bg:"#FEF2F2" }, en_proceso:{ label:"En proceso", c:"#B45309", bg:"#FFF7ED" }, resuelta:{ label:"Resuelta", c:"#047857", bg:"#ECFDF5" } };

export function Incidencias({ pedidos, empresas, repartidores, usuario, toast }) {
  const [lista, setLista] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [fEstado, setFEstado] = useState("");
  const [fTipo, setFTipo] = useState("");
  const [busq, setBusq] = useState("");
  const [form, setForm] = useState(null);
  const [qPedido, setQPedido] = useState("");
  const [subiendo, setSubiendo] = useState(false);

  const cargar = async () => {
    setCargando(true);
    const { data, error } = await sb.from("incidencias").select("*").order("created_at", { ascending:false });
    if (error) toast("Error al cargar incidencias: " + error.message + " (¿ejecutaste el SQL de la Fase 4?)", "error"); else setLista(data||[]);
    setCargando(false);
  };
  useEffect(() => { cargar(); }, []);

  const nombreEmp = (id) => (empresas.find(e=>e.id===id)||{}).nombre || "—";
  const nombreRep = (id) => { const r = repartidores.find(x=>x.id===id); return r ? `${r.nombres||""} ${r.apellidos||""}`.trim() : "—"; };

  const filtradas = useMemo(() => {
    const q = busq.trim().toLowerCase();
    return lista.filter(i => (!fEstado || i.estado===fEstado) && (!fTipo || i.tipo===fTipo) &&
      (!q || `${i.omd||""} ${i.descripcion||""} ${nombreEmp(i.empresa_id)}`.toLowerCase().includes(q)));
  }, [lista, fEstado, fTipo, busq, empresas]);
  const pgInc = usePaginacion(filtradas, 25, "incidencias");

  const mesActual = diaLocal().slice(0,7);
  const abiertas = lista.filter(i=>i.estado==="abierta").length;
  const enProceso = lista.filter(i=>i.estado==="en_proceso").length;
  const resueltasMes = lista.filter(i=>i.estado==="resuelta" && (i.resuelta_at||"").slice(0,7)===mesActual).length;
  const costoMes = lista.filter(i=>diaLocal(new Date(i.created_at)).slice(0,7)===mesActual).reduce((t,i)=>t+(parseFloat(i.costo_s)||0),0);
  const resueltas = lista.filter(i=>i.estado==="resuelta" && i.resuelta_at);
  const tMedio = resueltas.length ? resueltas.reduce((t,i)=>t+(new Date(i.resuelta_at)-new Date(i.created_at))/86400000,0)/resueltas.length : null;

  const nueva = () => { setQPedido(""); setForm({ tipo:TIPOS_INCIDENCIA[0], descripcion:"", estado:"abierta", resolucion:"", responsable:"", costo_s:"", evidencia_url:"", pedido_id:null, omd:"", empresa_id:null, repartidor_id:null }); };
  const editar = (i) => { setQPedido(""); setForm({ ...i, descripcion:i.descripcion||"", resolucion:i.resolucion||"", responsable:i.responsable||"", costo_s:i.costo_s||"", evidencia_url:i.evidencia_url||"" }); };
  const set = (k,v) => setForm(f => ({ ...f, [k]:v }));
  const sugerencias = useMemo(() => {
    const q = qPedido.trim().toLowerCase();
    if (q.length<2) return [];
    return pedidos.filter(p => `${p.omd||""} ${p.cliente_referencia||""} ${p.dest_nombre||""}`.toLowerCase().includes(q)).slice(0,6);
  }, [qPedido, pedidos]);
  const elegirPedido = (p) => { setForm(f => ({ ...f, pedido_id:p.id, omd:p.omd, empresa_id:p.empresa_id||null, repartidor_id:p.repartidor_id||null })); setQPedido(""); };

  const subir = async (file) => {
    if (!file) return; setSubiendo(true);
    try {
      const ext = (file.name.split(".").pop()||"jpg").toLowerCase();
      const ruta = `incidencias/${Date.now()}_${Math.random().toString(36).slice(2,7)}.${ext}`;
      const { error } = await sb.storage.from("evidencias").upload(ruta, file, { contentType:file.type||undefined });
      if (error) throw error;
      set("evidencia_url", sb.storage.from("evidencias").getPublicUrl(ruta).data.publicUrl);
    } catch (e) { toast("No se pudo subir la evidencia: " + (e.message||e), "error"); }
    setSubiendo(false);
  };

  const guardar = async () => {
    if (!form.tipo) { toast("Indica el tipo", "error"); return; }
    if (!form.descripcion.trim()) { toast("Describe qué pasó", "error"); return; }
    const reg = { pedido_id:form.pedido_id||null, omd:form.omd||null, empresa_id:form.empresa_id||null, repartidor_id:form.repartidor_id||null,
      tipo:form.tipo, descripcion:form.descripcion.trim(), estado:form.estado, resolucion:form.resolucion||null, responsable:form.responsable||null,
      costo_s:parseFloat(form.costo_s)||0, evidencia_url:form.evidencia_url||null,
      resuelta_at: form.estado==="resuelta" ? (form.resuelta_at || new Date().toISOString()) : null };
    const r = form.id ? await sb.from("incidencias").update(reg).eq("id", form.id)
                      : await sb.from("incidencias").insert({ ...reg, created_by: usuario?.nombre || null });
    if (r.error) { toast("Error al guardar: " + r.error.message, "error"); return; }
    toast("Incidencia guardada ✓"); setForm(null); cargar();
  };

  const card = CARD;
  const th = { textAlign:"left", padding:"10px 14px", fontSize:11, fontWeight:700, color:B.textSec, background:"#F6F9FC", letterSpacing:".3px", borderBottom:"1px solid #E3EAF2", whiteSpace:"nowrap" };
  const td = { padding:"12px 14px", fontSize:13, borderBottom:"1px solid #E3EAF2", verticalAlign:"top" };
  const Kpi = kpiMini;

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:10, marginBottom:14 }}>
        <div style={{ fontSize:12, color:B.textSec }}>Daños, extravíos, reclamos y otros problemas de entrega, con evidencia, responsable y costo.</div>
        <BtnPri onClick={nueva}><Ico n="plus" size={15} sw={2.4}/> Nueva incidencia</BtnPri>
      </div>
      <div style={{ display:"flex", gap:12, flexWrap:"wrap", marginBottom:14 }}>
        <Kpi t="Abiertas" v={abiertas} c={B.red}/><Kpi t="En proceso" v={enProceso} c={B.orange}/>
        <Kpi t="Resueltas este mes" v={resueltasMes} c={B.green} s={tMedio!=null?`tiempo medio ${tMedio.toFixed(1)} días`:""}/>
        <Kpi t="Costo este mes" v={solN(costoMes)} c={B.navy} s="compensaciones y reposiciones"/>
      </div>
      <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginBottom:12, alignItems:"flex-end" }}>
        <div><label style={lbl}>Estado</label><select style={{...inp,width:150}} value={fEstado} onChange={e=>setFEstado(e.target.value)}><option value="">Todos</option>{Object.entries(ESTADOS_INC).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select></div>
        <div><label style={lbl}>Tipo</label><select style={{...inp,width:210}} value={fTipo} onChange={e=>setFTipo(e.target.value)}><option value="">Todos</option>{TIPOS_INCIDENCIA.map(t=><option key={t}>{t}</option>)}</select></div>
        <div style={{ flex:"1 1 200px", minWidth:0 }}><label style={lbl}>Buscar</label><input style={inp} placeholder="Tracking, cliente o descripción…" value={busq} onChange={e=>setBusq(e.target.value)}/></div>
      </div>
      <div style={{ ...card, overflowX:"auto" }}>
        {cargando ? <Cargando filas={5}/> : filtradas.length===0 ?
          <EstadoVacio icono="check" titulo="Sin incidencias" texto="No hay incidencias con estos filtros."><BtnPri onClick={nueva}>Registrar una</BtnPri></EstadoVacio> :
          <><table style={{ width:"100%", borderCollapse:"collapse" }}>
            <thead><tr><th style={th}>Fecha</th><th style={th}>Pedido</th><th style={th}>Cliente</th><th style={th}>Tipo</th><th style={th}>Detalle</th><th style={th}>Estado</th><th style={{...th,textAlign:"right"}}>Costo</th></tr></thead>
            <tbody>{pgInc.visibles.map(i => { const e = ESTADOS_INC[i.estado]; return (
              <tr key={i.id} onClick={()=>editar(i)} style={{ cursor:"pointer" }}>
                <td style={td}>{fmt.fecha(i.created_at)}</td>
                <td style={{...td,fontWeight:700,color:B.navy}}>{i.omd||"—"}<div style={{ fontSize:11, color:B.textMut, fontWeight:400 }}>{i.repartidor_id?nombreRep(i.repartidor_id):""}</div></td>
                <td style={td}>{nombreEmp(i.empresa_id)}</td>
                <td style={td}>{i.tipo}</td>
                <td style={{...td,maxWidth:320}}>{i.descripcion}{i.evidencia_url && <a href={i.evidencia_url} target="_blank" rel="noreferrer" onClick={ev=>ev.stopPropagation()} style={{ fontSize:11, color:B.blue, marginLeft:8 }}>Ver</a>}</td>
                <td style={td}><span style={{ background:e.bg, color:e.c, fontSize:11, fontWeight:700, padding:"2px 10px", borderRadius:20 }}>{e.label}</span></td>
                <td style={{...td,textAlign:"right"}}>{parseFloat(i.costo_s)>0?solN(parseFloat(i.costo_s)):"—"}</td>
              </tr>); })}</tbody>
          </table>{pgInc.pie}</>}
      </div>

      {form && (
        <div style={{ position:"fixed", inset:0, background:"#0008", zIndex:1500, display:"flex", alignItems:"center", justifyContent:"center", padding:12 }}>
          <div style={{ background:B.white, borderRadius:16, padding:24, width:560, maxWidth:"100%", maxHeight:"92vh", overflowY:"auto", boxShadow:"0 20px 60px #0003" }}>
            <div style={{ fontSize:17, fontWeight:800, color:B.navy, marginBottom:14 }}>{form.id?"Incidencia":"Nueva incidencia"}</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
              <div style={{ gridColumn:"1/-1", position:"relative" }}>
                <label style={lbl}>Pedido</label>
                {form.omd ? (
                  <div style={{ display:"flex", alignItems:"center", gap:10, background:B.bg, border:`1px solid ${B.border}`, borderRadius:8, padding:"8px 12px", fontSize:13 }}>
                    <b style={{ color:B.navy }}>{form.omd}</b><span style={{ color:B.textSec }}>{nombreEmp(form.empresa_id)}</span>
                    <button onClick={()=>setForm(f=>({...f,pedido_id:null,omd:"",empresa_id:null,repartidor_id:null}))} style={{ marginLeft:"auto", background:"none", border:"none", cursor:"pointer", color:B.textSec }}><Ico n="x" size={14}/></button>
                  </div>
                ) : (<>
                  <input style={inp} placeholder="Busca por tracking, N° de orden o destinatario (opcional)" value={qPedido} onChange={e=>setQPedido(e.target.value)}/>
                  {sugerencias.length>0 && <div style={{ position:"absolute", left:0, right:0, top:"100%", zIndex:5, background:B.white, border:`1px solid ${B.border}`, borderRadius:8, boxShadow:"0 8px 24px #0003", marginTop:2 }}>
                    {sugerencias.map(p => <div key={p.id} onClick={()=>elegirPedido(p)} style={{ padding:"8px 12px", cursor:"pointer", fontSize:13, borderBottom:`1px solid ${B.border}` }}><b>{p.omd}</b> · {p.dest_nombre||""} <span style={{ color:B.textMut }}>{nombreEmp(p.empresa_id)}</span></div>)}
                  </div>}
                </>)}
              </div>
              <div><label style={lbl}>Tipo</label><select style={inp} value={form.tipo} onChange={e=>set("tipo",e.target.value)}>{TIPOS_INCIDENCIA.map(t=><option key={t}>{t}</option>)}</select></div>
              <div><label style={lbl}>Estado</label><select style={inp} value={form.estado} onChange={e=>set("estado",e.target.value)}>{Object.entries(ESTADOS_INC).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select></div>
              <div style={{ gridColumn:"1/-1" }}><label style={lbl}>¿Qué pasó?</label><textarea style={{...inp,minHeight:64}} value={form.descripcion} onChange={e=>set("descripcion",e.target.value)}/></div>
              <div><label style={lbl}>Responsable del seguimiento</label><input style={inp} value={form.responsable} onChange={e=>set("responsable",e.target.value)}/></div>
              <div><label style={lbl}>Costo para Boaz (S/)</label><input type="number" step="0.01" style={inp} value={form.costo_s} onChange={e=>set("costo_s",e.target.value)}/></div>
              <div style={{ gridColumn:"1/-1" }}><label style={lbl}>Resolución / acuerdo con el cliente</label><textarea style={{...inp,minHeight:50}} value={form.resolucion} onChange={e=>set("resolucion",e.target.value)}/></div>
              <div style={{ gridColumn:"1/-1" }}><label style={lbl}>Evidencia (foto o PDF)</label><input type="file" accept="image/*,application/pdf" onChange={e=>subir(e.target.files[0])} style={{ fontSize:12 }}/>{subiendo && <span style={{ fontSize:12, color:B.textSec }}> Subiendo…</span>}{form.evidencia_url && <div><a href={form.evidencia_url} target="_blank" rel="noreferrer" style={{ fontSize:12, color:B.blue }}>Ver evidencia</a></div>}</div>
            </div>
            <div style={{ display:"flex", justifyContent:"flex-end", gap:10, marginTop:16 }}><BtnSec onClick={()=>setForm(null)}>Cancelar</BtnSec><BtnPri onClick={guardar} disabled={subiendo}>Guardar</BtnPri></div>
          </div>
        </div>)}
    </div>
  );
}

// ── USUARIOS, ROLES Y AUDITORÍA ───────────────────────────────
export const ETIQ_TABLA = { facturas:"Facturas", gastos:"Gastos", liquidaciones:"Liq. repartidores", repartidores:"Repartidores", empresas:"Clientes", vehiculo_documentos:"Doc. de flota", pagos_planilla:"Pagos planilla", pagos_terceros:"Pagos terceros", tarifarios_cliente:"Tarifas cliente", tarifarios_vehiculo_cliente:"Tarifas vehículo", tarifario_estandar:"Tarifa estándar", unidades_transporte:"Unidades", asignaciones_unidad:"Asignaciones", usuarios:"Usuarios", roles_permisos:"Roles y permisos", incidencias:"Incidencias", cotizaciones:"Cotizaciones", pedidos:"Pedidos" };
export const ETIQ_OP = { INSERT:["Creó","#047857","#ECFDF5"], UPDATE:["Modificó","#B45309","#FFF7ED"], DELETE:["Eliminó","#B91C1C","#FEF2F2"] };

export function UsuariosAuditoria({ usuario, navModulos, onPermisosCambio, toast }) {
  const [tab, setTab] = useState("usuarios");
  const [usuarios, setUsuarios] = useState([]);
  const [pendientes, setPendientes] = useState([]);
  const [roles, setRoles] = useState({});
  const [rolSel, setRolSel] = useState("operaciones");
  const [nuevoRol, setNuevoRol] = useState("");
  const [cargando, setCargando] = useState(true);
  const [activar, setActivar] = useState(null);
  const [audit, setAudit] = useState([]);
  const [fTabla, setFTabla] = useState("");
  const [fOp, setFOp] = useState("");
  const [fDesde, setFDesde] = useState(diaLocal().slice(0,8)+"01");
  const [fBusq, setFBusq] = useState("");
  const [cargandoAud, setCargandoAud] = useState(false);

  const cargar = async () => {
    setCargando(true);
    const [u, r, p] = await Promise.all([
      sb.from("usuarios").select("*").order("nombre"),
      sb.from("roles_permisos").select("*"),
      sb.rpc("usuarios_auth_pendientes"),
    ]);
    if (u.error) toast("No se pudieron leer los usuarios: " + u.error.message + " (¿ejecutaste el SQL de la Fase 4?)", "error"); else setUsuarios(u.data||[]);
    if (!r.error) { const m = {}; (r.data||[]).forEach(x => m[x.rol] = x.modulos||[]); setRoles(m); }
    setPendientes(p.error ? [] : (p.data||[]));
    setCargando(false);
  };
  useEffect(() => { cargar(); }, []);

  const cargarAud = async () => {
    setCargandoAud(true);
    let q = sb.from("auditoria").select("*").order("created_at", { ascending:false }).limit(300).gte("created_at", fDesde+"T00:00:00");
    if (fTabla) q = q.eq("tabla", fTabla);
    if (fOp) q = q.eq("operacion", fOp);
    const { data, error } = await q;
    if (error) toast("No se pudo leer la auditoría: " + error.message, "error"); else setAudit(data||[]);
    setCargandoAud(false);
  };
  useEffect(() => { if (tab==="auditoria") cargarAud(); }, [tab, fTabla, fOp, fDesde]);

  const nombresRol = [...new Set(["admin","operaciones","finanzas",...Object.keys(roles)])];
  const cambiarUsuario = async (u, cambios) => {
    if (u.id===usuario.id) { toast("No puedes cambiar tu propio rol ni desactivarte", "error"); return; }
    const { error } = await sb.from("usuarios").update(cambios).eq("id", u.id);
    if (error) { toast("Error: " + error.message, "error"); return; }
    toast("Usuario actualizado ✓"); cargar();
  };
  const confirmarActivar = async () => {
    if (!activar.nombre.trim()) { toast("Escribe el nombre", "error"); return; }
    const { error } = await sb.from("usuarios").insert({ id:activar.id, nombre:activar.nombre.trim(), rol:activar.rol, activo:true, ...(activar.email?{ email:activar.email }:{}) });
    if (error) {
      const r2 = await sb.from("usuarios").insert({ id:activar.id, nombre:activar.nombre.trim(), rol:activar.rol, activo:true });
      if (r2.error) { toast("Error: " + r2.error.message, "error"); return; }
    }
    toast("Usuario activado ✓"); setActivar(null); cargar();
  };

  const modulosPorSeccion = useMemo(() => { const m = {}; navModulos.forEach(x => { (m[x.grupo] = m[x.grupo] || []).push(x); }); return m; }, [navModulos]);
  const permisosRol = roles[rolSel] || [];
  const togglePermiso = async (id) => {
    if (rolSel==="admin") return;
    const nuevos = permisosRol.includes(id) ? permisosRol.filter(x=>x!==id) : [...permisosRol, id];
    if (!nuevos.includes("dashboard")) nuevos.push("dashboard");
    const { error } = await sb.from("roles_permisos").upsert({ rol:rolSel, modulos:nuevos, updated_at:new Date().toISOString() });
    if (error) { toast("Error: " + error.message, "error"); return; }
    setRoles(r => ({ ...r, [rolSel]:nuevos })); onPermisosCambio && onPermisosCambio();
  };
  const crearRol = async () => {
    const n = nuevoRol.trim().toLowerCase().replace(/\s+/g,"_");
    if (!n || roles[n]) { toast("Escribe un nombre de rol nuevo", "error"); return; }
    const { error } = await sb.from("roles_permisos").insert({ rol:n, modulos:["dashboard"], descripcion:"Rol personalizado" });
    if (error) { toast("Error: " + error.message, "error"); return; }
    setNuevoRol(""); setRolSel(n); cargar();
  };

  const nombreDe = (a) => a.email || (usuarios.find(u=>u.id===a.usuario_id)||{}).nombre || (a.usuario_id ? a.usuario_id.slice(0,8) : "Sistema / web");
  const resumen = (a) => {
    const o = a.despues || a.antes || {};
    if (a.operacion==="UPDATE") return Object.keys(a.despues||{}).slice(0,4).map(k => `${k}: ${fmtVal(a.antes?.[k])} → ${fmtVal(a.despues?.[k])}`).join(" · ");
    const ref = o.omd || o.nombre || o.descripcion || o.numero || o.placa || o.tipo || "";
    return String(ref).slice(0,80);
  };
  const fmtVal = (v) => v==null ? "∅" : typeof v==="object" ? JSON.stringify(v).slice(0,24) : String(v).slice(0,28);
  const audFilt = audit.filter(a => { const q = fBusq.trim().toLowerCase(); return !q || `${nombreDe(a)} ${ETIQ_TABLA[a.tabla]||a.tabla} ${resumen(a)}`.toLowerCase().includes(q); });
  const pgAud = usePaginacion(audFilt, 25, "registros");

  const card = CARD;
  const th = { textAlign:"left", padding:"10px 14px", fontSize:11, fontWeight:700, color:B.textSec, background:"#F6F9FC", letterSpacing:".3px", borderBottom:"1px solid #E3EAF2", whiteSpace:"nowrap" };
  const td = { padding:"12px 14px", fontSize:13, borderBottom:"1px solid #E3EAF2", verticalAlign:"top" };
  const TabBtn = ({ id, children }) => (<button onClick={()=>setTab(id)} style={TAB_SEG(tab===id)}>{children}</button>);

  return (
    <div>
      <div style={{ ...TAB_CONT, marginBottom:14 }}>
        <TabBtn id="usuarios">Usuarios{pendientes.length>0 && <span style={{ background:"#FEE2E2", color:"#B91C1C", fontSize:11, fontWeight:700, padding:"1px 7px", borderRadius:10 }}>{pendientes.length}</span>}</TabBtn>
        <TabBtn id="roles">Roles y permisos</TabBtn><TabBtn id="auditoria">Auditoría</TabBtn>
      </div>

      {tab==="usuarios" && (<>
        {pendientes.length>0 && (
          <div style={{ background:"#FFF7ED", border:"1px solid #FDBA74", borderRadius:12, padding:"12px 16px", marginBottom:14 }}>
            <div style={{ fontWeight:800, fontSize:13, color:"#9A3412", marginBottom:8 }}>Cuentas creadas pendientes de activar en el ERP</div>
            {pendientes.map(p => (
              <div key={p.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"6px 0", flexWrap:"wrap" }}>
                <span style={{ fontSize:13, fontWeight:600 }}>{p.email}</span><span style={{ fontSize:11, color:B.textMut }}>creada el {fmt.fecha(p.creado)}</span>
                <BtnPri style={{ marginLeft:"auto", padding:"5px 14px", fontSize:12 }} onClick={()=>setActivar({ id:p.id, email:p.email, nombre:"", rol:"operaciones" })}>Activar</BtnPri>
              </div>))}
          </div>)}
        <div style={{ ...card, overflowX:"auto" }}>
          {cargando ? <Cargando filas={4}/> : <table style={{ width:"100%", borderCollapse:"collapse" }}>
            <thead><tr><th style={th}>Nombre</th><th style={th}>Correo</th><th style={th}>Rol<Ayuda k="rol" size={13}/></th><th style={th}>Estado</th></tr></thead>
            <tbody>{usuarios.map(u => (
              <tr key={u.id}>
                <td style={{...td,fontWeight:700}}>{u.nombre}{u.id===usuario.id && <span style={{ marginLeft:8, fontSize:10, background:B.bg, color:B.textSec, padding:"1px 8px", borderRadius:10 }}>tú</span>}</td>
                <td style={td}>{u.email||"—"}</td>
                <td style={td}><select style={{...inp,width:160,padding:"6px 10px"}} value={u.rol} disabled={u.id===usuario.id} onChange={e=>cambiarUsuario(u,{ rol:e.target.value })}>{nombresRol.map(r=><option key={r}>{r}</option>)}</select></td>
                <td style={td}><button disabled={u.id===usuario.id} onClick={()=>cambiarUsuario(u,{ activo:!u.activo })} style={{ border:"none", borderRadius:20, padding:"4px 12px", fontSize:11, fontWeight:700, cursor:u.id===usuario.id?"not-allowed":"pointer", background:u.activo?"#ECFDF5":"#FEF2F2", color:u.activo?B.green:B.red }}>{u.activo?"Activo":"Desactivado"}</button></td>
              </tr>))}</tbody>
          </table>}
        </div>
        <div style={{ fontSize:11, color:B.textMut, marginTop:8, lineHeight:1.6 }}>Para agregar a alguien: en Supabase → Authentication → Users → <b>Add user</b> (correo y contraseña). La cuenta aparecerá arriba como pendiente y aquí le asignas nombre y rol. Al desactivar a un usuario pierde el acceso de inmediato.</div>
      </>)}

      {tab==="roles" && (
        <div style={{ display:"grid", gridTemplateColumns:"220px minmax(0,1fr)", gap:14, alignItems:"start" }}>
          <div style={{ ...card, padding:12 }}>
            {nombresRol.map(r => (<button key={r} onClick={()=>setRolSel(r)} style={{ display:"block", width:"100%", textAlign:"left", padding:"9px 12px", borderRadius:8, border:"none", cursor:"pointer", fontSize:13, fontWeight:rolSel===r?800:500, background:rolSel===r?`${B.gold}22`:"transparent", color:B.textPri, marginBottom:2 }}>{r}</button>))}
            <div style={{ borderTop:`1px solid ${B.border}`, marginTop:8, paddingTop:10 }}>
              <input style={{...inp,marginBottom:6}} placeholder="Nuevo rol…" value={nuevoRol} onChange={e=>setNuevoRol(e.target.value)}/>
              <BtnSec onClick={crearRol} style={{ width:"100%" }}><Ico n="plus" size={15}/> Crear rol</BtnSec>
            </div>
          </div>
          <div style={{ ...card, padding:18 }}>
            <div style={{ fontSize:14, fontWeight:800, color:B.navy, marginBottom:4 }}>Módulos que ve «{rolSel}»</div>
            {rolSel==="admin" ? <div style={{ fontSize:12, color:B.textSec, marginBottom:10 }}>El rol admin siempre tiene acceso a todo (así nunca te quedas sin acceso).</div> : <div style={{ fontSize:12, color:B.textSec, marginBottom:10 }}>Marca o desmarca: el cambio se guarda al instante y se aplica cuando el usuario recarga el ERP.</div>}
            {Object.entries(modulosPorSeccion).map(([g, ms]) => (
              <div key={g} style={{ marginBottom:12 }}>
                <div style={{ fontSize:10, fontWeight:700, color:B.textMut, letterSpacing:"1px", marginBottom:6 }}>{g}</div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>{ms.map(m => { const on = rolSel==="admin" || permisosRol.includes(m.id); return (
                  <label key={m.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"7px 12px", borderRadius:10, border:`1px solid ${on?B.gold:B.border}`, background:on?`${B.gold}14`:B.white, fontSize:13, cursor:rolSel==="admin"||m.id==="dashboard"?"default":"pointer" }}>
                    <input type="checkbox" checked={on} disabled={rolSel==="admin"||m.id==="dashboard"} onChange={()=>togglePermiso(m.id)}/><Ico n={m.icon} size={15}/>{m.label}</label>); })}</div>
              </div>))}
          </div>
        </div>)}

      {tab==="auditoria" && (<>
        <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginBottom:12, alignItems:"flex-end" }}>
          <div><label style={lbl}>Desde</label><input type="date" style={{...inp,width:150}} value={fDesde} onChange={e=>setFDesde(e.target.value)}/></div>
          <div><label style={lbl}>Módulo</label><select style={{...inp,width:190}} value={fTabla} onChange={e=>setFTabla(e.target.value)}><option value="">Todos</option>{Object.entries(ETIQ_TABLA).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></div>
          <div><label style={lbl}>Acción</label><select style={{...inp,width:140}} value={fOp} onChange={e=>setFOp(e.target.value)}><option value="">Todas</option><option value="INSERT">Creó</option><option value="UPDATE">Modificó</option><option value="DELETE">Eliminó</option></select></div>
          <div style={{ flex:"1 1 200px", minWidth:0 }}><label style={lbl}>Buscar</label><input style={inp} placeholder="Usuario o dato…" value={fBusq} onChange={e=>setFBusq(e.target.value)}/></div>
        </div>
        <div style={{ ...card, overflowX:"auto" }}>
          {cargandoAud ? <Cargando filas={6}/> : audFilt.length===0 ? <EstadoVacio icono="shield" titulo="Sin movimientos" texto="No hay cambios registrados con estos filtros. La auditoría empieza a registrar desde que ejecutaste el SQL de la Fase 4."/> :
            <><table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead><tr><th style={th}>Cuándo</th><th style={th}>Quién</th><th style={th}>Acción</th><th style={th}>Módulo</th><th style={th}>Detalle</th></tr></thead>
              <tbody>{pgAud.visibles.map(a => { const o = ETIQ_OP[a.operacion] || [a.operacion,"#000","#eee"]; return (
                <tr key={a.id}>
                  <td style={{...td,whiteSpace:"nowrap"}}>{fmt.fechaHora(a.created_at)}</td>
                  <td style={{...td,fontWeight:600}}>{nombreDe(a)}</td>
                  <td style={td}><span style={{ background:o[2], color:o[1], fontSize:11, fontWeight:700, padding:"2px 10px", borderRadius:20 }}>{o[0]}</span></td>
                  <td style={td}>{ETIQ_TABLA[a.tabla]||a.tabla}</td>
                  <td style={{...td,color:B.textSec,fontSize:12,maxWidth:420}}>{resumen(a)}</td>
                </tr>); })}</tbody>
            </table>{pgAud.pie}</>}
        </div>
        <div style={{ fontSize:11, color:B.textMut, marginTop:8 }}>Se muestran los últimos 300 movimientos. Los cambios de estado de pedidos no se registran (son muy frecuentes); sí la eliminación de pedidos. Las claves y PIN nunca se guardan en la auditoría.</div>
      </>)}

      {activar && (
        <div style={{ position:"fixed", inset:0, background:"#0008", zIndex:1500, display:"flex", alignItems:"center", justifyContent:"center", padding:12 }}>
          <div style={{ background:B.white, borderRadius:16, padding:24, width:420, maxWidth:"100%" }}>
            <div style={{ fontSize:16, fontWeight:800, color:B.navy, marginBottom:4 }}>Activar usuario</div>
            <div style={{ fontSize:12, color:B.textSec, marginBottom:14 }}>{activar.email}</div>
            <label style={lbl}>Nombre</label><input style={{...inp,marginBottom:12}} value={activar.nombre} onChange={e=>setActivar(a=>({...a,nombre:e.target.value}))}/>
            <label style={lbl}>Rol</label><select style={{...inp,marginBottom:16}} value={activar.rol} onChange={e=>setActivar(a=>({...a,rol:e.target.value}))}>{nombresRol.map(r=><option key={r}>{r}</option>)}</select>
            <div style={{ display:"flex", justifyContent:"flex-end", gap:10 }}><BtnSec onClick={()=>setActivar(null)}>Cancelar</BtnSec><BtnPri onClick={confirmarActivar}>Activar</BtnPri></div>
          </div>
        </div>)}
    </div>
  );
}

