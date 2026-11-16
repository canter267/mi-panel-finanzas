import { cotizacionPara } from '../lib/cotizacion'
import { hoyISO, mesDe } from '../lib/fechas'
import { fechasPendientes, movimientoDeRecurrente } from '../lib/plan'
import { db } from './db'
import type { Movimiento } from './tipos'

let enCurso: Promise<Movimiento[]> | null = null

/**
 * Carga los gastos fijos que ya vencieron y todavía no se generaron. Se llama al abrir la app.
 * Devuelve los movimientos creados. Si se llama dos veces a la vez, la segunda espera a la primera (no duplica).
 */
export function generarRecurrentes(): Promise<Movimiento[]> {
  enCurso ??= generar().finally(() => {
    enCurso = null
  })
  return enCurso
}

async function generar(): Promise<Movimiento[]> {
  const hoy = hoyISO()
  const creados: Movimiento[] = []
  for (const rec of await db.recurrentes.toArray()) {
    for (const fecha of fechasPendientes(rec, hoy)) {
      const { cotizacion } = await cotizacionPara(fecha)
      // Sin ninguna cotización no se puede guardar el movimiento: queda pendiente para la próxima vez.
      if (!cotizacion) return creados
      const mov = movimientoDeRecurrente(rec, fecha, cotizacion.venta, cotizacion.casa, new Date().toISOString())
      await db.transaction('rw', db.movimientos, db.recurrentes, async () => {
        const id = await db.movimientos.add(mov)
        await db.recurrentes.update(rec.id!, { ultimo_mes_generado: mesDe(fecha) })
        creados.push({ ...mov, id })
      })
    }
  }
  return creados
}
