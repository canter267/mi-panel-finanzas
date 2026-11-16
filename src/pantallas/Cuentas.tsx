import { useState, type FormEvent } from 'react'
import { useCategorias, useCuentas, useMovimientos } from '../componentes/datos'
import { Confirmar, Modal } from '../componentes/Modal'
import { db } from '../db/db'
import type { Categoria, Cuenta, Grupo, Moneda, TipoCategoria, TipoCuenta } from '../db/tipos'
import { saldoDeCuenta } from '../lib/calculos'
import { centavosATexto, formatearMonto, parsearMonto } from '../lib/dinero'
import { hoyISO } from '../lib/fechas'

const TIPOS_CUENTA: Record<TipoCuenta, string> = {
  efectivo: 'Efectivo',
  banco: 'Banco',
  billetera: 'Billetera virtual',
  dolares: 'Dólares',
}
const ICONO_CUENTA: Record<TipoCuenta, string> = { efectivo: '💵', banco: '🏦', billetera: '📱', dolares: '💰' }
export const NOMBRE_GRUPO: Record<Grupo, string> = { necesidad: 'Necesidad', gusto: 'Gusto', ahorro: 'Ahorro' }
const COLORES = ['#16a34a', '#f97316', '#0ea5e9', '#6366f1', '#eab308', '#ef4444', '#a855f7', '#ec4899', '#14b8a6', '#64748b']

export default function Cuentas() {
  const cuentas = useCuentas()
  const categorias = useCategorias()
  const movimientos = useMovimientos() ?? []
  const [cuentaEditada, setCuentaEditada] = useState<Cuenta | null>(null)
  const [categoriaEditada, setCategoriaEditada] = useState<Categoria | null>(null)

  const nuevaCuenta = (): Cuenta => ({
    nombre: '',
    tipo: 'banco',
    moneda: 'ARS',
    saldo_inicial: 0,
    orden: Math.max(0, ...cuentas.map((c) => c.orden)) + 1,
    archivada: false,
  })
  const nuevaCategoria = (tipo: TipoCategoria): Categoria => ({
    nombre: '',
    tipo,
    grupo: 'necesidad',
    icono: tipo === 'gasto' ? '🧾' : '💵',
    color: COLORES[categorias.length % COLORES.length],
    archivada: false,
  })

  const filaCategoria = (c: Categoria) => (
    <li key={c.id}>
      <button
        onClick={() => setCategoriaEditada(c)}
        className={`flex w-full cursor-pointer items-center gap-3 py-2.5 text-left ${c.archivada ? 'opacity-50' : ''}`}
      >
        <span className="grid h-9 w-9 place-items-center rounded-full text-lg" style={{ backgroundColor: c.color + '33' }}>
          {c.icono}
        </span>
        <span className="flex-1">{c.nombre}</span>
        {c.archivada ? (
          <span className="text-xs text-slate-500">Archivada</span>
        ) : (
          c.tipo === 'gasto' && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {NOMBRE_GRUPO[c.grupo]}
            </span>
          )
        )}
      </button>
    </li>
  )
  const ordenadas = [...categorias].sort((a, b) => Number(a.archivada) - Number(b.archivada))

  return (
    <div className="space-y-4">
      <section className="tarjeta">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-lg font-bold">Cuentas</h2>
          <button className="boton-secundario" onClick={() => setCuentaEditada(nuevaCuenta())}>
            + Nueva
          </button>
        </div>
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {[...cuentas]
            .sort((a, b) => Number(a.archivada) - Number(b.archivada))
            .map((c) => {
              const saldo = saldoDeCuenta(c, movimientos, hoyISO())
              return (
                <li key={c.id}>
                  <button
                    onClick={() => setCuentaEditada(c)}
                    className={`flex w-full cursor-pointer items-center gap-3 py-3 text-left ${c.archivada ? 'opacity-50' : ''}`}
                  >
                    <span className="text-2xl">{ICONO_CUENTA[c.tipo]}</span>
                    <span className="flex-1">
                      <span className="block font-medium">{c.nombre}</span>
                      <span className="block text-xs text-slate-500">
                        {TIPOS_CUENTA[c.tipo]}
                        {c.archivada && ' · Archivada'}
                      </span>
                    </span>
                    <span className={`font-semibold tabular-nums ${saldo < 0 ? 'text-red-600 dark:text-red-400' : ''}`}>
                      {formatearMonto(saldo, c.moneda)}
                    </span>
                  </button>
                </li>
              )
            })}
        </ul>
        <p className="mt-2 text-xs text-slate-500">Tocá una cuenta para cambiarle el nombre o el saldo inicial.</p>
      </section>

      {(['gasto', 'ingreso'] as TipoCategoria[]).map((tipo) => (
        <section className="tarjeta" key={tipo}>
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-lg font-bold">{tipo === 'gasto' ? 'Categorías de gasto' : 'Categorías de ingreso'}</h2>
            <button className="boton-secundario" onClick={() => setCategoriaEditada(nuevaCategoria(tipo))}>
              + Nueva
            </button>
          </div>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {ordenadas.filter((c) => c.tipo === tipo).map(filaCategoria)}
          </ul>
        </section>
      ))}

      {cuentaEditada && (
        <FormCuenta
          cuenta={cuentaEditada}
          tieneMovimientos={movimientos.some(
            (m) => m.cuenta_id === cuentaEditada.id || m.cuenta_destino_id === cuentaEditada.id,
          )}
          onCerrar={() => setCuentaEditada(null)}
        />
      )}
      {categoriaEditada && (
        <FormCategoria
          categoria={categoriaEditada}
          tieneMovimientos={movimientos.some((m) => m.categoria_id === categoriaEditada.id)}
          onCerrar={() => setCategoriaEditada(null)}
        />
      )}
    </div>
  )
}

