// Pruebas del cobro por unidad por día (Pre-facturación, Dashboard y Rentabilidad usan la misma regla)
import { describe, it, expect } from "vitest";
import { montoAsignacionPeriodo } from "../src/erp/operacion.jsx";
import { clienteCobraPorPedido } from "../src/erp/dashboard.jsx";
import { esFeriadoPeru, obtenerFeriadosPeru } from "../src/erp/ventas.jsx";

const asig = { id:"a1", empresa_id:"e1", tarifa_dia:250, fecha_inicio:"2026-11-01", fecha_fin:null };
const HOY = "2026-11-17";

describe("Unidad con calendario de servicio", () => {
  const cal = [
    { asignacion_id:"a1", fecha:"2026-11-03", prestado:true },
    { asignacion_id:"a1", fecha:"2026-11-04", prestado:true },
    { asignacion_id:"a1", fecha:"2026-11-05", prestado:false },
    { asignacion_id:"a1", fecha:"2026-10-30", prestado:true },
  ];
  it("cuenta solo los días marcados como prestados dentro del período", () => {
    const r = montoAsignacionPeriodo(asig, cal, "2026-11-01", "2026-11-15", 0, HOY);
    expect(r).toMatchObject({ dias:2, monto:500, conCalendario:true });
  });
  it("si el período no tiene días marcados, no se cobra nada (no se estima)", () => {
    const r = montoAsignacionPeriodo(asig, cal, "2026-11-10", "2026-11-15", 0, HOY);
    expect(r.dias).toBe(0); expect(r.monto).toBe(0);
  });
  it("aplica el recargo por feriado solo en los días feriados (Todos los Santos, 1 nov)", () => {
    const c = [{ asignacion_id:"a1", fecha:"2026-11-01", prestado:true }, { asignacion_id:"a1", fecha:"2026-11-02", prestado:true }];
    const r = montoAsignacionPeriodo(asig, c, "2026-11-01", "2026-11-30", 20, HOY);
    expect(r.monto).toBe(250*1.2 + 250);
  });
  it("la fecha del calendario puede venir con hora", () => {
    const c = [{ asignacion_id:"a1", fecha:"2026-11-03T00:00:00+00:00", prestado:true }];
    expect(montoAsignacionPeriodo(asig, c, "2026-11-01", "2026-11-30", 0, HOY).dias).toBe(1);
  });
});

describe("Unidad sin calendario (estimado por fechas)", () => {
  it("cuenta desde el inicio de la asignación hasta hoy si sigue abierta, nunca días futuros", () => {
    const r = montoAsignacionPeriodo(asig, [], "2026-11-01", "2026-11-30", 0, HOY);
    expect(r).toMatchObject({ dias:17, monto:17*250, conCalendario:false });
  });
  it("respeta la fecha de fin de la asignación", () => {
    const r = montoAsignacionPeriodo({ ...asig, fecha_fin:"2026-11-10" }, [], "2026-11-01", "2026-11-30", 0, HOY);
    expect(r.dias).toBe(10);
  });
  it("respeta el inicio de la asignación dentro del período", () => {
    const r = montoAsignacionPeriodo({ ...asig, fecha_inicio:"2026-11-12" }, [], "2026-11-01", "2026-11-30", 0, HOY);
    expect(r.dias).toBe(6);
  });
  it("una asignación terminada antes del período no suma", () => {
    const r = montoAsignacionPeriodo({ ...asig, fecha_fin:"2026-10-31" }, [], "2026-11-01", "2026-11-30", 0, HOY);
    expect(r.dias).toBe(0);
  });
  it("un período pasado completo cuenta todos sus días", () => {
    const r = montoAsignacionPeriodo({ ...asig, fecha_inicio:"2026-10-01" }, [], "2026-10-01", "2026-10-31", 0, HOY);
    expect(r.dias).toBe(31);
  });
  it("no aplica recargo por feriado (no se sabe qué días se trabajó)", () => {
    const r = montoAsignacionPeriodo(asig, [], "2026-11-01", "2026-11-01", 50, HOY);
    expect(r.monto).toBe(250);
  });
});

describe("¿Se le cobra por pedido a este cliente?", () => {
  const empresas = [{ id:"e1", modalidades_tarifa:["pedido","vehiculo"] }, { id:"e2", modalidades_tarifa:["vehiculo"] }, { id:"e3", modalidades_tarifa:[] }, { id:"e4" }];
  const asignaciones = [{ empresa_id:"e3" }];
  it("manda la modalidad marcada en el cliente", () => {
    expect(clienteCobraPorPedido("e1", empresas, asignaciones)).toBe(true);
    expect(clienteCobraPorPedido("e2", empresas, asignaciones)).toBe(false);
  });
  it("sin modalidades marcadas: si tiene unidades asignadas, se le cobra por unidad", () => {
    expect(clienteCobraPorPedido("e3", empresas, asignaciones)).toBe(false);
    expect(clienteCobraPorPedido("e4", empresas, asignaciones)).toBe(true);
  });
  it("un pedido sin cliente se cuenta por pedido", () => {
    expect(clienteCobraPorPedido(null, empresas, asignaciones)).toBe(true);
  });
});

describe("Feriados de Perú", () => {
  it("incluye Jueves y Viernes Santo calculados desde la Pascua", () => {
    const f2026 = obtenerFeriadosPeru(2026);
    expect(f2026.has("2026-04-02")).toBe(true);
    expect(f2026.has("2026-04-03")).toBe(true);
    expect(obtenerFeriadosPeru(2027).has("2027-03-26")).toBe(true);
  });
  it("reconoce feriados fijos y días comunes", () => {
    expect(esFeriadoPeru("2026-07-28")).toBe(true);
    expect(esFeriadoPeru("2026-12-25")).toBe(true);
    expect(esFeriadoPeru("2026-11-17")).toBe(false);
  });
});
