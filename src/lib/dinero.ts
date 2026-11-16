import type { Moneda } from '../db/tipos'

/**
 * Convierte lo que tipea el usuario a centavos enteros, sin pasar por coma flotante.
 * Acepta "12.345,67", "12345,67", "12345.67", "1500", "$ 1.500".
 * Devuelve null si no es un monto válido.
 */
export function parsearMonto(texto: string): number | null {
  let t = texto.replace(/[\s$]|US/gi, '')
  if (t === '') return null
  if (t.includes(',')) {
    // Formato argentino: los puntos son de miles y la coma es decimal.
    t = t.replace(/\./g, '').replace(',', '.')
  } else if (/^\d{1,3}(\.\d{3})+$/.test(t)) {
    // "12.345" o "1.234.567": puntos de miles, sin decimales.
    t = t.replace(/\./g, '')
  }
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(t)
  if (!m) return null
  const centavos = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'))
  return Number.isSafeInteger(centavos) ? centavos : null
}

function conMiles(entero: number): string {
  return String(entero).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

/** "$ 12.345,67" para pesos; "US$ 1.234" para dólares (con decimales solo si hacen falta). */
export function formatearMonto(centavos: number, moneda: Moneda): string {
  const abs = Math.abs(Math.round(centavos))
  const entero = Math.floor(abs / 100)
  const dec = String(abs % 100).padStart(2, '0')
  const signo = centavos < 0 && abs !== 0 ? '-' : ''
  if (moneda === 'USD') {
    return `${signo}US$ ${conMiles(entero)}${dec === '00' ? '' : ',' + dec}`
  }
  return `${signo}$ ${conMiles(entero)},${dec}`
}

/** Para precargar un campo de texto: 1234567 -> "12345,67". */
export function centavosATexto(centavos: number): string {
  const abs = Math.abs(centavos)
  const dec = abs % 100
  return `${Math.floor(abs / 100)}${dec ? ',' + String(dec).padStart(2, '0') : ''}`
}

/** Cotización como "$ 1.234,50" (pesos por dólar). */
export function formatearCotizacion(pesosPorDolar: number): string {
  return formatearMonto(Math.round(pesosPorDolar * 100), 'ARS')
}

/** Centavos de peso -> centavos de dólar, a una cotización en pesos por dólar. */
export function arsAUsd(centavosArs: number, cotizacion: number): number {
  if (!(cotizacion > 0)) throw new Error('Cotización inválida')
  return Math.round(centavosArs / cotizacion)
}

/** Centavos de dólar -> centavos de peso, a una cotización en pesos por dólar. */
export function usdAArs(centavosUsd: number, cotizacion: number): number {
  if (!(cotizacion > 0)) throw new Error('Cotización inválida')
  return Math.round(centavosUsd * cotizacion)
}

/** Convierte un monto entre monedas (o lo deja igual si es la misma). */
export function convertir(centavos: number, de: Moneda, a: Moneda, cotizacion: number): number {
  if (de === a) return centavos
  return de === 'ARS' ? arsAUsd(centavos, cotizacion) : usdAArs(centavos, cotizacion)
}
