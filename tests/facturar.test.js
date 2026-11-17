// Pruebas de la facturación sin duplicar (pre-facturación → factura)
import { describe, it, expect } from "vitest";
import { rangosLibres, montoAsignacionPendiente, sumarDia } from "../src/erp/operacion.jsx";

describe("Tramos del período aún sin facturar", () => {
  it("sin nada facturado, el período completo está libre", () => {
    expect(rangosLibres("2026-11-01","2026-11-30",[])).toEqual([{ desde:"2026-11-01", hasta:"2026-11-30" }]);
  });
  it("si la primera quincena ya se facturó, queda libre la segunda", () => {
    expect(rangosLibres("2026-11-01","2026-11-30",[{ desde:"2026-11-01", hasta:"2026-11-15" }])).toEqual([{ desde:"2026-11-16", hasta:"2026-11-30" }]);
  });
  it("un tramo facturado al medio deja dos huecos", () => {
    expect(rangosLibres("2026-11-01","2026-11-30",[{ desde:"2026-11-10", hasta:"2026-11-20" }]))
      .toEqual([{ desde:"2026-11-01", hasta:"2026-11-09" }, { desde:"2026-11-21", hasta:"2026-11-30" }]);
  });
  it("tramos superpuestos o desordenados se combinan bien", () => {
    expect(rangosLibres("2026-11-01","2026-11-30",[{ desde:"2026-11-12", hasta:"2026-11-30" }, { desde:"2026-11-01", hasta:"2026-11-05" }, { desde:"2026-11-04", hasta:"2026-11-08" }]))
      .toEqual([{ desde:"2026-11-09", hasta:"2026-11-11" }]);
  });
  it("si todo ya se facturó, no queda nada", () => {
    expect(rangosLibres("2026-11-01","2026-11-30",[{ desde:"2026-10-20", hasta:"2026-12-05" }])).toEqual([]);
  });
  it("cruza fin de mes y año correctamente", () => {
    expect(sumarDia("2026-12-31",1)).toBe("2027-01-01"); expect(sumarDia("2026-03-01",-1)).toBe("2026-02-28");
  });
});

describe("Monto de unidad pendiente de facturar", () => {
  const a = { id:"a1", tarifa_dia:200, fecha_inicio:"2026-11-01", fecha_fin:null };
  it("sin calendario: descuenta los días ya facturados", () => {
    const r = montoAsignacionPendiente(a, [], "2026-11-01", "2026-11-17", 0, [{ asignacion_id:"a1", desde:"2026-11-01", hasta:"2026-11-10" }], "2026-11-17");
    expect(r).toMatchObject({ dias:7, monto:1400, diasYaFacturados:10 });
    expect(r.tramos).toEqual([expect.objectContaining({ desde:"2026-11-11", hasta:"2026-11-17", dias:7 })]);
  });
  it("con calendario: solo los días marcados fuera de lo facturado", () => {
    const cal = ["03","04","12","13"].map(d => ({ asignacion_id:"a1", fecha:"2026-11-"+d, prestado:true }));
    const r = montoAsignacionPendiente(a, cal, "2026-11-01", "2026-11-30", 0, [{ asignacion_id:"a1", desde:"2026-11-01", hasta:"2026-11-10" }], "2026-11-17");
    expect(r).toMatchObject({ dias:2, monto:400, diasYaFacturados:2, conCalendario:true });
  });
  it("ignora tramos facturados de otra unidad", () => {
    const r = montoAsignacionPendiente(a, [], "2026-11-01", "2026-11-10", 0, [{ asignacion_id:"otra", desde:"2026-11-01", hasta:"2026-11-10" }], "2026-11-17");
    expect(r.dias).toBe(10);
  });
});

import { siguienteNumero, descripcionFactura } from "../src/erp/ventas.jsx";
describe("Numeración y descripción de la factura", () => {
  it("sugiere el siguiente número respetando los ceros", () => {
    expect(siguienteNumero(["00000009","00000012","00000010"])).toBe("00000013");
    expect(siguienteNumero(["10","11"])).toBe("12");
    expect(siguienteNumero([])).toBe("1");
    expect(siguienteNumero(["abc","7"])).toBe("8");
  });
  it("arma una descripción legible del período", () => {
    const d = descripcionFactura({ desde:"2026-11-01", hasta:"2026-11-15", nPed:1250, nDiasUnid:12, nUnid:2, nServ:1 });
    expect(d).toContain("1,250 entregas"); expect(d).toContain("12 días de unidad (2 unidades)"); expect(d).toContain("1 servicio adicional");
  });
});
