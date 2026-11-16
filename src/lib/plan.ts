import type { Alcancia, Cuenta, Moneda, Movimiento, Presupuesto, Recurrente } from '../db/tipos'
import { enAmbasMonedas, gastosPorCategoria, saldoDeCuenta } from './calculos'
import { convertir } from './dinero'
import { mesDe, sumarMeses } from './fechas'

// Lógica pura de la Fase 2: presupuestos, alcancías, "págate primero", cuotas y gastos fijos.

// ---------------------------------------------------------------- Presupuestos

/** Tope que rige para cada categoría en un mes: el más nuevo cargado hasta ese mes. Los de tope 0 no cuentan. */
export function presupuestosVigentes(todos: Presupuesto[], mes: string): Presupuesto[] {
  const porCategoria = new Map<number, Presupuesto>()
  for (const p of todos) {
    if (p.mes > mes) continue
    const actual = porCategoria.get(p.categoria_id)
    if (!actual || p.mes > actual.mes) porCategoria.set(p.categoria_id, p)
  }
  return [...porCategoria.values()].filter((p) => p.tope_centavos > 0)
}

export type NivelPresupuesto = 'ok' | 'aviso' | 'pasado'

/** Verde hasta el 80%, amarillo desde el 80%, rojo al llegar al 100%. */
export function nivelPresupuesto(gastado: number, tope: number): NivelPresupuesto {
  if (tope <= 0) return 'ok'
  // Con enteros, para no errarle por coma flotante justo en el borde.
  if (gastado >= tope) return 'pasado'
  if (gastado * 5 >= tope * 4) return 'aviso'
  return 'ok'
}

export interface EstadoPresupuesto {
  presupuesto: Presupuesto
  gastado: number
  nivel: NivelPresupuesto
}

/** Cuánto va gastado de cada presupuesto del mes, en la moneda del presupuesto. */
export function estadoPresupuestos(presupuestos: Presupuesto[], movs: Movimiento[], mes: string): EstadoPresupuesto[] {
  const gastos = gastosPorCategoria(movs, mes)
  return presupuestosVigentes(presupuestos, mes).map((p) => {
    const total = gastos.find((g) => g.categoria_id === p.categoria_id)?.total
    const gastado = total ? (p.moneda === 'ARS' ? total.ars : total.usd) : 0
    return { presupuesto: p, gastado, nivel: nivelPresupuesto(gastado, p.tope_centavos) }
  })
}

/** Si un gasto nuevo hizo cruzar el 80% o el 100%, devuelve el nivel al que se llegó; si no, null. */
export function alertaPorCruce(gastadoAntes: number, gastadoDespues: number, tope: number): 'aviso' | 'pasado' | null {
  const antes = nivelPresupuesto(gastadoAntes, tope)
  const despues = nivelPresupuesto(gastadoDespues, tope)
  if (despues === 'ok' || despues === antes) return null
  return despues
}

// ------------------------------------------------------------------- Alcancías

export interface ProgresoAlcancia {
  ahorrado: number
  falta: number
  /** 0 a 1 */
  parte: number
  /** Centavos de USD a separar por mes para llegar a la fecha. null si no hay fecha objetivo. */
  sugerenciaMensual: number | null
  /** Meses que quedan hasta la fecha objetivo (mínimo 1). null si no hay fecha. */
  mesesRestantes: number | null
}

export function mesesEntre(desdeMes: string, hastaMes: string): number {
  const [a1, m1] = desdeMes.split('-').map(Number)
  const [a2, m2] = hastaMes.split('-').map(Number)
  return (a2 - a1) * 12 + (m2 - m1)
}

