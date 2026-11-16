import { useMemo, useState } from 'react'
import { useCategorias, useCuentas, useMovimientos } from '../componentes/datos'
import { FormMovimiento } from '../componentes/FormMovimiento'
import type { Movimiento } from '../db/tipos'
import { formatearMonto } from '../lib/dinero'
import { fechaConDia, hoyISO, mesDe, nombreMes } from '../lib/fechas'

const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export default function Movimientos() {
  const cuentas = useCuentas()
  const categorias = useCategorias()
  const movimientos = useMovimientos()
  const [busqueda, setBusqueda] = useState('')
  const [mes, setMes] = useState(mesDe(hoyISO()))
  const [categoriaId, setCategoriaId] = useState('')
  const [editado, setEditado] = useState<Movimiento | null>(null)

  const nombreCuenta = (id?: number) => cuentas.find((c) => c.id === id)?.nombre ?? '(cuenta borrada)'

  /** Título, ícono y monto con signo de cada fila. */
  const describir = (m: Movimiento) => {
    const cat = categorias.find((c) => c.id === m.categoria_id)
    if (m.tipo === 'transferencia') {
      return { icono: '🔁', titulo: `${nombreCuenta(m.cuenta_id)} → ${nombreCuenta(m.cuenta_destino_id)}`, detalle: 'Transferencia', monto: formatearMonto(m.monto_centavos, m.moneda), color: 'text-slate-500' }
    }
    if (m.tipo === 'compra_usd') {
      return {
        icono: '💱',
        titulo: `Compra de ${formatearMonto(m.monto_destino_centavos ?? 0, 'USD')}`,
        detalle: `${nombreCuenta(m.cuenta_id)} → ${nombreCuenta(m.cuenta_destino_id)}`,
        monto: formatearMonto(m.monto_centavos, 'ARS'),
        color: 'text-slate-500',
      }
    }
    const ingreso = m.tipo === 'ingreso'
    return {
      icono: cat?.icono ?? '❓',
      titulo: cat?.nombre ?? 'Sin categoría',
      detalle: nombreCuenta(m.cuenta_id),
      monto: (ingreso ? '+' : '-') + formatearMonto(m.monto_centavos, m.moneda),
      color: ingreso ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-900 dark:text-slate-100',
    }
  }

  const meses = useMemo(() => {
    const s = new Set((movimientos ?? []).map((m) => mesDe(m.fecha)))
    s.add(mesDe(hoyISO()))
    return [...s].sort().reverse()
  }, [movimientos])

  if (!movimientos) return null

  const q = sinAcentos(busqueda.trim())
  const filtrados = movimientos
    .filter((m) => !mes || mesDe(m.fecha) === mes)
    .filter((m) => !categoriaId || m.categoria_id === Number(categoriaId))
    .filter((m) => {
      if (!q) return true
      const d = describir(m)
      return sinAcentos(`${m.nota} ${d.titulo} ${d.detalle} ${d.monto}`).includes(q)
    })
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || (b.id ?? 0) - (a.id ?? 0))

  // Agrupados por día, del más nuevo al más viejo.
  const porDia: [string, Movimiento[]][] = []
  for (const m of filtrados) {
    const ultimo = porDia[porDia.length - 1]
    if (ultimo && ultimo[0] === m.fecha) ultimo[1].push(m)
    else porDia.push([m.fecha, [m]])
  }

  return (
    <div className="space-y-4">
      <div className="tarjeta space-y-2">
        <input
          type="search"
          className="campo"
          placeholder="Buscar por nota, categoría o cuenta…"
          aria-label="Buscar movimientos"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
        <div className="grid grid-cols-2 gap-2">
          <select className="campo" aria-label="Filtrar por mes" value={mes} onChange={(e) => setMes(e.target.value)}>
            <option value="">Todos los meses</option>
            {meses.map((m) => (
              <option key={m} value={m}>
                {nombreMes(m)}
              </option>
            ))}
          </select>
          <select className="campo" aria-label="Filtrar por categoría" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
            <option value="">Todas las categorías</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icono} {c.nombre}
              </option>
            ))}
          </select>
        </div>
        <p className="text-xs text-slate-500">
          {filtrados.length === 1 ? '1 movimiento' : `${filtrados.length} movimientos`} · tocá uno para editarlo o borrarlo
        </p>
      </div>

      {filtrados.length === 0 && (
        <div className="tarjeta text-center text-slate-500">
          {movimientos.length === 0 ? 'Todavía no cargaste nada. Tocá el botón + para empezar.' : 'No hay movimientos con esos filtros.'}
        </div>
      )}

      {porDia.map(([fecha, lista]) => (
        <section key={fecha}>
          <h3 className="mb-1 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{fechaConDia(fecha)}</h3>
          <ul className="tarjeta divide-y divide-slate-100 py-1 dark:divide-slate-800">
            {lista.map((m) => {
              const d = describir(m)
              return (
                <li key={m.id}>
                  <button onClick={() => setEditado(m)} className="flex w-full cursor-pointer items-center gap-3 py-2.5 text-left">
                    <span className="text-2xl">{d.icono}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{d.titulo}</span>
                      <span className="block truncate text-xs text-slate-500">
                        {d.detalle}
                        {m.nota && ` · ${m.nota}`}
                      </span>
                    </span>
                    <span className={`whitespace-nowrap font-semibold tabular-nums ${d.color}`}>{d.monto}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      ))}

      {editado && <FormMovimiento movimiento={editado} onCerrar={() => setEditado(null)} />}
    </div>
  )
}
