import { db } from '../db/db'
import { CASAS, type Casa, type Cotizacion } from '../db/tipos'
import { hoyISO } from './fechas'

export const URL_DOLARAPI = 'https://dolarapi.com/v1/dolares'

const CLAVE_CASA = 'casa_cotizacion'

/** Casa elegida por el usuario para convertir. MEP ("bolsa") por defecto. */
export function casaPreferida(): Casa {
  const c = localStorage.getItem(CLAVE_CASA) as Casa | null
  return c && CASAS.includes(c) ? c : 'bolsa'
}
export function guardarCasaPreferida(casa: Casa) {
  localStorage.setItem(CLAVE_CASA, casa)
}

/** Se queda con las casas que usamos y descarta lo que venga roto. */
export function interpretarDolarApi(json: unknown, fecha: string): Cotizacion[] {
  if (!Array.isArray(json)) throw new Error('Respuesta inesperada de DolarApi')
  const r: Cotizacion[] = []
  for (const x of json) {
    if (!x || typeof x !== 'object') continue
    const { casa, compra, venta } = x as Record<string, unknown>
    if (!CASAS.includes(casa as Casa)) continue
    if (typeof venta !== 'number' || !(venta > 0)) continue
    r.push({ fecha, casa: casa as Casa, compra: typeof compra === 'number' ? compra : venta, venta })
  }
  if (r.length === 0) throw new Error('DolarApi no devolvió cotizaciones')
  return r
}

/** Baja las cotizaciones de hoy y las guarda (una por día y por casa). */
export async function actualizarCotizaciones(): Promise<Cotizacion[]> {
  const resp = await fetch(URL_DOLARAPI, { signal: AbortSignal.timeout(8000) })
  if (!resp.ok) throw new Error(`DolarApi respondió ${resp.status}`)
  const cotizaciones = interpretarDolarApi(await resp.json(), hoyISO())
  await db.cotizaciones.bulkPut(cotizaciones)
  return cotizaciones
}

/**
 * De las cotizaciones guardadas de una casa, elige la que corresponde a una fecha:
 * la de ese día; si no, la más reciente anterior; si no, la más vieja que haya.
 */
export function elegirCotizacion(guardadas: Cotizacion[], casa: Casa, fecha: string): Cotizacion | null {
  const deLaCasa = guardadas.filter((c) => c.casa === casa).sort((a, b) => a.fecha.localeCompare(b.fecha))
  if (deLaCasa.length === 0) return null
  const anteriores = deLaCasa.filter((c) => c.fecha <= fecha)
  return anteriores.length ? anteriores[anteriores.length - 1] : deLaCasa[0]
}

export interface ResultadoCotizacion {
  cotizacion: Cotizacion | null
  /** true si no es del día pedido (sin internet, o fecha sin dato guardado). */
  desactualizada: boolean
}

/**
 * Cotización a usar para una fecha. Si es hoy y todavía no la tenemos, la pide a DolarApi.
 * Si falla, cae en la última guardada. Si no hay ninguna devuelve null y la pantalla pide el valor a mano.
 */
export async function cotizacionPara(fecha: string, casa: Casa = casaPreferida()): Promise<ResultadoCotizacion> {
  const exacta = await db.cotizaciones.get([fecha, casa])
  if (exacta) return { cotizacion: exacta, desactualizada: false }
  if (fecha >= hoyISO()) {
    try {
      const nuevas = await actualizarCotizaciones()
      const c = nuevas.find((x) => x.casa === casa)
      if (c) return { cotizacion: c, desactualizada: c.fecha !== fecha }
    } catch {
      // Sin internet o API caída: seguimos con lo guardado.
    }
  }
  const guardadas = await db.cotizaciones.where('casa').equals(casa).toArray()
  return { cotizacion: elegirCotizacion(guardadas, casa, fecha), desactualizada: true }
}

/** Guarda una cotización cargada a mano como la de hoy para esa casa. */
export async function guardarCotizacionManual(casa: Casa, valor: number): Promise<void> {
  await db.cotizaciones.put({ fecha: hoyISO(), casa, compra: valor, venta: valor })
}
