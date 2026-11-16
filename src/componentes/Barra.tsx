import type { NivelPresupuesto } from '../lib/plan'

const COLOR: Record<NivelPresupuesto, string> = { ok: 'bg-emerald-500', aviso: 'bg-amber-500', pasado: 'bg-red-500' }
export const TEXTO_NIVEL: Record<NivelPresupuesto, string> = {
  ok: 'text-emerald-600 dark:text-emerald-400',
  aviso: 'text-amber-600 dark:text-amber-400',
  pasado: 'text-red-600 dark:text-red-400',
}

/** Barra de progreso. `parte` va de 0 a 1 (si se pasa, se dibuja llena). */
export function Barra({ parte, nivel = 'ok' }: { parte: number; nivel?: NivelPresupuesto }) {
  const pct = Math.max(0, Math.min(1, parte)) * 100
  return (
    <div
      className="h-2 rounded-full bg-slate-100 dark:bg-slate-800"
      role="progressbar"
      aria-valuenow={Math.round(parte * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className={`h-full rounded-full ${COLOR[nivel]}`} style={{ width: `${pct}%` }} />
    </div>
  )
}
