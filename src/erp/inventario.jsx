// BOAZ ERP — módulo "inventario" (parte de BoazERP; ver src/BoazERP.jsx)
import { useState, useEffect, useCallback, useRef, useMemo, Fragment } from "react";
import { B, BtnPri, BtnSec, Cargando, Ico, Kpi, TAB_CONT, TAB_SEG, XLSX, asegurarXLSX, fmt, inp, lbl, sb } from "./base.jsx";
import { normalizarTextoAdmin } from "./pedidos.jsx";

// ══════════════════════════════════════════════════════════════
// MÓDULO: INVENTARIO (tienda virtual / marketplace)
// Productos con variantes, movimientos de stock, y flujo de
// picking → packing → despacho, con escaneo de código de barras.
// ══════════════════════════════════════════════════════════════

// ── Escáner de código de barras (cámara) ──
export function cargarHtml5Qrcode() {
  return new Promise((resolve) => {
    if (window.Html5Qrcode) { resolve(window.Html5Qrcode); return; }
    const script = document.createElement("script");
    script.src = "https://unpkg.com/html5-qrcode@2.3.8/dist/html5-qrcode.min.js";
    script.onload = () => resolve(window.Html5Qrcode);
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });
}

export function EscanerCodigoBarras({ onDetectado, onCerrar, toast }) {
  const [cargando, setCargando] = useState(true);
  const scannerRef = useRef(null);
  const detenidoRef = useRef(false);

  useEffect(() => {
    let scanner;
    (async () => {
      const Html5Qrcode = await cargarHtml5Qrcode();
      if (!Html5Qrcode) { toast("No se pudo cargar el escáner — revisa tu conexión","error"); onCerrar(); return; }
      scanner = new Html5Qrcode("lector-codigo-barras");
      scannerRef.current = scanner;
      try {
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 260, height: 140 } },
          (textoDecodificado) => {
            if (detenidoRef.current) return;
            detenidoRef.current = true;
            scanner.stop().catch(()=>{});
            onDetectado(textoDecodificado);
          },
          () => {} // errores de decodificación cuadro a cuadro, se ignoran
        );
        setCargando(false);
      } catch (e) {
        toast("No se pudo acceder a la cámara. Revisa los permisos.","error");
        onCerrar();
      }
    })();
    return () => {
      if (scannerRef.current && !detenidoRef.current) {
        scannerRef.current.stop().catch(()=>{});
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ position:"fixed", inset:0, background:"#000", zIndex:2000,
      display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:20 }}>
      <button onClick={onCerrar} style={{ position:"absolute", top:16, right:16, background:"none",
        border:"none", color:"#fff", fontSize:28, cursor:"pointer" }}>✕</button>
      {cargando && <div style={{ color:"#fff", marginBottom:16, fontSize:13 }}>Iniciando cámara...</div>}
      <div id="lector-codigo-barras" style={{ width:"100%", maxWidth:400 }}/>
      <div style={{ color:"#9CA3AF", fontSize:12, marginTop:16, textAlign:"center" }}>
        Apunta la cámara al código de barras del producto
      </div>
    </div>
  );
}

