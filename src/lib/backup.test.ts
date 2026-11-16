import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { CATEGORIAS_INICIALES, CUENTAS_INICIALES, db } from '../db/db'
import type { Movimiento } from '../db/tipos'
import { crearBackup, movimientosACsv, restaurarBackup, resumirBackup, validarBackup } from './backup'
import { saldoDeCuenta } from './calculos'

const base = { nota: '', cotizacion: 1500, casa_cotizacion: 'bolsa' as const, creado: '', editado: '' }
const MOVS: Movimiento[] = [
  { ...base, fecha: '2026-11-01', tipo: 'ingreso', monto_centavos: 100000000, moneda: 'ARS', cuenta_id: 2, categoria_id: 13 },
  { ...base, fecha: '2026-11-05', tipo: 'gasto', monto_centavos: 2550050, moneda: 'ARS', cuenta_id: 2, categoria_id: 1, nota: 'Coto; "oferta"' },
  { ...base, fecha: '2026-11-07', tipo: 'compra_usd', monto_centavos: 15000000, moneda: 'ARS', cuenta_id: 2, cuenta_destino_id: 4, monto_destino_centavos: 10000 },
]

beforeEach(async () => {
  await db.delete()
  await db.open()
  await db.movimientos.bulkAdd(MOVS)
})

describe('base de datos', () => {
  it('arranca con las cuentas y categorías predefinidas', async () => {
    expect((await db.cuentas.toArray()).map((c) => c.nombre)).toEqual(CUENTAS_INICIALES.map((c) => c.nombre))
    expect((await db.cuentas.orderBy('orden').toArray()).map((c) => c.nombre)).toEqual(['Efectivo', 'Banco', 'Mercado Pago', 'PedidosYa', 'Dólares'])
    expect(await db.categorias.count()).toBe(CATEGORIAS_INICIALES.length)
    expect(await db.categorias.where('tipo').equals('ingreso').count()).toBe(2)
  })
})

describe('backup JSON', () => {
  it('exportar → borrar todo → importar deja los mismos datos y saldos', async () => {
    const backup = validarBackup(JSON.parse(JSON.stringify(await crearBackup())))
    const banco = (await db.cuentas.get(2))!
    const saldoAntes = saldoDeCuenta(banco, await db.movimientos.toArray())
    expect(saldoAntes).toBe(100000000 - 2550050 - 15000000)

    await Promise.all(db.tables.map((t) => t.clear()))
    expect(await db.movimientos.count()).toBe(0)

    await restaurarBackup(backup)
    expect(await db.cuentas.count()).toBe(5)
    expect(await db.movimientos.count()).toBe(3)
    expect(saldoDeCuenta((await db.cuentas.get(2))!, await db.movimientos.toArray())).toBe(saldoAntes)
    expect((await crearBackup()).tablas).toEqual(backup.tablas)
  })

  it('importar reemplaza lo que había, no lo duplica', async () => {
    const backup = await crearBackup()
    await db.movimientos.add({ ...MOVS[1], monto_centavos: 999 })
    await restaurarBackup(backup)
    expect(await db.movimientos.count()).toBe(3)
  })

  it('el resumen para la vista previa cuenta y da el rango de fechas', async () => {
    expect(resumirBackup(await crearBackup())).toMatchObject({
      cuentas: 5,
      categorias: 14,
      movimientos: 3,
      desde: '2026-11-01',
      hasta: '2026-11-07',
    })
  })

  it('rechaza archivos que no son un backup o están dañados', async () => {
    expect(() => validarBackup(null)).toThrow(/no es un backup/)
    expect(() => validarBackup({ hola: 1 })).toThrow(/no es un backup/)
    const b = JSON.parse(JSON.stringify(await crearBackup()))
    b.tablas.movimientos[0].monto_centavos = 10.5 // regla 1: nada de decimales
    expect(() => validarBackup(b)).toThrow(/movimiento/)
    const c = JSON.parse(JSON.stringify(await crearBackup()))
    c.tablas.cuentas = 'x'
    expect(() => validarBackup(c)).toThrow(/cuentas/)
  })
})

describe('exportar CSV', () => {
  it('una fila por movimiento, con fecha dd/mm/aaaa y coma decimal', async () => {
    const csv = movimientosACsv(await db.movimientos.toArray(), await db.cuentas.toArray(), await db.categorias.toArray())
    const lineas = csv.trim().split('\r\n')
    expect(lineas).toHaveLength(4)
    expect(lineas[0]).toBe('Fecha;Tipo;Monto;Moneda;Cuenta;Categoría;Cuenta destino;Monto destino;Cotización;Casa;Nota')
    expect(lineas[1]).toBe('01/11/2026;ingreso;1000000,00;ARS;Banco;Sueldo;;;1500;bolsa;')
    expect(lineas[2]).toBe('05/11/2026;gasto;25500,50;ARS;Banco;Súper y almacén;;;1500;bolsa;"Coto; ""oferta"""')
    expect(lineas[3]).toBe('07/11/2026;compra_usd;150000,00;ARS;Banco;;Dólares;100,00;1500;bolsa;')
  })
})
