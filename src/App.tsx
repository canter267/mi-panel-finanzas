import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { NavLink, Route, Routes } from 'react-router-dom'
import { FormMovimiento } from './componentes/FormMovimiento'
import { Confirmar } from './componentes/Modal'
import { db } from './db/db'
import { borrarEjemplo, cargarEjemplo, contarEjemplo } from './db/ejemplo'
import { NOMBRE_CASA } from './db/tipos'
import { casaPreferida, cotizacionPara, elegirCotizacion } from './lib/cotizacion'
import { formatearCotizacion } from './lib/dinero'
import { hoyISO } from './lib/fechas'
import Ajustes from './pantallas/Ajustes'
import Cuentas from './pantallas/Cuentas'
import Movimientos from './pantallas/Movimientos'
import Panel from './pantallas/Panel'
import Plan from './pantallas/Plan'
import { generarRecurrentes } from './db/recurrentes'
import { avisar, escucharAvisos, type Aviso } from './lib/avisos'
import { formatearMonto } from './lib/dinero'

const TONO_AVISO: Record<NonNullable<Aviso['tono']>, string> = {
  info: 'bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900',
  alerta: 'bg-amber-500 text-slate-950',
  peligro: 'bg-red-600 text-white',
}

const SECCIONES = [
  { ruta: '/', nombre: 'Panel', icono: '📊' },
  { ruta: '/movimientos', nombre: 'Movimientos', icono: '🧾' },
  { ruta: '/plan', nombre: 'Plan', icono: '🎯' },
  { ruta: '/cuentas', nombre: 'Cuentas', icono: '👛' },
  { ruta: '/ajustes', nombre: 'Ajustes', icono: '⚙️' },
]

const CLAVE_PRIMERA_VEZ = 'ejemplo_ofrecido'
let yaArranco = false

export default function App() {
  const [cargando, setCargando] = useState(false)
  const [confirmarEjemplo, setConfirmarEjemplo] = useState(false)
  const cotizaciones = useLiveQuery(() => db.cotizaciones.toArray(), [], [])
  const cantidadEjemplo = useLiveQuery(contarEjemplo, [], 0)

  const casa = casaPreferida()
  const cot = elegirCotizacion(cotizaciones, casa, hoyISO())

  const [avisos, setAvisos] = useState<(Aviso & { id: number })[]>([])
  const cerrarAviso = (id: number) => setAvisos((lista) => lista.filter((a) => a.id !== id))

  useEffect(
    () =>
      escucharAvisos((aviso) => {
        const id = Date.now() + Math.random()
        setAvisos((lista) => [...lista, { ...aviso, id }])
        // Los que traen un botón se quedan hasta que los toques; el resto se va solo.
        if (!aviso.accion) setTimeout(() => cerrarAviso(id), 8000)
      }),
    [],
  )

  useEffect(() => {
    // En desarrollo React monta dos veces: esto tiene que correr una sola vez por carga de página.
    if (yaArranco) return
    yaArranco = true

    // Trae la cotización del día al abrir (si ya está guardada, no sale a internet)
    // y después carga los gastos fijos que hayan vencido.
    cotizacionPara(hoyISO())
      .catch(() => {})
      .then(generarRecurrentes)
      .then((creados) => {
        if (creados.length === 0) return
        const detalle = creados
          .slice(0, 3)
          .map((m) => `${m.nota} (${formatearMonto(m.monto_centavos, m.moneda)})`)
          .join(', ')
        avisar(
          `Cargué ${creados.length === 1 ? '1 gasto fijo' : `${creados.length} gastos fijos`}: ${detalle}${creados.length > 3 ? '…' : ''}`,
        )
      })
      .catch(() => {})

    // La primera vez que se abre la app en este navegador, carga un mes de ejemplo para tener algo que mirar.
    if (!localStorage.getItem(CLAVE_PRIMERA_VEZ)) {
      localStorage.setItem(CLAVE_PRIMERA_VEZ, 'si')
      db.movimientos.count().then((n) => {
        if (n === 0) cargarEjemplo().catch(() => {})
      })
    }
  }, [])

  return (
    <div className="mx-auto min-h-dvh max-w-xl pb-28">
      <header className="sticky top-0 z-20 flex items-center justify-between bg-slate-100/90 px-4 py-3 backdrop-blur dark:bg-slate-950/90">
        <h1 className="text-xl font-extrabold tracking-tight">Mi panel</h1>
        <NavLink
          to="/ajustes"
          className="rounded-full bg-white px-3 py-1 text-sm shadow-sm dark:bg-slate-900"
          title="Cotización del dólar que usa la app"
        >
          {cot ? (
            <>
              <span className="text-slate-500">{NOMBRE_CASA[casa]}</span>{' '}
              <span className="font-semibold tabular-nums">{formatearCotizacion(cot.venta)}</span>
              {cot.fecha !== hoyISO() && <span className="ml-1 text-amber-500" title="No es de hoy">●</span>}
            </>
          ) : (
            <span className="text-amber-600 dark:text-amber-400">Cargar dólar</span>
          )}
        </NavLink>
      </header>

      <main className="space-y-4 px-4">
        {cantidadEjemplo > 0 && (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
            <span>Estás viendo datos de ejemplo.</span>
            <button className="cursor-pointer font-semibold underline" onClick={() => setConfirmarEjemplo(true)}>
              Borrarlos
            </button>
          </div>
        )}
        <Routes>
          <Route path="/" element={<Panel />} />
          <Route path="/movimientos" element={<Movimientos />} />
          <Route path="/plan" element={<Plan />} />
          <Route path="/cuentas" element={<Cuentas />} />
          <Route path="/ajustes" element={<Ajustes />} />
          <Route path="*" element={<Panel />} />
        </Routes>
      </main>

      <button
        onClick={() => setCargando(true)}
        aria-label="Cargar movimiento"
        className="fixed bottom-20 left-1/2 z-30 ml-[min(9.5rem,calc(50vw-4.5rem))] grid h-14 w-14 cursor-pointer place-items-center rounded-full bg-emerald-600 text-3xl leading-none text-white shadow-lg shadow-emerald-900/30 transition hover:bg-emerald-700 active:scale-95"
      >
        +
      </button>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] dark:border-slate-800 dark:bg-slate-900">
        <ul className="mx-auto flex max-w-xl">
          {SECCIONES.map((s) => (
            <li key={s.ruta} className="flex-1">
              <NavLink
                to={s.ruta}
                end
                className={({ isActive }) =>
                  `flex flex-col items-center gap-0.5 py-2 text-xs ${
                    isActive ? 'font-semibold text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'
                  }`
                }
              >
                <span className="text-xl">{s.icono}</span>
                {s.nombre}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {avisos.length > 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-36 z-[60] mx-auto flex max-w-xl flex-col gap-2 px-4" aria-live="polite">
          {avisos.map((a) => (
            <div
              key={a.id}
              role="status"
              className={`pointer-events-auto flex items-center gap-3 rounded-2xl px-4 py-3 text-sm shadow-lg ${TONO_AVISO[a.tono ?? 'info']}`}
            >
              <span className="flex-1">{a.texto}</span>
              {a.accion && (
                <button
                  className="cursor-pointer font-bold underline"
                  onClick={() => {
                    a.accion!.hacer()
                    cerrarAviso(a.id)
                  }}
                >
                  {a.accion.nombre}
                </button>
              )}
              <button aria-label="Cerrar aviso" className="cursor-pointer text-lg leading-none opacity-70" onClick={() => cerrarAviso(a.id)}>
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {cargando && <FormMovimiento onCerrar={() => setCargando(false)} />}
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
