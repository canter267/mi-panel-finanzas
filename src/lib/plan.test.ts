import { describe, expect, it } from 'vitest'
import type { Alcancia, Cuenta, Movimiento, Presupuesto, Recurrente } from '../db/tipos'
import { saldoDeCuenta, totalesDelMes } from './calculos'
import {
  alertaPorCruce,
  comprometidoPorMes,
  estadoPresupuestos,
  fechaEnMes,
  fechasPendientes,
  generarCuotas,
  nivelPresupuesto,
  presupuestosVigentes,
  progresoAlcancia,
  propuestaDeAhorro,
  proximaFecha,
  repartirEnCuotas,
  sumarMesesAFecha,
  totalMensualRecurrentes,
  ultimoMesInicial,
} from './plan'

let sigId = 1
const mov = (p: Partial<Movimiento>): Movimiento => ({
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
})

describe('presupuestos', () => {
  const todos: Presupuesto[] = [
    { mes: '2026-09', categoria_id: 1, tope_centavos: 20000000, moneda: 'ARS' },
    { mes: '2026-11', categoria_id: 1, tope_centavos: 30000000, moneda: 'ARS' },
    { mes: '2026-10', categoria_id: 2, tope_centavos: 10000000, moneda: 'ARS' },
    { mes: '2026-11', categoria_id: 2, tope_centavos: 0, moneda: 'ARS' }, // se sacó en noviembre
    { mes: '2026-10', categoria_id: 7, tope_centavos: 5000, moneda: 'USD' },
  ]

  it('cada mes hereda el último tope cargado', () => {
    const oct = presupuestosVigentes(todos, '2026-10')
    expect(oct.find((p) => p.categoria_id === 1)?.tope_centavos).toBe(20000000)
    expect(oct.find((p) => p.categoria_id === 2)?.tope_centavos).toBe(10000000)
    const dic = presupuestosVigentes(todos, '2026-12')
    expect(dic.find((p) => p.categoria_id === 1)?.tope_centavos).toBe(30000000)
    expect(dic.find((p) => p.categoria_id === 2)).toBeUndefined() // tope 0 = sin presupuesto
    expect(presupuestosVigentes(todos, '2026-08')).toEqual([])
  })

  it('verde, amarillo al 80% y rojo al 100%', () => {
    expect(nivelPresupuesto(7999, 10000)).toBe('ok')
    expect(nivelPresupuesto(8000, 10000)).toBe('aviso')
    expect(nivelPresupuesto(9999, 10000)).toBe('aviso')
    expect(nivelPresupuesto(10000, 10000)).toBe('pasado')
    expect(nivelPresupuesto(15000, 10000)).toBe('pasado')
    expect(nivelPresupuesto(500, 0)).toBe('ok')
  })

  it('suma lo gastado del mes en la moneda del presupuesto', () => {
    const movs = [
      mov({ categoria_id: 1, monto_centavos: 25000000 }),
      mov({ categoria_id: 1, monto_centavos: 5000000, fecha: '2026-10-30' }), // otro mes
      mov({ categoria_id: 7, monto_centavos: 2000, moneda: 'USD', cuenta_id: 4 }),
      mov({ categoria_id: 7, monto_centavos: 3000000, cotizacion: 1500 }), // $ 30.000 = US$ 20
      mov({ categoria_id: 1, tipo: 'ingreso', monto_centavos: 99999999 }), // no es gasto
    ]
    const e = estadoPresupuestos(todos, movs, '2026-11')
    expect(e.find((x) => x.presupuesto.categoria_id === 1)).toMatchObject({ gastado: 25000000, nivel: 'aviso' })
    expect(e.find((x) => x.presupuesto.categoria_id === 7)).toMatchObject({ gastado: 4000, nivel: 'aviso' })
  })

  it('avisa solo cuando un gasto cruza el 80% o el 100%', () => {
    expect(alertaPorCruce(5000, 7000, 10000)).toBeNull()
    expect(alertaPorCruce(7000, 8500, 10000)).toBe('aviso')
    expect(alertaPorCruce(8500, 9000, 10000)).toBeNull() // ya estaba en amarillo
    expect(alertaPorCruce(9000, 10500, 10000)).toBe('pasado')
    expect(alertaPorCruce(5000, 12000, 10000)).toBe('pasado')
    expect(alertaPorCruce(11000, 12000, 10000)).toBeNull()
  })
})

