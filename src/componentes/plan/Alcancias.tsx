import { useState, type FormEvent } from 'react'
import { db } from '../../db/db'
import type { Alcancia } from '../../db/tipos'
import { centavosATexto, formatearMonto, parsearMonto } from '../../lib/dinero'
import { formatearFecha, hoyISO } from '../../lib/fechas'
import { progresoAlcancia } from '../../lib/plan'
import { guardarPagatePrimero, leerPagatePrimero, type PagatePrimero } from '../../lib/preferencias'
import { Barra } from '../Barra'
import { useAlcancias, useCategorias, useCuentas, useMovimientos } from '../datos'
import { FormMovimiento } from '../FormMovimiento'
import { Confirmar, Modal } from '../Modal'

type AlcanciaNueva = Omit<Alcancia, 'cuenta_id'> & { cuenta_id?: number }

export function Alcancias() {
  const alcancias = useAlcancias()
  const cuentas = useCuentas()
  const categorias = useCategorias()
  const movimientos = useMovimientos() ?? []
  const [editada, setEditada] = useState<AlcanciaNueva | null>(null)
  const [aportarA, setAportarA] = useState<Alcancia | null>(null)
  const [pref, setPref] = useState<PagatePrimero>(leerPagatePrimero)
  const hoy = hoyISO()

  const cambiarPref = (cambio: Partial<PagatePrimero>) => {
    const nueva = { ...pref, ...cambio }
    setPref(nueva)
    guardarPagatePrimero(nueva)
  }
  const ingresos = categorias.filter((c) => c.tipo === 'ingreso' && !c.archivada)
  const categoriaSueldo = pref.categoria_id ?? ingresos.find((c) => c.nombre === 'Sueldo')?.id ?? ingresos[0]?.id
  // Si no elegiste alcancía pero tenés una sola, va a esa (igual que en FormMovimiento).
  const alcanciaElegida = alcancias.find((a) => a.id === pref.alcancia_id) ?? (alcancias.length === 1 ? alcancias[0] : undefined)

  return (
    <section className="tarjeta">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Alcancías</h2>
        <button className="boton-secundario" onClick={() => setEditada({ nombre: '', meta_usd_centavos: 0 })}>
          + Nueva
        </button>
      </div>
      <p className="mb-3 text-xs text-slate-500">Metas de ahorro en dólares. Cada una junta la plata en su propia cuenta.</p>

      {alcancias.length === 0 && (
        <p className="text-sm text-slate-500">Todavía no tenés ninguna. Creá la primera: fondo de emergencia, un viaje, lo que quieras.</p>
      )}

      <ul className="space-y-4">
        {alcancias.map((a) => {
          const p = progresoAlcancia(a, cuentas, movimientos, hoy)
          return (
            <li key={a.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
              <div className="flex items-baseline justify-between gap-2">
                <button className="cursor-pointer text-left font-semibold underline-offset-2 hover:underline" onClick={() => setEditada(a)}>
                  🐷 {a.nombre}
                </button>
                <span className="text-sm tabular-nums">
                  <span className="font-semibold">{formatearMonto(p.ahorrado, 'USD')}</span>
                  <span className="text-slate-500"> de {formatearMonto(a.meta_usd_centavos, 'USD')}</span>
                </span>
              </div>
              <div className="mt-2">
                <Barra parte={p.parte} />
              </div>
              <div className="mt-2 flex items-end justify-between gap-3">
                <p className="text-xs text-slate-500">
                  {p.falta === 0 ? (
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">¡Meta cumplida! 🎉</span>
                  ) : (
                    <>
                      {Math.round(p.parte * 100)}% · faltan {formatearMonto(p.falta, 'USD')}
                      {a.fecha_objetivo && p.sugerenciaMensual !== null && (
                        <>
                          <br />
                          Para llegar al {formatearFecha(a.fecha_objetivo)}: separá{' '}
                          <strong className="text-slate-700 dark:text-slate-200">{formatearMonto(p.sugerenciaMensual, 'USD')}</strong> por mes
                          {a.fecha_objetivo < hoy && ' (la fecha ya pasó)'}
                        </>
                      )}
                    </>
                  )}
                </p>
                <button className="boton-primario shrink-0 px-3 py-1.5" onClick={() => setAportarA(a)}>
                  Aportar
                </button>
              </div>
            </li>
          )
        })}
      </ul>

      {alcancias.length > 0 && (
        <div className="mt-4 space-y-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
          <label className="flex items-center justify-between gap-2 font-semibold">
            Págate primero
            <input type="checkbox" className="h-5 w-5" checked={pref.activo} onChange={(e) => cambiarPref({ activo: e.target.checked })} />
          </label>
          <p className="text-xs text-slate-500">
            Al cargar el sueldo, te propongo separar un porcentaje para una alcancía antes de que se vaya en otra cosa.
          </p>
          {pref.activo && (
            <div className="grid grid-cols-[5.5rem_1fr] gap-2">
              <div>
                <label className="etiqueta" htmlFor="pp-pct">
                  % a separar
                </label>
                <input
                  id="pp-pct"
                  className="campo"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={100}
                  value={pref.porcentaje}
                  onChange={(e) => {
                    const n = Number(e.target.value)
                    if (n >= 1 && n <= 100) cambiarPref({ porcentaje: n })
                  }}
                />
              </div>
              <div>
                <label className="etiqueta" htmlFor="pp-alcancia">
                  Va a la alcancía
                </label>
                <select
                  id="pp-alcancia"
                  className="campo"
                  value={alcanciaElegida?.id ?? ''}
                  onChange={(e) => cambiarPref({ alcancia_id: e.target.value ? Number(e.target.value) : undefined })}
                >
                  <option value="">Elegí una…</option>
                  {alcancias.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-2">
                <label className="etiqueta" htmlFor="pp-categoria">
                  Cuando cargo un ingreso de
                </label>
                <select
                  id="pp-categoria"
                  className="campo"
                  value={categoriaSueldo ?? ''}
                  onChange={(e) => cambiarPref({ categoria_id: Number(e.target.value) })}
                >
                  {ingresos.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.icono} {c.nombre}
                    </option>
                  ))}
                </select>
              </div>
              {!alcanciaElegida && <p className="col-span-2 text-xs text-amber-600 dark:text-amber-400">Elegí una alcancía para que empiece a funcionar.</p>}
            </div>
          )}
        </div>
      )}

      {editada && <FormAlcancia alcancia={editada} onCerrar={() => setEditada(null)} />}
      {aportarA && <FormMovimiento preset={{ tipo: 'compra_usd', destinoId: aportarA.cuenta_id }} onCerrar={() => setAportarA(null)} />}
    </section>
  )
}