export function Inventario({ empresas, toast }) {
  const [tab, setTab] = useState("productos");
  const [productos, setProductos] = useState([]);
  const [variantes, setVariantes] = useState([]);
  const [movimientos, setMovimientos] = useState([]);
  const [ordenes, setOrdenes] = useState([]);
  const [itemsOrden, setItemsOrden] = useState([]);
  const [cargando, setCargando] = useState(true);

  const [modalProducto, setModalProducto] = useState(false);
  const [editandoProducto, setEditandoProducto] = useState(null);
  const [modalMovimiento, setModalMovimiento] = useState(false);
  const [modalOrden, setModalOrden] = useState(false);
  const [modalCargaProductos, setModalCargaProductos] = useState(false);
  const [ordenDetalle, setOrdenDetalle] = useState(null);

  const cargar = async () => {
    setCargando(true);
    const [p, v, m, o, io] = await Promise.all([
      sb.from("inv_productos").select("*").order("nombre"),
      sb.from("inv_variantes").select("*").order("sku"),
      sb.from("inv_movimientos").select("*").order("created_at",{ascending:false}).limit(100),
      sb.from("inv_ordenes").select("*").order("fecha_orden",{ascending:false}),
      sb.from("inv_items_orden").select("*"),
    ]);
    if (p.data) setProductos(p.data);
    if (v.data) setVariantes(v.data);
    if (m.data) setMovimientos(m.data);
    if (o.data) setOrdenes(o.data);
    if (io.data) setItemsOrden(io.data);
    setCargando(false);
  };
  useEffect(() => { cargar(); }, []);

  const variantesConProducto = variantes.map(v => ({ ...v, producto: productos.find(p=>p.id===v.producto_id) }));
  const stockBajo = variantesConProducto.filter(v => v.activo && v.stock_actual <= v.stock_minimo);
  const valorInventario = variantesConProducto.reduce((s,v)=> s + (v.stock_actual * (parseFloat(v.producto?.costo)||0)), 0);
  const ordenesPendientes = ordenes.filter(o => !["despachado","cancelado"].includes(o.estado));

  if (cargando) return <Cargando filas={6}/>;

  return (
    <div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14, marginBottom:20 }}>
        <Kpi icon="package" label="SKU activos" valor={variantes.filter(v=>v.activo).length} color={B.navy}/>
        <Kpi icon="dollar" label="Valor de inventario (costo)" valor={fmt.sol(valorInventario)} color={B.gold}/>
        <Kpi icon="alert" label="Stock bajo / agotado" valor={stockBajo.length} color={B.red} cv="#B91C1C"/>
        <Kpi icon="truck" label="Órdenes por despachar" valor={ordenesPendientes.length} color={B.blue}/>
      </div>

      <div style={{ ...TAB_CONT, marginBottom:16 }}>
        {[["productos","Productos"],["movimientos","Movimientos"],["ordenes","Órdenes"]].map(([id,label])=>(
          <button key={id} onClick={()=>setTab(id)}
            style={TAB_SEG(tab===id)}>
            {label}
          </button>
        ))}
      </div>

      {tab==="productos" && (
        <>
          {stockBajo.length>0 && (
            <div style={{ background:"#FEF2F2", border:`1px solid ${B.red}`, borderRadius:10,
              padding:"10px 14px", marginBottom:14, fontSize:12, color:"#991B1B" }}>
              {stockBajo.length} variante{stockBajo.length===1?"":"s"} con stock bajo o agotado: {stockBajo.slice(0,5).map(v=>v.sku).join(", ")}{stockBajo.length>5?"...":""}
            </div>
          )}
          <div style={{ display:"flex", justifyContent:"flex-end", gap:8, marginBottom:12 }}>
            <BtnSec onClick={()=>setModalCargaProductos(true)}><Ico n="upload" size={15}/> Carga masiva</BtnSec>
            <BtnPri onClick={()=>{setEditandoProducto(null); setModalProducto(true);}}><Ico n="plus" size={15} sw={2.4}/> Nuevo producto</BtnPri>
          </div>
          <div style={{ background:B.white, border:`1px solid ${B.border}`, borderRadius:12, overflow:"hidden" }}>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead><tr style={{ background:"#F6F9FC" }}>
                {["Producto","SKU","Variante","Ubicación","Stock","Stock mín.","Estado","Acciones"].map(h=>(
                  <th key={h} style={{ padding:"9px 12px", textAlign:"left", fontSize:11, color:B.textSec, fontWeight:700, letterSpacing:"0.3px", whiteSpace:"nowrap" }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {variantesConProducto.map((v,i)=>{
                  const bajo = v.stock_actual <= v.stock_minimo;
                  return (
                    <tr key={v.id} style={{ borderTop:`1px solid ${B.border}`, background:B.white, opacity:v.activo?1:0.5 }}>
                      <td style={{ padding:"9px 12px", fontSize:12, fontWeight:700, color:B.navy }}>{v.producto?.nombre||"—"}</td>
                      <td style={{ padding:"9px 12px", fontSize:11, color:B.textSec, fontFamily:"monospace" }}>{v.sku}</td>
                      <td style={{ padding:"9px 12px", fontSize:11, color:B.textSec }}>{[v.talla,v.color,v.atributo_extra].filter(Boolean).join(" / ")||"—"}</td>
                      <td style={{ padding:"9px 12px", fontSize:11, color:B.textMut }}>{v.ubicacion||"—"}</td>
                      <td style={{ padding:"9px 12px", fontSize:13, fontWeight:800, color: bajo?B.red:B.textPri }}>{v.stock_actual}</td>
                      <td style={{ padding:"9px 12px", fontSize:11, color:B.textMut }}>{v.stock_minimo}</td>
                      <td style={{ padding:"9px 12px" }}>
                        {bajo ? (
                          <span style={{ fontSize:10, padding:"3px 8px", borderRadius:10, fontWeight:700, background:"#FEF2F2", color:B.red }}>Bajo</span>
                        ) : (
                          <span style={{ fontSize:10, padding:"3px 8px", borderRadius:10, fontWeight:700, background:"#ECFDF5", color:B.green }}>OK</span>
                        )}
                      </td>
                      <td style={{ padding:"9px 12px" }}>
                        <button onClick={()=>{setEditandoProducto(v.producto); setModalProducto(true);}}
                          style={{ fontSize:11, color:B.blue, background:"none", border:"none", cursor:"pointer" }}><Ico n="edit" size={13} style={{ display:"inline-block", verticalAlign:"-2px", marginRight:5 }}/>Editar</button>
                      </td>
                    </tr>
                  );
                })}
                {variantes.length===0 && <tr><td colSpan={8} style={{ padding:30, textAlign:"center", color:B.textMut, fontSize:13 }}>Sin productos registrados</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab==="movimientos" && (
        <>
          <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:12 }}>
            <BtnPri onClick={()=>setModalMovimiento(true)}><Ico n="plus" size={15} sw={2.4}/> Registrar movimiento</BtnPri>
          </div>
          <div style={{ background:B.white, border:`1px solid ${B.border}`, borderRadius:12, overflow:"hidden" }}>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead><tr style={{ background:"#F6F9FC" }}>
                {["Fecha","SKU","Tipo","Cantidad","Stock resultante","Motivo","Referencia","Usuario"].map(h=>(
                  <th key={h} style={{ padding:"9px 12px", textAlign:"left", fontSize:11, color:B.textSec, fontWeight:700, letterSpacing:"0.3px", whiteSpace:"nowrap" }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {movimientos.map((m,i)=>{
                  const v = variantes.find(x=>x.id===m.variante_id);
                  const colorTipo = m.tipo==="ingreso"||m.tipo==="devolucion" ? B.green : m.tipo==="salida" ? B.red : B.gold;
                  const labelTipo = { ingreso:"Ingreso", salida:"Salida", ajuste:"Ajuste", devolucion:"Devolución" }[m.tipo]||m.tipo;
                  return (
                    <tr key={m.id} style={{ borderTop:`1px solid ${B.border}`, background:B.white }}>
                      <td style={{ padding:"9px 12px", fontSize:11, color:B.textMut }}>{fmt.fechaHora?fmt.fechaHora(m.created_at):fmt.fecha(m.created_at)}</td>
                      <td style={{ padding:"9px 12px", fontSize:11, color:B.textSec, fontFamily:"monospace" }}>{v?.sku||"—"}</td>
                      <td style={{ padding:"9px 12px" }}>
                        <span style={{ fontSize:10, padding:"3px 8px", borderRadius:10, fontWeight:700, background:`${colorTipo}18`, color:colorTipo }}>{labelTipo}</span>
                      </td>
                      <td style={{ padding:"9px 12px", fontSize:12, fontWeight:700, color:B.textPri }}>{m.cantidad}</td>
                      <td style={{ padding:"9px 12px", fontSize:12, color:B.textSec }}>{m.stock_resultante}</td>
                      <td style={{ padding:"9px 12px", fontSize:11, color:B.textSec }}>{m.motivo||"—"}</td>
                      <td style={{ padding:"9px 12px", fontSize:11, color:B.textMut }}>{m.referencia||"—"}</td>
                      <td style={{ padding:"9px 12px", fontSize:11, color:B.textMut }}>{m.usuario||"—"}</td>
                    </tr>
                  );
                })}
                {movimientos.length===0 && <tr><td colSpan={8} style={{ padding:30, textAlign:"center", color:B.textMut, fontSize:13 }}>Sin movimientos registrados</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab==="ordenes" && (
        <>
          <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:12 }}>
            <BtnPri onClick={()=>setModalOrden(true)}><Ico n="plus" size={15} sw={2.4}/> Nueva orden</BtnPri>
          </div>
          <div style={{ background:B.white, border:`1px solid ${B.border}`, borderRadius:12, overflow:"hidden" }}>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead><tr style={{ background:"#F6F9FC" }}>
                {["N° Orden","Canal","Cliente","Fecha","Estado","Acciones"].map(h=>(
                  <th key={h} style={{ padding:"9px 12px", textAlign:"left", fontSize:11, color:B.textSec, fontWeight:700, letterSpacing:"0.3px", whiteSpace:"nowrap" }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {ordenes.map((o,i)=>{
                  const ESTADOS_ORDEN = {
                    pendiente:{label:"Pendiente",bg:"#EFF6FF",color:"#1D4ED8"},
                    picking:{label:"Picking",bg:"#FFFBEB",color:"#B45309"},
                    packing:{label:"Packing",bg:"#F5F3FF",color:"#6D28D9"},
                    listo_despacho:{label:"Listo p/despacho",bg:"#FFF8EF",color:B.goldDk},
                    despachado:{label:"Despachado",bg:"#ECFDF5",color:B.green},
                    cancelado:{label:"Cancelado",bg:"#F3F4F6",color:B.textMut},
                  };
                  const est = ESTADOS_ORDEN[o.estado]||ESTADOS_ORDEN.pendiente;
                  return (
                    <tr key={o.id} style={{ borderTop:`1px solid ${B.border}`, background:B.white }}>
                      <td style={{ padding:"9px 12px", fontSize:12, fontWeight:700, color:B.navy }}>{o.numero_orden}</td>
                      <td style={{ padding:"9px 12px", fontSize:11, color:B.textSec }}>{o.canal||"—"}</td>
                      <td style={{ padding:"9px 12px", fontSize:12, color:B.textPri }}>{o.cliente_nombre}</td>
                      <td style={{ padding:"9px 12px", fontSize:11, color:B.textMut }}>{fmt.fecha(o.fecha_orden)}</td>
                      <td style={{ padding:"9px 12px" }}>
                        <span style={{ fontSize:10, padding:"3px 8px", borderRadius:10, fontWeight:700, background:est.bg, color:est.color }}>{est.label}</span>
                      </td>
                      <td style={{ padding:"9px 12px" }}>
                        <button onClick={()=>setOrdenDetalle(o)}
                          style={{ fontSize:11, color:B.blue, background:"none", border:"none", cursor:"pointer", fontWeight:700 }}>Ver / Gestionar</button>
                      </td>
                    </tr>
                  );
                })}
                {ordenes.length===0 && <tr><td colSpan={6} style={{ padding:30, textAlign:"center", color:B.textMut, fontSize:13 }}>Sin órdenes registradas</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}

      {modalProducto && (
        <ModalProductoInventario producto={editandoProducto}
          onClose={()=>setModalProducto(false)} onSaved={()=>{setModalProducto(false); cargar();}} toast={toast}/>
      )}
      {modalMovimiento && (
        <ModalMovimientoInventario variantes={variantesConProducto}
          onClose={()=>setModalMovimiento(false)} onSaved={()=>{setModalMovimiento(false); cargar();}} toast={toast}/>
      )}
      {modalOrden && (
        <ModalNuevaOrden variantes={variantesConProducto}
          onClose={()=>setModalOrden(false)} onSaved={()=>{setModalOrden(false); cargar();}} toast={toast}/>
      )}
      {modalCargaProductos && (
        <ModalCargaMasivaProductos productosExistentes={productos}
          onClose={()=>setModalCargaProductos(false)} onSaved={()=>{setModalCargaProductos(false); cargar();}} toast={toast}/>
      )}
      {ordenDetalle && (
        <ModalOrdenDetalle orden={ordenDetalle} items={itemsOrden.filter(it=>it.orden_id===ordenDetalle.id)}
          variantes={variantesConProducto}
          onClose={()=>setOrdenDetalle(null)} onCambio={()=>{cargar(); setOrdenDetalle(o=>ordenes.find(x=>x.id===o?.id)||o);}} toast={toast}/>
      )}
    </div>
  );
}

export const COLUMNAS_PLANTILLA_PRODUCTOS = [
  "Nombre del Producto", "Categoria", "Marca", "Precio de Venta", "Costo",
  "SKU", "Codigo de Barras", "Talla", "Color", "Atributo Extra",
  "Stock Inicial", "Stock Minimo", "Ubicacion",
];

export function mapearFilaProducto(fila) {
  const out = {};
  for (const key of Object.keys(fila)) {
    const k = normalizarTextoAdmin(key);
    const v = fila[key];
    if (k.includes("nombre")) out.nombre_producto = (v||"").toString().trim();
    else if (k.includes("categoria")) out.categoria = (v||"").toString().trim();
    else if (k.includes("marca")) out.marca = (v||"").toString().trim();
    else if (k.includes("precio")) out.precio_venta = parseFloat(v) || 0;
    else if (k.includes("costo")) out.costo = parseFloat(v) || 0;
    else if (k === "sku" || (k.includes("sku") && !k.includes("codigo"))) out.sku = (v||"").toString().trim();
    else if (k.includes("codigo") && k.includes("barra")) out.codigo_barras = (v||"").toString().trim();
    else if (k.includes("talla")) out.talla = (v||"").toString().trim();
    else if (k.includes("color")) out.color = (v||"").toString().trim();
    else if (k.includes("atributo")) out.atributo_extra = (v||"").toString().trim();
    else if (k.includes("stock") && k.includes("inicial")) out.stock_actual = parseInt(v) || 0;
    else if (k.includes("stock") && k.includes("minimo")) out.stock_minimo = parseInt(v) || 0;
    else if (k.includes("ubicacion")) out.ubicacion = (v||"").toString().trim();
  }
  return out;
}

export function validarFilaProducto(fila) {
  const errores = [];
  if (!fila.nombre_producto) errores.push("falta nombre del producto");
  if (!fila.sku) errores.push("falta SKU");
  return errores;
}

export async function generarPlantillaProductos() {
  await asegurarXLSX();
  const ejemplo = [
    "Polo Boaz", "Ropa", "Boaz Wear", "45.00", "22.00",
    "POLO-BOAZ-M-AZUL", "7750182001234", "M", "Azul", "",
    "20", "5", "Estante A-3",
  ];
  const ws = XLSX.utils.aoa_to_sheet([COLUMNAS_PLANTILLA_PRODUCTOS, ejemplo]);
  ws["!cols"] = COLUMNAS_PLANTILLA_PRODUCTOS.map(()=>({ wch:20 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Productos");
  XLSX.writeFile(wb, "plantilla_productos_boaz.xlsx");
}

export function ModalCargaMasivaProductos({ productosExistentes, onClose, onSaved, toast }) {
  const [archivo, setArchivo] = useState(null);
  const [filas, setFilas] = useState([]);
  const [procesando, setProcesando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const inputRef = useRef();

  const validas = filas.filter(f=>f.ok);
  const conError = filas.filter(f=>!f.ok);

  const manejarArchivo = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setArchivo(file);
    setResultado(null);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type:"binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const filasCrudas = XLSX.utils.sheet_to_json(ws, { defval:"" });
        const procesadas = filasCrudas.map((fila) => {
          const mapeada = mapearFilaProducto(fila);
          const errores = validarFilaProducto(mapeada);
          return { ...mapeada, ok: errores.length===0, errores };
        });
        setFilas(procesadas);
      } catch (err) {
        toast("No se pudo leer el archivo: "+err.message,"error");
      }
    };
    reader.readAsBinaryString(file);
  };

  const confirmarCarga = async () => {
    if (validas.length===0) return;
    setProcesando(true);
    const generados = [];
    // Cachea productos por nombre (normalizado) para no duplicar el producto
    // si ya existe o si varias filas del archivo son variantes del mismo.
    const cacheProductos = {};
    productosExistentes.forEach(p => { cacheProductos[normalizarTextoAdmin(p.nombre)] = p.id; });

    for (const fila of validas) {
      try {
        const claveProducto = normalizarTextoAdmin(fila.nombre_producto);
        let productoId = cacheProductos[claveProducto];
        if (!productoId) {
          const { data: nuevoProducto, error: errProd } = await sb.from("inv_productos").insert([{
            nombre: fila.nombre_producto, categoria: fila.categoria||null, marca: fila.marca||null,
            precio_venta: fila.precio_venta||0, costo: fila.costo||0, activo:true,
          }]).select().single();
          if (errProd) { generados.push({ ...fila, ok:false, error:"producto: "+errProd.message }); continue; }
          productoId = nuevoProducto.id;
          cacheProductos[claveProducto] = productoId;
        }
        const { error: errVar } = await sb.from("inv_variantes").insert([{
          producto_id: productoId, sku: fila.sku, codigo_barras: fila.codigo_barras||null,
          talla: fila.talla||null, color: fila.color||null, atributo_extra: fila.atributo_extra||null,
          stock_actual: fila.stock_actual||0, stock_minimo: fila.stock_minimo||0,
          ubicacion: fila.ubicacion||null, activo:true,
        }]);
        if (errVar) generados.push({ ...fila, ok:false, error: errVar.message.includes("duplicate")?"ese SKU ya existe":errVar.message });
        else generados.push({ ...fila, ok:true });
      } catch (err) {
        generados.push({ ...fila, ok:false, error: err.message||"error inesperado" });
      }
    }
    setProcesando(false);
    setResultado(generados);
  };

  if (resultado) {
    const exitosos = resultado.filter(r=>r.ok).length;
    const fallidos = resultado.filter(r=>!r.ok);
    return (
      <div style={{ position:"fixed", inset:0, background:"#0008", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
        <div style={{ background:B.white, borderRadius:16, padding:28, width:600, maxHeight:"85vh", overflowY:"auto", boxShadow:"0 20px 60px #0003" }}>
          <div style={{ fontSize:15, fontWeight:800, color:B.navy, marginBottom:16 }}>Resultado de la carga</div>
          <div style={{ background:"#ECFDF5", border:`1px solid ${B.green}`, borderRadius:10, padding:14, marginBottom:12, fontSize:13, color:"#065F46" }}>
            {exitosos} de {resultado.length} variantes cargadas correctamente
          </div>
          {fallidos.length>0 && (
            <div style={{ background:"#FEF2F2", border:`1px solid ${B.red}`, borderRadius:10, padding:14, marginBottom:16 }}>
              <div style={{ fontSize:12, fontWeight:700, color:"#991B1B", marginBottom:8 }}>{fallidos.length} con error:</div>
              {fallidos.map((f,i)=>(
                <div key={i} style={{ fontSize:11, color:"#991B1B", marginBottom:4 }}>
                  {f.sku||"(sin SKU)"} — {f.error || (f.errores||[]).join(", ")}
                </div>
              ))}
            </div>
          )}
          <div style={{ display:"flex", justifyContent:"flex-end" }}>
            <BtnPri onClick={onSaved}>Listo</BtnPri>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position:"fixed", inset:0, background:"#0008", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ background:B.white, borderRadius:16, padding:28, width:640, maxHeight:"85vh", overflowY:"auto", boxShadow:"0 20px 60px #0003" }}>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
          <div style={{ fontSize:15, fontWeight:800, color:B.navy }}>Carga masiva de productos</div>
          <button onClick={onClose} style={{ background:"none", border:"none", fontSize:18, color:B.textSec, cursor:"pointer" }}>✕</button>
        </div>
        <div style={{ fontSize:12, color:B.textMut, marginBottom:16 }}>
          Cada fila es una <strong>variante</strong> (un SKU). Si varias filas comparten el mismo "Nombre del Producto",
          se agrupan automáticamente bajo un solo producto — así puedes cargar varias tallas/colores de la misma prenda de una vez.
        </div>

        <button onClick={generarPlantillaProductos}
          style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 16px", borderRadius:10,
            border:`1px dashed ${B.gold}`, background:"#FFF8EF", color:B.goldDk, fontSize:13, fontWeight:700,
            cursor:"pointer", marginBottom:16 }}>
          Descargar plantilla Excel
        </button>

        <div onClick={()=>inputRef.current?.click()}
          style={{ border:`2px dashed ${B.border}`, borderRadius:12, padding:24, textAlign:"center",
            cursor:"pointer", marginBottom:16, background:B.bg }}>
          <div style={{ display:"flex", justifyContent:"center", marginBottom:8, color:B.textMut }}><Ico n="upload" size={26}/></div>
          <div style={{ fontSize:13, color:B.textSec }}>{archivo ? archivo.name : "Haz clic para elegir el archivo Excel completado"}</div>
          <input ref={inputRef} type="file" accept=".xlsx,.xls" style={{display:"none"}} onChange={manejarArchivo}/>
        </div>

        {filas.length>0 && (
          <>
            <div style={{ display:"flex", gap:10, marginBottom:12 }}>
              <div style={{ fontSize:12, color:B.green, fontWeight:700 }}>✓ {validas.length} listas</div>
              {conError.length>0 && <div style={{ fontSize:12, color:B.red, fontWeight:700 }}>{conError.length} con error</div>}
            </div>
            {conError.length>0 && (
              <div style={{ background:"#FEF2F2", borderRadius:8, padding:10, marginBottom:16, maxHeight:120, overflowY:"auto" }}>
                {conError.map((f,i)=>(
                  <div key={i} style={{ fontSize:11, color:"#991B1B" }}>Fila {i+1} ({f.sku||f.nombre_producto||"—"}): {f.errores.join(", ")}</div>
                ))}
              </div>
            )}
            <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
              <BtnSec onClick={onClose}>Cancelar</BtnSec>
              <BtnPri onClick={confirmarCarga} disabled={procesando || validas.length===0}>
                {procesando ? "Cargando..." : `Cargar ${validas.length} variante${validas.length===1?"":"s"}`}
              </BtnPri>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function ModalProductoInventario({ producto, onClose, onSaved, toast }) {
  const [f, setF] = useState(producto || { nombre:"", descripcion:"", categoria:"", marca:"", precio_venta:"", costo:"", activo:true });
  const [variantes, setVariantes] = useState([]);
  const [cargandoVar, setCargandoVar] = useState(!!producto);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!producto) { setVariantes([{ _nuevo:true, sku:"", codigo_barras:"", talla:"", color:"", atributo_extra:"", stock_actual:"0", stock_minimo:"0", ubicacion:"", activo:true }]); return; }
    sb.from("inv_variantes").select("*").eq("producto_id", producto.id).order("sku")
      .then(({data}) => { if(data) setVariantes(data); setCargandoVar(false); });
  }, [producto]);

  const agregarVariante = () => setVariantes(prev => [...prev, { _nuevo:true, sku:"", codigo_barras:"", talla:"", color:"", atributo_extra:"", stock_actual:"0", stock_minimo:"0", ubicacion:"", activo:true }]);
  const actualizarVariante = (i, campo, valor) => setVariantes(prev => prev.map((v,idx)=> idx===i ? {...v,[campo]:valor} : v));
  const quitarVariante = (i) => setVariantes(prev => prev.filter((_,idx)=>idx!==i));

  const guardar = async () => {
    if (!f.nombre) { toast("Completa el nombre del producto","error"); return; }
    const variantesValidas = variantes.filter(v=>v.sku);
    if (variantesValidas.length===0) { toast("Agrega al menos una variante con SKU","error"); return; }
    setGuardando(true);
    const payload = {
      nombre:f.nombre, descripcion:f.descripcion||null, categoria:f.categoria||null, marca:f.marca||null,
      precio_venta:parseFloat(f.precio_venta)||0, costo:parseFloat(f.costo)||0, activo:f.activo??true,
    };
    let error, productoId = producto?.id;
    if (producto) {
      ({ error } = await sb.from("inv_productos").update(payload).eq("id", producto.id));
    } else {
      const resultado = await sb.from("inv_productos").insert([payload]).select().single();
      error = resultado.error; productoId = resultado.data?.id;
    }
    if (error) { setGuardando(false); toast("Error: "+error.message,"error"); return; }

    for (const v of variantesValidas) {
      const payloadVar = {
        producto_id: productoId, sku:v.sku, codigo_barras:v.codigo_barras||null,
        talla:v.talla||null, color:v.color||null, atributo_extra:v.atributo_extra||null,
        stock_minimo:parseInt(v.stock_minimo)||0, ubicacion:v.ubicacion||null, activo:v.activo??true,
      };
      if (v._nuevo) {
        await sb.from("inv_variantes").insert([{ ...payloadVar, stock_actual:parseInt(v.stock_actual)||0 }]);
      } else {
        await sb.from("inv_variantes").update(payloadVar).eq("id", v.id);
      }
    }
    setGuardando(false);
    toast(producto?"Producto actualizado ✓":"Producto registrado ✓");
    onSaved();
  };

  const seccion = { fontSize:11, fontWeight:700, color:B.navy, textTransform:"uppercase",
    letterSpacing:"0.7px", margin:"18px 0 10px", paddingBottom:6, borderBottom:`1px solid ${B.border}` };

  return (
    <div style={{ position:"fixed", inset:0, background:"#0008", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ background:B.white, borderRadius:16, padding:28, width:680, maxHeight:"88vh", overflowY:"auto", boxShadow:"0 20px 60px #0003" }}>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
          <div style={{ fontSize:15, fontWeight:800, color:B.navy }}>{producto?"Editar producto":"Nuevo producto"}</div>
          <button onClick={onClose} style={{ background:"none", border:"none", fontSize:18, color:B.textSec, cursor:"pointer" }}>✕</button>
        </div>

        <div style={seccion}>Datos del producto</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          <div style={{ gridColumn:"span 2" }}><label style={lbl}>Nombre</label><input style={inp} value={f.nombre} onChange={e=>setF(p=>({...p,nombre:e.target.value}))}/></div>
          <div><label style={lbl}>Categoría</label><input style={inp} value={f.categoria||""} onChange={e=>setF(p=>({...p,categoria:e.target.value}))}/></div>
          <div><label style={lbl}>Marca</label><input style={inp} value={f.marca||""} onChange={e=>setF(p=>({...p,marca:e.target.value}))}/></div>
          <div><label style={lbl}>Precio de venta (S/)</label><input type="number" style={inp} value={f.precio_venta} onChange={e=>setF(p=>({...p,precio_venta:e.target.value}))}/></div>
          <div><label style={lbl}>Costo (S/)</label><input type="number" style={inp} value={f.costo} onChange={e=>setF(p=>({...p,costo:e.target.value}))}/></div>
          <div style={{ gridColumn:"span 2" }}><label style={lbl}>Descripción</label><input style={inp} value={f.descripcion||""} onChange={e=>setF(p=>({...p,descripcion:e.target.value}))}/></div>
        </div>

        <div style={{ ...seccion, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <span>Variantes (talla / color)</span>
          <button onClick={agregarVariante} style={{ fontSize:11, color:B.blue, background:"none", border:"none", cursor:"pointer", fontWeight:700, textTransform:"none", letterSpacing:0 }}>+ Agregar variante</button>
        </div>
        {cargandoVar ? (
          <Cargando filas={3}/>
        ) : (
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            {variantes.map((v,i)=>(
              <div key={v.id||`nuevo-${i}`} style={{ border:`1px solid ${B.border}`, borderRadius:10, padding:12, background:B.bg }}>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:8 }}>
                  <div><label style={{...lbl,marginBottom:2}}>SKU</label><input style={{...inp,padding:"7px 10px"}} value={v.sku} onChange={e=>actualizarVariante(i,"sku",e.target.value)}/></div>
                  <div><label style={{...lbl,marginBottom:2}}>Código de barras</label><input style={{...inp,padding:"7px 10px"}} value={v.codigo_barras||""} onChange={e=>actualizarVariante(i,"codigo_barras",e.target.value)}/></div>
                  <div><label style={{...lbl,marginBottom:2}}>Ubicación</label><input style={{...inp,padding:"7px 10px"}} value={v.ubicacion||""} onChange={e=>actualizarVariante(i,"ubicacion",e.target.value)}/></div>
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr auto", gap:8, alignItems:"end" }}>
                  <div><label style={{...lbl,marginBottom:2}}>Talla</label><input style={{...inp,padding:"7px 10px"}} value={v.talla||""} onChange={e=>actualizarVariante(i,"talla",e.target.value)}/></div>
                  <div><label style={{...lbl,marginBottom:2}}>Color</label><input style={{...inp,padding:"7px 10px"}} value={v.color||""} onChange={e=>actualizarVariante(i,"color",e.target.value)}/></div>
                  {v._nuevo && <div><label style={{...lbl,marginBottom:2}}>Stock inicial</label><input type="number" style={{...inp,padding:"7px 10px"}} value={v.stock_actual} onChange={e=>actualizarVariante(i,"stock_actual",e.target.value)}/></div>}
                  <div><label style={{...lbl,marginBottom:2}}>Stock mínimo</label><input type="number" style={{...inp,padding:"7px 10px"}} value={v.stock_minimo} onChange={e=>actualizarVariante(i,"stock_minimo",e.target.value)}/></div>
                  {!v._nuevo && <div><label style={{...lbl,marginBottom:2}}>Stock actual</label><div style={{ fontSize:13, fontWeight:700, color:B.navy, padding:"7px 0" }}>{v.stock_actual}</div></div>}
                  <div/>
                  <button onClick={()=>quitarVariante(i)} style={{ background:"none", border:"none", color:B.red, fontSize:16, cursor:"pointer" }}>✕</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {producto && (
          <label style={{ display:"flex", alignItems:"center", gap:8, margin:"16px 0", cursor:"pointer" }}>
            <input type="checkbox" checked={f.activo!==false} onChange={e=>setF(p=>({...p,activo:e.target.checked}))}/>
            <span style={{ fontSize:13 }}>Producto activo</span>
          </label>
        )}
        <div style={{ display:"flex", gap:10, justifyContent:"flex-end", marginTop:16 }}>
          <BtnSec onClick={onClose}>Cancelar</BtnSec>
          <BtnPri onClick={guardar} disabled={guardando}>{guardando?"Guardando...":producto?"Guardar cambios":"Registrar"}</BtnPri>
        </div>
      </div>
    </div>
  );
}

export function ModalMovimientoInventario({ variantes, onClose, onSaved, toast }) {
  const [varianteId, setVarianteId] = useState("");
  const [tipo, setTipo] = useState("ingreso");
  const [cantidad, setCantidad] = useState("");
  const [motivo, setMotivo] = useState("");
  const [referencia, setReferencia] = useState("");
  const [escaneando, setEscaneando] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const varianteSel = variantes.find(v=>v.id===varianteId);

  const detectarPorCodigo = (codigo) => {
    setEscaneando(false);
    const encontrada = variantes.find(v=>v.codigo_barras===codigo || v.sku===codigo);
    if (encontrada) { setVarianteId(encontrada.id); toast("Producto encontrado ✓"); }
    else toast("No se encontró ningún producto con ese código","error");
  };

  const guardar = async () => {
    if (!varianteId || !cantidad) { toast("Elige el producto e ingresa la cantidad","error"); return; }
    setGuardando(true);
    const cant = parseInt(cantidad)||0;
    const suma = tipo==="ingreso" || tipo==="devolucion";
    const nuevoStock = suma ? varianteSel.stock_actual + cant : varianteSel.stock_actual - cant;
    const { error: e1 } = await sb.from("inv_variantes").update({ stock_actual: nuevoStock }).eq("id", varianteId);
    const { error: e2 } = await sb.from("inv_movimientos").insert([{
      variante_id: varianteId, tipo, cantidad: cant, motivo: motivo||null,
      referencia: referencia||null, stock_resultante: nuevoStock,
    }]);
    setGuardando(false);
    if (e1 || e2) { toast("Error: "+(e1||e2).message,"error"); return; }
    toast("Movimiento registrado ✓");
    onSaved();
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"#0008", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ background:B.white, borderRadius:16, padding:28, width:480, boxShadow:"0 20px 60px #0003" }}>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:16 }}>
          <div style={{ fontSize:15, fontWeight:800, color:B.navy }}>Registrar movimiento</div>
          <button onClick={onClose} style={{ background:"none", border:"none", fontSize:18, color:B.textSec, cursor:"pointer" }}>✕</button>
        </div>

        <label style={lbl}>Producto</label>
        <div style={{ display:"flex", gap:8, marginBottom:12 }}>
          <select style={{ ...inp, flex:1 }} value={varianteId} onChange={e=>setVarianteId(e.target.value)}>
            <option value="">— Selecciona —</option>
            {variantes.map(v=>(
              <option key={v.id} value={v.id}>{v.producto?.nombre} — {v.sku} ({[v.talla,v.color].filter(Boolean).join("/")||"—"}) · stock: {v.stock_actual}</option>
            ))}
          </select>
          <button onClick={()=>setEscaneando(true)} style={{ padding:"0 14px", borderRadius:8, border:`1px solid ${B.border}`, background:B.bg, cursor:"pointer", fontSize:16 }} title="Escanear código" aria-label="Escanear código"><Ico n="camera" size={18}/></button>
        </div>

        <label style={lbl}>Tipo de movimiento</label>
        <select style={{ ...inp, marginBottom:12 }} value={tipo} onChange={e=>setTipo(e.target.value)}>
          <option value="ingreso">Ingreso (compra nueva)</option>
          <option value="salida">Salida manual</option>
          <option value="ajuste">Ajuste (corrección de inventario)</option>
          <option value="devolucion">Devolución de cliente</option>
        </select>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
          <div><label style={lbl}>Cantidad</label><input type="number" style={inp} value={cantidad} onChange={e=>setCantidad(e.target.value)}/></div>
          <div><label style={lbl}>Referencia (opcional)</label><input style={inp} value={referencia} onChange={e=>setReferencia(e.target.value)}/></div>
        </div>
        <label style={lbl}>Motivo (opcional)</label>
        <input style={{ ...inp, marginBottom:16 }} value={motivo} onChange={e=>setMotivo(e.target.value)}/>

        {varianteSel && cantidad && (
          <div style={{ background:B.bg, borderRadius:10, padding:12, marginBottom:16, fontSize:12, color:B.textSec }}>
            Stock actual: <strong>{varianteSel.stock_actual}</strong> → Stock resultante: <strong style={{color:B.gold}}>
              {(tipo==="ingreso"||tipo==="devolucion") ? varianteSel.stock_actual+(parseInt(cantidad)||0) : varianteSel.stock_actual-(parseInt(cantidad)||0)}
            </strong>
          </div>
        )}

        <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
          <BtnSec onClick={onClose}>Cancelar</BtnSec>
          <BtnPri onClick={guardar} disabled={guardando}>{guardando?"Guardando...":"Registrar"}</BtnPri>
        </div>
      </div>
      {escaneando && <EscanerCodigoBarras onDetectado={detectarPorCodigo} onCerrar={()=>setEscaneando(false)} toast={toast}/>}
    </div>
  );
}

export function ModalNuevaOrden({ variantes, onClose, onSaved, toast }) {
  const [f, setF] = useState({ numero_orden:"", canal:"Tienda propia", cliente_nombre:"", cliente_telefono:"", cliente_direccion:"", cliente_distrito:"", notas:"" });
  const [items, setItems] = useState([{ variante_id:"", cantidad_pedida:"1" }]);
  const [guardando, setGuardando] = useState(false);

  const agregarItem = () => setItems(prev => [...prev, { variante_id:"", cantidad_pedida:"1" }]);
  const actualizarItem = (i, campo, valor) => setItems(prev => prev.map((it,idx)=> idx===i ? {...it,[campo]:valor} : it));
  const quitarItem = (i) => setItems(prev => prev.filter((_,idx)=>idx!==i));

  const guardar = async () => {
    if (!f.numero_orden || !f.cliente_nombre) { toast("Completa el número de orden y el cliente","error"); return; }
    const itemsValidos = items.filter(it=>it.variante_id && it.cantidad_pedida);
    if (itemsValidos.length===0) { toast("Agrega al menos un producto","error"); return; }
    setGuardando(true);
    const { data, error } = await sb.from("inv_ordenes").insert([{
      numero_orden:f.numero_orden, canal:f.canal||null, cliente_nombre:f.cliente_nombre,
      cliente_telefono:f.cliente_telefono||null, cliente_direccion:f.cliente_direccion||null,
      cliente_distrito:f.cliente_distrito||null, notas:f.notas||null, estado:"pendiente",
    }]).select().single();
    if (error) { setGuardando(false); toast("Error: "+error.message,"error"); return; }

    for (const it of itemsValidos) {
      const v = variantes.find(x=>x.id===it.variante_id);
      await sb.from("inv_items_orden").insert([{
        orden_id: data.id, variante_id: it.variante_id,
        cantidad_pedida: parseInt(it.cantidad_pedida)||1,
        precio_unitario: parseFloat(v?.producto?.precio_venta)||0,
      }]);
    }
    setGuardando(false);
    toast("Orden registrada ✓");
    onSaved();
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"#0008", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ background:B.white, borderRadius:16, padding:28, width:600, maxHeight:"88vh", overflowY:"auto", boxShadow:"0 20px 60px #0003" }}>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:16 }}>
          <div style={{ fontSize:15, fontWeight:800, color:B.navy }}>Nueva orden</div>
          <button onClick={onClose} style={{ background:"none", border:"none", fontSize:18, color:B.textSec, cursor:"pointer" }}>✕</button>
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
          <div><label style={lbl}>N° de orden</label><input style={inp} value={f.numero_orden} onChange={e=>setF(p=>({...p,numero_orden:e.target.value}))}/></div>
          <div><label style={lbl}>Canal</label>
            <select style={inp} value={f.canal} onChange={e=>setF(p=>({...p,canal:e.target.value}))}>
              <option>Tienda propia</option><option>Shopify</option><option>MercadoLibre</option><option>Falabella</option><option>Otro</option>
            </select>
          </div>
          <div style={{ gridColumn:"span 2" }}><label style={lbl}>Cliente</label><input style={inp} value={f.cliente_nombre} onChange={e=>setF(p=>({...p,cliente_nombre:e.target.value}))}/></div>
          <div><label style={lbl}>Teléfono</label><input style={inp} value={f.cliente_telefono} onChange={e=>setF(p=>({...p,cliente_telefono:e.target.value}))}/></div>
          <div><label style={lbl}>Distrito</label><input style={inp} value={f.cliente_distrito} onChange={e=>setF(p=>({...p,cliente_distrito:e.target.value}))}/></div>
          <div style={{ gridColumn:"span 2" }}><label style={lbl}>Dirección</label><input style={inp} value={f.cliente_direccion} onChange={e=>setF(p=>({...p,cliente_direccion:e.target.value}))}/></div>
        </div>

        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", margin:"16px 0 10px" }}>
          <span style={{ fontSize:12, fontWeight:700, color:B.navy }}>Productos</span>
          <button onClick={agregarItem} style={{ fontSize:11, color:B.blue, background:"none", border:"none", cursor:"pointer", fontWeight:700 }}>+ Agregar producto</button>
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:16 }}>
          {items.map((it,i)=>(
            <div key={i} style={{ display:"flex", gap:8, alignItems:"end" }}>
              <div style={{ flex:3 }}>
                <label style={{...lbl,marginBottom:2}}>Producto</label>
                <select style={inp} value={it.variante_id} onChange={e=>actualizarItem(i,"variante_id",e.target.value)}>
                  <option value="">— Selecciona —</option>
                  {variantes.map(v=><option key={v.id} value={v.id}>{v.producto?.nombre} — {v.sku} (stock: {v.stock_actual})</option>)}
                </select>
              </div>
              <div style={{ flex:1 }}>
                <label style={{...lbl,marginBottom:2}}>Cantidad</label>
                <input type="number" style={inp} value={it.cantidad_pedida} onChange={e=>actualizarItem(i,"cantidad_pedida",e.target.value)}/>
              </div>
              <button onClick={()=>quitarItem(i)} style={{ background:"none", border:"none", color:B.red, fontSize:16, cursor:"pointer" }}>✕</button>
            </div>
          ))}
        </div>

        <label style={lbl}>Notas (opcional)</label>
        <input style={{ ...inp, marginBottom:20 }} value={f.notas} onChange={e=>setF(p=>({...p,notas:e.target.value}))}/>

        <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
          <BtnSec onClick={onClose}>Cancelar</BtnSec>
          <BtnPri onClick={guardar} disabled={guardando}>{guardando?"Guardando...":"Registrar orden"}</BtnPri>
        </div>
      </div>
    </div>
  );
}

export function ModalOrdenDetalle({ orden, items, variantes, onClose, onCambio, toast }) {
  const [pickeados, setPickeados] = useState(() => {
    const inicial = {};
    items.forEach(it => { inicial[it.id] = it.cantidad_pickeada || 0; });
    return inicial;
  });
  const [escaneando, setEscaneando] = useState(false);
  const [transportista, setTransportista] = useState(orden.transportista || "Boaz");
  const [tracking, setTracking] = useState(orden.tracking_transportista || "");
  const [procesando, setProcesando] = useState(false);

  const todoPickeado = items.every(it => (pickeados[it.id]||0) >= it.cantidad_pedida);

  const detectarPorCodigo = (codigo) => {
    setEscaneando(false);
    const item = items.find(it => {
      const v = variantes.find(x=>x.id===it.variante_id);
      return v && (v.codigo_barras===codigo || v.sku===codigo);
    });
    if (!item) { toast("Ese código no pertenece a ningún producto de esta orden","error"); return; }
    if ((pickeados[item.id]||0) >= item.cantidad_pedida) { toast("Ya se completó la cantidad de este producto","error"); return; }
    setPickeados(prev => ({ ...prev, [item.id]: (prev[item.id]||0)+1 }));
    toast("Producto escaneado ✓");
  };

  const confirmarPicking = async () => {
    setProcesando(true);
    for (const it of items) {
      await sb.from("inv_items_orden").update({ cantidad_pickeada: pickeados[it.id]||0 }).eq("id", it.id);
    }
    // Descuenta el stock de cada variante según lo pickeado
    for (const it of items) {
      const v = variantes.find(x=>x.id===it.variante_id);
      if (v) {
        const nuevoStock = v.stock_actual - (pickeados[it.id]||0);
        await sb.from("inv_variantes").update({ stock_actual: nuevoStock }).eq("id", v.id);
        await sb.from("inv_movimientos").insert([{
          variante_id: v.id, tipo:"salida", cantidad: pickeados[it.id]||0,
          motivo:"Picking de orden", referencia: orden.numero_orden, stock_resultante: nuevoStock,
        }]);
      }
    }
    await sb.from("inv_ordenes").update({ estado:"picking", fecha_picking: new Date().toISOString() }).eq("id", orden.id);
    setProcesando(false);
    toast("Picking confirmado ✓ — stock descontado");
    onCambio();
  };

  const confirmarPacking = async () => {
    setProcesando(true);
    await sb.from("inv_ordenes").update({ estado:"listo_despacho", fecha_packing: new Date().toISOString() }).eq("id", orden.id);
    setProcesando(false);
    toast("Empaque confirmado ✓");
    onCambio();
  };

  const confirmarDespacho = async () => {
    setProcesando(true);
    await sb.from("inv_ordenes").update({
      estado:"despachado", transportista, tracking_transportista: tracking||null,
      fecha_despacho: new Date().toISOString(),
    }).eq("id", orden.id);
    setProcesando(false);
    toast("¡Orden despachada! ✓");
    onCambio();
    onClose();
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"#0008", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ background:B.white, borderRadius:16, padding:28, width:560, maxHeight:"88vh", overflowY:"auto", boxShadow:"0 20px 60px #0003" }}>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
          <div style={{ fontSize:15, fontWeight:800, color:B.navy }}>Orden {orden.numero_orden}</div>
          <button onClick={onClose} style={{ background:"none", border:"none", fontSize:18, color:B.textSec, cursor:"pointer" }}>✕</button>
        </div>
        <div style={{ fontSize:12, color:B.textSec, marginBottom:16 }}>
          {orden.cliente_nombre} · {orden.canal||"—"} · {orden.cliente_distrito||""}
        </div>

        {/* Estado 1-2: Picking */}
        {(orden.estado==="pendiente") && (
          <>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
              <div style={{ fontSize:13, fontWeight:700, color:B.navy }}>Lista de picking</div>
              <button onClick={()=>setEscaneando(true)} style={{ padding:"6px 12px", borderRadius:8, border:`1px solid ${B.border}`, background:B.bg, cursor:"pointer", fontSize:13 }}>Escanear</button>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:16 }}>
              {items.map(it=>{
                const v = variantes.find(x=>x.id===it.variante_id);
                const listo = (pickeados[it.id]||0) >= it.cantidad_pedida;
                return (
                  <div key={it.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
                    padding:"10px 12px", background: listo?"#ECFDF5":B.bg, borderRadius:8, border:`1px solid ${listo?B.green:B.border}` }}>
                    <div>
                      <div style={{ fontSize:12, fontWeight:700, color:B.navy }}>{v?.producto?.nombre}</div>
                      <div style={{ fontSize:11, color:B.textMut }}>{v?.sku} · {[v?.talla,v?.color].filter(Boolean).join("/")} · Ubicación: {v?.ubicacion||"—"}</div>
                    </div>
                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                      <span style={{ fontSize:13, fontWeight:800, color: listo?B.green:B.textPri }}>{pickeados[it.id]||0} / {it.cantidad_pedida}</span>
                      <button onClick={()=>setPickeados(p=>({...p,[it.id]:Math.min(it.cantidad_pedida,(p[it.id]||0)+1)}))}
                        style={{ width:28, height:28, borderRadius:6, border:`1px solid ${B.border}`, background:B.white, cursor:"pointer" }}>+</button>
                      <button onClick={()=>setPickeados(p=>({...p,[it.id]:Math.max(0,(p[it.id]||0)-1)}))}
                        style={{ width:28, height:28, borderRadius:6, border:`1px solid ${B.border}`, background:B.white, cursor:"pointer" }}>-</button>
                    </div>
                  </div>
                );
              })}
            </div>
            <BtnPri onClick={confirmarPicking} disabled={!todoPickeado || procesando} style={{ width:"100%" }}>
              {procesando?"Procesando...":todoPickeado?"Confirmar picking completo":`Falta pickear ${items.reduce((s,it)=>s+Math.max(0,it.cantidad_pedida-(pickeados[it.id]||0)),0)} unidad(es)`}
            </BtnPri>
          </>
        )}

        {/* Estado: Packing */}
        {orden.estado==="picking" && (
          <>
            <div style={{ fontSize:13, fontWeight:700, color:B.navy, marginBottom:10 }}>Empaque</div>
            <div style={{ background:"#ECFDF5", border:`1px solid ${B.green}`, borderRadius:10, padding:14, marginBottom:16, fontSize:12, color:"#065F46" }}>
              ✓ Picking completado. Empaca los {items.length} producto{items.length===1?"":"s"} y confirma cuando esté listo.
            </div>
            <BtnPri onClick={confirmarPacking} disabled={procesando} style={{ width:"100%" }}>
              {procesando?"Procesando...":"Confirmar empaque"}
            </BtnPri>
          </>
        )}

        {/* Estado: Despacho */}
        {orden.estado==="listo_despacho" && (
          <>
            <div style={{ fontSize:13, fontWeight:700, color:B.navy, marginBottom:10 }}>Despacho</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:16 }}>
              <div><label style={lbl}>Transportista</label>
                <select style={inp} value={transportista} onChange={e=>setTransportista(e.target.value)}>
                  <option value="Boaz">Boaz (flota propia)</option>
                  <option value="Olva">Olva Courier</option>
                  <option value="Shalom">Shalom</option>
                  <option value="Otro">Otro</option>
                </select>
              </div>
              <div><label style={lbl}>N° de tracking</label><input style={inp} value={tracking} onChange={e=>setTracking(e.target.value)}/></div>
            </div>
            <BtnPri onClick={confirmarDespacho} disabled={procesando} style={{ width:"100%" }}>
              {procesando?"Procesando...":"Marcar como despachado"}
            </BtnPri>
          </>
        )}

        {orden.estado==="despachado" && (
          <div style={{ background:"#ECFDF5", border:`1px solid ${B.green}`, borderRadius:10, padding:16, textAlign:"center" }}>
            <div style={{ display:"flex", justifyContent:"center", marginBottom:6, color:"#047857" }}><Ico n="check" size={26}/></div>
            <div style={{ fontSize:13, fontWeight:700, color:"#065F46" }}>Orden despachada</div>
            <div style={{ fontSize:11, color:"#065F46", marginTop:4 }}>{orden.transportista} · {orden.tracking_transportista||"sin tracking"}</div>
          </div>
        )}

        <div style={{ display:"flex", justifyContent:"flex-end", marginTop:20 }}>
          <BtnSec onClick={onClose}>Cerrar</BtnSec>
        </div>
      </div>
      {escaneando && <EscanerCodigoBarras onDetectado={detectarPorCodigo} onCerrar={()=>setEscaneando(false)} toast={toast}/>}
    </div>
  );
}

