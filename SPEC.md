# Mi panel de finanzas — especificación para Claude Code

Versión del 16/11/2026. Copia del documento "Mi panel de finanzas — investigación y brief para Claude Code".
Si cambia el documento original, volvé a pedir esta copia.

## Resumen

**Vamos a construir con Claude Code una app web propia, instalable en el celu y en la compu, que guarda los datos en el dispositivo y cuesta $0 usarla.** No necesita servidor, cuenta ni suscripción: la cotización del dólar y la inflación salen de APIs públicas gratuitas.

- **Qué hace:** cargás cada gasto e ingreso en segundos, en pesos o en dólares, y el panel muestra cuánto gastaste, en qué, y cuánto ahorraste, medido en dólares.
- **Por qué no usar una app existente:** las más completas de GitHub (Actual Budget, Firefly III, Sure) necesitan un servidor o Docker, y la conexión bancaria de Actual cubre Europa, Reino Unido, EE.UU. y Canadá. Lo argentino (dólar MEP/blue, cuotas con tarjeta, inflación del INDEC) lo sumamos nosotros.
- **Costo:** usar la app, $0. Construirla consume el uso incluido en el plan de Claude (Claude Code viene con Pro, Max o Ultra), sin pagos extra.
- **Límite a tener en cuenta:** los datos viven en cada dispositivo. Conviene elegir uno principal (el celu) para cargar gastos y mover datos entre equipos con el backup.

## Proyectos de referencia en GitHub

Estrellas aproximadas a noviembre de 2026.

