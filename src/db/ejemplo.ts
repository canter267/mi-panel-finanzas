import { cotizacionPara } from '../lib/cotizacion'
import { usdAArs } from '../lib/dinero'
import { hoyISO, mesAnterior, mesDe } from '../lib/fechas'
import { db } from './db'
import type { Casa, Cuenta, Movimiento } from './tipos'

/**
 * Datos de ejemplo: el mes pasado completo y el mes actual hasta hoy.
 * Todos los movimientos llevan `ejemplo: true`, así se pueden borrar sin tocar los reales.
 * No crea cuentas ni categorías: usa las que ya existen.
 */

type Plantilla =
  | { dia: number; tipo: 'gasto' | 'ingreso'; cat: string; cuenta: 'banco' | 'efectivo' | 'billetera' | 'dolares'; pesos?: number; usd?: number; nota: string }
  | { dia: number; tipo: 'transferencia'; de: 'banco'; a: 'efectivo' | 'billetera'; pesos: number; nota: string }
  | { dia: number; tipo: 'compra_usd'; usd: number; nota: string }

const MES: Plantilla[] = [
  { dia: 1, tipo: 'ingreso', cat: 'Sueldo', cuenta: 'banco', pesos: 1_850_000, nota: 'Sueldo' },
  { dia: 2, tipo: 'gasto', cat: 'Alquiler y expensas', cuenta: 'banco', pesos: 520_000, nota: 'Alquiler' },
  { dia: 2, tipo: 'compra_usd', usd: 200, nota: 'Ahorro del mes' },
  { dia: 3, tipo: 'transferencia', de: 'banco', a: 'billetera', pesos: 250_000, nota: 'Para gastos del mes' },
  { dia: 3, tipo: 'transferencia', de: 'banco', a: 'efectivo', pesos: 60_000, nota: 'Extracción' },
  { dia: 4, tipo: 'gasto', cat: 'Alquiler y expensas', cuenta: 'banco', pesos: 95_000, nota: 'Expensas' },
  { dia: 4, tipo: 'gasto', cat: 'Súper y almacén', cuenta: 'billetera', pesos: 68_450.5, nota: 'Compra grande en el súper' },
  { dia: 5, tipo: 'gasto', cat: 'Salud y prepaga', cuenta: 'banco', pesos: 142_000, nota: 'Prepaga' },
  { dia: 6, tipo: 'gasto', cat: 'Transporte', cuenta: 'billetera', pesos: 15_000, nota: 'Carga SUBE' },
  { dia: 7, tipo: 'gasto', cat: 'Delivery y salidas', cuenta: 'billetera', pesos: 23_800, nota: 'Pizza con amigos' },
  { dia: 8, tipo: 'gasto', cat: 'Servicios', cuenta: 'banco', pesos: 38_900, nota: 'Luz' },
  { dia: 8, tipo: 'gasto', cat: 'Servicios', cuenta: 'banco', pesos: 31_500, nota: 'Internet' },
  { dia: 9, tipo: 'gasto', cat: 'Suscripciones', cuenta: 'dolares', usd: 11.99, nota: 'Spotify + almacenamiento' },
  { dia: 10, tipo: 'ingreso', cat: 'Extras', cuenta: 'billetera', pesos: 120_000, nota: 'Changa de fin de semana' },
  { dia: 11, tipo: 'gasto', cat: 'Súper y almacén', cuenta: 'efectivo', pesos: 18_200, nota: 'Verdulería' },
  { dia: 12, tipo: 'gasto', cat: 'Suscripciones', cuenta: 'banco', pesos: 15_999, nota: 'Streaming' },
  { dia: 13, tipo: 'gasto', cat: 'Transporte', cuenta: 'billetera', pesos: 9_400, nota: 'Uber' },
  { dia: 14, tipo: 'gasto', cat: 'Delivery y salidas', cuenta: 'billetera', pesos: 31_250, nota: 'Cena afuera' },
  { dia: 15, tipo: 'gasto', cat: 'Súper y almacén', cuenta: 'billetera', pesos: 54_300, nota: 'Súper' },
  { dia: 17, tipo: 'gasto', cat: 'Servicios', cuenta: 'banco', pesos: 22_700, nota: 'Celular' },
  { dia: 18, tipo: 'gasto', cat: 'Mascotas', cuenta: 'billetera', pesos: 27_500, nota: 'Alimento del gato' },
  { dia: 20, tipo: 'gasto', cat: 'Ropa', cuenta: 'banco', pesos: 64_990, nota: 'Zapatillas' },
  { dia: 21, tipo: 'gasto', cat: 'Delivery y salidas', cuenta: 'efectivo', pesos: 12_000, nota: 'Birra' },
  { dia: 23, tipo: 'gasto', cat: 'Súper y almacén', cuenta: 'billetera', pesos: 47_800, nota: 'Súper' },
  { dia: 24, tipo: 'gasto', cat: 'Regalos', cuenta: 'banco', pesos: 35_000, nota: 'Cumple de mamá' },
  { dia: 26, tipo: 'gasto', cat: 'Educación', cuenta: 'banco', pesos: 48_000, nota: 'Curso de inglés' },
  { dia: 27, tipo: 'gasto', cat: 'Imprevistos', cuenta: 'banco', pesos: 41_000, nota: 'Arreglo del calefón' },
  { dia: 28, tipo: 'gasto', cat: 'Servicios', cuenta: 'banco', pesos: 19_300, nota: 'Gas' },
]

