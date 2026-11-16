import Dexie, { type EntityTable, type Table } from 'dexie'
import type { Alcancia, Categoria, Cotizacion, Cuenta, Movimiento, Presupuesto, Recurrente } from './tipos'

export class BaseFinanzas extends Dexie {
  cuentas!: EntityTable<Cuenta, 'id'>
  categorias!: EntityTable<Categoria, 'id'>
  movimientos!: EntityTable<Movimiento, 'id'>
  cotizaciones!: Table<Cotizacion, [string, string]>
  presupuestos!: Table<Presupuesto, [string, number]>
  alcancias!: EntityTable<Alcancia, 'id'>
  recurrentes!: EntityTable<Recurrente, 'id'>

  constructor(nombre = 'mi-panel-finanzas') {
    super(nombre)
    this.version(1).stores({
      cuentas: '++id, orden',
      categorias: '++id, tipo',
      movimientos: '++id, fecha, tipo, cuenta_id, categoria_id, compra_id',
      cotizaciones: '[fecha+casa], fecha, casa',
      presupuestos: '[mes+categoria_id]',
      alcancias: '++id',
      recurrentes: '++id',
    })
    // Solo corre la primera vez que se crea la base en este navegador.
    this.on('populate', (tx) => {
      tx.table('cuentas').bulkAdd(CUENTAS_INICIALES)
      tx.table('categorias').bulkAdd(CATEGORIAS_INICIALES)
    })
  }
}

export const CUENTAS_INICIALES: Cuenta[] = [
  { nombre: 'Efectivo', tipo: 'efectivo', moneda: 'ARS', saldo_inicial: 0, orden: 1, archivada: false },
  { nombre: 'Banco', tipo: 'banco', moneda: 'ARS', saldo_inicial: 0, orden: 2, archivada: false },
  { nombre: 'Mercado Pago', tipo: 'billetera', moneda: 'ARS', saldo_inicial: 0, orden: 3, archivada: false },
  { nombre: 'Dólares', tipo: 'dolares', moneda: 'USD', saldo_inicial: 0, orden: 4, archivada: false },
]

const gasto = (nombre: string, grupo: Categoria['grupo'], icono: string, color: string): Categoria => ({
  nombre,
  tipo: 'gasto',
  grupo,
  icono,
  color,
  archivada: false,
})

export const CATEGORIAS_INICIALES: Categoria[] = [
  gasto('Súper y almacén', 'necesidad', '🛒', '#16a34a'),
  gasto('Delivery y salidas', 'gusto', '🍕', '#f97316'),
  gasto('Transporte', 'necesidad', '🚌', '#0ea5e9'),
  gasto('Alquiler y expensas', 'necesidad', '🏠', '#6366f1'),
  gasto('Servicios', 'necesidad', '💡', '#eab308'),
  gasto('Salud y prepaga', 'necesidad', '🩺', '#ef4444'),
  gasto('Suscripciones', 'gusto', '📺', '#a855f7'),
  gasto('Ropa', 'gusto', '👕', '#ec4899'),
  gasto('Educación', 'necesidad', '📚', '#14b8a6'),
  gasto('Regalos', 'gusto', '🎁', '#f43f5e'),
  gasto('Mascotas', 'necesidad', '🐾', '#a16207'),
  gasto('Imprevistos', 'necesidad', '⚠️', '#64748b'),
  { nombre: 'Sueldo', tipo: 'ingreso', grupo: 'ahorro', icono: '💼', color: '#059669', archivada: false },
  { nombre: 'Extras', tipo: 'ingreso', grupo: 'ahorro', icono: '✨', color: '#0d9488', archivada: false },
]

export const db = new BaseFinanzas()
