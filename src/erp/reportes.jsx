// BOAZ ERP — módulo "reportes" (parte de BoazERP; ver src/BoazERP.jsx)
import { useState, useEffect, useCallback, useRef, useMemo, Fragment } from "react";
import { Ayuda, B, BtnPri, BtnSec, Ico, Kpi, Tabs, fmt, inp, lbl, sb } from "./base.jsx";
import { ModalTarifarioCliente, ModalTarifarioEstandar, ModalTarifarioVehiculo, ModalTarifarioVehiculoEstandar, ModalTarifarioViaje, modalidadesDe } from "./clientes.jsx";
import { TIPOS_SERVICIO } from "./ventas.jsx";

export function rangoPeriodo(periodo, fechaInicio, fechaFin) {
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  if (periodo==="hoy") return [hoy, new Date()];
  if (periodo==="semana") {
    const dia = hoy.getDay();
    const diff = hoy.getDate() - dia + (dia===0 ? -6 : 1);
    const inicio = new Date(hoy); inicio.setDate(diff);
    return [inicio, new Date()];
  }
  if (periodo==="mes") {
    const inicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    return [inicio, new Date()];
  }
  const inicio = fechaInicio ? new Date(fechaInicio+"T00:00:00") : hoy;
  const fin = fechaFin ? new Date(fechaFin+"T23:59:59") : new Date();
  return [inicio, fin];
}

export function DonutChart({ segments, size=150 }) {
  const total = segments.reduce((a,s)=>a+s.value,0);
  const r = size/2 - 16, c = size/2, circunferencia = 2*Math.PI*r;
  let acc = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={c} cy={c} r={r} fill="none" stroke="#F1F5F9" strokeWidth={18}/>
      {total>0 && segments.filter(s=>s.value>0).map((s,i)=>{
        const frac = s.value/total;
        const dash = frac*circunferencia;
        const offset = -acc*circunferencia;
        acc += frac;
        return (
          <circle key={i} cx={c} cy={c} r={r} fill="none" stroke={s.color} strokeWidth={18}
            strokeDasharray={`${dash} ${circunferencia-dash}`} strokeDashoffset={offset}
            transform={`rotate(-90 ${c} ${c})`}/>
        );
      })}
      <text x={c} y={c-4} textAnchor="middle" fontSize="22" fontWeight="900" fill={B.navy}>{total}</text>
      <text x={c} y={c+16} textAnchor="middle" fontSize="10" fill={B.textMut}>pedidos</text>
    </svg>
  );
}

export function BarraHorizontal({ label, valor, max, color }) {
  const pct = max>0 ? Math.max(4, (valor/max*100)) : 0;
  return (
    <div style={{ marginBottom:10 }}>
      <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, marginBottom:4 }}>
        <span style={{ color:B.textSec, fontWeight:600 }}>{label}</span>
        <span style={{ color:B.navy, fontWeight:800 }}>{valor}</span>
      </div>
      <div style={{ background:"#F1F5F9", borderRadius:6, height:9, overflow:"hidden" }}>
        <div style={{ width:`${pct}%`, height:"100%", background:color, borderRadius:6 }}/>
      </div>
    </div>
  );
}

export function SerieDiaria({ datos }) {
  const max = Math.max(1, ...datos.map(d=>d.total));
  return (
    <div style={{ display:"flex", gap:8, alignItems:"flex-end", height:150, overflowX:"auto", paddingBottom:28 }}>
      {datos.map((d,i)=>(
        <div key={i} style={{ display:"flex", flexDirection:"column", alignItems:"center", minWidth:32, position:"relative" }}>
          <div style={{ fontSize:10, color:B.textMut, marginBottom:4, fontWeight:700 }}>{d.total}</div>
          <div style={{ width:20, height: Math.max(4, d.total/max*100), borderRadius:"5px 5px 0 0",
            background:"#DCE3ED", position:"relative", overflow:"hidden" }}>
            <div style={{ position:"absolute", bottom:0, left:0, width:"100%",
              height: d.total ? `${(d.entregados/d.total*100)}%` : "0%", background:B.green }}/>
          </div>
          <div style={{ fontSize:9, color:B.textMut, marginTop:6, whiteSpace:"nowrap",
            position:"absolute", top:"100%", transform:"rotate(-35deg)", transformOrigin:"top left" }}>{d.label}</div>
        </div>
      ))}
    </div>
  );
}

