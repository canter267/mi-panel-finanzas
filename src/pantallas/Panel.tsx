import { useState } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts'
import { useCategorias, useCuentas, useMovimientos } from '../componentes/datos'
import type { Moneda } from '../db/tipos'
import {
  gastosPorCategoria,
  gastosPorGrupo,
  saldoTotal,
  tasaDeAhorro,
  totalesDelMes,
  variacion,
  type Doble,
} from '../lib/calculos'
import { formatearMonto } from '../lib/dinero'
import { hoyISO, mesAnterior, mesDe, nombreMes, sumarMeses } from '../lib/fechas'

const porciento = (x: number) => `${Math.round(x * 100)}%`

export default function Panel() {
  const cuentas = useCuentas()
  const categorias = useCategorias()
  const movimientos = useMovimientos()
  const [mes, setMes] = useState(mesDe(hoyISO()))
  const [moneda, setMoneda] = useState<Moneda>('ARS')

  if (!movimientos) return null

  const clave = moneda === 'ARS' ? 'ars' : 'usd'
  const ver = (d: Doble) => formatearMonto(d[clave], moneda)

  const t = totalesDelMes(movimientos, mes)
  const previo = totalesDelMes(movimientos, mesAnterior(mes))
  const tasa = tasaDeAhorro(t.ingresos[clave], t.gastos[clave])
  const tasaPrevia = tasaDeAhorro(previo.ingresos[clave], previo.gastos[clave])
  const porCategoria = gastosPorCategoria(movimientos, mes)
  const porGrupo = gastosPorGrupo(movimientos, mes, categorias)
  const ahorradoUsd = saldoTotal(cuentas, movimientos, 'USD')
  const enPesos = saldoTotal(cuentas, movimientos, 'ARS')
  const nombreMesPrevio = nombreMes(mesAnterior(mes)).split(' ')[0].toLowerCase()

  const datosTorta = porCategoria.map((g) => {
    const c = categorias.find((x) => x.id === g.categoria_id)
    return { nombre: c?.nombre ?? 'Sin categoría', icono: c?.icono ?? '❓', color: c?.color ?? '#94a3b8', valor: g.total[clave], total: g.total }
  })
  const hayDatos = t.ingresos.ars > 0 || t.gastos.ars > 0

  /** Flechita de comparación. subirEsBueno=false para gastos: gastar más va en rojo. */
  const comparar = (actual: number, anterior: number, subirEsBueno: boolean) => {
    const v = variacion(actual, anterior)
    if (v === null) return <span className="text-xs text-slate-400">sin datos de {nombreMesPrevio}</span>
    const bueno = v === 0 ? null : v > 0 === subirEsBueno
    return (
      <span className={`text-xs ${bueno === null ? 'text-slate-400' : bueno ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
        {v > 0 ? '▲' : v < 0 ? '▼' : '='} {porciento(Math.abs(v))} vs. {nombreMesPrevio}
      </span>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button aria-label="Mes anterior" className="boton-secundario px-3" onClick={() => setMes(sumarMeses(mes, -1))}>
            ‹
          </button>
          <h2 className="min-w-36 text-center text-lg font-bold">{nombreMes(mes)}</h2>
          <button aria-label="Mes siguiente" className="boton-secundario px-3" onClick={() => setMes(sumarMeses(mes, 1))}>
            ›
          </button>
        </div>
        <div className="flex rounded-xl bg-slate-200 p-1 dark:bg-slate-800">
          {(['ARS', 'USD'] as Moneda[]).map((m) => (
            <button
              key={m}
              aria-pressed={moneda === m}
              onClick={() => setMoneda(m)}
              className={`cursor-pointer rounded-lg px-3 py-1.5 text-sm font-semibold ${
                moneda === m ? 'bg-white text-emerald-700 shadow-sm dark:bg-slate-600 dark:text-emerald-300' : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {m === 'ARS' ? '$' : 'US$'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="tarjeta">
          <p className="text-sm text-slate-500">Ingresos</p>
          <p className="text-lg font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{ver(t.ingresos)}</p>
          {comparar(t.ingresos[clave], previo.ingresos[clave], true)}
        </div>
        <div className="tarjeta">
          <p className="text-sm text-slate-500">Gastos</p>
          <p className="text-lg font-bold tabular-nums text-red-600 dark:text-red-400">{ver(t.gastos)}</p>
          {comparar(t.gastos[clave], previo.gastos[clave], false)}
        </div>
        <div className="tarjeta">
          <p className="text-sm text-slate-500">Ahorro del mes</p>
          <p className={`text-lg font-bold tabular-nums ${t.ahorro[clave] < 0 ? 'text-red-600 dark:text-red-400' : ''}`}>{ver(t.ahorro)}</p>
          {comparar(t.ahorro[clave], previo.ahorro[clave], true)}
        </div>
        <div className="tarjeta">
          <p className="text-sm text-slate-500">Tasa de ahorro</p>
          <p className={`text-lg font-bold tabular-nums ${tasa !== null && tasa < 0 ? 'text-red-600 dark:text-red-400' : ''}`}>
            {tasa === null ? '—' : porciento(tasa)}
          </p>
          <span className="text-xs text-slate-400">
            {tasa === null ? 'sin ingresos este mes' : tasaPrevia === null ? `sin datos de ${nombreMesPrevio}` : `${porciento(tasaPrevia)} en ${nombreMesPrevio}`}
          </span>
        </div>
      </div>

      <div className="tarjeta flex items-center justify-between gap-3 bg-emerald-600 text-white dark:bg-emerald-700">
        <div>
          <p className="text-sm opacity-90">Total ahorrado en dólares</p>
          <p className="text-2xl font-bold tabular-nums">{formatearMonto(ahorradoUsd, 'USD')}</p>
        </div>
        <div className="text-right">
          <p className="text-sm opacity-90">En pesos</p>
          <p className="font-semibold tabular-nums">{formatearMonto(enPesos, 'ARS')}</p>
        </div>
      </div>

      {!hayDatos ? (
        <div className="tarjeta text-center text-slate-500">
          <p className="text-3xl">🧾</p>
          <p className="mt-1">No hay ingresos ni gastos en {nombreMes(mes).toLowerCase()}.</p>
          <p className="text-sm">Tocá el botón + para cargar el primero.</p>
        </div>
      ) : (
        <>
          <section className="tarjeta">
            <h3 className="mb-2 font-bold">Gastos por categoría</h3>
            {datosTorta.length === 0 ? (
              <p className="text-sm text-slate-500">Todavía no cargaste gastos este mes.</p>
            ) : (
              <>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={datosTorta} dataKey="valor" nameKey="nombre" innerRadius="55%" outerRadius="95%" paddingAngle={1} stroke="none" isAnimationActive={false}>
                        {datosTorta.map((d) => (
                          <Cell key={d.nombre} fill={d.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul className="mt-3 space-y-2.5">
                  {datosTorta.map((d) => {
                    const parte = t.gastos[clave] > 0 ? d.valor / t.gastos[clave] : 0
                    return (
                      <li key={d.nombre}>
                        <div className="flex items-baseline justify-between gap-2 text-sm">
                          <span>
                            {d.icono} {d.nombre}
                          </span>
                          <span className="tabular-nums">
                            <span className="font-semibold">{ver(d.total)}</span>
                            <span className="ml-2 inline-block w-9 text-right text-slate-500">{porciento(parte)}</span>
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800">
                          <div className="h-full rounded-full" style={{ width: `${parte * 100}%`, backgroundColor: d.color }} />
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </>
            )}
          </section>

          <section className="tarjeta">
            <h3 className="font-bold">Regla 50/30/20</h3>
            <p className="mb-3 text-xs text-slate-500">Cuánto de lo que entró se fue a cada cosa, contra la meta sugerida.</p>
            {t.ingresos[clave] <= 0 ? (
              <p className="text-sm text-slate-500">Cargá un ingreso este mes para poder comparar.</p>
            ) : (
              <div className="space-y-3">
                {(
                  [
                    { nombre: 'Necesidades', valor: porGrupo.necesidad[clave], meta: 0.5, tope: true },
                    { nombre: 'Gustos', valor: porGrupo.gusto[clave], meta: 0.3, tope: true },
                    {
                      nombre: 'Ahorro',
                      valor: t.ingresos[clave] - porGrupo.necesidad[clave] - porGrupo.gusto[clave],
                      meta: 0.2,
                      tope: false,
                    },
                  ] as const
                ).map((g) => {
                  const parte = g.valor / t.ingresos[clave]
                  const bien = g.tope ? parte <= g.meta : parte >= g.meta
                  return (
                    <div key={g.nombre}>
                      <div className="flex justify-between text-sm">
                        <span>{g.nombre}</span>
                        <span className="tabular-nums">
                          <span className={`font-semibold ${bien ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                            {porciento(parte)}
                          </span>
                          <span className="text-slate-500"> · meta {g.tope ? 'hasta' : 'desde'} {porciento(g.meta)}</span>
                        </span>
                      </div>
                      <div className="relative mt-1 h-2 rounded-full bg-slate-100 dark:bg-slate-800">
                        <div
                          className={`h-full rounded-full ${bien ? 'bg-emerald-500' : 'bg-amber-500'}`}
                          style={{ width: `${Math.max(0, Math.min(1, parte)) * 100}%` }}
                        />
                        <div className="absolute -top-0.5 h-3 w-0.5 bg-slate-500" style={{ left: `${g.meta * 100}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