const aCentavos = (monto: number) => Math.round(monto * 100)

export async function cargarEjemplo(): Promise<number> {
  const cuentas = (await db.cuentas.toArray()).filter((c) => !c.archivada)
  const categorias = await db.categorias.toArray()
  const ars = cuentas.filter((c) => c.moneda === 'ARS')
  const usd = cuentas.find((c) => c.moneda === 'USD')
  if (ars.length === 0 || !usd) throw new Error('Para cargar el ejemplo hace falta al menos una cuenta en pesos y una en dólares.')

  const cuenta = (tipo: string): Cuenta => (tipo === 'dolares' ? usd : (ars.find((c) => c.tipo === tipo) ?? ars[0]))
  const categoria = (nombre: string, tipo: 'gasto' | 'ingreso') =>
    (categorias.find((c) => c.nombre === nombre) ?? categorias.find((c) => c.tipo === tipo))?.id

  // Cotización real de hoy si se puede; si no, un valor de fantasía.
  const { cotizacion } = await cotizacionPara(hoyISO())
  const cotHoy = cotizacion?.venta ?? 1500
  const casa: Casa | 'manual' = cotizacion?.casa ?? 'manual'

  const hoy = hoyISO()
  const mesActual = mesDe(hoy)
  const ahora = new Date().toISOString()
  const movs: Movimiento[] = []

  // El mes pasado va completo, un poco más barato y con el dólar un poco más abajo.
  const meses = [
    { mes: mesAnterior(mesActual), escala: 0.94, cot: Math.round(cotHoy * 0.97) },
    { mes: mesActual, escala: 1, cot: cotHoy },
  ]
  for (const { mes, escala, cot } of meses) {
    for (const p of MES) {
      const fecha = `${mes}-${String(p.dia).padStart(2, '0')}`
      if (fecha > hoy) continue
      const base = { fecha, nota: p.nota, cotizacion: cot, casa_cotizacion: casa, creado: ahora, editado: ahora, ejemplo: true }
      // Redondeado a pesos enteros, salvo el mes actual que conserva los centavos del ejemplo.
      const pesos = (monto: number) => (escala === 1 ? aCentavos(monto) : Math.round(monto * escala) * 100)

      if (p.tipo === 'compra_usd') {
        movs.push({
          ...base,
          tipo: 'compra_usd',
          monto_centavos: usdAArs(aCentavos(p.usd), cot),
          moneda: 'ARS',
          cuenta_id: cuenta('banco').id!,
          cuenta_destino_id: usd.id!,
          monto_destino_centavos: aCentavos(p.usd),
        })
      } else if (p.tipo === 'transferencia') {
        const origen = cuenta(p.de)
        const destino = cuenta(p.a)
        if (origen.id === destino.id) continue
        movs.push({
          ...base,
          tipo: 'transferencia',
          monto_centavos: pesos(p.pesos),
          moneda: 'ARS',
          cuenta_id: origen.id!,
          cuenta_destino_id: destino.id!,
          monto_destino_centavos: pesos(p.pesos),
        })
      } else {
        const c = cuenta(p.cuenta)
        movs.push({
          ...base,
          tipo: p.tipo,
          monto_centavos: p.usd !== undefined ? aCentavos(p.usd) : pesos(p.pesos ?? 0),
          moneda: c.moneda,
          cuenta_id: c.id!,
          categoria_id: categoria(p.cat, p.tipo),
        })
      }
    }
  }
  await db.movimientos.bulkAdd(movs)
  return movs.length
}

export async function contarEjemplo(): Promise<number> {
  return db.movimientos.filter((m) => m.ejemplo === true).count()
}

/** Borra solo los movimientos marcados como ejemplo. Lo que cargaste vos no se toca. */
export async function borrarEjemplo(): Promise<number> {
  return db.movimientos.filter((m) => m.ejemplo === true).delete()
}
