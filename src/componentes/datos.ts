import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import type { Categoria, Cuenta, Movimiento } from '../db/tipos'

// Consultas "vivas": cuando cambia la base, las pantallas se vuelven a dibujar solas.

export function useCuentas(): Cuenta[] {
  return useLiveQuery(() => db.cuentas.orderBy('orden').toArray(), [], [] as Cuenta[])
}

export function useCategorias(): Categoria[] {
  return useLiveQuery(() => db.categorias.toArray(), [], [] as Categoria[])
}

/** Todos los movimientos. undefined mientras carga. */
export function useMovimientos(): Movimiento[] | undefined {
  return useLiveQuery(() => db.movimientos.toArray(), [])
}
