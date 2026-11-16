import { describe, expect, it } from 'vitest'
import type { Categoria, Cuenta, Movimiento } from '../db/tipos'
import {
  gastosPorCategoria,
  gastosPorGrupo,
  saldoDeCuenta,
  saldoTotal,
  tasaDeAhorro,
  totalesDelMes,
  variacion,
} from './calculos'

let sigId = 1
function mov(p: Partial<Movimiento>): Movimiento {
  return {
    id: sigId++,
    fecha: '2026-11-10',
    tipo: 'gasto',
    monto_centavos: 0,
    moneda: 'ARS',
    cuenta_id: 2,
    nota: '',
    cotizacion: 1500,
    casa_cotizacion: 'bolsa',
    creado: '',
    editado: '',
    ...p,
  }
}

const banco: Cuenta = { id: 2, nombre: 'Banco', tipo: 'banco', moneda: 'ARS', saldo_inicial: 10000000, orden: 1, archivada: false }
const efectivo: Cuenta = { id: 1, nombre: 'Efectivo', tipo: 'efectivo', moneda: 'ARS', saldo_inicial: 0, orden: 2, archivada: false }
const dolares: Cuenta = { id: 4, nombre: 'Dólares', tipo: 'dolares', moneda: 'USD', saldo_inicial: 50000, orden: 3, archivada: false }

const movs: Movimiento[] = [
  // Noviembre
  mov({ tipo: 'ingreso', monto_centavos: 150000000, categoria_id: 13, fecha: '2026-11-01' }), // $ 1.500.000
  mov({ tipo: 'gasto', monto_centavos: 60000000, categoria_id: 4, fecha: '2026-11-02' }), // alquiler $ 600.000
  mov({ tipo: 'gasto', monto_centavos: 15000000, categoria_id: 1, fecha: '2026-11-05' }), // súper $ 150.000
  mov({ tipo: 'gasto', monto_centavos: 15000000, categoria_id: 1, fecha: '2026-11-12' }), // súper $ 150.000
  mov({ tipo: 'gasto', monto_centavos: 2000, moneda: 'USD', cuenta_id: 4, categoria_id: 7, fecha: '2026-11-08', cotizacion: 1500 }), // US$ 20
  mov({ tipo: 'transferencia', monto_centavos: 5000000, cuenta_destino_id: 1, monto_destino_centavos: 5000000, fecha: '2026-11-03' }),
  mov({ tipo: 'compra_usd', monto_centavos: 30000000, cuenta_destino_id: 4, monto_destino_centavos: 20000, fecha: '2026-11-04' }), // US$ 200 a 1.500
  // Octubre (con otra cotización)
  mov({ tipo: 'ingreso', monto_centavos: 140000000, categoria_id: 13, fecha: '2026-10-01', cotizacion: 1400 }),
  mov({ tipo: 'gasto', monto_centavos: 70000000, categoria_id: 4, fecha: '2026-10-02', cotizacion: 1400 }),
]

describe('totales del mes', () => {
  const t = totalesDelMes(movs, '2026-11')

  it('suma ingresos y gastos en pesos', () => {
    expect(t.ingresos.ars).toBe(150000000)
    // 600.000 + 150.000 + 150.000 + (US$ 20 × 1.500 = 30.000) = 930.000
    expect(t.gastos.ars).toBe(93000000)
    expect(t.ahorro.ars).toBe(57000000)
  })

  it('suma en dólares usando la cotización de cada movimiento (regla 3)', () => {
    expect(t.ingresos.usd).toBe(100000) // US$ 1.000
    expect(t.gastos.usd).toBe(40000 + 10000 + 10000 + 2000) // US$ 620
    expect(t.ahorro.usd).toBe(38000)
  })

  it('transferencias y compras de dólares no cuentan como gasto ni ingreso (regla 4)', () => {
    const solo = totalesDelMes(
      movs.filter((m) => m.tipo === 'transferencia' || m.tipo === 'compra_usd'),
      '2026-11',
    )
    expect(solo.gastos).toEqual({ ars: 0, usd: 0 })
    expect(solo.ingresos).toEqual({ ars: 0, usd: 0 })
  })

  it('no mezcla meses', () => {
    const oct = totalesDelMes(movs, '2026-10')
    expect(oct.ingresos.ars).toBe(140000000)
    expect(oct.gastos.ars).toBe(70000000)
    expect(oct.ingresos.usd).toBe(100000) // 1.400.000 / 1.400
  })

  it('los meses pasados no cambian aunque hoy el dólar valga otra cosa (regla 2)', () => {
    const conMovNuevo = [...movs, mov({ tipo: 'gasto', monto_centavos: 100, fecha: '2026-12-01', cotizacion: 3000 })]
    expect(totalesDelMes(conMovNuevo, '2026-10')).toEqual(totalesDelMes(movs, '2026-10'))
  })

  it('mes vacío da todo en cero', () => {
    const v = totalesDelMes(movs, '2025-01')
    expect(v.ingresos.ars + v.gastos.ars + v.ahorro.ars).toBe(0)
  })
})

