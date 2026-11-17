// BOAZ ERP — módulo "costos" (parte de BoazERP; ver src/BoazERP.jsx)
import { useState, useEffect, useCallback, useRef, useMemo, Fragment } from "react";
import { B, BtnIco, BtnPri, BtnSec, CARD, Cargando, Confirm, EstadoVacio, Etiqueta, Ico, Kpi, TAB_CONT, TAB_SEG, XLSX, asegurarXLSX, diaLocal, fmt, inp, kpiMini, lbl, sb, usePaginacion } from "./base.jsx";
import { CAT_PERSONAL, cargarEgresosPersonal } from "./dashboard.jsx";
import { PORCENTAJE_ONP, UMBRAL_RETENCION_HONORARIOS, calcularNetoPlanilla } from "./ventas.jsx";
import { DirectorioPersonas } from "./operacion.jsx";

// ── GASTOS / INGRESOS ─────────────────────────────────────────
export const CAT_EGRESO = ["Combustible","Mantenimiento","Reparación","Repuestos y llantas","Peajes y estacionamiento","Lavado","Seguro y SOAT","Revisión técnica","Multas","Viáticos","Servicios","Alquiler","Impuestos","Otros"];
export const CAT_INGRESO = ["Otros ingresos","Reembolso de gasto","Venta de activo","Aporte de socio"];
export const METODOS_PAGO = ["Efectivo","Transferencia","Tarjeta","Yape/Plin","Crédito"];
export const hoyLocal = () => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
export const inicioMes = () => hoyLocal().slice(0,8)+"01";
export const sumar = (arr, f) => arr.reduce((s,x)=>s+(parseFloat(f(x))||0),0);
export const solN = (n) => `S/ ${(n||0).toLocaleString("es-PE",{minimumFractionDigits:2,maximumFractionDigits:2})}`;

