import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import type { Alcancia, Categoria, Cotizacion, Cuenta, Movimiento, Presupuesto, Recurrente } from '../db/tipos'
import { casaPreferida, elegirCotizacion } from '../lib/cotizacion'
import { hoyISO } from '../lib/fechas'

// Consultas "vivas": cuando cambia la base, las pantallas se vuelven a dibujar solas.

export function useCuentas(): Cuenta[] {
  return useLiveQuery(() => db.cuentas.orderBy('orden').toArray(), [], [] as Cuenta[])
}

export function useCategorias(): Categoria[] {
  return useLiveQuery(() => db.categorias.toArray(), [], [] as Categoria[])
}

export function usePresupuestos(): Presupuesto[] {
  return useLiveQuery(() => db.presupuestos.toArray(), [], [] as Presupuesto[])
}

export function useAlcancias(): Alcancia[] {
  return useLiveQuery(() => db.alcancias.toArray(), [], [] as Alcancia[])
}

export function useRecurrentes(): Recurrente[] {
  return useLiveQuery(() => db.recurrentes.toArray(), [], [] as Recurrente[])
}

/** Cotización de venta de hoy (o la última guardada) para la casa elegida. null si no hay ninguna. */
export function useCotizacionHoy(): number | null {
  const todas = useLiveQuery(() => db.cotizaciones.toArray(), [], [] as Cotizacion[])
  return elegirCotizacion(todas, casaPreferida(), hoyISO())?.venta ?? null
}

/** Todos los movimientos. undefined mientras carga. */
export function useMovimientos(): Movimiento[] | undefined {
  return useLiveQuery(() => db.movimientos.toArray(), [])
}
