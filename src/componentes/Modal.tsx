import { useEffect, type ReactNode } from 'react'

interface Props {
  titulo: string
  onCerrar: () => void
  children: ReactNode
}

/** Hoja que sube desde abajo en el celu y queda centrada en pantallas grandes. */
export function Modal({ titulo, onCerrar, children }: Props) {
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar()
    document.addEventListener('keydown', alTeclear)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', alTeclear)
      document.body.style.overflow = ''
    }
  }, [onCerrar])

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-4 pb-6 shadow-xl sm:rounded-3xl dark:bg-slate-900"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">{titulo}</h2>
          <button
            onClick={onCerrar}
            aria-label="Cerrar"
            className="grid h-9 w-9 cursor-pointer place-items-center rounded-full text-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

interface PropsConfirmar {
  titulo: string
  mensaje: ReactNode
  textoConfirmar?: string
  peligro?: boolean
  onConfirmar: () => void
  onCancelar: () => void
}

/** Regla 8: todo borrado pasa por acá. */
export function Confirmar({ titulo, mensaje, textoConfirmar = 'Borrar', peligro = true, onConfirmar, onCancelar }: PropsConfirmar) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div role="alertdialog" aria-label={titulo} className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900">
        <h3 className="text-lg font-bold">{titulo}</h3>
        <div className="mt-2 text-sm text-slate-600 dark:text-slate-300">{mensaje}</div>
        <div className="mt-5 flex gap-2">
          <button className="boton-secundario flex-1" onClick={onCancelar}>
            Cancelar
          </button>
          <button className={`${peligro ? 'boton-peligro' : 'boton-primario'} flex-1`} onClick={onConfirmar}>
            {textoConfirmar}
          </button>
        </div>
      </div>
    </div>
  )
}
