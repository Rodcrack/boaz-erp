// BOAZ ERP — módulo "dashboard" (parte de BoazERP; ver src/BoazERP.jsx)
import { useState, useEffect, useCallback, useRef, useMemo, Fragment } from "react";
import { B, BADGE_SERVICIO, CARD, Cargando, Chip, ESTADOS_PEDIDO, EstadoVacio, Ico, Kpi, SeccionTitulo, Tabs, Th, diaLocal, escHTML, fmt, sb, traerTodo } from "./base.jsx";
import { cargarServicios, dia10, montoAsignacionPeriodo } from "./operacion.jsx";
import { DonutChart, SerieDiaria } from "./reportes.jsx";

// ══════════════════════════════════════════════════════════════
// MÓDULO 1: DASHBOARD
// ══════════════════════════════════════════════════════════════
export function generarInsights(pedidos, hoyP, ayerP, entregados, efectividad, ingresoHoy, ingresoAyer, sinAsignar, repartidores) {
  const frases = [];

  // Comparación de volumen vs ayer
  if (ayerP.length > 0) {
    const delta = Math.round(((hoyP.length - ayerP.length) / ayerP.length) * 100);
    if (Math.abs(delta) >= 5) {
      frases.push(delta > 0
        ? `Hoy llevas ${delta}% más pedidos que ayer a esta hora (${hoyP.length} vs ${ayerP.length}).`
        : `Hoy llevas ${Math.abs(delta)}% menos pedidos que ayer a esta hora (${hoyP.length} vs ${ayerP.length}).`);
    }
  } else if (hoyP.length > 0) {
    frases.push(`Ya registraste ${hoyP.length} pedido${hoyP.length===1?"":"s"} hoy.`);
  }

  // Efectividad
  if (pedidos.length >= 10) {
    if (efectividad >= 90) frases.push(`Tu efectividad general está en ${efectividad}% — excelente nivel.`);
    else if (efectividad < 70) frases.push(`Tu efectividad general bajó a ${efectividad}% — vale la pena revisar los pedidos no entregados.`);
  }

  // Ingresos vs ayer
  if (ingresoAyer > 0 && ingresoHoy > 0) {
    const deltaIngreso = Math.round(((ingresoHoy - ingresoAyer) / ingresoAyer) * 100);
    if (Math.abs(deltaIngreso) >= 10) {
      frases.push(deltaIngreso > 0
        ? `Los ingresos de hoy van ${deltaIngreso}% por encima de ayer a esta hora.`
        : `Los ingresos de hoy van ${Math.abs(deltaIngreso)}% por debajo de ayer a esta hora.`);
    }
  }

  // Pedidos sin asignar
  if (sinAsignar.length > 0) {
    frases.push(`Tienes ${sinAsignar.length} pedido${sinAsignar.length===1?"":"s"} sin asignar esperando repartidor.`);
  }

  // Repartidor destacado del día
  const conteoHoy = {};
  hoyP.forEach(p=>{ if(p.repartidor_id) conteoHoy[p.repartidor_id]=(conteoHoy[p.repartidor_id]||0)+1; });
  const topId = Object.keys(conteoHoy).sort((a,b)=>conteoHoy[b]-conteoHoy[a])[0];
  if (topId && conteoHoy[topId] >= 3) {
    const rep = repartidores.find(r=>r.id===topId);
    if (rep) frases.push(`${rep.nombres} ${rep.apellidos} lleva la delantera hoy, con ${conteoHoy[topId]} pedidos.`);
  }

  if (frases.length === 0) frases.push("Sin novedades destacadas hoy todavía — vuelve más tarde para ver el resumen.");
  return frases.slice(0, 4);
}

// ═══════════ DASHBOARD EJECUTIVO (pestañas Operación / Finanzas / Mapa) ═══════════

// Barras agrupadas (series: [{nombre,color,valores[]}], etiquetas[])
export function BarrasAgrupadas({ etiquetas, series, alto=190, formato=(v)=>String(Math.round(v)) }) {
  const W = 560, padL = 46, padB = 24, padT = 10, H = alto;
  const max = Math.max(1, ...series.flatMap(s=>s.valores));
  const gw = (W-padL-8)/etiquetas.length, bw = Math.min(26, (gw-10)/series.length);
  const ticks = [0,.5,1].map(f=>max*f);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width:"100%", height:"auto", display:"block" }}>
      {ticks.map((t,i)=>{ const y = H-padB-((t/max)*(H-padB-padT)); return (
        <g key={i}><line x1={padL} x2={W-4} y1={y} y2={y} stroke="#E6EDF5" strokeDasharray={i?"3 3":""}/>
          <text x={padL-6} y={y+3} fontSize="9" textAnchor="end" fill={B.textMut}>{formato(t)}</text></g>); })}
      {etiquetas.map((et,i)=>(
        <g key={i}>
          {series.map((s,j)=>{ const v = s.valores[i]||0, bh = (v/max)*(H-padB-padT);
            const x = padL + i*gw + (gw - bw*series.length)/2 + j*bw;
            return <rect key={j} x={x} y={H-padB-bh} width={bw-2} height={Math.max(bh,v?2:0)} rx={3} fill={s.color}><title>{s.nombre}: {formato(v)}</title></rect>; })}
          <text x={padL+i*gw+gw/2} y={H-8} fontSize="10" textAnchor="middle" fill={B.textSec}>{et}</text>
        </g>
      ))}
    </svg>
  );
}

export function KpiComparado({ icon, label, valor, previo, valorFmt, serie, color, invertir=false }) {
  const delta = previo ? Math.round(((valor-previo)/previo)*100) : null;
  return <Kpi icon={icon} label={label} valor={valorFmt} delta={delta} invertir={invertir} serie={serie} color={color} sub={delta!=null ? "vs. mismo período del mes anterior" : null}/>;
}

export const nombreMes = (d) => d.toLocaleDateString("es-PE",{month:"short"}).replace(".","");
export const claveMes = (iso) => (iso||"").slice(0,7);

