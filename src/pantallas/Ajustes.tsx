import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState, type ChangeEvent } from 'react'
import { Confirmar, Modal } from '../componentes/Modal'
import { db } from '../db/db'
import { borrarEjemplo, cargarEjemplo, contarEjemplo } from '../db/ejemplo'
import { CASAS, NOMBRE_CASA, type Casa } from '../db/tipos'
import { crearBackup, descargar, movimientosACsv, restaurarBackup, resumirBackup, validarBackup, type Backup } from '../lib/backup'
import { actualizarCotizaciones, casaPreferida, elegirCotizacion, guardarCasaPreferida, guardarCotizacionManual } from '../lib/cotizacion'
import { formatearCotizacion, parsearMonto } from '../lib/dinero'
import { formatearFecha, hoyISO } from '../lib/fechas'
import { aplicarTema, temaGuardado, type Tema } from '../lib/tema'

const TEMAS: { id: Tema; nombre: string }[] = [
  { id: 'sistema', nombre: 'Como el dispositivo' },
  { id: 'claro', nombre: 'Claro' },
  { id: 'oscuro', nombre: 'Oscuro' },
]

export default function Ajustes() {
  const cotizaciones = useLiveQuery(() => db.cotizaciones.toArray(), [], [])
  const cantidadEjemplo = useLiveQuery(contarEjemplo, [], 0)
  const [casa, setCasa] = useState<Casa>(casaPreferida())
  const [tema, setTema] = useState<Tema>(temaGuardado())
  const [estadoCot, setEstadoCot] = useState('')
  const [manualTxt, setManualTxt] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [pendiente, setPendiente] = useState<Backup | null>(null)
  const [confirmarEjemplo, setConfirmarEjemplo] = useState(false)
  const archivo = useRef<HTMLInputElement>(null)

  async function actualizar() {
    setEstadoCot('Buscando…')
    try {
      await actualizarCotizaciones()
      setEstadoCot('Cotizaciones actualizadas.')
    } catch {
      setEstadoCot('No pude conectarme a DolarApi. Se sigue usando la última guardada; también podés cargarla a mano.')
    }
  }

  async function guardarManual() {
    const c = parsearMonto(manualTxt)
    if (!c || c <= 0) return setEstadoCot('Ese valor no es válido.')
    await guardarCotizacionManual(casa, c / 100)
    setManualTxt('')
    setEstadoCot(`Guardado: ${NOMBRE_CASA[casa]} a ${formatearCotizacion(c / 100)} para hoy.`)
  }

  async function exportarJson() {
    const backup = await crearBackup()
    descargar(`finanzas-backup-${hoyISO()}.json`, JSON.stringify(backup, null, 2), 'application/json')
    setMensaje('Backup descargado. Guardalo en la carpeta "backups".')
  }

  async function exportarCsv() {
    const csv = movimientosACsv(await db.movimientos.toArray(), await db.cuentas.toArray(), await db.categorias.toArray())
    // El BOM (﻿) hace que Excel lea bien los acentos.
    descargar(`finanzas-movimientos-${hoyISO()}.csv`, '﻿' + csv, 'text/csv;charset=utf-8')
    setMensaje('CSV descargado.')
  }

  async function elegirArchivo(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    try {
      setPendiente(validarBackup(JSON.parse(await f.text())))
      setMensaje('')
    } catch (err) {
      setMensaje(err instanceof SyntaxError ? 'Ese archivo no es un JSON válido.' : (err as Error).message)
    }
  }

  async function importar() {
    await restaurarBackup(pendiente!)
    setPendiente(null)
    setMensaje('Backup importado. Ya estás viendo esos datos.')
  }

  const resumen = pendiente && resumirBackup(pendiente)

  return (
    <div className="space-y-4">
      <section className="tarjeta space-y-3">
        <h2 className="text-lg font-bold">Dólar</h2>
        <div>
          <label className="etiqueta" htmlFor="casa">Cotización que usa la app</label>
          <select
            id="casa"
            className="campo"
            value={casa}
            onChange={(e) => {
              const c = e.target.value as Casa
              setCasa(c)
              guardarCasaPreferida(c)
            }}
          >
            {CASAS.map((c) => (
              <option key={c} value={c}>{NOMBRE_CASA[c]}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-500">Se usa el valor de venta. Los movimientos ya cargados conservan la cotización con la que se guardaron.</p>
        </div>
        <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
          {CASAS.map((c) => {
            const cot = elegirCotizacion(cotizaciones, c, hoyISO())
            return (
              <li key={c} className="flex items-center justify-between py-2">
                <span className={c === casa ? 'font-semibold' : ''}>{NOMBRE_CASA[c]}</span>
                {cot ? (
                  <span className="text-right tabular-nums">
                    <span className="font-semibold">{formatearCotizacion(cot.venta)}</span>
                    <span className={`ml-2 text-xs ${cot.fecha === hoyISO() ? 'text-slate-500' : 'text-amber-600 dark:text-amber-400'}`}>
                      {cot.fecha === hoyISO() ? 'hoy' : formatearFecha(cot.fecha)}
                    </span>
                  </span>
                ) : (
                  <span className="text-slate-400">sin dato</span>
                )}
              </li>
            )
          })}
        </ul>
        <button className="boton-secundario w-full" onClick={actualizar}>Actualizar desde DolarApi</button>
        <div className="flex gap-2">
          <input
            className="campo"
            inputMode="decimal"
            aria-label={`Valor del dólar ${NOMBRE_CASA[casa]} a mano`}
            placeholder={`Cargar ${NOMBRE_CASA[casa]} a mano`}
            value={manualTxt}
            onChange={(e) => setManualTxt(e.target.value)}
          />
          <button className="boton-secundario" onClick={guardarManual}>Guardar</button>
        </div>
        {estadoCot && <p role="status" className="text-sm text-slate-600 dark:text-slate-300">{estadoCot}</p>}
      </section>

      <section className="tarjeta space-y-3">
        <h2 className="text-lg font-bold">Backup</h2>
        <p className="text-sm text-slate-500">
          Tus datos viven solo en este navegador. Exportá un backup a fin de mes y antes de cambiar de dispositivo.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button className="boton-primario" onClick={exportarJson}>Exportar backup</button>
          <button className="boton-secundario" onClick={() => archivo.current?.click()}>Importar backup</button>
        </div>
        <button className="boton-secundario w-full" onClick={exportarCsv}>Exportar movimientos a CSV (Excel)</button>
        <input ref={archivo} type="file" accept=".json,application/json" className="hidden" onChange={elegirArchivo} />
        {mensaje && <p role="status" className="text-sm text-slate-600 dark:text-slate-300">{mensaje}</p>}
      </section>

      <section className="tarjeta space-y-3">
        <h2 className="text-lg font-bold">Apariencia</h2>
        <div className="flex gap-2">
          {TEMAS.map((t) => (
            <button
              key={t.id}
              aria-pressed={tema === t.id}
              onClick={() => {
                setTema(t.id)
                aplicarTema(t.id)
              }}
              className={`flex-1 cursor-pointer rounded-xl border px-2 py-2 text-sm ${
                tema === t.id ? 'border-emerald-500 bg-emerald-50 font-semibold dark:bg-emerald-950' : 'border-slate-200 dark:border-slate-700'
              }`}
            >
              {t.nombre}
            </button>
          ))}
        </div>
      </section>

      <section className="tarjeta space-y-3">
        <h2 className="text-lg font-bold">Datos de ejemplo</h2>
        <p className="text-sm text-slate-500">
          {cantidadEjemplo > 0
            ? `Hay ${cantidadEjemplo} movimientos de ejemplo cargados. Borrarlos no toca lo que cargaste vos.`
            : 'No hay datos de ejemplo cargados.'}
        </p>
        {cantidadEjemplo > 0 ? (
          <button className="boton-peligro w-full" onClick={() => setConfirmarEjemplo(true)}>Borrar datos de ejemplo</button>
        ) : (
          <button
            className="boton-secundario w-full"
            onClick={() => cargarEjemplo().catch((e: Error) => setMensaje(e.message))}
          >
            Cargar datos de ejemplo
          </button>
        )}
      </section>

      {resumen && (
        <Modal titulo="Vista previa del backup" onCerrar={() => setPendiente(null)}>
          <dl className="grid grid-cols-2 gap-y-1.5 text-sm">
            <dt className="text-slate-500">Exportado el</dt>
            <dd className="text-right">{formatearFecha(resumen.exportado.slice(0, 10))}</dd>
            <dt className="text-slate-500">Movimientos</dt>
            <dd className="text-right font-semibold">{resumen.movimientos}</dd>
            <dt className="text-slate-500">Período</dt>
            <dd className="text-right">
              {resumen.desde ? `${formatearFecha(resumen.desde)} al ${formatearFecha(resumen.hasta!)}` : '—'}
            </dd>
            <dt className="text-slate-500">Cuentas</dt>
            <dd className="text-right">{resumen.cuentas}</dd>
            <dt className="text-slate-500">Categorías</dt>
            <dd className="text-right">{resumen.categorias}</dd>
            <dt className="text-slate-500">Cotizaciones guardadas</dt>
            <dd className="text-right">{resumen.cotizaciones}</dd>
          </dl>
          <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
            Importar <strong>reemplaza todo</strong> lo que hay ahora en este navegador por el contenido del backup. Si tenés datos que
            querés conservar, exportá un backup antes.
          </p>
          <div className="mt-4 flex gap-2">
            <button className="boton-secundario flex-1" onClick={() => setPendiente(null)}>Cancelar</button>
            <button className="boton-peligro flex-1" onClick={importar}>Reemplazar e importar</button>
          </div>
        </Modal>
      )}

      {confirmarEjemplo && (
        <Confirmar
          titulo="¿Borrar los datos de ejemplo?"
          mensaje={`Se borran los ${cantidadEjemplo} movimientos de ejemplo. Tus cuentas, categorías y lo que cargaste vos quedan como están.`}
          onCancelar={() => setConfirmarEjemplo(false)}
          onConfirmar={async () => {
            await borrarEjemplo()
            setConfirmarEjemplo(false)
          }}
        />
      )}
    </div>
  )
}