function FormAlcancia({ alcancia, onCerrar }: { alcancia: AlcanciaNueva; onCerrar: () => void }) {
  const cuentas = useCuentas()
  const alcancias = useAlcancias()
  const existe = alcancia.id != null
  const [nombre, setNombre] = useState(alcancia.nombre)
  const [metaTxt, setMetaTxt] = useState(alcancia.meta_usd_centavos ? centavosATexto(alcancia.meta_usd_centavos) : '')
  const [fecha, setFecha] = useState(alcancia.fecha_objetivo ?? '')
  /** '' = crear una cuenta nueva con el nombre de la alcancía. */
  const [cuentaId, setCuentaId] = useState(alcancia.cuenta_id != null ? String(alcancia.cuenta_id) : '')
  const [error, setError] = useState('')
  const [confirmar, setConfirmar] = useState(false)

  // Cuentas en dólares que no son de otra alcancía (dos alcancías no pueden contar la misma plata).
  const libres = cuentas.filter(
    (c) => c.moneda === 'USD' && !c.archivada && !alcancias.some((a) => a.cuenta_id === c.id && a.id !== alcancia.id),
  )

  async function guardar(e: FormEvent) {
    e.preventDefault()
    const meta = parsearMonto(metaTxt)
    if (!nombre.trim()) return setError('Ponele un nombre a la alcancía.')
    if (!meta || meta <= 0) return setError('Poné una meta mayor a cero.')
    await db.transaction('rw', db.cuentas, db.alcancias, async () => {
      let cuenta_id = cuentaId ? Number(cuentaId) : undefined
      if (cuenta_id == null) {
        const orden = Math.max(0, ...(await db.cuentas.toArray()).map((c) => c.orden)) + 1
        cuenta_id = await db.cuentas.add({ nombre: nombre.trim(), tipo: 'dolares', moneda: 'USD', saldo_inicial: 0, orden, archivada: false })
      }
      await db.alcancias.put({
        ...(existe && { id: alcancia.id }),
        nombre: nombre.trim(),
        meta_usd_centavos: meta,
        fecha_objetivo: fecha || undefined,
        cuenta_id: cuenta_id!,
      })
    })
    onCerrar()
  }

  return (
    <Modal titulo={existe ? 'Editar alcancía' : 'Nueva alcancía'} onCerrar={onCerrar}>
      <form onSubmit={guardar} className="space-y-4">
        <div>
          <label className="etiqueta" htmlFor="a-nombre">Nombre</label>
          <input id="a-nombre" className="campo" placeholder="Fondo de emergencia" value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus={!existe} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="etiqueta" htmlFor="a-meta">Meta en dólares</label>
            <input id="a-meta" className="campo" inputMode="decimal" autoComplete="off" placeholder="1000" value={metaTxt} onChange={(e) => setMetaTxt(e.target.value)} />
          </div>
          <div>
            <label className="etiqueta" htmlFor="a-fecha">Para cuándo (opcional)</label>
            <input id="a-fecha" type="date" className="campo" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="etiqueta" htmlFor="a-cuenta">Dónde se junta la plata</label>
          <select id="a-cuenta" className="campo" value={cuentaId} onChange={(e) => setCuentaId(e.target.value)}>
            <option value="">Crear una cuenta nueva en dólares</option>
            {libres.map((c) => (
              <option key={c.id} value={c.id}>
                Usar la cuenta "{c.nombre}"
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-500">El progreso es el saldo de esa cuenta: sube cuando comprás o transferís dólares ahí.</p>
        </div>
        {error && <p role="alert" className="text-sm font-medium text-red-600">{error}</p>}
        <div className="flex gap-2">
          {existe && (
            <button type="button" className="boton-secundario text-red-600 dark:text-red-400" onClick={() => setConfirmar(true)}>
              Borrar
            </button>
          )}
          <button type="submit" className="boton-primario flex-1">Guardar</button>
        </div>
      </form>
      {confirmar && (
        <Confirmar
          titulo={`¿Borrar la alcancía "${alcancia.nombre}"?`}
          mensaje="Se borra solo la meta. La cuenta y la plata que juntaste quedan como están."
          onCancelar={() => setConfirmar(false)}
          onConfirmar={async () => {
            await db.alcancias.delete(alcancia.id!)
            onCerrar()
          }}
        />
      )}
    </Modal>
  )
}