// ── Operación: comparativo mensual (se agrega arriba del dashboard clásico)
export function ComparativoMes({ pedidos, ingExtra=()=>0, cobraPedido=()=>true }) {
  // Una sola pasada: agrupa por día y luego arma los totales (evita recorrer todos los pedidos 30+ veces)
  const { a, b, sPed, sEnt, sIng, sEf } = useMemo(() => {
    const hoy = new Date();
    const mesAct = diaLocal(hoy).slice(0,7);
    const mesPrev = diaLocal(new Date(hoy.getFullYear(), hoy.getMonth()-1, 1)).slice(0,7);
    const diaDelMes = hoy.getDate();
    const porDia = {};
    for (const p of pedidos) {
      if (!p.created_at) continue;
      const k = diaLocal(new Date(p.created_at));
      const g = porDia[k] || (porDia[k] = { n:0, ent:0, ing:0 });
      g.n++; if (p.estado==="entregado") g.ent++; g.ing += cobraPedido(p) ? (parseFloat(p.tarifa_s)||0) : 0;
    }
    const suma = (mes, hasta) => { let n=0, ent=0, ing=0;
      for (const k in porDia) { if (k.slice(0,7)!==mes) continue; if (hasta && parseInt(k.slice(8,10))>hasta) continue; const g = porDia[k]; n+=g.n; ent+=g.ent; ing+=g.ing; }
      return { n, ent, ef: n?Math.round(ent/n*100):0, ing }; };
    const dias = [];
    for (let i=29;i>=0;i--) { const k = diaLocal(new Date(Date.now()-i*86400000)); const g = porDia[k] || { n:0, ent:0, ing:0 }; dias.push({ ...g, ing: g.ing + ingExtra(k, k) }); }
    // unidades por día y servicios: mes actual hasta hoy vs. mismo tramo del mes anterior
    const A = suma(mesAct), Bm = suma(mesPrev, diaDelMes);
    const finPrev = Math.min(diaDelMes, new Date(hoy.getFullYear(), hoy.getMonth(), 0).getDate());
    A.ing += ingExtra(mesAct+"-01", diaLocal(hoy));
    Bm.ing += ingExtra(mesPrev+"-01", mesPrev+"-"+String(finPrev).padStart(2,"0"));
    return { a: A, b: Bm, sPed: dias.map(g=>g.n), sEnt: dias.map(g=>g.ent), sIng: dias.map(g=>g.ing), sEf: dias.map(g=>g.n?g.ent/g.n*100:0) };
  }, [pedidos, ingExtra, cobraPedido]);
  return (
    <div style={{ marginBottom:20 }}>
      <SeccionTitulo nota="tendencia de 30 días">Este mes</SeccionTitulo>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14 }}>
        <KpiComparado icon="package" label="Pedidos del mes" valor={a.n} previo={b.n} valorFmt={a.n} serie={sPed} color={B.navy}/>
        <KpiComparado icon="check" label="Entregados" valor={a.ent} previo={b.ent} valorFmt={a.ent} serie={sEnt} color={B.green}/>
        <KpiComparado icon="trend" label="Efectividad" valor={a.ef} previo={b.ef} valorFmt={a.ef+"%"} serie={sEf} color={B.gold}/>
        <KpiComparado icon="dollar" label="Ingresos estimados (sin IGV)" valor={a.ing} previo={b.ing} valorFmt={fmt.sol(a.ing)} serie={sIng} color={B.goldDk}/>
      </div>
    </div>
  );
}

// ¿A este cliente se le cobra por pedido? Si tiene modalidades definidas manda eso; si no, se mantiene la
// regla anterior: un cliente con unidades asignadas se cobra por unidad, no por pedido.
export const clienteCobraPorPedido = (id, empresas=[], asignaciones=[]) => {
  if (!id) return true;
  const e = empresas.find(x=>x.id===id); const m = e && e.modalidades_tarifa;
  if (Array.isArray(m) && m.length) return m.includes("pedido");
  return !asignaciones.some(a=>a.empresa_id===id);
};

// Pagos al personal ya realizados (repartidores, planilla y terceros), como egresos.
// Se usan en el Dashboard de Finanzas y en Gastos para que el resultado incluya el costo de personal.
export const CAT_PERSONAL = ["Pago a repartidores","Planilla","Honorarios y terceros"];
export const cargarEgresosPersonal = async () => {
  const seguro = async (fn) => { try { const r = await fn(); return r.error ? [] : (r.data||[]); } catch { return []; } };
  const [liq, pp, pt] = await Promise.all([
    seguro(() => traerTodo(() => sb.from("liquidaciones").select("*,repartidores(nombres,apellidos)").eq("estado","pagado").order("id"))),
    seguro(() => traerTodo(() => sb.from("pagos_planilla").select("*,personal_planilla(nombres,apellidos)").eq("estado","pagado").order("id"))),
    seguro(() => traerTodo(() => sb.from("pagos_terceros").select("*,terceros_planilla(nombre)").eq("estado","pagado").order("id"))),
  ]);
  const dia = (v) => v ? String(v).slice(0,10) : null;
  const nom = (o) => o ? `${o.nombres||""} ${o.apellidos||""}`.trim() : "";
  const out = [];
  liq.filter(l=>l.estado==="pagado").forEach(l => out.push({ id:"liq-"+l.id, auto:true, tipo:"egreso", categoria:CAT_PERSONAL[0], fecha: dia(l.fecha_pago) || dia(l.fecha) || dia(l.created_at),
    descripcion:`Liquidación de ${nom(l.repartidores)||"repartidor"}${l.total_entregados?` · ${l.total_entregados} entregas`:""}`, monto: parseFloat(l.monto_ganado_s)||0 }));
  pp.filter(x=>x.estado==="pagado").forEach(x => out.push({ id:"pla-"+x.id, auto:true, tipo:"egreso", categoria:CAT_PERSONAL[1], fecha: dia(x.fecha_pago) || (x.periodo ? x.periodo+"-28" : dia(x.created_at)),
    descripcion:`Planilla ${x.periodo||""} — ${nom(x.personal_planilla)||"trabajador"} (bruto + EsSalud)`, monto: (parseFloat(x.sueldo_bruto)||0) + (parseFloat(x.monto_essalud)||0) }));
  pt.filter(x=>x.estado==="pagado").forEach(x => out.push({ id:"ter-"+x.id, auto:true, tipo:"egreso", categoria:CAT_PERSONAL[2], fecha: dia(x.fecha_pago) || dia(x.created_at),
    descripcion:`${(x.terceros_planilla && x.terceros_planilla.nombre)||"Tercero"}${x.descripcion?` — ${x.descripcion}`:""}${x.numero_documento?` · ${x.numero_documento}`:""}`, monto: parseFloat(x.monto_bruto)||0 }));
  return out.filter(x => x.fecha && x.monto>0);
};

