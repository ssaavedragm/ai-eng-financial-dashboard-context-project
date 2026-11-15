# Spec 1: Filtro de rango de fechas en el dashboard principal

Lee antes las convenciones comunes en [README.md](README.md).

## Objetivo

Dos inputs de fecha opcionales, inicio y fin, encima del contenido del dashboard.
Filtran todo lo que muestra hoy la página: las 4 KPI y los 2 gráficos. Cerca de
los inputs se muestra el rango disponible del dataset.

## Endpoints

### `GET /api/metrics/facets`: rango de referencia

- **Parámetros:** ninguno. Ignora cualquier parámetro que se le pase.
- **Respuesta** (`FacetsResponse` en `frontend/specs/api-types.ts`, con la misma
  forma que `MetricsFacets` de `financial-types.ts`):

  ```json
  { "operation_types": ["income","outcome"], "business_types": ["B2B","B2C"],
    "categories": ["administrative","operational","others","sales","suppliers"],
    "min_date": "2025-11-01", "max_date": "2026-10-28" }
  ```

  Los valores son de ejemplo y cambian con la fecha de hoy.

- **Uso:** `min_date` y `max_date` son el rango de referencia. No cambian con el
  filtro. La página ya lo pide una vez al montar; reutiliza esa misma respuesta y
  no hagas otra petición.

### `GET /api/metrics`: los datos filtrados

**Ajuste del PM:** el PM habla de "la extensión de filtros sobre el endpoint de
métricas". No hace falta extender nada: el endpoint ya acepta las fechas.

| Parámetro | Tipo | Obligatorio | Comportamiento comprobado |
|---|---|---|---|
| `start_date` | `YYYY-MM-DD` | No | Incluye movimientos con `create_date >= start_date` |
| `end_date` | `YYYY-MM-DD` | No | Incluye movimientos con `create_date <= end_date` |

También acepta `category` y `operation_type`, pero esta funcionalidad no los usa.

- **Respuesta:** `FinancialMovement[]` en orden cronológico; el tipo ya existe.
- **Casos comprobados:**
  - Un mes completo devuelve 30 movimientos.
  - Con solo `start_date` o solo `end_date`, el rango queda abierto por el otro lado.
  - Con `start_date > end_date`, devuelve `200 []`, no un error.
  - Un rango fuera del dataset devuelve `200 []`.
  - Un formato inválido (`2026-3-1`) o vacío devuelve `422`.

## Cambios en el frontend

### Estado (en `App.tsx`)

```ts
const [startDate, setStartDate] = useState<string>(""); // "" = sin límite
const [endDate, setEndDate] = useState<string>("");
```

Este estado lo comparten las specs 2 y 3. Defínelo en `App`, no dentro del
componente de los inputs.

### Fetch

Cambia `fetchFinancialData` a
`fetchFinancialData(range: DateRangeFilter, signal?: AbortSignal)`, con
`DateRangeFilter` de `frontend/specs/param-types.ts`. Convierte el estado a ese
tipo dejando fuera las claves vacías: `""` no se convierte en `start_date: ""`.

Mueve la llamada a un `useEffect` que dependa de `[startDate, endDate]`:

1. Si las dos fechas tienen valor y `startDate > endDate`, **no hagas la
   petición**. Muestra el error de validación (ver abajo) y deja las KPI y los
   gráficos en estado vacío.
2. Si no, pon `loading = true`, cancela la petición anterior y haz la nueva. Con
   la respuesta, recalcula `computeKPIs` y `computeMonthlyData` como hoy.

El fetch de facets sigue igual: una vez al montar, aparte de este efecto.

### Componente nuevo: `DateRangeControls` en `src/components/dashboard/date-range-controls.tsx`

No se llama `DateRangeFilter` porque ese nombre ya es el del tipo de query.
Props:

```ts
interface DateRangeControlsProps {
  startDate: string
  endDate: string
  minDate?: string // facets.min_date; undefined si /facets falló
  maxDate?: string // facets.max_date
  onStartDateChange: (value: string) => void
  onEndDateChange: (value: string) => void
}
```

- **Inputs:** dos `<input type="date">` con `<label>` visibles "Start date" y
  "End date". Pon `min={minDate}` y `max={maxDate}` cuando existan. Esos
  atributos solo guían el selector, no validan, así que la validación de abajo
  sigue haciendo falta.
- **Referencia de rango:** "Available data: {minDate} – {maxDate}", con las fechas
  tal cual en `YYYY-MM-DD`, el mismo formato que el input. Si facets falló, omite
  el texto y deja los inputs funcionando. Facets sigue siendo decorativo y no
  bloquea la página, como dice `frontend.md`.
- **Botón "Clear":** vacía las dos fechas. Solo se muestra si alguna tiene valor.
- **Error de validación:** si `startDate > endDate`, muestra debajo de los inputs
  "Start date must be on or before end date." con `role="alert"`.
- **Ubicación:** debajo de `DashboardHeader`, encima de la fila de KPI.

### Cabecera

`DashboardHeader` sigue mostrando el periodo completo del dataset desde facets.
No cambia con el filtro. Esto es una decisión de esta spec, porque el PM no lo
menciona.

### Estados

| Situación | Resultado |
|---|---|
| Cargando | Los skeletons actuales de KPI y gráficos |
| Rango sin movimientos | KPI a 0; gráficos con su mensaje actual "No data available to display" |
| `start > end` | No se hace la petición; error de validación; KPI y gráficos vacíos |
| Falla `/api/metrics` | El error de página actual de `App.tsx` |
| Falla `/facets` | Sin texto de referencia y sin `min`/`max`; el filtro sigue funcionando |

## Tests

En `src/lib/`, porque no hay setup de tests de componentes:

- Extrae a `src/lib/` un helper puro que construya la query, por ejemplo
  `toDateRangeFilter(startDate: string, endDate: string): DateRangeFilter`, que
  deja fuera las claves vacías. Pruébalo con:
  ambas vacías (query vacía), solo inicio, solo fin y ambas.
- Extrae `isValidDateRange(start, end): boolean`, que devuelve `true` si alguna
  está vacía. Pruébalo con fechas iguales (válido) y con el día 1 de un mes frente
  al último del anterior.

## Criterios de aceptación

1. Sin fechas, la petición es `GET /api/metrics` sin query y la página se ve como
   hoy.
2. Con un mes completo, la suma de ingresos de la KPI coincide con la suma de
   `amount` de los movimientos `income` de ese rango.
3. Con `start > end` no sale ninguna petición a `/api/metrics` y aparece el error.
4. El texto de referencia muestra `min_date` y `max_date` de `/facets`.
5. Pasan `npm test`, `npm run lint` y `npm run build`, y `npm test` también con
   `TZ=America/Santiago`.