describe('alcancías', () => {
  const cuenta: Cuenta = { id: 9, nombre: 'Viaje', tipo: 'dolares', moneda: 'USD', saldo_inicial: 10000, orden: 9, archivada: false }
  const alcancia: Alcancia = { id: 1, nombre: 'Viaje', meta_usd_centavos: 100000, fecha_objetivo: '2027-03-15', cuenta_id: 9 }
  const movs = [
    mov({ tipo: 'compra_usd', monto_centavos: 30000000, cuenta_destino_id: 9, monto_destino_centavos: 20000, fecha: '2026-11-02' }),
    mov({ tipo: 'compra_usd', monto_centavos: 30000000, cuenta_destino_id: 9, monto_destino_centavos: 20000, fecha: '2026-12-02' }), // futuro
  ]

  it('el progreso es el saldo de su cuenta hasta hoy', () => {
    const p = progresoAlcancia(alcancia, [cuenta], movs, '2026-11-16')
    expect(p.ahorrado).toBe(30000) // US$ 100 inicial + US$ 200
    expect(p.falta).toBe(70000)
    expect(p.parte).toBeCloseTo(0.3)
  })

  it('sugiere cuánto separar por mes para llegar a la fecha', () => {
    const p = progresoAlcancia(alcancia, [cuenta], movs, '2026-11-16')
    expect(p.mesesRestantes).toBe(4) // dic, ene, feb, mar
    expect(p.sugerenciaMensual).toBe(17500) // US$ 700 / 4
  })

  it('sin fecha no sugiere; meta cumplida no pide más; fecha vencida pide todo junto', () => {
    expect(progresoAlcancia({ ...alcancia, fecha_objetivo: undefined }, [cuenta], movs, '2026-11-16').sugerenciaMensual).toBeNull()
    const cumplida = progresoAlcancia({ ...alcancia, meta_usd_centavos: 20000 }, [cuenta], movs, '2026-11-16')
    expect(cumplida).toMatchObject({ falta: 0, parte: 1, sugerenciaMensual: 0 })
    expect(progresoAlcancia({ ...alcancia, fecha_objetivo: '2026-01-01' }, [cuenta], movs, '2026-11-16').sugerenciaMensual).toBe(70000)
  })

  it('redondea la sugerencia para arriba (nunca queda corta)', () => {
    const p = progresoAlcancia({ ...alcancia, meta_usd_centavos: 30100, fecha_objetivo: '2027-02-01' }, [cuenta], movs, '2026-11-16')
    expect(p.sugerenciaMensual).toBe(34) // falta US$ 1,00 en 3 meses -> 34 centavos
  })
})

describe('págate primero', () => {
  const alcanciaUsd: Cuenta = { id: 9, nombre: 'Fondo', tipo: 'dolares', moneda: 'USD', saldo_inicial: 0, orden: 9, archivada: false }
  const sueldo = mov({ tipo: 'ingreso', monto_centavos: 150000000, fecha: '2026-11-01', cotizacion: 1500 })

  it('sueldo en pesos: propone una compra de dólares por el %', () => {
    const p = propuestaDeAhorro(sueldo, 20, alcanciaUsd, 'ahora')!
    expect(p).toMatchObject({
      tipo: 'compra_usd',
      fecha: '2026-11-01',
      monto_centavos: 30000000, // 20% de $ 1.500.000
      moneda: 'ARS',
      cuenta_id: 2,
      cuenta_destino_id: 9,
      monto_destino_centavos: 20000, // US$ 200
      cotizacion: 1500,
    })
  })

  it('no cuenta como gasto y la tasa de ahorro no cambia', () => {
    const p = { ...propuestaDeAhorro(sueldo, 20, alcanciaUsd, 'ahora')!, id: 999 }
    expect(totalesDelMes([sueldo, p], '2026-11')).toEqual(totalesDelMes([sueldo], '2026-11'))
  })

  it('ingreso en dólares: transferencia', () => {
    const p = propuestaDeAhorro(mov({ tipo: 'ingreso', monto_centavos: 100000, moneda: 'USD', cuenta_id: 4 }), 15, alcanciaUsd, 'ahora')!
    expect(p).toMatchObject({ tipo: 'transferencia', monto_centavos: 15000, monto_destino_centavos: 15000, moneda: 'USD' })
  })

  it('no propone nada si no tiene sentido', () => {
    expect(propuestaDeAhorro(sueldo, 0, alcanciaUsd, 'ahora')).toBeNull()
    expect(propuestaDeAhorro(sueldo, 120, alcanciaUsd, 'ahora')).toBeNull()
    expect(propuestaDeAhorro({ ...sueldo, cuenta_id: 9 }, 20, alcanciaUsd, 'ahora')).toBeNull()
  })
})

