export type Tema = 'sistema' | 'claro' | 'oscuro'

export function temaGuardado(): Tema {
  const t = localStorage.getItem('tema')
  return t === 'claro' || t === 'oscuro' ? t : 'sistema'
}

/** Guarda la preferencia y pone o saca la clase "dark" de <html>. */
export function aplicarTema(tema: Tema) {
  localStorage.setItem('tema', tema)
  const oscuro = tema === 'oscuro' || (tema === 'sistema' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', oscuro)
}
