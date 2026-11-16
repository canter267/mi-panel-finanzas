import { Bar, BarChart, ResponsiveContainer, XAxis } from 'recharts'
import { formatearMonto } from '../../lib/dinero'
import { hoyISO, mesDe, nombreMes } from '../../lib/fechas'
import { comprometidoPorMes } from '../../lib/plan'
import { useCotizacionHoy, useMovimientos, useRecurrentes } from '../datos'

const MESES = 6
const COLOR_CUOTAS = '#6366f1'
const COLOR_FIJOS = '#f59e0b'

/** Cuánta plata ya está comprometida en los próximos meses, entre cuotas y gastos fijos. */
export function Comprometido() {
  const movimientos = useMovimientos() ?? []
  const recurrentes = useRecurrentes()
  const cotHoy = useCotizacionHoy()

  const datos = comprometidoPorMes(movimientos, recurrentes, mesDe(hoyISO()), MESES, cotHoy ?? 0).map((d) => ({
    ...d,
    etiqueta: nombreMes(d.mes).slice(0, 3),
    total: d.cuotas + d.fijos,
  }))
  const hayAlgo = datos.some((d) => d.total > 0)

  return (
    <section className="tarjeta">
      <h2 className="text-lg font-bold">Comprometido en los próximos meses</h2>
      <p className="mb-3 text-xs text-slate-500">Lo que ya sabés que vas a pagar: cuotas pendientes y gastos fijos.</p>

      {!hayAlgo ? (
        <p className="text-sm text-slate-500">
          No tenés cuotas ni gastos fijos. Para cargar una compra en cuotas, tocá + y completá el campo "Cuotas".
        </p>
      ) : (
        <>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={datos} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                <XAxis dataKey="etiqueta" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
                <Bar dataKey="cuotas" stackId="a" fill={COLOR_CUOTAS} isAnimationActive={false} />
                <Bar dataKey="fijos" stackId="a" fill={COLOR_FIJOS} radius={[4, 4, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-1 flex gap-4 text-xs text-slate-500">
            <span>
              <span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: COLOR_CUOTAS }} />
              Cuotas
            </span>
            <span>
              <span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: COLOR_FIJOS }} />
              Gastos fijos
            </span>
          </div>
          <table className="mt-3 w-full text-sm tabular-nums">
            <thead>
              <tr className="text-left text-xs text-slate-500">
                <th className="py-1 font-normal">Mes</th>
                <th className="py-1 text-right font-normal">Cuotas</th>
                <th className="py-1 text-right font-normal">Fijos</th>
                <th className="py-1 text-right font-normal">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {datos.map((d) => (
                <tr key={d.mes}>
                  <td className="py-1.5">{nombreMes(d.mes)}</td>
                  <td className="py-1.5 text-right">{formatearMonto(Math.round(d.cuotas / 100) * 100, 'ARS').slice(0, -3)}</td>
                  <td className="py-1.5 text-right">{formatearMonto(Math.round(d.fijos / 100) * 100, 'ARS').slice(0, -3)}</td>
                  <td className="py-1.5 text-right font-semibold">{formatearMonto(Math.round(d.total / 100) * 100, 'ARS').slice(0, -3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-slate-500">
            En pesos, sin centavos. El mes actual incluye las cuotas que ya pasaron este mes.
            {cotHoy === null && ' Falta la cotización de hoy para sumar los gastos fijos.'}
          </p>
        </>
      )}
    </section>
  )
}