describe('cuotas (regla 6)', () => {
  it('reparte sin perder centavos', () => {
    expect(repartirEnCuotas(100000, 3)).toEqual([33334, 33333, 33333])
    expect(repartirEnCuotas(120000, 12)).toEqual(Array(12).fill(10000))
    expect(repartirEnCuotas(5, 6)).toEqual([5, 0, 0, 0, 0, 0])
    for (const [total, n] of [[1234567, 7], [99999, 12], [1, 3]]) {
      expect(repartirEnCuotas(total, n).reduce((a, b) => a + b, 0)).toBe(total)
    }
    expect(() => repartirEnCuotas(100, 0)).toThrow()
  })

  it('suma meses respetando el día, y el fin de mes', () => {
    expect(sumarMesesAFecha('2026-11-16', 1)).toBe('2026-12-16')
    expect(sumarMesesAFecha('2026-11-16', 2)).toBe('2027-01-16')
    expect(sumarMesesAFecha('2026-01-31', 1)).toBe('2026-02-28')
    expect(sumarMesesAFecha('2028-01-31', 1)).toBe('2028-02-29') // bisiesto
    expect(sumarMesesAFecha('2026-01-31', 3)).toBe('2026-04-30')
    expect(fechaEnMes('2026-02', 31)).toBe('2026-02-28')
  })

  const { id: _id, ...compra } = mov({ monto_centavos: 60000000, categoria_id: 8, fecha: '2026-11-20', nota: 'Heladera', cotizacion: 1500 })
  const cuotas = generarCuotas(compra, 6, 'abc')

  it('N cuotas = N movimientos con el mismo compra_id, uno por mes', () => {
    expect(cuotas).toHaveLength(6)
    expect(cuotas.map((c) => c.fecha)).toEqual(['2026-11-20', '2026-12-20', '2027-01-20', '2027-02-20', '2027-03-20', '2027-04-20'])
    expect(cuotas.every((c) => c.compra_id === 'abc' && c.cuotas_total === 6 && c.tipo === 'gasto')).toBe(true)
    expect(cuotas.map((c) => c.cuota_n)).toEqual([1, 2, 3, 4, 5, 6])
    expect(cuotas.reduce((s, c) => s + c.monto_centavos, 0)).toBe(60000000)
  })

  it('todas guardan la cotización del día de la compra (regla 2)', () => {
    expect(cuotas.every((c) => c.cotizacion === 1500)).toBe(true)
  })

  it('cada cuota cuenta como gasto en su mes', () => {
    const movs = cuotas.map((c, i) => ({ ...c, id: 100 + i }))
    expect(totalesDelMes(movs, '2026-11').gastos.ars).toBe(10000000)
    expect(totalesDelMes(movs, '2027-02').gastos.ars).toBe(10000000)
    expect(totalesDelMes(movs, '2027-05').gastos.ars).toBe(0)
  })

  it('las cuotas futuras todavía no bajan el saldo de la cuenta', () => {
    const banco: Cuenta = { id: 2, nombre: 'Banco', tipo: 'banco', moneda: 'ARS', saldo_inicial: 100000000, orden: 1, archivada: false }
    const movs = cuotas.map((c, i) => ({ ...c, id: 100 + i }))
    expect(saldoDeCuenta(banco, movs, '2026-11-25')).toBe(90000000)
    expect(saldoDeCuenta(banco, movs, '2027-01-25')).toBe(70000000)
    expect(saldoDeCuenta(banco, movs)).toBe(40000000) // sin fecha de corte cuenta todo
  })

  it('una sola cuota es una compra común', () => {
    expect(generarCuotas(compra, 1, 'x')).toHaveLength(1)
    expect(generarCuotas(compra, 1, 'x')[0]).toMatchObject({ fecha: '2026-11-20', monto_centavos: 60000000 })
  })
})

