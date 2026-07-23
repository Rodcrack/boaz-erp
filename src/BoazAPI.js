// ══════════════════════════════════════════════════════════════
// BOAZ API — Capa de integración para clientes externos
// Conecta VTEX, Shopify, MercadoLibre y otros con el ERP Boaz
// ══════════════════════════════════════════════════════════════
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL  = "https://jeftkwjdqzkpswvaqspi.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImplZnRrd2pkcXprcHN3dmFxc3BpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4MzI0OTEsImV4cCI6MjEwMDQwODQ5MX0.Ta8Ei_wCm8ZEzD3IM-S60R0rJvI_d5BTvix_Z3W4EmY";
const sb = createClient(SUPABASE_URL, SUPABASE_ANON);

// ── TARIFARIO BOAZ ───────────────────────────────────────────
const TARIFAS = {
  urbano:      { XS:10, S:13, M:16 },
  semi_urbano: { XS:12, S:15, M:18 },
  periferico:  { XS:15, S:18, M:22 },
};

// ── ZONAS ───────────────────────────────────────────────────
const ZONAS = {
  urbano: ["lima","barranco","breña","chorrillos","el agustino","jesús maría","la victoria","lince","magdalena del mar","miraflores","pueblo libre","rímac","san borja","san isidro","san luis","san miguel","santiago de surco","surquillo"],
  semi_urbano: ["callao","bellavista","carmen de la legua reynoso","la perla","la punta","ate","independencia","la molina","los olivos","san juan de lurigancho","san juan de miraflores","san martín de porres","santa anita","villa el salvador","villa maría del triunfo"],
  periferico: ["comas","ventanilla","mi perú","ancón","carabayllo","chaclacayo","cieneguilla","lurigancho-chosica","lurín","pachacámac","puente piedra"],
};

// ── FUNCIONES PÚBLICAS DE LA API ──────────────────────────────

/**
 * Detecta el ámbito según el distrito
 */
export function detectarAmbito(distrito) {
  const d = distrito.toLowerCase().trim();
  if (ZONAS.urbano.some(z => d.includes(z))) return "urbano";
  if (ZONAS.semi_urbano.some(z => d.includes(z))) return "semi_urbano";
  if (ZONAS.periferico.some(z => d.includes(z))) return "periferico";
  return "semi_urbano"; // default
}

/**
 * Calcula tarifa según ámbito y peso
 */
export function calcularTarifa(ambito, pesoKg) {
  const t = TARIFAS[ambito] || TARIFAS.semi_urbano;
  const kg = parseFloat(pesoKg) || 0;
  if (kg <= 1) return { tarifa: t.XS, talla:"XS", ambito };
  if (kg <= 3) return { tarifa: t.S,  talla:"S",  ambito };
  return              { tarifa: t.M,  talla:"M",  ambito };
}

/**
 * CREAR PEDIDO DESDE PLATAFORMA EXTERNA
 * Compatible con: VTEX, Shopify, MercadoLibre, WooCommerce
 * 
 * @param {Object} datos - Datos del pedido
 * @param {string} datos.dest_nombre     - Nombre del destinatario
 * @param {string} datos.dest_telefono   - Teléfono del destinatario
 * @param {string} datos.dest_direccion  - Dirección de entrega
 * @param {string} datos.dest_distrito   - Distrito de entrega
 * @param {string} datos.dest_referencia - Referencia adicional (opcional)
 * @param {number} datos.peso_kg         - Peso en kg
 * @param {string} datos.descripcion     - Descripción del producto
 * @param {string} datos.empresa_id      - UUID de la empresa cliente en Boaz
 * @param {string} datos.ref_externa     - Número de orden de la plataforma (ej: #VTX-123)
 * @param {boolean} datos.cobro_destino  - Si se cobra en destino
 * @param {number} datos.monto_cobrar    - Monto a cobrar en destino
 * @returns {Object} { ok, bz, pedido, error }
 */
