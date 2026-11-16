import { db } from '../db/db'
import type { Alcancia, Categoria, Cotizacion, Cuenta, Movimiento, Presupuesto, Recurrente } from '../db/tipos'
import { formatearFecha } from './fechas'

export interface Backup {
  app: 'mi-panel-finanzas'
  version: 1
  exportado: string
  tablas: {
    cuentas: Cuenta[]
    categorias: Categoria[]
    movimientos: Movimiento[]
    cotizaciones: Cotizacion[]
    presupuestos: Presupuesto[]
    alcancias: Alcancia[]
    recurrentes: Recurrente[]
  }
}

const TABLAS = ['cuentas', 'categorias', 'movimientos', 'cotizaciones', 'presupuestos', 'alcancias', 'recurrentes'] as const

export async function crearBackup(): Promise<Backup> {
  return {
    app: 'mi-panel-finanzas',
    version: 1,
    exportado: new Date().toISOString(),
    tablas: {
      cuentas: await db.cuentas.toArray(),
      categorias: await db.categorias.toArray(),
      movimientos: await db.movimientos.toArray(),
      cotizaciones: await db.cotizaciones.toArray(),
      presupuestos: await db.presupuestos.toArray(),
      alcancias: await db.alcancias.toArray(),
      recurrentes: await db.recurrentes.toArray(),
    },
  }
}

const esObjeto = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const esFecha = (x: unknown) => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x)
const esMoneda = (x: unknown) => x === 'ARS' || x === 'USD'

/** Revisa que el archivo sea un backup de esta app y que los datos tengan sentido. Tira un error en criollo si no. */
export function validarBackup(json: unknown): Backup {
  if (!esObjeto(json) || json.app !== 'mi-panel-finanzas' || !esObjeto(json.tablas)) {
    throw new Error('Este archivo no es un backup de Mi panel de finanzas.')
  }
  if (json.version !== 1) throw new Error('El backup es de una versión que esta app no sabe leer.')
  const t = json.tablas
  for (const nombre of TABLAS) {
    // Backups viejos pueden no traer las tablas de fases posteriores.
    if (t[nombre] === undefined) t[nombre] = []
    if (!Array.isArray(t[nombre]) || !(t[nombre] as unknown[]).every(esObjeto)) {
      throw new Error(`El backup está dañado: la tabla "${nombre}" no es válida.`)
    }
  }
  const b = json as unknown as Backup
  for (const c of b.tablas.cuentas) {
    if (typeof c.id !== 'number' || typeof c.nombre !== 'string' || !esMoneda(c.moneda) || !Number.isInteger(c.saldo_inicial)) {
      throw new Error('El backup está dañado: hay una cuenta con datos inválidos.')
    }
  }
  for (const c of b.tablas.categorias) {
    if (typeof c.id !== 'number' || typeof c.nombre !== 'string' || (c.tipo !== 'gasto' && c.tipo !== 'ingreso')) {
      throw new Error('El backup está dañado: hay una categoría con datos inválidos.')
    }
  }
  const tipos = ['gasto', 'ingreso', 'transferencia', 'compra_usd']
  for (const m of b.tablas.movimientos) {
    const ok =
      esFecha(m.fecha) &&
      tipos.includes(m.tipo) &&
      Number.isInteger(m.monto_centavos) &&
      esMoneda(m.moneda) &&
      typeof m.cuenta_id === 'number' &&
      typeof m.cotizacion === 'number' &&
      m.cotizacion > 0 &&
      (m.monto_destino_centavos === undefined || Number.isInteger(m.monto_destino_centavos))
    if (!ok) throw new Error(`El backup está dañado: hay un movimiento con datos inválidos (fecha ${String(m.fecha)}).`)
  }
  for (const c of b.tablas.cotizaciones) {
    if (!esFecha(c.fecha) || typeof c.casa !== 'string' || typeof c.venta !== 'number') {
      throw new Error('El backup está dañado: hay una cotización inválida.')
    }
  }
  return b
}

export interface ResumenBackup {
  exportado: string
  cuentas: number
  categorias: number
  movimientos: number
  cotizaciones: number
  desde?: string
  hasta?: string
}

/** Lo que se muestra en la vista previa antes de importar (regla 8). */
export function resumirBackup(b: Backup): ResumenBackup {
  const fechas = b.tablas.movimientos.map((m) => m.fecha).sort()
  return {
    exportado: b.exportado,
    cuentas: b.tablas.cuentas.length,
    categorias: b.tablas.categorias.length,
    movimientos: b.tablas.movimientos.length,
    cotizaciones: b.tablas.cotizaciones.length,
    desde: fechas[0],
    hasta: fechas[fechas.length - 1],
  }
}

/** Reemplaza TODO lo que hay en la base por el contenido del backup, en una sola transacción. */
export async function restaurarBackup(b: Backup): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    for (const nombre of TABLAS) {
      await db.table(nombre).clear()
      await db.table(nombre).bulkAdd(b.tablas[nombre])
    }
  })
}

function celda(valor: string | number | undefined): string {
  let s = String(valor ?? '')
  // Evita que Excel interprete una nota como fórmula.
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const decimal = (centavos?: number) => {
  if (centavos === undefined) return ''
  const abs = Math.abs(centavos)
  return `${centavos < 0 ? '-' : ''}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`
}

/** CSV con ";" y coma decimal, que es lo que abre bien Excel en español. */
export function movimientosACsv(movs: Movimiento[], cuentas: Cuenta[], categorias: Categoria[]): string {
  const cuenta = (id?: number) => (id === undefined ? '' : (cuentas.find((c) => c.id === id)?.nombre ?? ''))
  const categoria = (id?: number) => (id === undefined ? '' : (categorias.find((c) => c.id === id)?.nombre ?? ''))
  const filas = [
    ['Fecha', 'Tipo', 'Monto', 'Moneda', 'Cuenta', 'Categoría', 'Cuenta destino', 'Monto destino', 'Cotización', 'Casa', 'Nota'],
    ...[...movs]
      .sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.id ?? 0) - (b.id ?? 0))
      .map((m) => [
        formatearFecha(m.fecha),
        m.tipo,
        decimal(m.monto_centavos),
        m.moneda,
        celda(cuenta(m.cuenta_id)),
        celda(categoria(m.categoria_id)),
        celda(cuenta(m.cuenta_destino_id)),
        decimal(m.monto_destino_centavos),
        String(m.cotizacion).replace('.', ','),
        m.casa_cotizacion,
        celda(m.nota),
      ]),
  ]
  return filas.map((f) => f.join(';')).join('\r\n') + '\r\n'
}

/** Hace que el navegador baje un archivo con ese contenido. */
export function descargar(nombre: string, contenido: string, tipo: string) {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }))
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
