// Pruebas del cálculo de tarifa de un pedido (lo que se le cobra al cliente por cada entrega)
import { describe, it, expect, beforeEach } from "vitest";
import { getTarifaSameDay, obtenerTarifaEmpresa, obtenerTarifaEstandar, calcularTarifaPedido, setTarifasDistritoGlobal, ambitoDeDistrito, normDist } from "../src/erp/base.jsx";

const estandar = [
  { ambito:"urbano", tipo_servicio:null, activo:true, tarifa_xs:10, tarifa_s:13, tarifa_m:16, extra_kg:1 },
  { ambito:"periferico", tipo_servicio:null, activo:true, tarifa_xs:15, tarifa_s:18, tarifa_m:22, extra_kg:1 },
];
const delCliente = [
  { empresa_id:"e1", ambito:"urbano", tipo_servicio:null, activo:true, tarifa_xs:8, tarifa_s:11, tarifa_m:14, extra_kg:2 },
  { empresa_id:"e1", ambito:"urbano", tipo_servicio:"next_day", activo:true, tarifa_xs:7, tarifa_s:9, tarifa_m:12, extra_kg:2 },
  { empresa_id:"e1", ambito:"periferico", tipo_servicio:null, activo:false, tarifa_xs:99, tarifa_s:99, tarifa_m:99 },
];

describe("Bandas de peso (getTarifaSameDay)", () => {
  const t = { tarifa_xs:10, tarifa_s:13, tarifa_m:16, extra_kg:1 };
  it("hasta 1 kg es XS, hasta 3 kg es S, hasta 7 kg es M", () => {
    expect(getTarifaSameDay("urbano", 0.5, t)).toBe(10);
    expect(getTarifaSameDay("urbano", 1, t)).toBe(10);
    expect(getTarifaSameDay("urbano", 1.1, t)).toBe(13);
    expect(getTarifaSameDay("urbano", 3, t)).toBe(13);
    expect(getTarifaSameDay("urbano", 7, t)).toBe(16);
  });
  it("sobre 7 kg suma el extra por cada kilo o fracción", () => {
    expect(getTarifaSameDay("urbano", 8, t)).toBe(17);
    expect(getTarifaSameDay("urbano", 9.2, t)).toBe(19);
    expect(getTarifaSameDay("urbano", 9, { ...t, extra_kg:2.5 })).toBe(21);
  });
  it("sin peso se cobra como XS", () => {
    expect(getTarifaSameDay("urbano", undefined, t)).toBe(10);
    expect(getTarifaSameDay("urbano", NaN, t)).toBe(10);
  });
});

describe("Qué tarifario se usa", () => {
  it("la tarifa del cliente para el servicio exacto gana a la genérica del cliente", () => {
    expect(obtenerTarifaEmpresa("e1", "urbano", "next_day", delCliente).tarifa_xs).toBe(7);
    expect(obtenerTarifaEmpresa("e1", "urbano", "same_day", delCliente).tarifa_xs).toBe(8);
  });
  it("las tarifas inactivas se ignoran", () => {
    expect(obtenerTarifaEmpresa("e1", "periferico", "same_day", delCliente)).toBeNull();
  });
  it("sin cliente no hay tarifa de cliente", () => {
    expect(obtenerTarifaEmpresa(null, "urbano", "same_day", delCliente)).toBeNull();
  });
  it("el estándar responde por ámbito", () => {
    expect(obtenerTarifaEstandar("periferico", "same_day", estandar).tarifa_xs).toBe(15);
  });
});

describe("Tarifa final de un pedido (calcularTarifaPedido)", () => {
  beforeEach(() => setTarifasDistritoGlobal([
    { empresa_id:"e3", distrito:"Miraflores", tarifa:8, activo:true },
    { empresa_id:"e3", distrito:"San Juan de Lurigancho", tarifa:11.5, activo:true },
    { empresa_id:"e3", distrito:"Surco", tarifa:99, activo:false },
  ]));
  const fijo = { id:"e2", modo_pedido:"fijo", precio_fijo_pedido:4, recargo_embalaje:5 };
  const porDistrito = { id:"e3", modo_pedido:"distrito" };
  const conTarifario = { id:"e1", modo_pedido:"tarifario" };

  it("sin cliente usa el tarifario estándar", () => {
    const r = calcularTarifaPedido({ empresa:null, ambito:"urbano", tipoServicio:"same_day", pesoKg:2 }, [], estandar);
    expect(r.tarifa).toBe(13); expect(r.origen).toMatch(/estándar/);
  });
  it("precio fijo por pedido ignora peso y distrito (Logispro)", () => {
    const r = calcularTarifaPedido({ empresa:fijo, ambito:"periferico", pesoKg:25, distrito:"Comas" }, [], estandar);
    expect(r.tarifa).toBe(4);
  });
  it("el recargo por embalaje se suma solo si el pedido lo requiere", () => {
    expect(calcularTarifaPedido({ empresa:fijo, embalaje:true }, [], estandar).tarifa).toBe(9);
    expect(calcularTarifaPedido({ empresa:fijo, embalaje:false }, [], estandar).tarifa).toBe(4);
  });
  it("tarifa por distrito sin importar tildes ni mayúsculas (Intelogis)", () => {
    expect(calcularTarifaPedido({ empresa:porDistrito, distrito:"MIRAFLORES" }, [], estandar).tarifa).toBe(8);
    expect(calcularTarifaPedido({ empresa:porDistrito, distrito:"san juan de  lurigancho" }, [], estandar).tarifa).toBe(11.5);
  });
  it("distrito sin tarifa propia cae al tarifario y avisa", () => {
    const r = calcularTarifaPedido({ empresa:porDistrito, distrito:"Barranco", pesoKg:1 }, [], estandar);
    expect(r.tarifa).toBe(10); expect(r.aviso).toBeTruthy();
  });
  it("una tarifa de distrito inactiva no se usa", () => {
    const r = calcularTarifaPedido({ empresa:porDistrito, distrito:"Surco", ambito:"urbano", pesoKg:1 }, [], estandar);
    expect(r.tarifa).toBe(10);
  });
  it("el tarifario del cliente gana al estándar", () => {
    const r = calcularTarifaPedido({ empresa:conTarifario, ambito:"urbano", tipoServicio:"same_day", pesoKg:2 }, delCliente, estandar);
    expect(r.tarifa).toBe(11); expect(r.origen).toMatch(/cliente/);
  });
  it("si no se indica ámbito, se deduce del distrito", () => {
    expect(ambitoDeDistrito("Comas")).toBe("periferico");
    expect(ambitoDeDistrito("lince")).toBe("urbano");
    const r = calcularTarifaPedido({ empresa:null, distrito:"Comas", pesoKg:1 }, [], estandar);
    expect(r.ambito).toBe("periferico"); expect(r.tarifa).toBe(15);
  });
  it("el resultado se redondea a céntimos", () => {
    const r = calcularTarifaPedido({ empresa:{ id:"x", modo_pedido:"fijo", precio_fijo_pedido:3.333, recargo_embalaje:1.111 }, embalaje:true }, [], estandar);
    expect(r.tarifa).toBe(4.44);
  });
  it("normDist compara nombres de distrito de forma tolerante", () => {
    expect(normDist("  Jesús   María ")).toBe("jesus maria");
  });
});