// ── Finanzas
export function DashboardFinanzas() {
  const [datos, setDatos] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    let vivo = true;
    (async () => {
      const desde = diaLocal(new Date(new Date().getFullYear(), new Date().getMonth()-5, 1));
      const [f, g, per] = await Promise.all([
        traerTodo(() => sb.from("facturas").select("total_s,igv_s,estado_pago,estado,fecha_emision,fecha_pago,empresa_id,empresas(nombre)").order("id")),
        traerTodo(() => sb.from("gastos").select("monto,tipo,fecha").eq("tipo","egreso").gte("fecha",desde).order("id")),
        cargarEgresosPersonal(),
      ]);
      if (!vivo) return;
      if (f.error) { setErr("No se pudieron cargar las facturas."); return; }
      setDatos({ fact: (f.data||[]).filter(x=>x.estado!=="anulada" && x.estado!=="anulado"), gast: g.data||[], pers: (per||[]).filter(x=>x.fecha>=desde) });
    })();
    return () => { vivo = false; };
  }, []);
  if (err) return <EstadoVacio icono="alert" titulo="Sin datos" texto={err}/>;
  if (!datos) return <Cargando filas={5}/>;
  const { fact, gast, pers=[] } = datos;
  const hoy = new Date();
  const meses = [];
  for (let i=5;i>=0;i--) { const d = new Date(hoy.getFullYear(), hoy.getMonth()-i, 1); meses.push({ k: diaLocal(d).slice(0,7), l: nombreMes(d) }); }
  const num = (v) => parseFloat(v)||0;
  const factMes = meses.map(m => fact.filter(x=>claveMes(x.fecha_emision)===m.k).reduce((t,x)=>t+num(x.total_s),0));
  const cobMes  = meses.map(m => fact.filter(x=>x.estado_pago==="pagado" && claveMes(x.fecha_pago||x.fecha_emision)===m.k).reduce((t,x)=>t+num(x.total_s),0));
  const opMes   = meses.map(m => gast.filter(x=>claveMes(x.fecha)===m.k).reduce((t,x)=>t+num(x.monto),0));
  const persMes = meses.map(m => pers.filter(x=>claveMes(x.fecha)===m.k).reduce((t,x)=>t+num(x.monto),0));
  const gastMes = opMes.map((v,k)=>v+persMes[k]);                       // egresos totales: operativos + personal
  const ventaMes = meses.map(m => fact.filter(x=>claveMes(x.fecha_emision)===m.k).reduce((t,x)=>t+num(x.total_s)-num(x.igv_s),0));   // ventas sin IGV
  const margenMes = ventaMes.map((v,k)=>v-gastMes[k]);
  const i = 5;
  const pendientes = fact.filter(x=>x.estado_pago!=="pagado");
  const porCobrar = pendientes.reduce((t,x)=>t+num(x.total_s),0);
  const hoyD = new Date(diaLocal()+"T00:00:00");
  const tramos = [{l:"0-30 d",v:0},{l:"31-60 d",v:0},{l:"61-90 d",v:0},{l:"+90 d",v:0}];
  pendientes.forEach(x => { const dias = Math.round((hoyD - new Date((x.fecha_emision||diaLocal())+"T00:00:00"))/86400000); tramos[dias<=30?0:dias<=60?1:dias<=90?2:3].v += num(x.total_s); });
  const clientes = {};
  fact.filter(x=>claveMes(x.fecha_emision)===meses[i].k).forEach(x => { const n = x.empresas?.nombre||"Sin cliente"; clientes[n]=(clientes[n]||0)+num(x.total_s); });
  const topCli = Object.entries(clientes).sort((a,b)=>b[1]-a[1]).slice(0,6);
  const maxCli = Math.max(1, ...topCli.map(x=>x[1]));
  const tarj = { background:B.white, border:`1px solid ${B.border}`, borderRadius:12, padding:18, boxShadow:"0 1px 2px #0D1E3D0D" };
  return (
    <div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14, marginBottom:18 }}>
        <KpiComparado icon="receipt" label="Facturado del mes" valor={factMes[i]} previo={factMes[i-1]} valorFmt={fmt.sol(factMes[i])} serie={factMes} color={B.navy}/>
        <KpiComparado icon="banknote" label="Cobrado del mes" valor={cobMes[i]} previo={cobMes[i-1]} valorFmt={fmt.sol(cobMes[i])} serie={cobMes} color={B.green}/>
        <KpiComparado icon="wallet" label="Egresos del mes" valor={gastMes[i]} previo={gastMes[i-1]} valorFmt={fmt.sol(gastMes[i])} serie={gastMes} color={B.red} invertir/>
        <KpiComparado icon="trend" label="Margen (ventas sin IGV − egresos)" valor={margenMes[i]} previo={margenMes[i-1]} valorFmt={fmt.sol(margenMes[i])} serie={margenMes} color={margenMes[i]>=0?B.goldDk:B.red}/>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr", gap:14, marginBottom:14 }}>
        <div style={tarj}>
          <div style={{ fontSize:13, fontWeight:700, color:B.textPri, marginBottom:4 }}>Facturado, cobrado y egresos — últimos 6 meses</div>
          <div style={{ fontSize:11, color:B.textMut, marginBottom:8 }}>
            <span style={{ color:B.navy, fontWeight:700 }}>■</span> Facturado &nbsp;<span style={{ color:B.green, fontWeight:700 }}>■</span> Cobrado &nbsp;<span style={{ color:B.red, fontWeight:700 }}>■</span> Egresos (gastos + personal)
          </div>
          <BarrasAgrupadas etiquetas={meses.map(m=>m.l)} formato={(v)=>v>=1000?(v/1000).toFixed(v>=10000?0:1)+"k":String(Math.round(v))}
            series={[{nombre:"Facturado",color:B.navy,valores:factMes},{nombre:"Cobrado",color:B.green,valores:cobMes},{nombre:"Egresos",color:B.red,valores:gastMes}]}/>
        </div>
        <div style={tarj}>
          <div style={{ fontSize:13, fontWeight:700, color:B.textPri, marginBottom:2 }}>Cartera por cobrar</div>
          <div style={{ fontSize:22, fontWeight:800, color:B.navy, marginBottom:10 }}>{fmt.sol(porCobrar)}</div>
          {tramos.map((t,j)=>(
            <div key={j} style={{ marginBottom:9 }}>
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:B.textSec, marginBottom:3 }}><span>{t.l}</span><b style={{ color:B.textPri }}>{fmt.sol(t.v)}</b></div>
              <div style={{ height:6, background:B.bg, borderRadius:4, overflow:"hidden" }}><div style={{ height:"100%", width:`${porCobrar?t.v/porCobrar*100:0}%`, background:[B.green,B.gold,B.orange,B.red][j] }}/></div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ ...tarj, marginBottom:14 }}>
        <div style={{ fontSize:13, fontWeight:700, color:B.textPri, marginBottom:4 }}>Egresos del mes por origen</div>
        <div style={{ fontSize:12, color:B.textMut, marginBottom:12 }}>Los pagos al personal se cuentan cuando están marcados como pagados en Liq. Repartidores y Planilla.</div>
        {(() => {
          const mk = meses[i].k, de = (c) => pers.filter(x=>x.categoria===c && claveMes(x.fecha)===mk).reduce((t,x)=>t+num(x.monto),0);
          const partes = [["Gastos operativos (módulo Gastos)", opMes[i], B.red], ["Pago a repartidores (liquidaciones)", de(CAT_PERSONAL[0]), B.orange], ["Planilla (bruto + EsSalud)", de(CAT_PERSONAL[1]), B.navy], ["Honorarios y terceros", de(CAT_PERSONAL[2]), B.blue]];
          const tot = gastMes[i];
          return (<>
            {partes.map(([l,v,c]) => (
              <div key={l} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
                <div style={{ width:250, maxWidth:"45%", fontSize:12, color:B.textPri }}>{l}</div>
                <div style={{ flex:1, height:10, background:B.bg, borderRadius:6, overflow:"hidden" }}><div style={{ height:"100%", width:`${tot?v/tot*100:0}%`, background:c }}/></div>
                <div style={{ width:100, textAlign:"right", fontSize:12, fontWeight:700, color:B.navy }}>{fmt.sol(v)}</div>
              </div>))}
            <div style={{ display:"flex", justifyContent:"space-between", borderTop:`1px solid ${B.border}`, marginTop:10, paddingTop:10, fontSize:13 }}>
              <span style={{ color:B.textSec }}>Ventas sin IGV {fmt.sol(ventaMes[i])} − egresos {fmt.sol(tot)}</span>
              <b style={{ color: margenMes[i]>=0 ? "#047857" : "#B91C1C" }}>Margen {fmt.sol(margenMes[i])}</b>
            </div>
          </>);
        })()}
      </div>
      <div style={tarj}>
        <div style={{ fontSize:13, fontWeight:700, color:B.textPri, marginBottom:10 }}>Top clientes del mes (facturado)</div>
        {topCli.length===0 && <div style={{ fontSize:12, color:B.textMut }}>Aún no hay facturas emitidas este mes.</div>}
        {topCli.map(([n,v])=>(
          <div key={n} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
            <div style={{ width:150, fontSize:12, color:B.textPri, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{n}</div>
            <div style={{ flex:1, height:10, background:B.bg, borderRadius:6, overflow:"hidden" }}><div style={{ height:"100%", width:`${v/maxCli*100}%`, background:`linear-gradient(90deg,${B.navy},${B.navyLt||B.navy})` }}/></div>
            <div style={{ width:90, textAlign:"right", fontSize:12, fontWeight:700, color:B.navy }}>{fmt.sol(v)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Mapa de flota en vivo (última posición conocida según eventos de la app del repartidor)
export function cargarLeafletERP() {
  return new Promise((resolve) => {
    if (window.L) { resolve(window.L); return; }
    const link = document.createElement("link"); link.rel="stylesheet"; link.href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"; document.head.appendChild(link);
    const sc = document.createElement("script"); sc.src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    sc.onload = () => resolve(window.L); sc.onerror = () => resolve(null); document.head.appendChild(sc);
  });
}
export function haceCuanto(iso) {
  const m = Math.max(0, Math.round((Date.now()-new Date(iso))/60000));
  return m<1?"ahora":m<60?`hace ${m} min`:m<1440?`hace ${Math.floor(m/60)} h`:`hace ${Math.floor(m/1440)} d`;
}
export function MapaFlota({ pedidos, repartidores }) {
  const cont = useRef(null), mapa = useRef(null), capa = useRef(null);
  const [listo, setListo] = useState(false);
  const [fallo, setFallo] = useState(false);
  const [foco, setFoco] = useState(null);
  const hoy = diaLocal();
  const activos = pedidos.filter(p => p.dest_lat && p.dest_lng && (p.estado==="en_ruta" || p.estado==="asignado" || (p.estado==="entregado" && p.fecha_entrega && diaLocal(new Date(p.fecha_entrega))===hoy)));
  // última posición conocida por repartidor, de los eventos con GPS de las últimas 24 h
  const [recientes, setRecientes] = useState([]);
  useEffect(() => {
    let vivo = true;
    const traer = async () => {
      const desde = new Date(Date.now()-86400000).toISOString();
      const { data } = await sb.from("pedidos").select("repartidor_id,historial")
        .not("repartidor_id","is",null).or(`estado.in.(en_ruta,asignado),fecha_entrega.gte.${desde}`).limit(1500);
      if (vivo && data) setRecientes(data);
    };
    traer();
    const t = setInterval(traer, 60000);
    return () => { vivo = false; clearInterval(t); };
  }, []);
  const limite = Date.now()-86400000;
  const pos = {};
  recientes.forEach(p => {
    if (!p.repartidor_id || !Array.isArray(p.historial)) return;
    p.historial.forEach(h => { if (h && h.lat && h.lng && h.timestamp && new Date(h.timestamp).getTime()>=limite) { const cur = pos[p.repartidor_id]; if (!cur || h.timestamp>cur.t) pos[p.repartidor_id] = { lat:h.lat, lng:h.lng, t:h.timestamp }; } });
  });
  const riders = repartidores.filter(r=>r.activo).map(r => ({ ...r, pos: pos[r.id]||null, enRuta: pedidos.filter(p=>p.repartidor_id===r.id && p.estado==="en_ruta").length, asig: pedidos.filter(p=>p.repartidor_id===r.id && p.estado==="asignado").length }))
    .sort((a,b)=>(b.pos?1:0)-(a.pos?1:0) || b.enRuta-a.enRuta);
  useEffect(() => {
    let vivo = true;
    cargarLeafletERP().then(L => {
      if (!vivo) return; if (!L) { setFallo(true); return; }
      if (!mapa.current && cont.current) {
        mapa.current = L.map(cont.current).setView([-12.0464,-77.0428], 11);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution:"© OpenStreetMap", maxZoom:19 }).addTo(mapa.current);
        capa.current = L.layerGroup().addTo(mapa.current);
      }
      setListo(true);
    });
    return () => { vivo = false; };
  }, []);
  useEffect(() => () => { if (mapa.current) { mapa.current.remove(); mapa.current = null; } }, []);
  const clavePos = riders.map(r=>r.id+":"+(r.pos?.t||"")).join("|") + "#" + activos.map(p=>p.id+p.estado).join(",");
  useEffect(() => {
    const L = window.L; if (!listo || !L || !capa.current) return;
    capa.current.clearLayers();
    const pts = [];
    activos.forEach(p => {
      const c = ESTADOS_PEDIDO[p.estado]?.color || "#888";
      L.circleMarker([p.dest_lat,p.dest_lng], { radius:6, color:"#fff", weight:2, fillColor:c, fillOpacity:.95 }).addTo(capa.current)
        .bindPopup(`<b>${escHTML(p.omd)}</b><br>${escHTML(p.dest_nombre)}<br>${escHTML(p.dest_direccion)}<br><i>${escHTML(ESTADOS_PEDIDO[p.estado]?.label||p.estado)}</i>`);
      pts.push([p.dest_lat,p.dest_lng]);
    });
    riders.filter(r=>r.pos).forEach(r => {
      const ic = L.divIcon({ className:"", iconSize:[34,34], iconAnchor:[17,17], html:`<div style="width:34px;height:34px;border-radius:50%;background:${B.navy};border:3px solid ${B.gold};color:${B.gold};display:flex;align-items:center;justify-content:center;font:700 12px Inter,sans-serif;box-shadow:0 2px 8px #0006">${escHTML((r.nombres||"?")[0])}${escHTML((r.apellidos||"")[0]||"")}</div>` });
      L.marker([r.pos.lat,r.pos.lng], { icon:ic, zIndexOffset:1000 }).addTo(capa.current)
        .bindPopup(`<b>${escHTML(r.nombres)} ${escHTML(r.apellidos)}</b><br>Última señal ${haceCuanto(r.pos.t)}<br>${r.enRuta} en ruta · ${r.asig} asignados`);
      pts.push([r.pos.lat,r.pos.lng]);
    });
    if (pts.length && !foco) mapa.current.fitBounds(pts, { padding:[40,40], maxZoom:14 });
  }, [listo, clavePos]);
  const irA = (r) => { if (!r.pos || !mapa.current) return; setFoco(r.id); mapa.current.setView([r.pos.lat,r.pos.lng], 15); };
  return (
    <div style={{ display:"grid", gridTemplateColumns:"minmax(0,1fr) 280px", gap:14 }} className="bz-mapa-grid">
      <div style={{ background:B.white, border:`1px solid ${B.border}`, borderRadius:12, overflow:"hidden", boxShadow:"0 1px 2px #0D1E3D0D" }}>
        <div style={{ padding:"10px 16px", borderBottom:`1px solid ${B.border}`, fontSize:11, color:B.textMut, display:"flex", gap:14, flexWrap:"wrap" }}>
          <span><b style={{ color:B.navy }}>●</b> Repartidor (última posición)</span>
          <span><b style={{ color:ESTADOS_PEDIDO.en_ruta?.color }}>●</b> En ruta</span>
          <span><b style={{ color:ESTADOS_PEDIDO.asignado?.color }}>●</b> Asignado</span>
          <span><b style={{ color:ESTADOS_PEDIDO.entregado?.color }}>●</b> Entregado hoy</span>
        </div>
        {fallo ? <EstadoVacio icono="map" titulo="No se pudo cargar el mapa" texto="Revisa tu conexión a internet y vuelve a intentar."/> : <div ref={cont} style={{ height:"min(62vh,560px)", minHeight:340 }}/>}
      </div>
      <div style={{ background:B.white, border:`1px solid ${B.border}`, borderRadius:12, padding:14, boxShadow:"0 1px 2px #0D1E3D0D", maxHeight:"min(62vh,560px)", overflowY:"auto" }}>
        <div style={{ fontSize:13, fontWeight:700, color:B.textPri, marginBottom:4 }}>Repartidores activos</div>
        <div style={{ fontSize:10, color:B.textMut, marginBottom:10, lineHeight:1.4 }}>La posición se actualiza cuando el repartidor inicia ruta, cambia el estado de un pedido o entrega (últimas 24 h).</div>
        {riders.map(r => (
          <div key={r.id} onClick={()=>irA(r)} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 6px", borderBottom:`1px solid ${B.border}`, cursor:r.pos?"pointer":"default", background:foco===r.id?"#FFF7ED":"transparent", borderRadius:6 }}>
            <div style={{ width:30, height:30, borderRadius:"50%", background:r.pos?B.navy:"#CBD5E1", color:r.pos?B.gold:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, flexShrink:0 }}>{(r.nombres||"?")[0]}{(r.apellidos||"")[0]}</div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:12, fontWeight:600, color:B.textPri, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{r.nombres} {r.apellidos}</div>
              <div style={{ fontSize:10, color:B.textMut }}>{r.pos ? `Señal ${haceCuanto(r.pos.t)}` : "Sin señal en 24 h"} · {r.enRuta} en ruta</div>
            </div>
          </div>
        ))}
        {riders.length===0 && <div style={{ fontSize:12, color:B.textMut }}>No hay repartidores activos.</div>}
      </div>
    </div>
  );
}

export function Dashboard(props) {
  const { modulos=[], pedidos, repartidores, empresas=[], asignaciones=[], diasServicio=[], recargoFeriadoPct=0 } = props;
  // Ingresos que no vienen de pedidos: unidades por día y viajes/recojos/servicios cotizados
  const [servs, setServs] = useState([]);
  useEffect(() => {
    let vivo = true;
    (async () => {
      try { const d = new Date(); const r = await cargarServicios(diaLocal(new Date(d.getFullYear(), d.getMonth()-1, 1)), diaLocal(), "");
        if (vivo && !r.error) setServs((r.data||[]).filter(x=>x.estado==="realizado")); } catch {}
    })();
    return () => { vivo = false; };
  }, []);
  const ingExtra = useCallback((desde, hasta) =>
    asignaciones.reduce((t,a)=>t+montoAsignacionPeriodo(a, diasServicio, desde, hasta, recargoFeriadoPct||0).monto, 0) +
    servs.filter(x=>dia10(x.fecha)>=desde && dia10(x.fecha)<=hasta).reduce((t,x)=>t+(parseFloat(x.monto)||0),0),
    [asignaciones, diasServicio, recargoFeriadoPct, servs]);
  const cobraPedido = useCallback((p) => clienteCobraPorPedido(p.empresa_id, empresas, asignaciones), [empresas, asignaciones]);
  const veFin = modulos.includes("cobranza");
  const [tab, setTab] = useState(() => { try { return localStorage.getItem("boaz_dash_tab") || "operacion"; } catch { return "operacion"; } });
  const tabOk = tab==="finanzas" && !veFin ? "operacion" : tab;
  const cambiar = (t) => { setTab(t); try { localStorage.setItem("boaz_dash_tab", t); } catch {} };
  const tabs = [{ id:"operacion", l:"Operación", i:"package" }, ...(veFin?[{ id:"finanzas", l:"Finanzas", i:"dollar" }]:[]), { id:"mapa", l:"Mapa de flota", i:"map" }];
  return (
    <div>
      <Tabs tipo="linea" tabs={tabs} valor={tabOk} onChange={cambiar} style={{ marginBottom:18 }}/>
      {tabOk==="operacion" && <DashboardOperacion {...props} ingExtra={ingExtra} cobraPedido={cobraPedido}/>}
      {tabOk==="finanzas" && <DashboardFinanzas/>}
      {tabOk==="mapa" && <MapaFlota pedidos={pedidos} repartidores={repartidores}/>}
    </div>
  );
}

export function DashboardOperacion({ pedidos, repartidores, liquidaciones, cotizNuevas=0, modulos=[], onIr, ingExtra=()=>0, cobraPedido=()=>true }) {
  const [alertasFin, setAlertasFin] = useState({ facturas:null, mant:[] });
  const [docsFlota, setDocsFlota] = useState({ venc:0, pronto:0 });
  const [incAbiertas, setIncAbiertas] = useState(0);
  const veInc = modulos.includes('incidencias');
  useEffect(() => {
    if (!veInc) return;
    (async () => { try { const { count } = await sb.from('incidencias').select('id', { count:'exact', head:true }).neq('estado','resuelta'); if (count!=null) setIncAbiertas(count); } catch {} })();
  }, [veInc]);
  const veFlota = modulos.includes('unidades');
  useEffect(() => {
    if (!veFlota) return;
    let vivo = true;
    (async () => {
      try {
        const { data } = await sb.from('vehiculo_documentos').select('placa,tipo,fecha_vencimiento');
        if (!vivo || !data) return;
        const ult = {};
        data.forEach(d => { const k = d.placa+'|'+d.tipo; if (!ult[k] || (d.fecha_vencimiento||'') > (ult[k].fecha_vencimiento||'')) ult[k] = d; });
        let venc=0, pronto=0;
        Object.values(ult).forEach(d => { if (!d.fecha_vencimiento) return; const n = Math.round((new Date(d.fecha_vencimiento+'T00:00:00') - new Date(diaLocal()+'T00:00:00'))/86400000); if (n<0) venc++; else if (n<=30) pronto++; });
        setDocsFlota({ venc, pronto });
      } catch {}
    })();
    return () => { vivo = false; };
  }, [veFlota]);
  const veFinanzas = modulos.includes('cobranza');
  useEffect(() => {
    if (!veFinanzas) return;
    let vivo = true;
    (async () => {
      try {
        const lim = new Date(); lim.setDate(lim.getDate()-30);
        const [f, g] = await Promise.all([
          sb.from('facturas').select('total_s,estado_pago,fecha_emision,estado').lte('fecha_emision', diaLocal(lim)),
          sb.from('gastos').select('placa,categoria,fecha,proximo_mant_fecha').in('categoria',['Mantenimiento','Reparación']).not('placa','is',null).order('fecha',{ascending:false}).limit(1000),
        ]);
        if (!vivo) return;
        const pend = (f.data||[]).filter(x => x.estado_pago!=='pagado' && x.estado!=='anulada' && x.estado!=='anulado');
        const vistos = {}, mant = [];
        (g.data||[]).forEach(r => { if (vistos[r.placa]) return; vistos[r.placa]=true; if (r.proximo_mant_fecha && r.proximo_mant_fecha < diaLocal()) mant.push(r.placa); });
        setAlertasFin({ facturas: { n: pend.length, total: pend.reduce((t,x)=>t+(parseFloat(x.total_s)||0),0) }, mant });
      } catch {}
    })();
    return () => { vivo = false; };
  }, [veFinanzas]);
  const hoy = diaLocal();
  const ayer = diaLocal(new Date(Date.now()-86400000));
  const horaActual = new Date().getHours()*60 + new Date().getMinutes();

  const hoyP = pedidos.filter(p => p.created_at && diaLocal(new Date(p.created_at))===hoy);
  // "Ayer a esta hora" — comparación justa, no todo el día de ayer completo
  const ayerP = pedidos.filter(p => {
    if (!p.created_at || diaLocal(new Date(p.created_at))!==ayer) return false;
    const d = new Date(p.created_at);
    return (d.getHours()*60+d.getMinutes()) <= horaActual;
  });
  const entregados = pedidos.filter(p => p.estado==="entregado");
  const enRuta = pedidos.filter(p => p.estado==="en_ruta");
  const sinAsignar = pedidos.filter(p => p.estado==="sin_asignar");
  const tarifaDe = (p) => cobraPedido(p) ? (parseFloat(p.tarifa_s)||0) : 0;
  const ingresoHoy = hoyP.reduce((a,p)=>a+tarifaDe(p),0) + ingExtra(hoy, hoy);
  const ingresoAyer = ayerP.reduce((a,p)=>a+tarifaDe(p),0) + ingExtra(ayer, ayer);
  const efectividad = pedidos.length ? Math.round(entregados.length/pedidos.length*100) : 0;

  const deltaPct = (hoyVal, ayerVal) => {
    if (!ayerVal) return null;
    return Math.round(((hoyVal-ayerVal)/ayerVal)*100);
  };
  const deltaPedidos = deltaPct(hoyP.length, ayerP.length);
  const deltaIngreso = deltaPct(ingresoHoy, ingresoAyer);

  const kpis = [
    { icon:"package", label:"Pedidos hoy", value: hoyP.length, sub:`${pedidos.length} total`, color: B.navy, delta: deltaPedidos },
    { icon:"check", label:"Entregados hoy", value: pedidos.filter(p=>p.estado==="entregado" && p.fecha_entrega && diaLocal(new Date(p.fecha_entrega))===hoy).length, sub:`${efectividad}% efectividad general`, color: B.green },
    { icon:"bike", label:"En ruta", value: enRuta.length, sub:`${repartidores.filter(r=>r.activo).length} repartidores activos`, color: B.gold },
    { icon:"alert", label:"Sin asignar", value: sinAsignar.length, sub: sinAsignar.length>0?"requieren atención":"todo OK", color: sinAsignar.length>0?B.red:B.green },
    { icon:"dollar", label:"Ingresos de hoy (est.)", value: fmt.sol(ingresoHoy), sub:"pedidos + unidades + servicios, sin IGV", color: B.goldDk, delta: deltaIngreso },
  ];

  const porEstado = Object.entries(ESTADOS_PEDIDO).map(([k,v])=>({
    estado: k, label: v.label, color: v.color,
    count: pedidos.filter(p=>p.estado===k).length
  }));

  // Tendencia de los últimos 7 días
  const serie7dias = [];
  for (let i=6; i>=0; i--) {
    const fecha = new Date(Date.now() - i*86400000);
    const key = diaLocal(fecha);
    const delDia = pedidos.filter(p=>p.created_at && diaLocal(new Date(p.created_at))===key);
    serie7dias.push({
      label: fecha.toLocaleDateString("es-PE",{day:"2-digit",month:"2-digit"}),
      total: delDia.length,
      entregados: delDia.filter(p=>p.estado==="entregado").length,
    });
  }

  const insights = generarInsights(pedidos, hoyP, ayerP, entregados, efectividad, ingresoHoy, ingresoAyer, sinAsignar, repartidores);

  const recientes = [...pedidos].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,8);

  return (
    <div>
      {/* Indicadores del día */}
      <SeccionTitulo nota={new Date().toLocaleDateString("es-PE",{weekday:"long", day:"numeric", month:"long"})}>Hoy</SeccionTitulo>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:14, marginBottom:20 }}>
        {kpis.map((k,i) => <Kpi key={i} icon={k.icon} label={k.label} valor={k.value} sub={k.sub} color={k.color} delta={k.delta} deltaTxt=" vs ayer"/>)}
      </div>

      <div className="bz-mapa-grid" style={{ display:"grid", gridTemplateColumns:"minmax(0,1.7fr) minmax(0,1fr)", gap:14, marginBottom:20, alignItems:"stretch" }}>
      {/* Atención requerida */}
      {(() => {
        const items = [];
        if (sinAsignar.length>0) items.push({ ico:"alert", c:B.red, t:`${sinAsignar.length} pedido${sinAsignar.length===1?"":"s"} sin asignar`, ir:"pedidos" });
        if (cotizNuevas>0) items.push({ ico:"mail", c:B.blue, t:`${cotizNuevas} cotización${cotizNuevas===1?"":"es"} nueva${cotizNuevas===1?"":"s"}`, ir:"cotizaciones" });
        if (veFinanzas && alertasFin.facturas && alertasFin.facturas.n>0) items.push({ ico:"receipt", c:B.orange, t:`${alertasFin.facturas.n} factura${alertasFin.facturas.n===1?"":"s"} con más de 30 días sin cobrar (${fmt.sol(alertasFin.facturas.total)})`, ir:"cobranza" });
        const codSin = pedidos.filter(p => p.cobro_destino && p.estado==="entregado" && !p.cod_rendido);
        if (veFinanzas && codSin.length>0) items.push({ ico:"banknote", c:B.orange, t:`${codSin.length} cobro${codSin.length===1?"":"s"} contraentrega sin rendir (${fmt.sol(codSin.reduce((t,p)=>t+(parseFloat(p.monto_cobrar)||0),0))})`, ir:"cobranza" });
        if (veInc && incAbiertas>0) items.push({ ico:"alert", c:B.red, t:`${incAbiertas} incidencia${incAbiertas===1?"":"s"} sin resolver`, ir:"incidencias" });
        if (veFlota && docsFlota.venc>0) items.push({ ico:"truck", c:B.red, t:`${docsFlota.venc} documento${docsFlota.venc===1?"":"s"} de flota vencido${docsFlota.venc===1?"":"s"}`, ir:"unidades" });
        if (veFlota && docsFlota.pronto>0) items.push({ ico:"truck", c:B.orange, t:`${docsFlota.pronto} documento${docsFlota.pronto===1?"":"s"} de flota vence${docsFlota.pronto===1?"":"n"} en 30 días`, ir:"unidades" });
        if (veFinanzas && alertasFin.mant.length>0) items.push({ ico:"wrench", c:B.red, t:`Mantenimiento vencido: ${alertasFin.mant.slice(0,4).join(", ")}${alertasFin.mant.length>4?"…":""}`, ir:"gastos" });
        return (
          <div style={{ ...CARD, padding:"16px 18px" }}>
            <div style={{ fontSize:13, fontWeight:700, color:B.textPri, marginBottom:items.length?12:0, display:"flex", alignItems:"center", gap:8 }}>
              <Ico n={items.length?"alert":"check"} size={16} color={items.length?B.orange:B.green}/> {items.length?"Atención requerida":"Todo en orden: sin alertas pendientes"}
            </div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:10 }}>
              {items.map((it,i)=>(
                <button key={i} onClick={()=>onIr&&onIr(it.ir)}
                  style={{ display:"flex", alignItems:"center", gap:8, background:`${it.c}10`, border:`1px solid ${it.c}33`, color:B.textPri,
                    borderRadius:10, padding:"8px 12px", fontSize:12, fontWeight:600, cursor:"pointer" }}>
                  <Ico n={it.ico} size={15} color={it.c}/>{it.t}<Ico n="arrow" size={13} color={B.textMut}/>
                </button>
              ))}
            </div>
          </div>
        );
      })()}

        {/* Resumen automático */}
        <div style={{ ...CARD, padding:"16px 18px" }}>
          <div style={{ fontSize:13, fontWeight:700, color:B.textPri, marginBottom:12, display:"flex", alignItems:"center", gap:8 }}>
            <Ico n="sparkles" size={16} color={B.gold}/> Resumen del día
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:9 }}>
            {insights.map((frase,i)=>(
              <div key={i} style={{ display:"flex", gap:9, fontSize:13, color:B.textSec, lineHeight:1.45 }}>
                <span style={{ width:6, height:6, borderRadius:"50%", background:B.gold, marginTop:7, flexShrink:0 }}/>
                <span>{frase.replace(/^\P{L}+/u,"")}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <ComparativoMes pedidos={pedidos} ingExtra={ingExtra} cobraPedido={cobraPedido}/>


      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 340px", gap:14, marginBottom:14 }}>
        {/* Tendencia 7 días */}
        <div style={{ ...CARD, padding:18, gridColumn:"span 2" }}>
          <div style={{ fontSize:13, fontWeight:700, color:B.textPri, marginBottom:4 }}>Tendencia — últimos 7 días</div>
          <div style={{ fontSize:11, color:B.textMut, marginBottom:10 }}>
            <span style={{ color:B.green, fontWeight:700 }}>■</span> Entregados · Barra completa = total del día
          </div>
          <SerieDiaria datos={serie7dias}/>
        </div>

        {/* Dona de estados */}
        <div style={{ ...CARD, padding:18 }}>
          <div style={{ fontSize:12, fontWeight:700, color:B.textPri, marginBottom:12 }}>Estado de pedidos</div>
          <div style={{ display:"flex", alignItems:"center", gap:16 }}>
            <DonutChart segments={porEstado.map(e=>({ value:e.count, color:e.color }))} size={110}/>
            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
              {porEstado.map(e=>(
                <div key={e.estado} style={{ display:"flex", alignItems:"center", gap:6, fontSize:11 }}>
                  <span style={{ width:8, height:8, borderRadius:2, background:e.color, display:"inline-block" }}/>
                  <span style={{ color:B.textSec }}>{e.label}</span>
                  <span style={{ fontWeight:700, color:B.navy, marginLeft:"auto" }}>{e.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 340px", gap:14 }}>
        {/* Pedidos recientes */}
        <div style={{ ...CARD, overflow:"hidden", gridColumn:"span 2" }}>
          <div style={{ padding:"14px 18px", borderBottom:`1px solid ${B.border}`,
            display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <span style={{ fontSize:13, fontWeight:700, color:B.textPri }}>Pedidos recientes</span>
            <button onClick={()=>onIr&&onIr("pedidos")} style={{ display:"inline-flex", alignItems:"center", gap:5, fontSize:12, fontWeight:600, color:B.goldDk, background:"none", border:"none", cursor:"pointer" }}>Ver todos <Ico n="arrow" size={13}/></button>
          </div>
          <table className="bz-tabla" style={{ width:"100%", borderCollapse:"collapse" }}>
            <thead>
              <tr>{["Tracking","N° orden","Destinatario","Distrito","Servicio","Repartidor","Estado","Fecha"].map(h=><Th key={h}>{h}</Th>)}</tr>
            </thead>
            <tbody>
              {recientes.map((p,i) => (
                <tr key={p.id}>
                  <td style={{ padding:"10px 14px", fontSize:12, fontWeight:700, color:B.navy }}>{p.omd}</td>
                  <td style={{ padding:"10px 14px", fontSize:12, color:B.textSec }}>{p.cliente_referencia||"—"}</td>
                  <td style={{ padding:"10px 14px", fontSize:12, color:B.textPri }}>{p.dest_nombre}</td>
                  <td style={{ padding:"10px 14px", fontSize:12, color:B.textSec }}>{p.dest_distrito||"—"}</td>
                  <td style={{ padding:"10px 14px" }}>
                    {p.tipo_servicio && BADGE_SERVICIO[p.tipo_servicio] ? (
                      <span style={{ fontSize:10, fontWeight:700, padding:"3px 8px", borderRadius:8,
                        background: BADGE_SERVICIO[p.tipo_servicio].bg,
                        color: BADGE_SERVICIO[p.tipo_servicio].color }}>
                        {BADGE_SERVICIO[p.tipo_servicio].label}
                      </span>
                    ) : <span style={{ fontSize:11, color:B.textMut }}>—</span>}
                  </td>
                  <td style={{ padding:"10px 14px", fontSize:12, color:B.textSec }}>
  {repartidores.find(r=>r.id===p.repartidor_id) ?
    `${repartidores.find(r=>r.id===p.repartidor_id).nombres} ${repartidores.find(r=>r.id===p.repartidor_id).apellidos}` : "—"}
</td>
                  <td style={{ padding:"10px 14px" }}><Chip estado={p.estado}/></td>
                  <td style={{ padding:"10px 14px", fontSize:11, color:B.textMut }}>{fmt.fecha(p.created_at)}</td>
                </tr>
              ))}
              {recientes.length===0&&<tr><td colSpan={8} style={{ padding:32, textAlign:"center",
                color:B.textMut, fontSize:13 }}>No hay pedidos aún</td></tr>}
            </tbody>
          </table>
        </div>

        {/* Top repartidores */}
        <div style={{ ...CARD, padding:18 }}>
          <div style={{ fontSize:12, fontWeight:700, color:B.textPri, marginBottom:12 }}>Top repartidores</div>
          {[...repartidores].map(r=>{
            const count = pedidos.filter(p=>p.repartidor_id===r.id).length;
            const ent = pedidos.filter(p=>p.repartidor_id===r.id&&p.estado==="entregado").length;
            return { ...r, count, ent, ef: count?Math.round(ent/count*100):0 };
          }).sort((a,b)=>b.count-a.count).slice(0,5).map(r => (
            <div key={r.id} style={{ padding:"8px 0", borderBottom:`1px solid ${B.border}` }}>
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6 }}>
                <div style={{ width:32, height:32, borderRadius:"50%",
                  background:`linear-gradient(135deg,${B.navy},${B.navyLt||"#1E3A6E"})`,
                  display:"flex", alignItems:"center", justifyContent:"center",
                  fontSize:12, fontWeight:700, color:B.gold, flexShrink:0 }}>
                  {r.nombres?.[0]}{r.apellidos?.[0]}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:12, color:B.textPri, fontWeight:600 }}>{r.nombres} {r.apellidos}</div>
                  <div style={{ fontSize:10, color:B.textMut }}>{r.ent}/{r.count} entregados</div>
                </div>
                <div style={{ fontSize:16, fontWeight:800, color:B.gold }}>{r.count}</div>
              </div>
              <div style={{ height:4, background:B.bg, borderRadius:3, overflow:"hidden" }}>
                <div style={{ height:"100%", width:`${r.ef}%`, borderRadius:3,
                  background: r.ef>=80?B.green:r.ef>=60?B.gold:B.red }}/>
              </div>
            </div>
          ))}
          {repartidores.length===0 && (
            <div style={{ padding:20, textAlign:"center", color:B.textMut, fontSize:12 }}>Sin repartidores</div>
          )}
        </div>
      </div>
    </div>
  );
}

