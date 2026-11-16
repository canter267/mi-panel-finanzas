import { useState, type FormEvent } from 'react'
import { db } from '../../db/db'
import type { Recurrente } from '../../db/tipos'
import { centavosATexto, formatearMonto, parsearMonto } from '../../lib/dinero'
import { formatearFecha, hoyISO } from '../../lib/fechas'
import { proximaFecha, totalMensualRecurrentes, ultimoMesInicial } from '../../lib/plan'
import { useCategorias, useCotizacionHoy, useCuentas, useRecurrentes } from '../datos'
import { Confirmar, Modal } from '../Modal'

export function GastosFijos() {
  const recurrentes = useRecurrentes()
  const cuentas = useCuentas()
  const categorias = useCategorias()
  const cotHoy = useCotizacionHoy()
  const [editado, setEditado] = useState<Recurrente | 'nuevo' | null>(null)
  const hoy = hoyISO()

  const hayEnUsd = recurrentes.some((r) => r.activo && r.plantilla.moneda === 'USD')
  const total = cotHoy || !hayEnUsd ? totalMensualRecurrentes(recurrentes, 'ARS', cotHoy ?? 1) : null
  const ordenados = [...recurrentes].sort((a, b) => Number(b.activo) - Number(a.activo) || a.dia_del_mes - b.dia_del_mes)

  return (
    <section className="tarjeta">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Gastos fijos</h2>
        <button className="boton-secundario" onClick={() => setEditado('nuevo')}>
          + Nuevo
        </button>
      </div>
      <p className="mb-2 text-xs text-slate-500">Alquiler, servicios, suscripciones: se cargan una vez y la app los repite sola cada mes, el día que elijas.</p>

      {recurrentes.length === 0 ? (
        <p className="text-sm text-slate-500">Todavía no cargaste ninguno. Alquiler, prepaga, internet, streaming…</p>
      ) : (
        <>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {ordenados.map((r) => {
              const cat = categorias.find((c) => c.id === r.plantilla.categoria_id)
              const cuenta = cuentas.find((c) => c.id === r.plantilla.cuenta_id)
              return (
                <li key={r.id}>
                  <button
                    onClick={() => setEditado(r)}
                    className={`flex w-full cursor-pointer items-center gap-3 py-2.5 text-left ${r.activo ? '' : 'opacity-50'}`}
                  >
                    <span className="text-2xl">{cat?.icono ?? '🔁'}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{r.plantilla.nota || cat?.nombre || 'Gasto fijo'}</span>
                      <span className="block truncate text-xs text-slate-500">
                        {r.activo ? `Día ${r.dia_del_mes} · ${cuenta?.nombre ?? '(cuenta borrada)'} · próximo ${formatearFecha(proximaFecha(r, hoy))}` : 'En pausa'}
                      </span>
                    </span>
                    <span className="whitespace-nowrap font-semibold tabular-nums">{formatearMonto(r.plantilla.monto_centavos, r.plantilla.moneda)}</span>
                  </button>
                </li>
              )
            })}
          </ul>
          <div className="mt-2 flex items-baseline justify-between border-t border-slate-200 pt-3 dark:border-slate-700">
            <span className="text-sm text-slate-500">Total por mes{hayEnUsd && ' (dólares a la cotización de hoy)'}</span>
            <span className="text-lg font-bold tabular-nums">{total === null ? '—' : formatearMonto(total, 'ARS')}</span>
          </div>
        </>
      )}

      {editado && <FormRecurrente recurrente={editado === 'nuevo' ? undefined : editado} onCerrar={() => setEditado(null)} />}
    </section>
  )
}

