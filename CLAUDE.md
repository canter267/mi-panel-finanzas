# Mi panel de finanzas

## Objetivo

App web de finanzas personales para uso propio en Argentina: cargar gastos e ingresos en pesos o dólares,
ver en qué se va la plata y medir el ahorro en dólares. Costo cero: sin servidor, sin cuentas, sin API keys,
sin servicios en la nube y sin llamadas a IA desde la app. La especificación completa está en `SPEC.md`.

**Estado:** Fase 1 terminada. Fases 2 y 3 pendientes (ver `SPEC.md`). No construir una fase sin plan aprobado.

## Stack

- Vite + React + TypeScript
- Tailwind CSS v4 (plugin `@tailwindcss/vite`; modo oscuro con la clase `dark` en `<html>`)
- Dexie.js sobre IndexedDB (+ `dexie-react-hooks` para consultas reactivas)
- Recharts (gráficos)
- react-router-dom con `HashRouter` (compatible con GitHub Pages)
- Vitest (+ `fake-indexeddb` para testear la base)
- `vite-plugin-pwa`: recién en la Fase 2

## Comandos

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Levanta la app en http://localhost:5173 |
| `npm run build` | Chequea tipos (`tsc`) y genera `dist/` |
| `npm run preview` | Sirve `dist/` para probar el build |
| `npm test` | Corre los tests una vez |
| `npm run test:watch` | Tests en modo watch |

## Estructura de carpetas

```
SPEC.md               Especificación (fuente de verdad)
backups/              Backups JSON que exporta el usuario (ignorados por git)
src/
  main.tsx, App.tsx   Arranque, layout, navegación inferior y botón "+"
  index.css           Tailwind + clases propias (.tarjeta, .campo, .boton-*)
  db/
    tipos.ts          Tipos de las 7 tablas
    db.ts             Esquema Dexie y datos predefinidos (cuentas y categorías)
    ejemplo.ts        Cargar / borrar datos de ejemplo (marcados con `ejemplo: true`)
  lib/                Lógica pura, sin React. Acá viven los tests (*.test.ts)
    dinero.ts         Centavos, parseo, formato "$ 12.345,67" / "US$ 1.234", conversión ARS/USD
    fechas.ts         Fechas AAAA-MM-DD <-> dd/mm/aaaa, meses
    calculos.ts       Totales del mes, tasa de ahorro, por categoría, 50/30/20, saldos
    cotizacion.ts     DolarApi + cache diaria + fallback
    backup.ts         Exportar / validar / importar JSON, exportar CSV
    tema.ts           Claro / oscuro / sistema
  componentes/        Piezas de UI reutilizables (Modal, FormMovimiento, etc.)
  pantallas/          Panel, Movimientos, Cuentas (y categorías), Ajustes
```

## Modelo de datos

Siete tablas en IndexedDB (base `mi-panel-finanzas`). Las tres últimas existen pero se usan desde la Fase 2.

| Tabla | Campos | Notas |
| --- | --- | --- |
| cuentas | id, nombre, tipo (efectivo, banco, billetera, dolares), moneda (ARS, USD), saldo_inicial, orden, archivada | El saldo actual se calcula, no se guarda |
| categorias | id, nombre, tipo (gasto, ingreso), grupo (necesidad, gusto, ahorro), icono, color, archivada | Con movimientos no se borran: se archivan |
| movimientos | id, fecha, tipo (gasto, ingreso, transferencia, compra_usd), monto_centavos, moneda, cuenta_id, cuenta_destino_id, monto_destino_centavos, categoria_id, nota, cotizacion, casa_cotizacion, compra_id, cuota_n, cuotas_total, recurrente_id, creado, editado | Transferencias y compras de USD tienen cuenta origen y destino |
| cotizaciones | fecha, casa (oficial, blue, bolsa, tarjeta), compra, venta | Cache diaria de DolarApi; "bolsa" es el MEP. Clave: [fecha+casa] |
| presupuestos | mes (AAAA-MM), categoria_id, tope_centavos, moneda | Fase 2 |
| alcancias | id, nombre, meta_usd_centavos, fecha_objetivo, cuenta_id | Fase 2 |
| recurrentes | id, plantilla, frecuencia, dia_del_mes, activo | Fase 2 |

Convenciones de implementación:

- `fecha` es un string `AAAA-MM-DD` (fecha local, sin hora). `creado` / `editado` son ISO con hora.
- `monto_centavos` está en la `moneda` del movimiento, que es siempre la moneda de `cuenta_id`.
- `monto_destino_centavos` está en la moneda de `cuenta_destino_id`.
- `cotizacion` son pesos por dólar (valor de **venta** de la casa elegida). Puede tener decimales: es una tasa, no un monto.
- `saldo_inicial` está en centavos, en la moneda de la cuenta.
- Cuentas, categorías y movimientos pueden llevar `ejemplo: true` (datos de ejemplo borrables).
- Preferencias (tema, casa de cotización por defecto) van en `localStorage`, no en la base.

## Reglas de negocio

1. Montos siempre en enteros (centavos), nunca decimales con coma flotante.
2. Cada movimiento guarda la cotización del día en que se cargó. Los totales de meses pasados no cambian cuando sube el dólar.
3. Totales del mes en USD: cada movimiento convertido con su propia cotización. Patrimonio actual: con la cotización de hoy.
4. Gasto = solo movimientos tipo gasto. Ingresos, transferencias y compras de dólares no suman al gasto.
5. Tasa de ahorro del mes = (ingresos − gastos) / ingresos.
6. Cuotas (Fase 2): una compra en N cuotas crea N movimientos con el mismo compra_id, uno por mes. Cada cuota cuenta como gasto en su mes.
7. Inflación (Fase 3): "pesos de hoy" = monto × (índice acumulado de hoy / índice acumulado del mes del gasto), armando el índice con las variaciones mensuales del IPC.
8. Borrar pide confirmación. Toda importación muestra una vista previa antes de guardar.

Decisiones tomadas en la Fase 1 (la spec no las define):

- Conversión ARS↔USD con el valor de **venta**. Casa por defecto: `bolsa` (MEP).
- "Total ahorrado en USD" = suma de los saldos actuales de las cuentas en dólares.
- Sin ingresos en el mes, la tasa de ahorro no se calcula (se muestra "—").
- 50/30/20: necesidades y gustos como % de los ingresos; ahorro = lo que queda.
- Importar un backup **reemplaza** todos los datos (previa vista previa y confirmación).

## Formato e idioma

- Interfaz en español rioplatense (vos). Código y nombres de dominio también en español.
- Pesos: `$ 12.345,67`. Dólares: `US$ 1.234` (con decimales solo si no es un número redondo).
- Fechas: `dd/mm/aaaa`.
- Pensada primero para el celu (columna angosta, botones grandes), con modo oscuro.

## Cómo trabajar en este repo

- Un commit por función terminada, mensajes en español.
- Toda cuenta de plata va en `src/lib/` como función pura y con test.
- Mantener este archivo actualizado cuando cambie el stack, la estructura o una regla.
