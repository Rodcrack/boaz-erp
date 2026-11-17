// Pruebas de formatos de moneda y fecha, planilla y traducción de errores
import { describe, it, expect } from "vitest";
import { fmt, traducirError } from "../src/erp/base.jsx";
import { calcularNetoPlanilla, bandaDePeso } from "../src/erp/ventas.jsx";

describe("Formatos", () => {
  it("moneda con separador de miles y dos decimales", () => {
    expect(fmt.sol(1770)).toBe("S/ 1,770.00");
    expect(fmt.sol("12.5")).toBe("S/ 12.50");
    expect(fmt.sol(0)).toBe("S/ 0.00");
    expect(fmt.sol(null)).toBe("—");
  });
  it("una fecha sin hora no se corre un día (Perú es UTC-5)", () => {
    expect(fmt.fecha("2026-11-01")).toBe("01/11/2026");
    expect(fmt.fecha(null)).toBe("—");
  });
  it("banda de peso para etiquetas", () => {
    expect(bandaDePeso(0.8)).toBe("XS"); expect(bandaDePeso(2)).toBe("S"); expect(bandaDePeso(6)).toBe("M");
  });
});

describe("Planilla", () => {
  it("ONP descuenta 13% y calcula EsSalud 9% como costo de la empresa", () => {
    const r = calcularNetoPlanilla(1500, "onp");
    expect(r.descuentoPension).toBeCloseTo(195); expect(r.neto).toBeCloseTo(1305); expect(r.essalud).toBeCloseTo(135);
  });
  it("AFP usa el porcentaje indicado", () => {
    expect(calcularNetoPlanilla(2000, "afp", 12.5).neto).toBeCloseTo(1750);
  });
});

describe("Errores en lenguaje humano", () => {
  const t = (m) => traducirError(m).texto;
  it("permisos", () => {
    expect(t("Error: permission denied for table facturas")).toMatch(/No tienes permiso para modificar facturas/);
    expect(t("Error: permission denied for sequence empresas_codigo_seq")).toMatch(/fix_secuencias_boaz\.sql/);
  });
  it("falta de tablas o campos remite al SQL pendiente", () => {
    expect(t("Error: Could not find the table 'public.servicios_cliente' in the schema cache")).toMatch(/viajes y servicios/);
    expect(t("Error: column empresas.modo_pedido does not exist")).toMatch(/forma de cobro por pedido/);
  });
  it("duplicados con el nombre del campo y concordancia", () => {
    expect(t('Error: duplicate key value violates unique constraint "empresas_ruc_key"')).toMatch(/ese mismo RUC/);
    expect(t('Error: duplicate key value violates unique constraint "unidades_transporte_placa_key"')).toMatch(/esa misma placa/);
  });
  it("registros vinculados al eliminar", () => {
    expect(t('No se pudo eliminar: update or delete on table "empresas" violates foreign key constraint "x" on table "pedidos"')).toMatch(/^No se puede eliminar porque tiene pedidos vinculados/);
  });
  it("conexión y sesión", () => {
    expect(t("Error: Failed to fetch")).toMatch(/conexión/);
    expect(t("Error al guardar: JWT expired")).toMatch(/sesión expiró/);
  });
  it("un mensaje ya en español no se toca y no trae detalle técnico", () => {
    const r = traducirError("Completa nombre y dirección");
    expect(r.texto).toBe("Completa nombre y dirección"); expect(r.tecnico).toBeNull();
  });
});