/** El progreso sale de los movimientos: es el saldo (hasta hoy) de la cuenta de la alcancía. */
export function progresoAlcancia(alcancia: Alcancia, cuentas: Cuenta[], movs: Movimiento[], hoy: string): ProgresoAlcancia {
  const cuenta = cuentas.find((c) => c.id === alcancia.cuenta_id)
  const ahorrado = Math.max(0, cuenta ? saldoDeCuenta(cuenta, movs, hoy) : 0)
  const falta = Math.max(0, alcancia.meta_usd_centavos - ahorrado)
  const parte = alcancia.meta_usd_centavos > 0 ? Math.min(1, ahorrado / alcancia.meta_usd_centavos) : 0
  let mesesRestantes: number | null = null
  let sugerenciaMensual: number | null = null
  if (alcancia.fecha_objetivo) {
    mesesRestantes = Math.max(1, mesesEntre(mesDe(hoy), mesDe(alcancia.fecha_objetivo)))
    sugerenciaMensual = Math.ceil(falta / mesesRestantes)
  }
  return { ahorrado, falta, parte, sugerenciaMensual, mesesRestantes }
}

// ------------------------------------------------------------- Págate primero

type MovimientoNuevo = Omit<Movimiento, 'id'>

/**
 * Movimiento que separa el % de ahorro de un ingreso hacia la cuenta de una alcancía.
 * Ingreso en pesos -> compra de dólares; ingreso en dólares -> transferencia. null si no hay nada que separar.
 */
export function propuestaDeAhorro(
  ingreso: Pick<Movimiento, 'fecha' | 'monto_centavos' | 'moneda' | 'cuenta_id' | 'cotizacion' | 'casa_cotizacion'>,
  porcentaje: number,
  cuentaDestino: Cuenta,
  ahora: string,
): MovimientoNuevo | null {
  if (cuentaDestino.id == null || cuentaDestino.id === ingreso.cuenta_id) return null
  if (!(porcentaje > 0 && porcentaje <= 100)) return null
  const aparte = Math.round((ingreso.monto_centavos * porcentaje) / 100)
  const destino = convertir(aparte, ingreso.moneda, cuentaDestino.moneda, ingreso.cotizacion)
  if (aparte <= 0 || destino <= 0) return null
  return {
    fecha: ingreso.fecha,
    tipo: ingreso.moneda === 'ARS' && cuentaDestino.moneda === 'USD' ? 'compra_usd' : 'transferencia',
    monto_centavos: aparte,
    moneda: ingreso.moneda,
    cuenta_id: ingreso.cuenta_id,
    cuenta_destino_id: cuentaDestino.id,
    monto_destino_centavos: destino,
    nota: `Págate primero (${porcentaje}%)`,
    cotizacion: ingreso.cotizacion,
    casa_cotizacion: ingreso.casa_cotizacion,
    creado: ahora,
    editado: ahora,
  }
}

// ---------------------------------------------------------------------- Cuotas

const dos = (n: number) => String(n).padStart(2, '0')

/** Fecha con un día fijo dentro de un mes; si el mes no llega a ese día, el último (31 -> 28/29/30). */
export function fechaEnMes(mes: string, dia: number): string {
  const [a, m] = mes.split('-').map(Number)
  const ultimo = new Date(a, m, 0).getDate()
  return `${mes}-${dos(Math.min(Math.max(1, dia), ultimo))}`
}

/** Misma fecha N meses después, respetando el día cuando el mes lo permite. */
export function sumarMesesAFecha(fecha: string, n: number): string {
  return fechaEnMes(sumarMeses(mesDe(fecha), n), Number(fecha.slice(8, 10)))
}

/** Reparte un total en N cuotas enteras. Los centavos que sobran van a la primera: la suma siempre da el total. */
export function repartirEnCuotas(totalCentavos: number, n: number): number[] {
  if (!Number.isInteger(n) || n < 1) throw new Error('Cantidad de cuotas inválida')
  const base = Math.floor(totalCentavos / n)
  const cuotas = Array<number>(n).fill(base)
  cuotas[0] += totalCentavos - base * n
  return cuotas
}

/**
 * Regla 6: una compra en N cuotas son N gastos con el mismo compra_id, uno por mes.
 * `compra` trae el monto TOTAL; todas las cuotas guardan la cotización del día de la compra (regla 2).
 */
