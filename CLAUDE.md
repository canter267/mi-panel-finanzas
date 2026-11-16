# Mi panel de finanzas

## Objetivo

App web de finanzas personales para uso propio en Argentina: cargar gastos e ingresos en pesos o dólares,
ver en qué se va la plata y medir el ahorro en dólares. Costo cero: sin servidor, sin cuentas, sin API keys,
sin servicios en la nube y sin llamadas a IA desde la app. La especificación completa está en `SPEC.md`.

**Estado:** Fases 1 y 2 terminadas. Fase 3 pendiente (ver `SPEC.md`). No construir una fase sin plan aprobado.

## Stack

- Vite + React + TypeScript
- Tailwind CSS v4 (plugin `@tailwindcss/vite`; modo oscuro con la clase `dark` en `<html>`)
- Dexie.js sobre IndexedDB (+ `dexie-react-hooks` para consultas reactivas)
- Recharts (gráficos)
- react-router-dom con `HashRouter` (compatible con GitHub Pages)
- Vitest (+ `fake-indexeddb` para testear la base)
- `vite-plugin-pwa` (manifest + service worker con Workbox; `registerType: 'prompt'`, se registra en `main.tsx`)
- Publicación: GitHub Pages vía GitHub Actions (`.github/workflows/pages.yml`), en cada push a `main`

## Comandos

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Levanta la app en http://localhost:5173 |
| `npm run build` | Chequea tipos (`tsc`) y genera `dist/` |
| `npm run preview` | Sirve `dist/` para probar el build |
| `npm test` | Corre los tests una vez |
| `npm run test:watch` | Tests en modo watch |
| `node scripts/generar-iconos.mjs` | Regenera los PNG del ícono en `public/` (solo si cambia el ícono) |

El service worker no corre en `npm run dev`; para probar la PWA usar `npm run build` + `npm run preview`.

**Para probar la UI no usar `localhost:5173`:** ahí están los datos reales del usuario (IndexedDB es por origen).
Levantar otra copia en otro puerto (`npm run dev -- --port 5174`), que tiene su propia base y carga los datos de ejemplo.

## Estructura de carpetas

```
SPEC.md               Especificación (fuente de verdad)
backups/              Backups JSON que exporta el usuario (ignorados por git)
src/
  main.tsx, App.tsx   Arranque, layout, navegación inferior y botón "+"
  index.css           Tailwind + clases propias (.tarjeta, .campo, .boton-*)
  db/
    tipos.ts          Tipos de las 7 tablas
    db.ts             Esquema Dexie (versiones 1 a 3) y datos predefinidos (cuentas y categorías)
    ejemplo.ts        Cargar / borrar datos de ejemplo (marcados con `ejemplo: true`)
    recurrentes.ts    Genera al abrir la app los gastos fijos vencidos (una sola corrida a la vez)
  lib/                Lógica pura, sin React. Acá viven los tests (*.test.ts)
    dinero.ts         Centavos, parseo, formato "$ 12.345,67" / "US$ 1.234", conversión ARS/USD
    fechas.ts         Fechas AAAA-MM-DD <-> dd/mm/aaaa, meses
    calculos.ts       Totales del mes, tasa de ahorro, por categoría, 50/30/20, saldos
    cotizacion.ts     DolarApi + cache diaria + fallback
    backup.ts         Exportar / validar / importar JSON, exportar CSV
    tema.ts           Claro / oscuro / sistema
    plan.ts           Fase 2: presupuestos, alcancías, págate primero, cuotas, gastos fijos, comprometido
    preferencias.ts   Configuración de "págate primero" (localStorage)
    avisos.ts         Cartelitos (toasts): avisar() desde cualquier lado, App los dibuja
  componentes/        Piezas de UI reutilizables (Modal, FormMovimiento, Barra, datos.ts con los hooks)
    plan/             Secciones de la pantalla Plan: Presupuestos, Alcancias, GastosFijos, Comprometido
  pantallas/          Panel, Movimientos, Plan, Cuentas (y categorías), Ajustes
public/               Íconos de la PWA
scripts/              generar-iconos.mjs
.github/workflows/    pages.yml (publicación en GitHub Pages)
```

## Modelo de datos

Siete tablas en IndexedDB (base `mi-panel-finanzas`).

| Tabla | Campos | Notas |
| --- | --- | --- |
| cuentas | id, nombre, tipo (efectivo, banco, billetera, dolares), moneda (ARS, USD), saldo_inicial, orden, archivada | El saldo actual se calcula, no se guarda |
| categorias | id, nombre, tipo (gasto, ingreso), grupo (necesidad, gusto, ahorro), icono, color, archivada | Con movimientos no se borran: se archivan |
| movimientos | id, fecha, tipo (gasto, ingreso, transferencia, compra_usd), monto_centavos, moneda, cuenta_id, cuenta_destino_id, monto_destino_centavos, categoria_id, nota, cotizacion, casa_cotizacion, compra_id, cuota_n, cuotas_total, recurrente_id, creado, editado | Transferencias y compras de USD tienen cuenta origen y destino |
| cotizaciones | fecha, casa (oficial, blue, bolsa, tarjeta), compra, venta | Cache diaria de DolarApi; "bolsa" es el MEP. Clave: [fecha+casa] |
| presupuestos | mes (AAAA-MM), categoria_id, tope_centavos, moneda | Clave [mes+categoria_id]. Rige desde ese mes en adelante; tope 0 = sin tope |
| alcancias | id, nombre, meta_usd_centavos, fecha_objetivo, cuenta_id | El progreso es el saldo de su cuenta (una cuenta USD por alcancía) |
| recurrentes | id, plantilla (monto_centavos, moneda, cuenta_id, categoria_id, nota), frecuencia, dia_del_mes, activo, ultimo_mes_generado | Gastos fijos. `ultimo_mes_generado` no está en la spec: evita duplicar y regenerar lo borrado |

