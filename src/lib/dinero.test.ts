import { describe, expect, it } from 'vitest'
import { arsAUsd, centavosATexto, convertir, formatearMonto, parsearMonto, usdAArs } from './dinero'

describe('parsearMonto', () => {
  it('entiende el formato argentino', () => {
    expect(parsearMonto('12.345,67')).toBe(1234567)
    expect(parsearMonto('12345,67')).toBe(1234567)
    expect(parsearMonto('$ 1.500')).toBe(150000)
    expect(parsearMonto('1.234.567')).toBe(123456700)
    expect(parsearMonto('0,5')).toBe(50)
  })
  it('acepta punto decimal cuando no puede ser de miles', () => {
    expect(parsearMonto('12345.67')).toBe(1234567)
    expect(parsearMonto('12.5')).toBe(1250)
  })
  it('no pierde centavos por coma flotante', () => {
    expect(parsearMonto('0,29')).toBe(29)
    expect(parsearMonto('1,15')).toBe(115)
    expect(parsearMonto('4,35')).toBe(435)
  })
  it('rechaza lo que no es un monto', () => {
    expect(parsearMonto('')).toBeNull()
    expect(parsearMonto('abc')).toBeNull()
    expect(parsearMonto('-100')).toBeNull()
    expect(parsearMonto('1,234')).toBeNull()
  })
})

describe('formatearMonto', () => {
  it('pesos como "$ 12.345,67"', () => {
    expect(formatearMonto(1234567, 'ARS')).toBe('$ 12.345,67')
    expect(formatearMonto(0, 'ARS')).toBe('$ 0,00')
    expect(formatearMonto(5, 'ARS')).toBe('$ 0,05')
    expect(formatearMonto(100000000, 'ARS')).toBe('$ 1.000.000,00')
  })
  it('dólares como "US$ 1.234", con decimales solo si hacen falta', () => {
    expect(formatearMonto(123400, 'USD')).toBe('US$ 1.234')
    expect(formatearMonto(123450, 'USD')).toBe('US$ 1.234,50')
  })
  it('negativos', () => {
    expect(formatearMonto(-150000, 'ARS')).toBe('-$ 1.500,00')
    expect(formatearMonto(-20000, 'USD')).toBe('-US$ 200')
  })
  it('centavosATexto es reversible con parsearMonto', () => {
    for (const c of [0, 5, 50, 100, 1234567, 99999]) {
      expect(parsearMonto(centavosATexto(c) || '0')).toBe(c)
    }
  })
})

describe('conversiones ARS/USD', () => {
  it('pesos a dólares', () => {
    // $ 150.000,00 a $ 1.500 por dólar = US$ 100
    expect(arsAUsd(15000000, 1500)).toBe(10000)
    // $ 1.000,00 a $ 1.234,50 = US$ 0,81 (redondeado al centavo)
    expect(arsAUsd(100000, 1234.5)).toBe(81)
  })
  it('dólares a pesos', () => {
    expect(usdAArs(10000, 1500)).toBe(15000000)
    expect(usdAArs(12345, 1234.5)).toBe(15239903) // 123,45 × 1234,5 = 152.399,025
  })
  it('siempre devuelve enteros', () => {
    for (const cot of [999.99, 1234.5, 1480.33]) {
      expect(Number.isInteger(arsAUsd(1234567, cot))).toBe(true)
      expect(Number.isInteger(usdAArs(1234567, cot))).toBe(true)
    }
  })
  it('convertir deja igual la misma moneda', () => {
    expect(convertir(500, 'ARS', 'ARS', 1500)).toBe(500)
    expect(convertir(500, 'USD', 'USD', 1500)).toBe(500)
    expect(convertir(150000, 'ARS', 'USD', 1500)).toBe(100)
    expect(convertir(100, 'USD', 'ARS', 1500)).toBe(150000)
  })
  it('rechaza cotizaciones inválidas', () => {
    expect(() => arsAUsd(100, 0)).toThrow()
    expect(() => usdAArs(100, NaN)).toThrow()
  })
})