export async function crearPedido(datos) {
  try {
    const ambito = detectarAmbito(datos.dest_distrito || "");
    const { tarifa } = calcularTarifa(ambito, datos.peso_kg);

    const payload = {
      omd: "",  // se genera automáticamente como BZ-XXXX
      dest_nombre:     datos.dest_nombre,
      dest_telefono:   datos.dest_telefono,
      dest_direccion:  datos.dest_direccion,
      dest_distrito:   datos.dest_distrito,
      dest_referencia: datos.dest_referencia || "",
      peso_kg:         parseFloat(datos.peso_kg) || null,
      descripcion:     datos.descripcion || "",
      ambito,
      tarifa_s:        tarifa,
      empresa_id:      datos.empresa_id || null,
      cobro_destino:   datos.cobro_destino || false,
      monto_cobrar:    datos.cobro_destino ? parseFloat(datos.monto_cobrar) : null,
      estado:          "sin_asignar",
      fecha_programada: datos.fecha_programada || new Date().toISOString().split("T")[0],
    };

    const { data, error } = await sb.from("pedidos").insert([payload]).select().single();
    if (error) return { ok: false, error: error.message };

    return {
      ok: true,
      bz: data.omd,
      pedido: data,
      tracking_url: `https://boaz.com.pe/tracking?codigo=${data.omd}`,
      tarifa_s: tarifa,
      ambito,
    };
  } catch(err) {
    return { ok: false, error: err.message };
  }
}

/**
 * CONSULTAR ESTADO DE PEDIDO
 * @param {string} codigo - Código BZ (ej: "BZ-0042" o "0042")
 * @returns {Object} { ok, pedido, estado, error }
 */
export async function consultarPedido(codigo) {
  try {
    const bz = codigo.toUpperCase().startsWith("BZ-") ? codigo.toUpperCase() : `BZ-${codigo}`;
    const { data, error } = await sb.from("pedidos").select("*").eq("omd", bz).single();
    if (error || !data) return { ok: false, error: "Pedido no encontrado" };

    const estados = {
      sin_asignar: "Registrado en sistema",
      asignado:    "Asignado a repartidor",
      en_ruta:     "En camino al destinatario",
      entregado:   "Entregado exitosamente",
      devuelto:    "Devuelto — contactar a Boaz",
      incidencia:  "Incidencia reportada",
    };

    return {
      ok: true,
      bz: data.omd,
      estado: data.estado,
      estado_desc: estados[data.estado] || data.estado,
      dest_nombre: data.dest_nombre,
      dest_distrito: data.dest_distrito,
      fecha_creacion: data.created_at,
      fecha_entrega: data.fecha_entrega,
      foto_evidencia: data.foto_evidencia,
      tracking_url: `https://boaz.com.pe/tracking?codigo=${data.omd}`,
      pedido: data,
    };
  } catch(err) {
    return { ok: false, error: err.message };
  }
}

/**
 * COTIZAR ENVÍO SIN CREAR PEDIDO
 * @param {string} distrito - Distrito de destino
 * @param {number} pesoKg   - Peso en kg
 * @returns {Object} Cotización completa
 */
export function cotizarEnvio(distrito, pesoKg) {
  const ambito = detectarAmbito(distrito);
  const { tarifa, talla } = calcularTarifa(ambito, pesoKg);
  return {
    ok: true,
    distrito,
    ambito: ambito.replace("_"," "),
    talla,
    tarifa_sin_igv: tarifa,
    igv: parseFloat((tarifa * 0.18).toFixed(2)),
    tarifa_con_igv: parseFloat((tarifa * 1.18).toFixed(2)),
    moneda: "PEN",
    tiempo_estimado: "Same Day",
  };
}

/**
 * LISTAR PEDIDOS DE UNA EMPRESA
 * @param {string} empresa_id - UUID de la empresa en Boaz
 * @param {Object} opciones   - { estado, limite, desde }
 */
export async function listarPedidosEmpresa(empresa_id, opciones = {}) {
  try {
    let query = sb.from("pedidos").select("*").eq("empresa_id", empresa_id);
    if (opciones.estado) query = query.eq("estado", opciones.estado);
    query = query.order("created_at", { ascending: false });
    if (opciones.limite) query = query.limit(opciones.limite);
    const { data, error } = await query;
    if (error) return { ok: false, error: error.message };
    return { ok: true, pedidos: data, total: data.length };
  } catch(err) {
    return { ok: false, error: err.message };
  }
}

// ── ADAPTADORES POR PLATAFORMA ────────────────────────────────