function FormCuenta({ cuenta, tieneMovimientos, onCerrar }: { cuenta: Cuenta; tieneMovimientos: boolean; onCerrar: () => void }) {
  const [nombre, setNombre] = useState(cuenta.nombre)
  const [tipo, setTipo] = useState(cuenta.tipo)
  const [moneda, setMoneda] = useState<Moneda>(cuenta.moneda)
  const [saldoTxt, setSaldoTxt] = useState(centavosATexto(cuenta.saldo_inicial) === '0' ? '' : centavosATexto(cuenta.saldo_inicial))
  const [negativo, setNegativo] = useState(cuenta.saldo_inicial < 0)
  const [error, setError] = useState('')
  const [confirmar, setConfirmar] = useState(false)
  const existe = cuenta.id != null

  async function guardar(e: FormEvent) {
    e.preventDefault()
    const saldo = saldoTxt.trim() === '' ? 0 : parsearMonto(saldoTxt)
    if (!nombre.trim()) return setError('Ponele un nombre a la cuenta.')
    if (saldo === null) return setError('El saldo inicial no es un monto válido.')
    await db.cuentas.put({ ...cuenta, nombre: nombre.trim(), tipo, moneda, saldo_inicial: negativo ? -saldo : saldo })
    onCerrar()
  }

  return (
    <Modal titulo={existe ? 'Editar cuenta' : 'Nueva cuenta'} onCerrar={onCerrar}>
      <form onSubmit={guardar} className="space-y-4">
        <div>
          <label className="etiqueta" htmlFor="c-nombre">Nombre</label>
          <input id="c-nombre" className="campo" value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus={!existe} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="etiqueta" htmlFor="c-tipo">Tipo</label>
            <select id="c-tipo" className="campo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoCuenta)}>
              {Object.entries(TIPOS_CUENTA).map(([id, n]) => (
                <option key={id} value={id}>{n}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="etiqueta" htmlFor="c-moneda">Moneda</label>
            <select
              id="c-moneda"
              className="campo"
              value={moneda}
              disabled={tieneMovimientos}
              onChange={(e) => setMoneda(e.target.value as Moneda)}
            >
              <option value="ARS">Pesos ($)</option>
              <option value="USD">Dólares (US$)</option>
            </select>
          </div>
        </div>
        {tieneMovimientos && <p className="-mt-2 text-xs text-slate-500">La moneda no se puede cambiar porque la cuenta ya tiene movimientos.</p>}
        <div>
          <label className="etiqueta" htmlFor="c-saldo">Saldo inicial (lo que había antes de empezar a cargar)</label>
          <input id="c-saldo" className="campo" inputMode="decimal" placeholder="0,00" value={saldoTxt} onChange={(e) => setSaldoTxt(e.target.value)} />
          <label className="mt-2 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={negativo} onChange={(e) => setNegativo(e.target.checked)} />
            Es una deuda (saldo negativo)
          </label>
        </div>
        {error && <p role="alert" className="text-sm font-medium text-red-600">{error}</p>}
        <div className="flex gap-2">
          {existe && (
            <button type="button" className="boton-secundario" onClick={() => setConfirmar(true)}>
              {tieneMovimientos ? (cuenta.archivada ? 'Desarchivar' : 'Archivar') : 'Borrar'}
            </button>
          )}
          <button type="submit" className="boton-primario flex-1">Guardar</button>
        </div>
      </form>
      {confirmar &&
        (tieneMovimientos ? (
          <Confirmar
            titulo={cuenta.archivada ? '¿Desarchivar la cuenta?' : '¿Archivar la cuenta?'}
            mensaje="Tiene movimientos, así que no se borra: se archiva. Sus movimientos quedan, pero deja de aparecer al cargar."
            textoConfirmar={cuenta.archivada ? 'Desarchivar' : 'Archivar'}
            peligro={false}
            onCancelar={() => setConfirmar(false)}
            onConfirmar={async () => {
              await db.cuentas.update(cuenta.id!, { archivada: !cuenta.archivada })
              onCerrar()
            }}
          />
        ) : (
          <Confirmar
            titulo={`¿Borrar "${cuenta.nombre}"?`}
            mensaje="No tiene movimientos. No se puede deshacer."
            onCancelar={() => setConfirmar(false)}
            onConfirmar={async () => {
              await db.cuentas.delete(cuenta.id!)
              onCerrar()
            }}
          />
        ))}
    </Modal>
  )
}

function FormCategoria({ categoria, tieneMovimientos, onCerrar }: { categoria: Categoria; tieneMovimientos: boolean; onCerrar: () => void }) {
  const [nombre, setNombre] = useState(categoria.nombre)
  const [grupo, setGrupo] = useState(categoria.grupo)
  const [icono, setIcono] = useState(categoria.icono)
  const [color, setColor] = useState(categoria.color)
  const [error, setError] = useState('')
  const [confirmar, setConfirmar] = useState(false)
  const existe = categoria.id != null

  async function guardar(e: FormEvent) {
    e.preventDefault()
    if (!nombre.trim()) return setError('Ponele un nombre a la categoría.')
    await db.categorias.put({ ...categoria, nombre: nombre.trim(), grupo, icono: icono.trim() || '🧾', color })
    onCerrar()
  }

  return (
    <Modal titulo={existe ? 'Editar categoría' : 'Nueva categoría'} onCerrar={onCerrar}>
      <form onSubmit={guardar} className="space-y-4">
        <div className="grid grid-cols-[1fr_5rem] gap-2">
          <div>
            <label className="etiqueta" htmlFor="k-nombre">Nombre</label>
            <input id="k-nombre" className="campo" value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus={!existe} />
          </div>
          <div>
            <label className="etiqueta" htmlFor="k-icono">Emoji</label>
            <input id="k-icono" className="campo text-center" maxLength={4} value={icono} onChange={(e) => setIcono(e.target.value)} />
          </div>
        </div>
        {categoria.tipo === 'gasto' && (
          <div>
            <span className="etiqueta">¿Qué tipo de gasto es? (para la regla 50/30/20)</span>
            <div className="flex gap-2">
              {(Object.keys(NOMBRE_GRUPO) as Grupo[]).map((g) => (
                <button
                  key={g}
                  type="button"
                  aria-pressed={grupo === g}
                  onClick={() => setGrupo(g)}
                  className={`flex-1 cursor-pointer rounded-xl border px-2 py-2 text-sm ${
                    grupo === g ? 'border-emerald-500 bg-emerald-50 font-semibold dark:bg-emerald-950' : 'border-slate-200 dark:border-slate-700'
                  }`}
                >
                  {NOMBRE_GRUPO[g]}
                </button>
              ))}
            </div>
          </div>
        )}
        <div>
          <span className="etiqueta">Color</span>
          <div className="flex flex-wrap gap-2">
            {[...new Set([...COLORES, categoria.color])].map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Color ${c}`}
                aria-pressed={color === c}
                onClick={() => setColor(c)}
                className={`h-8 w-8 cursor-pointer rounded-full ${color === c ? 'ring-2 ring-slate-900 ring-offset-2 dark:ring-white dark:ring-offset-slate-900' : ''}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
        {error && <p role="alert" className="text-sm font-medium text-red-600">{error}</p>}
        <div className="flex gap-2">
          {existe && (
            <button type="button" className="boton-secundario" onClick={() => setConfirmar(true)}>
              {tieneMovimientos ? (categoria.archivada ? 'Desarchivar' : 'Archivar') : 'Borrar'}
            </button>
          )}
          <button type="submit" className="boton-primario flex-1">Guardar</button>
        </div>
      </form>
      {confirmar &&
        (tieneMovimientos ? (
          <Confirmar
            titulo={categoria.archivada ? '¿Desarchivar la categoría?' : '¿Archivar la categoría?'}
            mensaje="Tiene movimientos, así que no se borra: se archiva. Sigue apareciendo en el historial, pero no al cargar."
            textoConfirmar={categoria.archivada ? 'Desarchivar' : 'Archivar'}
            peligro={false}
            onCancelar={() => setConfirmar(false)}
            onConfirmar={async () => {
              await db.categorias.update(categoria.id!, { archivada: !categoria.archivada })
              onCerrar()
            }}
          />
        ) : (
          <Confirmar
            titulo={`¿Borrar "${categoria.nombre}"?`}
            mensaje="No tiene movimientos. No se puede deshacer."
            onCancelar={() => setConfirmar(false)}
            onConfirmar={async () => {
              await db.categorias.delete(categoria.id!)
              onCerrar()
            }}
          />
        ))}
    </Modal>
  )
}
