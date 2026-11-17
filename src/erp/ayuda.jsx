// BOAZ ERP — módulo "ayuda": Primeros pasos y glosario (parte de BoazERP; ver src/BoazERP.jsx)
import { useState, useMemo } from "react";
import { B, CARD, GLOSARIO, Ico, Buscador, BtnPri, BtnSec } from "./base.jsx";

// Qué tiene que pasar para que cada paso cuente como hecho (se calcula con los datos ya cargados en el ERP)
const PASOS = [
  { id:"cliente", ir:"clientes", titulo:"Registra a tus clientes", ico:"building",
    que:"Cada empresa a la que le haces entregas o le prestas unidades. Con su RUC, contacto y la línea de negocio.",
    listo:(d)=>d.empresas.length>0, meta:(d)=>`${d.empresas.length} cliente${d.empresas.length===1?"":"s"}` },
  { id:"cobro", ir:"clientes", titulo:"Define cómo se le cobra a cada uno", ico:"dollar",
    que:"En la tarjeta del cliente abre «Cómo se cobra»: marca la modalidad (por pedido, por vehículo o por viaje) y configura sus tarifas. Sin esto la pre-facturación no sabe qué sumar. Las tarifas base están en Configuración → Tarifarios y servicios.",
    listo:(d)=>d.empresas.length>0 && d.empresas.every(e=>Array.isArray(e.modalidades_tarifa) && e.modalidades_tarifa.length>0),
    meta:(d)=>{ const n=d.empresas.filter(e=>!(Array.isArray(e.modalidades_tarifa)&&e.modalidades_tarifa.length)).length; return n ? `${n} sin modalidad` : "todos configurados"; } },
  { id:"repartidores", ir:"repartidores", titulo:"Registra repartidores y unidades", ico:"bike",
    que:"Repartidores con su usuario y PIN para la app, y en Flota las unidades (placa y tipo de vehículo) que se asignan a clientes por día.",
    listo:(d)=>d.repartidores.length>0, meta:(d)=>`${d.repartidores.length} repartidor${d.repartidores.length===1?"":"es"} · ${d.unidades.length} unidad${d.unidades.length===1?"":"es"}` },
  { id:"pedidos", ir:"pedidos", titulo:"Carga los pedidos del día", ico:"package",
    que:"Uno por uno con «Nuevo pedido» o en bloque desde un Excel con «Carga masiva». La tarifa se calcula sola según el cliente.",
    listo:(d)=>d.pedidos.length>0, meta:(d)=>`${d.pedidos.length} pedido${d.pedidos.length===1?"":"s"}` },
  { id:"asignar", ir:"pedidos", titulo:"Asigna y sigue las entregas", ico:"map",
    que:"Asigna cada pedido a un repartidor (en la fila o en bloque). El repartidor lo ve en su app, inicia ruta, toma fotos y marca entregado. Tú lo sigues en el Dashboard y en el mapa.",
    listo:(d)=>d.pedidos.some(p=>p.estado==="entregado"), meta:(d)=>{ const n=d.pedidos.filter(p=>p.estado==="entregado").length; return `${n} entregado${n===1?"":"s"}`; } },
  { id:"servicios", ir:"servicios", titulo:"Registra viajes, recojos y servicios cotizados", ico:"filetext",
    que:"Lo que cobras fuera de los pedidos: un recojo, un viaje acordado o un servicio con precio cotizado. Se suma a la pre-facturación del cliente.",
    listo:()=>null, meta:()=>"cuando aplique" },
  { id:"cierre", ir:"liquidacion-clientes", titulo:"Cierra el período en Pre-facturación", ico:"receipt",
    que:"Elige cliente y fechas: verás pedidos, unidades y servicios con el total a facturar. Expórtalo o genera la liquidación formato Boaz para enviarla al cliente.",
    listo:()=>null, meta:()=>"cada quincena o mes" },
  { id:"factura", ir:"facturacion", titulo:"Registra la factura y cóbrala", ico:"banknote",
    que:"En Facturación registras la factura emitida (con detracción si aplica). En Cobranza ves la antigüedad de lo pendiente y registras el pago cuando llega.",
    listo:(d)=>d.facturas>0, meta:(d)=>d.facturas>0 ? `${d.facturas} factura${d.facturas===1?"":"s"}` : "aún ninguna" },
  { id:"pagos", ir:"liquidaciones", titulo:"Paga a tu equipo y registra gastos", ico:"wallet",
    que:"Liq. Repartidores calcula lo que le debes a cada uno; Planilla lleva al personal fijo; Gastos registra combustible, mantenimiento y otros. Todo esto baja al margen en el Dashboard de Finanzas.",
    listo:()=>null, meta:()=>"cada período" },
  { id:"usuarios", ir:"usuarios", titulo:"Da acceso a tu equipo", ico:"shield",
    que:"Crea el usuario en Supabase (Authentication → Users) y luego, en Usuarios y auditoría, asígnale nombre y rol. En Roles y permisos defines qué módulos ve cada rol.",
    listo:(d)=>d.usuarios>1, meta:(d)=>`${d.usuarios} usuario${d.usuarios===1?"":"s"}` },
];

