import { useEffect, useState, type FormEvent } from 'react'
import { db } from '../db/db'
import { NOMBRE_CASA, type Casa, type Moneda, type Movimiento, type TipoMovimiento } from '../db/tipos'
import { avisar } from '../lib/avisos'
import { casaPreferida, cotizacionPara, guardarCotizacionManual } from '../lib/cotizacion'
import { centavosATexto, convertir, formatearMonto, parsearMonto, usdAArs } from '../lib/dinero'
import { formatearFecha, hoyISO, mesDe } from '../lib/fechas'
import { alertaPorCruce, esCuota, estadoPresupuestos, generarCuotas, propuestaDeAhorro, repartirEnCuotas } from '../lib/plan'
import { leerPagatePrimero } from '../lib/preferencias'
import { useCategorias, useCuentas } from './datos'
import { Confirmar, Modal } from './Modal'

const TIPOS: { id: TipoMovimiento; nombre: string }[] = [
  { id: 'gasto', nombre: 'Gasto' },
  { id: 'ingreso', nombre: 'Ingreso' },
  { id: 'transferencia', nombre: 'Transferir' },
  { id: 'compra_usd', nombre: 'Comprar USD' },
]

const claveUltimaCuenta = (moneda: Moneda) => `ultima_cuenta_${moneda}`

type MovimientoNuevo = Omit<Movimiento, 'id'>

interface Props {
  /** Si viene, se edita ese movimiento; si no, se carga uno nuevo. */
  movimiento?: Movimiento
  /** Para abrir un movimiento nuevo ya encaminado (por ejemplo, "Aportar" a una alcancía). */
  preset?: { tipo?: TipoMovimiento; destinoId?: number }
  onCerrar: () => void
}

/** Lo gastado y el tope de una categoría en un mes, leyendo la base tal como está ahora. */
async function presupuestoDe(categoriaId: number, mes: string) {
  const estados = estadoPresupuestos(await db.presupuestos.toArray(), await db.movimientos.toArray(), mes)
  return estados.find((e) => e.presupuesto.categoria_id === categoriaId)
}

