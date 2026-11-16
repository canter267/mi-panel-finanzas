import type { Categoria, Cuenta, Grupo, Moneda, Movimiento } from '../db/tipos'
import { convertir } from './dinero'
import { mesDe } from './fechas'

/** Un mismo total expresado en las dos monedas, en centavos. */
export interface Doble {
  ars: number
  usd: number
}

const CERO: Doble = { ars: 0, usd: 0 }

/** Regla 3: cada movimiento se convierte con SU cotización, no con la de hoy. */
export function enAmbasMonedas(m: Pick<Movimiento, 'monto_centavos' | 'moneda' | 'cotizacion'>): Doble {
  return {
    ars: convertir(m.monto_centavos, m.moneda, 'ARS', m.cotizacion),
    usd: convertir(m.monto_centavos, m.moneda, 'USD', m.cotizacion),
  }
}

const sumar = (a: Doble, b: Doble): Doble => ({ ars: a.ars + b.ars, usd: a.usd + b.usd })

export function movimientosDelMes(movs: Movimiento[], mes: string): Movimiento[] {
  return movs.filter((m) => mesDe(m.fecha) === mes)
}

export interface TotalesMes {
  ingresos: Doble
  gastos: Doble
  /** ingresos − gastos */
  ahorro: Doble
}

/** Regla 4: solo cuentan gasto e ingreso; transferencias y compras de USD quedan afuera. */
export function totalesDelMes(movs: Movimiento[], mes: string): TotalesMes {
  let ingresos = CERO
  let gastos = CERO
  for (const m of movimientosDelMes(movs, mes)) {
    if (m.tipo === 'ingreso') ingresos = sumar(ingresos, enAmbasMonedas(m))
    else if (m.tipo === 'gasto') gastos = sumar(gastos, enAmbasMonedas(m))
  }
  return {
    ingresos,
    gastos,
    ahorro: { ars: ingresos.ars - gastos.ars, usd: ingresos.usd - gastos.usd },
  }
}

/** Regla 5: (ingresos − gastos) / ingresos. Sin ingresos no hay tasa: devuelve null. */
export function tasaDeAhorro(ingresos: number, gastos: number): number | null {
  if (ingresos <= 0) return null
  return (ingresos - gastos) / ingresos
}

export interface GastoCategoria {
  categoria_id: number | undefined
  total: Doble
}

/** Gastos del mes agrupados por categoría, de mayor a menor (en pesos). */
export function gastosPorCategoria(movs: Movimiento[], mes: string): GastoCategoria[] {
  const mapa = new Map<number | undefined, Doble>()
  for (const m of movimientosDelMes(movs, mes)) {
    if (m.tipo !== 'gasto') continue
    mapa.set(m.categoria_id, sumar(mapa.get(m.categoria_id) ?? CERO, enAmbasMonedas(m)))
  }
  return [...mapa.entries()]
    .map(([categoria_id, total]) => ({ categoria_id, total }))
    .sort((a, b) => b.total.ars - a.total.ars)
}

/** Gastos del mes por grupo (necesidad / gusto / ahorro), para comparar con el 50/30/20. */
export function gastosPorGrupo(movs: Movimiento[], mes: string, categorias: Categoria[]): Record<Grupo, Doble> {
  const grupoDe = new Map(categorias.map((c) => [c.id, c.grupo]))
  const r: Record<Grupo, Doble> = { necesidad: CERO, gusto: CERO, ahorro: CERO }
  for (const g of gastosPorCategoria(movs, mes)) {
    const grupo = grupoDe.get(g.categoria_id) ?? 'necesidad'
    r[grupo] = sumar(r[grupo], g.total)
  }
  return r
}

/**
 * Saldo actual de una cuenta, en centavos de su moneda:
 * saldo inicial + ingresos − gastos − lo que salió por transferencias/compras + lo que entró.
 */
export function saldoDeCuenta(cuenta: Cuenta, movs: Movimiento[]): number {
  let saldo = cuenta.saldo_inicial
  for (const m of movs) {
    if (m.cuenta_id === cuenta.id) {
      saldo += m.tipo === 'ingreso' ? m.monto_centavos : -m.monto_centavos
    }
    if ((m.tipo === 'transferencia' || m.tipo === 'compra_usd') && m.cuenta_destino_id === cuenta.id) {
      saldo += m.monto_destino_centavos ?? 0
    }
  }
  return saldo
}

/** Suma de saldos de las cuentas (no archivadas) de una moneda. */
export function saldoTotal(cuentas: Cuenta[], movs: Movimiento[], moneda: Moneda): number {
  return cuentas
    .filter((c) => c.moneda === moneda && !c.archivada)
    .reduce((s, c) => s + saldoDeCuenta(c, movs), 0)
}

/** Variación porcentual contra el mes anterior; null si no hay base para comparar. */
export function variacion(actual: number, anterior: number): number | null {
  if (anterior === 0) return null
  return (actual - anterior) / Math.abs(anterior)
}
