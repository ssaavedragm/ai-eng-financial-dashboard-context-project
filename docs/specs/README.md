# Specs: filtro de fechas, alertas y comparativa B2B vs B2C

Specs para un coding agent, escritas a partir de lo que pidió el PM. Cada nombre de
campo, parámetro y caso límite se comprobó contra la API en marcha
(`/openapi.json` y llamadas reales) el 2026-11-14. Ver `verification.md`, sección
"Specs de funcionalidades".

| # | Spec | Toca backend |
|---|---|---|
| 1 | [Filtro de rango de fechas](01-date-range-filter.md) | No |
| 2 | [Tabla de alertas de anomalías](02-anomaly-alerts-table.md) | No |
| 3 | [Vista comparativa B2B vs B2C](03-b2b-vs-b2c-view.md) | No |

Ninguna funcionalidad necesita cambios en el backend: todos los parámetros que
hacen falta ya existen. Implementa en orden 1 → 2 → 3, porque 2 y 3 reutilizan el
estado de fechas de 1.

Lee también `.agents/rules/frontend.md`, `.agents/rules/api-contract.md` y
`.agents/rules/workflow.md`. Esta spec no las repite salvo donde importan.

## Convenciones comunes a las tres specs

### Patrón de fetch existente (`frontend/src/App.tsx`)

El código actual define funciones `async` a nivel de módulo, una por endpoint:

```ts
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

async function fetchMetricsFacets(): Promise<MetricsFacets> {
  const response = await fetch(`${API_BASE_URL}/api/metrics/facets`);
  if (!response.ok) {
    throw new Error(`Failed to fetch metrics facets: ${response.status}`);
  }
  return response.json();
}
```

Sigue ese patrón en las funciones nuevas, con estos ajustes:

- **Query string:** constrúyela con `URLSearchParams` y **omite** las claves vacías.
  No envíes nunca `start_date=` vacío: la API responde `422` a una fecha vacía o
  mal formada (comprobado con `start_date=2026-3-1`).
- **Cancelación:** acepta un `signal?: AbortSignal` y pásalo a `fetch`. El código
  actual solo hace fetch una vez al montar; las funcionalidades nuevas lo repiten
  en cada cambio de filtro, así que cancela la petición anterior en la limpieza
  del `useEffect` para que no gane una respuesta vieja. Ignora el `AbortError` en
  el `.catch`.
- **Mensaje de error:** conserva el formato `Failed to fetch <qué>: <status>`.
- **Tipos:** `response.json()` no se valida. Los tipos de respuesta y de query
  ya están escritos y verificados en `frontend/specs/api-types.ts` y
  `frontend/specs/param-types.ts`. Impórtalos desde ahí; no los copies a
  `financial-types.ts`. Ver `frontend/specs/README.md`.

### Parámetros que la API ignora en silencio

FastAPI **no** rechaza parámetros de query desconocidos: los ignora y responde
`200`. Comprobado:

- `GET /api/metrics/facets?start_date=2026-03-01` devuelve el rango completo.
- `GET /api/metrics/categories/top?category=sales` devuelve también `others`.

Así que un nombre de parámetro mal escrito no da error, sino datos sin filtrar.
Usa exactamente los nombres de cada spec.

### Fechas

- Formato `YYYY-MM-DD`, que es el valor nativo de `<input type="date">`.
- Los rangos incluyen ambos extremos.
- Compara fechas como strings (`start > end` funciona en ese formato). No uses
  `new Date("YYYY-MM-DD")`: se interpreta como medianoche UTC y da el día anterior
  en zonas detrás de UTC (ver `.agents/rules/frontend.md`).
- El dataset avanza con la fecha de hoy: cubre los 12 meses completos anteriores
  al actual. No escribas fechas fijas en código ni en tests; léelas de
  `/api/metrics/facets`.
- `max_date` es la fecha del último movimiento, no el fin de mes. El generador
  solo usa los días 1 a 28, así que `max_date` puede ser, por ejemplo, el día 28.

### Idioma de la interfaz

La UI está en inglés. Todos los textos nuevos van en inglés; esta spec los da
literalmente entre comillas.

## Ajustes entre la redacción del PM y la API real

Resumen. El detalle y la resolución están en cada spec.

| # | El PM dice | La API real | Se resuelve así |
|---|---|---|---|
| F1 | "extensión de filtros sobre el endpoint de métricas" | `GET /api/metrics` ya acepta `start_date` y `end_date` | No hay cambio de backend |
| F1 | Facets da "el rango de fechas disponible" | Correcto, pero `/facets` no acepta filtros | Se usa solo como referencia fija |
| F2 | "media móvil de los 3 períodos anteriores" | `baseline_average` es la media de **todos** los periodos anteriores dentro del rango | Columna "Baseline (avg. of prior periods)"; pendiente de confirmar con el PM |
| F2 | "incremento porcentual" | `increase_ratio` es un ratio (`1.4968` = 149.68 %) | Se muestra `increase_ratio * 100` |
| F2 | Umbral "entre 0.01 y 1.0" | La API acepta cualquier `threshold >= 0`, sin máximo | Los límites se aplican en el frontend |
| F2 | "outcome registrado" | Campo `outcome_total` | Mapeo directo |
| F3 | "nueva página" | No hay router en el proyecto | Pestañas con estado en `App.tsx`, sin dependencia nueva |
| F3 | "top 5 categorías de ingreso" | Los ingresos solo usan `sales` y `others`: la tabla tiene como mucho 2 filas | Se acepta; estado vacío si no hay filas |
| F3 | "porcentaje sobre el total del grupo" | La API no devuelve ni el total ni el porcentaje | Se calcula en `src/lib/` con la suma de las filas |
| F3 | Categorías "del endpoint de facetas" | `/facets` no filtra por línea de negocio e incluye categorías solo de gasto | Las filas salen de `/categories/top`; facets solo da el rango de fechas |
| F3 | (nombre) "comparativa" | `GET /api/metrics/comparison` compara el beneficio con el periodo anterior, no B2B con B2C | No se usa ese endpoint |
