import { useEffect, useState, type FormEvent } from 'react'
import { db } from '../db/db'
import { NOMBRE_CASA, type Casa, type Moneda, type Movimiento, type TipoMovimiento } from '../db/tipos'
import { casaPreferida, cotizacionPara, guardarCotizacionManual } from '../lib/cotizacion'
import { centavosATexto, convertir, formatearMonto, parsearMonto, usdAArs } from '../lib/dinero'
import { formatearFecha, hoyISO } from '../lib/fechas'
import { useCategorias, useCuentas } from './datos'
import { Confirmar, Modal } from './Modal'

const TIPOS: { id: TipoMovimiento; nombre: string }[] = [
  { id: 'gasto', nombre: 'Gasto' },
  { id: 'ingreso', nombre: 'Ingreso' },
  { id: 'transferencia', nombre: 'Transferir' },
  { id: 'compra_usd', nombre: 'Comprar USD' },
]

const claveUltimaCuenta = (moneda: Moneda) => `ultima_cuenta_${moneda}`

interface Props {
  /** Si viene, se edita ese movimiento; si no, se carga uno nuevo. */
  movimiento?: Movimiento
  onCerrar: () => void
}

export function FormMovimiento({ movimiento, onCerrar }: Props) {
  const cuentasTodas = useCuentas()
  const categoriasTodas = useCategorias()
  const editando = movimiento?.id != null

  const [tipo, setTipo] = useState<TipoMovimiento>(movimiento?.tipo ?? 'gasto')
  const [moneda, setMoneda] = useState<Moneda>(movimiento?.moneda ?? 'ARS')
  const [montoTxt, setMontoTxt] = useState(() => {
    if (!movimiento) return ''
    // En una compra de dólares lo que se tipea son los dólares comprados.
    return centavosATexto(movimiento.tipo === 'compra_usd' ? (movimiento.monto_destino_centavos ?? 0) : movimiento.monto_centavos)
  })
  const [cuentaId, setCuentaId] = useState(movimiento?.cuenta_id)
  const [destinoId, setDestinoId] = useState(movimiento?.cuenta_destino_id)
  const [categoriaId, setCategoriaId] = useState(movimiento?.categoria_id)
  const [fecha, setFecha] = useState(movimiento?.fecha ?? hoyISO())
  const [nota, setNota] = useState(movimiento?.nota ?? '')
  const [cotTxt, setCotTxt] = useState(movimiento ? centavosATexto(Math.round(movimiento.cotizacion * 100)) : '')
  const [casa, setCasa] = useState<Casa | 'manual'>(movimiento?.casa_cotizacion ?? casaPreferida())
  const [avisoCot, setAvisoCot] = useState('')
  const [sinCotizacion, setSinCotizacion] = useState(false)
  const [error, setError] = useState('')
  const [confirmarBorrado, setConfirmarBorrado] = useState(false)

  // Trae la cotización de la fecha elegida. Al editar se respeta la que ya tenía guardada (regla 2).
  useEffect(() => {
    if (movimiento && fecha === movimiento.fecha) return
    let vigente = true
    cotizacionPara(fecha).then(({ cotizacion, desactualizada }) => {
      if (!vigente) return
      if (!cotizacion) {
        setSinCotizacion(true)
        setCasa('manual')
        setAvisoCot('No pude traer la cotización y no hay ninguna guardada. Cargala a mano.')
        return
      }
      setSinCotizacion(false)
      setCotTxt(centavosATexto(Math.round(cotizacion.venta * 100)))
      setCasa(cotizacion.casa)
      setAvisoCot(desactualizada ? `Sin dato de ese día: uso la del ${formatearFecha(cotizacion.fecha)}.` : '')
    })
    return () => {
      vigente = false
    }
  }, [fecha, movimiento])

  // --- Qué cuentas y categorías se pueden elegir según el tipo ---
  const activas = cuentasTodas.filter(
    (c) => !c.archivada || c.id === movimiento?.cuenta_id || c.id === movimiento?.cuenta_destino_id,
  )
  const cuentasOrigen =
    tipo === 'compra_usd'
      ? activas.filter((c) => c.moneda === 'ARS')
      : tipo === 'transferencia'
        ? activas
        : activas.filter((c) => c.moneda === moneda)
  const ultima = Number(localStorage.getItem(claveUltimaCuenta(tipo === 'compra_usd' ? 'ARS' : moneda)))
  const origen =
    cuentasOrigen.find((c) => c.id === cuentaId) ?? cuentasOrigen.find((c) => c.id === ultima) ?? cuentasOrigen[0]
  const cuentasDestino =
    tipo === 'compra_usd' ? activas.filter((c) => c.moneda === 'USD') : activas.filter((c) => c.id !== origen?.id)
  const destino = cuentasDestino.find((c) => c.id === destinoId) ?? cuentasDestino[0]

  const esGastoOIngreso = tipo === 'gasto' || tipo === 'ingreso'
  const categorias = categoriasTodas.filter(
    (c) => c.tipo === tipo && (!c.archivada || c.id === movimiento?.categoria_id),
  )
  const categoria = categorias.find((c) => c.id === categoriaId) ?? (tipo === 'ingreso' ? categorias[0] : undefined)

  // --- Montos ---
  const monto = parsearMonto(montoTxt)
  const cotCentavos = parsearMonto(cotTxt)
  const cot = cotCentavos && cotCentavos > 0 ? cotCentavos / 100 : null
  const monedaMonto: Moneda = tipo === 'compra_usd' ? 'USD' : (origen?.moneda ?? moneda)

  let equivalente = ''
  if (monto && cot) {
    if (tipo === 'compra_usd') {
      equivalente = `Salen ${formatearMonto(usdAArs(monto, cot), 'ARS')} de ${origen?.nombre ?? 'pesos'}`
    } else if (tipo === 'transferencia') {
      if (origen && destino && origen.moneda !== destino.moneda) {
        equivalente = `Entran ${formatearMonto(convertir(monto, origen.moneda, destino.moneda, cot), destino.moneda)} en ${destino.nombre}`
      }
    } else {
      const otra: Moneda = monedaMonto === 'ARS' ? 'USD' : 'ARS'
      equivalente = `≈ ${formatearMonto(convertir(monto, monedaMonto, otra, cot), otra)}`
    }
  }

  async function guardar(e: FormEvent) {
    e.preventDefault()
    if (!monto || monto <= 0) return setError('Poné un monto mayor a cero.')
    if (!cot) return setError('Falta la cotización del dólar.')
    if (!origen?.id) return setError('Elegí una cuenta.')

    const ahora = new Date().toISOString()
    const base = {
      fecha,
      tipo,
      nota: nota.trim(),
      cotizacion: cot,
      casa_cotizacion: casa,
      cuenta_id: origen.id,
      creado: movimiento?.creado ?? ahora,
      editado: ahora,
      // Campos que este formulario no toca pero hay que conservar al editar.
      ...(movimiento && {
        compra_id: movimiento.compra_id,
        cuota_n: movimiento.cuota_n,
        cuotas_total: movimiento.cuotas_total,
        recurrente_id: movimiento.recurrente_id,
        ejemplo: movimiento.ejemplo,
      }),
    }

    let datos: Movimiento
    if (esGastoOIngreso) {
      if (!categoria?.id) return setError('Elegí una categoría.')
      datos = { ...base, monto_centavos: monto, moneda: origen.moneda, categoria_id: categoria.id }
    } else {
      if (!destino?.id) return setError('Elegí la cuenta de destino.')
      datos =
        tipo === 'compra_usd'
          ? {
              ...base,
              monto_centavos: usdAArs(monto, cot),
              moneda: 'ARS',
              cuenta_destino_id: destino.id,
              monto_destino_centavos: monto,
            }
          : {
              ...base,
              monto_centavos: monto,
              moneda: origen.moneda,
              cuenta_destino_id: destino.id,
              monto_destino_centavos: convertir(monto, origen.moneda, destino.moneda, cot),
            }
    }

    if (editando) await db.movimientos.put({ ...datos, id: movimiento!.id })
    else await db.movimientos.add(datos)

    // Si no había ninguna cotización, la que cargaste a mano queda como la del día.
    if (sinCotizacion) await guardarCotizacionManual(casaPreferida(), cot)
    localStorage.setItem(claveUltimaCuenta(origen.moneda), String(origen.id))
    onCerrar()
  }

  async function borrar() {
    await db.movimientos.delete(movimiento!.id!)
    onCerrar()
  }

  const pestania = (activa: boolean) =>
    `flex-1 cursor-pointer rounded-lg px-2 py-2 text-sm font-semibold transition ${
      activa ? 'bg-white text-emerald-700 shadow-sm dark:bg-slate-700 dark:text-emerald-300' : 'text-slate-500 dark:text-slate-400'
    }`

  return (
    <Modal titulo={editando ? 'Editar movimiento' : 'Nuevo movimiento'} onCerrar={onCerrar}>
      <form onSubmit={guardar} className="space-y-4">
        <div className="flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800" role="tablist">
          {TIPOS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tipo === t.id}
              className={pestania(tipo === t.id)}
              onClick={() => {
                setTipo(t.id)
                setError('')
              }}
            >
              {t.nombre}
            </button>
          ))}
        </div>

        <div>
          <label className="etiqueta" htmlFor="monto">
            {tipo === 'compra_usd' ? 'Dólares que comprás' : 'Monto'}
          </label>
          <div className="flex items-stretch gap-2">
            {esGastoOIngreso ? (
              <div className="flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
                {(['ARS', 'USD'] as Moneda[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={monedaMonto === m}
                    className={pestania(monedaMonto === m) + ' px-3'}
                    onClick={() => {
                      setMoneda(m)
                      setCuentaId(undefined)
                    }}
                  >
                    {m === 'ARS' ? '$' : 'US$'}
                  </button>
                ))}
              </div>
            ) : (
              <span className="grid place-items-center rounded-xl bg-slate-100 px-3 font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {monedaMonto === 'ARS' ? '$' : 'US$'}
              </span>
            )}
            <input
              id="monto"
              className="campo text-2xl font-bold"
              inputMode="decimal"
              autoComplete="off"
              autoFocus={!editando}
              placeholder="0,00"
              value={montoTxt}
              onChange={(e) => setMontoTxt(e.target.value)}
            />
          </div>
          {equivalente && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{equivalente}</p>}
        </div>

        {esGastoOIngreso && (
          <div>
            <span className="etiqueta">Categoría</span>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {categorias.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={categoria?.id === c.id}
                  onClick={() => setCategoriaId(c.id)}
                  className={`flex cursor-pointer items-center gap-2 rounded-xl border px-2.5 py-2 text-left text-sm leading-tight transition ${
                    categoria?.id === c.id
                      ? 'border-emerald-500 bg-emerald-50 font-semibold dark:bg-emerald-950'
                      : 'border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <span className="text-lg">{c.icono}</span>
                  <span>{c.nombre}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className={esGastoOIngreso ? '' : 'grid grid-cols-2 gap-2'}>
          <div>
            <label className="etiqueta" htmlFor="cuenta">
              {esGastoOIngreso ? 'Cuenta' : 'Sale de'}
            </label>
            <select id="cuenta" className="campo" value={origen?.id ?? ''} onChange={(e) => setCuentaId(Number(e.target.value))}>
              {cuentasOrigen.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>
          {!esGastoOIngreso && (
            <div>
              <label className="etiqueta" htmlFor="destino">
                Entra en
              </label>
              <select id="destino" className="campo" value={destino?.id ?? ''} onChange={(e) => setDestinoId(Number(e.target.value))}>
                {cuentasDestino.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="etiqueta" htmlFor="fecha">
              Fecha
            </label>
            <input id="fecha" type="date" required className="campo" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
          <div>
            <label className="etiqueta" htmlFor="cotizacion">
              Dólar ({casa === 'manual' ? 'a mano' : NOMBRE_CASA[casa]})
            </label>
            <input
              id="cotizacion"
              className="campo"
              inputMode="decimal"
              autoComplete="off"
              placeholder="Pesos por dólar"
              value={cotTxt}
              onChange={(e) => {
                setCotTxt(e.target.value)
                setCasa('manual')
              }}
            />
          </div>
        </div>
        {avisoCot && <p className="-mt-2 text-sm text-amber-600 dark:text-amber-400">{avisoCot}</p>}

        <div>
          <label className="etiqueta" htmlFor="nota">
            Nota (opcional)
          </label>
          <input id="nota" className="campo" maxLength={120} value={nota} onChange={(e) => setNota(e.target.value)} />
        </div>

        {error && (
          <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        )}

        <div className="flex gap-2">
          {editando && (
            <button type="button" className="boton-secundario text-red-600 dark:text-red-400" onClick={() => setConfirmarBorrado(true)}>
              Borrar
            </button>
          )}
          <button type="submit" className="boton-primario flex-1 py-3 text-base">
            Guardar
          </button>
        </div>
      </form>

      {confirmarBorrado && (
        <Confirmar
          titulo="¿Borrar este movimiento?"
          mensaje="No se puede deshacer."
          onConfirmar={borrar}
          onCancelar={() => setConfirmarBorrado(false)}
        />
      )}
    </Modal>
  )
}
