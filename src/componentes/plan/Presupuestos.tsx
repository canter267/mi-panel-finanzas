import { useState, type FormEvent } from 'react'
import { db } from '../../db/db'
import type { Categoria, Moneda, Presupuesto } from '../../db/tipos'
import { centavosATexto, formatearMonto, parsearMonto } from '../../lib/dinero'
import { hoyISO, mesDe, nombreMes } from '../../lib/fechas'
import { estadoPresupuestos } from '../../lib/plan'
import { Barra, TEXTO_NIVEL } from '../Barra'
import { useCategorias, useMovimientos, usePresupuestos } from '../datos'
import { Modal } from '../Modal'

export function Presupuestos() {
  const categorias = useCategorias()
  const presupuestos = usePresupuestos()
  const movimientos = useMovimientos() ?? []
  const [editada, setEditada] = useState<Categoria | null>(null)
  const mes = mesDe(hoyISO())

  const estados = estadoPresupuestos(presupuestos, movimientos, mes)
  const deGasto = categorias.filter((c) => c.tipo === 'gasto' && !c.archivada)
  const conTope = deGasto.filter((c) => estados.some((e) => e.presupuesto.categoria_id === c.id))
  const sinTope = deGasto.filter((c) => !conTope.includes(c))

  return (
    <section className="tarjeta">
      <h2 className="text-lg font-bold">Presupuestos</h2>
      <p className="mb-3 text-xs text-slate-500">
        Tope de gasto por categoría para {nombreMes(mes).toLowerCase()}. Se mantiene los meses siguientes hasta que lo cambies.
      </p>

      {conTope.length === 0 && <p className="mb-3 text-sm text-slate-500">Todavía no pusiste ningún tope. Elegí una categoría de abajo.</p>}

      <ul className="space-y-3">
        {conTope.map((c) => {
          const e = estados.find((x) => x.presupuesto.categoria_id === c.id)!
          const { tope_centavos: tope, moneda } = e.presupuesto
          const resto = tope - e.gastado
          return (
            <li key={c.id}>
              <button className="w-full cursor-pointer text-left" onClick={() => setEditada(c)}>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="font-medium">
                    {c.icono} {c.nombre}
                  </span>
                  <span className="tabular-nums">
                    <span className={`font-semibold ${TEXTO_NIVEL[e.nivel]}`}>{formatearMonto(e.gastado, moneda)}</span>
                    <span className="text-slate-500"> de {formatearMonto(tope, moneda)}</span>
                  </span>
                </div>
                <div className="mt-1">
                  <Barra parte={e.gastado / tope} nivel={e.nivel} />
                </div>
                <p className={`mt-0.5 text-xs ${e.nivel === 'ok' ? 'text-slate-500' : TEXTO_NIVEL[e.nivel]}`}>
                  {e.nivel === 'pasado'
                    ? resto === 0
                      ? 'Llegaste al tope.'
                      : `Te pasaste por ${formatearMonto(-resto, moneda)}.`
                    : `${e.nivel === 'aviso' ? 'Ojo: ' : ''}te quedan ${formatearMonto(resto, moneda)} (${Math.round((e.gastado / tope) * 100)}% usado).`}
                </p>
              </button>
            </li>
          )
        })}
      </ul>

      {sinTope.length > 0 && (
        <div className="mt-4">
          <p className="etiqueta">Poner tope a…</p>
          <div className="flex flex-wrap gap-2">
            {sinTope.map((c) => (
              <button
                key={c.id}
                onClick={() => setEditada(c)}
                className="cursor-pointer rounded-full border border-slate-200 px-3 py-1 text-sm dark:border-slate-700"
              >
                {c.icono} {c.nombre}
              </button>
            ))}
          </div>
        </div>
      )}

      {editada && (
        <FormPresupuesto
          categoria={editada}
          mes={mes}
          actual={estados.find((e) => e.presupuesto.categoria_id === editada.id)?.presupuesto}
          onCerrar={() => setEditada(null)}
        />
      )}
    </section>
  )
}

function FormPresupuesto({ categoria, mes, actual, onCerrar }: { categoria: Categoria; mes: string; actual?: Presupuesto; onCerrar: () => void }) {
  const [topeTxt, setTopeTxt] = useState(actual ? centavosATexto(actual.tope_centavos) : '')
  const [moneda, setMoneda] = useState<Moneda>(actual?.moneda ?? 'ARS')
  const [error, setError] = useState('')

  // Se guarda con el mes actual: los meses anteriores conservan el tope que tenían.
  const guardarTope = async (tope: number) => {
    await db.presupuestos.put({ mes, categoria_id: categoria.id!, tope_centavos: tope, moneda })
    onCerrar()
  }

  function guardar(e: FormEvent) {
    e.preventDefault()
    const tope = parsearMonto(topeTxt)
    if (!tope || tope <= 0) return setError('Poné un tope mayor a cero.')
    void guardarTope(tope)
  }

  return (
    <Modal titulo={`Presupuesto: ${categoria.icono} ${categoria.nombre}`} onCerrar={onCerrar}>
      <form onSubmit={guardar} className="space-y-4">
        <div>
          <label className="etiqueta" htmlFor="tope">
            Tope por mes
          </label>
          <div className="flex gap-2">
            <select className="campo w-28" aria-label="Moneda del tope" value={moneda} onChange={(e) => setMoneda(e.target.value as Moneda)}>
              <option value="ARS">$</option>
              <option value="USD">US$</option>
            </select>
            <input
              id="tope"
              className="campo text-xl font-bold"
              inputMode="decimal"
              autoComplete="off"
              autoFocus
              placeholder="0,00"
              value={topeTxt}
              onChange={(e) => setTopeTxt(e.target.value)}
            />
          </div>
          <p className="mt-1 text-xs text-slate-500">Te aviso cuando llegues al 80% y cuando te pases.</p>
        </div>
        {error && <p role="alert" className="text-sm font-medium text-red-600">{error}</p>}
        <div className="flex gap-2">
          {actual && (
            <button type="button" className="boton-secundario" onClick={() => guardarTope(0)}>
              Quitar tope
            </button>
          )}
          <button type="submit" className="boton-primario flex-1">
            Guardar
          </button>
        </div>
      </form>
    </Modal>
  )
}