export function Gastos({ unidades, repartidores, toast, usuario }) {
  const [lista, setLista] = useState([]);
  const [facturas, setFacturas] = useState([]);
  const [personal, setPersonal] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [desde, setDesde] = useState(inicioMes());
  const [hasta, setHasta] = useState(hoyLocal());
  const [fTipo, setFTipo] = useState("todos");
  const [fCat, setFCat] = useState("");
  const [fPlaca, setFPlaca] = useState("");
  const [busq, setBusq] = useState("");
  const [tab, setTab] = useState("mov");
  const [form, setForm] = useState(null);
  const [subiendo, setSubiendo] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);
  const [alertas, setAlertas] = useState([]);

  const placas = useMemo(() => {
    const s = new Set();
    (unidades||[]).forEach(u => u.placa && s.add(u.placa.toUpperCase()));
    (repartidores||[]).forEach(r => r.placa && s.add(r.placa.toUpperCase()));
    lista.forEach(g => g.placa && s.add(g.placa.toUpperCase()));
    return [...s].sort();
  }, [unidades, repartidores, lista]);

  const cargar = async () => {
    setCargando(true);
    const [g, f, a] = await Promise.all([
      sb.from("gastos").select("*").gte("fecha", desde).lte("fecha", hasta).order("fecha", { ascending:false }).order("created_at", { ascending:false }),
      sb.from("facturas").select("id,serie,numero,descripcion,fecha_emision,total_s,igv_s,estado").gte("fecha_emision", desde).lte("fecha_emision", hasta),
      sb.from("gastos").select("placa,categoria,fecha,proximo_mant_km,proximo_mant_fecha,km").not("placa","is",null).order("fecha",{ascending:false}).limit(2000),
    ]);
    if (g.error) toast("Error al cargar gastos: " + g.error.message + " (¿ejecutaste el SQL gastos_boaz.sql?)", "error");
    else setLista(g.data||[]);
    setFacturas((f.data||[]).filter(x => x.estado !== "anulada" && x.estado !== "anulado"));
    cargarEgresosPersonal().then(p => setPersonal(p.filter(x => x.fecha>=desde && x.fecha<=hasta))).catch(()=>setPersonal([]));
    // alertas de mantenimiento: último registro con próximo mant. por placa
    if (!a.error) {
      const ultKm = {}, vistos = {}, out = [];
      (a.data||[]).forEach(r => { if (r.km && !(r.placa in ultKm)) ultKm[r.placa] = r.km; });
      const hoy = hoyLocal(); const lim = new Date(); lim.setDate(lim.getDate()+15);
      const limS = `${lim.getFullYear()}-${String(lim.getMonth()+1).padStart(2,"0")}-${String(lim.getDate()).padStart(2,"0")}`;
      (a.data||[]).forEach(r => {
        if (!["Mantenimiento","Reparación"].includes(r.categoria) || vistos[r.placa]) return;
        vistos[r.placa] = true;
        if (r.proximo_mant_fecha && r.proximo_mant_fecha <= limS)
          out.push({ placa:r.placa, msg: r.proximo_mant_fecha < hoy ? `Mantenimiento VENCIDO desde ${fmt.fecha(r.proximo_mant_fecha)}` : `Mantenimiento programado el ${fmt.fecha(r.proximo_mant_fecha)}`, rojo: r.proximo_mant_fecha < hoy });
        if (r.proximo_mant_km && ultKm[r.placa] && ultKm[r.placa] >= r.proximo_mant_km - 500)
          out.push({ placa:r.placa, msg:`Cerca del km de mantenimiento (${r.proximo_mant_km.toLocaleString()} km; actual ${ultKm[r.placa].toLocaleString()})`, rojo: ultKm[r.placa] >= r.proximo_mant_km });
      });
      setAlertas(out);
    }
    setCargando(false);
  };
  useEffect(() => { cargar(); }, [desde, hasta]);

  // ingresos automáticos desde facturas (base sin IGV)
  const ingFact = useMemo(() => facturas.map(f => ({
    id:"f-"+f.id, auto:true, tipo:"ingreso", categoria:"Facturación", fecha:f.fecha_emision, placa:null,
    descripcion:`Factura ${f.serie||""}-${f.numero||""} ${f.descripcion||""}`.trim(),
    proveedor:null, monto:(parseFloat(f.total_s)||0)-(parseFloat(f.igv_s)||0), igv:parseFloat(f.igv_s)||0,
  })), [facturas]);

  const todos = useMemo(() => [...lista, ...ingFact, ...personal].sort((a,b)=> (b.fecha||"").localeCompare(a.fecha||"")), [lista, ingFact, personal]);
  const filtrados = useMemo(() => {
    const q = busq.trim().toLowerCase();
    return todos.filter(g =>
      (fTipo==="todos" || g.tipo===fTipo) && (!fCat || g.categoria===fCat) && (!fPlaca || (g.placa||"").toUpperCase()===fPlaca) &&
      (!q || [g.descripcion,g.proveedor,g.categoria,g.placa,g.comprobante_numero].some(v => (v||"").toLowerCase().includes(q))));
  }, [todos, fTipo, fCat, fPlaca, busq]);

  const ingresos = sumar(filtrados.filter(g=>g.tipo==="ingreso"), g=>g.monto);
  const egresos = sumar(filtrados.filter(g=>g.tipo==="egreso"), g=>g.monto);
  const combustible = sumar(filtrados.filter(g=>g.tipo==="egreso"&&g.categoria==="Combustible"), g=>g.monto);
  const mant = sumar(filtrados.filter(g=>g.tipo==="egreso"&&["Mantenimiento","Reparación","Repuestos y llantas"].includes(g.categoria)), g=>g.monto);

  const porCategoria = useMemo(() => {
    const m = {};
    filtrados.filter(g=>g.tipo==="egreso").forEach(g => { m[g.categoria] = (m[g.categoria]||0) + (parseFloat(g.monto)||0); });
    return Object.entries(m).sort((a,b)=>b[1]-a[1]);
  }, [filtrados]);

  const porVehiculo = useMemo(() => {
    const m = {};
    filtrados.filter(g=>g.tipo==="egreso" && g.placa).forEach(g => {
      const p = g.placa.toUpperCase();
      const o = m[p] || (m[p] = { placa:p, comb:0, mant:0, otros:0, total:0, gal:0, kms:[] });
      const v = parseFloat(g.monto)||0;
      if (g.categoria==="Combustible") { o.comb += v; o.gal += parseFloat(g.galones)||0; }
      else if (["Mantenimiento","Reparación","Repuestos y llantas"].includes(g.categoria)) o.mant += v;
      else o.otros += v;
      o.total += v;
      if (g.km) o.kms.push(g.km);
    });
    return Object.values(m).map(o => {
      const rec = o.kms.length>1 ? Math.max(...o.kms)-Math.min(...o.kms) : 0;
      return { ...o, rec, ckm: rec>0 ? o.total/rec : null };
    }).sort((a,b)=>b.total-a.total);
  }, [filtrados]);

  const nuevo = (tipo="egreso") => setForm({ tipo, fecha:hoyLocal(), categoria: tipo==="egreso"?"Combustible":"Otros ingresos", placa:"", descripcion:"", proveedor:"", monto:"", conIgv:false, metodo_pago:"Efectivo", comprobante_tipo:"", comprobante_numero:"", comprobante_url:"", km:"", galones:"", proximo_mant_km:"", proximo_mant_fecha:"", notas:"" });
  const editar = (g) => setForm({ ...g, placa:g.placa||"", monto:g.monto, conIgv:false, km:g.km??"", galones:g.galones??"", proximo_mant_km:g.proximo_mant_km??"", proximo_mant_fecha:g.proximo_mant_fecha||"", descripcion:g.descripcion||"", proveedor:g.proveedor||"", metodo_pago:g.metodo_pago||"", comprobante_tipo:g.comprobante_tipo||"", comprobante_numero:g.comprobante_numero||"", comprobante_url:g.comprobante_url||"", notas:g.notas||"" });
  const set = (k,v) => setForm(f => ({ ...f, [k]:v }));

  const subirComprobante = async (file) => {
    if (!file) return;
    setSubiendo(true);
    try {
      const ext = (file.name.split(".").pop()||"jpg").toLowerCase();
      const ruta = `gastos/${Date.now()}_${Math.random().toString(36).slice(2,7)}.${ext}`;
      const { error } = await sb.storage.from("evidencias").upload(ruta, file, { contentType:file.type||undefined });
      if (error) throw error;
      const { data } = sb.storage.from("evidencias").getPublicUrl(ruta);
      set("comprobante_url", data.publicUrl);
    } catch (e) { toast("No se pudo subir el comprobante: " + (e.message||e), "error"); }
    setSubiendo(false);
  };

  const guardar = async () => {
    const monto = parseFloat(form.monto);
    if (!monto || monto <= 0) { toast("Ingresa un monto válido", "error"); return; }
    const igv = form.conIgv ? +(monto - monto/1.18).toFixed(2) : (parseFloat(form.igv)||0);
    const num = (v) => v === "" || v == null ? null : Number(v);
    const reg = {
      fecha: form.fecha, tipo: form.tipo, categoria: form.categoria,
      placa: form.placa ? form.placa.toUpperCase().trim() : null,
      descripcion: form.descripcion||null, proveedor: form.proveedor||null,
      monto, igv, metodo_pago: form.metodo_pago||null,
      comprobante_tipo: form.comprobante_tipo||null, comprobante_numero: form.comprobante_numero||null, comprobante_url: form.comprobante_url||null,
      km: num(form.km), galones: num(form.galones),
      proximo_mant_km: num(form.proximo_mant_km), proximo_mant_fecha: form.proximo_mant_fecha||null,
      notas: form.notas||null,
    };
    const r = form.id
      ? await sb.from("gastos").update(reg).eq("id", form.id)
      : await sb.from("gastos").insert({ ...reg, created_by: usuario?.nombre || usuario?.email || null });
    if (r.error) { toast("Error al guardar: " + r.error.message, "error"); return; }
    toast(form.id ? "Registro actualizado" : "Registro guardado");
    setForm(null); cargar();
  };
  const eliminar = async () => {
    const { error } = await sb.from("gastos").delete().eq("id", confirmDel.id);
    if (error) toast("No se pudo eliminar: " + error.message, "error"); else { toast("Registro eliminado"); cargar(); }
    setConfirmDel(null);
  };

  const exportar = async () => {
    await asegurarXLSX();
    const filas = filtrados.map(g => ({ Fecha:g.fecha, Tipo:g.tipo, Categoría:g.categoria, Placa:g.placa||"", Descripción:g.descripcion||"", Proveedor:g.proveedor||"", Monto:parseFloat(g.monto)||0, IGV:parseFloat(g.igv)||0, "Método de pago":g.metodo_pago||"", Comprobante:`${g.comprobante_tipo||""} ${g.comprobante_numero||""}`.trim(), Km:g.km||"", Galones:g.galones||"", Origen:g.auto?"Factura (automático)":"Manual" }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filas), "Movimientos");
    if (porVehiculo.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(porVehiculo.map(v=>({ Placa:v.placa, Combustible:v.comb, Mantenimiento:v.mant, Otros:v.otros, Total:v.total, Galones:v.gal, "Km recorridos":v.rec, "Costo por km":v.ckm?+v.ckm.toFixed(2):"" }))), "Por vehículo");
    XLSX.writeFile(wb, `gastos_boaz_${desde}_a_${hasta}.xlsx`);
  };

  const Kpi = kpiMini;
  const TabBtn = ({ id, children }) => (
    <button onClick={()=>setTab(id)} style={TAB_SEG(tab===id)}>{children}</button>
  );
  const pgMov = usePaginacion(filtrados, 25, "movimientos");
  const esComb = form && form.tipo==="egreso" && form.categoria==="Combustible";
  const esMant = form && form.tipo==="egreso" && ["Mantenimiento","Reparación"].includes(form.categoria);
  const th = { textAlign:"left", padding:"10px 14px", fontSize:11, fontWeight:700, color:B.textSec, background:"#F6F9FC", letterSpacing:".3px", borderBottom:"1px solid #E3EAF2", whiteSpace:"nowrap" };
  const td = { padding:"12px 14px", fontSize:13, borderBottom:"1px solid #E3EAF2", color:B.textPri, verticalAlign:"top" };

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:10, marginBottom:16 }}>
        <div style={{ fontSize:13, color:B.textSec, maxWidth:620 }}>Combustible, mantenimiento, reparaciones y otros movimientos. Se suman solos los ingresos por facturas y los pagos ya realizados a repartidores, planilla y terceros.</div>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          <BtnSec onClick={exportar}><Ico n="download" size={15}/> Excel</BtnSec>
          <BtnSec onClick={()=>nuevo("ingreso")}><Ico n="plus" size={15}/> Ingreso</BtnSec>
          <BtnPri onClick={()=>nuevo("egreso")}><Ico n="plus" size={15} sw={2.4}/> Registrar gasto</BtnPri>
        </div>
      </div>

      {alertas.length>0 && (
        <div style={{ background:"#FFF7ED", border:"1px solid #FDBA74", borderRadius:12, padding:"10px 14px", marginBottom:14 }}>
          <div style={{ fontWeight:700, fontSize:13, color:"#9A3412", marginBottom:4, display:"flex", alignItems:"center", gap:7 }}><Ico n="wrench" size={15}/> Alertas de mantenimiento</div>
          {alertas.map((a,i)=><div key={i} style={{ fontSize:13, color:a.rojo?"#B91C1C":"#9A3412", paddingLeft:22 }}><b>{a.placa}</b>: {a.msg}</div>)}
        </div>
      )}

      <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginBottom:14, alignItems:"flex-end" }}>
        <div><label style={lbl}>Desde</label><input type="date" style={{...inp,width:150}} value={desde} onChange={e=>setDesde(e.target.value)}/></div>
        <div><label style={lbl}>Hasta</label><input type="date" style={{...inp,width:150}} value={hasta} onChange={e=>setHasta(e.target.value)}/></div>
        <div><label style={lbl}>Tipo</label>
          <select style={{...inp,width:130}} value={fTipo} onChange={e=>setFTipo(e.target.value)}><option value="todos">Todos</option><option value="egreso">Egresos</option><option value="ingreso">Ingresos</option></select></div>
        <div><label style={lbl}>Categoría</label>
          <select style={{...inp,width:180}} value={fCat} onChange={e=>setFCat(e.target.value)}><option value="">Todas</option>{[...CAT_EGRESO,...CAT_PERSONAL,...CAT_INGRESO,"Facturación"].map(c=><option key={c}>{c}</option>)}</select></div>
        <div><label style={lbl}>Vehículo</label>
          <select style={{...inp,width:130}} value={fPlaca} onChange={e=>setFPlaca(e.target.value)}><option value="">Todos</option>{placas.map(p=><option key={p}>{p}</option>)}</select></div>
        <div style={{ flex:"1 1 180px" }}><label style={lbl}>Buscar</label><input style={inp} placeholder="Proveedor, descripción…" value={busq} onChange={e=>setBusq(e.target.value)}/></div>
      </div>

      <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginBottom:16 }}>
        <Kpi i="trend" t="Ingresos" v={solN(ingresos)} c={B.green}/>
        <Kpi i="banknote" t="Egresos" v={solN(egresos)} c={B.red}/>
        <Kpi i="chart" t="Resultado" v={solN(ingresos-egresos)} c={ingresos-egresos>=0?B.green:B.red}/>
        <Kpi i="truck" t="Combustible" v={solN(combustible)}/>
        <Kpi i="wrench" t="Mantenimiento y reparaciones" v={solN(mant)}/>
      </div>

      <div style={{ ...TAB_CONT, marginBottom:12 }}>
        <TabBtn id="mov">Movimientos</TabBtn><TabBtn id="veh">Por vehículo</TabBtn><TabBtn id="cat">Por categoría</TabBtn>
      </div>

      <div style={{ ...CARD, overflow:"hidden" }}>
        {cargando ? <Cargando filas={5}/> :
        tab==="mov" ? (
          filtrados.length===0 ? <EstadoVacio icono="banknote" titulo="Sin movimientos en este período" texto="Cambia las fechas o los filtros, o registra un gasto."/> :
          <><div style={{ overflowX:"auto" }}><table style={{ width:"100%", borderCollapse:"collapse" }}>
            <thead><tr><th style={th}>Fecha</th><th style={th}>Categoría</th><th style={th}>Vehículo</th><th style={th}>Detalle</th><th style={{...th,textAlign:"right"}}>Monto</th><th style={th}></th></tr></thead>
            <tbody>{pgMov.visibles.map(g => (
              <tr key={g.id}>
                <td style={{...td,whiteSpace:"nowrap"}}>{fmt.fecha(g.fecha)}</td>
                <td style={td}><Etiqueta tono={g.tipo==="ingreso"?"ok":"neutro"}>{g.categoria}</Etiqueta></td>
                <td style={td}>{g.placa||"—"}</td>
                <td style={td}>{g.descripcion||"—"}{g.proveedor && <div style={{ fontSize:11, color:B.textSec }}>{g.proveedor}</div>}
                  {g.galones ? <div style={{ fontSize:11, color:B.textSec }}>{g.galones} gal{g.km?` · ${Number(g.km).toLocaleString()} km`:""}</div> : (g.km ? <div style={{ fontSize:11, color:B.textSec }}>{Number(g.km).toLocaleString()} km</div> : null)}
                  {g.comprobante_url && <a href={g.comprobante_url} target="_blank" rel="noreferrer" style={{ fontSize:12, color:B.blue, display:"block" }}>Ver comprobante</a>}</td>
                <td style={{...td,textAlign:"right",fontWeight:700,color:g.tipo==="ingreso"?"#047857":"#B91C1C",whiteSpace:"nowrap"}}>{g.tipo==="ingreso"?"+":"−"} {solN(parseFloat(g.monto))}</td>
                <td style={{...td,whiteSpace:"nowrap"}}>{g.auto ? <span style={{ fontSize:11, color:B.textMut }}>automático</span> : <>
                  <BtnIco n="edit" title="Editar" onClick={()=>editar(g)}/>
                  <BtnIco n="trash" title="Eliminar" color="#B91C1C" onClick={()=>setConfirmDel(g)}/></>}</td>
              </tr>))}</tbody>
          </table></div>{pgMov.pie}</>
        ) : tab==="veh" ? (
          porVehiculo.length===0 ? <EstadoVacio icono="truck" titulo="Aún no hay costos por vehículo" texto="Registra gastos indicando la placa para ver el costo de cada unidad."/> :
          <table style={{ width:"100%", borderCollapse:"collapse" }}>
            <thead><tr><th style={th}>Placa</th>{["Combustible","Mantenimiento","Otros","Total","Galones","Km recorr.","Costo/km"].map(h=><th key={h} style={{...th,textAlign:"right"}}>{h}</th>)}</tr></thead>
            <tbody>{porVehiculo.map(v=>(
              <tr key={v.placa}><td style={{...td,fontWeight:800}}>{v.placa}</td>
                <td style={{...td,textAlign:"right"}}>{solN(v.comb)}</td><td style={{...td,textAlign:"right"}}>{solN(v.mant)}</td><td style={{...td,textAlign:"right"}}>{solN(v.otros)}</td>
                <td style={{...td,textAlign:"right",fontWeight:800}}>{solN(v.total)}</td>
                <td style={{...td,textAlign:"right"}}>{v.gal?v.gal.toFixed(1):"—"}</td><td style={{...td,textAlign:"right"}}>{v.rec?v.rec.toLocaleString():"—"}</td>
                <td style={{...td,textAlign:"right"}}>{v.ckm?`S/ ${v.ckm.toFixed(2)}`:"—"}</td></tr>))}</tbody>
          </table>
        ) : (
          porCategoria.length===0 ? <EstadoVacio icono="chart" titulo="Sin egresos en el período"/> :
          <div style={{ padding:16 }}>{porCategoria.map(([c,v])=>(
            <div key={c} style={{ marginBottom:12 }}>
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, marginBottom:4 }}><span style={{ fontWeight:700 }}>{c}</span><span>{solN(v)} · {egresos?Math.round(v/egresos*100):0}%</span></div>
              <div style={{ background:B.bg, borderRadius:6, height:10 }}><div style={{ width:`${egresos?v/egresos*100:0}%`, height:10, borderRadius:6, background:B.gold }}/></div>
            </div>))}</div>
        )}
      </div>

      {form && (
        <div style={{ position:"fixed", inset:0, background:"#0008", zIndex:1500, display:"flex", alignItems:"center", justifyContent:"center", padding:12 }}>
          <div style={{ background:B.white, borderRadius:16, padding:24, width:560, maxWidth:"100%", maxHeight:"92vh", overflowY:"auto", boxShadow:"0 20px 60px #0003" }}>
            <div style={{ fontSize:17, fontWeight:800, color:B.navy, marginBottom:14 }}>{form.id?"Editar":"Nuevo"} {form.tipo==="ingreso"?"ingreso":"gasto"}</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
              <div><label style={lbl}>Fecha</label><input type="date" style={inp} value={form.fecha} onChange={e=>set("fecha",e.target.value)}/></div>
              <div><label style={lbl}>Categoría</label>
                <select style={inp} value={form.categoria} onChange={e=>set("categoria",e.target.value)}>{(form.tipo==="egreso"?CAT_EGRESO:CAT_INGRESO).map(c=><option key={c}>{c}</option>)}</select></div>
              <div><label style={lbl}>Vehículo (placa)</label>
                <input style={inp} list="placas-gastos" placeholder="Opcional" value={form.placa} onChange={e=>set("placa",e.target.value.toUpperCase())}/>
                <datalist id="placas-gastos">{placas.map(p=><option key={p} value={p}/>)}</datalist></div>
              <div><label style={lbl}>Monto total (S/)</label><input type="number" step="0.01" style={inp} value={form.monto} onChange={e=>set("monto",e.target.value)}/>
                <label style={{ fontSize:12, color:B.textSec, display:"flex", gap:6, alignItems:"center", marginTop:4 }}><input type="checkbox" checked={form.conIgv} onChange={e=>set("conIgv",e.target.checked)}/> Incluye IGV 18%{form.conIgv && parseFloat(form.monto)>0 ? ` (IGV ${solN(parseFloat(form.monto)-parseFloat(form.monto)/1.18)})` : ""}</label></div>
              <div style={{ gridColumn:"1/-1" }}><label style={lbl}>Descripción</label><input style={inp} value={form.descripcion} onChange={e=>set("descripcion",e.target.value)} placeholder="Ej. Cambio de aceite y filtros"/></div>
              <div><label style={lbl}>{form.tipo==="egreso"?"Proveedor / grifo / taller":"Origen / cliente"}</label><input style={inp} value={form.proveedor} onChange={e=>set("proveedor",e.target.value)}/></div>
              <div><label style={lbl}>Método de pago</label>
                <select style={inp} value={form.metodo_pago} onChange={e=>set("metodo_pago",e.target.value)}><option value="">—</option>{METODOS_PAGO.map(m=><option key={m}>{m}</option>)}</select></div>
              <div><label style={lbl}>Comprobante</label>
                <select style={inp} value={form.comprobante_tipo} onChange={e=>set("comprobante_tipo",e.target.value)}><option value="">Sin comprobante</option><option>Factura</option><option>Boleta</option><option>Ticket</option><option>Recibo</option></select></div>
              <div><label style={lbl}>N° comprobante</label><input style={inp} value={form.comprobante_numero} onChange={e=>set("comprobante_numero",e.target.value)}/></div>
              {(form.tipo==="egreso" && form.placa) && <div><label style={lbl}>Kilometraje (odómetro)</label><input type="number" style={inp} value={form.km} onChange={e=>set("km",e.target.value)}/></div>}
              {esComb && <div><label style={lbl}>Galones</label><input type="number" step="0.01" style={inp} value={form.galones} onChange={e=>set("galones",e.target.value)}/></div>}
              {esMant && <><div><label style={lbl}>Próx. mantenimiento (km)</label><input type="number" style={inp} value={form.proximo_mant_km} onChange={e=>set("proximo_mant_km",e.target.value)}/></div>
                <div><label style={lbl}>Próx. mantenimiento (fecha)</label><input type="date" style={inp} value={form.proximo_mant_fecha} onChange={e=>set("proximo_mant_fecha",e.target.value)}/></div></>}
              <div style={{ gridColumn:"1/-1" }}><label style={lbl}>Foto / PDF del comprobante</label>
                <input type="file" accept="image/*,application/pdf" onChange={e=>subirComprobante(e.target.files[0])} style={{ fontSize:12 }}/>
                {subiendo && <span style={{ fontSize:12, color:B.textSec }}> Subiendo…</span>}
                {form.comprobante_url && <div><a href={form.comprobante_url} target="_blank" rel="noreferrer" style={{ fontSize:12, color:B.blue }}>Ver comprobante adjunto</a></div>}</div>
              <div style={{ gridColumn:"1/-1" }}><label style={lbl}>Notas</label><textarea style={{...inp,minHeight:50}} value={form.notas} onChange={e=>set("notas",e.target.value)}/></div>
            </div>
            <div style={{ display:"flex", justifyContent:"flex-end", gap:10, marginTop:18 }}>
              <BtnSec onClick={()=>setForm(null)}>Cancelar</BtnSec>
              <BtnPri onClick={guardar} disabled={subiendo}>Guardar</BtnPri>
            </div>
          </div>
        </div>
      )}
      {confirmDel && <Confirm msg={`Se eliminará "${confirmDel.categoria}" por ${solN(parseFloat(confirmDel.monto))}. No se puede deshacer.`} onOk={eliminar} onCancel={()=>setConfirmDel(null)}/>}
    </div>
  );
}