export function Reportes({ pedidos, repartidores, empresas, toast, onIr }) {
  const [periodo, setPeriodo] = useState("hoy");
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [empresaLiq, setEmpresaLiq] = useState("");
  const [generando, setGenerando] = useState(false);

  const [inicio, fin] = rangoPeriodo(periodo, fechaInicio, fechaFin);
  const filtrados = pedidos.filter(p => {
    const f = new Date(p.created_at);
    return f >= inicio && f <= fin;
  });

  const entregados = filtrados.filter(p=>p.estado==="entregado");
  const noEntregados = filtrados.filter(p=>p.estado==="no_entregado");
  const enRuta = filtrados.filter(p=>p.estado==="en_ruta");
  const asignados = filtrados.filter(p=>p.estado==="asignado");
  const sinAsignar = filtrados.filter(p=>p.estado==="sin_asignar");
  const finalizados = entregados.length + noEntregados.length;
  const efectividad = finalizados>0 ? Math.round(entregados.length/finalizados*100) : 0;
  const ingresoTotal = filtrados.reduce((a,p)=>a+(parseFloat(p.tarifa_s)||0),0);

  const codPedidos = filtrados.filter(p=>p.cobro_destino);
  const codCobrado = entregados.filter(p=>p.cobro_destino).reduce((a,p)=>a+(parseFloat(p.monto_cobrar)||0),0);
  const codPendiente = codPedidos.filter(p=>p.estado!=="entregado").reduce((a,p)=>a+(parseFloat(p.monto_cobrar)||0),0);

  const porDistrito = {};
  filtrados.forEach(p=>{ const d=p.dest_distrito||"Sin distrito"; porDistrito[d]=(porDistrito[d]||0)+1; });
  const topDistritos = Object.entries(porDistrito).sort((a,b)=>b[1]-a[1]).slice(0,6);
  const maxDistrito = topDistritos.length ? topDistritos[0][1] : 0;

  const porServicio = { same_day:0, next_day:0, sin_definir:0 };
  filtrados.forEach(p=>{
    if (p.tipo_servicio==="same_day") porServicio.same_day++;
    else if (p.tipo_servicio==="next_day") porServicio.next_day++;
    else porServicio.sin_definir++;
  });

  const porDia = {};
  filtrados.forEach(p=>{
    const key = new Date(p.created_at).toISOString().slice(0,10);
    if (!porDia[key]) porDia[key] = { total:0, entregados:0 };
    porDia[key].total++;
    if (p.estado==="entregado") porDia[key].entregados++;
  });
  const serieDiaria = Object.entries(porDia).sort((a,b)=>a[0].localeCompare(b[0])).map(([key,v])=>({
    label: new Date(key+"T12:00:00").toLocaleDateString("es-PE",{day:"2-digit",month:"2-digit"}),
    total:v.total, entregados:v.entregados,
  }));

  const stats = repartidores.map(r => {
    const misP = filtrados.filter(p=>p.repartidor_id===r.id);
    const ent = misP.filter(p=>p.estado==="entregado").length;
    const noEnt = misP.filter(p=>p.estado==="no_entregado").length;
    const ingreso = misP.reduce((a,p)=>a+(parseFloat(p.tarifa_s)||0),0);
    return { ...r, total:misP.length, entregados:ent, noEntregados:noEnt,
      efectividad: misP.length?Math.round(ent/misP.length*100):0, ingreso };
  }).sort((a,b)=>b.total-a.total);

  const porZona = ["urbano","semi_urbano","periferico"].map(z=>({
    zona: z.replace("_"," "), count: filtrados.filter(p=>p.ambito===z).length,
    entregados: filtrados.filter(p=>p.ambito===z&&p.estado==="entregado").length,
    ingreso: filtrados.filter(p=>p.ambito===z).reduce((a,p)=>a+(parseFloat(p.tarifa_s)||0),0),
  }));

  const porCliente = empresas.map(e=>({
    ...e, count: filtrados.filter(p=>p.empresa_id===e.id).length,
    ingreso: filtrados.filter(p=>p.empresa_id===e.id).reduce((a,p)=>a+(parseFloat(p.tarifa_s)||0),0),
  })).sort((a,b)=>b.count-a.count);

  // ── Liquidación Documentaria (descargo de guías) ──
  const pedidosEmpresaLiq = empresaLiq ? filtrados.filter(p=>p.empresa_id===empresaLiq) : [];
  const incluidosLiquidacion = pedidosEmpresaLiq.filter(p=>p.estado==="entregado"||p.estado==="no_entregado");

  const descargarLiquidacionDocumentaria = async () => {
    if (!empresaLiq || incluidosLiquidacion.length===0) return;
    setGenerando(true);
    try {
      const ExcelJS = (await import("exceljs")).default;
      const NAVY="FF1B2A4A", GOLD="FFE8A33D", WHITE="FFFFFFFF",
        GREEN="FF1E7A34", RED="FFB00000", REDBG="FFFCE4E4", GRAY="FF808080", ZEBRA="FFF2F2F2",
        BORDER="FFD9DEE6";

      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Liquidación", { pageSetup:{ orientation:"landscape" } });
      ws.columns = [ {width:3}, {width:10}, {width:34}, {width:20}, {width:24}, {width:16}, {width:22}, {width:37} ];

      const setCell = (addr, value, opts={}) => {
        const cell = ws.getCell(addr);
        cell.value = value;
        cell.font = { bold: !!opts.bold, size: opts.size||10, color:{argb: opts.color||"FF000000"}, italic: !!opts.italic };
        if (opts.fill) cell.fill = { type:"pattern", pattern:"solid", fgColor:{argb:opts.fill} };
        cell.alignment = { horizontal: opts.align||"left", vertical:"middle", wrapText: !!opts.wrap };
        if (opts.border) cell.border = {
          top:{style:"thin",color:{argb:BORDER}}, left:{style:"thin",color:{argb:BORDER}},
          bottom:{style:"thin",color:{argb:BORDER}}, right:{style:"thin",color:{argb:BORDER}},
        };
        return cell;
      };

      ws.mergeCells("B1:H1"); setCell("B1","GRUPO BOAZ S.A.C.",{bold:true,size:18,color:WHITE,fill:NAVY});
      ws.getRow(1).height = 30;
      ws.mergeCells("B2:H2"); setCell("B2","Con Boaz, tu negocio no para",{size:10,color:GOLD,fill:NAVY});
      ws.getRow(2).height = 18;
      ws.mergeCells("B3:H3");
      setCell("B3","RUC 20613172301  |  El Agustino, Lima  |  +51 960 622 471  |  contacto@boaz.com.pe  |  www.boaz.com.pe",{size:9,color:WHITE,fill:NAVY});
      ws.getRow(3).height = 16;

      const tiposPresentes = [...new Set(incluidosLiquidacion.map(p=>TIPOS_SERVICIO[p.tipo_servicio]?.label).filter(Boolean))];
      const tituloServicio = tiposPresentes.length===1 ? ` - ${tiposPresentes[0].toUpperCase()}` : "";
      ws.mergeCells("B5:H5");
      setCell("B5",`LIQUIDACIÓN DOCUMENTARIA DE ENTREGAS${tituloServicio}`,{bold:true,size:13,color:NAVY});
      ws.getRow(5).height = 22;
      ws.mergeCells("B6:H6");
      setCell("B6","(Documento de descargo de guías - sin valorización)",{size:9,color:GRAY,italic:true});

      const numLiquidacion = `LIQ-DOC-BOAZ-${new Date().toISOString().slice(0,10).replace(/-/g,"")}-${Math.random().toString(36).slice(2,5).toUpperCase()}`;
      const rangoTxt = `${inicio.toLocaleDateString("es-PE")} — ${fin.toLocaleDateString("es-PE")}`;
      const empresaObj = empresas.find(e=>e.id===empresaLiq);
      const nombreEmpresa = empresaObj?.nombre || "—";
      const destinosUnicos = new Set(incluidosLiquidacion.map(p=>p.dest_nombre)).size;
      const tipoServicioTxt = tiposPresentes.join(" / ") || "—";

      setCell("B8","N° Liquidación:",{bold:true,color:NAVY}); setCell("C8",numLiquidacion);
      setCell("E8","Periodo:",{bold:true,color:NAVY}); setCell("F8",rangoTxt);
      setCell("B9","Cliente:",{bold:true,color:NAVY});
      setCell("C9",`${empresaObj?.codigo_interno ? empresaObj.codigo_interno+" — " : ""}${nombreEmpresa}`);
      setCell("E9","Fecha de generación:",{bold:true,color:NAVY}); setCell("F9",new Date().toLocaleDateString("es-PE"));
      setCell("B10","Destinatarios:",{bold:true,color:NAVY});
      setCell("C10",`${destinosUnicos} destinatario(s) — ${incluidosLiquidacion.length} punto(s) de entrega`);
      setCell("E10","Tipo de servicio:",{bold:true,color:NAVY}); setCell("F10",tipoServicioTxt);

      const headers = ["N°","Punto","Distrito","Guía de Remisión / N° Orden","Fecha de Entrega","Estado","Observaciones"];
      const headerRow = 13;
      headers.forEach((h,i)=>{
        const col = String.fromCharCode("B".charCodeAt(0)+i);
        setCell(`${col}${headerRow}`, h, {bold:true,color:WHITE,fill:NAVY,border:true});
      });
      ws.getRow(headerRow).height = 28;

      incluidosLiquidacion.forEach((p,i)=>{
        const row = headerRow+1+i;
        const esNoEntregado = p.estado==="no_entregado";
        const fill = esNoEntregado ? REDBG : (i%2===1 ? ZEBRA : null);
        const vals = [
          i+1,
          p.dest_nombre||"—",
          p.dest_distrito||"—",
          p.cliente_referencia || p.omd,
          p.fecha_entrega ? new Date(p.fecha_entrega).toLocaleDateString("es-PE") : "—",
          esNoEntregado ? "No entregado" : "Entregado",
          esNoEntregado ? (p.motivo_no_entrega||"") : "",
        ];
        vals.forEach((v,ci)=>{
          const col = String.fromCharCode("B".charCodeAt(0)+ci);
          const opts = { fill: fill||undefined, border:true, wrap: ci===6 };
          if (ci===5) { opts.bold=true; opts.color = esNoEntregado?RED:GREEN; }
          if (ci===6 && esNoEntregado) opts.color = RED;
          setCell(`${col}${row}`, v, opts);
        });
      });

      let r = headerRow+1+incluidosLiquidacion.length+2;
      ws.mergeCells(`B${r}:H${r}`); setCell(`B${r}`,"RESUMEN DE DESCARGO",{bold:true,size:11,color:NAVY}); r++;
      setCell(`B${r}`,"Total de guías / puntos",{bold:true,color:NAVY}); setCell(`D${r}`,incluidosLiquidacion.length); r++;
      setCell(`B${r}`,"Total entregados",{bold:true,color:NAVY}); setCell(`D${r}`,incluidosLiquidacion.filter(p=>p.estado==="entregado").length); r++;
      setCell(`B${r}`,"Total no entregados",{bold:true,color:NAVY}); setCell(`D${r}`,incluidosLiquidacion.filter(p=>p.estado==="no_entregado").length); r+=2;

      ws.mergeCells(`B${r}:H${r}`);
      setCell(`B${r}`,"CARGO DE RECEPCIÓN DE LIQUIDACIÓN",{bold:true,size:11,color:WHITE,fill:NAVY});
      ws.getRow(r).height = 22; r++;
      ws.mergeCells(`B${r}:H${r}`);
      setCell(`B${r}`,`Declaro haber recibido de Grupo Boaz S.A.C. el presente documento de liquidación, con las ${incluidosLiquidacion.length} guías/puntos y sus respectivas observaciones detalladas.`,{size:8,color:GRAY,wrap:true});
      ws.getRow(r).height = 26; r+=2;

      ["Recibido por (nombre):","Cargo:","Empresa:","Fecha de recepción:","Firma / Sello:"].forEach(label=>{
        setCell(`B${r}`,label,{bold:true,color:NAVY});
        ws.mergeCells(`D${r}:F${r}`);
        setCell(`D${r}`,"________________________________");
        r++;
      });
      r++;
      ws.mergeCells(`B${r}:H${r}`);
      setCell(`B${r}`,`Nota: documento de descargo operativo, sin valorización económica. Periodo: ${rangoTxt}.`,{size:8,color:GRAY,italic:true});

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${numLiquidacion}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast?.("Liquidación generada ✓");
    } catch (err) {
      toast?.("Error al generar: "+err.message,"error");
    } finally {
      setGenerando(false);
    }
  };

  const PRESETS = [
    { id:"hoy", label:"Hoy" },
    { id:"semana", label:"Esta semana" },
    { id:"mes", label:"Este mes" },
    { id:"personalizado", label:"Rango personalizado" },
  ];

  return (
    <div>
      {/* Selector de periodo */}
      <Tabs valor={periodo} onChange={setPeriodo} tabs={PRESETS.map(p=>({ id:p.id, l:p.label }))} style={{ marginBottom:8 }}/>
      {periodo==="personalizado" && (
        <div style={{ display:"flex", gap:10, marginBottom:16, marginTop:10 }}>
          <input type="date" style={inp} value={fechaInicio} onChange={e=>setFechaInicio(e.target.value)}/>
          <span style={{ alignSelf:"center", color:B.textMut, fontSize:12 }}>hasta</span>
          <input type="date" style={inp} value={fechaFin} onChange={e=>setFechaFin(e.target.value)}/>
        </div>
      )}
      <div style={{ fontSize:12, color:B.textMut, margin:"10px 0 20px" }}>
        Mostrando {filtrados.length} pedido{filtrados.length===1?"":"s"} entre{" "}
        {inicio.toLocaleDateString("es-PE",{day:"numeric",month:"short"})} y {fin.toLocaleDateString("es-PE",{day:"numeric",month:"short"})}
      </div>

      {/* KPIs principales */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(6,1fr)", gap:14, marginBottom:20 }}>
        {[
          { icon:"package", label:"Total pedidos", value: filtrados.length, color:B.navy },
          { icon:"check", label:"Entregados", value: entregados.length, sub: finalizados>0?`${efectividad}% efect.`:null, color:B.green },
          { icon:"alert", label:"No entregados", value: noEntregados.length, color:B.red },
          { icon:"bike", label:"En ruta", value: enRuta.length, color:"#7C3AED" },
          { icon:"clock", label:"Por asignar/asig.", value: sinAsignar.length+asignados.length, color:B.gold },
          { icon:"dollar", label:"Ingreso periodo", value: fmt.sol(ingresoTotal), color:B.goldDk, big:true },
        ].map((k,i)=><Kpi key={i} icon={k.icon} label={k.label} valor={k.value} sub={k.sub} color={k.color}/>)}
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:14 }}>
        {/* Estado: donut */}
        <div style={{ background:B.white, border:`1px solid ${B.border}`, borderRadius:12,
          padding:20, boxShadow:"0 1px 2px #0D1E3D0D" }}>
          <div style={{ fontSize:13, fontWeight:700, color:B.navy, marginBottom:16 }}>Distribución por estado</div>
          <div style={{ display:"flex", alignItems:"center", gap:20 }}>
            <DonutChart segments={[
              { value:entregados.length, color:B.green },
              { value:noEntregados.length, color:B.red },
              { value:enRuta.length, color:"#7C3AED" },
              { value:asignados.length, color:"#D97706" },
              { value:sinAsignar.length, color:"#3B82F6" },
            ]}/>
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {[
                ["Entregados",entregados.length,B.green],
                ["No entregados",noEntregados.length,B.red],
                ["En ruta",enRuta.length,"#7C3AED"],
                ["Asignados",asignados.length,"#D97706"],
                ["Sin asignar",sinAsignar.length,"#3B82F6"],
              ].map(([label,val,color])=>(
                <div key={label} style={{ display:"flex", alignItems:"center", gap:8, fontSize:12 }}>
                  <span style={{ width:10, height:10, borderRadius:3, background:color, display:"inline-block" }}/>
                  <span style={{ color:B.textSec }}>{label}</span>
                  <span style={{ fontWeight:800, color:B.navy, marginLeft:"auto" }}>{val}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* COD */}
        <div style={{ background:B.white, border:`1px solid ${B.border}`, borderRadius:12,
          padding:20, boxShadow:"0 1px 2px #0D1E3D0D" }}>
          <div style={{ fontSize:13, fontWeight:700, color:B.navy, marginBottom:16 }}>Cobros en destino (COD)</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
            <div><div style={{ fontSize:10, color:B.textMut, textTransform:"uppercase" }}>Pedidos COD</div>
              <div style={{ fontSize:22, fontWeight:900, color:B.navy }}>{codPedidos.length}</div></div>
            <div><div style={{ fontSize:10, color:B.textMut, textTransform:"uppercase" }}>Cobrado</div>
              <div style={{ fontSize:22, fontWeight:900, color:B.green }}>{fmt.sol(codCobrado)}</div></div>
            <div style={{ gridColumn:"1/-1" }}><div style={{ fontSize:10, color:B.textMut, textTransform:"uppercase" }}>Pendiente por cobrar</div>
              <div style={{ fontSize:22, fontWeight:900, color:"#C2410C" }}>{fmt.sol(codPendiente)}</div></div>
          </div>
          {onIr && <button onClick={()=>onIr("cobranza")} style={{ marginTop:14, background:"none", border:"none", color:B.blue, fontSize:12, fontWeight:700, cursor:"pointer", padding:0 }}>Gestionar rendición en Cobranza →</button>}
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:14 }}>
        <div style={{ background:B.white, border:`1px solid ${B.border}`, borderRadius:12,
          padding:20, boxShadow:"0 1px 2px #0D1E3D0D" }}>
          <div style={{ fontSize:13, fontWeight:700, color:B.navy, marginBottom:16 }}>Top distritos</div>
          {topDistritos.map(([d,v])=>(
            <BarraHorizontal key={d} label={d} valor={v} max={maxDistrito} color={B.gold}/>
          ))}
          {topDistritos.length===0 && <div style={{ fontSize:12, color:B.textMut, textAlign:"center", padding:10 }}>Sin pedidos con distrito en este período. Al registrar pedidos indica el distrito para ver aquí dónde entregas más.</div>}
        </div>
        <div style={{ background:B.white, border:`1px solid ${B.border}`, borderRadius:12,
          padding:20, boxShadow:"0 1px 2px #0D1E3D0D" }}>
          <div style={{ fontSize:13, fontWeight:700, color:B.navy, marginBottom:16 }}>Tipo de servicio</div>
          <BarraHorizontal label="Same Day" valor={porServicio.same_day} max={filtrados.length} color="#7C3AED"/>
          <BarraHorizontal label="Next Day" valor={porServicio.next_day} max={filtrados.length} color="#0369A1"/>
          <BarraHorizontal label="Sin definir" valor={porServicio.sin_definir} max={filtrados.length} color={B.textMut}/>
        </div>
      </div>

      {serieDiaria.length>1 && (
        <div style={{ background:B.white, border:`1px solid ${B.border}`, borderRadius:12,
          padding:20, boxShadow:"0 1px 2px #0D1E3D0D", marginBottom:14 }}>
          <div style={{ fontSize:13, fontWeight:700, color:B.navy, marginBottom:6 }}>Tendencia diaria</div>
          <div style={{ fontSize:11, color:B.textMut, marginBottom:10 }}>
            <span style={{ color:B.green, fontWeight:700 }}>■</span> Entregados · Barra completa = total del día
          </div>
          <SerieDiaria datos={serieDiaria}/>
        </div>
      )}

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:14 }}>
        {/* Por repartidor */}
        <div style={{ background:B.white, border:`1px solid ${B.border}`,
          borderRadius:12, overflow:"hidden", boxShadow:"0 1px 2px #0D1E3D0D" }}>
          <div style={{ padding:"14px 18px", borderBottom:`1px solid ${B.border}`,
            fontSize:13, fontWeight:700, color:B.navy }}>Rendimiento por repartidor</div>
          <table style={{ width:"100%", borderCollapse:"collapse" }}>
            <thead><tr style={{ background:"#F6F9FC" }}>
              {["Repartidor","Total","Entregados","No entreg.","Efectividad","Ingresos"].map(h=>(
                <th key={h} style={{ padding:"8px 12px", textAlign:"left", fontSize:10,
                  color:B.textMut, fontWeight:700 }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {stats.map((r,i)=>(
                <tr key={r.id} style={{ borderTop:`1px solid ${B.border}`,
                  background:B.white }}>
                  <td style={{ padding:"10px 12px", fontSize:12, fontWeight:600, color:B.navy }}>
                    {r.nombres} {r.apellidos}
                  </td>
                  <td style={{ padding:"10px 12px", fontSize:12, fontWeight:700, color:B.navy }}>{r.total}</td>
                  <td style={{ padding:"10px 12px", fontSize:12, color:B.green, fontWeight:700 }}>{r.entregados}</td>
                  <td style={{ padding:"10px 12px", fontSize:12, color:B.red }}>{r.noEntregados}</td>
                  <td style={{ padding:"10px 12px" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                      <div style={{ flex:1, height:6, background:B.bg, borderRadius:3 }}>
                        <div style={{ width:`${r.efectividad}%`, height:"100%",
                          background:r.efectividad>=80?B.green:r.efectividad>=60?B.gold:B.red,
                          borderRadius:3 }}/>
                      </div>
                      <span style={{ fontSize:11, fontWeight:700, color:B.textPri, minWidth:32 }}>{r.efectividad}%</span>
                    </div>
                  </td>
                  <td style={{ padding:"10px 12px", fontSize:12, fontWeight:600, color:B.navy }}>{fmt.sol(r.ingreso)}</td>
                </tr>
              ))}
              {stats.length===0&&<tr><td colSpan={6} style={{ padding:24, textAlign:"center",
                color:B.textMut }}>Sin entregas de repartidores en este período. Cambia las fechas arriba o asigna pedidos en Pedidos.</td></tr>}
            </tbody>
          </table>
        </div>

        {/* Por zona */}
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          <div style={{ background:B.white, border:`1px solid ${B.border}`,
            borderRadius:12, overflow:"hidden", boxShadow:"0 1px 2px #0D1E3D0D" }}>
            <div style={{ padding:"14px 18px", borderBottom:`1px solid ${B.border}`,
              fontSize:13, fontWeight:700, color:B.navy }}>Pedidos por zona</div>
            <div style={{ padding:16 }}>
              {porZona.map(z=>(
                <div key={z.zona} style={{ marginBottom:14 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                    <span style={{ fontSize:12, color:B.textPri, fontWeight:600, textTransform:"capitalize" }}>{z.zona}</span>
                    <span style={{ fontSize:12, fontWeight:800, color:B.gold }}>{z.count} pedidos · {fmt.sol(z.ingreso)}</span>
                  </div>
                  <div style={{ height:8, background:B.bg, borderRadius:4 }}>
                    <div style={{ width: filtrados.length?`${(z.count/filtrados.length)*100}%`:"0%",
                      height:"100%", background:B.gold, borderRadius:4 }}/>
                  </div>
                  <div style={{ fontSize:10, color:B.textMut, marginTop:2 }}>{z.entregados} entregados</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ background:B.white, border:`1px solid ${B.border}`,
            borderRadius:12, overflow:"hidden", boxShadow:"0 1px 2px #0D1E3D0D", flex:1 }}>
            <div style={{ padding:"14px 18px", borderBottom:`1px solid ${B.border}`,
              fontSize:13, fontWeight:700, color:B.navy }}>Top clientes</div>
            <div style={{ padding:14 }}>
              {porCliente.slice(0,5).map(c=>(
                <div key={c.id} style={{ display:"flex", alignItems:"center", gap:10,
                  padding:"8px 0", borderBottom:`1px solid ${B.border}` }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:12, color:B.textPri, fontWeight:600 }}>
                      {c.codigo_interno && <span style={{ color:B.gold, marginRight:4 }}>{c.codigo_interno}</span>}
                      {c.nombre}
                    </div>
                    <div style={{ fontSize:10, color:B.textMut }}>{c.count} pedidos</div>
                  </div>
                  <div style={{ fontSize:13, fontWeight:800, color:B.navy }}>{fmt.sol(c.ingreso)}</div>
                </div>
              ))}
              {porCliente.length===0&&<div style={{ padding:20, textAlign:"center",
                color:B.textMut, fontSize:12 }}>Sin clientes</div>}
            </div>
          </div>
        </div>
      </div>

      {/* Liquidación Documentaria */}
      <div style={{ background:B.white, border:`1px solid ${B.border}`, borderRadius:12,
        padding:20, boxShadow:"0 1px 2px #0D1E3D0D" }}>
        <div style={{ fontSize:13, fontWeight:700, color:B.navy, marginBottom:14 }}>Liquidación Documentaria (descargo de guías)</div>
        <div style={{ display:"flex", gap:12, alignItems:"flex-end", flexWrap:"wrap" }}>
          <div style={{ minWidth:260 }}>
            <label style={lbl}>Cliente</label>
            <select style={inp} value={empresaLiq} onChange={e=>setEmpresaLiq(e.target.value)}>
              <option value="">— Selecciona un cliente —</option>
              {empresas.map(e=><option key={e.id} value={e.id}>{e.codigo_interno ? `${e.codigo_interno} — ` : ""}{e.nombre}</option>)}
            </select>
          </div>
          <BtnPri onClick={descargarLiquidacionDocumentaria}
            disabled={!empresaLiq || incluidosLiquidacion.length===0 || generando}>
            {generando ? "Generando..." : "Descargar Excel"}
          </BtnPri>
          {empresaLiq && (
            <div style={{ fontSize:12, color:B.textMut }}>
              {incluidosLiquidacion.length} pedido{incluidosLiquidacion.length===1?"":"s"} finalizado{incluidosLiquidacion.length===1?"":"s"} de este cliente en el periodo seleccionado
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// MÓDULO 8: CONFIGURACIÓN
// ══════════════════════════════════════════════════════════════
export function ModalLineaNegocio({ onClose, onSaved, toast }) {
  const [f, setF] = useState({ codigo:"", nombre:"", descripcion:"" });

  const guardar = async () => {
    if (!f.codigo || !f.nombre) { toast("Código y nombre son obligatorios","error"); return; }
    const { error } = await sb.from("lineas_negocio").insert([{ ...f, activo:true }]);
    if (error) { toast("Error: "+error.message,"error"); return; }
    toast("Línea de negocio creada ✓");
    onSaved();
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"#0008", zIndex:1000,
      display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ background:B.white, borderRadius:16, padding:28, width:460,
        boxShadow:"0 20px 60px #0003" }}>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:20 }}>
          <div style={{ fontSize:15, fontWeight:800, color:B.navy }}>Nueva línea de negocio</div>
          <button onClick={onClose} style={{ background:"none", border:"none", fontSize:18,
            color:B.textSec, cursor:"pointer" }}>✕</button>
        </div>
        <label style={lbl}>Código (ej. LOG-TC)</label>
        <input style={{ ...inp, marginBottom:12, textTransform:"uppercase" }} value={f.codigo}
          onChange={e=>setF(p=>({...p,codigo:e.target.value.toUpperCase()}))}/>
        <label style={lbl}>Nombre</label>
        <input style={{ ...inp, marginBottom:12 }} value={f.nombre}
          onChange={e=>setF(p=>({...p,nombre:e.target.value}))}/>
        <label style={lbl}>Descripción (opcional)</label>
        <input style={{ ...inp, marginBottom:20 }} value={f.descripcion}
          onChange={e=>setF(p=>({...p,descripcion:e.target.value}))}/>
        <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
          <BtnSec onClick={onClose}>Cancelar</BtnSec>
          <BtnPri onClick={guardar}>Registrar</BtnPri>
        </div>
      </div>
    </div>
  );
}

export function ModalTipoServicio({ lineaNegocioId, lineasNegocio, onClose, onSaved, toast }) {
  const [f, setF] = useState({
    linea_negocio_id: lineaNegocioId, codigo:"", nombre:"", unidad_medida:"unidad", tarifa_base:"",
  });

  const guardar = async () => {
    if (!f.codigo || !f.nombre || !f.linea_negocio_id) { toast("Completa línea, código y nombre","error"); return; }
    const { error } = await sb.from("tipos_servicio").insert([{
      ...f, tarifa_base: parseFloat(f.tarifa_base)||null, activo:true,
    }]);
    if (error) { toast("Error: "+error.message,"error"); return; }
    toast("Tipo de servicio creado ✓");
    onSaved();
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"#0008", zIndex:1000,
      display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ background:B.white, borderRadius:16, padding:28, width:460,
        boxShadow:"0 20px 60px #0003" }}>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:20 }}>
          <div style={{ fontSize:15, fontWeight:800, color:B.navy }}>Nuevo tipo de servicio</div>
          <button onClick={onClose} style={{ background:"none", border:"none", fontSize:18,
            color:B.textSec, cursor:"pointer" }}>✕</button>
        </div>
        <label style={lbl}>Línea de negocio</label>
        <select style={{ ...inp, marginBottom:12 }} value={f.linea_negocio_id}
          onChange={e=>setF(p=>({...p,linea_negocio_id:e.target.value}))}>
          <option value="">— Selecciona —</option>
          {lineasNegocio.map(ln=><option key={ln.id} value={ln.id}>{ln.codigo} — {ln.nombre}</option>)}
        </select>
        <label style={lbl}>Código (ej. TC-UNI)</label>
        <input style={{ ...inp, marginBottom:12, textTransform:"uppercase" }} value={f.codigo}
          onChange={e=>setF(p=>({...p,codigo:e.target.value.toUpperCase()}))}/>
        <label style={lbl}>Nombre</label>
        <input style={{ ...inp, marginBottom:12 }} value={f.nombre}
          onChange={e=>setF(p=>({...p,nombre:e.target.value}))}/>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:20 }}>
          <div>
            <label style={lbl}>Unidad de medida</label>
            <select style={inp} value={f.unidad_medida} onChange={e=>setF(p=>({...p,unidad_medida:e.target.value}))}>
              <option value="unidad">Unidad</option>
              <option value="dia">Día</option>
              <option value="entrega">Entrega</option>
              <option value="km">Kilómetro</option>
              <option value="hora">Hora</option>
              <option value="viaje">Viaje</option>
              <option value="servicio">Servicio (cotizado)</option>
            </select>
          </div>
          <div>
            <label style={lbl}>Tarifa base S/ (opcional)</label>
            <input type="number" style={inp} value={f.tarifa_base}
              onChange={e=>setF(p=>({...p,tarifa_base:e.target.value}))}/>
          </div>
        </div>
        <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
          <BtnSec onClick={onClose}>Cancelar</BtnSec>
          <BtnPri onClick={guardar}>Registrar</BtnPri>
        </div>
      </div>
    </div>
  );
}

