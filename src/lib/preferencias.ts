/** Configuración de "págate primero". Vive en localStorage (por dispositivo), no en la base. */
export interface PagatePrimero {
  activo: boolean
  /** 1 a 100 */
  porcentaje: number
  /** Alcancía a la que va el ahorro. */
  alcancia_id?: number
  /** Categoría de ingreso que dispara la propuesta (por defecto, Sueldo). */
  categoria_id?: number
}

const CLAVE = 'pagate_primero'

export function leerPagatePrimero(): PagatePrimero {
  try {
    const p = JSON.parse(localStorage.getItem(CLAVE) ?? '{}') as Partial<PagatePrimero>
    return {
      activo: p.activo ?? true,
      porcentaje: typeof p.porcentaje === 'number' && p.porcentaje > 0 && p.porcentaje <= 100 ? p.porcentaje : 20,
      alcancia_id: p.alcancia_id,
      categoria_id: p.categoria_id,
    }
  } catch {
    return { activo: true, porcentaje: 20 }
  }
}

export function guardarPagatePrimero(p: PagatePrimero) {
  localStorage.setItem(CLAVE, JSON.stringify(p))
}
