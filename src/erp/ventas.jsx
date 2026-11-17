// BOAZ ERP — módulo "ventas" (parte de BoazERP; ver src/BoazERP.jsx)
import { useState, useEffect, useCallback, useRef, useMemo, Fragment } from "react";
import { Ayuda, B, BtnIco, BtnPri, BtnSec, Buscador, CARD, Cargando, Confirm, EstadoVacio, Etiqueta, Ico, Kpi, KpiDS, TAB_CONT, TAB_SEG, TD, TDN, TDS, Tabs, Th, XLSX, asegurarXLSX, diaLocal, escHTML, fmt, inp, lbl, sb, traerTodo, usePaginacion } from "./base.jsx";
import { clienteCobraPorPedido } from "./dashboard.jsx";
import { TIPOS_SERV, cargarServicios, montoAsignacionPeriodo } from "./operacion.jsx";
import { solN } from "./costos.jsx";

// ══════════════════════════════════════════════════════════════
// MÓDULO 5: LIQUIDACIONES
// ══════════════════════════════════════════════════════════════
export function Liquidaciones({ repartidores, pedidos, toast, onRefresh }) {
  const [sel, setSel] = useState("");
  const [fechaInicio, setFechaInicio] = useState(diaLocal());
  const [fechaFin, setFechaFin] = useState(diaLocal());
  const [generando, setGenerando] = useState(false);
  const [historial, setHistorial] = useState([]);

  useEffect(() => {
    sb.from("liquidaciones").select("*,repartidores(nombres,apellidos)")
      .order("created_at",{ascending:false}).then(({data})=>{ if(data) setHistorial(data); });
  }, []);

  const pedidosFiltrados = pedidos.filter(p =>
    p.repartidor_id===sel && p.estado==="entregado" &&
    p.fecha_entrega >= fechaInicio && p.fecha_entrega <= fechaFin+"T23:59:59"
  );
  const total = pedidosFiltrados.reduce((a,p)=>a+(parseFloat(p.tarifa_s)||0),0);
  const rep = repartidores.find(r=>r.id===sel);

  const generar = async () => {
    if (!sel) { toast("Selecciona un repartidor","error"); return; }
    if (pedidosFiltrados.length===0) { toast("No hay pedidos entregados en el rango","warn"); return; }
    setGenerando(true);
    const { data: liq, error } = await sb.from("liquidaciones").insert([{
      repartidor_id:sel, fecha: fechaFin,
      total_pedidos:pedidosFiltrados.length, total_entregados:pedidosFiltrados.length,
      monto_ganado_s:total, estado:"pendiente",
    }]).select().single();
    if (error) { toast("Error: "+error.message,"error"); setGenerando(false); return; }
    await sb.from("liquidacion_pedidos").insert(
      pedidosFiltrados.map(p=>({liquidacion_id:liq.id,pedido_id:p.id,tarifa_s:p.tarifa_s}))
    );
    toast("Liquidación generada ✓");
    setGenerando(false);
    const { data } = await sb.from("liquidaciones").select("*,repartidores(nombres,apellidos)").order("created_at",{ascending:false});
    if (data) setHistorial(data);
  };

  const marcarPagado = async (id) => {
    // Guarda la fecha de pago (la usa Finanzas). Si la columna aún no existe, marca solo el estado.
    let { error } = await sb.from("liquidaciones").update({estado:"pagado", fecha_pago:diaLocal()}).eq("id",id);
    if (error) ({ error } = await sb.from("liquidaciones").update({estado:"pagado"}).eq("id",id));
    if (error) { toast("Error: "+error.message,"error"); return; }
    toast("Marcado como pagado ✓ — ya cuenta como egreso en Finanzas");
    const { data } = await sb.from("liquidaciones").select("*,repartidores(nombres,apellidos)").order("created_at",{ascending:false});
    if (data) setHistorial(data);
  };

  return (
    <div>
      {/* Generador */}
      <div style={{ background:B.white, border:`1px solid ${B.border}`, borderRadius:12,
        padding:24, marginBottom:20, boxShadow:"0 1px 2px #0D1E3D0D" }}>
        <div style={{ fontSize:14, fontWeight:800, color:B.navy, marginBottom:16 }}>Generar nueva liquidación</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr auto", gap:14, alignItems:"flex-end" }}>
          <div>
            <label style={lbl}>Repartidor</label>
            <select style={inp} value={sel} onChange={e=>setSel(e.target.value)}>
              <option value="">— Selecciona —</option>
              {repartidores.map(r=><option key={r.id} value={r.id}>{r.nombres} {r.apellidos}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Fecha inicio</label>
            <input type="date" style={inp} value={fechaInicio} onChange={e=>setFechaInicio(e.target.value)}/>
          </div>
          <div>
            <label style={lbl}>Fecha fin</label>
            <input type="date" style={inp} value={fechaFin} onChange={e=>setFechaFin(e.target.value)}/>
          </div>
          <BtnPri onClick={generar} disabled={generando||!sel} style={{ whiteSpace:"nowrap" }}>
            {generando?"Generando...":"Generar"}
          </BtnPri>
        </div>

        {sel && (
          <div style={{ display:"flex", gap:24, marginTop:20, padding:16,
            background:B.bg, borderRadius:10, alignItems:"center" }}>
            <div style={{ textAlign:"center" }}>
              <div style={{ fontSize:28, fontWeight:800, color:B.gold }}>{pedidosFiltrados.length}</div>
              <div style={{ fontSize:10, color:B.textMut, textTransform:"uppercase" }}>Entregas</div>
            </div>
            <div style={{ textAlign:"center" }}>
              <div style={{ fontSize:24, fontWeight:800, color:B.navy }}>{fmt.sol(total)}</div>
              <div style={{ fontSize:10, color:B.textMut, textTransform:"uppercase" }}>Total a pagar</div>
            </div>
            <div style={{ textAlign:"center" }}>
              <div style={{ fontSize:20, fontWeight:800, color:B.green }}>{fmt.sol(total*0.18)}</div>
              <div style={{ fontSize:10, color:B.textMut, textTransform:"uppercase" }}>IGV estimado</div>
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:12, color:B.textSec }}>Repartidor: <strong>{rep?.nombres} {rep?.apellidos}</strong></div>
              <div style={{ fontSize:12, color:B.textSec }}>Período: {fmt.fecha(fechaInicio)} — {fmt.fecha(fechaFin)}</div>
            </div>
          </div>
        )}
      </div>

      {/* Historial */}
      <div style={{ fontSize:14, fontWeight:800, color:B.navy, marginBottom:12 }}>Historial de liquidaciones</div>
      <div style={{ background:B.white, border:`1px solid ${B.border}`, borderRadius:12,
        overflow:"hidden", boxShadow:"0 1px 2px #0D1E3D0D" }}>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead>
            <tr style={{ background:"#F6F9FC" }}>
              {["Repartidor","Fecha","Pedidos","Total","Estado","Acciones"].map(h=>(
                <th key={h} style={{ padding:"10px 16px", textAlign:"left", fontSize:11, color:B.textSec, fontWeight:700, letterSpacing:"0.3px", whiteSpace:"nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {historial.map((l,i)=>(
              <tr key={l.id} style={{ borderTop:`1px solid ${B.border}`,
                background:B.white }}>
                <td style={{ padding:"12px 16px", fontSize:12, fontWeight:600, color:B.navy }}>
                  {l.repartidores?.nombres} {l.repartidores?.apellidos}
                </td>
                <td style={{ padding:"12px 16px", fontSize:12, color:B.textSec }}>{fmt.fecha(l.fecha)}</td>
                <td style={{ padding:"12px 16px", fontSize:12, color:B.textSec }}>{l.total_entregados}</td>
                <td style={{ padding:"12px 16px", fontSize:13, fontWeight:800, color:B.navy }}>{fmt.sol(l.monto_ganado_s)}</td>
                <td style={{ padding:"12px 16px" }}>
                  <span style={{ fontSize:11, padding:"3px 10px", borderRadius:20, fontWeight:700,
                    background: l.estado==="pagado"?"#ECFDF5":"#FFFBEB",
                    color: l.estado==="pagado"?B.green:B.goldDk,
                    border:`1px solid ${l.estado==="pagado"?B.green+"44":B.gold+"44"}` }}>
                    {l.estado==="pagado"?"✓ Pagado":"Pendiente"}
                  </span>
                </td>
                <td style={{ padding:"12px 16px" }}>
                  {l.estado!=="pagado" && (
                    <button onClick={()=>marcarPagado(l.id)}
                      style={{ fontSize:11, color:B.green, background:"none",
                        border:`1px solid ${B.green}`, padding:"4px 10px",
                        borderRadius:6, cursor:"pointer", fontWeight:600 }}>
                      Marcar pagado
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {historial.length===0&&<tr><td colSpan={6} style={{ padding:32,
              textAlign:"center", color:B.textMut, fontSize:13 }}><EstadoVacio icono="wallet" titulo="Aún no hay liquidaciones de repartidores" texto="Una liquidación calcula lo que Boaz le paga a un repartidor por un período: sus entregas por la tarifa acordada, o su sueldo fijo prorrateado."
                pasos={["Arriba elige el repartidor y el rango de fechas y pulsa «Generar».","Revisa el detalle; si está bien, «Marcar pagado» cuando le pagues. Desde ese momento cuenta como egreso en Finanzas."]}/></td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// MÓDULO 6: FACTURACIÓN
// ══════════════════════════════════════════════════════════════
export function Facturacion({ empresas, pedidos, tiposServicio, usuario, toast }) {
  const [facturas, setFacturas] = useState([]);
  const [modal, setModal] = useState(false);
  const [modalPago, setModalPago] = useState(null); // factura seleccionada para marcar pagada
  const [editandoFactura, setEditandoFactura] = useState(null);
  const [filtroPago, setFiltroPago] = useState("todas");
  const facturaVacia = () => ({
    empresa_id:"", serie:"E001", numero:"", descripcion:
    "Servicio de transporte y distribución multipunto - Same Day",
    cantidad:1, valor_unit_s:"", fecha_emision: diaLocal(),
    tipo_servicio_id:"", aplica_detraccion:false, porcentaje_detraccion:"",
  });
  const [f, setF] = useState(facturaVacia());

  const abrirNuevaFactura = () => { setEditandoFactura(null); setF(facturaVacia()); setModal(true); };

  const cargarFacturas = () => {
    traerTodo(() => sb.from("facturas").select("*,empresas(nombre)").order("created_at",{ascending:false}).order("id"))
      .then(({data})=>{ if(data) setFacturas(data); });
  };
  useEffect(()=>{ cargarFacturas(); },[]);

  const marcarPagado = async (fecha, banco, numeroOperacion) => {
    const { error } = await sb.from("facturas").update({
      estado_pago:"pagado", fecha_pago: fecha,
      banco_pago: banco||null, numero_operacion: numeroOperacion||null,
    }).eq("id", modalPago.id);
    if (error) { toast("Error: "+error.message,"error"); return; }
    toast("Factura marcada como pagada ✓");
    setModalPago(null);
    cargarFacturas();
  };

  const facturasFiltradas = facturas.filter(fa =>
    filtroPago==="todas" || (fa.estado_pago||"pendiente")===filtroPago
  );

  const totalFacturado = facturas.reduce((a,fa)=>a+(parseFloat(fa.total_s)||0),0);
  const totalCobrado = facturas.filter(fa=>fa.estado_pago==="pagado").reduce((a,fa)=>a+(parseFloat(fa.total_s)||0),0);
  const totalPorCobrar = totalFacturado - totalCobrado;
  const [busq, setBusq] = useState("");
  const nPend = facturas.filter(fa=>fa.estado_pago!=="pagado").length;
  const qf = busq.trim().toLowerCase();
  const filasFact = !qf ? facturasFiltradas : facturasFiltradas.filter(fa => `${fa.serie}-${fa.numero} ${fa.empresas?.nombre||""}`.toLowerCase().includes(qf));
  const pg = usePaginacion(filasFact, 25, "facturas");

  const seleccionarTipoServicio = (id) => {
    const t = tiposServicio.find(ts=>ts.id===id);
    setF(p=>({
      ...p, tipo_servicio_id:id,
      descripcion: t ? `Servicio de ${t.nombre} (${t.unidad_medida||"—"})` : p.descripcion,
      valor_unit_s: t?.tarifa_base ? String(t.tarifa_base) : p.valor_unit_s,
    }));
  };

  const igv = parseFloat(f.valor_unit_s||0) * 0.18;
  const total = parseFloat(f.valor_unit_s||0) * 1.18;
  const montoDetraccion = f.aplica_detraccion ? total * (parseFloat(f.porcentaje_detraccion||0)/100) : 0;
  const netoACobrar = total - montoDetraccion;

  const guardar = async () => {
    if (!f.empresa_id || !f.valor_unit_s || !f.numero) {
      toast("Completa empresa, número y valor","error"); return;
    }
    const payload = {
      empresa_id: f.empresa_id, serie: f.serie, numero: f.numero,
      descripcion: f.descripcion, cantidad: f.cantidad, valor_unit_s: f.valor_unit_s,
      fecha_emision: f.fecha_emision, tipo_servicio_id: f.tipo_servicio_id||null,
      igv_s: igv, total_s: total,
      porcentaje_detraccion: f.aplica_detraccion ? (parseFloat(f.porcentaje_detraccion)||0) : 0,
      monto_detraccion: montoDetraccion,
      unidad_medida:"ZZ",
    };
    let error;
    if (editandoFactura) {
      ({ error } = await sb.from("facturas").update(payload).eq("id", editandoFactura.id));
    } else {
      ({ error } = await sb.from("facturas").insert([{ ...payload, estado:"emitida", estado_pago:"pendiente" }]));
    }
    if (error) { toast("Error: "+error.message,"error"); return; }
    toast(editandoFactura ? "Factura actualizada ✓" : "Factura registrada ✓");
    setModal(false);
    setEditandoFactura(null);
    cargarFacturas();
  };

  return (
    <div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:14, marginBottom:20 }}>
        <Kpi icon="receipt" label="Total facturado" valor={fmt.sol(totalFacturado)} sub={`${facturas.length} factura${facturas.length===1?"":"s"}`} color={B.navy}/>
        <Kpi icon="check" label="Cobrado" valor={fmt.sol(totalCobrado)} sub={totalFacturado>0 ? `${Math.round(totalCobrado/totalFacturado*100)}% del total` : null} color={B.green}/>
        <Kpi icon="clock" label="Por cobrar" valor={fmt.sol(totalPorCobrar)} sub={`${nPend} pendiente${nPend===1?"":"s"}`} color={B.red}/>
      </div>

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:10, flexWrap:"wrap", marginBottom:12 }}>
        <div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" }}>
          <Tabs valor={filtroPago} onChange={setFiltroPago}
            tabs={[{ id:"todas", l:"Todas", n:facturas.length }, { id:"pendiente", l:"Por cobrar", n:nPend }, { id:"pagado", l:"Cobradas", n:facturas.length-nPend }]}/>
          <Buscador value={busq} onChange={setBusq} placeholder="Buscar por cliente o número" width={260}/>
        </div>
        <BtnPri onClick={abrirNuevaFactura}><Ico n="plus" size={15} sw={2.4}/> Registrar factura</BtnPri>
      </div>

      <div style={{ ...CARD, overflow:"hidden" }}>
        <div style={{ overflowX:"auto" }}>
        <table className="bz-tabla" style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead>
            <tr>
              <Th>N° factura</Th><Th>Cliente</Th><Th>Emisión</Th><Th align="right">IGV</Th><Th align="right">Total</Th>
              <Th align="right" ayuda="detraccion">Detracción</Th><Th align="right" ayuda="detraccion">Neto a cobrar</Th><Th>Estado</Th><Th>Pago</Th><Th align="right"></Th>
            </tr>
          </thead>
          <tbody>
            {pg.visibles.map((fa)=>(
              <tr key={fa.id}>
                <td style={{ ...TD, fontWeight:700, color:B.navy, whiteSpace:"nowrap" }}>{fa.serie}-{fa.numero}</td>
                <td style={TD}>{fa.empresas?.nombre||"—"}</td>
                <td style={{ ...TDS, whiteSpace:"nowrap" }}>{fmt.fecha(fa.fecha_emision)}</td>
                <td style={{ ...TDN, color:B.textSec }}>{fmt.sol(fa.igv_s)}</td>
                <td style={{ ...TDN, fontWeight:600 }}>{fmt.sol(fa.total_s)}</td>
                <td style={{ ...TDN, color: fa.monto_detraccion>0?"#B91C1C":B.textMut }}>
                  {fa.monto_detraccion>0 ? <>− {fmt.sol(fa.monto_detraccion)} <span style={{ fontSize:11, color:B.textMut }}>({fa.porcentaje_detraccion}%)</span></> : "—"}
                </td>
                <td style={{ ...TDN, fontWeight:800, color:B.navy }}>
                  {fmt.sol((parseFloat(fa.total_s)||0) - (parseFloat(fa.monto_detraccion)||0))}
                </td>
                <td style={TD}><Etiqueta tono={fa.estado_pago==="pagado"?"ok":"warn"}>{fa.estado_pago==="pagado"?"Pagada":"Pendiente"}</Etiqueta></td>
                <td style={{ ...TDS, whiteSpace:"nowrap" }}>
                  {fa.fecha_pago ? fmt.fecha(fa.fecha_pago) : "—"}
                  {fa.banco_pago && <div style={{ fontSize:12, color:B.textMut }}>{fa.banco_pago}{fa.numero_operacion?` · Op. ${fa.numero_operacion}`:""}</div>}
                </td>
                <td style={{ ...TD, padding:"6px 10px" }}>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"flex-end", gap:4, whiteSpace:"nowrap" }}>
                  {fa.estado_pago!=="pagado" && (
                    <button className="bz-btn-sec" onClick={()=>setModalPago(fa)}
                      style={{ fontSize:12, fontWeight:600, color:"#047857", background:B.white, border:`1px solid ${B.border}`, borderRadius:8, padding:"5px 10px", cursor:"pointer" }}>Registrar pago</button>
                  )}
                  <BtnIco n="edit" title="Editar factura" onClick={()=>{setEditandoFactura(fa); setF({...fa, aplica_detraccion:(fa.porcentaje_detraccion||0)>0, porcentaje_detraccion: fa.porcentaje_detraccion?String(fa.porcentaje_detraccion):""}); setModal(true);}}/>
                  </div>
                </td>
              </tr>
            ))}
            {filasFact.length===0&&<tr><td colSpan={10}>
              <EstadoVacio icono="receipt" titulo={facturas.length===0 ? "Aún no hay facturas registradas" : "Ninguna factura coincide"}
                texto={facturas.length===0 ? "Registra la primera para llevar el control de lo facturado y lo cobrado." : "Cambia el filtro o el texto de búsqueda."}/>
            </td></tr>}
          </tbody>
        </table>
        </div>
        {pg.pie}
      </div>

      {modalPago && (
        <ModalMarcarPagada factura={modalPago} onClose={()=>setModalPago(null)} onConfirmar={marcarPagado}/>
      )}

      {modal && (
        <div style={{ position:"fixed", inset:0, background:"#0008", zIndex:1000,
          display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div style={{ background:B.white, borderRadius:16, padding:28, width:560,
            boxShadow:"0 20px 60px #0003" }}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:20 }}>
              <div style={{ fontSize:15, fontWeight:800, color:B.navy }}>{editandoFactura ? "Editar factura" : "Registrar factura"}</div>
              <button onClick={()=>setModal(false)} style={{ background:"none", border:"none",
                fontSize:18, color:B.textSec, cursor:"pointer" }}>✕</button>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
              <div style={{ gridColumn:"span 2" }}>
                <label style={lbl}>Empresa cliente</label>
                <select style={inp} value={f.empresa_id} onChange={e=>setF(p=>({...p,empresa_id:e.target.value}))}>
                  <option value="">— Selecciona —</option>
                  {empresas.map(e=><option key={e.id} value={e.id}>{e.codigo_interno ? `${e.codigo_interno} — ` : ""}{e.nombre} — RUC: {e.ruc}</option>)}
                </select>
              </div>
              <div><label style={lbl}>Serie</label>
                <input style={inp} value={f.serie} onChange={e=>setF(p=>({...p,serie:e.target.value}))}/></div>
              <div><label style={lbl}>Número</label>
                <input style={inp} placeholder="00000001" value={f.numero} onChange={e=>setF(p=>({...p,numero:e.target.value}))}/></div>
              <div style={{ gridColumn:"span 2" }}>
                <label style={lbl}>Tipo de servicio (opcional — autocompleta descripción y tarifa)</label>
                <select style={inp} value={f.tipo_servicio_id} onChange={e=>seleccionarTipoServicio(e.target.value)}>
                  <option value="">— Ingresar manualmente —</option>
                  {tiposServicio.map(t=><option key={t.id} value={t.id}>{t.codigo} — {t.nombre}</option>)}
                </select>
              </div>
              <div style={{ gridColumn:"span 2" }}>
                <label style={lbl}>Descripción (SUNAT)</label>
                <input style={inp} value={f.descripcion} onChange={e=>setF(p=>({...p,descripcion:e.target.value}))}/>
              </div>
              <div><label style={lbl}>Valor unitario (S/ sin IGV)</label>
                <input type="number" style={inp} value={f.valor_unit_s} onChange={e=>setF(p=>({...p,valor_unit_s:e.target.value}))}/></div>
              <div><label style={lbl}>Fecha emisión</label>
                <input type="date" style={inp} value={f.fecha_emision}
                  onChange={e=>setF(p=>({...p,fecha_emision:e.target.value}))}/></div>
            </div>

            <div style={{ marginTop:14, padding:"12px 14px", background:B.bg, borderRadius:10 }}>
              <label style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer", marginBottom: f.aplica_detraccion?10:0 }}>
                <input type="checkbox" checked={f.aplica_detraccion}
                  onChange={e=>setF(p=>({...p,aplica_detraccion:e.target.checked, porcentaje_detraccion: e.target.checked?(p.porcentaje_detraccion||"10"):""}))}/>
                <span style={{ fontSize:12, fontWeight:600, color:B.textPri }}>Este cliente aplica detracción</span>
              </label>
              {f.aplica_detraccion && (
                <div>
                  <label style={lbl}>Porcentaje de detracción</label>
                  <select style={inp} value={f.porcentaje_detraccion} onChange={e=>setF(p=>({...p,porcentaje_detraccion:e.target.value}))}>
                    <option value="4">4% — servicios en general (más común en transporte/logística)</option>
                    <option value="10">10%</option>
                    <option value="12">12%</option>
                  </select>
                </div>
              )}
            </div>

            {f.valor_unit_s && (
              <div style={{ background:B.bg, borderRadius:10, padding:14, marginTop:14,
                display:"grid", gridTemplateColumns: f.aplica_detraccion ? "1fr 1fr 1fr 1fr 1fr" : "1fr 1fr 1fr", gap:12 }}>
                <div><div style={{ fontSize:10, color:B.textMut }}>VALOR VENTA</div>
                  <div style={{ fontSize:16, fontWeight:700, color:B.navy }}>{fmt.sol(f.valor_unit_s)}</div></div>
                <div><div style={{ fontSize:10, color:B.textMut }}>IGV 18%</div>
                  <div style={{ fontSize:16, fontWeight:700, color:B.orange }}>{fmt.sol(igv)}</div></div>
                <div><div style={{ fontSize:10, color:B.textMut }}>TOTAL</div>
                  <div style={{ fontSize:18, fontWeight:800, color:B.gold }}>{fmt.sol(total)}</div></div>
                {f.aplica_detraccion && (
                  <>
                    <div><div style={{ fontSize:10, color:B.textMut }}>DETRACCIÓN</div>
                      <div style={{ fontSize:16, fontWeight:700, color:B.red }}>- {fmt.sol(montoDetraccion)}</div></div>
                    <div><div style={{ fontSize:10, color:B.textMut }}>NETO A COBRAR</div>
                      <div style={{ fontSize:18, fontWeight:800, color:B.green }}>{fmt.sol(netoACobrar)}</div></div>
                  </>
                )}
              </div>
            )}
            <div style={{ display:"flex", gap:10, marginTop:20, justifyContent:"flex-end" }}>
              <BtnSec onClick={()=>{setModal(false); setEditandoFactura(null);}}>Cancelar</BtnSec>
              <BtnPri onClick={guardar}>{editandoFactura ? "Guardar cambios" : "Registrar factura"}</BtnPri>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// MÓDULO 7: REPORTES
// ══════════════════════════════════════════════════════════════
export const TIPOS_SERVICIO = {
  same_day: { label:"Same Day", color:"#7C3AED", bg:"#F5F3FF" },
  next_day: { label:"Next Day", color:"#0369A1", bg:"#EFF6FF" },
};

// ── Carga dinámica de ExcelJS (para la Liquidación de Entregas con estilo) ──
// La librería "xlsx" que ya usamos en el resto del sistema no soporta colores
// ni bordes; ExcelJS sí, y solo se carga cuando hace falta generar este documento.
export function cargarExcelJS() {
  return new Promise((resolve) => {
    if (window.ExcelJS) { resolve(window.ExcelJS); return; }
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js";
    script.onload = () => resolve(window.ExcelJS);
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });
}

// Feriados oficiales de Perú. Los fijos son siempre la misma fecha; Jueves y
// Viernes Santo dependen de la Pascua, calculada con el algoritmo estándar
// (Meeus/Jones/Butcher). Devuelve un Set de fechas "YYYY-MM-DD" para el año dado.
export function calcularPascua(anio) {
  const a = anio % 19, b = Math.floor(anio/100), c = anio % 100;
  const d = Math.floor(b/4), e = b % 4, f = Math.floor((b+8)/25);
  const g = Math.floor((b-f+1)/3), h = (19*a+b-d-g+15) % 30;
  const i = Math.floor(c/4), k = c % 4, l = (32+2*e+2*i-h-k) % 7;
  const m = Math.floor((a+11*h+22*l)/451);
  const mes = Math.floor((h+l-7*m+114)/31);
  const dia = ((h+l-7*m+114) % 31) + 1;
  return new Date(anio, mes-1, dia);
}
export function obtenerFeriadosPeru(anio) {
  const f2 = (n)=>String(n).padStart(2,"0");
  const fechaStr = (d)=> `${d.getFullYear()}-${f2(d.getMonth()+1)}-${f2(d.getDate())}`;
  const pascua = calcularPascua(anio);
  const jueves = new Date(pascua); jueves.setDate(pascua.getDate()-3);
  const viernes = new Date(pascua); viernes.setDate(pascua.getDate()-2);
  return new Set([
    `${anio}-01-01`, fechaStr(jueves), fechaStr(viernes),
    `${anio}-05-01`, `${anio}-06-07`, `${anio}-06-29`, `${anio}-07-23`,
    `${anio}-07-28`, `${anio}-07-29`, `${anio}-08-06`, `${anio}-08-30`,
    `${anio}-10-08`, `${anio}-11-01`, `${anio}-12-08`, `${anio}-12-09`, `${anio}-12-25`,
  ]);
}
export function esFeriadoPeru(fechaStr) {
  const anio = parseInt(fechaStr.slice(0,4));
  return obtenerFeriadosPeru(anio).has(fechaStr);
}

export const bandaDePeso = (kg) => {
  const p = parseFloat(kg) || 0;
  if (p <= 1) return "XS";
  if (p <= 3) return "S";
  return "M";
};

// Genera la Liquidación de Entregas en el formato Boaz establecido:
// encabezado navy/ámbar, tabla con Tracking Boaz y N° de Orden del cliente,
// resumen operativo y tarifario de referencia al pie.
// Hoja adicional de las liquidaciones formato Boaz: viajes, recojos y servicios cotizados del período,
// más el resumen de lo que se factura en total (base de la liquidación + servicios).
export function agregarHojaServiciosLiq(wb, servicios, { empresa, fechaInicio, fechaFin, numeroLiquidacion, baseLabel, baseSubtotal }) {
  if (!servicios || !servicios.length) return;
  const NAVY = "FF1B2A4A", AMBER = "FFE8A33D", LIGHT_GRAY = "FFF2F2F2", WHITE = "FFFFFFFF";
  const ws = wb.addWorksheet("Servicios adicionales", { views: [{ showGridLines:false }] });
  [5, 13, 20, 46, 10, 13, 14].forEach((w,i)=>{ ws.getColumn(i+1).width = w; });
  const bf = { style:"thin", color:{ argb:"FFBFBFBF" } }, borde = { top:bf, left:bf, right:bf, bottom:bf };
  const relleno = (argb) => ({ type:"pattern", pattern:"solid", fgColor:{ argb } });
  ws.mergeCells("A1:G1"); const t = ws.getCell("A1"); t.value = "GRUPO BOAZ S.A.C."; t.font = { size:16, bold:true, color:{ argb:WHITE } }; t.fill = relleno(NAVY); t.alignment = { horizontal:"center", vertical:"middle" }; ws.getRow(1).height = 28;
  ws.mergeCells("A3:G3"); const d = ws.getCell("A3"); d.value = "VIAJES, RECOJOS Y SERVICIOS COTIZADOS"; d.font = { size:13, bold:true, color:{ argb:NAVY } }; d.alignment = { horizontal:"center" };
  [["N° de Liquidación:", numeroLiquidacion], ["Cliente:", empresa.nombre], ["Periodo:", `${fmt.fecha(fechaInicio)} al ${fmt.fecha(fechaFin)}`]].forEach(([l,v],i) => {
    ws.getCell(`A${5+i}`).value = l; ws.getCell(`A${5+i}`).font = { bold:true, size:10, color:{ argb:NAVY } };
    ws.mergeCells(`C${5+i}:E${5+i}`); ws.getCell(`C${5+i}`).value = v; ws.getCell(`C${5+i}`).font = { size:10 };
  });
  const f0 = 9;
  ["N°","Fecha","Tipo","Concepto","Cant.","Tarifa","Subtotal"].forEach((h,i) => { const c = ws.getCell(f0, i+1); c.value = h; c.font = { bold:true, size:10, color:{ argb:WHITE } }; c.fill = relleno(NAVY); c.alignment = { horizontal:"center", vertical:"middle" }; c.border = borde; });
  let sub = 0;
  servicios.forEach((x,i) => {
    const monto = parseFloat(x.monto)||0; sub += monto;
    [i+1, fmt.fecha(x.fecha), (TIPOS_SERV[x.tipo]||{}).label||x.tipo, x.concepto + (x.cotizacion_ref ? ` (Ref. ${x.cotizacion_ref})` : ""), parseFloat(x.cantidad)||0, parseFloat(x.tarifa_unit)||0, monto].forEach((v,j) => {
      const c = ws.getCell(f0+1+i, j+1); c.value = v; c.border = borde; c.font = { size:10 };
      if (i%2===1) c.fill = relleno(LIGHT_GRAY);
      if (j>=5) c.numFmt = '"S/" #,##0.00';
      if (j===0 || j===1 || j===4) c.alignment = { horizontal:"center" };
    });
  });
  let f = f0 + servicios.length + 2;
  const linea = (l, v, fuerte) => {
    ws.mergeCells(`D${f}:F${f}`); ws.getCell(`D${f}`).value = l; ws.getCell(`D${f}`).alignment = { horizontal:"right" }; ws.getCell(`D${f}`).font = { bold:true, size:fuerte?11:10, color:{ argb:NAVY } };
    const c = ws.getCell(`G${f}`); c.value = v; c.numFmt = '"S/" #,##0.00'; c.font = { bold:true, size:fuerte?11:10, color:{ argb:NAVY } }; if (fuerte) c.fill = relleno(AMBER); f++;
  };
  linea("Subtotal de servicios", sub);
  linea(baseLabel, baseSubtotal);
  linea("Subtotal general", sub+baseSubtotal);
  linea("IGV 18%", (sub+baseSubtotal)*0.18);
  linea("TOTAL A FACTURAR", (sub+baseSubtotal)*1.18, true);
}

export async function generarLiquidacionEntregas({ pedidosOrdenados, empresa, fechaInicio, fechaFin, numeroLiquidacion, toast, servicios=[] }) {
  const ExcelJS = await cargarExcelJS();
  if (!ExcelJS) { toast("No se pudo cargar el generador de Excel — revisa tu conexión","error"); return; }

  const NAVY = "FF1B2A4A", AMBER = "FFE8A33D", LIGHT_GRAY = "FFF2F2F2", WHITE = "FFFFFFFF", BLUE_EDIT = "FFEFF6FF";
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Liquidación", { views: [{ showGridLines: false }] });

  const anchos = [5, 24, 18, 16, 12, 32, 9, 9, 13, 11, 11, 12];
  anchos.forEach((w,i)=>{ ws.getColumn(i+1).width = w; });

  const bordeFino = { style:"thin", color:{ argb:"FFBFBFBF" } };
  const borde = { top:bordeFino, left:bordeFino, right:bordeFino, bottom:bordeFino };

  // ── Encabezado ──
  ws.mergeCells("A1:L1");
  const titulo = ws.getCell("A1");
  titulo.value = "GRUPO BOAZ S.A.C.";
  titulo.font = { size:16, bold:true, color:{ argb:WHITE } };
  titulo.fill = { type:"pattern", pattern:"solid", fgColor:{ argb:NAVY } };
  titulo.alignment = { horizontal:"center", vertical:"middle" };
  ws.getRow(1).height = 28;

  ws.mergeCells("A2:L2");
  const sub = ws.getCell("A2");
  sub.value = "RUC 20613172301  ·  Con Boaz, tu negocio no para  ·  contacto@boaz.com.pe  ·  +51 960 622 471";
  sub.font = { size:9, color:{ argb:WHITE } };
  sub.fill = { type:"pattern", pattern:"solid", fgColor:{ argb:NAVY } };
  sub.alignment = { horizontal:"center" };

  ws.mergeCells("A4:L4");
  const tituloDoc = ws.getCell("A4");
  tituloDoc.value = "LIQUIDACIÓN DE ENTREGAS";
  tituloDoc.font = { size:13, bold:true, color:{ argb:NAVY } };
  tituloDoc.alignment = { horizontal:"center" };

  const infoRows = [
    ["N° de Liquidación:", numeroLiquidacion],
    ["Cliente:", empresa.nombre],
    ["RUC del cliente:", empresa.ruc||"—"],
    ["Periodo:", `${fmt.fecha(fechaInicio+"T00:00:00")} al ${fmt.fecha(fechaFin+"T00:00:00")}`],
    ["Tipo de servicio:", "Distribución / Same Day"],
  ];
  let filaInfo = 6;
  infoRows.forEach(([label,val])=>{
    ws.getCell(`A${filaInfo}`).value = label;
    ws.getCell(`A${filaInfo}`).font = { bold:true, size:10, color:{ argb:NAVY } };
    ws.mergeCells(`B${filaInfo}:D${filaInfo}`);
    ws.getCell(`B${filaInfo}`).value = val;
    ws.getCell(`B${filaInfo}`).font = { size:10 };
    filaInfo++;
  });

  // ── Tabla de puntos ──
  const filaTabla = filaInfo + 1;
  const encabezados = ["N°","Punto / Destinatario","Distrito","Tracking Boaz","N° Orden","Detalle de Servicio","Peso (kg)","Banda","Ámbito","Tarifa","IGV","Total"];
  encabezados.forEach((h,i)=>{
    const celda = ws.getCell(filaTabla, i+1);
    celda.value = h;
    celda.font = { bold:true, size:10, color:{ argb:WHITE } };
    celda.fill = { type:"pattern", pattern:"solid", fgColor:{ argb:NAVY } };
    celda.alignment = { horizontal:"center", vertical:"middle" };
    celda.border = borde;
  });
  ws.getRow(filaTabla).height = 20;

  let subtotal = 0;
  pedidosOrdenados.forEach((p,i)=>{
    const fila = filaTabla + 1 + i;
    const tarifa = parseFloat(p.tarifa_s)||0;
    const igv = tarifa*0.18;
    const total = tarifa*1.18;
    subtotal += tarifa;
    const tipoServLabel = p.tipo_servicio==="same_day" ? "SAME DAY"
      : p.tipo_servicio==="next_day" ? "NEXT DAY"
      : p.tipo_servicio==="especial" ? "ESPECIAL" : "";
    const detalle = "SERVICIO DE TRANSPORTE Y DISTRIBUCIÓN MULTIPUNTO" + (tipoServLabel ? ` - ${tipoServLabel}` : "");
    const valores = [i+1, p.dest_nombre, p.dest_distrito||"—", p.omd, p.cliente_referencia||"—", detalle,
      parseFloat(p.peso_kg)||0, bandaDePeso(p.peso_kg), (p.ambito||"—").replace("_"," "), tarifa, igv, total];
    valores.forEach((v,j)=>{
      const celda = ws.getCell(fila, j+1);
      celda.value = v;
      celda.border = borde;
      celda.font = { size:10 };
      if (j===5) celda.font = { size:8, italic:true, color:{ argb:"FF4B5563" } };
      if (i%2===1) celda.fill = { type:"pattern", pattern:"solid", fgColor:{ argb:LIGHT_GRAY } };
      if (j===9) celda.fill = { type:"pattern", pattern:"solid", fgColor:{ argb:BLUE_EDIT } }; // tarifa editable
      if (j>=9) celda.numFmt = '"S/" #,##0.00';
      if (j===0 || j===6) celda.alignment = { horizontal:"center" };
    });
  });

  const filaTotales = filaTabla + 1 + pedidosOrdenados.length;
  ws.mergeCells(`A${filaTotales}:I${filaTotales}`);
  ws.getCell(`A${filaTotales}`).value = `Total de puntos: ${pedidosOrdenados.length}`;
  ws.getCell(`A${filaTotales}`).font = { bold:true, size:10, color:{ argb:NAVY } };
  ws.getCell(`J${filaTotales}`).value = "Subtotal";
  ws.getCell(`J${filaTotales}`).font = { bold:true, size:10 };
  ws.getCell(`K${filaTotales}`).value = "IGV 18%";
  ws.getCell(`K${filaTotales}`).font = { bold:true, size:10 };
  ws.getCell(`L${filaTotales}`).value = "TOTAL";
  ws.getCell(`L${filaTotales}`).font = { bold:true, size:11, color:{ argb:NAVY } };

  const filaMontos = filaTotales + 1;
  ws.getCell(`J${filaMontos}`).value = subtotal;
  ws.getCell(`K${filaMontos}`).value = subtotal*0.18;
  ws.getCell(`L${filaMontos}`).value = subtotal*1.18;
  [`J${filaMontos}`,`K${filaMontos}`,`L${filaMontos}`].forEach(c=>{
    ws.getCell(c).numFmt = '"S/" #,##0.00';
    ws.getCell(c).font = { bold:true, size:11, color:{ argb:NAVY } };
    ws.getCell(c).fill = { type:"pattern", pattern:"solid", fgColor:{ argb:AMBER } };
  });

  // ── Resumen operativo ──
  let filaResumen = filaMontos + 3;
  ws.getCell(`A${filaResumen}`).value = "RESUMEN OPERATIVO";
  ws.getCell(`A${filaResumen}`).font = { bold:true, size:11, color:{ argb:NAVY } };
  filaResumen++;
  const pesoTotal = pedidosOrdenados.reduce((a,p)=>a+(parseFloat(p.peso_kg)||0),0);
  [["Puntos de entrega:", pedidosOrdenados.length],
   ["Peso total:", `${pesoTotal.toFixed(1)} kg`],
   ["Entregados:", pedidosOrdenados.filter(p=>p.estado==="entregado").length],
   ["No entregados:", pedidosOrdenados.filter(p=>p.estado==="no_entregado").length],
  ].forEach(([label,val])=>{
    ws.getCell(`A${filaResumen}`).value = label;
    ws.getCell(`A${filaResumen}`).font = { size:10 };
    ws.getCell(`C${filaResumen}`).value = val;
    ws.getCell(`C${filaResumen}`).font = { bold:true, size:10 };
    filaResumen++;
  });

  // ── Tarifario de referencia ──
  filaResumen++;
  ws.getCell(`A${filaResumen}`).value = "TARIFARIO SAME DAY DE REFERENCIA (sin IGV)";
  ws.getCell(`A${filaResumen}`).font = { bold:true, size:11, color:{ argb:NAVY } };
  filaResumen++;
  const filaTarifHead = filaResumen;
  ["Ámbito","XS (0-1kg)","S (1-3kg)","M (3-7kg)"].forEach((h,i)=>{
    const c = ws.getCell(filaTarifHead, i+1);
    c.value = h; c.font = { bold:true, size:9, color:{ argb:WHITE } };
    c.fill = { type:"pattern", pattern:"solid", fgColor:{ argb:NAVY } };
    c.border = borde;
  });
  [["Urbano",10,13,16],["Semi Urbano",12,15,18],["Periférico",15,18,22]].forEach((fila,i)=>{
    const f = filaTarifHead + 1 + i;
    fila.forEach((v,j)=>{
      const c = ws.getCell(f, j+1);
      c.value = j===0 ? v : `S/ ${v}`;
      c.font = { size:9 };
      c.border = borde;
      if (i%2===1) c.fill = { type:"pattern", pattern:"solid", fgColor:{ argb:LIGHT_GRAY } };
    });
  });

  ws.views = [{ state:"frozen", ySplit: filaTabla, showGridLines:false }];

  agregarHojaServiciosLiq(wb, servicios, { empresa, fechaInicio, fechaFin, numeroLiquidacion, baseLabel:"Subtotal de entregas (hoja Liquidación)", baseSubtotal:subtotal });
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type:"application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${numeroLiquidacion}-${empresa.nombre.replace(/\s+/g,"-")}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

// Igual que generarLiquidacionEntregas, pero para clientes de Transporte y
// Carga (Deliverman, Globalia, etc.) que no tienen pedidos — se liquidan por
// placa y días de servicio trabajados dentro del rango elegido.
export async function generarLiquidacionTransporte({ filasTransporte, empresa, fechaInicio, fechaFin, numeroLiquidacion, toast, servicios=[] }) {
  const ExcelJS = await cargarExcelJS();
  if (!ExcelJS) { toast("No se pudo cargar el generador de Excel — revisa tu conexión","error"); return; }

  const NAVY = "FF1B2A4A", AMBER = "FFE8A33D", LIGHT_GRAY = "FFF2F2F2", WHITE = "FFFFFFFF", BLUE_EDIT = "FFEFF6FF";
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Liquidación", { views: [{ showGridLines: false }] });

  const anchos = [5, 14, 16, 42, 14, 12, 12, 11, 12];
  anchos.forEach((w,i)=>{ ws.getColumn(i+1).width = w; });

  const bordeFino = { style:"thin", color:{ argb:"FFBFBFBF" } };
  const borde = { top:bordeFino, left:bordeFino, right:bordeFino, bottom:bordeFino };

  ws.mergeCells("A1:I1");
  const titulo = ws.getCell("A1");
  titulo.value = "GRUPO BOAZ S.A.C.";
  titulo.font = { size:16, bold:true, color:{ argb:WHITE } };
  titulo.fill = { type:"pattern", pattern:"solid", fgColor:{ argb:NAVY } };
  titulo.alignment = { horizontal:"center", vertical:"middle" };
  ws.getRow(1).height = 28;

  ws.mergeCells("A2:I2");
  const sub = ws.getCell("A2");
  sub.value = "RUC 20613172301  ·  Con Boaz, tu negocio no para  ·  contacto@boaz.com.pe  ·  +51 960 622 471";
  sub.font = { size:9, color:{ argb:WHITE } };
  sub.fill = { type:"pattern", pattern:"solid", fgColor:{ argb:NAVY } };
  sub.alignment = { horizontal:"center" };

  ws.mergeCells("A4:I4");
  const tituloDoc = ws.getCell("A4");
  tituloDoc.value = "LIQUIDACIÓN DE SERVICIOS DE TRANSPORTE";
  tituloDoc.font = { size:13, bold:true, color:{ argb:NAVY } };
  tituloDoc.alignment = { horizontal:"center" };

  const infoRows = [
    ["N° de Liquidación:", numeroLiquidacion],
    ["Cliente:", empresa.nombre],
    ["RUC del cliente:", empresa.ruc||"—"],
    ["Periodo:", `${fmt.fecha(fechaInicio+"T00:00:00")} al ${fmt.fecha(fechaFin+"T00:00:00")}`],
    ["Tipo de servicio:", "Transporte y Carga — por día"],
  ];
  let filaInfo = 6;
  infoRows.forEach(([label,val])=>{
    ws.getCell(`A${filaInfo}`).value = label;
    ws.getCell(`A${filaInfo}`).font = { bold:true, size:10, color:{ argb:NAVY } };
    ws.mergeCells(`B${filaInfo}:D${filaInfo}`);
    ws.getCell(`B${filaInfo}`).value = val;
    ws.getCell(`B${filaInfo}`).font = { size:10 };
    filaInfo++;
  });

  const filaTabla = filaInfo + 1;
  const encabezados = ["N°","Placa","Tipo de Vehículo","Detalle de Servicio","Días trabajados","Tarifa/día","Subtotal","IGV","Total"];
  encabezados.forEach((h,i)=>{
    const celda = ws.getCell(filaTabla, i+1);
    celda.value = h;
    celda.font = { bold:true, size:10, color:{ argb:WHITE } };
    celda.fill = { type:"pattern", pattern:"solid", fgColor:{ argb:NAVY } };
    celda.alignment = { horizontal:"center", vertical:"middle" };
    celda.border = borde;
  });
  ws.getRow(filaTabla).height = 20;

  let subtotal = 0, diasTotales = 0;
  filasTransporte.forEach((f,i)=>{
    const fila = filaTabla + 1 + i;
    subtotal += f.monto;
    diasTotales += f.dias;
    const tipoVehiculo = f.unidad?.tipo_vehiculo||"—";
    const placa = f.unidad?.placa||"—";
    const detalle = `SERVICIO DE TRANSPORTE REALIZADO CON LA UNIDAD ${tipoVehiculo.toUpperCase()} DE PLACA ${placa}, ${f.dias} DÍA${f.dias===1?"":"S"} DE SERVICIO`;
    const valores = [i+1, placa, tipoVehiculo, detalle, f.dias,
      parseFloat(f.asignacion.tarifa_dia)||0, f.monto, f.igv, f.total];
    valores.forEach((v,j)=>{
      const celda = ws.getCell(fila, j+1);
      celda.value = v;
      celda.border = borde;
      celda.font = { size:10 };
      if (j===3) celda.font = { size:8, italic:true, color:{ argb:"FF4B5563" } };
      if (i%2===1) celda.fill = { type:"pattern", pattern:"solid", fgColor:{ argb:LIGHT_GRAY } };
      if (j===5) celda.fill = { type:"pattern", pattern:"solid", fgColor:{ argb:BLUE_EDIT } }; // tarifa/día editable
      if (j>=5) celda.numFmt = '"S/" #,##0.00';
      if (j===0 || j===4) celda.alignment = { horizontal:"center" };
    });
  });

  const filaTotales = filaTabla + 1 + filasTransporte.length;
  ws.mergeCells(`A${filaTotales}:F${filaTotales}`);
  ws.getCell(`A${filaTotales}`).value = `Total de unidades: ${filasTransporte.length}  ·  Total de días: ${diasTotales}`;
  ws.getCell(`A${filaTotales}`).font = { bold:true, size:10, color:{ argb:NAVY } };
  ws.getCell(`G${filaTotales}`).value = "Subtotal";
  ws.getCell(`G${filaTotales}`).font = { bold:true, size:9 };
  ws.getCell(`H${filaTotales}`).value = "IGV 18%";
  ws.getCell(`H${filaTotales}`).font = { bold:true, size:9 };
  ws.getCell(`I${filaTotales}`).value = "TOTAL";
  ws.getCell(`I${filaTotales}`).font = { bold:true, size:11, color:{ argb:NAVY } };

  const filaMontos = filaTotales + 1;
  ws.getCell(`G${filaMontos}`).value = subtotal;
  ws.getCell(`H${filaMontos}`).value = subtotal*0.18;
  ws.getCell(`I${filaMontos}`).value = subtotal*1.18;
  [`G${filaMontos}`,`H${filaMontos}`,`I${filaMontos}`].forEach(c=>{
    ws.getCell(c).numFmt = '"S/" #,##0.00';
    ws.getCell(c).font = { bold:true, size:11, color:{ argb:NAVY } };
    ws.getCell(c).fill = { type:"pattern", pattern:"solid", fgColor:{ argb:AMBER } };
  });

  // ── Tarifas realmente aplicadas en esta liquidación (no el tarifario
  // estándar genérico — el costo real del servicio prestado por vehículo) ──
  let filaResumen = filaMontos + 3;
  ws.getCell(`A${filaResumen}`).value = "TARIFAS APLICADAS EN ESTA LIQUIDACIÓN (sin IGV)";
  ws.getCell(`A${filaResumen}`).font = { bold:true, size:11, color:{ argb:NAVY } };
  filaResumen++;
  const filaTarifHead = filaResumen;
  ["Placa","Tipo de vehículo","Tarifa/día aplicada"].forEach((h,i)=>{
    const c = ws.getCell(filaTarifHead, i+1);
    c.value = h; c.font = { bold:true, size:9, color:{ argb:WHITE } };
    c.fill = { type:"pattern", pattern:"solid", fgColor:{ argb:NAVY } };
    c.border = borde;
  });
  filasTransporte.forEach((f,i)=>{
    const fila = filaTarifHead + 1 + i;
    [f.unidad?.placa||"—", f.unidad?.tipo_vehiculo||"—", `S/ ${(parseFloat(f.asignacion.tarifa_dia)||0).toFixed(2)}`].forEach((v,j)=>{
      const c = ws.getCell(fila, j+1);
      c.value = v;
      c.font = { size:9 };
      c.border = borde;
      if (i%2===1) c.fill = { type:"pattern", pattern:"solid", fgColor:{ argb:LIGHT_GRAY } };
    });
  });

  ws.views = [{ state:"frozen", ySplit: filaTabla, showGridLines:false }];

  agregarHojaServiciosLiq(wb, servicios, { empresa, fechaInicio, fechaFin, numeroLiquidacion, baseLabel:"Subtotal de transporte (hoja Liquidación)", baseSubtotal:subtotal });
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type:"application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${numeroLiquidacion}-${empresa.nombre.replace(/\s+/g,"-")}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

export function LiquidacionClientes({ pedidos, empresas, unidades, asignacionesUnidad, diasServicio, tarifarioVehiculoEstandar, recargoFeriadoPct, toast }) {
  const hoy = diaLocal();
  const primerDiaMes = hoy.slice(0,8)+"01";
  const [empresaId, setEmpresaId] = useState("todas");
  const [fechaInicio, setFechaInicio] = useState(primerDiaMes);
  const [fechaFin, setFechaFin] = useState(hoy);
  const [generado, setGenerado] = useState(false);
  const [generandoLiquidacion, setGenerandoLiquidacion] = useState(false);
  // Viajes, recojos y servicios cotizados del período (se suman al total a facturar)
  const [servPer, setServPer] = useState([]);
  useEffect(() => {
    if (!generado) return;
    let vivo = true;
    (async () => {
      try { const { data, error } = await cargarServicios(fechaInicio, fechaFin, empresaId==="todas" ? "" : empresaId);
        if (vivo) setServPer(error ? [] : (data||[]).filter(x => x.estado==="realizado" && !x.facturado && (empresaId==="todas" || x.empresa_id===empresaId))); } catch { if (vivo) setServPer([]); }
    })();
    return () => { vivo = false; };
  }, [generado, fechaInicio, fechaFin, empresaId]);
  const subtotalServ = servPer.reduce((t,x)=>t+(parseFloat(x.monto)||0),0);

  // ¿A este cliente se le cobra por pedido? Si tiene modalidades definidas manda eso; si no, se
  // mantiene la regla anterior: un cliente con unidades asignadas se cobra por unidad, no por pedido.
  const cobraPorPedido = (id) => clienteCobraPorPedido(id, empresas, asignacionesUnidad);
  const [confirmar, setConfirmar] = useState(null);

  const diasTrabajadosEnRango = (asignacion) => {
    const registrados = diasServicio.filter(d=>d.asignacion_id===asignacion.id && d.fecha>=fechaInicio && d.fecha<=fechaFin);
    if (registrados.length > 0) return registrados.filter(d=>d.prestado).length;
    // Sin registro explícito de calendario: estima por solapamiento entre el
    // rango de la asignación y el rango de fechas elegido para el reporte.
    const inicioAsig = new Date(asignacion.fecha_inicio+"T00:00:00");
    const finAsig = asignacion.fecha_fin ? new Date(asignacion.fecha_fin+"T00:00:00") : new Date();
    const inicioRango = new Date(fechaInicio+"T00:00:00");
    const finRango = new Date(fechaFin+"T00:00:00");
    const desde = inicioAsig > inicioRango ? inicioAsig : inicioRango;
    const hasta = finAsig < finRango ? finAsig : finRango;
    if (hasta < desde) return 0;
    return Math.round((hasta-desde)/86400000)+1;
  };

  // Días y monto con la regla única del ERP (ver montoAsignacionPeriodo)
  const filasTransporte = asignacionesUnidad.filter(a=>empresaId==="todas" || a.empresa_id===empresaId).map(a=>{
        const { dias, monto, conCalendario } = montoAsignacionPeriodo(a, diasServicio, fechaInicio, fechaFin, recargoFeriadoPct||0);
        const unidad = unidades.find(u=>u.id===a.unidad_id);
        return { asignacion:a, unidad, dias, monto, igv: monto*0.18, total: monto*1.18, estimado: !conCalendario };
      }).filter(f=>f.dias>0);
  const subtotalTransporte = filasTransporte.reduce((s,f)=>s+f.monto,0);
  const igvTransporte = subtotalTransporte*0.18;
  const totalTransporte = subtotalTransporte*1.18;

  const dentroDelRango = (p) => {
    if (!p.created_at) return false;
    const fecha = new Date(p.created_at);
    const desde = new Date(fechaInicio+"T00:00:00");
    const hasta = new Date(fechaFin+"T23:59:59");
    return fecha >= desde && fecha <= hasta;
  };

  const enRango = pedidos.filter(p => (empresaId==="todas" || p.empresa_id===empresaId) && dentroDelRango(p));
  const noCobrables = enRango.filter(p => !cobraPorPedido(p.empresa_id)).length;
  const filtrados = enRango.filter(p => cobraPorPedido(p.empresa_id))
    .sort((a,b)=> new Date(a.created_at) - new Date(b.created_at));

  const nombreEmpresa = (id) => empresas.find(e=>e.id===id)?.nombre || "—";

  const subtotal = filtrados.reduce((a,p)=>a+(parseFloat(p.tarifa_s)||0),0);
  const igv = subtotal * 0.18;
  const total = subtotal * 1.18;

  // Totales consolidados: pedidos + unidades por día + viajes y servicios
  const subtotalGen = subtotal + subtotalTransporte + subtotalServ;
  const igvGen = subtotalGen*0.18, totalGen = subtotalGen*1.18;
  const hayAlgo = filtrados.length>0 || filasTransporte.length>0 || servPer.length>0;
  const tituloCliente = empresaId==="todas" ? "Todos los clientes" : nombreEmpresa(empresaId);
  const slugCliente = empresaId==="todas" ? "todos-los-clientes" : nombreEmpresa(empresaId).replace(/\s+/g,"-").toLowerCase();
  const n2 = (v) => Math.round((parseFloat(v)||0)*100)/100;

  // Resumen por cliente (solo cuando se ve "Todos los clientes")
  const porCliente = {};
  const acum = (id, campo, monto) => { const k = id || "sin_empresa"; const g = porCliente[k] || (porCliente[k] = { nombre:nombreEmpresa(id), pedidos:0, unidades:0, servicios:0 }); g[campo] += monto; };
  filtrados.forEach(p => acum(p.empresa_id, "pedidos", parseFloat(p.tarifa_s)||0));
  filasTransporte.forEach(f => acum(f.asignacion.empresa_id, "unidades", f.monto));
  servPer.forEach(x => acum(x.empresa_id, "servicios", parseFloat(x.monto)||0));

  const exportarExcel = async () => {
    if (!hayAlgo) { toast("No hay nada que exportar en este período","error"); return; }
    try {
      await asegurarXLSX();
      const wb = XLSX.utils.book_new();
      const resumen = [["Pre-facturación", tituloCliente], ["Período", `${fmt.fecha(fechaInicio)} al ${fmt.fecha(fechaFin)}`], [],
        ["Concepto","Cantidad","Subtotal (S/)"],
        ["Pedidos", filtrados.length, n2(subtotal)], ["Unidades por día", filasTransporte.length, n2(subtotalTransporte)], ["Viajes, recojos y servicios cotizados", servPer.length, n2(subtotalServ)],
        [], ["Subtotal","",n2(subtotalGen)], ["IGV 18%","",n2(igvGen)], ["TOTAL A FACTURAR","",n2(totalGen)]];
      if (empresaId==="todas") { resumen.push([], ["Cliente","Pedidos","Unidades","Servicios","Subtotal","Total con IGV"]);
        Object.values(porCliente).forEach(c => { const st = c.pedidos+c.unidades+c.servicios; resumen.push([c.nombre, n2(c.pedidos), n2(c.unidades), n2(c.servicios), n2(st), n2(st*1.18)]); }); }
      const wsR = XLSX.utils.aoa_to_sheet(resumen); wsR["!cols"] = [{wch:38},{wch:14},{wch:16},{wch:14},{wch:14},{wch:16}];
      XLSX.utils.book_append_sheet(wb, wsR, "Resumen");
      if (filtrados.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filtrados.map(p => { const sub = parseFloat(p.tarifa_s)||0; return {
        "Tracking Boaz":p.omd, "N° Orden":p.cliente_referencia||"", Cliente:nombreEmpresa(p.empresa_id), Destinatario:p.dest_nombre||"", Distrito:p.dest_distrito||"", Servicio:p.tipo_servicio||"", Fecha:fmt.fecha(p.created_at),
        Subtotal:n2(sub), IGV:n2(sub*0.18), Total:n2(sub*1.18) }; })), "Pedidos");
      if (filasTransporte.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filasTransporte.map(f => ({
        Cliente:nombreEmpresa(f.asignacion.empresa_id), Placa:(f.unidad && f.unidad.placa)||"", "Tipo de vehículo":(f.unidad && f.unidad.tipo_vehiculo)||"", "Días trabajados":f.dias, "Tarifa/día":n2(f.asignacion.tarifa_dia),
        Subtotal:n2(f.monto), IGV:n2(f.igv), Total:n2(f.total) }))), "Unidades");
      if (servPer.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(servPer.map(x => ({
        Fecha:fmt.fecha(x.fecha), Cliente:nombreEmpresa(x.empresa_id), Tipo:(TIPOS_SERV[x.tipo]||{}).label||x.tipo, Concepto:x.concepto, "Cotización / ref.":x.cotizacion_ref||"", Cantidad:parseFloat(x.cantidad)||0, Tarifa:n2(x.tarifa_unit),
        Subtotal:n2(x.monto), IGV:n2((parseFloat(x.monto)||0)*0.18), Total:n2((parseFloat(x.monto)||0)*1.18) }))), "Servicios");
      XLSX.writeFile(wb, `pre-facturacion-${slugCliente}-${fechaInicio}-a-${fechaFin}.xlsx`);
    } catch (e) { toast("No se pudo exportar: "+(e.message||e), "error"); }
  };

  const imprimir = () => {
    if (!hayAlgo) { toast("No hay nada que imprimir en este período","error"); return; }
    const todas = empresaId==="todas";
    const m = (v) => `S/ ${(parseFloat(v)||0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
    const sec = (titulo, cab, filasH, sub) => filasH ? `<h2>${titulo}</h2><table><thead><tr>${cab.map(c=>`<th${c[1]?' class="r"':''}>${c[0]}</th>`).join("")}</tr></thead><tbody>${filasH}</tbody>
      <tfoot><tr><td colspan="${cab.length-1}" class="r">Subtotal</td><td class="r"><b>${m(sub)}</b></td></tr></tfoot></table>` : "";
    const hPed = filtrados.map(p => `<tr><td>${escHTML(p.omd)}</td><td>${escHTML(p.cliente_referencia||"—")}</td>${todas?`<td>${escHTML(nombreEmpresa(p.empresa_id))}</td>`:""}<td>${escHTML(p.dest_nombre)}</td><td>${escHTML(p.dest_distrito||"—")}</td><td>${fmt.fecha(p.created_at)}</td><td class="r">${m(p.tarifa_s)}</td></tr>`).join("");
    const hUni = filasTransporte.map(f => `<tr>${todas?`<td>${escHTML(nombreEmpresa(f.asignacion.empresa_id))}</td>`:""}<td>${escHTML((f.unidad&&f.unidad.placa)||"—")}</td><td>${escHTML((f.unidad&&f.unidad.tipo_vehiculo)||"—")}</td><td class="r">${f.dias}</td><td class="r">${m(f.asignacion.tarifa_dia)}</td><td class="r">${m(f.monto)}</td></tr>`).join("");
    const hSer = servPer.map(x => `<tr><td>${fmt.fecha(x.fecha)}</td>${todas?`<td>${escHTML(nombreEmpresa(x.empresa_id))}</td>`:""}<td>${escHTML((TIPOS_SERV[x.tipo]||{}).label||x.tipo)}</td><td>${escHTML(x.concepto)}${x.cotizacion_ref?` <span class="g">· Ref. ${escHTML(x.cotizacion_ref)}</span>`:""}</td><td class="r">${parseFloat(x.cantidad)||0}</td><td class="r">${m(x.tarifa_unit)}</td><td class="r">${m(x.monto)}</td></tr>`).join("");
    const cli = todas ? [["Cliente"]] : [];
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Pre-facturación — ${escHTML(tituloCliente)}</title>
      <style>
        body{font-family:Arial,sans-serif;padding:28px;color:#0D1E3D}
        h1{font-size:19px;margin:0 0 4px} .sub{color:#64748B;font-size:12px;margin-bottom:8px}
        h2{font-size:13px;margin:22px 0 8px;padding-bottom:5px;border-bottom:2px solid #E8780A}
        table{width:100%;border-collapse:collapse;font-size:11.5px}
        th{background:#F0F4F8;text-align:left;padding:7px 8px} td{padding:6px 8px;border-bottom:1px solid #E2E8F0}
        tfoot td{border-bottom:none;background:#F8FAFC} .r{text-align:right} .g{color:#64748B}
        .totales{margin:24px 0 0 auto;width:300px;font-size:13px} .totales div{display:flex;justify-content:space-between;padding:4px 0}
        .totales .t{border-top:2px solid #0D1E3D;margin-top:6px;padding-top:8px;font-size:16px;font-weight:bold;color:#C4660A}
        @media print{button{display:none}}
      </style></head><body>
      <h1>Pre-facturación — ${escHTML(tituloCliente)}</h1>
      <div class="sub">Grupo Boaz S.A.C. · Del ${fmt.fecha(fechaInicio)} al ${fmt.fecha(fechaFin)} · Montos sin IGV salvo el total</div>
      ${sec(`Pedidos (${filtrados.length})`, [["Tracking Boaz"],["N° Orden"],...cli,["Destinatario"],["Distrito"],["Fecha"],["Subtotal",1]], hPed, subtotal)}
      ${sec(`Unidades por día (${filasTransporte.length})`, [...cli,["Placa"],["Tipo de vehículo"],["Días",1],["Tarifa/día",1],["Subtotal",1]], hUni, subtotalTransporte)}
      ${sec(`Viajes, recojos y servicios cotizados (${servPer.length})`, [["Fecha"],...cli,["Tipo"],["Concepto"],["Cant.",1],["Tarifa",1],["Subtotal",1]], hSer, subtotalServ)}
      <div class="totales">
        <div><span>Subtotal</span><span>${m(subtotalGen)}</span></div>
        <div><span>IGV 18%</span><span>${m(igvGen)}</span></div>
        <div class="t"><span>TOTAL A FACTURAR</span><span>${m(totalGen)}</span></div>
      </div>
      <button onclick="window.print()" style="margin-top:24px;padding:10px 20px;font-size:14px;cursor:pointer;">Imprimir o guardar como PDF</button>
      </body></html>`;
    const ventana = window.open("", "_blank");
    if (!ventana) { toast("El navegador bloqueó la ventana. Permite las ventanas emergentes para imprimir.","error"); return; }
    ventana.document.write(html);
    ventana.document.close();
  };

  const generarLiquidacion = async (tipo) => {
    const empresa = empresas.find(e=>e.id===empresaId);
    if (!empresa) return;
    const numeroLiquidacion = `LIQ-BOAZ-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`;
    // Si el cliente tiene pedidos y también unidades, los servicios van solo en la liquidación de entregas (para no duplicarlos)
    const conServ = tipo==="entregas" || filtrados.length===0;
    setGenerandoLiquidacion(true);
    try {
      if (tipo==="transporte") {
        await generarLiquidacionTransporte({ filasTransporte, empresa, fechaInicio, fechaFin, numeroLiquidacion, toast, servicios: conServ ? servPer : [] });
        toast("Liquidación de transporte generada ✓ — revisa el número correlativo antes de enviarla");
      } else {
        await generarLiquidacionEntregas({ pedidosOrdenados: filtrados, empresa, fechaInicio, fechaFin, numeroLiquidacion, toast, servicios: conServ ? servPer : [] });
        toast("Liquidación de entregas generada ✓ — revisa el número correlativo antes de enviarla");
      }
    } finally { setGenerandoLiquidacion(false); }
  };

  const marcarServiciosFacturados = () => {
    const ids = servPer.map(x=>x.id); if (!ids.length) return;
    setConfirmar({ msg:`Se marcarán como facturados ${ids.length} servicio${ids.length===1?"":"s"} por ${fmt.sol(subtotalServ)} (sin IGV). Dejarán de aparecer en la pre-facturación.`, ok: async () => {
      const { error } = await sb.from("servicios_cliente").update({ facturado:true }).in("id", ids);
      setConfirmar(null);
      if (error) { toast("Error: "+error.message,"error"); return; }
      toast(`${ids.length} servicio${ids.length===1?"":"s"} marcado${ids.length===1?"":"s"} como facturado${ids.length===1?"":"s"} ✓`); setServPer([]);
    }});
  };

  return (
    <div>
      <div style={{ fontSize:13, color:B.textSec, marginBottom:14, maxWidth:720 }}>
        Elige un cliente y un rango de fechas para ver todo lo que entra en su facturación del período: pedidos, unidades por día y viajes, recojos o servicios cotizados.<Ayuda k="prefacturacion"/>
      </div>

      <div style={{ ...CARD, padding:16, display:"grid", gridTemplateColumns:"1.4fr 1fr 1fr auto", gap:10, marginBottom:16, alignItems:"end" }}>
        <div><label style={lbl}>Cliente</label>
          <select style={inp} value={empresaId} onChange={e=>{setEmpresaId(e.target.value); setGenerado(false);}}>
            <option value="todas">Todos los clientes</option>
            {empresas.map(e=><option key={e.id} value={e.id}>{e.nombre}</option>)}
          </select>
        </div>
        <div><label style={lbl}>Desde</label>
          <input type="date" style={inp} value={fechaInicio} onChange={e=>{setFechaInicio(e.target.value); setGenerado(false);}}/></div>
        <div><label style={lbl}>Hasta</label>
          <input type="date" style={inp} value={fechaFin} onChange={e=>{setFechaFin(e.target.value); setGenerado(false);}}/></div>
        <BtnPri onClick={()=>setGenerado(true)}>Generar pre-facturación</BtnPri>
      </div>

      {!generado && (
        <div style={CARD}>
          <EstadoVacio icono="filetext" titulo="Genera la pre-facturación de un período"
            texto="Selecciona el cliente y las fechas, y pulsa «Generar pre-facturación». Verás el detalle, los totales con IGV y podrás exportarlo a Excel o PDF."/>
        </div>
      )}

      {generado && (() => {
        const todas = empresaId==="todas";
        const cabecera = (ico, titulo, n, sub) => (
          <div style={{ padding:"12px 16px", borderBottom:`1px solid ${B.border}`, display:"flex", justifyContent:"space-between", alignItems:"center", gap:10, flexWrap:"wrap" }}>
            <div style={{ fontSize:13, fontWeight:700, color:B.textPri, display:"flex", alignItems:"center", gap:8 }}><Ico n={ico} size={16} color={B.gold}/> {titulo} ({n})</div>
            <div style={{ fontSize:13, color:B.textSec }}>Subtotal <b style={{ color:B.textPri }}>{fmt.sol(sub)}</b></div>
          </div>);
        const thS = { padding:"9px 14px", textAlign:"left", fontSize:11, color:B.textSec, fontWeight:700, letterSpacing:"0.3px", whiteSpace:"nowrap", background:"#F6F9FC", position:"sticky", top:0 };
        const tdS = { padding:"9px 14px", fontSize:13, color:B.textPri, borderTop:`1px solid #E3EAF2` };
        const tdR = { ...tdS, textAlign:"right", whiteSpace:"nowrap" };
        return (
          <>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14, marginBottom:16 }}>
              <Kpi icon="package" label="Pedidos" valor={fmt.sol(subtotal)} sub={`${filtrados.length.toLocaleString("en-US")} pedido${filtrados.length===1?"":"s"}`}/>
              <Kpi icon="truck" label="Unidades por día" valor={fmt.sol(subtotalTransporte)} sub={`${filasTransporte.length} unidad${filasTransporte.length===1?"":"es"}`}/>
              <Kpi icon="map" label="Viajes y servicios" valor={fmt.sol(subtotalServ)} sub={`${servPer.length} por facturar`}/>
              <Kpi icon="dollar" label="Total a facturar (con IGV)" color={B.gold} valor={fmt.sol(totalGen)} sub={`${fmt.sol(subtotalGen)} + ${fmt.sol(igvGen)} de IGV`}/>
            </div>

            {noCobrables>0 && (
              <div style={{ background:"#EFF6FF", border:"1px solid #BFDBFE", borderRadius:10, padding:"10px 14px", marginBottom:16, fontSize:12.5, color:"#1E40AF" }}>
                {noCobrables} pedido{noCobrables===1?"":"s"} del período no se suma{noCobrables===1?"":"n"} porque su cliente no tiene habilitado el cobro <strong>por pedido</strong> (se le cobra por unidad o por viaje). Si también debe cobrarse por pedido, habilítalo en Clientes → «Cómo se cobra».
              </div>
            )}

            {todas && Object.keys(porCliente).length>1 && (
              <div style={{ marginBottom:16, display:"flex", flexWrap:"wrap", gap:8 }}>
                {Object.values(porCliente).filter(c=>(c.pedidos+c.unidades+c.servicios)>0).map((c,i)=>(
                  <div key={i} style={{ fontSize:12, background:B.white, border:`1px solid ${B.border}`, borderRadius:20, padding:"5px 12px" }}>
                    <strong style={{ color:B.navy }}>{c.nombre}</strong>: {fmt.sol((c.pedidos+c.unidades+c.servicios)*1.18)}
                  </div>
                ))}
              </div>
            )}

            <div style={{ display:"flex", gap:10, marginBottom:8, flexWrap:"wrap" }}>
              <BtnSec onClick={exportarExcel}><Ico n="download" size={15}/> Exportar a Excel</BtnSec>
              <BtnSec onClick={imprimir}><Ico n="printer" size={15}/> Imprimir / PDF</BtnSec>
              {!todas && filtrados.length>0 && <BtnSec onClick={()=>generarLiquidacion("entregas")} style={generandoLiquidacion?{opacity:.6,pointerEvents:"none"}:{}}><Ico n="filetext" size={15}/> Liquidación de Entregas (formato Boaz)</BtnSec>}
              {!todas && filasTransporte.length>0 && <BtnSec onClick={()=>generarLiquidacion("transporte")} style={generandoLiquidacion?{opacity:.6,pointerEvents:"none"}:{}}><Ico n="filetext" size={15}/> Liquidación de Transporte (formato Boaz)</BtnSec>}
              {servPer.length>0 && <BtnSec onClick={marcarServiciosFacturados} style={{ marginLeft:"auto" }}><Ico n="check" size={15}/> Marcar servicios como facturados</BtnSec>}
            </div>
            <div style={{ fontSize:12, color:B.textMut, marginBottom:14 }}>
              El Excel y el PDF incluyen las tres secciones y el total. {todas ? "Elige un cliente específico para generar las liquidaciones con el formato Boaz." : "Las liquidaciones con formato Boaz traen una hoja adicional con los servicios del período."}
            </div>

            {!hayAlgo && (
              <div style={CARD}><EstadoVacio icono="filetext" titulo="No hay nada por facturar en este período" texto="No se encontraron pedidos, días de unidad ni servicios pendientes con estos filtros. Prueba con otro rango de fechas."/></div>
            )}

            {filtrados.length>0 && (
              <div style={{ ...CARD, overflow:"hidden", marginBottom:16 }}>
                {cabecera("package", "Pedidos", filtrados.length.toLocaleString("en-US"), subtotal)}
                <div style={{ maxHeight:340, overflow:"auto" }}>
                <table style={{ width:"100%", borderCollapse:"collapse" }}>
                  <thead><tr>
                    {["Tracking Boaz","N° Orden", ...(todas?["Cliente"]:[]), "Destinatario","Distrito","Fecha"].map(h=><th key={h} style={thS}>{h}</th>)}<th style={{ ...thS, textAlign:"right" }}>Subtotal</th>
                  </tr></thead>
                  <tbody>
                    {filtrados.map(p=>(
                      <tr key={p.id}>
                        <td style={{ ...tdS, fontWeight:700, color:B.navy, whiteSpace:"nowrap" }}>{p.omd}</td>
                        <td style={{ ...tdS, color:B.textSec }}>{p.cliente_referencia||"—"}</td>
                        {todas && <td style={{ ...tdS, color:B.textSec }}>{nombreEmpresa(p.empresa_id)}</td>}
                        <td style={tdS}>{p.dest_nombre}</td>
                        <td style={{ ...tdS, color:B.textSec }}>{p.dest_distrito||"—"}</td>
                        <td style={{ ...tdS, color:B.textSec, whiteSpace:"nowrap" }}>{fmt.fecha(p.created_at)}</td>
                        <td style={{ ...tdR, fontWeight:600, color:(parseFloat(p.tarifa_s)||0)>0?B.textPri:"#B45309" }}>{(parseFloat(p.tarifa_s)||0)>0 ? fmt.sol(p.tarifa_s) : "Sin tarifa"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
            )}

            {filasTransporte.length>0 && (
              <div style={{ ...CARD, overflow:"hidden", marginBottom:16 }}>
                {cabecera("truck", "Unidades por día", filasTransporte.length, subtotalTransporte)}
                <div style={{ maxHeight:340, overflow:"auto" }}>
                <table style={{ width:"100%", borderCollapse:"collapse" }}>
                  <thead><tr>
                    {[...(todas?["Cliente"]:[]), "Placa","Tipo de vehículo"].map(h=><th key={h} style={thS}>{h}</th>)}
                    {["Días trabajados","Tarifa/día","Subtotal"].map(h=><th key={h} style={{ ...thS, textAlign:"right" }}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {filasTransporte.map(f=>(
                      <tr key={f.asignacion.id}>
                        {todas && <td style={{ ...tdS, color:B.textSec }}>{nombreEmpresa(f.asignacion.empresa_id)}</td>}
                        <td style={{ ...tdS, fontWeight:700, color:B.navy }}>{f.unidad?.placa||"—"}</td>
                        <td style={{ ...tdS, textTransform:"capitalize" }}>{f.unidad?.tipo_vehiculo||"—"}</td>
                        <td style={tdR} title={f.estimado ? "Estimado por fechas: esta asignación no tiene calendario de servicio" : "Días marcados en el calendario de servicio"}>{f.dias}{f.estimado && <span style={{ fontSize:11, color:"#B45309", fontWeight:600 }}> est.</span>}</td>
                        <td style={{ ...tdR, color:B.textSec }}>{fmt.sol(f.asignacion.tarifa_dia)}</td>
                        <td style={{ ...tdR, fontWeight:600 }}>{fmt.sol(f.monto)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
            )}

            {servPer.length>0 && (
              <div style={{ ...CARD, overflow:"hidden", marginBottom:16 }}>
                {cabecera("map", "Viajes, recojos y servicios cotizados", servPer.length, subtotalServ)}
                <div style={{ maxHeight:340, overflow:"auto" }}>
                <table style={{ width:"100%", borderCollapse:"collapse" }}>
                  <thead><tr>
                    {["Fecha", ...(todas?["Cliente"]:[]), "Tipo","Concepto"].map(h=><th key={h} style={thS}>{h}</th>)}
                    {["Cant.","Tarifa","Subtotal"].map(h=><th key={h} style={{ ...thS, textAlign:"right" }}>{h}</th>)}
                  </tr></thead>
                  <tbody>{servPer.map(x => (
                    <tr key={x.id}>
                      <td style={{ ...tdS, color:B.textSec, whiteSpace:"nowrap" }}>{fmt.fecha(x.fecha)}</td>
                      {todas && <td style={{ ...tdS, color:B.textSec }}>{nombreEmpresa(x.empresa_id)}</td>}
                      <td style={tdS}><Etiqueta tono={(TIPOS_SERV[x.tipo]||{}).tono}>{(TIPOS_SERV[x.tipo]||{}).label||x.tipo}</Etiqueta></td>
                      <td style={tdS}>{x.concepto}{x.cotizacion_ref ? <span style={{ color:B.textMut }}> · Ref. {x.cotizacion_ref}</span> : null}</td>
                      <td style={tdR}>{parseFloat(x.cantidad)||0}</td><td style={{ ...tdR, color:B.textSec }}>{fmt.sol(x.tarifa_unit)}</td><td style={{ ...tdR, fontWeight:600 }}>{fmt.sol(x.monto)}</td>
                    </tr>))}</tbody>
                </table>
                </div>
              </div>
            )}

            {hayAlgo && (
              <div style={{ ...CARD, padding:"14px 18px", background:"#FFF8EF", borderColor:`${B.gold}66`, display:"flex", justifyContent:"flex-end", gap:28, flexWrap:"wrap", alignItems:"baseline", fontSize:13, color:B.textSec }}>
                <span>Subtotal: <b style={{ color:B.textPri }}>{fmt.sol(subtotalGen)}</b></span>
                <span>IGV 18%: <b style={{ color:B.textPri }}>{fmt.sol(igvGen)}</b></span>
                <span style={{ fontSize:15, color:B.navy }}>Total a facturar: <b style={{ fontSize:18, color:B.goldDk }}>{fmt.sol(totalGen)}</b></span>
              </div>
            )}
          </>
        );
      })()}
      {confirmar && <Confirm msg={confirmar.msg} onOk={confirmar.ok} onCancel={()=>setConfirmar(null)}/>}
    </div>
  );
}

export function ModalMarcarPagada({ factura, onClose, onConfirmar }) {
  const [fecha, setFecha] = useState(diaLocal());
  const [banco, setBanco] = useState("");
  const [numeroOperacion, setNumeroOperacion] = useState("");
  return (
    <div style={{ position:"fixed", inset:0, background:"#0008", zIndex:1000,
      display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ background:B.white, borderRadius:16, padding:28, width:420, boxShadow:"0 20px 60px #0003" }}>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:16 }}>
          <div style={{ fontSize:15, fontWeight:800, color:B.navy }}>Registrar pago de factura</div>
          <button onClick={onClose} style={{ background:"none", border:"none", fontSize:18, color:B.textSec, cursor:"pointer" }}>✕</button>
        </div>
        <div style={{ fontSize:13, color:B.textSec, marginBottom:16 }}>
          {factura.serie}-{factura.numero} — {factura.empresas?.nombre} — <strong style={{color:B.navy}}>{fmt.sol(factura.total_s)}</strong>
        </div>
        <label style={lbl}>Fecha de pago</label>
        <input type="date" style={{ ...inp, marginBottom:12 }} value={fecha} onChange={e=>setFecha(e.target.value)}/>
        <label style={lbl}>Banco</label>
        <select style={{ ...inp, marginBottom:12 }} value={banco} onChange={e=>setBanco(e.target.value)}>
          <option value="">— Selecciona —</option>
          <option value="BCP">BCP</option>
          <option value="BBVA">BBVA</option>
          <option value="Interbank">Interbank</option>
          <option value="Scotiabank">Scotiabank</option>
          <option value="Banco de la Nación">Banco de la Nación</option>
          <option value="Otro">Otro</option>
        </select>
        <label style={lbl}>N° de operación</label>
        <input style={{ ...inp, marginBottom:20 }} value={numeroOperacion} onChange={e=>setNumeroOperacion(e.target.value)} placeholder="Ej. 001-4521789"/>
        <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
          <BtnSec onClick={onClose}>Cancelar</BtnSec>
          <BtnPri onClick={()=>onConfirmar(fecha, banco, numeroOperacion)}>Confirmar pago</BtnPri>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// MÓDULO: PLANILLA (personal propio + terceros por honorarios/factura)
// ══════════════════════════════════════════════════════════════
export const PORCENTAJE_ONP = 13;
export const PORCENTAJE_ESSALUD = 9; // lo paga la empresa, no se descuenta al trabajador
export const UMBRAL_RETENCION_HONORARIOS = 1500; // referencial — confirma caso por caso

export function calcularNetoPlanilla(sueldoBruto, sistemaPension, porcentajeAfp) {
  const bruto = parseFloat(sueldoBruto) || 0;
  const pctPension = sistemaPension === "afp" ? (parseFloat(porcentajeAfp) || 0) : PORCENTAJE_ONP;
  const descuentoPension = bruto * (pctPension / 100);
  const essalud = bruto * (PORCENTAJE_ESSALUD / 100); // informativo, costo empleador
  const neto = bruto - descuentoPension;
  return { descuentoPension, essalud, neto, pctPension };
}

// ══════════════════════════════════════════════════════════════
// COTIZACIONES — solicitudes que llegan del formulario "Cotizar ahora" de boaz.com.pe
// ══════════════════════════════════════════════════════════════
export const ESTADOS_COTIZ = {
  nueva:      { label:"Nueva",      color:"#2563EB", bg:"#EFF6FF" },
  contactada: { label:"Contactada", color:"#D97706", bg:"#FFFBEB" },
  ganada:     { label:"Ganada",     color:"#059669", bg:"#ECFDF5" },
  perdida:    { label:"Perdida",    color:"#DC2626", bg:"#FEF2F2" },
};
export function linkWhatsApp(num, texto) {
  let d = (num||"").replace(/\D/g,"");
  if (d.length === 9) d = "51" + d;
  return `https://wa.me/${d}${texto ? `?text=${encodeURIComponent(texto)}` : ""}`;
}
export function Cotizaciones({ toast, onCambio }) {
  const [lista, setLista] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [filtro, setFiltro] = useState("todas");
  const [busq, setBusq] = useState("");
  const [abierta, setAbierta] = useState(null);
  const [notas, setNotas] = useState({});

  const cargar = async () => {
    setCargando(true);
    const { data, error } = await sb.from("cotizaciones").select("*").order("created_at", { ascending:false });
    if (error) toast("Error al cargar cotizaciones: " + error.message, "error");
    else { setLista(data||[]); onCambio && onCambio((data||[]).filter(c=>c.estado==="nueva").length); }
    setCargando(false);
  };
  useEffect(() => { cargar(); }, []);

  const cambiarEstado = async (c, estado) => {
    const { error } = await sb.from("cotizaciones").update({ estado }).eq("id", c.id);
    if (error) { toast("No se pudo actualizar: " + error.message, "error"); return; }
    const nueva = lista.map(x => x.id===c.id ? { ...x, estado } : x);
    setLista(nueva);
    onCambio && onCambio(nueva.filter(x=>x.estado==="nueva").length);
  };
  const guardarNotas = async (c) => {
    const { error } = await sb.from("cotizaciones").update({ notas: notas[c.id] ?? c.notas ?? "" }).eq("id", c.id);
    if (error) toast("No se pudo guardar la nota: " + error.message, "error");
    else { toast("Nota guardada"); setLista(lista.map(x => x.id===c.id ? { ...x, notas: notas[c.id] ?? x.notas } : x)); }
  };

  const q = busq.trim().toLowerCase();
  const filtradas = lista.filter(c =>
    (filtro==="todas" || c.estado===filtro) &&
    (!q || [c.nombre,c.empresa,c.email,c.whatsapp,c.servicio,c.mensaje].join(" ").toLowerCase().includes(q))
  );
  const cuenta = (e) => lista.filter(c=>c.estado===e).length;

  return (
    <div>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center", marginBottom:16 }}>
        {[["todas","Todas",lista.length], ...Object.entries(ESTADOS_COTIZ).map(([k,v])=>[k,v.label,cuenta(k)])].map(([k,l,n])=>(
          <button key={k} onClick={()=>setFiltro(k)}
            style={{ padding:"7px 14px", borderRadius:20, fontSize:12, fontWeight:700, cursor:"pointer",
              border:`1px solid ${filtro===k?B.gold:B.border}`,
              background: filtro===k?B.gold:B.white, color: filtro===k?B.navy:B.textSec }}>
            {l} ({n})
          </button>
        ))}
        <input value={busq} onChange={e=>setBusq(e.target.value)} placeholder="Buscar nombre, empresa, correo, WhatsApp..."
          style={{ ...inp, maxWidth:340, marginLeft:"auto" }}/>
        <BtnSec onClick={cargar}>↻ Actualizar</BtnSec>
      </div>

      {cargando ? (
        <div style={{ padding:40, textAlign:"center", color:B.textMut }}>Cargando cotizaciones…</div>
      ) : filtradas.length===0 ? (
        <div style={{ background:B.white, border:`1px solid ${B.border}`, borderRadius:12, padding:40,
          textAlign:"center", color:B.textMut }}>
          {lista.length===0 ? "Aún no hay cotizaciones. Aparecerán aquí cuando alguien use «Cotizar ahora» en boaz.com.pe." : "Sin resultados con ese filtro."}
        </div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {filtradas.map(c => {
            const est = ESTADOS_COTIZ[c.estado] || ESTADOS_COTIZ.nueva;
            const open = abierta===c.id;
            return (
              <div key={c.id} style={{ background:B.white, border:`1px solid ${B.border}`, borderLeft:`4px solid ${est.color}`,
                borderRadius:12, padding:"14px 18px" }}>
                <div style={{ display:"flex", alignItems:"center", gap:14, flexWrap:"wrap", cursor:"pointer" }}
                  onClick={()=>setAbierta(open?null:c.id)}>
                  <div style={{ flex:"1 1 220px", minWidth:0 }}>
                    <div style={{ fontSize:15, fontWeight:800, color:B.textPri }}>{c.nombre}</div>
                    <div style={{ fontSize:12, color:B.textSec }}>{c.empresa}</div>
                  </div>
                  <div style={{ flex:"1 1 180px", fontSize:12, color:B.textSec }}>
                    <div><b>{c.servicio||"—"}</b></div>
                    <div>{c.volumen||"—"}</div>
                  </div>
                  <div style={{ fontSize:12, color:B.textMut }}>{fmt.fecha(c.created_at)} {fmt.hora(c.created_at)}</div>
                  <span style={{ background:est.bg, color:est.color, padding:"3px 10px", borderRadius:20, fontSize:11, fontWeight:700 }}>{est.label}</span>
                  <span style={{ color:B.textMut }}>{open?"▲":"▼"}</span>
                </div>
                {open && (
                  <div style={{ marginTop:14, paddingTop:14, borderTop:`1px solid ${B.border}` }}>
                    <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginBottom:12 }}>
                      <a href={linkWhatsApp(c.whatsapp, `Hola ${c.nombre}, te escribimos de Boaz por tu solicitud de cotización de ${c.servicio||"nuestros servicios"}.`)}
                        target="_blank" rel="noreferrer" onClick={()=>c.estado==="nueva" && cambiarEstado(c,"contactada")}
                        style={{ background:"#25D366", color:"#fff", padding:"8px 14px", borderRadius:8, fontSize:12, fontWeight:700, textDecoration:"none" }}>
                        WhatsApp {c.whatsapp}
                      </a>
                      <a href={`mailto:${c.email}?subject=${encodeURIComponent("Cotización Boaz")}`}
                        style={{ background:B.navy, color:"#fff", padding:"8px 14px", borderRadius:8, fontSize:12, fontWeight:700, textDecoration:"none" }}>
                        {c.email}
                      </a>
                      <select value={c.estado} onChange={e=>cambiarEstado(c, e.target.value)} style={{ ...inp, width:"auto" }}>
                        {Object.entries(ESTADOS_COTIZ).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                      </select>
                    </div>
                    <div style={lbl}>Mensaje del cliente</div>
                    <div style={{ background:B.bg, borderRadius:8, padding:"10px 12px", fontSize:13, color:B.textPri, marginBottom:12, whiteSpace:"pre-wrap" }}>
                      {c.mensaje || "— sin mensaje —"}
                    </div>
                    <div style={lbl}>Notas internas</div>
                    <textarea rows={2} style={{ ...inp, resize:"vertical" }} placeholder="Seguimiento, precio cotizado, próxima acción…"
                      value={notas[c.id] ?? c.notas ?? ""} onChange={e=>setNotas({ ...notas, [c.id]: e.target.value })}/>
                    <div style={{ marginTop:8 }}><BtnPri onClick={()=>guardarNotas(c)}>Guardar nota</BtnPri></div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── COBRANZA: cuentas por cobrar, detracciones y contraentrega (COD) ──
export const BUCKETS_CXC = [
  { id:"b0", label:"0–30 días",      min:0,  max:30,    color:"#047857" },
  { id:"b1", label:"31–60 días",     min:31, max:60,    color:"#B45309" },
  { id:"b2", label:"61–90 días",     min:61, max:90,    color:"#C2410C" },
  { id:"b3", label:"Más de 90 días", min:91, max:99999, color:"#B91C1C" },
];
export const diasDesdeFecha = (f) => f ? Math.floor((new Date(diaLocal()+"T00:00:00") - new Date(String(f).slice(0,10)+"T00:00:00"))/86400000) : 0;

export function Cobranza({ pedidos, empresas, repartidores, onRefresh, toast }) {
  const [tab, setTab] = useState("cxc");
  const [facturas, setFacturas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [bucket, setBucket] = useState("");
  const [fEmpresa, setFEmpresa] = useState("");
  const [busq, setBusq] = useState("");
  const [modalPago, setModalPago] = useState(null);
  const [modalDet, setModalDet] = useState(null);
  const [detFecha, setDetFecha] = useState(diaLocal());
  const [detConst, setDetConst] = useState("");
  const [verRendidos, setVerRendidos] = useState(false);
  const [selCod, setSelCod] = useState({});

  const cargar = async () => {
    setCargando(true);
    const { data, error } = await traerTodo(() => sb.from("facturas").select("*,empresas(nombre,telefono)").order("fecha_emision", { ascending:true }).order("id"));
    if (error) toast("Error al cargar facturas: " + error.message, "error"); else setFacturas(data||[]);
    setCargando(false);
  };
  useEffect(() => { cargar(); }, []);

  const vigentes = useMemo(() => facturas.filter(f => f.estado!=="anulada" && f.estado!=="anulado"), [facturas]);
  const pend = useMemo(() => vigentes.filter(f => f.estado_pago!=="pagado").map(f => ({ ...f, dias: diasDesdeFecha(f.fecha_emision) })), [vigentes]);
  const numV = (v) => parseFloat(v)||0;

  const resumenBuckets = BUCKETS_CXC.map(b => {
    const l = pend.filter(f => f.dias>=b.min && f.dias<=b.max);
    return { ...b, n:l.length, total:l.reduce((t,f)=>t+numV(f.total_s),0) };
  });
  const totalPend = pend.reduce((t,f)=>t+numV(f.total_s),0);
  const cobradoMes = vigentes.filter(f => f.estado_pago==="pagado" && (f.fecha_pago||"").slice(0,7)===diaLocal().slice(0,7)).reduce((t,f)=>t+numV(f.total_s),0);

  const lista = useMemo(() => {
    const q = busq.trim().toLowerCase();
    const b = BUCKETS_CXC.find(x => x.id===bucket);
    return pend.filter(f =>
      (!b || (f.dias>=b.min && f.dias<=b.max)) && (!fEmpresa || f.empresa_id===fEmpresa) &&
      (!q || `${f.serie}-${f.numero} ${f.empresas?.nombre||""} ${f.descripcion||""}`.toLowerCase().includes(q))
    ).sort((a,b) => b.dias-a.dias);
  }, [pend, bucket, fEmpresa, busq]);
  const pgCxc = usePaginacion(lista, 25, "facturas");

  const porCliente = useMemo(() => {
    const m = {};
    pend.forEach(f => { const n = f.empresas?.nombre || "—"; m[n] = (m[n]||0) + numV(f.total_s); });
    return Object.entries(m).sort((a,b)=>b[1]-a[1]).slice(0,6);
  }, [pend]);

  const marcarPagada = async (fecha, banco, numeroOperacion) => {
    const { error } = await sb.from("facturas").update({ estado_pago:"pagado", fecha_pago:fecha, banco_pago:banco||null, numero_operacion:numeroOperacion||null }).eq("id", modalPago.id);
    if (error) { toast("Error: "+error.message, "error"); return; }
    toast("Factura marcada como pagada ✓"); setModalPago(null); cargar();
  };

  const recordatorio = (f) => {
    const tel = f.empresas?.telefono;
    if (!tel) { toast("Este cliente no tiene teléfono registrado", "error"); return; }
    const msg = `Hola, le escribimos de Grupo Boaz S.A.C. Le recordamos que la factura ${f.serie}-${f.numero} por ${fmt.sol(f.total_s)}, emitida el ${fmt.fecha(f.fecha_emision)}, figura pendiente de pago. Agradeceremos confirmar la fecha de cancelación. Gracias.`;
    window.open(linkWhatsApp(tel, msg), "_blank");
  };

  // detracciones
  const conDet = useMemo(() => vigentes.filter(f => numV(f.monto_detraccion)>0), [vigentes]);
  const detPend = conDet.filter(f => !f.detraccion_depositada);
  const detPendTotal = detPend.reduce((t,f)=>t+numV(f.monto_detraccion),0);
  const detDepMes = conDet.filter(f => f.detraccion_depositada && (f.detraccion_fecha||"").slice(0,7)===diaLocal().slice(0,7)).reduce((t,f)=>t+numV(f.monto_detraccion),0);
  const confirmarDet = async () => {
    const { error } = await sb.from("facturas").update({ detraccion_depositada:true, detraccion_fecha:detFecha, detraccion_constancia:detConst||null }).eq("id", modalDet.id);
    if (error) { toast("Error: " + error.message + " (¿ejecutaste cobranza_boaz.sql?)", "error"); return; }
    toast("Detracción registrada como depositada ✓"); setModalDet(null); setDetConst(""); cargar();
  };

  // contraentrega (COD)
  const codEntregados = useMemo(() => pedidos.filter(p => p.cobro_destino && p.estado==="entregado"), [pedidos]);
  const codPend = codEntregados.filter(p => !p.cod_rendido);
  const codRend = codEntregados.filter(p => p.cod_rendido);
  const codEnCalle = pedidos.filter(p => p.cobro_destino && p.estado!=="entregado" && p.estado!=="no_entregado" && p.estado!=="cancelado");
  const montoCod = (l) => l.reduce((t,p)=>t+numV(p.monto_cobrar),0);
  const porRepartidor = useMemo(() => {
    const m = {};
    codPend.forEach(p => { const k = p.repartidor_id || "—"; (m[k] = m[k] || []).push(p); });
    return Object.entries(m).map(([id, ps]) => {
      const r = repartidores.find(x => x.id===id);
      const masViejo = Math.max(...ps.map(p => diasDesdeFecha(p.fecha_entrega || p.created_at)));
      return { id, nombre: r ? `${r.nombres||""} ${r.apellidos||""}`.trim() : "Sin repartidor", ps, total: montoCod(ps), dias: masViejo };
    }).sort((a,b)=>b.total-a.total);
  }, [codPend, repartidores]);
  const idsSel = Object.keys(selCod).filter(k => selCod[k]);
  const totalSel = montoCod(codPend.filter(p => selCod[p.id]));
  const rendir = async (ids) => {
    if (!ids.length) return;
    const { error } = await sb.from("pedidos").update({ cod_rendido:true, cod_rendido_fecha:diaLocal() }).in("id", ids);
    if (error) { toast("Error: " + error.message + " (¿ejecutaste cobranza_boaz.sql?)", "error"); return; }
    toast(`${ids.length} cobro${ids.length===1?"":"s"} marcado${ids.length===1?"":"s"} como rendido${ids.length===1?"":"s"} ✓`);
    setSelCod({}); onRefresh && onRefresh();
  };

  const exportar = async () => {
    await asegurarXLSX();
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(lista.map(f => ({ Cliente:f.empresas?.nombre||"", Factura:`${f.serie}-${f.numero}`, Emisión:f.fecha_emision, "Días":f.dias, Total:numV(f.total_s), Detracción:numV(f.monto_detraccion), "Neto a cobrar":numV(f.total_s)-numV(f.monto_detraccion) }))), "Por cobrar");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detPend.map(f => ({ Cliente:f.empresas?.nombre||"", Factura:`${f.serie}-${f.numero}`, Emisión:f.fecha_emision, Detracción:numV(f.monto_detraccion), "%":numV(f.porcentaje_detraccion) }))), "Detracciones pendientes");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(codPend.map(p => ({ Pedido:p.omd, Destinatario:p.dest_nombre, Repartidor:(repartidores.find(r=>r.id===p.repartidor_id)||{}).nombres||"", Monto:numV(p.monto_cobrar) }))), "COD sin rendir");
    XLSX.writeFile(wb, `cobranza_boaz_${diaLocal()}.xlsx`);
  };

  const th = { textAlign:"left", padding:"10px 14px", fontSize:11, fontWeight:700, color:B.textSec, background:"#F6F9FC", letterSpacing:".3px", borderBottom:"1px solid #E3EAF2", whiteSpace:"nowrap" };
  const td = { padding:"12px 14px", fontSize:13, borderBottom:"1px solid #E3EAF2", color:B.textPri, verticalAlign:"middle" };
  const card = CARD;
  const TabBtn = ({ id, children, n }) => (
    <button onClick={()=>setTab(id)} style={TAB_SEG(tab===id)}>
      {children}{n ? <span style={{ background:"#FEE2E2", color:"#B91C1C", fontSize:11, fontWeight:700, padding:"1px 7px", borderRadius:10 }}>{n}</span> : null}
    </button>
  );

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:10, marginBottom:16 }}>
        <div>
          <div style={{ fontSize:12, color:B.textSec }}>Seguimiento de lo que te deben: facturas por cobrar con antigüedad, detracciones y cobros contraentrega.</div>
        </div>
        <BtnSec onClick={exportar}><Ico n="download" size={15}/> Excel</BtnSec>
      </div>

      <div style={{ ...TAB_CONT, marginBottom:14 }}>
        <TabBtn id="cxc" n={pend.filter(f=>f.dias>60).length}>Cuentas por cobrar</TabBtn>
        <TabBtn id="det" n={detPend.length}>Detracciones<Ayuda k="detraccion" size={13}/></TabBtn>
        <TabBtn id="cod" n={codPend.length}>Contraentrega (COD)<Ayuda k="cod" size={13}/></TabBtn>
      </div>

      {tab==="cxc" && (<>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))", gap:12, marginBottom:14 }}>
          <div style={{ ...card, padding:"14px 16px" }}>
            <div style={{ fontSize:12, color:B.textSec, fontWeight:600 }}>Total por cobrar</div>
            <div style={{ fontSize:22, fontWeight:800, color:B.navy, marginTop:6 }}>{solN(totalPend)}</div>
            <div style={{ fontSize:12, color:B.textSec, marginTop:4 }}>{pend.length} factura{pend.length===1?"":"s"} · cobrado este mes {solN(cobradoMes)}</div>
          </div>
          {resumenBuckets.map(b => (
            <button key={b.id} onClick={()=>setBucket(bucket===b.id?"":b.id)} className="bz-card-hover"
              title="Filtrar por esta antigüedad" style={{ ...card, padding:"14px 16px", textAlign:"left", cursor:"pointer", outline: bucket===b.id?`2px solid ${b.color}`:"none" }}>
              <div style={{ fontSize:12, color:B.textSec, fontWeight:600, display:"flex", alignItems:"center", gap:7 }}><span style={{ width:8, height:8, borderRadius:"50%", background:b.color }}/>{b.label}</div>
              <div style={{ fontSize:22, fontWeight:800, color:b.total>0?b.color:B.textMut, marginTop:6 }}>{solN(b.total)}</div>
              <div style={{ fontSize:12, color:B.textSec, marginTop:4 }}>{b.n} factura{b.n===1?"":"s"}</div>
            </button>
          ))}
        </div>

        <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginBottom:12, alignItems:"flex-end" }}>
          <div><label style={lbl}>Cliente</label>
            <select style={{...inp,width:230}} value={fEmpresa} onChange={e=>setFEmpresa(e.target.value)}><option value="">Todos</option>{empresas.map(e=><option key={e.id} value={e.id}>{e.nombre}</option>)}</select></div>
          <div style={{ flex:"1 1 200px", minWidth:0 }}><label style={lbl}>Buscar</label><input style={inp} placeholder="N° factura, cliente…" value={busq} onChange={e=>setBusq(e.target.value)}/></div>
          {(bucket||fEmpresa||busq) && <BtnSec onClick={()=>{setBucket("");setFEmpresa("");setBusq("");}}>Limpiar filtros</BtnSec>}
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"minmax(0,1fr) 280px", gap:14, alignItems:"start" }}>
          <div style={{ ...card, overflowX:"auto" }}>
            {cargando ? <Cargando filas={5}/> : lista.length===0 ?
              <EstadoVacio icono="check" titulo="Sin facturas pendientes" texto="No hay facturas por cobrar con estos filtros."/> :
              <><table style={{ width:"100%", borderCollapse:"collapse" }}>
                <thead><tr><th style={th}>Cliente</th><th style={th}>Factura</th><th style={th}>Emisión</th><th style={{...th,textAlign:"right"}}>Días<Ayuda k="antiguedad" size={13}/></th><th style={{...th,textAlign:"right"}}>Total</th><th style={{...th,textAlign:"right"}}>Neto a cobrar<Ayuda k="detraccion" size={13} derecha/></th><th style={th}></th></tr></thead>
                <tbody>{pgCxc.visibles.map(f => {
                  const b = BUCKETS_CXC.find(x => f.dias>=x.min && f.dias<=x.max) || BUCKETS_CXC[0];
                  return (
                    <tr key={f.id}>
                      <td style={{...td,fontWeight:600}}>{f.empresas?.nombre||"—"}</td>
                      <td style={td}>{f.serie}-{f.numero}</td>
                      <td style={td}>{fmt.fecha(f.fecha_emision)}</td>
                      <td style={{...td,textAlign:"right"}}><span style={{ background:`${b.color}18`, color:b.color, fontWeight:800, fontSize:12, padding:"2px 9px", borderRadius:20 }}>{f.dias}</span></td>
                      <td style={{...td,textAlign:"right",fontWeight:700}}>{solN(numV(f.total_s))}</td>
                      <td style={{...td,textAlign:"right"}}>{solN(numV(f.total_s)-numV(f.monto_detraccion))}</td>
                      <td style={{...td,whiteSpace:"nowrap",textAlign:"right"}}>
                        <button onClick={()=>recordatorio(f)} title="Enviar recordatorio por WhatsApp" className="bz-btn-sec" style={{ background:B.white, border:`1px solid ${B.border}`, color:B.textPri, borderRadius:8, padding:"5px 10px", fontSize:12, fontWeight:600, cursor:"pointer", marginRight:6, display:"inline-flex", alignItems:"center", gap:5, verticalAlign:"middle" }}><Ico n="phone" size={13} color="#047857"/> Recordar</button>
                        <button className="bz-btn-sec" onClick={()=>setModalPago(f)} style={{ background:B.white, border:`1px solid ${B.border}`, color:"#047857", borderRadius:8, padding:"5px 10px", fontSize:12, fontWeight:600, cursor:"pointer" }}>Registrar pago</button>
                      </td>
                    </tr>);
                })}</tbody>
              </table>{pgCxc.pie}</>}
          </div>
          <div style={{ ...card, padding:16 }}>
            <div style={{ fontSize:13, fontWeight:700, color:B.navy, marginBottom:12 }}>Quién más te debe</div>
            {porCliente.length===0 ? <div style={{ fontSize:12, color:B.textMut }}>Sin deuda pendiente</div> : porCliente.map(([n,v]) => (
              <div key={n} style={{ marginBottom:10 }}>
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, marginBottom:3 }}><span style={{ fontWeight:600, color:B.textPri, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:150 }}>{n}</span><span style={{ color:B.textSec }}>{solN(v)}</span></div>
                <div style={{ height:6, background:B.bg, borderRadius:4 }}><div style={{ height:6, borderRadius:4, background:B.gold, width:`${totalPend?v/totalPend*100:0}%` }}/></div>
              </div>))}
          </div>
        </div>
        <div style={{ fontSize:11, color:B.textMut, marginTop:8 }}>La antigüedad se cuenta desde la fecha de emisión de la factura.</div>
      </>)}

      {tab==="det" && (<>
        <div style={{ display:"flex", gap:12, flexWrap:"wrap", marginBottom:14 }}>
          <div style={{ flex:"1 1 200px", minWidth:0, display:"grid" }}><KpiDS icon="clock" label="Detracciones por confirmar" valor={solN(detPendTotal)} sub={<>{detPend.length} factura{detPend.length===1?"":"s"}</>} color={B.orange} cv="#B45309"/></div>
          <div style={{ flex:"1 1 200px", minWidth:0, display:"grid" }}><KpiDS icon="check" label="Depositadas este mes" valor={solN(detDepMes)} color={B.green} cv="#047857"/></div>
        </div>
        <div style={{ fontSize:12, color:B.textSec, marginBottom:10 }}>Marca cada detracción cuando el cliente la deposite en tu cuenta del Banco de la Nación y confirmes la constancia de depósito.</div>
        <div style={{ ...card, overflowX:"auto" }}>
          {cargando ? <Cargando filas={4}/> : detPend.length===0 ?
            <EstadoVacio icono="check" titulo="Sin detracciones pendientes" texto="Todas las detracciones están confirmadas."/> :
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead><tr><th style={th}>Cliente</th><th style={th}>Factura</th><th style={th}>Emisión</th><th style={{...th,textAlign:"right"}}>%</th><th style={{...th,textAlign:"right"}}>Detracción</th><th style={th}></th></tr></thead>
              <tbody>{detPend.map(f => (
                <tr key={f.id}><td style={{...td,fontWeight:600}}>{f.empresas?.nombre||"—"}</td><td style={td}>{f.serie}-{f.numero}</td><td style={td}>{fmt.fecha(f.fecha_emision)}</td>
                  <td style={{...td,textAlign:"right"}}>{numV(f.porcentaje_detraccion)}%</td><td style={{...td,textAlign:"right",fontWeight:700}}>{solN(numV(f.monto_detraccion))}</td>
                  <td style={{...td,textAlign:"right"}}><button onClick={()=>{setModalDet(f);setDetFecha(diaLocal());}} style={{ background:B.gold, border:"none", color:B.navy, borderRadius:8, padding:"5px 10px", fontSize:12, fontWeight:700, cursor:"pointer" }}>Marcar depositada</button></td></tr>))}</tbody>
            </table>}
        </div>
      </>)}

      {tab==="cod" && (<>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))", gap:12, marginBottom:14 }}>
          <KpiDS icon="alert" label="Cobrado sin rendir" valor={solN(montoCod(codPend))} sub={<>{codPend.length} pedido{codPend.length===1?"":"s"} entregado{codPend.length===1?"":"s"} · dinero en manos de repartidores</>} color={B.red} cv="#B91C1C"/>
          <KpiDS icon="bike" label="Por cobrar en la calle" valor={solN(montoCod(codEnCalle))} sub={<>{codEnCalle.length} pedido{codEnCalle.length===1?"":"s"} aún sin entregar</>} color={B.goldDk}/>
          <KpiDS icon="check" label="Ya rendido" valor={solN(montoCod(codRend))} sub={<>{codRend.length} pedido{codRend.length===1?"":"s"}</>} color={B.green} cv="#047857"/>
        </div>

        {idsSel.length>0 && (
          <div style={{ position:"sticky", top:0, zIndex:5, background:B.navy, color:"#fff", borderRadius:10, padding:"10px 16px", marginBottom:12, display:"flex", alignItems:"center", gap:14 }}>
            <span style={{ fontSize:13 }}>{idsSel.length} seleccionado{idsSel.length===1?"":"s"} · <b>{solN(totalSel)}</b></span>
            <BtnPri onClick={()=>rendir(idsSel)} style={{ marginLeft:"auto", padding:"6px 14px" }}>Marcar como rendido</BtnPri>
            <button onClick={()=>setSelCod({})} style={{ background:"none", border:"none", color:"#8FA3BA", cursor:"pointer", fontSize:12 }}>Cancelar</button>
          </div>)}

        {porRepartidor.length===0 ? <div style={card}><EstadoVacio icono="check" titulo="Todo rendido" texto="No hay cobros contraentrega pendientes de rendir."/></div> :
          porRepartidor.map(g => (
            <div key={g.id} style={{ ...card, marginBottom:12, overflow:"hidden" }}>
              <div style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 16px", background:B.bg, borderBottom:`1px solid ${B.border}`, flexWrap:"wrap" }}>
                <div style={{ fontWeight:800, color:B.navy, fontSize:14 }}>{g.nombre}</div>
                <span style={{ fontSize:12, color:B.textSec }}>{g.ps.length} cobro{g.ps.length===1?"":"s"}</span>
                {g.dias>=3 && <span style={{ background:"#FEF2F2", color:B.red, fontSize:11, fontWeight:700, padding:"2px 9px", borderRadius:20 }}>hasta {g.dias} días sin rendir</span>}
                <span style={{ marginLeft:"auto", fontWeight:800, color:B.red }}>{solN(g.total)}</span>
                <button onClick={()=>rendir(g.ps.map(p=>p.id))} style={{ background:B.gold, border:"none", color:B.navy, borderRadius:8, padding:"5px 12px", fontSize:12, fontWeight:700, cursor:"pointer" }}>Rendir todo</button>
              </div>
              <table style={{ width:"100%", borderCollapse:"collapse" }}>
                <tbody>{g.ps.map(p => (
                  <tr key={p.id}>
                    <td style={{...td,width:36}}><input type="checkbox" checked={!!selCod[p.id]} onChange={e=>setSelCod(s=>({...s,[p.id]:e.target.checked}))}/></td>
                    <td style={{...td,fontWeight:600}}>{p.omd}</td>
                    <td style={td}>{p.dest_nombre||"—"}</td>
                    <td style={td}>{fmt.fecha(p.fecha_entrega||p.created_at)}</td>
                    <td style={{...td,textAlign:"right",fontWeight:700}}>{solN(numV(p.monto_cobrar))}</td>
                  </tr>))}</tbody>
              </table>
            </div>))}

        {codRend.length>0 && (
          <div style={{ marginTop:8 }}>
            <button onClick={()=>setVerRendidos(v=>!v)} style={{ background:"none", border:"none", color:B.blue, fontSize:12, fontWeight:700, cursor:"pointer" }}>{verRendidos?"Ocultar":"Ver"} rendidos recientes ({codRend.length})</button>
            {verRendidos && (
              <div style={{ ...card, overflowX:"auto", marginTop:8 }}>
                <table style={{ width:"100%", borderCollapse:"collapse" }}>
                  <thead><tr><th style={th}>Pedido</th><th style={th}>Destinatario</th><th style={th}>Rendido el</th><th style={{...th,textAlign:"right"}}>Monto</th></tr></thead>
                  <tbody>{[...codRend].sort((a,b)=>(b.cod_rendido_fecha||"").localeCompare(a.cod_rendido_fecha||"")).slice(0,50).map(p => (
                    <tr key={p.id}><td style={td}>{p.omd}</td><td style={td}>{p.dest_nombre||"—"}</td><td style={td}>{fmt.fecha(p.cod_rendido_fecha)}</td><td style={{...td,textAlign:"right"}}>{solN(numV(p.monto_cobrar))}</td></tr>))}</tbody>
                </table>
              </div>)}
          </div>)}
        <div style={{ fontSize:11, color:B.textMut, marginTop:8 }}>Se considera "cobrado" el COD de pedidos entregados. Marca "rendido" cuando el repartidor te entregue el dinero.</div>
      </>)}

      {modalPago && <ModalMarcarPagada factura={modalPago} onClose={()=>setModalPago(null)} onConfirmar={marcarPagada}/>}
      {modalDet && (
        <div style={{ position:"fixed", inset:0, background:"#0008", zIndex:1500, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
          <div style={{ background:B.white, borderRadius:16, padding:26, width:400, maxWidth:"100%", boxShadow:"0 20px 60px #0003" }}>
            <div style={{ fontSize:15, fontWeight:800, color:B.navy, marginBottom:6 }}>Detracción depositada</div>
            <div style={{ fontSize:13, color:B.textSec, marginBottom:14 }}>{modalDet.serie}-{modalDet.numero} · {modalDet.empresas?.nombre} · <b>{solN(numV(modalDet.monto_detraccion))}</b></div>
            <label style={lbl}>Fecha de depósito</label>
            <input type="date" style={{...inp,marginBottom:12}} value={detFecha} onChange={e=>setDetFecha(e.target.value)}/>
            <label style={lbl}>N° de constancia (opcional)</label>
            <input style={{...inp,marginBottom:18}} value={detConst} onChange={e=>setDetConst(e.target.value)}/>
            <div style={{ display:"flex", justifyContent:"flex-end", gap:10 }}><BtnSec onClick={()=>setModalDet(null)}>Cancelar</BtnSec><BtnPri onClick={confirmarDet}>Confirmar</BtnPri></div>
          </div>
        </div>)}
    </div>
  );
}