export function generarCuotas(compra: MovimientoNuevo, n: number, compraId: string): MovimientoNuevo[] {
  return repartirEnCuotas(compra.monto_centavos, n).map((monto, i) => ({
    ...compra,
    fecha: sumarMesesAFecha(compra.fecha, i),
    monto_centavos: monto,
    compra_id: compraId,
    cuota_n: i + 1,
    cuotas_total: n,
  }))
}

export const esCuota = (m: Movimiento) => m.compra_id != null && (m.cuotas_total ?? 1) > 1

// ---------------------------------------------------------------- Gastos fijos

/** Fechas que le falta generar a un gasto fijo: las de los meses posteriores al último generado que ya llegaron. */
export function fechasPendientes(rec: Recurrente, hoy: string): string[] {
  if (!rec.activo) return []
  const fechas: string[] = []
  // Tope de 24 meses por si la app estuvo mucho tiempo sin abrirse.
  for (let mes = sumarMeses(rec.ultimo_mes_generado, 1), i = 0; mes <= mesDe(hoy) && i < 24; mes = sumarMeses(mes, 1), i++) {
    const fecha = fechaEnMes(mes, rec.dia_del_mes)
    if (fecha <= hoy) fechas.push(fecha)
  }
  return fechas
}

/** Próxima fecha en la que se va a cargar solo. */
export function proximaFecha(rec: Pick<Recurrente, 'dia_del_mes' | 'ultimo_mes_generado'>, hoy: string): string {
  let mes = sumarMeses(rec.ultimo_mes_generado, 1)
  if (mes < mesDe(hoy)) mes = mesDe(hoy)
  const fecha = fechaEnMes(mes, rec.dia_del_mes)
  return fecha > hoy ? fecha : fechaEnMes(sumarMeses(mes, 1), rec.dia_del_mes)
}

/**
 * Al dar de alta un gasto fijo: si el día de este mes todavía no pasó, se genera este mes;
 * si ya pasó, arranca el mes que viene (no carga nada para atrás).
 */
export function ultimoMesInicial(diaDelMes: number, hoy: string): string {
  const mes = mesDe(hoy)
  return fechaEnMes(mes, diaDelMes) > hoy ? sumarMeses(mes, -1) : mes
}

export function movimientoDeRecurrente(
  rec: Recurrente,
  fecha: string,
  cotizacion: number,
  casa: Movimiento['casa_cotizacion'],
  ahora: string,
): MovimientoNuevo {
  return {
    ...rec.plantilla,
    tipo: 'gasto',
    fecha,
    cotizacion,
    casa_cotizacion: casa,
    recurrente_id: rec.id,
    creado: ahora,
    editado: ahora,
  }
}

/** Total mensual de los gastos fijos activos, en una moneda, a la cotización de hoy. */
export function totalMensualRecurrentes(recs: Recurrente[], moneda: Moneda, cotizacionHoy: number): number {
  return recs
    .filter((r) => r.activo)
    .reduce((s, r) => s + convertir(r.plantilla.monto_centavos, r.plantilla.moneda, moneda, cotizacionHoy), 0)
}

// --------------------------------------------------- Comprometido a futuro

export interface MesComprometido {
  mes: string
  /** Cuotas ya cargadas que caen en ese mes, en centavos de peso. */
  cuotas: number
  /** Gastos fijos activos, en centavos de peso a la cotización de hoy. */
  fijos: number
}

/** Cuánta plata ya está comprometida en cada uno de los próximos meses (arrancando en `desdeMes`). */
export function comprometidoPorMes(
  movs: Movimiento[],
  recs: Recurrente[],
  desdeMes: string,
  cantidad: number,
  cotizacionHoy: number,
): MesComprometido[] {
  const fijos = cotizacionHoy > 0 ? totalMensualRecurrentes(recs, 'ARS', cotizacionHoy) : 0
  return Array.from({ length: cantidad }, (_, i) => {
    const mes = sumarMeses(desdeMes, i)
    const cuotas = movs
      .filter((m) => m.tipo === 'gasto' && esCuota(m) && mesDe(m.fecha) === mes)
      .reduce((s, m) => s + enAmbasMonedas(m).ars, 0)
    return { mes, cuotas, fijos }
  })
}