/**
 * ADAPTADOR SHOPIFY
 * Convierte un pedido de Shopify al formato Boaz
 */
export function adaptarShopify(shopifyOrder) {
  const addr = shopifyOrder.shipping_address || {};
  return {
    dest_nombre:    `${addr.first_name || ""} ${addr.last_name || ""}`.trim(),
    dest_telefono:  addr.phone || shopifyOrder.phone || "",
    dest_direccion: `${addr.address1 || ""} ${addr.address2 || ""}`.trim(),
    dest_distrito:  addr.city || addr.province || "",
    dest_referencia:"",
    peso_kg:        shopifyOrder.total_weight ? shopifyOrder.total_weight/1000 : 0.5,
    descripcion:    `Shopify Order #${shopifyOrder.order_number}`,
    ref_externa:    `SHOPIFY-${shopifyOrder.id}`,
    cobro_destino:  false,
  };
}

/**
 * ADAPTADOR VTEX
 * Convierte un pedido de VTEX al formato Boaz
 */
export function adaptarVTEX(vtexOrder) {
  const addr = vtexOrder.shippingData?.address || {};
  const cliente = vtexOrder.clientProfileData || {};
  return {
    dest_nombre:    `${cliente.firstName || ""} ${cliente.lastName || ""}`.trim(),
    dest_telefono:  cliente.phone || "",
    dest_direccion: `${addr.street || ""} ${addr.number || ""} ${addr.complement || ""}`.trim(),
    dest_distrito:  addr.city || addr.neighborhood || "",
    dest_referencia: addr.reference || addr.complement || "",
    peso_kg:        vtexOrder.items?.reduce((a,i)=>a+(i.additionalInfo?.dimension?.weight||0),0)/1000 || 0.5,
    descripcion:    `VTEX Order ${vtexOrder.orderId}`,
    ref_externa:    `VTEX-${vtexOrder.orderId}`,
    cobro_destino:  false,
  };
}

/**
 * ADAPTADOR MERCADOLIBRE
 * Convierte un pedido de MercadoLibre al formato Boaz
 */
export function adaptarMercadoLibre(mlOrder) {
  const addr = mlOrder.shipping?.receiver_address || {};
  const buyer = mlOrder.buyer || {};
  return {
    dest_nombre:    buyer.nickname || `${buyer.first_name||""} ${buyer.last_name||""}`.trim(),
    dest_telefono:  addr.receiver_phone || buyer.phone?.number || "",
    dest_direccion: `${addr.street_name||""} ${addr.street_number||""}`.trim(),
    dest_distrito:  addr.city?.name || addr.neighborhood?.name || "",
    dest_referencia: addr.comment || "",
    peso_kg:        mlOrder.order_items?.[0]?.item?.shipping?.dimensions?.weight || 0.5,
    descripcion:    `MercadoLibre Order #${mlOrder.id}`,
    ref_externa:    `ML-${mlOrder.id}`,
    cobro_destino:  false,
  };
}

// ── EJEMPLO DE USO ────────────────────────────────────────────
/*
// Desde Shopify:
const shopifyData = adaptarShopify(shopifyOrder);
const resultado = await crearPedido({ ...shopifyData, empresa_id: "UUID_EMPRESA_EN_BOAZ" });
console.log(resultado.bz); // "BZ-0043"
console.log(resultado.tracking_url); // "https://boaz.com.pe/tracking?codigo=BZ-0043"

// Desde VTEX:
const vtexData = adaptarVTEX(vtexOrder);
const resultado = await crearPedido({ ...vtexData, empresa_id: "UUID_EMPRESA_EN_BOAZ" });

// Cotizar sin crear pedido:
const cotizacion = cotizarEnvio("Miraflores", 1.5);
// { ambito:"urbano", tarifa_sin_igv:13, tarifa_con_igv:15.34, ... }

// Consultar estado:
const estado = await consultarPedido("BZ-0042");
// { ok:true, estado:"en_ruta", estado_desc:"En camino al destinatario", ... }
*/

export default { crearPedido, consultarPedido, cotizarEnvio,
  listarPedidosEmpresa, adaptarShopify, adaptarVTEX,
  adaptarMercadoLibre, detectarAmbito, calcularTarifa };
