# Spec 2: Tabla de alertas de anomalías en el dashboard principal

Lee antes las convenciones comunes en [README.md](README.md). Depende del estado
`startDate`/`endDate` de la [spec 1](01-date-range-filter.md).

## Objetivo

Debajo de los gráficos actuales, una tabla con los periodos en los que el gasto
subió por encima de lo esperado. El umbral lo ajusta el usuario. La tabla respeta
el filtro de fechas.

## Endpoint: `GET /api/metrics/alerts`

| Parámetro | Tipo | Valor por defecto | Esta funcionalidad lo envía |
|---|---|---|---|
| `threshold` | número `>= 0` | `0.3` | Sí, siempre |
| `group_by` | `day`, `week` o `month` | `month` | No; usa el valor por defecto, como los gráficos mensuales |
| `start_date` | `YYYY-MM-DD` | — | Solo si tiene valor |
| `end_date` | `YYYY-MM-DD` | — | Solo si tiene valor |
| `business_type` | `B2B` o `B2C` | — | No |

**Respuesta:** `MetricsAlert[]`, ordenada por periodo. Añade el tipo a
`financial-types.ts`:

```ts
export interface MetricsAlert {
  period: string           // "YYYY-MM" con group_by=month
  outcome_total: number    // gasto del periodo, redondeado a 2 decimales
  baseline_average: number // ver ajuste 1
  increase_ratio: number   // ratio con 4 decimales: 0.3970 = 39.70 %
}
```

Ejemplo real:

```json
{ "period": "2025-12", "outcome_total": 103378.98,
  "baseline_average": 41404.44, "increase_ratio": 1.4968 }
```

**Regla de la API** (`detect_outcome_alerts` en `routes.py`): un periodo es alerta
si `(outcome - baseline) / baseline > threshold`, con desigualdad estricta. La
media de referencia (`baseline`) se calcula con los periodos **anteriores dentro
del rango filtrado**. El primer periodo del rango nunca puede ser alerta.

## Ajustes entre la redacción del PM y la API

### 1. "Media móvil de los 3 períodos anteriores": la API no hace eso

`baseline_average` es la media de **todos** los periodos anteriores del rango
filtrado, no de los 3 últimos. Comprobado en el periodo `2026-03`:

| Cálculo | Valor |
|---|---|
| API (`baseline_average`) | 55334.29 |
| Media de todos los periodos anteriores | 55334.29 |
| Media de los 3 anteriores | 59977.58 |

**Resolución:** muestra el campo de la API tal cual y rotula la columna con lo que
mide de verdad: "Baseline (avg. of prior periods)". **No** recalcules una media de
3 periodos en el frontend: el resto de la fila (`increase_ratio` y el propio
criterio de alerta) usa la media de la API, y la fila se contradiría.
Si el PM necesita de verdad una media de 3 periodos, es un cambio de backend y va
en otra spec.

### 2. "Incremento porcentual": la API da un ratio

Muestra `formatPercent(increase_ratio * 100)`: `1.4968` se ve como `149.7%`.

### 3. Umbral "entre 0.01 y 1.0": la API no tiene máximo

La API acepta cualquier `threshold >= 0` (con `1.5` responde `200 []`) y rechaza
con `422` los negativos y lo que no es número. Los límites del PM se aplican en el
frontend:

- `<input type="number" min="0.01" max="1" step="0.01">`, con valor inicial `0.3`
  y etiqueta "Alert threshold (ratio)".
- Al lado, una ayuda con el umbral en porcentaje: "Alert when spending is more
  than {threshold*100}% above baseline".
- Si el valor está vacío, no es número o cae fuera de `[0.01, 1]`: **no hagas la
  petición**. Mantén la última tabla válida y muestra "Enter a value between 0.01
  and 1.0." con `role="alert"`.

### 4. "Outcome registrado"

Es el campo `outcome_total`. Formatéalo con `formatCurrency`.

## Efecto del filtro de fechas en los resultados