function FormRecurrente({ recurrente, onCerrar }: { recurrente?: Recurrente; onCerrar: () => void }) {
  const cuentas = useCuentas().filter((c) => !c.archivada || c.id === recurrente?.plantilla.cuenta_id)
  const categorias = useCategorias().filter((c) => c.tipo === 'gasto' && (!c.archivada || c.id === recurrente?.plantilla.categoria_id))
  const [nota, setNota] = useState(recurrente?.plantilla.nota ?? '')
  const [montoTxt, setMontoTxt] = useState(recurrente ? centavosATexto(recurrente.plantilla.monto_centavos) : '')
  const [cuentaId, setCuentaId] = useState(recurrente?.plantilla.cuenta_id)
  const [categoriaId, setCategoriaId] = useState(recurrente?.plantilla.categoria_id)
  const [diaTxt, setDiaTxt] = useState(String(recurrente?.dia_del_mes ?? 1))
  const [activo, setActivo] = useState(recurrente?.activo ?? true)
  const [error, setError] = useState('')
  const [confirmar, setConfirmar] = useState(false)

  const cuenta = cuentas.find((c) => c.id === cuentaId) ?? cuentas[0]
  const categoria = categorias.find((c) => c.id === categoriaId) ?? categorias.find((c) => c.nombre === 'Suscripciones') ?? categorias[0]
  const dia = Number(diaTxt)
  const hoy = hoyISO()

  async function guardar(e: FormEvent) {
    e.preventDefault()
    const monto = parsearMonto(montoTxt)
    if (!nota.trim()) return setError('Ponele un nombre (por ejemplo, "Internet").')
    if (!monto || monto <= 0) return setError('Poné un monto mayor a cero.')
    if (!cuenta?.id || !categoria?.id) return setError('Elegí cuenta y categoría.')
    if (!Number.isInteger(dia) || dia < 1 || dia > 31) return setError('El día tiene que ser entre 1 y 31.')
    // Si cambia el día o se reactiva, se recalcula desde cuándo corre para no cargar nada hacia atrás.
    const reiniciar = !recurrente || recurrente.dia_del_mes !== dia || (!recurrente.activo && activo)
    await db.recurrentes.put({
      ...(recurrente && { id: recurrente.id }),
      plantilla: { monto_centavos: monto, moneda: cuenta.moneda, cuenta_id: cuenta.id, categoria_id: categoria.id, nota: nota.trim() },
      frecuencia: 'mensual',
      dia_del_mes: dia,
      activo,
      ultimo_mes_generado: reiniciar ? ultimoMesInicial(dia, hoy) : recurrente!.ultimo_mes_generado,
    })
    onCerrar()
  }

  const valido = Number.isInteger(dia) && dia >= 1 && dia <= 31
  const primera = valido
    ? proximaFecha({ dia_del_mes: dia, ultimo_mes_generado: ultimoMesInicial(dia, hoy) }, hoy)
    : null

  return (
    <Modal titulo={recurrente ? 'Editar gasto fijo' : 'Nuevo gasto fijo'} onCerrar={onCerrar}>
      <form onSubmit={guardar} className="space-y-4">
        <div>
          <label className="etiqueta" htmlFor="r-nota">Nombre</label>
          <input id="r-nota" className="campo" placeholder="Internet, alquiler, streaming…" maxLength={120} value={nota} onChange={(e) => setNota(e.target.value)} autoFocus={!recurrente} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="etiqueta" htmlFor="r-monto">Monto por mes ({cuenta?.moneda === 'USD' ? 'US$' : '$'})</label>
            <input id="r-monto" className="campo" inputMode="decimal" autoComplete="off" placeholder="0,00" value={montoTxt} onChange={(e) => setMontoTxt(e.target.value)} />
          </div>
          <div>
            <label className="etiqueta" htmlFor="r-dia">Día del mes</label>
            <input id="r-dia" className="campo" type="number" inputMode="numeric" min={1} max={31} value={diaTxt} onChange={(e) => setDiaTxt(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="etiqueta" htmlFor="r-cuenta">Sale de</label>
            <select id="r-cuenta" className="campo" value={cuenta?.id ?? ''} onChange={(e) => setCuentaId(Number(e.target.value))}>
              {cuentas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre} ({c.moneda === 'USD' ? 'US$' : '$'})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="etiqueta" htmlFor="r-categoria">Categoría</label>
            <select id="r-categoria" className="campo" value={categoria?.id ?? ''} onChange={(e) => setCategoriaId(Number(e.target.value))}>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icono} {c.nombre}
                </option>
              ))}
            </select>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
          Activo (destildalo para pausarlo sin borrarlo)
        </label>
        {activo && primera && (!recurrente || recurrente.dia_del_mes !== dia || !recurrente.activo) && (
          <p className="text-xs text-slate-500">
            Se va a cargar solo a partir del {formatearFecha(primera)}. Si el de este mes ya lo pagaste, cargalo a mano con el botón +.
          </p>
        )}
        {error && <p role="alert" className="text-sm font-medium text-red-600">{error}</p>}
        <div className="flex gap-2">
          {recurrente && (
            <button type="button" className="boton-secundario text-red-600 dark:text-red-400" onClick={() => setConfirmar(true)}>
              Borrar
            </button>
          )}
          <button type="submit" className="boton-primario flex-1">Guardar</button>
        </div>
      </form>
      {confirmar && (
        <Confirmar
          titulo="¿Borrar este gasto fijo?"
          mensaje="Deja de cargarse cada mes. Los movimientos que ya generó quedan en tu historial."
          onCancelar={() => setConfirmar(false)}
          onConfirmar={async () => {
            await db.recurrentes.delete(recurrente!.id!)
            onCerrar()
          }}
        />
      )}
    </Modal>
  )
}