export function Planilla({ toast, repartidores=[] }) {
  const [tab, setTab] = useState("planilla");
  const [personal, setPersonal] = useState([]);
  const [terceros, setTerceros] = useState([]);
  const [pagosPlanilla, setPagosPlanilla] = useState([]);
  const [pagosTerceros, setPagosTerceros] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [modalPersonal, setModalPersonal] = useState(false);
  const [editandoPersonal, setEditandoPersonal] = useState(null);
  const [modalTercero, setModalTercero] = useState(false);
  const [editandoTercero, setEditandoTercero] = useState(null);
  const [modalPago, setModalPago] = useState(null); // { tipo:'planilla'|'tercero', registro }

  const cargar = async () => {
    setCargando(true);
    const [p, t, pp, pt] = await Promise.all([
      sb.from("personal_planilla").select("*").order("nombres"),
      sb.from("terceros_planilla").select("*").order("nombre"),
      sb.from("pagos_planilla").select("*,personal_planilla(nombres,apellidos)").order("created_at",{ascending:false}),
      sb.from("pagos_terceros").select("*,terceros_planilla(nombre)").order("created_at",{ascending:false}),
    ]);
    if (p.data) setPersonal(p.data);
    if (t.data) setTerceros(t.data);
    if (pp.data) setPagosPlanilla(pp.data);
    if (pt.data) setPagosTerceros(pt.data);
    setCargando(false);
  };
  useEffect(() => { cargar(); }, []);

  const totalMensualPlanilla = personal.filter(p=>p.activo)
    .reduce((s,p)=>s + calcularNetoPlanilla(p.sueldo_bruto, p.sistema_pension, p.porcentaje_afp).neto, 0);
  const pendientesPlanilla = pagosPlanilla.filter(p=>p.estado==="pendiente").length;
  const pendientesTerceros = pagosTerceros.filter(p=>p.estado==="pendiente").length;

  if (cargando) return <Cargando filas={6}/>;

  return (
    <div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:14, marginBottom:20 }}>
        <Kpi icon="users" label="Personal en planilla (activos)" valor={personal.filter(p=>p.activo).length} color={B.navy}/>
        <Kpi icon="banknote" label="Neto mensual estimado (planilla activa)" valor={fmt.sol(totalMensualPlanilla)} color={B.gold}/>
        <Kpi icon="clock" label="Pagos pendientes" valor={pendientesPlanilla + pendientesTerceros} color={B.red} cv="#B91C1C"/>
      </div>

      <div style={{ ...TAB_CONT, marginBottom:16 }}>
        {[["planilla","Personal en Planilla"],["terceros","Terceros (Honorarios/Factura)"],["directorio","Directorio y duplicados"]].map(([id,label])=>(
          <button key={id} onClick={()=>setTab(id)}
            style={TAB_SEG(tab===id)}>
            {label}
          </button>
        ))}
      </div>

      {tab==="directorio" ? <DirectorioPersonas personal={personal} terceros={terceros} repartidores={repartidores}/> : tab==="planilla" ? (
        <>
          <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:12 }}>
            <BtnPri onClick={()=>{setEditandoPersonal(null); setModalPersonal(true);}}><Ico n="plus" size={15} sw={2.4}/> Nuevo trabajador</BtnPri>
          </div>
          <div style={{ background:B.white, border:`1px solid ${B.border}`, borderRadius:12, overflow:"hidden", marginBottom:20 }}>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead><tr style={{ background:"#F6F9FC" }}>
                {["Nombre","Cargo","Sueldo bruto","Pensión","Descuento","EsSalud (empresa)","Neto","Estado","Acciones"].map(h=>(
                  <th key={h} style={{ padding:"9px 12px", textAlign:"left", fontSize:11, color:B.textSec, fontWeight:700, letterSpacing:"0.3px", whiteSpace:"nowrap" }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {personal.map((p,i)=>{
                  const calc = calcularNetoPlanilla(p.sueldo_bruto, p.sistema_pension, p.porcentaje_afp);
                  return (
                    <tr key={p.id} style={{ borderTop:`1px solid ${B.border}`, background:B.white, opacity:p.activo?1:0.5 }}>
                      <td style={{ padding:"9px 12px", fontSize:12, fontWeight:700, color:B.navy }}>{p.nombres} {p.apellidos}</td>
                      <td style={{ padding:"9px 12px", fontSize:12, color:B.textSec }}>{p.cargo||"—"}</td>
                      <td style={{ padding:"9px 12px", fontSize:12, color:B.textPri }}>{fmt.sol(p.sueldo_bruto)}</td>
                      <td style={{ padding:"9px 12px", fontSize:11, color:B.textSec, textTransform:"uppercase" }}>
                        {p.sistema_pension==="afp" ? `AFP ${p.afp_nombre||""} (${calc.pctPension}%)` : `ONP (${PORCENTAJE_ONP}%)`}
                      </td>
                      <td style={{ padding:"9px 12px", fontSize:12, color:B.red }}>- {fmt.sol(calc.descuentoPension)}</td>
                      <td style={{ padding:"9px 12px", fontSize:11, color:B.textMut }}>{fmt.sol(calc.essalud)}</td>
                      <td style={{ padding:"9px 12px", fontSize:13, fontWeight:800, color:B.gold }}>{fmt.sol(calc.neto)}</td>
                      <td style={{ padding:"9px 12px" }}>
                        <span style={{ fontSize:10, padding:"3px 8px", borderRadius:10, fontWeight:700,
                          background:p.activo?"#ECFDF5":"#F3F4F6", color:p.activo?B.green:B.textMut }}>
                          {p.activo?"Activo":"Inactivo"}
                        </span>
                      </td>
                      <td style={{ padding:"9px 12px" }}>
                        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                          <button onClick={()=>setModalPago({ tipo:"planilla", registro:p })}
                            style={{ fontSize:11, color:B.green, background:"none", border:"none", cursor:"pointer", fontWeight:700 }}>Registrar pago</button>
                          <button onClick={()=>{setEditandoPersonal(p); setModalPersonal(true);}}
                            style={{ fontSize:11, color:B.blue, background:"none", border:"none", cursor:"pointer" }}><Ico n="edit" size={13} style={{ display:"inline-block", verticalAlign:"-2px", marginRight:5 }}/>Editar</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {personal.length===0 && <tr><td colSpan={9}><EstadoVacio icono="users" titulo="Aún no hay personal en planilla" texto="Aquí va el personal con contrato: el ERP calcula el descuento de pensión (ONP o AFP), el EsSalud que paga la empresa y el neto a pagar. Los repartidores que cobran por entrega no van aquí, sino en Liq. Repartidores."
                pasos={["Pulsa «Nuevo trabajador» y completa datos personales, laborales y bancarios.","Cada mes usa «Registrar pago»: el neto se calcula solo y pasa a Finanzas como egreso."]}/></td></tr>}
              </tbody>
            </table>
          </div>

          <div style={{ fontSize:13, fontWeight:700, color:B.navy, marginBottom:10 }}>Historial de pagos</div>
          <div style={{ background:B.white, border:`1px solid ${B.border}`, borderRadius:12, overflow:"hidden" }}>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead><tr style={{ background:"#F6F9FC" }}>
                {["Trabajador","Periodo","Neto pagado","Fecha de pago","Estado"].map(h=>(
                  <th key={h} style={{ padding:"9px 12px", textAlign:"left", fontSize:11, color:B.textSec, fontWeight:700, letterSpacing:"0.3px", whiteSpace:"nowrap" }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {pagosPlanilla.slice(0,20).map((pg,i)=>(
                  <tr key={pg.id} style={{ borderTop:`1px solid ${B.border}`, background:B.white }}>
                    <td style={{ padding:"9px 12px", fontSize:12, color:B.textPri }}>{pg.personal_planilla?.nombres} {pg.personal_planilla?.apellidos}</td>
                    <td style={{ padding:"9px 12px", fontSize:12, color:B.textSec }}>{pg.periodo}</td>
                    <td style={{ padding:"9px 12px", fontSize:12, fontWeight:700, color:B.gold }}>{fmt.sol(pg.neto_pagar)}</td>
                    <td style={{ padding:"9px 12px", fontSize:11, color:B.textMut }}>{pg.fecha_pago?fmt.fecha(pg.fecha_pago+"T00:00:00"):"—"}</td>
                    <td style={{ padding:"9px 12px" }}>
                      <span style={{ fontSize:10, padding:"3px 8px", borderRadius:10, fontWeight:700,
                        background:pg.estado==="pagado"?"#ECFDF5":"#FFFBEB", color:pg.estado==="pagado"?B.green:B.goldDk }}>
                        {pg.estado==="pagado"?"Pagado":"Pendiente"}
                      </span>
                    </td>
                  </tr>
                ))}
                {pagosPlanilla.length===0 && <tr><td colSpan={5} style={{ padding:20, textAlign:"center", color:B.textMut, fontSize:12.5 }}>Sin pagos registrados aún. Usa «Registrar pago» en la fila de cada trabajador.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <>
          <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:12 }}>
            <BtnPri onClick={()=>{setEditandoTercero(null); setModalTercero(true);}}><Ico n="plus" size={15} sw={2.4}/> Nuevo tercero</BtnPri>
          </div>
          <div style={{ background:B.white, border:`1px solid ${B.border}`, borderRadius:12, overflow:"hidden", marginBottom:20 }}>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead><tr style={{ background:"#F6F9FC" }}>
                {["Nombre","RUC/DNI","Tipo de documento","Servicio","Estado","Acciones"].map(h=>(
                  <th key={h} style={{ padding:"9px 12px", textAlign:"left", fontSize:11, color:B.textSec, fontWeight:700, letterSpacing:"0.3px", whiteSpace:"nowrap" }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {terceros.map((t,i)=>(
                  <tr key={t.id} style={{ borderTop:`1px solid ${B.border}`, background:B.white, opacity:t.activo?1:0.5 }}>
                    <td style={{ padding:"9px 12px", fontSize:12, fontWeight:700, color:B.navy }}>{t.nombre}</td>
                    <td style={{ padding:"9px 12px", fontSize:12, color:B.textSec }}>{t.ruc_dni||"—"}</td>
                    <td style={{ padding:"9px 12px", fontSize:11, color:B.textSec }}>
                      {t.tipo_documento==="factura"?"Factura":"Recibo por honorarios"}
                    </td>
                    <td style={{ padding:"9px 12px", fontSize:12, color:B.textPri }}>{t.servicio||"—"}</td>
                    <td style={{ padding:"9px 12px" }}>
                      <span style={{ fontSize:10, padding:"3px 8px", borderRadius:10, fontWeight:700,
                        background:t.activo?"#ECFDF5":"#F3F4F6", color:t.activo?B.green:B.textMut }}>
                        {t.activo?"Activo":"Inactivo"}
                      </span>
                    </td>
                    <td style={{ padding:"9px 12px" }}>
                      <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                        <button onClick={()=>setModalPago({ tipo:"tercero", registro:t })}
                          style={{ fontSize:11, color:B.green, background:"none", border:"none", cursor:"pointer", fontWeight:700 }}>Registrar pago</button>
                        <button onClick={()=>{setEditandoTercero(t); setModalTercero(true);}}
                          style={{ fontSize:11, color:B.blue, background:"none", border:"none", cursor:"pointer" }}><Ico n="edit" size={13} style={{ display:"inline-block", verticalAlign:"-2px", marginRight:5 }}/>Editar</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {terceros.length===0 && <tr><td colSpan={6}><EstadoVacio icono="user" titulo="Aún no hay terceros" texto="Terceros son quienes te emiten recibo por honorarios o factura: un contador, un mecánico, un chofer eventual. Se registra cada pago con su retención si aplica."
                pasos={["Pulsa «Nuevo tercero» con su RUC o DNI y el servicio que presta.","Registra cada pago con el número de recibo o factura; si supera el umbral, el ERP calcula la retención."]}/></td></tr>}
              </tbody>
            </table>
          </div>

          <div style={{ fontSize:13, fontWeight:700, color:B.navy, marginBottom:10 }}>Historial de pagos</div>
          <div style={{ background:B.white, border:`1px solid ${B.border}`, borderRadius:12, overflow:"hidden" }}>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead><tr style={{ background:"#F6F9FC" }}>
                {["Tercero","N° Documento","Bruto","Retención 8%","Neto pagado","Fecha","Estado"].map(h=>(
                  <th key={h} style={{ padding:"9px 12px", textAlign:"left", fontSize:11, color:B.textSec, fontWeight:700, letterSpacing:"0.3px", whiteSpace:"nowrap" }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {pagosTerceros.slice(0,20).map((pg,i)=>(
                  <tr key={pg.id} style={{ borderTop:`1px solid ${B.border}`, background:B.white }}>
                    <td style={{ padding:"9px 12px", fontSize:12, color:B.textPri }}>{pg.terceros_planilla?.nombre}</td>
                    <td style={{ padding:"9px 12px", fontSize:11, color:B.textSec }}>{pg.numero_documento||"—"}</td>
                    <td style={{ padding:"9px 12px", fontSize:12, color:B.textSec }}>{fmt.sol(pg.monto_bruto)}</td>
                    <td style={{ padding:"9px 12px", fontSize:11, color:pg.aplica_retencion?B.red:B.textMut }}>
                      {pg.aplica_retencion?`- ${fmt.sol(pg.monto_retencion)}`:"No aplica"}
                    </td>
                    <td style={{ padding:"9px 12px", fontSize:12, fontWeight:700, color:B.gold }}>{fmt.sol(pg.monto_neto)}</td>
                    <td style={{ padding:"9px 12px", fontSize:11, color:B.textMut }}>{pg.fecha_pago?fmt.fecha(pg.fecha_pago+"T00:00:00"):"—"}</td>
                    <td style={{ padding:"9px 12px" }}>
                      <span style={{ fontSize:10, padding:"3px 8px", borderRadius:10, fontWeight:700,
                        background:pg.estado==="pagado"?"#ECFDF5":"#FFFBEB", color:pg.estado==="pagado"?B.green:B.goldDk }}>
                        {pg.estado==="pagado"?"Pagado":"Pendiente"}
                      </span>
                    </td>
                  </tr>
                ))}
                {pagosTerceros.length===0 && <tr><td colSpan={7} style={{ padding:20, textAlign:"center", color:B.textMut, fontSize:12.5 }}>Sin pagos registrados aún. Usa «Registrar pago» en la fila de cada tercero.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}

      {modalPersonal && (
        <ModalPersonalPlanilla persona={editandoPersonal}
          onClose={()=>setModalPersonal(false)} onSaved={()=>{setModalPersonal(false); cargar();}} toast={toast}/>
      )}
      {modalTercero && (
        <ModalTerceroPlanilla tercero={editandoTercero}
          onClose={()=>setModalTercero(false)} onSaved={()=>{setModalTercero(false); cargar();}} toast={toast}/>
      )}
      {modalPago && (
        <ModalRegistrarPago tipo={modalPago.tipo} registro={modalPago.registro}
          onClose={()=>setModalPago(null)} onSaved={()=>{setModalPago(null); cargar();}} toast={toast}/>
      )}
    </div>
  );
}

export function ModalPersonalPlanilla({ persona, onClose, onSaved, toast }) {
  const [f, setF] = useState(persona || {
    nombres:"", apellidos:"", dni:"", cargo:"", fecha_ingreso:"", fecha_cese:"",
    sueldo_bruto:"", sistema_pension:"onp", afp_nombre:"", porcentaje_afp:"12.5",
    fecha_nacimiento:"", estado_civil:"", direccion:"", telefono:"", email:"", tipo_contrato:"",
    banco:"", numero_cuenta:"", cci:"",
    conyuge_nombres:"", conyuge_dni:"",
    contacto_emergencia_nombre:"", contacto_emergencia_telefono:"",
  });
  const [hijos, setHijos] = useState([]);
  const [cargandoHijos, setCargandoHijos] = useState(!!persona);
  const [guardando, setGuardando] = useState(false);
  const calc = calcularNetoPlanilla(f.sueldo_bruto, f.sistema_pension, f.porcentaje_afp);

  useEffect(() => {
    if (!persona) return;
    sb.from("hijos_planilla").select("*").eq("personal_id", persona.id).order("fecha_nacimiento")
      .then(({data}) => { if(data) setHijos(data); setCargandoHijos(false); });
  }, [persona]);

  const agregarHijo = () => setHijos(prev => [...prev, { _nuevo:true, nombres:"", fecha_nacimiento:"" }]);
  const actualizarHijo = (i, campo, valor) => setHijos(prev => prev.map((h,idx)=> idx===i ? {...h,[campo]:valor} : h));
  const quitarHijo = (i) => setHijos(prev => prev.filter((_,idx)=>idx!==i));

  const guardar = async () => {
    if (!f.nombres || !f.apellidos || !f.sueldo_bruto) { toast("Completa nombres, apellidos y sueldo","error"); return; }
    setGuardando(true);
    const payload = {
      nombres:f.nombres, apellidos:f.apellidos, dni:f.dni||null, cargo:f.cargo||null,
      fecha_ingreso:f.fecha_ingreso||null, fecha_cese:f.fecha_cese||null,
      sueldo_bruto:parseFloat(f.sueldo_bruto)||0, sistema_pension:f.sistema_pension,
      afp_nombre: f.sistema_pension==="afp" ? (f.afp_nombre||null) : null,
      porcentaje_afp: f.sistema_pension==="afp" ? (parseFloat(f.porcentaje_afp)||0) : null,
      fecha_nacimiento:f.fecha_nacimiento||null, estado_civil:f.estado_civil||null,
      direccion:f.direccion||null, telefono:f.telefono||null, email:f.email||null,
      tipo_contrato:f.tipo_contrato||null,
      banco:f.banco||null, numero_cuenta:f.numero_cuenta||null, cci:f.cci||null,
      conyuge_nombres:f.conyuge_nombres||null, conyuge_dni:f.conyuge_dni||null,
      contacto_emergencia_nombre:f.contacto_emergencia_nombre||null,
      contacto_emergencia_telefono:f.contacto_emergencia_telefono||null,
      activo: f.activo ?? true,
    };
    let error, personalId = persona?.id;
    if (persona) {
      ({ error } = await sb.from("personal_planilla").update(payload).eq("id", persona.id));
    } else {
      const resultado = await sb.from("personal_planilla").insert([payload]).select().single();
      error = resultado.error;
      personalId = resultado.data?.id;
    }
    if (error) { setGuardando(false); toast("Error: "+error.message,"error"); return; }

    // Guarda los hijos: nuevos se insertan, existentes se actualizan
    for (const h of hijos) {
      if (!h.nombres) continue;
      if (h._nuevo) {
        await sb.from("hijos_planilla").insert([{ personal_id: personalId, nombres:h.nombres, fecha_nacimiento:h.fecha_nacimiento||null }]);
      } else {
        await sb.from("hijos_planilla").update({ nombres:h.nombres, fecha_nacimiento:h.fecha_nacimiento||null }).eq("id", h.id);
      }
    }

    setGuardando(false);
    toast(persona?"Trabajador actualizado ✓":"Trabajador registrado ✓");
    onSaved();
  };

  const seccion = { fontSize:11, fontWeight:700, color:B.navy, textTransform:"uppercase",
    letterSpacing:"0.7px", margin:"18px 0 10px", paddingBottom:6, borderBottom:`1px solid ${B.border}` };

  return (
    <div style={{ position:"fixed", inset:0, background:"#0008", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ background:B.white, borderRadius:16, padding:28, width:620, maxHeight:"88vh", overflowY:"auto", boxShadow:"0 20px 60px #0003" }}>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
          <div style={{ fontSize:15, fontWeight:800, color:B.navy }}>{persona?"Editar trabajador":"Nuevo trabajador en planilla"}</div>
          <button onClick={onClose} style={{ background:"none", border:"none", fontSize:18, color:B.textSec, cursor:"pointer" }}>✕</button>
        </div>

        {/* Datos personales */}
        <div style={seccion}>Datos personales</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          <div><label style={lbl}>Nombres</label><input style={inp} value={f.nombres} onChange={e=>setF(p=>({...p,nombres:e.target.value}))}/></div>
          <div><label style={lbl}>Apellidos</label><input style={inp} value={f.apellidos} onChange={e=>setF(p=>({...p,apellidos:e.target.value}))}/></div>
          <div><label style={lbl}>DNI</label><input style={inp} value={f.dni||""} onChange={e=>setF(p=>({...p,dni:e.target.value}))}/></div>
          <div><label style={lbl}>Fecha de nacimiento</label><input type="date" style={inp} value={f.fecha_nacimiento||""} onChange={e=>setF(p=>({...p,fecha_nacimiento:e.target.value}))}/></div>
          <div><label style={lbl}>Estado civil</label>
            <select style={inp} value={f.estado_civil||""} onChange={e=>setF(p=>({...p,estado_civil:e.target.value}))}>
              <option value="">— Selecciona —</option>
              <option value="soltero">Soltero(a)</option>
              <option value="casado">Casado(a)</option>
              <option value="conviviente">Conviviente</option>
              <option value="divorciado">Divorciado(a)</option>
              <option value="viudo">Viudo(a)</option>
            </select>
          </div>
          <div><label style={lbl}>Teléfono</label><input style={inp} value={f.telefono||""} onChange={e=>setF(p=>({...p,telefono:e.target.value}))}/></div>
          <div style={{ gridColumn:"span 2" }}><label style={lbl}>Dirección</label><input style={inp} value={f.direccion||""} onChange={e=>setF(p=>({...p,direccion:e.target.value}))}/></div>
          <div style={{ gridColumn:"span 2" }}><label style={lbl}>Email</label><input style={inp} value={f.email||""} onChange={e=>setF(p=>({...p,email:e.target.value}))}/></div>
        </div>

        {/* Datos laborales */}
        <div style={seccion}>Datos laborales</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          <div><label style={lbl}>Cargo</label><input style={inp} value={f.cargo||""} onChange={e=>setF(p=>({...p,cargo:e.target.value}))}/></div>
          <div><label style={lbl}>Tipo de contrato</label>
            <select style={inp} value={f.tipo_contrato||""} onChange={e=>setF(p=>({...p,tipo_contrato:e.target.value}))}>
              <option value="">— Selecciona —</option>
              <option value="indeterminado">Plazo indeterminado</option>
              <option value="plazo_fijo">Plazo fijo</option>
              <option value="part_time">Part time</option>
              <option value="practicas">Prácticas</option>
            </select>
          </div>
          <div><label style={lbl}>Fecha de ingreso</label><input type="date" style={inp} value={f.fecha_ingreso||""} onChange={e=>setF(p=>({...p,fecha_ingreso:e.target.value}))}/></div>
          <div><label style={lbl}>Fecha de cese</label><input type="date" style={inp} value={f.fecha_cese||""} onChange={e=>setF(p=>({...p,fecha_cese:e.target.value}))}/></div>
          <div><label style={lbl}>Sueldo bruto (S/)</label><input type="number" style={inp} value={f.sueldo_bruto} onChange={e=>setF(p=>({...p,sueldo_bruto:e.target.value}))}/></div>
          <div><label style={lbl}>Sistema de pensión</label>
            <select style={inp} value={f.sistema_pension} onChange={e=>setF(p=>({...p,sistema_pension:e.target.value}))}>
              <option value="onp">ONP — 13% fijo</option>
              <option value="afp">AFP</option>
            </select>
          </div>
        </div>
        {f.sistema_pension==="afp" && (
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginTop:12 }}>
            <div><label style={lbl}>AFP</label>
              <select style={inp} value={f.afp_nombre||""} onChange={e=>setF(p=>({...p,afp_nombre:e.target.value}))}>
                <option value="">— Selecciona —</option>
                <option value="Integra">Integra</option>
                <option value="Prima">Prima</option>
                <option value="Profuturo">Profuturo</option>
                <option value="Habitat">Habitat</option>
              </select>
            </div>
            <div><label style={lbl}>% de aporte total</label>
              <input type="number" step="0.1" style={inp} value={f.porcentaje_afp} onChange={e=>setF(p=>({...p,porcentaje_afp:e.target.value}))}/>
            </div>
          </div>
        )}
        {f.sueldo_bruto && (
          <div style={{ background:B.bg, borderRadius:10, padding:14, marginTop:12, display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 }}>
            <div><div style={{ fontSize:10, color:B.textMut }}>DESCUENTO PENSIÓN</div>
              <div style={{ fontSize:14, fontWeight:700, color:B.red }}>- {fmt.sol(calc.descuentoPension)}</div></div>
            <div><div style={{ fontSize:10, color:B.textMut }}>ESSALUD (empresa)</div>
              <div style={{ fontSize:14, fontWeight:700, color:B.textMut }}>{fmt.sol(calc.essalud)}</div></div>
            <div><div style={{ fontSize:10, color:B.textMut }}>NETO A PAGAR</div>
              <div style={{ fontSize:16, fontWeight:800, color:B.gold }}>{fmt.sol(calc.neto)}</div></div>
          </div>
        )}

        {/* Datos bancarios */}
        <div style={seccion}>Datos bancarios</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          <div><label style={lbl}>Banco</label>
            <select style={inp} value={f.banco||""} onChange={e=>setF(p=>({...p,banco:e.target.value}))}>
              <option value="">— Selecciona —</option>
              <option value="BCP">BCP</option>
              <option value="BBVA">BBVA</option>
              <option value="Interbank">Interbank</option>
              <option value="Scotiabank">Scotiabank</option>
              <option value="Banco de la Nación">Banco de la Nación</option>
              <option value="Otro">Otro</option>
            </select>
          </div>
          <div><label style={lbl}>N° de cuenta</label><input style={inp} value={f.numero_cuenta||""} onChange={e=>setF(p=>({...p,numero_cuenta:e.target.value}))}/></div>
          <div style={{ gridColumn:"span 2" }}><label style={lbl}>CCI (para CTS)</label><input style={inp} value={f.cci||""} onChange={e=>setF(p=>({...p,cci:e.target.value}))}/></div>
        </div>

        {/* Cónyuge */}
        <div style={seccion}>Cónyuge (opcional)</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          <div><label style={lbl}>Nombres y apellidos</label><input style={inp} value={f.conyuge_nombres||""} onChange={e=>setF(p=>({...p,conyuge_nombres:e.target.value}))}/></div>
          <div><label style={lbl}>DNI</label><input style={inp} value={f.conyuge_dni||""} onChange={e=>setF(p=>({...p,conyuge_dni:e.target.value}))}/></div>
        </div>

        {/* Hijos */}
        <div style={{ ...seccion, display:"flex", justifyContent:"space-between", alignItems:"center", border:"none", paddingBottom:0 }}>
          <span>Hijos (para asignación familiar)</span>
          <button onClick={agregarHijo} style={{ fontSize:11, color:B.blue, background:"none", border:"none", cursor:"pointer", fontWeight:700, textTransform:"none", letterSpacing:0 }}>+ Agregar hijo</button>
        </div>
        {cargandoHijos ? (
          <Cargando filas={3}/>
        ) : (
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {hijos.map((h,i)=>(
              <div key={h.id||`nuevo-${i}`} style={{ display:"flex", gap:8, alignItems:"end" }}>
                <div style={{ flex:2 }}>
                  <label style={lbl}>Nombres</label>
                  <input style={inp} value={h.nombres} onChange={e=>actualizarHijo(i,"nombres",e.target.value)}/>
                </div>
                <div style={{ flex:1 }}>
                  <label style={lbl}>Fecha de nacimiento</label>
                  <input type="date" style={inp} value={h.fecha_nacimiento||""} onChange={e=>actualizarHijo(i,"fecha_nacimiento",e.target.value)}/>
                </div>
                <button onClick={()=>quitarHijo(i)} style={{ background:"none", border:"none", color:B.red, fontSize:16, cursor:"pointer", padding:"0 4px" }}>✕</button>
              </div>
            ))}
            {hijos.length===0 && <div style={{ fontSize:12, color:B.textMut }}>Sin hijos registrados</div>}
          </div>
        )}

        {/* Contacto de emergencia */}
        <div style={seccion}>Contacto de emergencia</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:16 }}>
          <div><label style={lbl}>Nombre</label><input style={inp} value={f.contacto_emergencia_nombre||""} onChange={e=>setF(p=>({...p,contacto_emergencia_nombre:e.target.value}))}/></div>
          <div><label style={lbl}>Teléfono</label><input style={inp} value={f.contacto_emergencia_telefono||""} onChange={e=>setF(p=>({...p,contacto_emergencia_telefono:e.target.value}))}/></div>
        </div>

        {persona && (
          <label style={{ display:"flex", alignItems:"center", gap:8, marginBottom:16, cursor:"pointer" }}>
            <input type="checkbox" checked={f.activo!==false} onChange={e=>setF(p=>({...p,activo:e.target.checked}))}/>
            <span style={{ fontSize:13 }}>Trabajador activo</span>
          </label>
        )}
        <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
          <BtnSec onClick={onClose}>Cancelar</BtnSec>
          <BtnPri onClick={guardar} disabled={guardando}>{guardando?"Guardando...":persona?"Guardar cambios":"Registrar"}</BtnPri>
        </div>
      </div>
    </div>
  );
}

export function ModalTerceroPlanilla({ tercero, onClose, onSaved, toast }) {
  const [f, setF] = useState(tercero || {
    nombre:"", tipo_documento:"recibo_honorarios", ruc_dni:"", servicio:"", activo:true,
    fecha_nacimiento:"", estado_civil:"", direccion:"", telefono:"", email:"",
    fecha_inicio_servicio:"", fecha_fin_servicio:"",
    banco:"", numero_cuenta:"", cci:"",
    conyuge_nombres:"", conyuge_dni:"",
    contacto_emergencia_nombre:"", contacto_emergencia_telefono:"",
  });
  const [hijos, setHijos] = useState([]);
  const [cargandoHijos, setCargandoHijos] = useState(!!tercero);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!tercero) return;
    sb.from("hijos_terceros").select("*").eq("tercero_id", tercero.id).order("fecha_nacimiento")
      .then(({data}) => { if(data) setHijos(data); setCargandoHijos(false); });
  }, [tercero]);

  const agregarHijo = () => setHijos(prev => [...prev, { _nuevo:true, nombres:"", fecha_nacimiento:"" }]);
  const actualizarHijo = (i, campo, valor) => setHijos(prev => prev.map((h,idx)=> idx===i ? {...h,[campo]:valor} : h));
  const quitarHijo = (i) => setHijos(prev => prev.filter((_,idx)=>idx!==i));

  const guardar = async () => {
    if (!f.nombre) { toast("Completa el nombre","error"); return; }
    setGuardando(true);
    const payload = {
      nombre:f.nombre, tipo_documento:f.tipo_documento, ruc_dni:f.ruc_dni||null, servicio:f.servicio||null,
      fecha_nacimiento:f.fecha_nacimiento||null, estado_civil:f.estado_civil||null,
      direccion:f.direccion||null, telefono:f.telefono||null, email:f.email||null,
      fecha_inicio_servicio:f.fecha_inicio_servicio||null, fecha_fin_servicio:f.fecha_fin_servicio||null,
      banco:f.banco||null, numero_cuenta:f.numero_cuenta||null, cci:f.cci||null,
      conyuge_nombres:f.conyuge_nombres||null, conyuge_dni:f.conyuge_dni||null,
      contacto_emergencia_nombre:f.contacto_emergencia_nombre||null,
      contacto_emergencia_telefono:f.contacto_emergencia_telefono||null,
      activo:f.activo??true,
    };
    let error, terceroId = tercero?.id;
    if (tercero) {
      ({ error } = await sb.from("terceros_planilla").update(payload).eq("id", tercero.id));
    } else {
      const resultado = await sb.from("terceros_planilla").insert([payload]).select().single();
      error = resultado.error;
      terceroId = resultado.data?.id;
    }
    if (error) { setGuardando(false); toast("Error: "+error.message,"error"); return; }

    for (const h of hijos) {
      if (!h.nombres) continue;
      if (h._nuevo) {
        await sb.from("hijos_terceros").insert([{ tercero_id: terceroId, nombres:h.nombres, fecha_nacimiento:h.fecha_nacimiento||null }]);
      } else {
        await sb.from("hijos_terceros").update({ nombres:h.nombres, fecha_nacimiento:h.fecha_nacimiento||null }).eq("id", h.id);
      }
    }

    setGuardando(false);
    toast(tercero?"Tercero actualizado ✓":"Tercero registrado ✓");
    onSaved();
  };

  const seccion = { fontSize:11, fontWeight:700, color:B.navy, textTransform:"uppercase",
    letterSpacing:"0.7px", margin:"18px 0 10px", paddingBottom:6, borderBottom:`1px solid ${B.border}` };

  return (
    <div style={{ position:"fixed", inset:0, background:"#0008", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ background:B.white, borderRadius:16, padding:28, width:620, maxHeight:"88vh", overflowY:"auto", boxShadow:"0 20px 60px #0003" }}>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
          <div style={{ fontSize:15, fontWeight:800, color:B.navy }}>{tercero?"Editar tercero":"Nuevo tercero"}</div>
          <button onClick={onClose} style={{ background:"none", border:"none", fontSize:18, color:B.textSec, cursor:"pointer" }}>✕</button>
        </div>

        {/* Datos personales */}
        <div style={seccion}>Datos personales</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          <div style={{ gridColumn:"span 2" }}><label style={lbl}>Nombre / Razón social</label>
            <input style={inp} value={f.nombre} onChange={e=>setF(p=>({...p,nombre:e.target.value}))}/></div>
          <div><label style={lbl}>RUC / DNI</label><input style={inp} value={f.ruc_dni||""} onChange={e=>setF(p=>({...p,ruc_dni:e.target.value}))}/></div>
          <div><label style={lbl}>Fecha de nacimiento</label><input type="date" style={inp} value={f.fecha_nacimiento||""} onChange={e=>setF(p=>({...p,fecha_nacimiento:e.target.value}))}/></div>
          <div><label style={lbl}>Estado civil</label>
            <select style={inp} value={f.estado_civil||""} onChange={e=>setF(p=>({...p,estado_civil:e.target.value}))}>
              <option value="">— Selecciona —</option>
              <option value="soltero">Soltero(a)</option>
              <option value="casado">Casado(a)</option>
              <option value="conviviente">Conviviente</option>
              <option value="divorciado">Divorciado(a)</option>
              <option value="viudo">Viudo(a)</option>
            </select>
          </div>
          <div><label style={lbl}>Teléfono</label><input style={inp} value={f.telefono||""} onChange={e=>setF(p=>({...p,telefono:e.target.value}))}/></div>
          <div style={{ gridColumn:"span 2" }}><label style={lbl}>Dirección</label><input style={inp} value={f.direccion||""} onChange={e=>setF(p=>({...p,direccion:e.target.value}))}/></div>
          <div style={{ gridColumn:"span 2" }}><label style={lbl}>Email</label><input style={inp} value={f.email||""} onChange={e=>setF(p=>({...p,email:e.target.value}))}/></div>
        </div>

        {/* Datos del servicio */}
        <div style={seccion}>Datos del servicio</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          <div><label style={lbl}>Tipo de documento que emite</label>
            <select style={inp} value={f.tipo_documento} onChange={e=>setF(p=>({...p,tipo_documento:e.target.value}))}>
              <option value="recibo_honorarios">Recibo por honorarios</option>
              <option value="factura">Factura</option>
            </select>
          </div>
          <div><label style={lbl}>Servicio que presta</label><input style={inp} value={f.servicio||""} onChange={e=>setF(p=>({...p,servicio:e.target.value}))}/></div>
          <div><label style={lbl}>Inicio del servicio</label><input type="date" style={inp} value={f.fecha_inicio_servicio||""} onChange={e=>setF(p=>({...p,fecha_inicio_servicio:e.target.value}))}/></div>
          <div><label style={lbl}>Fin del servicio</label><input type="date" style={inp} value={f.fecha_fin_servicio||""} onChange={e=>setF(p=>({...p,fecha_fin_servicio:e.target.value}))}/></div>
        </div>

        {/* Datos bancarios */}
        <div style={seccion}>Datos bancarios</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          <div><label style={lbl}>Banco</label>
            <select style={inp} value={f.banco||""} onChange={e=>setF(p=>({...p,banco:e.target.value}))}>
              <option value="">— Selecciona —</option>
              <option value="BCP">BCP</option>
              <option value="BBVA">BBVA</option>
              <option value="Interbank">Interbank</option>
              <option value="Scotiabank">Scotiabank</option>
              <option value="Banco de la Nación">Banco de la Nación</option>
              <option value="Otro">Otro</option>
            </select>
          </div>
          <div><label style={lbl}>N° de cuenta</label><input style={inp} value={f.numero_cuenta||""} onChange={e=>setF(p=>({...p,numero_cuenta:e.target.value}))}/></div>
          <div style={{ gridColumn:"span 2" }}><label style={lbl}>CCI</label><input style={inp} value={f.cci||""} onChange={e=>setF(p=>({...p,cci:e.target.value}))}/></div>
        </div>

        {/* Cónyuge */}
        <div style={seccion}>Cónyuge (opcional)</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          <div><label style={lbl}>Nombres y apellidos</label><input style={inp} value={f.conyuge_nombres||""} onChange={e=>setF(p=>({...p,conyuge_nombres:e.target.value}))}/></div>
          <div><label style={lbl}>DNI</label><input style={inp} value={f.conyuge_dni||""} onChange={e=>setF(p=>({...p,conyuge_dni:e.target.value}))}/></div>
        </div>

        {/* Hijos */}
        <div style={{ ...seccion, display:"flex", justifyContent:"space-between", alignItems:"center", border:"none", paddingBottom:0 }}>
          <span>Hijos</span>
          <button onClick={agregarHijo} style={{ fontSize:11, color:B.blue, background:"none", border:"none", cursor:"pointer", fontWeight:700, textTransform:"none", letterSpacing:0 }}>+ Agregar hijo</button>
        </div>
        {cargandoHijos ? (
          <Cargando filas={3}/>
        ) : (
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {hijos.map((h,i)=>(
              <div key={h.id||`nuevo-${i}`} style={{ display:"flex", gap:8, alignItems:"end" }}>
                <div style={{ flex:2 }}>
                  <label style={lbl}>Nombres</label>
                  <input style={inp} value={h.nombres} onChange={e=>actualizarHijo(i,"nombres",e.target.value)}/>
                </div>
                <div style={{ flex:1 }}>
                  <label style={lbl}>Fecha de nacimiento</label>
                  <input type="date" style={inp} value={h.fecha_nacimiento||""} onChange={e=>actualizarHijo(i,"fecha_nacimiento",e.target.value)}/>
                </div>
                <button onClick={()=>quitarHijo(i)} style={{ background:"none", border:"none", color:B.red, fontSize:16, cursor:"pointer", padding:"0 4px" }}>✕</button>
              </div>
            ))}
            {hijos.length===0 && <div style={{ fontSize:12, color:B.textMut }}>Sin hijos registrados</div>}
          </div>
        )}

        {/* Contacto de emergencia */}
        <div style={seccion}>Contacto de emergencia</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:16 }}>
          <div><label style={lbl}>Nombre</label><input style={inp} value={f.contacto_emergencia_nombre||""} onChange={e=>setF(p=>({...p,contacto_emergencia_nombre:e.target.value}))}/></div>
          <div><label style={lbl}>Teléfono</label><input style={inp} value={f.contacto_emergencia_telefono||""} onChange={e=>setF(p=>({...p,contacto_emergencia_telefono:e.target.value}))}/></div>
        </div>

        {tercero && (
          <label style={{ display:"flex", alignItems:"center", gap:8, marginBottom:16, cursor:"pointer" }}>
            <input type="checkbox" checked={f.activo!==false} onChange={e=>setF(p=>({...p,activo:e.target.checked}))}/>
            <span style={{ fontSize:13 }}>Tercero activo</span>
          </label>
        )}
        <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
          <BtnSec onClick={onClose}>Cancelar</BtnSec>
          <BtnPri onClick={guardar} disabled={guardando}>{guardando?"Guardando...":tercero?"Guardar cambios":"Registrar"}</BtnPri>
        </div>
      </div>
    </div>
  );
}

export function ModalRegistrarPago({ tipo, registro, onClose, onSaved, toast }) {
  const hoy = diaLocal();
  const esPlanilla = tipo==="planilla";
  const [periodo, setPeriodo] = useState(hoy.slice(0,7));
  const [montoBruto, setMontoBruto] = useState(esPlanilla ? String(registro.sueldo_bruto||"") : "");
  const [aplicaRetencion, setAplicaRetencion] = useState(!esPlanilla && (parseFloat(registro.monto_bruto)||0) >= UMBRAL_RETENCION_HONORARIOS);
  const [numeroDocumento, setNumeroDocumento] = useState("");
  const [fechaPago, setFechaPago] = useState(hoy);
  const [guardando, setGuardando] = useState(false);

  const bruto = parseFloat(montoBruto)||0;
  const calcPlanilla = esPlanilla ? calcularNetoPlanilla(bruto, registro.sistema_pension, registro.porcentaje_afp) : null;
  const retencion = !esPlanilla && aplicaRetencion ? bruto*0.08 : 0;
  const netoTercero = bruto - retencion;

  const guardar = async () => {
    if (!bruto) { toast("Ingresa el monto","error"); return; }
    setGuardando(true);
    let error;
    if (esPlanilla) {
      ({ error } = await sb.from("pagos_planilla").insert([{
        personal_id: registro.id, periodo, sueldo_bruto: bruto,
        descuento_pension: calcPlanilla.descuentoPension, monto_essalud: calcPlanilla.essalud,
        neto_pagar: calcPlanilla.neto, fecha_pago: fechaPago, estado:"pagado",
      }]));
    } else {
      ({ error } = await sb.from("pagos_terceros").insert([{
        tercero_id: registro.id, descripcion: registro.servicio||null, monto_bruto: bruto,
        aplica_retencion: aplicaRetencion, monto_retencion: retencion, monto_neto: netoTercero,
        numero_documento: numeroDocumento||null, fecha_pago: fechaPago, estado:"pagado",
      }]));
    }
    setGuardando(false);
    if (error) { toast("Error: "+error.message,"error"); return; }
    toast("Pago registrado ✓");
    onSaved();
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"#0008", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ background:B.white, borderRadius:16, padding:28, width:480, boxShadow:"0 20px 60px #0003" }}>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
          <div style={{ fontSize:15, fontWeight:800, color:B.navy }}>Registrar pago</div>
          <button onClick={onClose} style={{ background:"none", border:"none", fontSize:18, color:B.textSec, cursor:"pointer" }}>✕</button>
        </div>
        <div style={{ fontSize:13, color:B.textSec, marginBottom:16 }}>
          {esPlanilla ? `${registro.nombres} ${registro.apellidos}` : registro.nombre}
        </div>

        {esPlanilla ? (
          <div style={{ marginBottom:12 }}>
            <label style={lbl}>Periodo (mes)</label>
            <input type="month" style={inp} value={periodo} onChange={e=>setPeriodo(e.target.value)}/>
          </div>
        ) : (
          <div style={{ marginBottom:12 }}>
            <label style={lbl}>N° de documento (recibo/factura)</label>
            <input style={inp} value={numeroDocumento} onChange={e=>setNumeroDocumento(e.target.value)} placeholder="Ej. E001-123"/>
          </div>
        )}

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
          <div><label style={lbl}>Monto bruto (S/)</label>
            <input type="number" style={inp} value={montoBruto} onChange={e=>setMontoBruto(e.target.value)}/></div>
          <div><label style={lbl}>Fecha de pago</label>
            <input type="date" style={inp} value={fechaPago} onChange={e=>setFechaPago(e.target.value)}/></div>
        </div>

        {!esPlanilla && (
          <label style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12, cursor:"pointer" }}>
            <input type="checkbox" checked={aplicaRetencion} onChange={e=>setAplicaRetencion(e.target.checked)}/>
            <span style={{ fontSize:12, color:B.textSec }}>Aplica retención de renta 8% (recibo por honorarios ≥ S/ {UMBRAL_RETENCION_HONORARIOS} — confirma si corresponde)</span>
          </label>
        )}

        {bruto>0 && (
          <div style={{ background:B.bg, borderRadius:10, padding:14, marginBottom:16 }}>
            {esPlanilla ? (
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 }}>
                <div><div style={{ fontSize:10, color:B.textMut }}>DESC. PENSIÓN</div>
                  <div style={{ fontSize:14, fontWeight:700, color:B.red }}>- {fmt.sol(calcPlanilla.descuentoPension)}</div></div>
                <div><div style={{ fontSize:10, color:B.textMut }}>ESSALUD (empresa)</div>
                  <div style={{ fontSize:14, fontWeight:700, color:B.textMut }}>{fmt.sol(calcPlanilla.essalud)}</div></div>
                <div><div style={{ fontSize:10, color:B.textMut }}>NETO A PAGAR</div>
                  <div style={{ fontSize:16, fontWeight:800, color:B.gold }}>{fmt.sol(calcPlanilla.neto)}</div></div>
              </div>
            ) : (
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                <div><div style={{ fontSize:10, color:B.textMut }}>RETENCIÓN 8%</div>
                  <div style={{ fontSize:14, fontWeight:700, color:B.red }}>{aplicaRetencion?`- ${fmt.sol(retencion)}`:"No aplica"}</div></div>
                <div><div style={{ fontSize:10, color:B.textMut }}>NETO A PAGAR</div>
                  <div style={{ fontSize:16, fontWeight:800, color:B.gold }}>{fmt.sol(netoTercero)}</div></div>
              </div>
            )}
          </div>
        )}

        <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
          <BtnSec onClick={onClose}>Cancelar</BtnSec>
          <BtnPri onClick={guardar} disabled={guardando}>{guardando?"Guardando...":"Confirmar pago"}</BtnPri>
        </div>
      </div>
    </div>
  );
}

