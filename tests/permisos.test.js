// Pruebas de los permisos por defecto de cada rol
import { describe, it, expect } from "vitest";
import { ROLES_ACCESO } from "../src/erp/base.jsx";

describe("Permisos por rol", () => {
  const roles = Object.keys(ROLES_ACCESO);
  it("todos los roles ven el Dashboard y Primeros pasos", () => {
    for (const r of roles) { expect(ROLES_ACCESO[r]).toContain("dashboard"); expect(ROLES_ACCESO[r]).toContain("ayuda"); }
  });
  it("el administrador tiene todo lo que tienen los demás roles", () => {
    for (const r of roles) for (const m of ROLES_ACCESO[r]) expect(ROLES_ACCESO.admin).toContain(m);
  });
  it("solo el administrador gestiona usuarios y datos de la empresa", () => {
    for (const r of roles.filter(x=>x!=="admin")) { expect(ROLES_ACCESO[r]).not.toContain("usuarios"); expect(ROLES_ACCESO[r]).not.toContain("configuracion"); }
  });
  it("operaciones no ve dinero de la empresa", () => {
    for (const m of ["facturacion","cobranza","planilla","gastos","rentabilidad","liquidaciones"]) expect(ROLES_ACCESO.operaciones).not.toContain(m);
  });
  it("finanzas no administra la operación diaria", () => {
    for (const m of ["pedidos","repartidores","unidades","inventario"]) expect(ROLES_ACCESO.finanzas).not.toContain(m);
  });
  it("no hay módulos repetidos", () => {
    for (const r of roles) expect(new Set(ROLES_ACCESO[r]).size).toBe(ROLES_ACCESO[r].length);
  });
});
