const dos = (n: number) => String(n).padStart(2, '0')

/** Fecha local como AAAA-MM-DD. */
export function aISO(d: Date): string {
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`
}

export function hoyISO(): string {
  return aISO(new Date())
}

/** "2026-11-16" -> "16/11/2026" */
export function formatearFecha(iso: string): string {
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a}`
}

/** "2026-11-16" -> "2026-11" */
export function mesDe(iso: string): string {
  return iso.slice(0, 7)
}

/** Suma (o resta) meses a un mes "AAAA-MM". */
export function sumarMeses(mes: string, n: number): string {
  const [a, m] = mes.split('-').map(Number)
  const total = a * 12 + (m - 1) + n
  return `${Math.floor(total / 12)}-${dos((total % 12) + 1)}`
}

export function mesAnterior(mes: string): string {
  return sumarMeses(mes, -1)
}

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

/** "2026-11" -> "Noviembre 2026" */
export function nombreMes(mes: string): string {
  const [a, m] = mes.split('-').map(Number)
  const n = MESES[m - 1]
  return `${n[0].toUpperCase()}${n.slice(1)} ${a}`
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

/** "2026-11-16" -> "lunes 16/11/2026" */
export function fechaConDia(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number)
  return `${DIAS[new Date(a, m - 1, d).getDay()]} ${formatearFecha(iso)}`
}
