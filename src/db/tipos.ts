export type Moneda = 'ARS' | 'USD'
export type TipoCuenta = 'efectivo' | 'banco' | 'billetera' | 'dolares'
export type TipoCategoria = 'gasto' | 'ingreso'
export type Grupo = 'necesidad' | 'gusto' | 'ahorro'
export type TipoMovimiento = 'gasto' | 'ingreso' | 'transferencia' | 'compra_usd'
export type Casa = 'oficial' | 'blue' | 'bolsa' | 'tarjeta'

export const CASAS: Casa[] = ['bolsa', 'oficial', 'blue', 'tarjeta']
export const NOMBRE_CASA: Record<Casa, string> = {
  bolsa: 'MEP',
  oficial: 'Oficial',
  blue: 'Blue',
  tarjeta: 'Tarjeta',
}

export interface Cuenta {
  id?: number
  nombre: string
  tipo: TipoCuenta
  moneda: Moneda
  /** En centavos, en la moneda de la cuenta. */
  saldo_inicial: number
  orden: number
  archivada: boolean
  ejemplo?: boolean
}

export interface Categoria {
  id?: number
  nombre: string
  tipo: TipoCategoria
  grupo: Grupo
  icono: string
  color: string
  archivada: boolean
  ejemplo?: boolean
}

export interface Movimiento {
  id?: number
  /** AAAA-MM-DD, fecha local. */
  fecha: string
  tipo: TipoMovimiento
  /** Entero, en la moneda del movimiento (la de cuenta_id). */
  monto_centavos: number
  moneda: Moneda
  cuenta_id: number
  /** Solo transferencia y compra_usd. */
  cuenta_destino_id?: number
  /** Entero, en la moneda de la cuenta destino. */
  monto_destino_centavos?: number
  /** Solo gasto e ingreso. */
  categoria_id?: number
  nota: string
  /** Pesos por dólar usados al cargar el movimiento (regla 2). */
  cotizacion: number
  casa_cotizacion: Casa | 'manual'
  // Fase 2
  compra_id?: string
  cuota_n?: number
  cuotas_total?: number
  recurrente_id?: number
  creado: string
  editado: string
  ejemplo?: boolean
}

export interface Cotizacion {
  /** AAAA-MM-DD */
  fecha: string
  casa: Casa
  compra: number
  venta: number
}

// Fase 2: las tablas existen para no tener que migrar la base después.
export interface Presupuesto {
  mes: string
  categoria_id: number
  tope_centavos: number
  moneda: Moneda
}
export interface Alcancia {
  id?: number
  nombre: string
  meta_usd_centavos: number
  fecha_objetivo?: string
  cuenta_id?: number
}
export interface Recurrente {
  id?: number
  plantilla: Partial<Movimiento>
  frecuencia: 'mensual'
  dia_del_mes: number
  activo: boolean
}
