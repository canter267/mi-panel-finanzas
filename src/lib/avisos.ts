/** Cartelito que aparece abajo unos segundos (o hasta tocar el botón, si trae una acción). */
export interface Aviso {
  texto: string
  tono?: 'info' | 'alerta' | 'peligro'
  accion?: { nombre: string; hacer: () => void }
}

const EVENTO = 'aviso-panel'

export function avisar(aviso: Aviso | string) {
  const detalle: Aviso = typeof aviso === 'string' ? { texto: aviso } : aviso
  window.dispatchEvent(new CustomEvent<Aviso>(EVENTO, { detail: detalle }))
}

/** Devuelve la función para dejar de escuchar. */
export function escucharAvisos(alLlegar: (a: Aviso) => void): () => void {
  const manejar = (e: Event) => alLlegar((e as CustomEvent<Aviso>).detail)
  window.addEventListener(EVENTO, manejar)
  return () => window.removeEventListener(EVENTO, manejar)
}