const PREGUNTAS = [
  ["¿Por qué un pedido sale con tarifa S/ 0.00?", "Se creó desde el portal del cliente o antes de configurar su tarifario. En Pedidos, filtra «Solo sin tarifa», selecciónalos y usa «Recalcular tarifa»."],
  ["¿Por qué un cliente no aparece en la pre-facturación por pedido?", "No tiene marcada la modalidad «por pedido» (se le cobra por unidad o por viaje). Si también debe cobrarse por pedido, actívalo en Clientes → «Cómo se cobra»."],
  ["¿Qué diferencia hay entre Pre-facturación y Facturación?", "Pre-facturación es el cálculo de lo que corresponde cobrar en un período, para revisarlo y acordarlo con el cliente. Facturación es el registro de la factura ya emitida."],
  ["¿Cómo agrego un repartidor a la app?", "En Repartidores, al crearlo o editarlo, define su usuario y PIN en «Acceso a la app». Él entra en boaz-erp.netlify.app/app con esos datos."],
  ["¿Cómo doy acceso a un cliente a su portal?", "Crea su usuario en Supabase → tabla clientes_usuarios con el ID de su empresa, usuario y PIN. Entra en boaz-erp.netlify.app/cliente."],
  ["¿Qué pasa si el repartidor no tiene señal?", "La app guarda la entrega y las fotos en el celular y las envía cuando vuelve la conexión. Arriba verá «N por sincronizar»."],
  ["¿Los montos incluyen IGV?", "No. Todas las tarifas y subtotales del ERP son sin IGV; se suma el 18% solo en los totales a facturar."],
  ["¿Por qué el margen del Dashboard bajó?", "Desde la versión de finanzas conectadas, el margen resta también liquidaciones pagadas, planilla y terceros, no solo los gastos. Es el número real."],
  ["¿Cómo imprimo etiquetas con código de barras?", "En Pedidos, selecciona los pedidos y usa «Etiquetas» en la barra de acciones. Se abre una vista lista para imprimir."],
  ["¿Cómo cambio qué ve cada usuario?", "Usuarios y auditoría → Roles y permisos. Marca los módulos de cada rol. El cambio aplica de inmediato."],
];