describe('gastos fijos', () => {
  const rec: Recurrente = {
    id: 5,
    plantilla: { monto_centavos: 1599900, moneda: 'ARS', cuenta_id: 2, categoria_id: 7, nota: 'Streaming' },
    frecuencia: 'mensual',
    dia_del_mes: 10,
    activo: true,
    ultimo_mes_generado: '2026-10',
  }

  it('genera el mes cuando llega el día, no antes', () => {
    expect(fechasPendientes(rec, '2026-11-09')).toEqual([])
    expect(fechasPendientes(rec, '2026-11-10')).toEqual(['2026-11-10'])
    expect(fechasPendientes(rec, '2026-11-30')).toEqual(['2026-11-10'])
  })

  it('se pone al día si la app estuvo cerrada varios meses', () => {
    expect(fechasPendientes(rec, '2027-01-15')).toEqual(['2026-11-10', '2026-12-10', '2027-01-10'])
  })

  it('no repite lo ya generado ni genera si está pausado', () => {
    expect(fechasPendientes({ ...rec, ultimo_mes_generado: '2026-11' }, '2026-11-30')).toEqual([])
    expect(fechasPendientes({ ...rec, activo: false }, '2027-01-15')).toEqual([])
  })

  it('día 31 cae el último día en meses cortos', () => {
    expect(fechasPendientes({ ...rec, dia_del_mes: 31, ultimo_mes_generado: '2027-01' }, '2027-02-28')).toEqual(['2027-02-28'])
  })

  it('al darlo de alta no carga nada para atrás', () => {
    expect(ultimoMesInicial(20, '2026-11-16')).toBe('2026-10') // el 20 todavía no llegó: se genera este mes
    expect(ultimoMesInicial(5, '2026-11-16')).toBe('2026-11') // el 5 ya pasó: arranca en diciembre
    expect(ultimoMesInicial(16, '2026-11-16')).toBe('2026-11')
    expect(proximaFecha({ ...rec, dia_del_mes: 20, ultimo_mes_generado: '2026-10' }, '2026-11-16')).toBe('2026-11-20')
    expect(proximaFecha({ ...rec, dia_del_mes: 5, ultimo_mes_generado: '2026-11' }, '2026-11-16')).toBe('2026-12-05')
  })

  it('total mensual en pesos, con los que están en dólares a la cotización de hoy', () => {
    const enUsd: Recurrente = { ...rec, id: 6, plantilla: { ...rec.plantilla, monto_centavos: 1000, moneda: 'USD' } }
    const pausado: Recurrente = { ...rec, id: 7, activo: false }
    expect(totalMensualRecurrentes([rec, enUsd, pausado], 'ARS', 1500)).toBe(1599900 + 1500000)
  })

  it('comprometido: cuotas de cada mes + gastos fijos', () => {
    const { id: _id, ...compra } = mov({ monto_centavos: 30000000, fecha: '2026-11-20', categoria_id: 8 })
    const movs = [
      ...generarCuotas(compra, 3, 'c1').map((c, i) => ({ ...c, id: 200 + i })),
      mov({ monto_centavos: 99999, fecha: '2026-12-01' }), // gasto común: no es compromiso
    ]
    const r = comprometidoPorMes(movs, [rec], '2026-12', 3, 1500)
    expect(r).toEqual([
      { mes: '2026-12', cuotas: 10000000, fijos: 1599900 },
      { mes: '2027-01', cuotas: 10000000, fijos: 1599900 },
      { mes: '2027-02', cuotas: 0, fijos: 1599900 },
    ])
  })
})