Cuentas predefinidas: Efectivo, Banco, Mercado Pago, PedidosYa (bono mensual que da la empresa; billetera en pesos) y Dólares.
Versiones del esquema Dexie: v2 agrega la cuenta PedidosYa a las bases ya creadas; v3 suma los índices
`movimientos.recurrente_id` y `alcancias.cuenta_id`. Cualquier cambio de esquema va en una versión nueva, nunca editando las anteriores.

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
6. Cuotas: una compra en N cuotas crea N movimientos con el mismo compra_id, uno por mes. Cada cuota cuenta como gasto en su mes.
7. Inflación (Fase 3): "pesos de hoy" = monto × (índice acumulado de hoy / índice acumulado del mes del gasto), armando el índice con las variaciones mensuales del IPC.
8. Borrar pide confirmación. Toda importación muestra una vista previa antes de guardar.

Decisiones tomadas en la Fase 1 (la spec no las define):

- Conversión ARS↔USD con el valor de **venta**. Casa por defecto: `bolsa` (MEP).
- "Total ahorrado en USD" = suma de los saldos actuales de las cuentas en dólares.
- Sin ingresos en el mes, la tasa de ahorro no se calcula (se muestra "—").
- 50/30/20: necesidades y gustos como % de los ingresos; ahorro = lo que queda.
- Importar un backup **reemplaza** todos los datos (previa vista previa y confirmación).
- Transferir entre cuentas de distinta moneda convierte con la cotización del movimiento (sirve para vender dólares).
- La primera vez que se abre la app en un navegador sin movimientos, carga sola los datos de ejemplo
  (mes anterior completo + mes actual hasta hoy) y muestra un cartel para borrarlos. Clave `ejemplo_ofrecido` en `localStorage`.

Decisiones tomadas en la Fase 2:

- **Saldos hasta hoy:** `saldoDeCuenta(cuenta, movs, hoy)` ignora movimientos con fecha futura, así las cuotas pendientes
  no bajan el saldo antes de tiempo. Los totales del mes sí cuentan cada cuota en su mes.
- **Cuotas:** el formulario pide el monto total; los centavos que sobran de dividir van a la primera cuota. Todas guardan la
  cotización del día de la compra. Máximo 60. Al editar una cuota se cambia solo esa (opcionalmente categoría, cuenta y nota
  de todas); al borrar se elige entre esa cuota o toda la compra.
- **Presupuestos:** verde, amarillo desde el 80%, rojo al llegar al 100%. Solo para el mes actual en la UI; un tope vale para
  los meses siguientes hasta que se cambie. Al guardar un gasto que cruza un umbral se muestra un aviso.
- **Alcancías:** cada una tiene su propia cuenta en USD. Sugerencia mensual = lo que falta / meses hasta la fecha objetivo
  (mínimo 1), redondeada para arriba. Borrar la alcancía no borra la cuenta.
- **Págate primero:** al guardar un ingreso nuevo de la categoría configurada (Sueldo por defecto) propone una compra de
  dólares por el % (20 por defecto) hacia la cuenta de la alcancía. Nunca se guarda sin que el usuario acepte.
- **Gastos fijos:** se generan solos al abrir la app cuando llega su día, con la cotización de esa fecha, y se avisa.
  Al crearlos no cargan nada hacia atrás. Si no hay ninguna cotización guardada, quedan pendientes.
- **Comprometido:** cuotas ya cargadas de cada mes + gastos fijos activos (los en USD, a la cotización de hoy), 6 meses.
- **PWA:** la app publicada es otro origen que `localhost`, con su propia base. Los datos se pasan con el backup.
  Las preferencias en `localStorage` (tema, casa, págate primero) no viajan en el backup.

## Formato e idioma

- Interfaz en español rioplatense (vos). Código y nombres de dominio también en español.
- Pesos: `$ 12.345,67`. Dólares: `US$ 1.234` (con decimales solo si no es un número redondo).
- Fechas: `dd/mm/aaaa`.
- Pensada primero para el celu (columna angosta, botones grandes), con modo oscuro.

## Cómo trabajar en este repo

- Un commit por función terminada, mensajes en español.
- Toda cuenta de plata va en `src/lib/` como función pura y con test.
- Mantener este archivo actualizado cuando cambie el stack, la estructura o una regla.