| Proyecto | Qué es | Stack | Licencia | Estrellas | Lo que nos sirve |
| --- | --- | --- | --- | --- | --- |
| [Actual Budget](https://github.com/actualbudget/actual) | Presupuesto "por sobres" local-first | TypeScript | MIT | ~28k | Cada peso que entra se asigna a una categoría |
| [Firefly III](https://github.com/firefly-iii/firefly-iii) | Gestor completo, partida doble | PHP | AGPL-3.0 | ~25k | Alcancías de ahorro, reglas automáticas, gastos recurrentes |
| [Sure](https://github.com/we-promise/sure) (ex Maybe) | Finanzas + patrimonio, con Docker | Ruby, PostgreSQL, Redis | AGPL-3.0 | ~11k | Vista de patrimonio neto (demasiado pesada para uso personal) |
| [ezBookkeeping](https://github.com/mayswind/ezbookkeeping) | Contabilidad personal liviana | Go, Vue, SQLite | MIT | ~5.7k | Multimoneda con cotización automática, importar CSV/Excel, en español |
| [ExpenseOwl](https://github.com/tanq16/expenseowl) | Registro de gastos súper simple | Go, JSON | MIT | ~1.5k | Carga en 3 campos, torta mensual, sin internet, PWA |
| [WYGIWYH](https://github.com/eitchtee/WYGIWYH) | Finanzas sin presupuesto rígido | Django, PostgreSQL | AGPL-3.0 | ~900 | "Lo que ganás este mes es para este mes"; el ahorro no se toca |
| [Ledger](https://github.com/DSado88/ledger) | Panel pensado para Claude Code | Bun, SQLite, React | MIT | — | CLAUDE.md + comandos `/ledger-sync`; transferencias fuera del gasto |
| [claude-finance-dashboard](https://github.com/MahmoudHalat/claude-finance-dashboard) | Un prompt de Claude Code que arma un HTML offline | Python, ECharts | MIT | — | Detecta suscripciones; separa ingresos de transferencias |
| [money-tui](https://github.com/Viaaaron/money-tui) | Panel en la terminal, Claude carga los resúmenes | Python, SQLite | MIT | — | Modelo de 5 tablas; barras de presupuesto con alertas |
| [DolarApi](https://github.com/enzonotario/dolarapi.com) | API de cotizaciones del dólar en Argentina | EsJS | — | — | Oficial, blue, MEP, CCL, tarjeta; gratis, sin clave |
| [ArgentinaDatos](https://argentinadatos.com) | API de datos argentinos | — | — | — | Inflación mensual del INDEC, gratis |

## Ideas que copiamos

| Idea | De dónde | Cómo la usamos |
| --- | --- | --- |
| Cargar un gasto con 3 datos: monto, categoría, fecha | ExpenseOwl | Botón "+" siempre visible; fecha = hoy por defecto |
| El ahorro se separa al cobrar y no se toca | WYGIWYH | Al cargar el sueldo, la app propone pasar el % de ahorro a la alcancía |
| Alcancías con meta y barra de progreso | Firefly III | Metas en dólares: fondo de emergencia, viaje, etc. |
| Presupuesto por categoría con alertas | money-tui, Firefly III | Barra verde / amarilla al 80% / roja al pasarse |
| Las transferencias no son gasto | Ledger, claude-finance-dashboard | Comprar dólares o pasar plata entre cuentas no suma al gasto |
| Detectar suscripciones y su costo mensual real | claude-finance-dashboard | Lista de gastos fijos con total por mes |
| Reglas que categorizan solas | Firefly III, ezBookkeeping | "Si la nota dice Uber → Transporte" |
| Importar CSV con mapeo de columnas | ezBookkeeping | Para resúmenes de Mercado Pago o del banco |
| Datos locales y backup | ExpenseOwl, Ledger | Todo en el dispositivo; exportar/importar JSON |
| CLAUDE.md y comandos propios | Ledger | Claude Code guarda el contexto del proyecto y suma funciones sin perderse |

**Lo que dejamos afuera:** conexión automática con bancos (los servicios que usan estas apps no cubren Argentina) e IA dentro de la app (las APIs de IA se pagan por uso). El análisis con IA se hace pasándole el backup a Claude.

## Especificación del panel

La Fase 1 alcanza para empezar a ahorrar: cargar gastos, ver en qué se va la plata y separar el ahorro en dólares. Cada fase se construye y se prueba antes de pasar a la siguiente.

### Fase 1: lo mínimo para arrancar

- [ ] Carga rápida de gasto o ingreso: monto, moneda (ARS o USD), categoría, cuenta, fecha (hoy por defecto) y nota opcional.
- [ ] Cuentas con saldo: Efectivo, Banco, Mercado Pago, Dólares. Editables.
- [ ] Categorías predefinidas y editables: Súper y almacén, Delivery y salidas, Transporte (SUBE, nafta, apps), Alquiler y expensas, Servicios (luz, gas, agua, internet, celular), Salud y prepaga, Suscripciones, Ropa, Educación, Regalos, Mascotas, Imprevistos. Ingresos: Sueldo, Extras.
- [ ] Cada categoría marcada como Necesidad, Gusto o Ahorro, para comparar contra la regla 50/30/20.
- [ ] Cotización del día automática desde DolarApi: MEP por defecto, a elección oficial, blue o tarjeta. Se guarda con cada movimiento. Sin internet usa la última guardada o se carga a mano.
- [ ] Compra de dólares como movimiento propio: sale de pesos, entra en dólares y no cuenta como gasto.
- [ ] Panel del mes: ingresos, gastos, ahorro y tasa de ahorro (%); gastos por categoría; comparación con el mes anterior; total ahorrado en USD.
- [ ] Lista de movimientos con búsqueda, filtro por mes y categoría, editar y borrar.
- [ ] Backup: exportar e importar JSON; exportar CSV.
- [ ] Todo en español, montos como "$ 12.345,67" y "US$ 1.234", fechas dd/mm/aaaa, modo oscuro, cómoda en el celu.

### Fase 2: ahorrar con método

- [ ] Presupuesto mensual por categoría, con barra y aviso al 80% y al 100%.
- [ ] Alcancías (metas) en USD con objetivo, fecha y progreso; sugiere cuánto separar por mes.
- [ ] Págate primero: al cargar el sueldo, propone mover el % de ahorro a una alcancía.
- [ ] Gastos fijos y suscripciones: se cargan una vez y se repiten cada mes, con su total mensual.
- [ ] Compras en cuotas: una compra genera sus cuotas futuras y un gráfico muestra cuánto hay comprometido en los próximos meses.
- [ ] Instalable en el celu (PWA) y publicada gratis en GitHub Pages.

### Fase 3: ver más lejos

- [ ] Gasto ajustado por inflación: comparar meses en "pesos de hoy" con el IPC de ArgentinaDatos.
- [ ] Importar movimientos desde CSV o Excel (por ejemplo, el que deja bajar el banco), con mapeo de columnas.
- [ ] Reglas automáticas: "si la nota contiene X, categoría Y".
- [ ] Patrimonio total en USD mes a mes.
- [ ] Comando de Claude Code `/resumen-mes`: lee el backup y escribe un análisis del mes con 3 consejos concretos.

## Modelo de datos y reglas

Siete tablas alcanzan, y dos reglas evitan casi todos los errores: montos en centavos enteros y la cotización guardada en cada movimiento.

| Tabla | Campos | Notas |
| --- | --- | --- |
| cuentas | id, nombre, tipo (efectivo, banco, billetera, dolares), moneda (ARS, USD), saldo_inicial, orden, archivada | El saldo actual se calcula, no se guarda |
| categorias | id, nombre, tipo (gasto, ingreso), grupo (necesidad, gusto, ahorro), icono, color, archivada | Con movimientos no se borran: se archivan |
| movimientos | id, fecha, tipo (gasto, ingreso, transferencia, compra_usd), monto_centavos, moneda, cuenta_id, cuenta_destino_id, monto_destino_centavos, categoria_id, nota, cotizacion, casa_cotizacion, compra_id, cuota_n, cuotas_total, recurrente_id, creado, editado | Transferencias y compras de USD tienen cuenta origen y destino |
| cotizaciones | fecha, casa (oficial, blue, bolsa, tarjeta), compra, venta | Cache diaria de DolarApi; "bolsa" es el MEP |
| presupuestos | mes (AAAA-MM), categoria_id, tope_centavos, moneda | Fase 2 |
| alcancias | id, nombre, meta_usd_centavos, fecha_objetivo, cuenta_id | Fase 2; el progreso sale de los movimientos |
| recurrentes | id, plantilla del movimiento, frecuencia, dia_del_mes, activo | Fase 2; gastos fijos y suscripciones |

### Reglas de negocio

1. Montos siempre en enteros (centavos), nunca decimales con coma flotante.
2. Cada movimiento guarda la cotización del día en que se cargó. Los totales de meses pasados no cambian cuando sube el dólar.
3. Totales del mes en USD: cada movimiento convertido con su propia cotización. Patrimonio actual: con la cotización de hoy.
4. Gasto = solo movimientos tipo gasto. Ingresos, transferencias y compras de dólares no suman al gasto.
5. Tasa de ahorro del mes = (ingresos − gastos) / ingresos.
6. Cuotas: una compra en N cuotas crea N movimientos con el mismo compra_id, uno por mes. Cada cuota cuenta como gasto en su mes.
7. Inflación (Fase 3): "pesos de hoy" = monto × (índice acumulado de hoy / índice acumulado del mes del gasto), armando el índice con las variaciones mensuales del IPC.
8. Borrar pide confirmación. Toda importación muestra una vista previa antes de guardar.

## Stack técnico gratuito

Todo es código abierto y gratis: una app web estática que corre en el navegador, sin servidor propio ni cuentas.

| Pieza | Elección | Por qué | Costo |
| --- | --- | --- | --- |
| Base | Vite + React + TypeScript | Estándar, muy documentado, fácil de mantener con Claude Code | $0 |
| Estilos | Tailwind CSS | Interfaz prolija y modo oscuro sin diseñar desde cero | $0 |
| Datos | IndexedDB con Dexie.js | Base de datos dentro del navegador; anda sin internet | $0 |
| Gráficos | Recharts | Torta, barras y líneas listas para usar | $0 |
| Instalable | vite-plugin-pwa | Se instala en el celu como una app más | $0 |
| Tests | Vitest | Verifica los cálculos de plata | $0 |
| Cotización | [DolarApi](https://dolarapi.com/v1/dolares) | Sin clave. Devuelve un array con moneda, casa, nombre, compra, venta, fechaActualizacion para las casas oficial, blue, bolsa (MEP), contadoconliqui, mayorista, cripto y tarjeta | $0 |
| Inflación | [ArgentinaDatos](https://api.argentinadatos.com/v1/finanzas/indices/inflacion) | Array de {fecha: "AAAA-MM-DD" (último día del mes), valor}; valor parece ser la variación mensual del IPC en % (oct-2026: 2.2). Verificar antes de usar | $0 |
| Publicación | GitHub Pages | Gratis con repositorio público. El código queda público; los datos no, viven en el dispositivo | $0 |

### Arquitectura

```
                 GitHub Pages (Fase 2)
                 entrega el código de la app
                          |
                          v
Celu o compu  --->  [ Tu panel (app web) ]  <---  DolarApi (cotización del día)
(navegador o        |  Pantallas: carga,  |
 app instalada)     |  panel, movimientos |  <---  ArgentinaDatos (inflación, Fase 3)
                    |  IndexedDB: datos   |
                    |  solo en este disp. |
                          |
                          v
                    Backup JSON (fin de mes)
                     /                  \
                    v                    v
          Otro dispositivo         Claude: /resumen-mes (Fase 3)
          (importa el backup)
```

La app solo pide a internet la cotización y la inflación. Lo que se carga queda en el navegador del dispositivo y se mueve únicamente con el backup.

## Prompts para Claude Code

**Prompt 1: Fase 1**

```text
Leé SPEC.md completo. Es la especificación de mi panel de finanzas personales: uso personal, Argentina, pesos y dólares, costo cero.

No soy programador. Explicame cada paso en criollo y avisame antes de instalar cualquier cosa.

1. Antes de escribir código, mostrame un plan corto de la Fase 1 y esperá mi OK.
2. Creá un CLAUDE.md con: objetivo del proyecto, stack, comandos (dev, build, test), estructura de carpetas, modelo de datos y reglas de negocio de SPEC.md. Mantenelo actualizado.
3. Usá el stack de la sección "Stack técnico gratuito". Nada pago: sin cuentas, sin API keys, sin servicios en la nube y sin llamadas a IA desde la app.
4. Guardá los datos solo en el navegador (IndexedDB con Dexie). Exportar e importar backup JSON desde el primer día.
5. Montos como enteros en centavos. Cada movimiento guarda la cotización usada. Respetá las 8 reglas de negocio.
6. Cotización: usá https://dolarapi.com/v1/dolares, guardá una por día en la tabla cotizaciones y, si falla, usá la última guardada o pedime el valor.
7. Interfaz en español rioplatense, montos "$ 12.345,67" y "US$ 1.234", fechas dd/mm/aaaa, pensada primero para el celu, con modo oscuro.
8. Escribí tests con Vitest para conversiones ARS/USD, totales del mes, tasa de ahorro y saldos de cuentas.
9. Inicializá git y hacé un commit por cada función terminada.
10. Construí SOLO la Fase 1. Al terminar, cargá datos de ejemplo de un mes, explicame cómo abrir la app en mi compu y cómo borrar esos datos de ejemplo.
```

**Prompt 2: Fase 2**

```text
Leé CLAUDE.md y SPEC.md. La Fase 1 está terminada. Mostrame un plan de la Fase 2 y esperá mi OK. Después construila: presupuestos con alertas, alcancías en USD, "págate primero", gastos fijos y suscripciones, compras en cuotas (regla 6) y app instalable (PWA). Al final, guiame paso a paso para publicarla gratis en GitHub Pages e instalarla en mi celular. Recordame hacer un backup antes de cambiar de dispositivo.
```

**Prompt 3: Fase 3**

```text
Leé CLAUDE.md y SPEC.md. Construí la Fase 3, con un plan previo para que lo apruebe. Para la inflación usá https://api.argentinadatos.com/v1/finanzas/indices/inflacion y verificá primero qué significa cada campo. Además creá el comando /resumen-mes en .claude/commands/: que lea el backup JSON más reciente que yo deje en la carpeta backups/ y escriba resumenes/AAAA-MM.md con gastos por categoría, tasa de ahorro, comparación con el mes anterior y 3 consejos concretos.
```

## Cómo arrancar

1. Confirmá tu plan: Claude Code está incluido en Pro, Max y Ultra.
2. Abrí Claude Code: lo más fácil es la app Claude Desktop, pestaña "Code", con tu misma cuenta.
3. Abrí esta carpeta (`mi-panel-finanzas`) en Claude Code y pegá el Prompt 1. Aprobá el plan cuando te lo muestre.
4. Si te pide instalar Node.js, aceptá: es gratis y lo necesita para correr la app.
5. Probá la app en tu compu con los datos de ejemplo; después borralos y empezá con tus números reales.
6. Con la Fase 2 lista, instalala en el celu y usá el celu como dispositivo principal para cargar.

**El hábito pesa más que la app**

- Cargá cada gasto el mismo día, aunque sea chico.
- Una vez por semana, mirá el panel unos minutos.
- A fin de mes, exportá el backup y guardalo en `backups`.

## Fuentes

- [Actual Budget en GitHub](https://github.com/actualbudget/actual) y [sitio oficial](https://actualbudget.org/)
- [Firefly III en GitHub](https://github.com/firefly-iii/firefly-iii) y [documentación](https://docs.firefly-iii.org/explanation/firefly-iii/about/introduction/)
- [Sure en GitHub](https://github.com/we-promise/sure)
- [ezBookkeeping en GitHub](https://github.com/mayswind/ezbookkeeping)
- [ExpenseOwl en GitHub](https://github.com/tanq16/expenseowl)
- [WYGIWYH en GitHub](https://github.com/eitchtee/WYGIWYH)
- [Ledger en GitHub](https://github.com/DSado88/ledger)
- [claude-finance-dashboard](https://claude-finance-dashboard.choyin.workers.dev/llms.txt)
- [money-tui en GitHub](https://github.com/Viaaaron/money-tui)
- [DolarApi en GitHub](https://github.com/enzonotario/dolarapi.com) y [endpoint de cotizaciones](https://dolarapi.com/v1/dolares)
- [ArgentinaDatos, endpoint de inflación](https://api.argentinadatos.com/v1/finanzas/indices/inflacion)
- [Usar Claude Code con tu plan Pro o Max](https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-or-max-plan)
- [Crear un sitio de GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site)