export function FormMovimiento({ movimiento, preset, onCerrar }: Props) {
  const cuentasTodas = useCuentas()
  const categoriasTodas = useCategorias()
  const editando = movimiento?.id != null
  const cuotaEditada = movimiento && esCuota(movimiento) ? movimiento : null

  const [tipo, setTipo] = useState<TipoMovimiento>(movimiento?.tipo ?? preset?.tipo ?? 'gasto')
  const [moneda, setMoneda] = useState<Moneda>(movimiento?.moneda ?? 'ARS')
  const [montoTxt, setMontoTxt] = useState(() => {
    if (!movimiento) return ''
    // En una compra de dólares lo que se tipea son los dólares comprados.
    return centavosATexto(movimiento.tipo === 'compra_usd' ? (movimiento.monto_destino_centavos ?? 0) : movimiento.monto_centavos)
  })
  const [cuentaId, setCuentaId] = useState(movimiento?.cuenta_id)
  const [destinoId, setDestinoId] = useState(movimiento?.cuenta_destino_id ?? preset?.destinoId)
  const [categoriaId, setCategoriaId] = useState(movimiento?.categoria_id)
  const [fecha, setFecha] = useState(movimiento?.fecha ?? hoyISO())
  const [nota, setNota] = useState(movimiento?.nota ?? '')
  const [cuotasTxt, setCuotasTxt] = useState('1')
  const [aTodasLasCuotas, setATodasLasCuotas] = useState(false)
  const [cotTxt, setCotTxt] = useState(movimiento ? centavosATexto(Math.round(movimiento.cotizacion * 100)) : '')
  const [casa, setCasa] = useState<Casa | 'manual'>(movimiento?.casa_cotizacion ?? casaPreferida())
  const [avisoCot, setAvisoCot] = useState('')
  const [sinCotizacion, setSinCotizacion] = useState(false)
  const [error, setError] = useState('')
  const [confirmarBorrado, setConfirmarBorrado] = useState(false)
  /** Paso de "págate primero" que se muestra después de guardar un sueldo. */
  const [propuesta, setPropuesta] = useState<{ mov: MovimientoNuevo; alcancia: string } | null>(null)

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
  const puedeIrEnCuotas = tipo === 'gasto' && !editando
  const cuotas = puedeIrEnCuotas ? Number(cuotasTxt) : 1
  const cuotasValidas = Number.isInteger(cuotas) && cuotas >= 1 && cuotas <= 60

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
    if (!cuotasValidas) return setError('Las cuotas tienen que ser un número entre 1 y 60.')

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

    let datos: MovimientoNuevo
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

    // Presupuesto de la categoría antes de guardar, para saber si este gasto cruza el 80% o el 100%.
    const presupuestoAntes = tipo === 'gasto' ? await presupuestoDe(datos.categoria_id!, mesDe(fecha)) : undefined

    if (editando) {
      await db.movimientos.put({ ...datos, id: movimiento!.id })
      if (cuotaEditada && aTodasLasCuotas) {
        // Categoría, cuenta y nota pasan a todas las cuotas de la compra; monto y fecha son de cada una.
        await db.movimientos
          .where('compra_id')
          .equals(cuotaEditada.compra_id!)
          .modify({ categoria_id: datos.categoria_id, cuenta_id: datos.cuenta_id, nota: datos.nota, editado: ahora })
      }
    } else if (cuotas > 1) {
      // Regla 6: N cuotas = N movimientos con el mismo compra_id, uno por mes.
      await db.movimientos.bulkAdd(generarCuotas(datos, cuotas, crypto.randomUUID()))
    } else {
      await db.movimientos.add(datos)
    }

    // Si no había ninguna cotización, la que cargaste a mano queda como la del día.
    if (sinCotizacion) await guardarCotizacionManual(casaPreferida(), cot)
    localStorage.setItem(claveUltimaCuenta(origen.moneda), String(origen.id))

    if (presupuestoAntes) {
      const despues = await presupuestoDe(datos.categoria_id!, mesDe(fecha))
      const tope = presupuestoAntes.presupuesto.tope_centavos
      const cruce = despues && alertaPorCruce(presupuestoAntes.gastado, despues.gastado, tope)
      if (cruce) {
        const m = presupuestoAntes.presupuesto.moneda
        avisar({
          tono: cruce === 'pasado' ? 'peligro' : 'alerta',
          texto:
            cruce === 'pasado'
              ? `Te pasaste del presupuesto de ${categoria?.nombre}: ${formatearMonto(despues.gastado, m)} de ${formatearMonto(tope, m)}.`
              : `Ojo: ya usaste el ${Math.round((despues.gastado / tope) * 100)}% del presupuesto de ${categoria?.nombre}.`,
        })
      }
    }

    // Págate primero: al cargar el sueldo, propone separar el % de ahorro.
    if (!editando && tipo === 'ingreso') {
      const pref = leerPagatePrimero()
      const categoriaSueldo = pref.categoria_id ?? categoriasTodas.find((c) => c.tipo === 'ingreso' && c.nombre === 'Sueldo')?.id
      // Si no elegiste alcancía pero tenés una sola, va a esa.
      const todas = pref.activo ? await db.alcancias.toArray() : []
      const alcancia = todas.find((a) => a.id === pref.alcancia_id) ?? (todas.length === 1 ? todas[0] : undefined)
      const cuentaAlcancia = alcancia && cuentasTodas.find((c) => c.id === alcancia.cuenta_id && !c.archivada)
      if (alcancia && cuentaAlcancia && datos.categoria_id === categoriaSueldo) {
        const mov = propuestaDeAhorro(datos, pref.porcentaje, cuentaAlcancia, ahora)
        if (mov) return setPropuesta({ mov, alcancia: alcancia.nombre })
      }
    }
    onCerrar()
  }

  async function borrar(todaLaCompra: boolean) {
    if (todaLaCompra && cuotaEditada) await db.movimientos.where('compra_id').equals(cuotaEditada.compra_id!).delete()
    else await db.movimientos.delete(movimiento!.id!)
    onCerrar()
  }

  const pestania = (activa: boolean) =>
    `flex-1 cursor-pointer rounded-lg px-2 py-2 text-sm font-semibold transition ${
      activa ? 'bg-white text-emerald-700 shadow-sm dark:bg-slate-700 dark:text-emerald-300' : 'text-slate-500 dark:text-slate-400'
    }`

  if (propuesta) {
    const { mov, alcancia } = propuesta
    const destinoMoneda = cuentasTodas.find((c) => c.id === mov.cuenta_destino_id)?.moneda ?? 'USD'
    return (
      <Modal titulo="Págate primero" onCerrar={onCerrar}>
        <div className="space-y-4">
          <p className="text-4xl">🐷</p>
          <p>
            Ya guardé el ingreso. ¿Separás ahora <strong>{formatearMonto(mov.monto_centavos, mov.moneda)}</strong> para la alcancía{' '}
            <strong>{alcancia}</strong>?
          </p>
          {mov.tipo === 'compra_usd' && (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Son {formatearMonto(mov.monto_destino_centavos ?? 0, destinoMoneda)} al dólar de hoy. Se registra como compra de dólares:
              no cuenta como gasto.
            </p>
          )}
          <div className="flex gap-2">
            <button className="boton-secundario flex-1" onClick={onCerrar}>
              Ahora no
            </button>
            <button
              className="boton-primario flex-1"
              onClick={async () => {
                await db.movimientos.add(mov)
                avisar(`Separaste ${formatearMonto(mov.monto_destino_centavos ?? 0, destinoMoneda)} para ${alcancia}.`)
                onCerrar()
              }}
            >
              Sí, separar
            </button>
          </div>
        </div>
      </Modal>
    )
  }

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
              disabled={cuotaEditada != null && t.id !== 'gasto'}
              className={pestania(tipo === t.id) + ' disabled:opacity-40'}
              onClick={() => {
                setTipo(t.id)
                setError('')
              }}
            >
              {t.nombre}
            </button>
          ))}
        </div>

        {cuotaEditada && (
          <p className="rounded-xl bg-slate-100 px-3 py-2 text-sm dark:bg-slate-800">
            Cuota {cuotaEditada.cuota_n} de {cuotaEditada.cuotas_total}. El monto y la fecha que cambies valen solo para esta cuota.
          </p>
        )}

        <div>
          <label className="etiqueta" htmlFor="monto">
            {tipo === 'compra_usd' ? 'Dólares que comprás' : puedeIrEnCuotas && cuotas > 1 ? 'Monto total de la compra' : 'Monto'}
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

        <div className={esGastoOIngreso && !puedeIrEnCuotas ? '' : 'grid grid-cols-2 gap-2'}>
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
          {puedeIrEnCuotas && (
            <div>
              <label className="etiqueta" htmlFor="cuotas">
                Cuotas
              </label>
              <input
                id="cuotas"
                className="campo"
                type="number"
                inputMode="numeric"
                min={1}
                max={60}
                value={cuotasTxt}
                onChange={(e) => setCuotasTxt(e.target.value)}
              />
            </div>
          )}
        </div>
        {puedeIrEnCuotas && cuotas > 1 && cuotasValidas && monto ? (
          <p className="-mt-2 text-sm text-slate-500 dark:text-slate-400">
            {cuotas} cuotas de {formatearMonto(repartirEnCuotas(monto, cuotas)[1], monedaMonto)}, una por mes desde el{' '}
            {formatearFecha(fecha)}. Cada una cuenta como gasto en su mes.
          </p>
        ) : null}

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

        {cuotaEditada && (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={aTodasLasCuotas} onChange={(e) => setATodasLasCuotas(e.target.checked)} />
            Aplicar la categoría, la cuenta y la nota a las {cuotaEditada.cuotas_total} cuotas de esta compra
          </label>
        )}

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

      {confirmarBorrado &&
        (cuotaEditada ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div role="alertdialog" aria-label="Borrar cuota" className="w-full max-w-sm space-y-2 rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900">
              <h3 className="text-lg font-bold">¿Qué querés borrar?</h3>
              <p className="pb-2 text-sm text-slate-600 dark:text-slate-300">
                Esta es la cuota {cuotaEditada.cuota_n} de {cuotaEditada.cuotas_total}. No se puede deshacer.
              </p>
              <button className="boton-peligro w-full" onClick={() => borrar(true)}>
                Toda la compra ({cuotaEditada.cuotas_total} cuotas)
              </button>
              <button className="boton-secundario w-full text-red-600 dark:text-red-400" onClick={() => borrar(false)}>
                Solo esta cuota
              </button>
              <button className="boton-secundario w-full" onClick={() => setConfirmarBorrado(false)}>
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <Confirmar
            titulo="¿Borrar este movimiento?"
            mensaje="No se puede deshacer."
            onConfirmar={() => borrar(false)}
            onCancelar={() => setConfirmarBorrado(false)}
          />
        ))}
    </Modal>
  )
}