describe('tasa de ahorro (regla 5)', () => {
  it('(ingresos − gastos) / ingresos', () => {
    expect(tasaDeAhorro(150000000, 93000000)).toBeCloseTo(0.38, 10)
    expect(tasaDeAhorro(1000, 1000)).toBe(0)
    expect(tasaDeAhorro(1000, 0)).toBe(1)
  })
  it('es negativa si gastaste más de lo que entró', () => {
    expect(tasaDeAhorro(1000, 1500)).toBe(-0.5)
  })
  it('sin ingresos no se puede calcular', () => {
    expect(tasaDeAhorro(0, 500)).toBeNull()
  })
})

describe('gastos por categoría y por grupo', () => {
  it('agrupa y ordena de mayor a menor', () => {
    const g = gastosPorCategoria(movs, '2026-11')
    expect(g.map((x) => x.categoria_id)).toEqual([4, 1, 7])
    expect(g[1].total.ars).toBe(30000000)
    expect(g[2].total).toEqual({ ars: 3000000, usd: 2000 })
  })
  it('agrupa por necesidad / gusto', () => {
    const cats = [
      { id: 1, grupo: 'necesidad' },
      { id: 4, grupo: 'necesidad' },
      { id: 7, grupo: 'gusto' },
    ] as Categoria[]
    const g = gastosPorGrupo(movs, '2026-11', cats)
    expect(g.necesidad.ars).toBe(90000000)
    expect(g.gusto.ars).toBe(3000000)
    expect(g.ahorro.ars).toBe(0)
  })
})

describe('saldos de cuentas', () => {
  it('banco: inicial + ingresos − gastos − transferencias − compra de dólares', () => {
    // 100.000 + 1.500.000 + 1.400.000 − 600.000 − 150.000 − 150.000 − 700.000 − 50.000 − 300.000
    expect(saldoDeCuenta(banco, movs)).toBe(105000000)
  })
  it('efectivo recibe la transferencia', () => {
    expect(saldoDeCuenta(efectivo, movs)).toBe(5000000)
  })
  it('dólares: inicial + compra − gasto en USD', () => {
    expect(saldoDeCuenta(dolares, movs)).toBe(50000 + 20000 - 2000)
  })
  it('una transferencia no cambia el total en pesos; una compra de dólares sí lo baja', () => {
    const antes = saldoTotal([banco, efectivo], [], 'ARS')
    const transf = mov({ tipo: 'transferencia', monto_centavos: 1000, cuenta_destino_id: 1, monto_destino_centavos: 1000 })
    expect(saldoTotal([banco, efectivo], [transf], 'ARS')).toBe(antes)
    const compra = mov({ tipo: 'compra_usd', monto_centavos: 150000, cuenta_destino_id: 4, monto_destino_centavos: 100 })
    expect(saldoTotal([banco, efectivo], [compra], 'ARS')).toBe(antes - 150000)
    expect(saldoTotal([dolares], [compra], 'USD')).toBe(50100)
  })
  it('las cuentas archivadas no suman al total', () => {
    expect(saldoTotal([{ ...dolares, archivada: true }], movs, 'USD')).toBe(0)
  })
})

describe('variación contra el mes anterior', () => {
  it('calcula el porcentaje', () => {
    expect(variacion(120, 100)).toBeCloseTo(0.2)
    expect(variacion(80, 100)).toBeCloseTo(-0.2)
  })
  it('sin mes anterior no hay comparación', () => {
    expect(variacion(100, 0)).toBeNull()
  })
})