Esto puede sorprender al PM y al QA, así que la UI lo explica:

- Como la media solo usa periodos dentro del rango, **un rango de un solo mes
  siempre da 0 alertas** (comprobado con marzo y `threshold=0.01`).
- Si el rango empieza o termina a mitad de mes, ese mes cuenta con su gasto
  parcial. Eso cambia la media: de `2026-02-01` a `2026-04-30` sale 1 alerta, y de
  `2026-02-15` a `2026-04-30` salen 2.
- Bajo la tabla, cuando hay un filtro de fechas activo, muestra:
  "Baselines only use periods inside the selected date range."

## Cambios en el frontend

### Fetch (en `App.tsx`)

```ts
async function fetchMetricsAlerts(
  params: { threshold: number; startDate: string; endDate: string },
  signal?: AbortSignal,
): Promise<MetricsAlert[]>
```

- Mensaje de error: `Failed to fetch metrics alerts: ${status}`.
- Efecto con dependencias `[threshold, startDate, endDate]`. No hagas la petición
  si el umbral es inválido o si `startDate > endDate` (spec 1). Cancela la
  petición anterior.
- Para la query, reutiliza el helper de fechas de la spec 1.

### Componente nuevo: `src/components/dashboard/anomaly-alerts-table.tsx`

Props: `alerts: MetricsAlert[]`, `loading: boolean`, `error: string | null`,
`threshold: string` (el texto del input), `onThresholdChange` y
`dateFilterActive: boolean`.

- Envuelto en `Card`, como los gráficos, con el título "Spending anomalies".
- Va en su propia `<section aria-label="Spending anomalies">`, después de la
  sección de gráficos.

Columnas, en este orden:

| Encabezado | Valor |
|---|---|
| "Period" | `period` formateado como `"Dec 2025"` |
| "Outcome" | `formatCurrency(outcome_total)` |
| "Baseline (avg. of prior periods)" | `formatCurrency(baseline_average)` |
| "Increase" | `formatPercent(increase_ratio * 100)` |

Para formatear el periodo, exporta y reutiliza `formatMonthYearLabel` de
`financial-utils.ts`. Ya trabaja sobre el string `YYYY-MM` sin pasar por UTC.

Usa una `<table>` semántica con `<th scope="col">`, y alinea a la derecha las
columnas numéricas.

### Estados

| Situación | Resultado |
|---|---|
| Cargando | `Skeleton` con la cabecera de la tabla y 3 filas |
| `[]` | La tabla **no desaparece**: título, input y el mensaje "No spending anomalies above {threshold*100}% for this period." |
| Datos | Filas en el orden de la API |
| Falla la petición | El error dentro de la tarjeta: "Could not load spending anomalies." Las KPI y los gráficos no se ven afectados |
| Umbral inválido | El error del ajuste 3; la última tabla válida se mantiene |

El error de alertas vive en su propio estado de `App` (`alertsError`), separado del
error de página. Así un fallo de la tabla no tapa el resto del dashboard.

## Tests (`src/lib/`)

- `isValidThreshold(value: string): boolean`. Casos: `"0.01"` y `"1"` válidos;
  `"0"`, `"1.01"`, `""` y `"abc"` inválidos.
- `formatMonthYearLabel("2025-12")` devuelve `"Dec 2025"`, también con
  `vi.stubEnv("TZ", "America/Santiago")` y un periodo de enero.

## Criterios de aceptación

Usa los datos de cada momento. Los números de abajo son del 2026-11-14 y cambian
con el mes.

1. Con el umbral por defecto y sin fechas, la tabla tiene las mismas filas que
   `GET /api/metrics/alerts?threshold=0.3`.
2. Al subir el umbral hasta que la API devuelve `[]`, se ve el mensaje vacío y
   la tabla no desaparece.
3. Con un rango de un solo mes, se ve el mensaje vacío.
4. Con `1.5` o `0` en el input, no sale ninguna petición y aparece el error.
5. Los encabezados son exactamente los de la tabla de columnas.
