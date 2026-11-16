import { Alcancias } from '../componentes/plan/Alcancias'
import { Comprometido } from '../componentes/plan/Comprometido'
import { GastosFijos } from '../componentes/plan/GastosFijos'
import { Presupuestos } from '../componentes/plan/Presupuestos'

/** Fase 2: todo lo que sirve para ahorrar con método. */
export default function Plan() {
  return (
    <div className="space-y-4">
      <Presupuestos />
      <Alcancias />
      <GastosFijos />
      <Comprometido />
    </div>
  )
}
