import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../db/db'
import type { Cotizacion } from '../db/tipos'
import { cotizacionPara, elegirCotizacion, interpretarDolarApi } from './cotizacion'
import { hoyISO } from './fechas'

const RESPUESTA = [
  { moneda: 'USD', casa: 'oficial', nombre: 'Oficial', compra: 1400, venta: 1450, fechaActualizacion: '2026-11-16T15:00:00.000Z' },
  { moneda: 'USD', casa: 'blue', nombre: 'Blue', compra: 1480, venta: 1500, fechaActualizacion: '2026-11-16T15:00:00.000Z' },
  { moneda: 'USD', casa: 'bolsa', nombre: 'Bolsa', compra: 1490.5, venta: 1495.3, fechaActualizacion: '2026-11-16T15:00:00.000Z' },
  { moneda: 'USD', casa: 'contadoconliqui', nombre: 'CCL', compra: 1500, venta: 1510, fechaActualizacion: '2026-11-16T15:00:00.000Z' },
  { moneda: 'USD', casa: 'tarjeta', nombre: 'Tarjeta', compra: 1820, venta: 1885, fechaActualizacion: '2026-11-16T15:00:00.000Z' },
]

describe('interpretarDolarApi', () => {
  it('se queda con oficial, blue, bolsa (MEP) y tarjeta', () => {
    const r = interpretarDolarApi(RESPUESTA, '2026-11-16')
    expect(r.map((c) => c.casa).sort()).toEqual(['blue', 'bolsa', 'oficial', 'tarjeta'])
    expect(r.find((c) => c.casa === 'bolsa')).toEqual({ fecha: '2026-11-16', casa: 'bolsa', compra: 1490.5, venta: 1495.3 })
  })
  it('falla si la respuesta no sirve', () => {
    expect(() => interpretarDolarApi({ error: 'x' }, '2026-11-16')).toThrow()
    expect(() => interpretarDolarApi([{ casa: 'bolsa', venta: null }], '2026-11-16')).toThrow()
  })
})

describe('elegirCotizacion', () => {
  const g: Cotizacion[] = [
    { fecha: '2026-11-10', casa: 'bolsa', compra: 1, venta: 1400 },
    { fecha: '2026-11-14', casa: 'bolsa', compra: 1, venta: 1450 },
    { fecha: '2026-11-14', casa: 'blue', compra: 1, venta: 1500 },
  ]
  it('usa la del día si existe', () => {
    expect(elegirCotizacion(g, 'bolsa', '2026-11-14')?.venta).toBe(1450)
  })
  it('si no, la última anterior', () => {
    expect(elegirCotizacion(g, 'bolsa', '2026-11-12')?.venta).toBe(1400)
    expect(elegirCotizacion(g, 'bolsa', '2026-11-16')?.venta).toBe(1450)
  })
  it('si la fecha es anterior a todo, la más vieja', () => {
    expect(elegirCotizacion(g, 'bolsa', '2026-01-01')?.venta).toBe(1400)
  })
  it('null si no hay nada de esa casa', () => {
    expect(elegirCotizacion(g, 'tarjeta', '2026-11-14')).toBeNull()
  })
})

describe('cotizacionPara (con cache y fallback)', () => {
  beforeEach(async () => {
    await db.cotizaciones.clear()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('pide a DolarApi, guarda una por día y no vuelve a pedir', async () => {
    const fetchFalso = vi.fn(async () => new Response(JSON.stringify(RESPUESTA)))
    vi.stubGlobal('fetch', fetchFalso)
    const r1 = await cotizacionPara(hoyISO(), 'bolsa')
    expect(r1).toEqual({ cotizacion: { fecha: hoyISO(), casa: 'bolsa', compra: 1490.5, venta: 1495.3 }, desactualizada: false })
    expect(await db.cotizaciones.count()).toBe(4)
    await cotizacionPara(hoyISO(), 'blue')
    expect(fetchFalso).toHaveBeenCalledTimes(1)
  })

  it('si falla internet usa la última guardada y avisa', async () => {
    await db.cotizaciones.put({ fecha: '2026-01-05', casa: 'bolsa', compra: 1300, venta: 1310 })
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('sin internet') }))
    const r = await cotizacionPara(hoyISO(), 'bolsa')
    expect(r.cotizacion?.venta).toBe(1310)
    expect(r.desactualizada).toBe(true)
  })

  it('si falla y no hay nada guardado devuelve null (se pide a mano)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('caído', { status: 500 })))
    const r = await cotizacionPara(hoyISO(), 'bolsa')
    expect(r.cotizacion).toBeNull()
  })
})