export function Configuracion({ onRefresh, toast }) {
  const ZONAS = {
    urbano: ["Lima","Barranco","Breña","Chorrillos","El Agustino","Jesús María","La Victoria","Lince","Magdalena del Mar","Miraflores","Pueblo Libre","Rímac","San Borja","San Isidro","San Luis","San Miguel","Santiago de Surco","Surquillo"],
    semi_urbano: ["Callao","Bellavista","Carmen de la Legua Reynoso","La Perla","La Punta","Ate","Independencia","La Molina","Los Olivos","San Juan de Lurigancho","San Juan de Miraflores","San Martín de Porres","Santa Anita","Villa El Salvador","Villa María del Triunfo"],
    periferico: ["Comas","Ventanilla","Mi Perú","Ancón","Carabayllo","Chaclacayo","Cieneguilla","Lurigancho-Chosica","Lurín","Pachacámac","Puente Piedra"],
  };

  return (
    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
      {/* Datos empresa */}
      <div style={{ background:B.white, border:`1px solid ${B.border}`,
        borderRadius:12, padding:20, boxShadow:"0 1px 2px #0D1E3D0D", gridColumn:"span 2" }}>
        <div style={{ fontSize:14, fontWeight:800, color:B.navy, marginBottom:16,
          paddingBottom:8, borderBottom:`2px solid ${B.gold}` }}>Datos de Grupo Boaz S.A.C.</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14 }}>
          {[
            ["Razón Social","Grupo Boaz S.A.C."],
            ["RUC","20613172301"],
            ["Régimen","RMT"],
            ["Teléfono","+51 960 622 471"],
            ["Email","contacto@boaz.com.pe"],
            ["Web","www.boaz.com.pe"],
            ["Dirección","El Agustino, Lima"],
            ["Tagline","Con Boaz, tu negocio no para"],
          ].map(([k,v])=>(
            <div key={k}>
              <div style={{ fontSize:10, color:B.textMut, textTransform:"uppercase",
                letterSpacing:"0.7px", marginBottom:4 }}>{k}</div>
              <div style={{ fontSize:13, fontWeight:600, color:B.textPri }}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Zonas */}
      <div style={{ background:B.white, border:`1px solid ${B.border}`,
        borderRadius:12, padding:20, boxShadow:"0 1px 2px #0D1E3D0D", gridColumn:"span 2" }}>
        <div style={{ fontSize:14, fontWeight:800, color:B.navy, marginBottom:16,
          paddingBottom:8, borderBottom:`2px solid ${B.gold}` }}>Zonas de cobertura</div>
        {Object.entries(ZONAS).map(([ambito,distritos])=>(
          <div key={ambito} style={{ marginBottom:16 }}>
            <div style={{ fontSize:11, fontWeight:700, color:B.navy, textTransform:"capitalize",
              marginBottom:6 }}>{ambito.replace("_"," ")}</div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>
              {distritos.map(d=>(
                <span key={d} style={{ fontSize:10, background:`${B.navy}10`,
                  color:B.navy, padding:"2px 8px", borderRadius:10,
                  border:`1px solid ${B.navy}22` }}>{d}</span>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div style={{ background:B.white, border:`1px solid ${B.border}`,
        borderRadius:12, padding:20, boxShadow:"0 1px 2px #0D1E3D0D", gridColumn:"span 2" }}>
        <div style={{ fontSize:14, fontWeight:800, color:B.navy, marginBottom:16,
          paddingBottom:8, borderBottom:`2px solid ${B.gold}` }}>Integraciones API</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12 }}>
          {[
            { name:"VTEX", desc:"Ecommerce enterprise", color:"#F71963", ready:false },
            { name:"Shopify", desc:"Ecommerce SMB", color:"#96BF48", ready:false },
            { name:"MercadoLibre", desc:"Marketplace", color:"#FFE600", ready:false },
            { name:"WhatsApp", desc:"Notificaciones", color:"#25D366", ready:false },
            { name:"WooCommerce", desc:"WordPress shops", color:"#7F54B3", ready:false },
            { name:"SUNAT", desc:"Facturación electrónica", color:"#E32027", ready:false },
            { name:"Google Maps", desc:"GPS y rutas", color:"#4285F4", ready:false },
            { name:"Webhook", desc:"Eventos en tiempo real", color:B.navy, ready:false },
          ].map(it=>(
            <div key={it.name} style={{ border:`1px solid ${B.border}`, borderRadius:10,
              padding:14, display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ width:36, height:36, borderRadius:8, background:`${it.color}22`,
                display:"flex", alignItems:"center", justifyContent:"center",
                fontSize:11, fontWeight:800, color:it.color }}>
                {it.name.slice(0,2)}
              </div>
              <div>
                <div style={{ fontSize:12, fontWeight:700, color:B.navy }}>{it.name}</div>
                <div style={{ fontSize:10, color:B.textMut }}>{it.desc}</div>
              </div>
              <span style={{ marginLeft:"auto", fontSize:9, padding:"2px 6px", borderRadius:6,
                background:"#FFF7ED", color:B.orange, fontWeight:700, border:`1px solid ${B.orange}44` }}>
                Pronto
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// MÓDULO: CATÁLOGO (Comercial) — tarifario Same Day genérico,
// líneas de negocio + tipos de servicio, y tarifarios negociados
// por cliente. Todo el tema de precios en un solo lugar.
// ══════════════════════════════════════════════════════════════
export function Catalogo({ tarifasDistrito=[], lineasNegocio, tiposServicio, tarifarioEstandar, tarifarioVehiculoEstandar, recargoFeriadoPct, empresas=[], tarifariosCliente=[], tarifarioVehiculoCliente=[], tarifasViajeCliente=[], tarifarioViajeEstandar=[], onRefresh, toast }) {
  const [modalTarCli, setModalTarCli] = useState(null);
  const [modalTarVeh, setModalTarVeh] = useState(null);
  const [modalTarViaje, setModalTarViaje] = useState(null);
  const [modalViajeEstandar, setModalViajeEstandar] = useState(false);
  const [busqCli, setBusqCli] = useState("");
  const [modalLinea, setModalLinea] = useState(false);
  const [modalTipo, setModalTipo] = useState(null);
  const [modalTarifarioEstandar, setModalTarifarioEstandar] = useState(false);
  const [modalTarifarioVehiculoEstandar, setModalTarifarioVehiculoEstandar] = useState(false);
  const [tabEstandar, setTabEstandar] = useState("same_day");
  const [recargoInput, setRecargoInput] = useState(String(recargoFeriadoPct||0));
  const [guardandoRecargo, setGuardandoRecargo] = useState(false);

  const guardarRecargo = async () => {
    setGuardandoRecargo(true);
    const { data: fila } = await sb.from("configuracion_recargos").select("id").limit(1).maybeSingle();
    const payload = { recargo_feriado_pct: parseFloat(recargoInput)||0 };
    const { error } = fila
      ? await sb.from("configuracion_recargos").update(payload).eq("id", fila.id)
      : await sb.from("configuracion_recargos").insert([payload]);
    setGuardandoRecargo(false);
    if (error) { toast("Error: "+error.message, "error"); return; }
    toast("Recargo por feriado actualizado ✓");
    onRefresh();
  };

  const AMBITOS_LABEL = { urbano:"Urbano", semi_urbano:"Semi Urbano", periferico:"Periférico" };
  const TIPOS_VEHICULO_LABEL = { moto:"Moto", bicicleta:"Bicicleta", auto:"Auto", furgoneta:"Furgoneta", minivan:"Minivan", van:"Van", porter:"Porter" };
  const filaEstandar = (ambito, tipoServicio) =>
    tarifarioEstandar.find(t=>t.ambito===ambito && t.tipo_servicio===tipoServicio && t.activo);

  return (
    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
      {/* Tarifas por cliente (centralizado) */}
      <div style={{ background:B.white, border:`1px solid ${B.border}`, borderRadius:12, padding:20, boxShadow:"0 1px 2px #0D1E3D0D", gridColumn:"span 2" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12, paddingBottom:8, borderBottom:`2px solid ${B.gold}`, gap:12, flexWrap:"wrap" }}>
          <div style={{ fontSize:14, fontWeight:800, color:B.navy }}>Tarifas por cliente</div>
          <input style={{ ...inp, width:220 }} placeholder="Buscar cliente…" value={busqCli} onChange={e=>setBusqCli(e.target.value)}/>
        </div>
        <div style={{ maxHeight:320, overflowY:"auto" }}>
          {empresas.filter(e => !busqCli.trim() || (e.nombre||"").toLowerCase().includes(busqCli.trim().toLowerCase())).map(e => {
            const mods = modalidadesDe(e, tarifariosCliente, tarifarioVehiculoCliente, tarifasViajeCliente);
            const pill = (n, txt, onClick) => (
              <button onClick={onClick} style={{ fontSize:11, fontWeight:700, padding:"5px 12px", borderRadius:20, cursor:"pointer",
                border:`1px solid ${n>0?B.green:B.orange}`, background:n>0?"#ECFDF5":"#FFF7ED", color:n>0?B.green:B.orange }}>{txt}</button>);
            const aP = tarifariosCliente.filter(t=>t.empresa_id===e.id && t.activo).length;
            const aV = tarifarioVehiculoCliente.filter(t=>t.empresa_id===e.id && t.activo).length;
            const aJ = tarifasViajeCliente.filter(t=>t.empresa_id===e.id && t.activo).length;
            return (
              <div key={e.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 4px", borderBottom:`1px solid ${B.border}`, flexWrap:"wrap" }}>
                <div style={{ flex:"1 1 200px", fontSize:13, fontWeight:600, color:B.textPri }}>{e.nombre}</div>
                {mods.length===0 && <span style={{ fontSize:11, color:B.textMut, fontStyle:"italic" }}>Sin tarifario habilitado (se elige en Clientes → Editar)</span>}
                {mods.includes("pedido")   && pill(aP, `Por pedido: ${aP} tarifa${aP===1?"":"s"}`, ()=>setModalTarCli(e))}
                {mods.includes("vehiculo") && pill(aV, `Por vehículo: ${aV}`, ()=>setModalTarVeh(e))}
                {mods.includes("viaje")    && pill(aJ, `Por viaje: ${aJ} tarifa${aJ===1?"":"s"}`, ()=>setModalTarViaje(e))}
              </div>);
          })}
          {empresas.length===0 && <div style={{ fontSize:12, color:B.textMut, padding:12 }}>Sin clientes registrados</div>}
        </div>
      </div>
      {/* Recargo por feriados */}
      <div style={{ background:B.white, border:`1px solid ${B.border}`,
        borderRadius:12, padding:20, boxShadow:"0 1px 2px #0D1E3D0D", gridColumn:"span 2" }}>
        <div style={{ fontSize:14, fontWeight:800, color:B.navy, marginBottom:12,
          paddingBottom:8, borderBottom:`2px solid ${B.gold}` }}>Recargo por feriados<Ayuda k="recargo_feriado"/></div>
        <div style={{ fontSize:12, color:B.textMut, marginBottom:12 }}>
          Se aplica automáticamente sobre la tarifa/día de Transporte y Carga cuando un día marcado como activo en el calendario de servicio cae en un feriado oficial de Perú.
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <input type="number" step="0.1" value={recargoInput} onChange={e=>setRecargoInput(e.target.value)}
            style={{ ...inp, width:100 }}/>
          <span style={{ fontSize:13, color:B.textSec }}>% de recargo sobre la tarifa/día</span>
          <BtnPri onClick={guardarRecargo} disabled={guardandoRecargo} style={{ marginLeft:"auto", padding:"7px 14px", fontSize:12 }}>
            {guardandoRecargo?"Guardando...":"Guardar"}
          </BtnPri>
        </div>
      </div>

      {/* Tarifario estándar por pedido (editable) */}
      <div style={{ background:B.white, border:`1px solid ${B.border}`,
        borderRadius:12, padding:20, boxShadow:"0 1px 2px #0D1E3D0D" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
          marginBottom:12, paddingBottom:8, borderBottom:`2px solid ${B.gold}` }}>
          <div style={{ fontSize:14, fontWeight:800, color:B.navy }}>Tarifario estándar por pedido<Ayuda k="ambito"/></div>
          <button onClick={()=>setModalTarifarioEstandar(true)}
            style={{ fontSize:11, color:B.blue, background:"none", border:"none", cursor:"pointer", fontWeight:700 }}>
            <Ico n="edit" size={13} style={{ display:"inline-block", verticalAlign:"-2px", marginRight:5 }}/>Editar
          </button>
        </div>
        <div style={{ display:"flex", gap:6, marginBottom:12 }}>
          {[["same_day","Same Day"],["next_day","Next Day"],["especial","Especial"]].map(([id,label])=>(
            <button key={id} onClick={()=>setTabEstandar(id)}
              style={{ flex:1, padding:"6px 8px", borderRadius:8, fontSize:11, fontWeight:700, cursor:"pointer",
                border: tabEstandar===id ? `2px solid ${B.gold}` : `1px solid ${B.border}`,
                background: tabEstandar===id ? "#FFF7ED" : B.white,
                color: tabEstandar===id ? B.goldDk : B.textSec }}>
              {label}
            </button>
          ))}
        </div>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead>
            <tr style={{ background:"#F6F9FC" }}>
              {["Ámbito","XS (0-1kg)","S (1-3kg)","M (3-7kg)"].map(h=>(
                <th key={h} style={{ padding:"8px 12px", textAlign:"left", fontSize:11, color:B.textSec, fontWeight:700, letterSpacing:"0.3px", whiteSpace:"nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.keys(AMBITOS_LABEL).map((ambito,i)=>{
              const fila = filaEstandar(ambito, tabEstandar);
              return (
                <tr key={ambito} style={{ borderTop:`1px solid ${B.border}`,
                  background:B.white }}>
                  <td style={{ padding:"10px 12px", fontSize:12, fontWeight:600, color:B.navy }}>{AMBITOS_LABEL[ambito]}</td>
                  {fila ? (
                    <>
                      <td style={{ padding:"10px 12px", fontSize:13, fontWeight:700, color:B.gold }}>S/ {fila.tarifa_xs}</td>
                      <td style={{ padding:"10px 12px", fontSize:13, fontWeight:700, color:B.gold }}>S/ {fila.tarifa_s}</td>
                      <td style={{ padding:"10px 12px", fontSize:13, fontWeight:700, color:B.gold }}>S/ {fila.tarifa_m}</td>
                    </>
                  ) : (
                    <td colSpan={3} style={{ padding:"10px 12px", fontSize:11, color:B.textMut, fontStyle:"italic" }}>Sin definir aún</td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        <div style={{ fontSize:11, color:B.textMut, marginTop:10 }}>
          Punto de partida para negociar con cualquier cliente — cada uno puede tener el suyo propio ajustado (ver "Tarifarios negociados por cliente", con la opción "Cargar desde el estándar"). Tarifas sin IGV; +S/1 por kg extra sobre 7kg salvo que indiques otro monto al editar.
        </div>
      </div>

      {/* Tarifario estándar por unidad (transporte y carga) */}
      <div style={{ background:B.white, border:`1px solid ${B.border}`,
        borderRadius:12, padding:20, boxShadow:"0 1px 2px #0D1E3D0D" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
          marginBottom:16, paddingBottom:8, borderBottom:`2px solid ${B.gold}` }}>
          <div style={{ fontSize:14, fontWeight:800, color:B.navy }}>Tarifario estándar por unidad<Ayuda k="tarifa_dia"/></div>
          <button onClick={()=>setModalTarifarioVehiculoEstandar(true)}
            style={{ fontSize:11, color:B.blue, background:"none", border:"none", cursor:"pointer", fontWeight:700 }}>
            <Ico n="edit" size={13} style={{ display:"inline-block", verticalAlign:"-2px", marginRight:5 }}/>Editar
          </button>
        </div>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead>
            <tr style={{ background:"#F6F9FC" }}>
              {["Tipo de vehículo","Tarifa base (día)","Recargo periférico"].map(h=>(
                <th key={h} style={{ padding:"8px 12px", textAlign:"left", fontSize:11, color:B.textSec, fontWeight:700, letterSpacing:"0.3px", whiteSpace:"nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.keys(TIPOS_VEHICULO_LABEL).map((tv,i)=>{
              const fila = tarifarioVehiculoEstandar.find(t=>t.tipo_vehiculo===tv && t.activo);
              return (
                <tr key={tv} style={{ borderTop:`1px solid ${B.border}`,
                  background:B.white }}>
                  <td style={{ padding:"10px 12px", fontSize:12, fontWeight:600, color:B.navy }}>{TIPOS_VEHICULO_LABEL[tv]}</td>
                  {fila ? (
                    <>
                      <td style={{ padding:"10px 12px", fontSize:13, fontWeight:700, color:B.gold }}>S/ {fila.tarifa_base}</td>
                      <td style={{ padding:"10px 12px", fontSize:12, color:B.textSec }}>{fila.recargo_periferico>0?`+ S/ ${fila.recargo_periferico}`:"—"}</td>
                    </>
                  ) : (
                    <td colSpan={2} style={{ padding:"10px 12px", fontSize:11, color:B.textMut, fontStyle:"italic" }}>Sin definir aún</td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        <div style={{ fontSize:11, color:B.textMut, marginTop:10 }}>
          Tarifa por día según tipo de vehículo — punto de partida para clientes de Transporte y Carga (Deliverman, Globalia, etc.).
        </div>
      </div>

      {/* Tarifario estándar por viaje */}
      <div style={{ background:B.white, border:`1px solid ${B.border}`, borderRadius:12, padding:20, boxShadow:"0 1px 2px #0D1E3D0D", gridColumn:"span 2" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12, paddingBottom:8, borderBottom:`2px solid ${B.gold}` }}>
          <div style={{ fontSize:14, fontWeight:800, color:B.navy }}>Tarifario estándar por viaje<Ayuda k="modalidad"/></div>
          <button onClick={()=>setModalViajeEstandar(true)} style={{ fontSize:11, color:B.blue, background:"none", border:`1px solid ${B.border}`, borderRadius:8, padding:"5px 12px", cursor:"pointer", fontWeight:700 }}><Ico n="edit" size={13} style={{ display:"inline-block", verticalAlign:"-2px", marginRight:5 }}/>Editar</button>
        </div>
        {tarifarioViajeEstandar.filter(t=>t.activo).length===0 ? (
          <div style={{ fontSize:12, color:B.textMut }}>Sin tarifas estándar aún. Es la propuesta base para clientes que se cobran por viaje o por recojo (ruta o concepto, vehículo y precio).</div>
        ) : (
          <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
            {tarifarioViajeEstandar.filter(t=>t.activo).map(t=>(
              <div key={t.id} style={{ background:B.bg, borderRadius:8, padding:"7px 12px", fontSize:12 }}>
                <b style={{ color:B.navy }}>{t.concepto}</b>
                <span style={{ color:B.textMut }}> · {t.tipo_vehiculo||"cualquier vehículo"} · {t.unidad==="recojo"?"por recojo":"por viaje"} · </span>
                <b style={{ color:B.gold }}>S/ {t.tarifa}</b>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Catálogo de servicios: líneas de negocio + tipos de servicio */}
      <div style={{ background:B.white, border:`1px solid ${B.border}`,
        borderRadius:12, padding:20, boxShadow:"0 1px 2px #0D1E3D0D", gridColumn:"span 2" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
          marginBottom:16, paddingBottom:8, borderBottom:`2px solid ${B.gold}` }}>
          <div style={{ fontSize:14, fontWeight:800, color:B.navy }}>Líneas de negocio y tipos de servicio</div>
          <BtnPri onClick={()=>setModalLinea(true)} style={{ fontSize:12, padding:"7px 14px" }}><Ico n="plus" size={15} sw={2.4}/> Nueva línea de negocio</BtnPri>
        </div>
        <div style={{ fontSize:12, color:B.textMut, marginBottom:16 }}>
          Clasifica tus servicios por línea de negocio (ej. Transporte y Carga, Distribución y Última Milla) y sus tipos específicos, cada uno con su propio código — útil para asignar a clientes y para armar facturas de forma consistente.
        </div>
        {lineasNegocio.length===0 ? (
          <div style={{ padding:24, textAlign:"center", color:B.textMut, fontSize:13 }}>
            Aún no hay líneas de negocio. Son las grandes familias de servicio (Transporte y Carga, Distribución y Última Milla); cada una tiene tipos de servicio que luego eliges al facturar.
          </div>
        ) : (
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            {lineasNegocio.map(ln=>(
              <div key={ln.id} style={{ border:`1px solid ${B.border}`, borderRadius:10, padding:16 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                  <div>
                    <span style={{ fontSize:10, fontWeight:800, color:B.gold, background:`${B.gold}18`,
                      padding:"2px 8px", borderRadius:8, marginRight:8 }}>{ln.codigo}</span>
                    <span style={{ fontSize:13, fontWeight:700, color:B.navy }}>{ln.nombre}</span>
                  </div>
                  <button onClick={()=>setModalTipo(ln.id)}
                    style={{ fontSize:11, color:B.blue, background:"none", border:"none", cursor:"pointer", fontWeight:600 }}>
                    + Tipo de servicio
                  </button>
                </div>
                {ln.descripcion && <div style={{ fontSize:11, color:B.textMut, marginBottom:10 }}>{ln.descripcion}</div>}
                <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                  {tiposServicio.filter(t=>t.linea_negocio_id===ln.id).map(t=>(
                    <div key={t.id} style={{ background:B.bg, borderRadius:8, padding:"6px 12px", fontSize:11 }}>
                      <span style={{ fontWeight:800, color:B.navy }}>{t.codigo}</span>
                      <span style={{ color:B.textSec }}> — {t.nombre}</span>
                      {t.unidad_medida && <span style={{ color:B.textMut }}> ({t.unidad_medida})</span>}
                    </div>
                  ))}
                  {tiposServicio.filter(t=>t.linea_negocio_id===ln.id).length===0 && (
                    <div style={{ fontSize:11, color:B.textMut, fontStyle:"italic" }}>Sin tipos de servicio aún</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {modalLinea && (
        <ModalLineaNegocio onClose={()=>setModalLinea(false)}
          onSaved={()=>{setModalLinea(false); onRefresh();}} toast={toast}/>
      )}
      {modalTipo && (
        <ModalTipoServicio lineaNegocioId={modalTipo} lineasNegocio={lineasNegocio}
          onClose={()=>setModalTipo(null)}
          onSaved={()=>{setModalTipo(null); onRefresh();}} toast={toast}/>
      )}
      {modalTarifarioEstandar && (
        <ModalTarifarioEstandar tarifarioEstandar={tarifarioEstandar}
          onClose={()=>setModalTarifarioEstandar(false)} onSaved={()=>{onRefresh();}} toast={toast}/>
      )}
      {modalTarCli && (
        <ModalTarifarioCliente tarifasDistrito={tarifasDistrito} empresa={modalTarCli} tarifariosCliente={tarifariosCliente} tarifarioEstandar={tarifarioEstandar}
          onClose={()=>setModalTarCli(null)} onSaved={()=>{onRefresh();}} toast={toast}/>
      )}
      {modalTarViaje && (
        <ModalTarifarioViaje empresa={modalTarViaje} filas={tarifasViajeCliente} estandar={tarifarioViajeEstandar}
          onClose={()=>setModalTarViaje(null)} onSaved={()=>{onRefresh();}} toast={toast}/>
      )}
      {modalViajeEstandar && (
        <ModalTarifarioViaje empresa={null} filas={tarifarioViajeEstandar}
          onClose={()=>setModalViajeEstandar(false)} onSaved={()=>{onRefresh();}} toast={toast}/>
      )}
      {modalTarVeh && (
        <ModalTarifarioVehiculo empresa={modalTarVeh} tarifarioVehiculoCliente={tarifarioVehiculoCliente} tarifarioVehiculoEstandar={tarifarioVehiculoEstandar}
          onClose={()=>setModalTarVeh(null)} onSaved={()=>{onRefresh();}} toast={toast}/>
      )}
      {modalTarifarioVehiculoEstandar && (
        <ModalTarifarioVehiculoEstandar tarifarioVehiculoEstandar={tarifarioVehiculoEstandar}
          onClose={()=>setModalTarifarioVehiculoEstandar(false)} onSaved={()=>{onRefresh();}} toast={toast}/>
      )}
    </div>
  );
}