export function PrimerosPasos({ empresas=[], repartidores=[], unidades=[], pedidos=[], nFacturas=0, nUsuarios=1, onIr }) {
  const d = { empresas, repartidores, unidades, pedidos, facturas:nFacturas, usuarios:nUsuarios };
  const [busq, setBusq] = useState("");
  const [abierta, setAbierta] = useState(null);
  const estados = PASOS.map(p => p.listo(d));
  const hechos = estados.filter(x=>x===true).length, evaluables = estados.filter(x=>x!==null).length;
  const q = busq.trim().toLowerCase();
  const glos = useMemo(() => Object.entries(GLOSARIO).map(([k,[t,txt]])=>({ k, t, txt })).sort((a,b)=>a.t.localeCompare(b.t)).filter(g => !q || `${g.t} ${g.txt}`.toLowerCase().includes(q)), [q]);
  const preg = PREGUNTAS.filter(([a,b]) => !q || `${a} ${b}`.toLowerCase().includes(q));
  return (
    <div>
      <div style={{ ...CARD, padding:"18px 20px", marginBottom:16, display:"flex", gap:16, alignItems:"center", flexWrap:"wrap", background:`linear-gradient(135deg,${B.navy},${B.navyLt})`, border:"none" }}>
        <div style={{ width:44, height:44, borderRadius:12, background:"#FFFFFF1A", display:"flex", alignItems:"center", justifyContent:"center", color:B.goldLt, flexShrink:0 }}><Ico n="book" size={24}/></div>
        <div style={{ flex:1, minWidth:220 }}>
          <div style={{ fontSize:16, fontWeight:800, color:"#fff" }}>Cómo se trabaja en Boaz ERP</div>
          <div style={{ fontSize:13, color:"#B9C6D6", marginTop:2 }}>El flujo completo, de registrar un cliente a cobrar la factura. Cada paso se marca solo cuando ya tienes datos.</div>
        </div>
        <div style={{ textAlign:"right" }}>
          <div style={{ fontSize:24, fontWeight:800, color:B.goldLt, lineHeight:1 }}>{hechos}/{evaluables}</div>
          <div style={{ fontSize:11, color:"#B9C6D6" }}>pasos con datos</div>
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))", gap:12, marginBottom:24 }}>
        {PASOS.map((p,i) => { const ok = estados[i]; return (
          <div key={p.id} className="bz-card-hover" style={{ ...CARD, padding:16, display:"flex", gap:12, borderLeft:`3px solid ${ok===true?"#047857":ok===false?B.gold:B.border}` }}>
            <div style={{ width:30, height:30, borderRadius:"50%", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:800,
              background: ok===true ? "#ECFDF5" : "#F1F5F9", color: ok===true ? "#047857" : B.textSec }}>{ok===true ? <Ico n="check" size={16}/> : i+1}</div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:13.5, fontWeight:700, color:B.textPri, display:"flex", alignItems:"center", gap:8 }}><Ico n={p.ico} size={15} color={B.textMut}/>{p.titulo}</div>
              <div style={{ fontSize:12.5, color:B.textSec, marginTop:6, lineHeight:1.5 }}>{p.que}</div>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:10, gap:8 }}>
                <span style={{ fontSize:11.5, color: ok===false ? "#B45309" : B.textMut, fontWeight: ok===false ? 600 : 400 }}>{p.meta(d)}</span>
                <button onClick={()=>onIr && onIr(p.ir)} style={{ display:"inline-flex", alignItems:"center", gap:4, fontSize:12, fontWeight:600, color:B.goldDk, background:"none", border:"none", cursor:"pointer", padding:0 }}>Ir <Ico n="arrow" size={13}/></button>
              </div>
            </div>
          </div>); })}
      </div>

      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:12, flexWrap:"wrap" }}>
        <div style={{ fontSize:15, fontWeight:800, color:B.navy }}>Preguntas frecuentes y glosario</div>
        <Buscador value={busq} onChange={setBusq} placeholder="Buscar una palabra o pregunta" width={320}/>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"minmax(0,1.2fr) minmax(0,1fr)", gap:14, alignItems:"start" }}>
        <div style={{ ...CARD, overflow:"hidden" }}>
          <div style={{ padding:"12px 16px", borderBottom:`1px solid ${B.border}`, fontSize:13, fontWeight:700, color:B.textPri }}>Preguntas frecuentes</div>
          {preg.length===0 && <div style={{ padding:20, fontSize:12.5, color:B.textMut }}>Ninguna pregunta coincide.</div>}
          {preg.map(([a,b],i) => (
            <div key={i} style={{ borderBottom: i<preg.length-1 ? `1px solid ${B.border}` : "none" }}>
              <button onClick={()=>setAbierta(abierta===a?null:a)} style={{ width:"100%", textAlign:"left", display:"flex", justifyContent:"space-between", alignItems:"center", gap:10, padding:"11px 16px", background:"none", border:"none", cursor:"pointer", fontSize:13, fontWeight:600, color:B.textPri }}>
                {a}<Ico n={abierta===a?"chevup":"chevdown"} size={15} color={B.textMut}/></button>
              {(abierta===a || q) && <div style={{ padding:"0 16px 12px", fontSize:12.5, color:B.textSec, lineHeight:1.55 }}>{b}</div>}
            </div>))}
        </div>
        <div style={{ ...CARD, overflow:"hidden" }}>
          <div style={{ padding:"12px 16px", borderBottom:`1px solid ${B.border}`, fontSize:13, fontWeight:700, color:B.textPri, display:"flex", alignItems:"center", gap:8 }}>Glosario <span style={{ fontSize:11, fontWeight:600, color:B.textMut }}>· también aparece en los <Ico n="help" size={12} style={{ display:"inline-block", verticalAlign:"-2px" }}/> del sistema</span></div>
          <div style={{ maxHeight:520, overflowY:"auto" }}>
            {glos.length===0 && <div style={{ padding:20, fontSize:12.5, color:B.textMut }}>Ningún término coincide.</div>}
            {glos.map(g => (
              <div key={g.k} style={{ padding:"10px 16px", borderBottom:`1px solid ${B.border}` }}>
                <div style={{ fontSize:13, fontWeight:700, color:B.navy }}>{g.t}</div>
                <div style={{ fontSize:12.5, color:B.textSec, marginTop:2, lineHeight:1.5 }}>{g.txt}</div>
              </div>))}
          </div>
        </div>
      </div>
    </div>
  );
}
