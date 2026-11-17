// BOAZ ERP — módulo "pedidos" (parte de BoazERP; ver src/BoazERP.jsx)
import { useState, useEffect, useCallback, useRef, useMemo, Fragment } from "react";
import { alfa, Ayuda, B, BADGE_SERVICIO, BtnIco, BtnPri, BtnSec, Buscador, CARD, Chip, Confirm, ESTADOS_PEDIDO, EstadoVacio, ICONOS_HIST, Ico, TD, TDN, TDS, Tabs, Th, XLSX, agruparHistorial, asegurarXLSX, calcularTarifaPedido, diaLocal, esperar, fmt, geocodificarDireccion, getTarifaSameDay, inp, lbl, sb, usePaginacion } from "./base.jsx";
import { bandaDePeso } from "./ventas.jsx";

// ══════════════════════════════════════════════════════════════
// MÓDULO 2: PEDIDOS COMPLETO
// ══════════════════════════════════════════════════════════════
export function Pedidos({ pedidos, repartidores, empresas, tarifariosCliente, tarifarioEstandar, onRefresh, toast }) {
  // En celular la lista se muestra como tarjetas y la barra de herramientas se compacta
  const [movil, setMovil] = useState(() => typeof window!=="undefined" && window.innerWidth<=760);
  useEffect(() => { const f = () => setMovil(window.innerWidth<=760); window.addEventListener("resize", f); return () => window.removeEventListener("resize", f); }, []);
  const [verMas, setVerMas] = useState(false);
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [busqueda, setBusqueda] = useState("");
  const [modalNuevo, setModalNuevo] = useState(false);
  const [modalCarga, setModalCarga] = useState(false);
  const [modalGeocodificar, setModalGeocodificar] = useState(false);
  const [modalDetalle, setModalDetalle] = useState(null);
  const [asignando, setAsignando] = useState(null);
  const [ordenCol, setOrdenCol] = useState(null);
  const [ordenDir, setOrdenDir] = useState("asc");

  const ordenarPor = (col) => {
    if (ordenCol === col) {
      setOrdenDir(d => d==="asc" ? "desc" : "asc");
    } else {
      setOrdenCol(col);
      setOrdenDir("asc");
    }
  };

  const VALOR_COL = {
    tracking: p => p.omd || "",
    orden_cliente: p => p.cliente_referencia || "",
    cliente: p => nomEmp[p.empresa_id] || "",
    destinatario: p => p.dest_nombre || "",
    direccion: p => p.dest_direccion || "",
    peso: p => parseFloat(p.peso_kg) || 0,
    tamano: p => bandaDePeso(p.peso_kg),
    servicio: p => p.tipo_servicio || "",
    ambito: p => p.ambito || "",
    repartidor: p => { const r = repartidores.find(r=>r.id===p.repartidor_id); return r ? `${r.nombres} ${r.apellidos}` : ""; },
    estado: p => p.estado || "",
    fecha: p => p.created_at || "",
  };

  // Filtros avanzados
  const [verFiltros, setVerFiltros] = useState(false);
  const [fEmp, setFEmp] = useState(""); const [fRep, setFRep] = useState("");
  const [fDesde, setFDesde] = useState(""); const [fHasta, setFHasta] = useState("");
  const [fSinTar, setFSinTar] = useState(false);
  const nFiltros = [fEmp,fRep,fDesde,fHasta,fSinTar].filter(Boolean).length;
  const limpiarFiltros = () => { setFEmp(""); setFRep(""); setFDesde(""); setFHasta(""); setFSinTar(false); };
  // Columnas visibles (se recuerda en este navegador)
  const COLS_PED = [["tracking","Tracking",true],["orden_cliente","N° orden"],["cliente","Cliente"],["destinatario","Destinatario",true],["direccion","Dirección"],["peso","Peso"],["tamano","Tamaño"],["servicio","Servicio"],["ambito","Ámbito"],["repartidor","Repartidor"],["estado","Estado",true],["fecha","Fecha"]];
  const [ocultas, setOcultas] = useState(() => { try { const v = JSON.parse(localStorage.getItem("boaz_ped_cols")); return Array.isArray(v) ? v : ["tamano","ambito"]; } catch { return ["tamano","ambito"]; } });
  const [verCols, setVerCols] = useState(false);
  const toggleCol = (id) => setOcultas(prev => { const n = prev.includes(id) ? prev.filter(x=>x!==id) : [...prev, id]; try { localStorage.setItem("boaz_ped_cols", JSON.stringify(n)); } catch {} return n; });
  // Selección múltiple
  const [sel, setSel] = useState(() => new Set());
  const [confirmar, setConfirmar] = useState(null);
  const [modalEtiq, setModalEtiq] = useState(false);
  const nomEmp = useMemo(() => { const m = {}; for (const e of empresas||[]) m[e.id] = e.nombre; return m; }, [empresas]);

  const filtrados = pedidos.filter(p => {
    if (fEmp && p.empresa_id!==fEmp) return false;
    if (fSinTar && (parseFloat(p.tarifa_s)||0) > 0) return false;
    if (fRep && (fRep==="_sin" ? !!p.repartidor_id : p.repartidor_id!==fRep)) return false;
    if ((fDesde||fHasta) && p.created_at) { const d = diaLocal(new Date(p.created_at)); if ((fDesde && d<fDesde) || (fHasta && d>fHasta)) return false; }
    const okE = filtroEstado==="todos" || p.estado===filtroEstado;
    const okB = !busqueda ||
      p.omd?.toLowerCase().includes(busqueda.toLowerCase()) ||
      p.cliente_referencia?.toLowerCase().includes(busqueda.toLowerCase()) ||
      p.dest_nombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
      p.dest_distrito?.toLowerCase().includes(busqueda.toLowerCase()) ||
      p.dest_telefono?.includes(busqueda);
    return okE && okB;
  }).sort((a,b) => {
    if (!ordenCol) return 0;
    const va = VALOR_COL[ordenCol](a), vb = VALOR_COL[ordenCol](b);
    const cmp = typeof va === "number" ? va-vb : String(va).localeCompare(String(vb));
    return ordenDir==="asc" ? cmp : -cmp;
  });

  const pg = usePaginacion(filtrados, 25, "pedidos");
  const { conteo, sinGeo, sinTarifa } = useMemo(() => {
    const c = {}; let g = 0, t = 0;
    for (const p of pedidos) { c[p.estado] = (c[p.estado]||0)+1; if (!p.dest_lat) g++; if (!((parseFloat(p.tarifa_s)||0) > 0)) t++; }
    return { conteo:c, sinGeo:g, sinTarifa:t };
  }, [pedidos]);

  const selFilas = filtrados.filter(p => sel.has(p.id));
  const toggleSel = (id) => setSel(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const pagSel = pg.visibles.length>0 && pg.visibles.every(p => sel.has(p.id));
  const togglePag = () => setSel(prev => { const n = new Set(prev); pg.visibles.forEach(p => pagSel ? n.delete(p.id) : n.add(p.id)); return n; });
  const masivoEstado = (estado) => {
    const ids = selFilas.map(p=>p.id); if (!ids.length) return;
    setConfirmar({ msg:`Se cambiará el estado de ${ids.length} pedido${ids.length===1?"":"s"} a «${ESTADOS_PEDIDO[estado].label}».`, ok: async () => {
      const extra = estado==="entregado" ? { fecha_entrega:new Date().toISOString() } : estado==="en_ruta" ? { fecha_asignacion:new Date().toISOString() } : {};
      const { error } = await sb.from("pedidos").update({ estado, ...extra }).in("id", ids);
      setConfirmar(null);
      if (error) { toast("Error: "+error.message,"error"); return; }
      toast(`${ids.length} pedido${ids.length===1?"":"s"} actualizado${ids.length===1?"":"s"} ✓`); setSel(new Set()); onRefresh();
    }});
  };
  const masivoRep = (repId) => {
    const r = repartidores.find(x=>x.id===repId); if (!r || !selFilas.length) return;
    const nuevos = selFilas.filter(p=>p.estado==="sin_asignar").map(p=>p.id), otros = selFilas.filter(p=>p.estado!=="sin_asignar").map(p=>p.id);
    setConfirmar({ msg:`Se asignará a ${r.nombres} ${r.apellidos} ${selFilas.length} pedido${selFilas.length===1?"":"s"}.`, ok: async () => {
      let error = null;
      if (nuevos.length) ({ error } = await sb.from("pedidos").update({ repartidor_id:repId, estado:"asignado", fecha_asignacion:new Date().toISOString() }).in("id", nuevos));
      if (!error && otros.length) ({ error } = await sb.from("pedidos").update({ repartidor_id:repId }).in("id", otros));
      setConfirmar(null);
      if (error) { toast("Error: "+error.message,"error"); return; }
      toast(`${selFilas.length} pedido${selFilas.length===1?"":"s"} asignado${selFilas.length===1?"":"s"} ✓`); setSel(new Set()); onRefresh();
    }});
  };
  const masivoTarifa = () => {
    if (!selFilas.length) return;
    setConfirmar({ msg:`Se recalculará la tarifa de ${selFilas.length} pedido${selFilas.length===1?"":"s"} con el tarifario vigente de su cliente. Los pedidos que ya están en una factura no deberían recalcularse.`, ok: async () => {
      const grupos = {};
      for (const p of selFilas) {
        const c = calcularTarifaPedido({ empresa:(empresas||[]).find(e=>e.id===p.empresa_id)||null, ambito:p.ambito, tipoServicio:p.tipo_servicio, pesoKg:parseFloat(p.peso_kg), distrito:p.dest_distrito, embalaje:!!p.con_embalaje }, tarifariosCliente, tarifarioEstandar);
        (grupos[c.tarifa] || (grupos[c.tarifa] = [])).push(p.id);
      }
      let error = null;
      for (const t in grupos) { if (error) break; ({ error } = await sb.from("pedidos").update({ tarifa_s: parseFloat(t) }).in("id", grupos[t])); }
      setConfirmar(null);
      if (error) { toast("Error: "+error.message,"error"); return; }
      toast(`Tarifa recalculada en ${selFilas.length} pedido${selFilas.length===1?"":"s"} ✓`); setSel(new Set()); onRefresh();
    }});
  };
  const exportarPedidos = async (filas) => {
    try {
      await asegurarXLSX();
      const nomRep = (id) => { const r = repartidores.find(x=>x.id===id); return r ? `${r.nombres} ${r.apellidos}` : ""; };
      const datos = filas.map(p => ({ Tracking:p.omd, "N° orden":p.cliente_referencia||"", Cliente:nomEmp[p.empresa_id]||"", Destinatario:p.dest_nombre||"", Teléfono:p.dest_telefono||"",
        Dirección:p.dest_direccion||"", Distrito:p.dest_distrito||"", "Peso (kg)":parseFloat(p.peso_kg)||"", Servicio:(BADGE_SERVICIO[p.tipo_servicio]||{}).label||"", Ámbito:(p.ambito||"").replace("_"," "),
        Repartidor:nomRep(p.repartidor_id), Estado:(ESTADOS_PEDIDO[p.estado]||{}).label||p.estado, "Tarifa (S/)":parseFloat(p.tarifa_s)||0, "Cobro en destino (S/)":p.cobro_destino ? (parseFloat(p.monto_cobrar)||0) : "",
        "Fecha de registro":p.created_at ? diaLocal(new Date(p.created_at)) : "", "Fecha de entrega":p.fecha_entrega ? diaLocal(new Date(p.fecha_entrega)) : "" }));
      const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(datos), "Pedidos");
      XLSX.writeFile(wb, `pedidos_boaz_${diaLocal()}.xlsx`);
      toast(`${datos.length} pedido${datos.length===1?"":"s"} exportado${datos.length===1?"":"s"} ✓`);
    } catch (e) { toast("No se pudo exportar: "+(e.message||e), "error"); }
  };

  const cambiarEstado = async (id, nuevoEstado) => {
    const extra = nuevoEstado==="entregado" ? {fecha_entrega:new Date().toISOString()} :
                  nuevoEstado==="en_ruta"   ? {fecha_asignacion:new Date().toISOString()} : {};
    const { error } = await sb.from("pedidos").update({estado:nuevoEstado,...extra}).eq("id",id);
    if (error) { toast("Error: "+error.message,"error"); return; }
    toast("Estado actualizado ✓");
    onRefresh();
  };

  const asignarRep = async (pedidoId, repId, estadoActual) => {
    const payload = { repartidor_id: repId };
    // Si el pedido todavía no tenía repartidor, pasa a "asignado" y registra la fecha.
    // Si ya estaba en ruta/entregado/etc., solo se cambia el conductor sin tocar el estado.
    if (estadoActual === "sin_asignar") {
      payload.estado = "asignado";
      payload.fecha_asignacion = new Date().toISOString();
    }
    const { error } = await sb.from("pedidos").update(payload).eq("id", pedidoId);
    if (error) { toast("Error: "+error.message,"error"); return; }
    toast(estadoActual==="sin_asignar" ? "Repartidor asignado ✓" : "Repartidor cambiado ✓");
    setAsignando(null); onRefresh();
  };

  return (
    <div>
      {/* Barra de herramientas */}
      <div style={{ display:"flex", gap:10, marginBottom:12, flexWrap:"wrap", alignItems:"center" }}>
        <div style={{ flex: movil ? "1 1 100%" : "0 1 380px", minWidth:0 }}><Buscador value={busqueda} onChange={setBusqueda} placeholder={movil ? "Buscar tracking, nombre, teléfono…" : "Buscar por tracking, N° de orden, nombre, teléfono o distrito"} width="100%"/></div>
        <BtnSec onClick={()=>setVerFiltros(v=>!v)} style={verFiltros||nFiltros ? { borderColor:B.gold, color:B.goldDk } : {}}>
          <Ico n="filter" size={15}/> Filtros{nFiltros>0 && <span style={{ background:B.gold, color:"#fff", fontSize:11, fontWeight:700, padding:"0 6px", borderRadius:10 }}>{nFiltros}</span>}
        </BtnSec>
        {movil ? (
          <div style={{ display:"flex", gap:8, marginLeft:"auto", position:"relative" }}>
            <BtnSec onClick={()=>setVerMas(v=>!v)} style={{ padding:"8px 11px" }} aria-label="Más acciones"><Ico n="menu" size={16}/> Más</BtnSec>
            {verMas && (<>
              <div onClick={()=>setVerMas(false)} style={{ position:"fixed", top:0, left:0, right:0, bottom:0, zIndex:50 }}/>
              <div style={{ ...CARD, position:"absolute", right:0, top:"calc(100% + 6px)", zIndex:51, padding:6, width:230, boxShadow:"0 12px 32px #0D1E3D26" }}>
                {[
                  ...(sinGeo>0 ? [["pin", `Geocodificar (${sinGeo})`, ()=>setModalGeocodificar(true)]] : []),
                  ["upload", "Carga masiva", ()=>setModalCarga(true)],
                  ["download", "Exportar a Excel", ()=>exportarPedidos(filtrados)],
                ].map(([ic,l,fn]) => (
                  <button key={l} onClick={()=>{ setVerMas(false); fn(); }} style={{ width:"100%", display:"flex", alignItems:"center", gap:10, padding:"11px 10px", background:"none", border:"none", borderRadius:8, cursor:"pointer", fontSize:14, color:B.textPri, textAlign:"left" }}>
                    <Ico n={ic} size={17} color={B.textSec}/>{l}</button>))}
              </div></>)}
            <BtnPri onClick={()=>setModalNuevo(true)} style={{ padding:"9px 13px" }}><Ico n="plus" size={16} sw={2.4}/> Nuevo</BtnPri>
          </div>
        ) : (
        <div style={{ marginLeft:"auto", display:"flex", gap:8, flexWrap:"wrap" }}>
          {sinGeo > 0 && (
            <BtnSec onClick={()=>setModalGeocodificar(true)}><Ico n="pin" size={15}/> Geocodificar ({sinGeo})<Ayuda k="geocodificar" size={13}/></BtnSec>
          )}
          <div style={{ position:"relative" }}>
            <BtnSec onClick={()=>setVerCols(v=>!v)}><Ico n="columns" size={15}/> Columnas</BtnSec>
            {verCols && (<>
              <div onClick={()=>setVerCols(false)} style={{ position:"fixed", top:0, left:0, right:0, bottom:0, zIndex:50 }}/>
              <div style={{ ...CARD, position:"absolute", right:0, top:"calc(100% + 6px)", zIndex:51, padding:10, width:200, boxShadow:"0 12px 32px #0D1E3D26" }}>
                <div style={{ fontSize:11, fontWeight:700, color:B.textMut, padding:"2px 6px 6px" }}>COLUMNAS VISIBLES</div>
                {COLS_PED.map(([id,l,fija]) => (
                  <label key={id} style={{ display:"flex", alignItems:"center", gap:8, padding:"5px 6px", fontSize:13, color:fija?B.textMut:B.textPri, cursor:fija?"default":"pointer", borderRadius:6 }}>
                    <input type="checkbox" checked={!ocultas.includes(id)} disabled={!!fija} onChange={()=>toggleCol(id)}/>{l}
                  </label>))}
              </div></>)}
          </div>
          <BtnSec onClick={()=>exportarPedidos(filtrados)}><Ico n="download" size={15}/> Exportar</BtnSec>
          <BtnSec onClick={()=>setModalCarga(true)}><Ico n="upload" size={15}/> Carga masiva</BtnSec>
          <BtnPri onClick={()=>setModalNuevo(true)}><Ico n="plus" size={15} sw={2.4}/> Nuevo pedido</BtnPri>
        </div>
        )}
      </div>
      {verFiltros && (
        <div style={{ ...CARD, padding:14, marginBottom:12, display:"flex", gap:12, flexWrap:"wrap", alignItems:"flex-end" }}>
          <div style={{ flex:"1 1 200px", minWidth:0 }}><label style={lbl}>Cliente</label>
            <select style={{ ...inp, background:B.white }} value={fEmp} onChange={e=>setFEmp(e.target.value)}><option value="">Todos</option>{(empresas||[]).map(e=><option key={e.id} value={e.id}>{e.nombre}</option>)}</select></div>
          <div style={{ flex:"1 1 200px", minWidth:0 }}><label style={lbl}>Repartidor</label>
            <select style={{ ...inp, background:B.white }} value={fRep} onChange={e=>setFRep(e.target.value)}><option value="">Todos</option><option value="_sin">Sin repartidor</option>{repartidores.map(r=><option key={r.id} value={r.id}>{r.nombres} {r.apellidos}</option>)}</select></div>
          <div><label style={lbl}>Registrado desde</label><input type="date" style={{ ...inp, background:B.white, width:160 }} value={fDesde} onChange={e=>setFDesde(e.target.value)}/></div>
          <div><label style={lbl}>Hasta</label><input type="date" style={{ ...inp, background:B.white, width:160 }} value={fHasta} onChange={e=>setFHasta(e.target.value)}/></div>
          <label style={{ display:"flex", alignItems:"center", gap:7, fontSize:13, color:B.textPri, cursor:"pointer", paddingBottom:9 }}>
            <input type="checkbox" checked={fSinTar} onChange={e=>setFSinTar(e.target.checked)} style={{ width:16, height:16 }}/> Solo sin tarifa{sinTarifa>0 && <span style={{ color:"var(--bzt-B45309, #B45309)", fontWeight:700 }}>({sinTarifa})</span>}
          </label>
          {nFiltros>0 && <BtnSec onClick={limpiarFiltros}>Limpiar</BtnSec>}
        </div>
      )}
      <Tabs valor={filtroEstado} onChange={setFiltroEstado} style={{ marginBottom:12 }}
        tabs={[{ id:"todos", l:"Todos", n:pedidos.length }, ...Object.keys(ESTADOS_PEDIDO).map(e=>({ id:e, l:ESTADOS_PEDIDO[e].label, n:conteo[e]||0 }))]}/>

      {/* Acciones masivas */}
      {selFilas.length>0 && movil && (
        <div style={{ position:"fixed", left:8, right:8, bottom:8, zIndex:60, background:B.navyFijo, color:"#fff", borderRadius:14, padding:"10px 12px", boxShadow:"0 10px 30px #0D1E3D66" }}>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
            <span style={{ fontSize:14, fontWeight:700 }}>{selFilas.length} seleccionado{selFilas.length===1?"":"s"}</span>
            {selFilas.length<filtrados.length && <button onClick={()=>setSel(new Set(filtrados.map(p=>p.id)))} style={{ background:"none", border:"none", color:B.goldLt, fontSize:13, fontWeight:600, cursor:"pointer", padding:0 }}>Todos ({filtrados.length})</button>}
            <button onClick={()=>setSel(new Set())} aria-label="Quitar selección" style={{ marginLeft:"auto", background:"none", border:"none", color:"#B9C6D6", cursor:"pointer", display:"inline-flex", padding:4 }}><Ico n="x" size={20}/></button>
          </div>
          <div style={{ display:"flex", gap:8 }}>
            <select value="" onChange={e=>e.target.value && masivoRep(e.target.value)} aria-label="Asignar repartidor a los seleccionados" style={{ ...inp, flex:1, minWidth:0, background:B.white, padding:"9px 8px", fontSize:13 }}>
              <option value="">Repartidor…</option>{repartidores.filter(r=>r.activo).map(r=><option key={r.id} value={r.id}>{r.nombres} {r.apellidos}</option>)}</select>
            <select value="" onChange={e=>e.target.value && masivoEstado(e.target.value)} aria-label="Cambiar estado de los seleccionados" style={{ ...inp, flex:1, minWidth:0, background:B.white, padding:"9px 8px", fontSize:13 }}>
              <option value="">Estado…</option>{Object.entries(ESTADOS_PEDIDO).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select>
          </div>
          <div style={{ display:"flex", gap:8, marginTop:8 }}>
            {[["dollar","Tarifa",masivoTarifa],["printer","Etiquetas",()=>setModalEtiq(true)],["download","Excel",()=>exportarPedidos(selFilas)]].map(([ic,l,fn]) => (
              <button key={l} onClick={fn} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:3, padding:"7px 4px", background:"#FFFFFF14", border:"1px solid #FFFFFF26", borderRadius:9, color:"#fff", fontSize:12, fontWeight:600, cursor:"pointer" }}>
                <Ico n={ic} size={17}/>{l}</button>))}
          </div>
        </div>
      )}
      {selFilas.length>0 && !movil && (
        <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap", background:B.navyFijo, color:"#fff", borderRadius:12, padding:"10px 14px", marginBottom:12,
          ...(movil ? { position:"fixed", left:10, right:10, bottom:10, zIndex:60, marginBottom:0, boxShadow:"0 10px 30px #0D1E3D66" } : {}) }}>
          <span style={{ fontSize:13, fontWeight:700 }}>{selFilas.length} seleccionado{selFilas.length===1?"":"s"}</span>
          {selFilas.length<filtrados.length && <button onClick={()=>setSel(new Set(filtrados.map(p=>p.id)))} style={{ background:"none", border:"none", color:B.goldLt, fontSize:12, fontWeight:600, cursor:"pointer", textDecoration:"underline" }}>Seleccionar los {filtrados.length} de esta vista</button>}
          <div style={{ marginLeft:"auto", display:"flex", gap:8, flexWrap:"wrap", alignItems:"center", ...(movil ? { width:"100%", marginLeft:0 } : {}) }}>
            <select value="" onChange={e=>e.target.value && masivoRep(e.target.value)} aria-label="Asignar repartidor a los seleccionados" style={{ ...inp, width:"auto", background:B.white, padding:"7px 10px" }}>
              <option value="">Asignar repartidor…</option>{repartidores.filter(r=>r.activo).map(r=><option key={r.id} value={r.id}>{r.nombres} {r.apellidos}</option>)}</select>
            <select value="" onChange={e=>e.target.value && masivoEstado(e.target.value)} aria-label="Cambiar estado de los seleccionados" style={{ ...inp, width:"auto", background:B.white, padding:"7px 10px" }}>
              <option value="">Cambiar estado…</option>{Object.entries(ESTADOS_PEDIDO).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select>
            <BtnSec onClick={masivoTarifa}><Ico n="dollar" size={15}/> Recalcular tarifa</BtnSec>
            <BtnSec onClick={()=>setModalEtiq(true)}><Ico n="printer" size={15}/> Etiquetas</BtnSec>
            <BtnSec onClick={()=>exportarPedidos(selFilas)}><Ico n="download" size={15}/> Exportar</BtnSec>
            <button onClick={()=>setSel(new Set())} title="Quitar selección" aria-label="Quitar selección" style={{ background:"none", border:"none", color:"#B9C6D6", cursor:"pointer", display:"inline-flex", padding:4 }}><Ico n="x" size={18}/></button>
          </div>
        </div>
      )}

      {/* Celular: tarjetas */}
      {movil && (
        <div style={{ paddingBottom: selFilas.length>0 ? 170 : 0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
            <label style={{ display:"flex", alignItems:"center", gap:7, fontSize:13, color:B.textSec }}>
              <input type="checkbox" checked={pagSel} onChange={togglePag} style={{ width:18, height:18 }} aria-label="Seleccionar los pedidos de esta página"/> Todos
            </label>
            <select value={`${ordenCol||"fecha"}:${ordenCol?ordenDir:"desc"}`} aria-label="Ordenar pedidos"
              onChange={e=>{ const [c,d] = e.target.value.split(":"); setOrdenCol(c); setOrdenDir(d); }}
              style={{ ...inp, width:"auto", marginLeft:"auto", background:B.white, padding:"7px 10px", fontSize:13 }}>
              <option value="fecha:desc">Más recientes</option><option value="fecha:asc">Más antiguos</option>
              <option value="estado:asc">Por estado</option><option value="destinatario:asc">Destinatario A-Z</option>
              <option value="repartidor:asc">Por repartidor</option><option value="direccion:asc">Por dirección</option>
            </select>
          </div>
          {filtrados.length===0 ? (
            <div style={CARD}><EstadoVacio icono="package" titulo={pedidos.length===0 ? "Aún no hay pedidos" : "Ningún pedido coincide"}
              texto={pedidos.length===0 ? "Registra el primero con «Nuevo» o súbelos desde un Excel en «Más»." : "Prueba con otro estado o cambia el texto de búsqueda."}>
              {pedidos.length>0 && (busqueda || filtroEstado!=="todos" || nFiltros>0) && <BtnSec onClick={()=>{ setBusqueda(""); setFiltroEstado("todos"); limpiarFiltros(); }}>Quitar filtros</BtnSec>}
            </EstadoVacio></div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {pg.visibles.map(p => {
                const rep = repartidores.find(r=>r.id===p.repartidor_id);
                const est = ESTADOS_PEDIDO[p.estado] || { bg:"var(--bzf-F1F5F9, #F1F5F9)", color:"var(--bzt-475569, #475569)", label:p.estado };
                const marcado = sel.has(p.id);
                const sinTar = !((parseFloat(p.tarifa_s)||0) > 0);
                return (
                  <div key={p.id} onClick={()=>setModalDetalle(p)}
                    style={{ ...CARD, padding:"12px 14px", cursor:"pointer", borderLeft:`4px solid ${est.color}`, background: marcado ? "var(--bzf-FFF7ED, #FFF7ED)" : B.white }}>
                    <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                      <span onClick={e=>e.stopPropagation()} style={{ display:"flex" }}>
                        <input type="checkbox" checked={marcado} onChange={()=>toggleSel(p.id)} style={{ width:18, height:18 }} aria-label={`Seleccionar ${p.omd}`}/>
                      </span>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:14, fontWeight:800, color:B.navy }}>{p.omd}</div>
                        {(p.cliente_referencia || nomEmp[p.empresa_id]) && <div style={{ fontSize:12, color:B.textMut, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                          {[nomEmp[p.empresa_id], p.cliente_referencia && `Orden ${p.cliente_referencia}`].filter(Boolean).join(" · ")}</div>}
                      </div>
                      <span style={{ fontSize:11.5, fontWeight:700, padding:"4px 10px", borderRadius:20, background:est.bg, color:est.color, whiteSpace:"nowrap" }}>{est.label}</span>
                    </div>
                    <div style={{ marginTop:10, paddingLeft:28 }}>
                      <div style={{ fontSize:14, fontWeight:600, color:B.textPri }}>{p.dest_nombre||"—"}</div>
                      {(p.dest_direccion || p.dest_distrito) && <div style={{ display:"flex", gap:6, marginTop:3, fontSize:13, color:B.textSec }}>
                        <Ico n="pin" size={14} color={B.textMut} style={{ marginTop:2 }}/>
                        <span>{p.dest_direccion}{p.dest_distrito ? <span style={{ color:B.textMut }}>{p.dest_direccion ? " · " : ""}{p.dest_distrito}</span> : null}</span>
                      </div>}
                      <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginTop:8 }}>
                        {p.tipo_servicio && BADGE_SERVICIO[p.tipo_servicio] && <span style={{ fontSize:11, fontWeight:700, padding:"2px 8px", borderRadius:6, background:BADGE_SERVICIO[p.tipo_servicio].bg, color:BADGE_SERVICIO[p.tipo_servicio].color }}>{BADGE_SERVICIO[p.tipo_servicio].label}</span>}
                        {p.peso_kg ? <span style={{ fontSize:11, fontWeight:700, padding:"2px 8px", borderRadius:6, background:"var(--bzf-F0F4F8, #F0F4F8)", color:B.navy }}>{bandaDePeso(p.peso_kg)} · {p.peso_kg} kg</span> : null}
                        {p.cobro_destino && <span style={{ fontSize:11, fontWeight:700, padding:"2px 8px", borderRadius:6, background:"var(--bzf-FFF7ED, #FFF7ED)", color:"var(--bzt-B45309, #B45309)" }}>COD {fmt.sol(p.monto_cobrar)}</span>}
                        {sinTar && <span style={{ fontSize:11, fontWeight:700, padding:"2px 8px", borderRadius:6, background:"var(--bzf-FEF2F2, #FEF2F2)", color:"var(--bzt-B91C1C, #B91C1C)" }}>Sin tarifa</span>}
                      </div>
                    </div>
                    <div onClick={e=>e.stopPropagation()} style={{ display:"flex", alignItems:"center", gap:8, marginTop:10, paddingTop:10, paddingLeft:28, borderTop:`1px solid ${B.border}` }}>
                      <select value={p.repartidor_id||""} aria-label={`Repartidor de ${p.omd}`}
                        onChange={e=>{ if (e.target.value) asignarRep(p.id, e.target.value, p.estado); }}
                        style={{ ...inp, flex:1, minWidth:0, padding:"7px 8px", fontSize:13, background: rep ? B.white : `${B.gold}12`, border:`1px ${rep?"solid":"dashed"} ${rep?B.border:B.gold+"88"}`, color: rep ? B.textPri : B.goldDk, fontWeight: rep ? 500 : 700 }}>
                        <option value="" disabled={!!rep}>{rep ? "Elegir repartidor" : "+ Asignar repartidor"}</option>
                        {repartidores.filter(r=>r.activo || r.id===p.repartidor_id).map(r=><option key={r.id} value={r.id}>{r.nombres} {r.apellidos}</option>)}
                      </select>
                      <select value={p.estado} onChange={e=>cambiarEstado(p.id,e.target.value)} aria-label={`Estado de ${p.omd}`}
                        style={{ ...inp, width:"auto", padding:"7px 8px", fontSize:12.5, fontWeight:700, background:est.bg, color:est.color, border:`1px solid ${alfa(est.color,"33")}` }}>
                        {Object.entries(ESTADOS_PEDIDO).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                      </select>
                    </div>
                    <div style={{ display:"flex", justifyContent:"space-between", marginTop:8, paddingLeft:28, fontSize:12, color:B.textMut }}>
                      <span>{fmt.fecha(p.created_at)}</span>
                      <span style={{ fontWeight:700, color: sinTar ? "var(--bzt-B91C1C, #B91C1C)" : B.textSec }}>{sinTar ? "—" : fmt.sol(p.tarifa_s)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {filtrados.length>0 && <div style={{ ...CARD, marginTop:10, overflow:"hidden" }}>{pg.pie}</div>}
        </div>
      )}

      {/* Escritorio: tabla */}
      {!movil && <div style={{ ...CARD, overflow:"hidden" }}>
        <style>{ocultas.map(c => { const i = COLS_PED.findIndex(x=>x[0]===c)+2; return i>1 ? `.bz-ped th:nth-child(${i}),.bz-ped tbody tr:not(.bz-vacio) td:nth-child(${i}){display:none}` : ""; }).join("")}</style>
        <div style={{ overflowX:"auto" }}>
        <table className="bz-tabla bz-ped" style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead>
            <tr>
              <Th style={{ width:36, paddingRight:0 }}><input type="checkbox" checked={pagSel} onChange={togglePag} aria-label="Seleccionar los pedidos de esta página"/></Th>
              {[
                ["Tracking","tracking",null,"tracking"],["N° orden","orden_cliente",null,"orden"],["Cliente","cliente"],["Destinatario","destinatario"],["Dirección","direccion"],
                ["Peso","peso","right"],["Tamaño","tamano",null,"tamano"],["Servicio","servicio",null,"servicio"],["Ámbito","ambito",null,"ambito"],["Repartidor","repartidor"],
                ["Estado","estado"],["Fecha","fecha"],["",null],
              ].map(([h,col,al,ay],k)=>(
                <Th key={k} col={col} align={al||"left"} orden={{ col:ordenCol, dir:ordenDir }} onOrden={ordenarPor} ayuda={ay}>{h}</Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pg.visibles.map((p) => {
              const rep = repartidores.find(r=>r.id===p.repartidor_id);
              const est = ESTADOS_PEDIDO[p.estado] || { bg:"var(--bzf-F1F5F9, #F1F5F9)", color:"var(--bzt-475569, #475569)" };
              return (
                <tr key={p.id} style={{ cursor:"pointer" }} className={sel.has(p.id)?"bz-fila-sel":undefined}
                  onClick={()=>setModalDetalle(p)}>
                  <td style={{ ...TD, paddingRight:0, width:36 }} onClick={e=>e.stopPropagation()}><input type="checkbox" checked={sel.has(p.id)} onChange={()=>toggleSel(p.id)} aria-label={`Seleccionar ${p.omd}`}/></td>
                  <td style={{ ...TD, fontWeight:700, color:B.navy, whiteSpace:"nowrap" }}>{p.omd}</td>
                  <td style={{ ...TDS, whiteSpace:"nowrap" }}>{p.cliente_referencia||"—"}</td>
                  <td style={TDS}><div title={nomEmp[p.empresa_id]||""} style={{ maxWidth:160, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{nomEmp[p.empresa_id]||"—"}</div></td>
                  <td style={TD}>
                    <div style={{ fontWeight:600 }}>{p.dest_nombre}</div>
                    {p.dest_telefono && <div style={{ fontSize:12, color:B.textMut }}>{p.dest_telefono}</div>}
                  </td>
                  <td style={TD}>
                    <div title={p.dest_direccion||""} style={{ color:B.textSec, maxWidth:240, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{p.dest_direccion||"—"}</div>
                    {p.dest_distrito && <div style={{ fontSize:12, color:B.textMut }}>{p.dest_distrito}</div>}
                  </td>
                  <td style={{ ...TDN, color:B.textSec }}>{p.peso_kg?p.peso_kg+" kg":"—"}</td>
                  <td style={TD}>
                    <span style={{ fontSize:11, fontWeight:700, padding:"3px 8px", borderRadius:6,
                      background:"var(--bzf-F0F4F8, #F0F4F8)", color:B.navy }}>
                      {bandaDePeso(p.peso_kg)}
                    </span>
                  </td>
                  <td style={TD}>
                    {p.tipo_servicio && BADGE_SERVICIO[p.tipo_servicio] ? (
                      <span style={{ fontSize:11, fontWeight:700, padding:"3px 8px", borderRadius:6, whiteSpace:"nowrap",
                        background: BADGE_SERVICIO[p.tipo_servicio].bg,
                        color: BADGE_SERVICIO[p.tipo_servicio].color }}>
                        {BADGE_SERVICIO[p.tipo_servicio].label}
                      </span>
                    ) : <span style={{ fontSize:11, color:B.textMut }}>—</span>}
                  </td>
                  <td style={{ ...TDS, textTransform:"capitalize", whiteSpace:"nowrap" }}>{p.ambito?.replace("_"," ")||"—"}</td>
                  <td style={{ ...TD, whiteSpace:"nowrap" }} onClick={e=>e.stopPropagation()}>
                    {asignando===p.id ? (
                      <select autoFocus defaultValue={p.repartidor_id||""}
                        onChange={e=>{if(e.target.value)asignarRep(p.id,e.target.value,p.estado); else setAsignando(null);}}
                        onBlur={()=>setAsignando(null)}
                        style={{ ...inp, padding:"5px 8px", fontSize:12, width:"auto" }}>
                        <option value="">Sin asignar</option>
                        {repartidores.filter(r=>r.activo).map(r=>(
                          <option key={r.id} value={r.id}>{r.nombres} {r.apellidos}</option>
                        ))}
                      </select>
                    ) : rep ? (
                      <button onClick={()=>setAsignando(p.id)}
                        title="Clic para cambiar de repartidor"
                        style={{ fontSize:13, color:B.textPri, background:"none", border:"none",
                          cursor:"pointer", padding:0, textDecoration:"underline",
                          textDecorationStyle:"dotted", textDecorationColor:B.textMut, textUnderlineOffset:3 }}>
                        {rep.nombres} {rep.apellidos}
                      </button>
                    ) : (
                      <button onClick={()=>setAsignando(p.id)}
                        style={{ display:"inline-flex", alignItems:"center", gap:4, fontSize:12, color:B.goldDk, background:`${B.gold}12`, border:`1px dashed ${B.gold}88`,
                          borderRadius:6, padding:"3px 9px", cursor:"pointer", fontWeight:700 }}><Ico n="plus" size={12} sw={2.6}/> Asignar</button>
                    )}
                  </td>
                  <td style={TD} onClick={e=>e.stopPropagation()}>
                    <select value={p.estado} onChange={e=>cambiarEstado(p.id,e.target.value)} aria-label="Estado del pedido"
                      style={{ ...inp, padding:"4px 8px", fontSize:11, fontWeight:700, width:"auto",
                        cursor:"pointer", borderRadius:20, background:est.bg, color:est.color, border:`1px solid ${alfa(est.color,"33")}` }}>
                      {Object.entries(ESTADOS_PEDIDO).map(([k,v])=>(
                        <option key={k} value={k}>{v.label}</option>
                      ))}
                    </select>
                  </td>
                  <td style={{ ...TDS, whiteSpace:"nowrap" }}>{fmt.fecha(p.created_at)}</td>
                  <td style={{ ...TD, padding:"6px 10px" }} onClick={e=>e.stopPropagation()}>
                    <BtnIco n="eye" title="Ver detalle" onClick={()=>setModalDetalle(p)}/>
                  </td>
                </tr>
              );
            })}
            {filtrados.length===0&&<tr className="bz-vacio"><td colSpan={14}>
              <EstadoVacio icono="package" titulo={pedidos.length===0 ? "Aún no hay pedidos" : "Ningún pedido coincide"}
                texto={pedidos.length===0 ? "Registra el primero o súbelos en bloque desde un Excel." : "Prueba con otro estado o cambia el texto de búsqueda."}>
                {pedidos.length>0 && (busqueda || filtroEstado!=="todos" || nFiltros>0) && <BtnSec onClick={()=>{ setBusqueda(""); setFiltroEstado("todos"); limpiarFiltros(); }}>Quitar filtros</BtnSec>}
              </EstadoVacio></td></tr>}
          </tbody>
        </table>
        </div>
        {pg.pie}
      </div>}

      {modalNuevo && <ModalNuevoPedido repartidores={repartidores} empresas={empresas} tarifariosCliente={tarifariosCliente} tarifarioEstandar={tarifarioEstandar}
        onClose={()=>setModalNuevo(false)} onSaved={()=>{setModalNuevo(false);onRefresh();}} toast={toast}/>}
      {modalCarga && <ModalCargaMasiva repartidores={repartidores} empresas={empresas} tarifariosCliente={tarifariosCliente} tarifarioEstandar={tarifarioEstandar}
        onClose={()=>setModalCarga(false)} onSaved={()=>{onRefresh();}} toast={toast}/>}
      {modalGeocodificar && <ModalGeocodificarPendientes pedidos={pedidos}
        onClose={()=>setModalGeocodificar(false)} onDone={onRefresh} toast={toast}/>}
      {modalDetalle && <ModalDetallePedido pedido={modalDetalle} repartidores={repartidores}
        onClose={()=>setModalDetalle(null)} onRefresh={onRefresh} toast={toast}/>}
      {modalEtiq && <ModalEtiquetas pedidos={selFilas} empresas={empresas} onClose={()=>setModalEtiq(false)}/>}
      {confirmar && <Confirm msg={confirmar.msg} onOk={confirmar.ok} onCancel={()=>setConfirmar(null)}/>}
    </div>
  );
}

// Modal nuevo pedido
export function ModalNuevoPedido({ repartidores, empresas, tarifariosCliente, tarifarioEstandar, onClose, onSaved, toast }) {
  const getTarifa = getTarifaSameDay;
  const [f, setF] = useState({
    dest_nombre:"", dest_telefono:"", dest_direccion:"", dest_distrito:"",
    dest_referencia:"", peso_kg:"", ambito:"urbano", empresa_id:"",
    repartidor_id:"", cobro_destino:false, monto_cobrar:"", tipo_servicio:"same_day",
    descripcion:"", fecha_programada: diaLocal(),
  });
  const [embalaje, setEmbalaje] = useState(false);
  const empSel = empresas.find(e=>e.id===f.empresa_id) || null;
  const recargoEmp = parseFloat(empSel && empSel.recargo_embalaje)||0;
  const calc = calcularTarifaPedido({ empresa:empSel, ambito:f.ambito, tipoServicio:f.tipo_servicio, pesoKg:parseFloat(f.peso_kg), distrito:f.dest_distrito, embalaje: embalaje && recargoEmp>0 }, tarifariosCliente, tarifarioEstandar);
  const tarifa = calc.tarifa;
  const [guardando, setGuardando] = useState(false);

  const save = async () => {
    if (!f.dest_nombre || !f.dest_direccion) { toast("Completa nombre y dirección","error"); return; }
    setGuardando(true);
    const { data: codigo, error: errCodigo } = await sb.rpc("generar_codigo_boaz");
    if (errCodigo || !codigo) { toast("Error al generar el código de tracking: "+(errCodigo?.message||""),"error"); setGuardando(false); return; }
    const coords = await geocodificarDireccion(f.dest_direccion, f.dest_distrito);
    const { error } = await sb.from("pedidos").insert([{
      ...f, omd: codigo, tarifa_s: tarifa,
      ...(calc.recargo>0 ? { con_embalaje:true, recargo_embalaje_s:calc.recargo } : {}),
      peso_kg: parseFloat(f.peso_kg)||null,
      monto_cobrar: parseFloat(f.monto_cobrar)||null,
      empresa_id: f.empresa_id||null, repartidor_id: f.repartidor_id||null,
      estado: f.repartidor_id?"asignado":"sin_asignar",
      fecha_asignacion: f.repartidor_id?new Date().toISOString():null,
      dest_lat: coords?.lat||null, dest_lng: coords?.lng||null,
    }]);
    setGuardando(false);
    if (error) { toast("Error: "+error.message,"error"); return; }
    toast(coords ? "Pedido creado ✓ (ubicación encontrada)" : "Pedido creado ✓ (no se encontró la ubicación exacta)");
    onSaved();
  };

  const Row = ({ children }) => (
    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>{children}</div>
  );
  const Field = ({ label, children, ayuda }) => (
    <div><label style={lbl}>{label}{ayuda && <Ayuda k={ayuda}/>}</label>{children}</div>
  );

  const ZONAS = {
    urbano: ["Lima","Barranco","Breña","Chorrillos","El Agustino","Jesús María","La Victoria","Lince","Magdalena del Mar","Miraflores","Pueblo Libre","Rímac","San Borja","San Isidro","San Luis","San Miguel","Santiago de Surco","Surquillo"],
    semi_urbano: ["Callao","Ate","Independencia","La Molina","Los Olivos","San Juan de Lurigancho","San Juan de Miraflores","San Martín de Porres","Santa Anita","Villa El Salvador","Villa María del Triunfo"],
    periferico: ["Comas","Ventanilla","Carabayllo","Lurigancho-Chosica","Lurín","Pachacámac","Puente Piedra"],
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"#0008", zIndex:1000,
      display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ background:B.white, borderRadius:16, padding:28, width:640,
        maxHeight:"90vh", overflowY:"auto", boxShadow:"0 20px 60px #0003" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
          <div>
            <div style={{ fontSize:16, fontWeight:800, color:B.navy }}>Nuevo pedido</div>
            <div style={{ fontSize:11, color:B.textMut }}>
              Tarifa calculada: <strong style={{color:B.goldDk}}>{fmt.sol(tarifa)}</strong> · {calc.origen}{calc.recargo>0 ? ` + embalaje ${fmt.sol(calc.recargo)}` : ""}
            </div>
          </div>
          <button onClick={onClose} style={{ background:"none", border:"none", fontSize:20,
            color:B.textSec, cursor:"pointer" }}>✕</button>
        </div>

        <div style={{ fontSize:11, fontWeight:700, color:B.navy, textTransform:"uppercase",
          letterSpacing:"1px", marginBottom:10, paddingBottom:6,
          borderBottom:`2px solid ${B.gold}` }}>Datos del destinatario</div>
        <Row>
          <Field label="Nombre completo"><input style={inp} value={f.dest_nombre} onChange={e=>setF(p=>({...p,dest_nombre:e.target.value}))}/></Field>
          <Field label="Teléfono"><input style={inp} value={f.dest_telefono} onChange={e=>setF(p=>({...p,dest_telefono:e.target.value}))}/></Field>
        </Row>
        <div style={{ marginBottom:12 }}>
          <Field label="Dirección completa"><input style={inp} value={f.dest_direccion} onChange={e=>setF(p=>({...p,dest_direccion:e.target.value}))}/></Field>
        </div>
        <Row>
          <Field label="Ámbito" ayuda="ambito">
            <select style={inp} value={f.ambito} onChange={e=>setF(p=>({...p,ambito:e.target.value,dest_distrito:""}))}>
              <option value="urbano">Urbano</option>
              <option value="semi_urbano">Semi Urbano</option>
              <option value="periferico">Periférico</option>
            </select>
          </Field>
          <Field label="Distrito">
            <select style={inp} value={f.dest_distrito} onChange={e=>setF(p=>({...p,dest_distrito:e.target.value}))}>
              <option value="">— Selecciona —</option>
              {(ZONAS[f.ambito]||[]).map(z=><option key={z} value={z}>{z}</option>)}
            </select>
          </Field>
        </Row>
        <div style={{ marginBottom:12 }}>
          <Field label="Referencia"><input style={inp} value={f.dest_referencia} onChange={e=>setF(p=>({...p,dest_referencia:e.target.value}))}/></Field>
        </div>

        <div style={{ fontSize:11, fontWeight:700, color:B.navy, textTransform:"uppercase",
          letterSpacing:"1px", marginBottom:10, marginTop:16, paddingBottom:6,
          borderBottom:`2px solid ${B.gold}` }}>Datos del paquete</div>
        <Row>
          <Field label="Peso (kg)"><input type="number" style={inp} value={f.peso_kg} onChange={e=>setF(p=>({...p,peso_kg:e.target.value}))}/></Field>
          <Field label="Tipo de servicio" ayuda="servicio">
            <select style={inp} value={f.tipo_servicio} onChange={e=>setF(p=>({...p,tipo_servicio:e.target.value}))}>
              <option value="same_day">Same Day</option>
              <option value="next_day">Next Day</option>
              <option value="especial">Especial</option>
            </select>
          </Field>
        </Row>
        <div style={{ marginBottom:12 }}>
          <Field label="Descripción del contenido"><input style={inp} value={f.descripcion} onChange={e=>setF(p=>({...p,descripcion:e.target.value}))}/></Field>
        </div>

        <div style={{ fontSize:11, fontWeight:700, color:B.navy, textTransform:"uppercase",
          letterSpacing:"1px", marginBottom:10, marginTop:16, paddingBottom:6,
          borderBottom:`2px solid ${B.gold}` }}>Asignación</div>
        <Row>
          <Field label="Empresa cliente">
            <select style={inp} value={f.empresa_id} onChange={e=>setF(p=>({...p,empresa_id:e.target.value}))}>
              <option value="">— Sin empresa —</option>
              {empresas.map(e=><option key={e.id} value={e.id}>{e.codigo_interno ? `${e.codigo_interno} — ` : ""}{e.nombre}</option>)}
            </select>
          </Field>
          <Field label="Repartidor">
            <select style={inp} value={f.repartidor_id} onChange={e=>setF(p=>({...p,repartidor_id:e.target.value}))}>
              <option value="">— Sin asignar —</option>
              {repartidores.filter(r=>r.activo).map(r=><option key={r.id} value={r.id}>{r.nombres} {r.apellidos}</option>)}
            </select>
          </Field>
        </Row>
        <Row>
          <Field label="Fecha programada"><input type="date" style={inp} value={f.fecha_programada} onChange={e=>setF(p=>({...p,fecha_programada:e.target.value}))}/></Field>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:20 }}>
              <input type="checkbox" id="cobro" checked={f.cobro_destino}
                onChange={e=>setF(p=>({...p,cobro_destino:e.target.checked}))}
                style={{ width:16, height:16 }}/>
              <label htmlFor="cobro" style={{ fontSize:13, color:B.textPri, cursor:"pointer" }}>Cobro en destino</label><Ayuda k="cod"/>
            </div>
            {f.cobro_destino && <input type="number" placeholder="Monto S/" style={inp} value={f.monto_cobrar} onChange={e=>setF(p=>({...p,monto_cobrar:e.target.value}))}/>}
          </div>
        </Row>
        {recargoEmp>0 && (
          <label style={{ display:"flex", alignItems:"center", gap:8, marginTop:10, fontSize:13, color:B.textPri, cursor:"pointer" }}>
            <input type="checkbox" checked={embalaje} onChange={e=>setEmbalaje(e.target.checked)} style={{ width:16, height:16 }}/>
            Requiere embalaje (pedido de agencia) <span style={{ color:B.textMut }}>— recargo de {fmt.sol(recargoEmp)}</span>
          </label>
        )}
        {calc.aviso && <div style={{ marginTop:10, fontSize:12, color:"var(--bzt-B45309, #B45309)", background:"var(--bzf-FFF7ED, #FFF7ED)", border:"1px solid #FDBA7488", borderRadius:8, padding:"8px 10px" }}>{calc.aviso}</div>}

        {/* Resumen tarifa */}
        <div style={{ background:`${alfa(B.navy,"08")}`, border:`1px solid ${B.gold}44`,
          borderRadius:10, padding:14, marginTop:12, display:"flex", gap:24, alignItems:"center" }}>
          <div><div style={{ fontSize:10, color:B.textMut, textTransform:"uppercase" }}>Tarifa</div>
            <div style={{ fontSize:22, fontWeight:800, color:B.gold }}>{fmt.sol(tarifa)}</div></div>
          <div><div style={{ fontSize:10, color:B.textMut, textTransform:"uppercase" }}>Ámbito</div>
            <div style={{ fontSize:14, fontWeight:600, color:B.navy, textTransform:"capitalize" }}>{f.ambito.replace("_"," ")}</div></div>
          <div><div style={{ fontSize:10, color:B.textMut, textTransform:"uppercase" }}>IGV (18%)</div>
            <div style={{ fontSize:14, fontWeight:600, color:B.textSec }}>{fmt.sol(tarifa*0.18)}</div></div>
          <div><div style={{ fontSize:10, color:B.textMut, textTransform:"uppercase" }}>Total con IGV</div>
            <div style={{ fontSize:14, fontWeight:600, color:B.navy }}>{fmt.sol(tarifa*1.18)}</div></div>
        </div>

        <div style={{ display:"flex", gap:10, marginTop:20, justifyContent:"flex-end" }}>
          <BtnSec onClick={onClose}>Cancelar</BtnSec>
          <BtnPri onClick={save} disabled={guardando}>{guardando?"Ubicando dirección...":"Crear pedido"}</BtnPri>
        </div>
      </div>
    </div>
  );
}

// ── ETIQUETAS CON CÓDIGO DE BARRAS ─────────────────────────────
export function escapeHtmlEtiqueta(str) {
  return (str||"").toString()
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

export function generarHtmlEtiquetas(pedidosSel, empresas) {
  const filas = pedidosSel.map((p,idx) => {
    const empresa = empresas.find(e=>e.id===p.empresa_id);
    const tipoServicio = p.tipo_servicio==="same_day" ? "Same Day"
      : p.tipo_servicio==="next_day" ? "Next Day" : "—";
    const cod = p.cobro_destino ? `COD — S/ ${p.monto_cobrar||""}` : "Pagado";
    const codigo = escapeHtmlEtiqueta(p.omd);
    return `
      <div class="etiqueta">
        <div class="fila-header">
          <div>
            <div style="font-size:10px;font-weight:bold;">ENVIADO POR:</div>
            <div style="font-size:22px;font-weight:900;letter-spacing:2px;margin-top:2px;">
              <span style="color:#0D1E3D;">BOA</span><span style="color:#E8780A;">Z</span>
            </div>
          </div>
        </div>
        <div style="font-size:11px;margin:8px 0;"><strong>TRACKING:</strong> ${codigo}</div>
        <div style="font-size:11px;margin-bottom:10px;">
          <strong>MÉTODO DE ENVÍO:</strong> ${escapeHtmlEtiqueta(tipoServicio)} &nbsp;|&nbsp;
          <strong>ÁMBITO:</strong> ${escapeHtmlEtiqueta((p.ambito||"—").replace("_"," "))} &nbsp;|&nbsp;
          <strong>MODALIDAD:</strong> ${escapeHtmlEtiqueta(cod)}
        </div>
        <div class="titulo-negro">
          <div style="flex:1;">REMITENTE:</div>
          <div style="flex:1;">DESTINATARIO:</div>
        </div>
        <div style="display:flex;">
          <div class="col">
            <div><strong>Empresa:</strong> ${escapeHtmlEtiqueta(empresa?.nombre||"Grupo Boaz S.A.C.")}</div>
            <div><strong>Dirección:</strong> ${escapeHtmlEtiqueta(empresa?.direccion||"—")}</div>
            <div><strong>Departamento:</strong> Lima</div>
            <div><strong>Provincia:</strong> Lima</div>
            <div><strong>Fecha de ingreso:</strong> ${fmt.fecha(p.created_at)}</div>
          </div>
          <div class="col">
            <div><strong>Cliente:</strong> ${escapeHtmlEtiqueta(p.dest_nombre)}</div>
            <div><strong>Dirección:</strong> ${escapeHtmlEtiqueta(p.dest_direccion)}</div>
            ${p.dest_referencia ? `<div><strong>Referencia:</strong> ${escapeHtmlEtiqueta(p.dest_referencia)}</div>` : ""}
            <div><strong>Departamento:</strong> Lima</div>
            <div><strong>Provincia:</strong> Lima</div>
            <div><strong>Distrito:</strong> ${escapeHtmlEtiqueta(p.dest_distrito)}</div>
          </div>
        </div>
        <div class="barcode-bottom">
          <div style="display:flex; align-items:center; justify-content:center; gap:14px;">
            <div style="flex:1; max-width:70%;">
              <svg data-code="${codigo}" style="height:60px;width:100%;"></svg>
              <div style="font-weight:bold;letter-spacing:3px;font-size:13px;margin-top:4px;text-align:center;">${codigo}</div>
            </div>
            <div id="qr-${idx}" data-qr-code="${codigo}" style="flex-shrink:0;"></div>
          </div>
        </div>
      </div>`;
  }).join("");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Etiquetas Boaz</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jsbarcode/3.12.3/JsBarcode.all.min.js"></script>
<script src="https://cdn.jsdelivr.net/gh/davidshimjs/qrcodejs/qrcode.min.js"></script>
<style>
  @page { size: 10cm 15cm; margin: 0.3cm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; margin:0; background:#fff; }
  .etiqueta { width:9.4cm; min-height:14.4cm; border:1.5px solid #000; padding:10px;
    page-break-after: always; margin:0 auto; }
  .etiqueta:last-child { page-break-after: auto; }
  .fila-header { display:flex; justify-content:space-between; align-items:flex-start;
    border-bottom:1.5px solid #000; padding-bottom:8px; }
  .titulo-negro { display:flex; background:#000; color:#fff; font-weight:bold;
    font-size:11px; padding:5px 8px; margin:6px 0; }
  .col { flex:1; padding:6px 8px 0 0; font-size:10.5px; line-height:1.5; }
  .barcode-bottom { text-align:center; margin-top:14px; border-top:1px dashed #999; padding-top:10px; }
  @media print { .no-print { display:none; } }
</style>
</head>
<body>
  <div class="no-print" style="text-align:center;padding:14px;">
    <button onclick="window.print()" style="padding:10px 20px;font-size:14px;cursor:pointer;">Imprimir</button>
  </div>
  ${filas}
  <script>
    window.addEventListener("load", function() {
      if (typeof JsBarcode === "undefined") {
        document.body.insertAdjacentHTML("afterbegin",
          '<div style="background:#FEE;color:#900;padding:12px;text-align:center;font-family:Arial;">' +
          'No se pudo cargar la librería de códigos de barras (revisa tu conexión a internet e intenta de nuevo).</div>');
        return;
      }
      document.querySelectorAll("svg[data-code]").forEach(function(el){
        try {
          JsBarcode(el, el.getAttribute("data-code"), { format:"CODE128", width:2, height:44, displayValue:false, margin:0 });
        } catch(e) { console.error("Error generando código de barras:", e); }
      });
      if (typeof QRCode === "undefined") {
        console.error("No se pudo cargar la librería de QR");
        return;
      }
      document.querySelectorAll("[data-qr-code]").forEach(function(el){
        try {
          new QRCode(el, { text: el.getAttribute("data-qr-code"), width:70, height:70,
            colorDark:"#000000", colorLight:"#ffffff", correctLevel: QRCode.CorrectLevel.M });
        } catch(e) { console.error("Error generando QR:", e); }
      });
    });
  </script>
</body>
</html>`;
}

export function ModalEtiquetas({ pedidos, empresas, onClose }) {
  const [seleccionados, setSeleccionados] = useState(() => new Set(pedidos.map(p=>p.id)));

  const toggle = (id) => setSeleccionados(prev => {
    const nuevo = new Set(prev);
    nuevo.has(id) ? nuevo.delete(id) : nuevo.add(id);
    return nuevo;
  });
  const toggleTodos = () => setSeleccionados(prev =>
    prev.size === pedidos.length ? new Set() : new Set(pedidos.map(p=>p.id))
  );

  const imprimir = () => {
    const elegidos = pedidos.filter(p=>seleccionados.has(p.id));
    if (elegidos.length===0) return;
    const html = generarHtmlEtiquetas(elegidos, empresas);
    const ventana = window.open("", "_blank");
    if (!ventana) return;
    ventana.document.write(html);
    ventana.document.close();
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"#0008", zIndex:1000,
      display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ background:B.white, borderRadius:16, padding:28, width:560,
        maxHeight:"85vh", overflowY:"auto", boxShadow:"0 20px 60px #0003" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
          <div style={{ fontSize:16, fontWeight:800, color:B.navy }}>Generar etiquetas con código de barras</div>
          <button onClick={onClose} style={{ background:"none", border:"none", fontSize:20,
            color:B.textSec, cursor:"pointer" }}>✕</button>
        </div>

        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
          <button onClick={toggleTodos}
            style={{ fontSize:12, color:B.blue, background:"none", border:"none", cursor:"pointer", fontWeight:600 }}>
            {seleccionados.size===pedidos.length ? "Deseleccionar todos" : "Seleccionar todos"}
          </button>
          <span style={{ fontSize:12, color:B.textMut }}>{seleccionados.size} seleccionado{seleccionados.size===1?"":"s"}</span>
        </div>

        <div style={{ border:`1px solid ${B.border}`, borderRadius:10, overflow:"hidden", marginBottom:20 }}>
          {pedidos.length===0 && (
            <div style={{ padding:24, textAlign:"center", color:B.textMut, fontSize:13 }}>
              No hay pedidos en la vista actual. Cambia el filtro de estado o el texto de búsqueda.
            </div>
          )}
          {pedidos.map((p,i)=>(
            <label key={p.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 14px",
              borderTop: i>0 ? `1px solid ${B.border}` : "none", cursor:"pointer",
              background: seleccionados.has(p.id) ? "var(--bzf-FFF7ED, #FFF7ED)" : B.white }}>
              <input type="checkbox" checked={seleccionados.has(p.id)} onChange={()=>toggle(p.id)}
                style={{ width:16, height:16 }}/>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:12, fontWeight:700, color:B.navy }}>{p.omd} · {p.dest_nombre}</div>
                <div style={{ fontSize:11, color:B.textMut }}>{p.dest_distrito}</div>
              </div>
            </label>
          ))}
        </div>

        <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
          <BtnSec onClick={onClose}>Cancelar</BtnSec>
          <BtnPri onClick={imprimir} disabled={seleccionados.size===0}><Ico n="filetext" size={15}/> Generar e imprimir ({seleccionados.size})
          </BtnPri>
        </div>
      </div>
    </div>
  );
}

// Geocodifica retroactivamente pedidos ya existentes que no tienen coordenadas
export function ModalGeocodificarPendientes({ pedidos, onClose, onDone, toast }) {
  const pendientes = pedidos.filter(p=>!p.dest_lat);
  const [procesando, setProcesando] = useState(false);
  const [progreso, setProgreso] = useState("");
  const [resultado, setResultado] = useState(null);
  const [mostrarLista, setMostrarLista] = useState(false);

  const iniciar = async () => {
    setProcesando(true);
    const fallidos = [];
    let ubicados = 0;
    for (let i=0; i<pendientes.length; i++) {
      const p = pendientes[i];
      setProgreso(`Ubicando pedido ${i+1} de ${pendientes.length} (${p.omd})...`);
      try {
        const coords = await geocodificarDireccion(p.dest_direccion, p.dest_distrito);
        if (coords) {
          await sb.from("pedidos").update({ dest_lat: coords.lat, dest_lng: coords.lng }).eq("id", p.id);
          ubicados++;
        } else {
          fallidos.push(p);
        }
      } catch (e) {
        fallidos.push(p);
      }
      await esperar(1100);
    }
    setProgreso("");
    setProcesando(false);
    setResultado({ ubicados, fallidos });
    toast(`${ubicados} pedido${ubicados===1?"":"s"} ubicado${ubicados===1?"":"s"} en el mapa ✓`);
    onDone();
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"#0008", zIndex:1000,
      display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ background:B.white, borderRadius:16, padding:28, width:560,
        maxHeight:"85vh", overflowY:"auto", boxShadow:"0 20px 60px #0003" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
          <div style={{ fontSize:16, fontWeight:800, color:B.navy }}>Geocodificar pedidos existentes</div>
          <button onClick={onClose} style={{ background:"none", border:"none", fontSize:20,
            color:B.textSec, cursor:"pointer" }}>✕</button>
        </div>

        {!resultado ? (
          <>
            <div style={{ fontSize:13, color:B.textSec, marginBottom:12, lineHeight:1.6 }}>
              Se encontraron <strong style={{ color:B.navy }}>{pendientes.length} pedido{pendientes.length===1?"":"s"}</strong> sin coordenadas guardadas.
              Voy a buscar la ubicación de cada dirección (gratis, vía OpenStreetMap) para que aparezcan en el mapa de la app del repartidor.
            </div>
            <button onClick={()=>setMostrarLista(s=>!s)}
              style={{ fontSize:12, color:B.blue, background:"none", border:"none", cursor:"pointer",
                fontWeight:600, marginBottom:12 }}>
              {mostrarLista ? "Ocultar lista" : "Ver cuáles son →"}
            </button>
            {mostrarLista && (
              <div style={{ border:`1px solid ${B.border}`, borderRadius:8, marginBottom:16,
                maxHeight:220, overflowY:"auto" }}>
                {pendientes.map((p,i)=>(
                  <div key={p.id} style={{ padding:"8px 12px", fontSize:12,
                    borderTop: i>0 ? `1px solid ${B.border}` : "none",
                    background:B.white }}>
                    <span style={{ fontWeight:700, color:B.navy }}>{p.omd}</span> — {p.dest_nombre}
                    <div style={{ color:B.textMut }}>{p.dest_direccion}, {p.dest_distrito}</div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ background:"var(--bzf-FFFBEB, #FFFBEB)", border:"1px solid var(--bzl-FDE68A, #FDE68A)", borderRadius:8,
              padding:"10px 14px", marginBottom:20, fontSize:12, color:"var(--bzt-92400E, #92400E)" }}>
              Esto puede tardar aproximadamente <strong>{Math.ceil(pendientes.length*1.1)} segundos</strong> (1 dirección por segundo, para respetar el servicio gratuito). No cierres esta ventana mientras procesa.
            </div>
            <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
              <BtnSec onClick={onClose}>Cancelar</BtnSec>
              <BtnPri onClick={iniciar} disabled={procesando}>
                {procesando ? (progreso||"Procesando...") : "Iniciar geocodificación"}
              </BtnPri>
            </div>
          </>
        ) : (
          <>
            <div style={{ background:"var(--bzf-ECFDF5, #ECFDF5)", border:"1px solid var(--bzl-A7F3D0, #A7F3D0)", borderRadius:10,
              padding:16, marginBottom:16, textAlign:"center" }}>
              <div style={{ fontSize:28, fontWeight:900, color:B.green }}>{resultado.ubicados}</div>
              <div style={{ fontSize:12, color:B.textSec }}>ubicados correctamente</div>
            </div>
            {resultado.fallidos.length > 0 && (
              <div style={{ marginBottom:16 }}>
                <div style={{ background:"var(--bzf-FEF2F2, #FEF2F2)", border:"1px solid var(--bzl-FECACA, #FECACA)", borderRadius:10,
                  padding:"12px 16px", marginBottom:8 }}>
                  <div style={{ fontSize:13, fontWeight:800, color:B.red, marginBottom:2 }}>
                    {resultado.fallidos.length} no se pudieron ubicar
                  </div>
                  <div style={{ fontSize:11, color:B.textSec }}>
                    Corrige la dirección de cada uno abriendo su detalle ("Ver") y usa "Guardar dirección y reintentar ubicación", o ingresa las coordenadas manualmente.
                  </div>
                </div>
                <div style={{ border:`1px solid ${B.border}`, borderRadius:8, maxHeight:220, overflowY:"auto" }}>
                  {resultado.fallidos.map((p,i)=>(
                    <div key={p.id} style={{ padding:"8px 12px", fontSize:12,
                      borderTop: i>0 ? `1px solid ${B.border}` : "none",
                      background:B.white }}>
                      <span style={{ fontWeight:700, color:B.navy }}>{p.omd}</span> — {p.dest_nombre}
                      <div style={{ color:B.textMut }}>{p.dest_direccion}, {p.dest_distrito}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div style={{ display:"flex", justifyContent:"flex-end" }}>
              <BtnPri onClick={onClose}>Listo</BtnPri>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Modal de carga masiva (CSV / Excel) — admin puede cargar en nombre de cualquier cliente
export const COLUMNAS_PLANTILLA_ADMIN = [
  "Numero de Orden", "Destinatario", "Telefono", "Direccion", "Referencia",
  "Distrito", "Ambito (urbano-semi_urbano-periferico)", "Peso (kg)",
  "Tipo de Servicio", "Cobro en Destino (SI/NO)", "Monto a Cobrar", "Embalaje (SI/NO)",
];

export function normalizarTextoAdmin(s) {
  return (s||"").toString().trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"");
}

export function mapearFilaAdmin(fila) {
  const out = {};
  for (const key of Object.keys(fila)) {
    const k = normalizarTextoAdmin(key);
    const v = fila[key];
    if (k.includes("orden") || k.includes("referencia cliente") || k.includes("guia")) out.cliente_referencia = (v||"").toString().trim();
    else if (k.includes("destinatario") || k === "nombre") out.dest_nombre = (v||"").toString().trim();
    else if (k.includes("telefono")) out.dest_telefono = (v||"").toString().trim();
    else if (k.includes("direccion")) out.dest_direccion = (v||"").toString().trim();
    else if (k.includes("referencia")) out.dest_referencia = (v||"").toString().trim();
    else if (k.includes("distrito")) out.dest_distrito = (v||"").toString().trim();
    else if (k.includes("ambito") || k.includes("zona")) {
      const t = normalizarTextoAdmin(v);
      out.ambito = t.includes("peri") ? "periferico" : t.includes("semi") ? "semi_urbano" : "urbano";
    }
    else if (k.includes("peso")) out.peso_kg = parseFloat(v) || null;
    else if (k.includes("servicio")) {
      const t = normalizarTextoAdmin(v);
      out.tipo_servicio = t.includes("next") ? "next_day" : t.includes("same") ? "same_day" : t.includes("espec") ? "especial" : "";
    }
    else if (k.includes("cobro")) {
      const t = normalizarTextoAdmin(v);
      out.cobro_destino = t==="si" || t==="sí" || t==="true" || t==="1" || t==="x";
    }
    else if (k.includes("monto")) out.monto_cobrar = parseFloat(v) || null;
    else if (k.includes("embalaje")) { const t = normalizarTextoAdmin(v); out.embalaje = t==="si" || t==="sí" || t==="true" || t==="1" || t==="x"; }
  }
  if (!out.ambito) out.ambito = "urbano";
  return out;
}

export const REGEX_ALFANUM_ADMIN = /^[a-zA-Z0-9-]+$/;

export function validarFilaAdmin(fila) {
  const errores = [];
  if (!fila.dest_nombre) errores.push("falta destinatario");
  if (!fila.dest_direccion) errores.push("falta dirección");
  if (!fila.dest_distrito) errores.push("falta distrito");
  if (fila.cliente_referencia) {
    if (fila.cliente_referencia.length > 15) errores.push("N° de orden supera 15 caracteres");
    if (!REGEX_ALFANUM_ADMIN.test(fila.cliente_referencia)) errores.push("N° de orden debe ser alfanumérico");
  }
  return errores;
}

export async function parseArchivoAdmin(file) {
  await asegurarXLSX();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type:"array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(sheet, { defval:"" });
        resolve(json);
      } catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

export async function descargarPlantillaAdmin() {
  await asegurarXLSX();
  const ejemplo = ["PED-00123","Marco Salinas","987654321","Calle Las Flores 890","Frente al parque","Miraflores","urbano","1.2","Same Day","NO",""];
  const ws = XLSX.utils.aoa_to_sheet([COLUMNAS_PLANTILLA_ADMIN, ejemplo]);
  ws["!cols"] = COLUMNAS_PLANTILLA_ADMIN.map(()=>({ wch:22 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Plantilla");
  XLSX.writeFile(wb, "plantilla_pedidos_boaz.xlsx");
}

export function ModalCargaMasiva({ repartidores, empresas, tarifariosCliente, tarifarioEstandar, onClose, onSaved, toast }) {
  const [empresaId, setEmpresaId] = useState("");
  const [repartidorId, setRepartidorId] = useState("");
  const [filas, setFilas] = useState([]);
  const [nombreArchivo, setNombreArchivo] = useState("");
  const [procesando, setProcesando] = useState(false);
  const [progreso, setProgreso] = useState("");
  const [resultado, setResultado] = useState(null);
  const [errorArchivo, setErrorArchivo] = useState("");
  const [mostrarEtiquetas, setMostrarEtiquetas] = useState(false);

  const validas = filas.filter(f=>f.errores.length===0);
  const invalidas = filas.filter(f=>f.errores.length>0);

  const onSeleccionarArchivo = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorArchivo(""); setResultado(null); setNombreArchivo(file.name);
    try {
      const json = await parseArchivoAdmin(file);
      const procesadas = json.map(fila => {
        const mapeada = mapearFilaAdmin(fila);
        return { ...mapeada, errores: validarFilaAdmin(mapeada) };
      });
      setFilas(procesadas);
    } catch (err) {
      setErrorArchivo("No se pudo leer el archivo. Verifica que sea un .csv o .xlsx válido.");
      setFilas([]);
    }
    e.target.value = "";
  };

  const confirmarCarga = async () => {
    if (!empresaId) { toast("Selecciona a qué empresa pertenecen estos pedidos","error"); return; }
    if (validas.length===0) return;
    setProcesando(true);
    const generados = [];
    const loteId = repartidorId ? crypto.randomUUID() : null;
    try {
      for (let i=0; i<validas.length; i++) {
        const fila = validas[i];
        setProgreso(`Ubicando dirección ${i+1} de ${validas.length}...`);
        try {
          const { data: codigo, error: errCodigo } = await sb.rpc("generar_codigo_boaz");
          if (errCodigo || !codigo) { generados.push({ ...fila, ok:false, error:"no se pudo generar código: "+(errCodigo?.message||"sin detalle") }); continue; }
          const coords = await geocodificarDireccion(fila.dest_direccion, fila.dest_distrito);
          const calcF = calcularTarifaPedido({ empresa: empresas.find(e=>e.id===empresaId)||null, ambito:fila.ambito, tipoServicio:fila.tipo_servicio, pesoKg:fila.peso_kg, distrito:fila.dest_distrito, embalaje:!!fila.embalaje }, tarifariosCliente, tarifarioEstandar);
          const tarifa = calcF.tarifa;
          const { error: errInsert } = await sb.from("pedidos").insert({
            omd: codigo,
            empresa_id: empresaId,
            repartidor_id: repartidorId || null,
            lote_id: loteId,
            cliente_referencia: fila.cliente_referencia || null,
            dest_nombre: fila.dest_nombre,
            dest_telefono: fila.dest_telefono || null,
            dest_direccion: fila.dest_direccion,
            dest_referencia: fila.dest_referencia || null,
            dest_distrito: fila.dest_distrito,
            ambito: fila.ambito,
            peso_kg: fila.peso_kg || null,
            tarifa_s: tarifa,
            ...(calcF.recargo>0 ? { con_embalaje:true, recargo_embalaje_s:calcF.recargo } : {}),
            tipo_servicio: fila.tipo_servicio || null,
            cobro_destino: !!fila.cobro_destino,
            monto_cobrar: fila.cobro_destino ? (fila.monto_cobrar || null) : null,
            estado: repartidorId ? "asignado" : "sin_asignar",
            fecha_asignacion: repartidorId ? new Date().toISOString() : null,
            dest_lat: coords?.lat||null, dest_lng: coords?.lng||null,
          });
          if (errInsert) generados.push({ ...fila, ok:false, error:errInsert.message });
          else generados.push({ ...fila, ok:true, codigo, ubicado: !!coords });
          await esperar(1100); // respeta el límite de 1 solicitud/segundo del geocodificador gratuito
        } catch (filaErr) {
          generados.push({ ...fila, ok:false, error: filaErr.message || "error inesperado en esta fila" });
        }
      }
    } catch (err) {
      toast("Error inesperado durante la carga: "+err.message,"error");
    }
    setProgreso("");
    setProcesando(false);
    setResultado(generados);
    setFilas([]);
    const okCount = generados.filter(g=>g.ok).length;
    if (okCount > 0) toast(`${okCount} pedido${okCount===1?"":"s"} creado${okCount===1?"":"s"} ✓`);
    else if (generados.length > 0) toast("No se pudo crear ningún pedido — revisa el detalle abajo","error");
    onSaved();
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"#0008", zIndex:1000,
      display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ background:B.white, borderRadius:16, padding:28, width:820,
        maxHeight:"90vh", overflowY:"auto", boxShadow:"0 20px 60px #0003" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
          <div style={{ fontSize:16, fontWeight:800, color:B.navy }}>Cargar pedidos desde CSV o Excel</div>
          <button onClick={onClose} style={{ background:"none", border:"none", fontSize:20,
            color:B.textSec, cursor:"pointer" }}>✕</button>
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:16 }}>
          <div>
            <label style={lbl}>Cliente (empresa) *</label>
            <select style={inp} value={empresaId} onChange={e=>setEmpresaId(e.target.value)}>
              <option value="">— Selecciona —</option>
              {empresas.map(e=><option key={e.id} value={e.id}>{e.codigo_interno ? `${e.codigo_interno} — ` : ""}{e.nombre}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Asignar a repartidor (opcional)</label>
            <select style={inp} value={repartidorId} onChange={e=>setRepartidorId(e.target.value)}>
              <option value="">— Sin asignar —</option>
              {repartidores.filter(r=>r.activo).map(r=><option key={r.id} value={r.id}>{r.nombres} {r.apellidos}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginBottom:16 }}>
          <BtnSec onClick={descargarPlantillaAdmin}><Ico n="download" size={15}/> Descargar plantilla</BtnSec>
          <label style={{ background:"#D46A08", color:"#fff",
            padding:"9px 18px", borderRadius:8, fontSize:13, fontWeight:800, cursor:"pointer",
            display:"inline-flex", alignItems:"center", gap:6 }}>
            Seleccionar archivo (.csv, .xlsx)
            <input type="file" accept=".csv,.xlsx,.xls" onChange={onSeleccionarArchivo} style={{ display:"none" }}/>
          </label>
          {nombreArchivo && <div style={{ fontSize:12, color:B.textMut, alignSelf:"center" }}>{nombreArchivo}</div>}
        </div>

        {errorArchivo && (
          <div style={{ marginBottom:14, background:"var(--bzf-FEF2F2, #FEF2F2)", border:"1px solid var(--bzl-FECACA, #FECACA)", borderRadius:8,
            padding:"10px 14px", color:B.red, fontSize:12 }}>{errorArchivo}</div>
        )}

        {filas.length > 0 && !empresaId && (
          <div style={{ marginBottom:14, background:"var(--bzf-FFFBEB, #FFFBEB)", border:"1px solid var(--bzl-FDE68A, #FDE68A)", borderRadius:8,
            padding:"10px 14px", color:"var(--bzt-92400E, #92400E)", fontSize:12, fontWeight:600 }}>
            Selecciona el cliente (empresa) arriba antes de confirmar — el botón no hace nada hasta que lo elijas.
          </div>
        )}

        {filas.length > 0 && (
          <div style={{ border:`1px solid ${B.border}`, borderRadius:10, overflow:"hidden", marginBottom:16 }}>
            <div style={{ padding:"12px 16px", borderBottom:`1px solid ${B.border}`, background:B.bg,
              display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div style={{ fontSize:12, fontWeight:700, color:B.navy }}>
                {validas.length} válida{validas.length===1?"":"s"}, {invalidas.length} con error{invalidas.length===1?"":"es"}
              </div>
              <BtnPri onClick={confirmarCarga} disabled={validas.length===0 || !empresaId || procesando}>
                {procesando ? (progreso||"Generando...") : `Confirmar y cargar ${validas.length}`}
              </BtnPri>
            </div>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
              <thead>
                <tr style={{ background:"var(--bzf-F6F9FC, #F6F9FC)" }}>
                  {["N° Orden","Destinatario","Distrito","Ámbito","Servicio","Estado"].map(h=>(
                    <th key={h} style={{ padding:"8px 10px", fontSize:10, fontWeight:700, color:B.textMut,
                      textTransform:"uppercase", borderBottom:`1px solid ${B.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filas.map((f,i)=>(
                  <tr key={i} style={{ borderBottom:"1px solid #F1F5F9",
                    background: f.errores.length>0 ? "var(--bzf-FEF2F2, #FEF2F2)" : "transparent" }}>
                    <td style={{ padding:"8px 10px" }}>{f.cliente_referencia||"—"}</td>
                    <td style={{ padding:"8px 10px" }}>{f.dest_nombre||"—"}</td>
                    <td style={{ padding:"8px 10px" }}>{f.dest_distrito||"—"}</td>
                    <td style={{ padding:"8px 10px", textTransform:"capitalize" }}>{f.ambito?.replace("_"," ")}</td>
                    <td style={{ padding:"8px 10px" }}>{f.tipo_servicio||"—"}</td>
                    <td style={{ padding:"8px 10px" }}>
                      {f.errores.length===0
                        ? <span style={{ color:B.green, fontWeight:700 }}>OK</span>
                        : <span style={{ color:B.red, fontWeight:700 }} title={f.errores.join(", ")}>{f.errores[0]}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {resultado && (
          <div style={{ border:`1px solid ${B.border}`, borderRadius:10, padding:16 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
              <div style={{ fontSize:13, fontWeight:800, color:B.navy }}>
                {resultado.filter(r=>r.ok).length} pedido{resultado.filter(r=>r.ok).length===1?"":"s"} creado{resultado.filter(r=>r.ok).length===1?"":"s"}
              </div>
              {resultado.some(r=>r.ok) && (
                <BtnPri onClick={()=>setMostrarEtiquetas(true)} style={{ fontSize:12, padding:"7px 14px" }}>
                  Generar etiquetas
                </BtnPri>
              )}
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:6, maxHeight:200, overflowY:"auto" }}>
              {resultado.map((r,i)=>(
                <div key={i} style={{ display:"flex", justifyContent:"space-between",
                  padding:"6px 10px", background:B.bg, borderRadius:6, fontSize:12 }}>
                  <span style={{ color:B.textSec }}>{r.cliente_referencia||"—"} · {r.dest_nombre}</span>
                  <span style={{ fontWeight:700, color: r.ok?B.green:B.red }}>
                    {r.ok ? `${r.codigo}${r.ubicado?"":" (sin ubicar en el mapa)"}` : `Error: ${r.error}`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {mostrarEtiquetas && resultado && (
          <ModalEtiquetas
            pedidos={resultado.filter(r=>r.ok).map(r => ({
              id: r.codigo,
              omd: r.codigo,
              dest_nombre: r.dest_nombre,
              dest_direccion: r.dest_direccion,
              dest_referencia: r.dest_referencia,
              dest_distrito: r.dest_distrito,
              tipo_servicio: r.tipo_servicio,
              cobro_destino: r.cobro_destino,
              monto_cobrar: r.monto_cobrar,
              cliente_referencia: r.cliente_referencia,
              ambito: r.ambito,
              empresa_id: empresaId,
              created_at: new Date().toISOString(),
            }))}
            empresas={empresas}
            onClose={()=>setMostrarEtiquetas(false)}
          />
        )}

        <div style={{ display:"flex", justifyContent:"flex-end", marginTop:20 }}>
          <BtnSec onClick={onClose}>Cerrar</BtnSec>
        </div>
      </div>
    </div>
  );
}

// Modal detalle pedido
export function ModalDetallePedido({ pedido: p, repartidores, onClose, onRefresh, toast }) {
  const rep = repartidores.find(r=>r.id===p.repartidor_id);
  const [direccion, setDireccion] = useState(p.dest_direccion||"");
  const [distrito, setDistrito] = useState(p.dest_distrito||"");
  const [latManual, setLatManual] = useState(p.dest_lat||"");
  const [lngManual, setLngManual] = useState(p.dest_lng||"");
  const [ubicando, setUbicando] = useState(false);
  const [histRaw, setHistRaw] = useState(p.historial || []);
  useEffect(() => {
    let vivo = true;
    sb.from("pedidos").select("historial").eq("id", p.id).single().then(({ data }) => { if (vivo && data) setHistRaw(data.historial || []); });
    return () => { vivo = false; };
  }, [p.id, p.estado]);
  const historial = agruparHistorial(
    [...histRaw].sort((a,b)=> new Date(b.timestamp) - new Date(a.timestamp))
  );
  const todasLasFotos = historial.filter(h=>h.esFotoGrupo).flatMap(h=>h.urls);
  const [fotoAbierta, setFotoAbierta] = useState(null);
  const timeline = [
    { label:"Creado", fecha: p.created_at, ok: true },
    { label:"Asignado", fecha: p.fecha_asignacion, ok: !!p.fecha_asignacion },
    { label:"En ruta", fecha: p.fecha_asignacion, ok: ["en_ruta","entregado","no_entregado"].includes(p.estado) },
  ];

  const reintentarUbicacion = async () => {
    setUbicando(true);
    // Si cambió la dirección o distrito, los guarda primero
    if (direccion !== p.dest_direccion || distrito !== p.dest_distrito) {
      await sb.from("pedidos").update({ dest_direccion: direccion, dest_distrito: distrito }).eq("id", p.id);
    }
    const coords = await geocodificarDireccion(direccion, distrito);
    setUbicando(false);
    if (coords) {
      await sb.from("pedidos").update({ dest_lat: coords.lat, dest_lng: coords.lng }).eq("id", p.id);
      setLatManual(coords.lat); setLngManual(coords.lng);
      toast("Ubicación encontrada ✓");
      onRefresh();
    } else {
      toast("No se encontró la ubicación con esa dirección. Intenta ajustarla o ingresa las coordenadas manualmente.","error");
    }
  };

  const guardarManual = async () => {
    const lat = parseFloat(latManual), lng = parseFloat(lngManual);
    if (isNaN(lat) || isNaN(lng)) { toast("Ingresa latitud y longitud válidas","error"); return; }
    const { error } = await sb.from("pedidos").update({ dest_lat: lat, dest_lng: lng }).eq("id", p.id);
    if (error) { toast("Error: "+error.message,"error"); return; }
    toast("Coordenadas guardadas ✓");
    onRefresh();
  };

  return (
    <div onMouseDown={e=>{ if (e.target===e.currentTarget) onClose(); }} style={{ position:"fixed", inset:0, background:"#0D1E3D66", zIndex:1000,
      display:"flex", alignItems:"stretch", justifyContent:"flex-end" }}>
      <div className="bz-panel" style={{ background:B.white, padding:28, width:600, maxWidth:"100vw",
        height:"100%", overflowY:"auto", boxShadow:"-12px 0 40px #0D1E3D33" }}>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:20 }}>
          <div>
            <div style={{ fontSize:20, fontWeight:800, color:B.navy }}>{p.omd}</div>
            <div style={{ marginTop:4 }}><Chip estado={p.estado} size="lg"/></div>
          </div>
          <button onClick={onClose} style={{ background:"none", border:"none", fontSize:20,
            color:B.textSec, cursor:"pointer" }}>✕</button>
        </div>

        {/* Timeline */}
        <div style={{ display:"flex", gap:0, marginBottom:14 }}>
          {timeline.map((t,i) => (
            <div key={i} style={{ flex:1, textAlign:"center", position:"relative" }}>
              <div style={{ width:28, height:28, borderRadius:"50%", margin:"0 auto 6px",
                background: t.ok?B.gold:B.bg, border:`2px solid ${t.ok?B.gold:B.border}`,
                display:"flex", alignItems:"center", justifyContent:"center",
                fontSize:12, color: t.ok?B.navy:B.textMut, fontWeight:700, zIndex:1, position:"relative" }}>
                {t.ok?"✓":i+1}
              </div>
              {i<timeline.length-1&&<div style={{ position:"absolute", top:14, left:"50%", width:"100%",
                height:2, background: t.ok?B.gold:B.border, zIndex:0 }}/>}
              <div style={{ fontSize:10, color: t.ok?B.navy:B.textMut, fontWeight: t.ok?700:400 }}>{t.label}</div>
              <div style={{ fontSize:9, color:B.textMut }}>{fmt.fecha(t.fecha)}</div>
            </div>
          ))}
        </div>

        {/* Subestado final: solo se muestra el que realmente ocurrió */}
        {(p.estado==="entregado" || p.estado==="no_entregado") && (
          <div style={{ marginBottom:24 }}>
            {p.estado==="entregado" ? (
              <div style={{ borderRadius:10, padding:"10px 14px", background:"var(--bzf-ECFDF5, #ECFDF5)",
                border:`1.5px solid ${B.green}` }}>
                <div style={{ fontSize:11, fontWeight:700, color:B.green }}>
                  Entregado {p.recibido_por && `— a ${p.recibido_por}`}
                </div>
                <div style={{ fontSize:9, color:B.textMut, marginTop:2 }}>{fmt.fecha(p.fecha_entrega)}</div>
                {p.comentario_entrega && <div style={{ fontSize:10, color:"var(--bzt-065F46, #065F46)", marginTop:4, fontStyle:"italic" }}>{p.comentario_entrega}</div>}
              </div>
            ) : (
              <div style={{ borderRadius:10, padding:"10px 14px", background:"var(--bzf-FEF2F2, #FEF2F2)",
                border:`1.5px solid ${B.red}` }}>
                <div style={{ fontSize:11, fontWeight:700, color:B.red }}>
                  No entregado {p.motivo_no_entrega && `— ${p.motivo_no_entrega}`}
                </div>
                <div style={{ fontSize:9, color:B.textMut, marginTop:2 }}>{fmt.fecha(p.fecha_entrega)}</div>
                {p.comentario_no_entrega && <div style={{ fontSize:10, color:"var(--bzt-991B1B, #991B1B)", marginTop:4, fontStyle:"italic" }}>{p.comentario_no_entrega}</div>}
              </div>
            )}
          </div>
        )}

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:B.navy, textTransform:"uppercase",
              letterSpacing:"0.8px", marginBottom:10, paddingBottom:6, borderBottom:`1px solid ${B.border}` }}>Destinatario</div>
            {[["Nombre",p.dest_nombre],["Teléfono",p.dest_telefono],["Dirección",p.dest_direccion],
              ["Distrito",p.dest_distrito],["Referencia",p.dest_referencia||"—"]].map(([k,v])=>(
              <div key={k} style={{ marginBottom:8 }}>
                <div style={{ fontSize:10, color:B.textMut }}>{k}</div>
                <div style={{ fontSize:13, color:B.textPri, fontWeight:500 }}>{v||"—"}</div>
              </div>
            ))}
          </div>
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:B.navy, textTransform:"uppercase",
              letterSpacing:"0.8px", marginBottom:10, paddingBottom:6, borderBottom:`1px solid ${B.border}` }}>Detalles</div>
            {[["N° Orden",p.cliente_referencia||"—"],["Peso",p.peso_kg?p.peso_kg+" kg":"—"],["Tarifa",fmt.sol(p.tarifa_s)],
              ["Ámbito",p.ambito?.replace("_"," ")||"—"],["Repartidor",rep?`${rep.nombres} ${rep.apellidos}`:"Sin asignar"],
              ["Cobro destino",p.cobro_destino?fmt.sol(p.monto_cobrar):"No"],
              ...(p.con_embalaje ? [["Embalaje",`Sí · recargo ${fmt.sol(p.recargo_embalaje_s)} incluido en la tarifa`]] : []),
              ["Fecha prog.",fmt.fecha(p.fecha_programada)]].map(([k,v])=>(
              <div key={k} style={{ marginBottom:8 }}>
                <div style={{ fontSize:10, color:B.textMut }}>{k}</div>
                <div style={{ fontSize:13, color:B.textPri, fontWeight:500, textTransform:"capitalize" }}>{v||"—"}</div>
              </div>
            ))}
          </div>
        </div>
        {historial.length > 0 && (
          <div style={{ marginTop:16 }}>
            <div style={{ fontSize:11, fontWeight:700, color:B.navy, textTransform:"uppercase",
              letterSpacing:"0.8px", marginBottom:10 }}>Historial del pedido</div>
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {historial.map((h,i)=>(
                <div key={i} style={{ display:"flex", gap:10, alignItems:"flex-start",
                  borderBottom: i<historial.length-1 ? `1px solid ${B.border}` : "none",
                  paddingBottom:10 }}>
                  <Ico n={ICONOS_HIST[h.tipo]||"clock"} size={15} color={B.textSec}/>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:12, fontWeight:600, color:B.textPri }}>
                      {h.tipo==="llamada" && "Llamada al destinatario"}
                      {h.tipo==="whatsapp" && "Mensaje de WhatsApp"}
                      {h.tipo==="estado" && h.detalle}
                      {h.esFotoGrupo && "Fotos de evidencia"}
                    </div>
                    <div style={{ fontSize:10, color:B.textMut }}>
                      {fmt.fechaHora(h.timestamp)}
                      {h.lat && ` · GPS ${h.lat.toFixed(4)}, ${h.lng.toFixed(4)}`}
                    </div>
                    {h.esFotoGrupo && (
                      <div style={{ display:"flex", gap:8, marginTop:6, flexWrap:"wrap" }}>
                        {h.urls.map((url,ui)=>(
                          <img key={ui} src={url} alt=""
                            onClick={()=>setFotoAbierta(todasLasFotos.indexOf(url))}
                            style={{ width:70, height:70, objectFit:"cover",
                            borderRadius:6, border:`1px solid ${B.border}`, cursor:"pointer" }}/>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ marginTop:16, background:B.bg, borderRadius:10, padding:16 }}>
          <div style={{ fontSize:11, fontWeight:700, color:B.navy, textTransform:"uppercase",
            letterSpacing:"0.8px", marginBottom:10 }}>Ubicación en el mapa</div>
          <div style={{ fontSize:12, marginBottom:12,
            color: p.dest_lat ? B.green : B.red, fontWeight:600 }}>
            {p.dest_lat ? `✓ Ubicado (${parseFloat(p.dest_lat).toFixed(5)}, ${parseFloat(p.dest_lng).toFixed(5)})` : "Sin coordenadas — no aparece en el mapa del repartidor"}
          </div>

          <label style={{ ...lbl, marginTop:0 }}>Dirección (ajústala si la ubicación está mal)</label>
          <input style={{ ...inp, marginBottom:8 }} value={direccion} onChange={e=>setDireccion(e.target.value)}/>
          <label style={lbl}>Distrito</label>
          <input style={{ ...inp, marginBottom:10 }} value={distrito} onChange={e=>setDistrito(e.target.value)}/>
          <button onClick={reintentarUbicacion} disabled={ubicando}
            style={{ width:"100%", background:"#D46A08",
              border:"none", color:"#fff", padding:10, borderRadius:8,
              fontSize:12, fontWeight:800, cursor: ubicando?"default":"pointer", marginBottom:14 }}>
            {ubicando ? "Buscando ubicación..." : "Guardar dirección y reintentar ubicación"}
          </button>

          <div style={{ borderTop:`1px solid ${B.border}`, paddingTop:12 }}>
            <label style={lbl}>O ingresa las coordenadas manualmente (ej. copiadas de Google Maps)</label>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:8 }}>
              <input style={inp} placeholder="Latitud" value={latManual} onChange={e=>setLatManual(e.target.value)}/>
              <input style={inp} placeholder="Longitud" value={lngManual} onChange={e=>setLngManual(e.target.value)}/>
            </div>
            <BtnSec onClick={guardarManual} style={{ width:"100%" }}>Guardar coordenadas manuales</BtnSec>
          </div>
        </div>

        <div style={{ display:"flex", justifyContent:"flex-end", marginTop:20 }}>
          <BtnSec onClick={onClose}>Cerrar</BtnSec>
        </div>
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

