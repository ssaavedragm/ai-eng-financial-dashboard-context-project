# Spec 3: Vista comparativa B2B vs B2C

Lee antes las convenciones comunes en [README.md](README.md). Reutiliza el filtro
de fechas de la [spec 1](01-date-range-filter.md).

## Objetivo

Una segunda vista que compara los ingresos de B2B y B2C. Tiene dos tablas lado a
lado, una por línea de negocio, con sus categorías de ingreso, y debajo un gráfico
con el total de ingresos de cada una.

## Ajustes entre la redacción del PM y la API

### 1. "Nueva página": no hay router

El proyecto no tiene router (`memory-bank/tech-stack.md`), y añadir
`react-router` es una dependencia nueva que hay que pedir antes
(`.agents/rules/workflow.md`).

**Resolución:** dos pestañas dentro de `App.tsx`, "Overview" y "B2B vs B2C", con
el estado `view: "overview" | "business-comparison"`. No hay URL propia. Si el PM
quiere un enlace directo a la vista, eso requiere el router y va en otra spec.

### 2. "Top 5 categorías de ingreso": hay como mucho 2

El generador solo asigna a los ingresos las categorías `sales` y `others`. Con
`limit=5` la API devuelve como mucho 2 filas por línea de negocio (comprobado con
B2B y con B2C). Pide `limit=5` igualmente, como dice el PM, y no rellenes las
filas que faltan.

### 3. "Porcentaje sobre el total del grupo": la API no lo da

`CategoryEntry` no trae ni el total del grupo ni un porcentaje. **Resolución:**

- Total del grupo = suma de `total_amount` de las filas devueltas. Es exacto
  porque `limit=5` es igual al número de categorías que existen (5), así que no
  queda ninguna fuera. Comprobado: para B2B la suma de filas, la suma de
  `amount` de `/api/metrics/b2b?operation_type=income` y la suma de `income` de
  `/api/metrics/summary?operation_type=income&business_type=B2B` dan las tres
  `615540.72`.
- Porcentaje de cada fila = `total_amount / total_del_grupo * 100`, calculado en
  un helper puro de `src/lib/`. No lo calcules en el componente.
- Si el total del grupo es 0 (no hay filas), no calcules porcentajes y muestra el
  estado vacío.
- Los porcentajes redondeados pueden no sumar exactamente `100.0%`. Se acepta.

### 4. "Categorías disponibles desde el endpoint de facetas": no sirve para eso

`GET /api/metrics/facets` no acepta `business_type` (ignora los parámetros) y su
lista `categories` mezcla las categorías de ingreso y las de gasto (`suppliers`,
`operational`, `administrative`). Usarla para las filas pintaría categorías que
nunca tienen ingresos.

**Resolución:** las filas de cada tabla salen solo de la respuesta de
`/categories/top`. De facets se usan solo `min_date` y `max_date`, como
referencia del filtro de fechas (spec 1).

### 5. Endpoints con nombre parecido que no hay que usar

- `GET /api/metrics/comparison` compara el beneficio (`net`) de un rango con el
  del rango anterior de la misma duración. No compara B2B con B2C.
- `GET /api/metrics/b2b` y `/b2c` devuelven movimientos sueltos. Para esto
  bastan las sumas de `/categories/top`.

### 6. Filtro de fechas: compartido

El PM pide filtrar la comparativa por rango de fechas. **Resolución:** se usa el
mismo estado `dateRange` de la spec 1, compartido entre pestañas. El
componente `DateRangeControls` aparece encima del contenido en las dos vistas.

## Endpoint: `GET /api/metrics/categories/top`

Se hacen dos peticiones en paralelo (`Promise.all`), una por línea de negocio:

| Parámetro | Valor | Notas |
|---|---|---|
| `operation_type` | `income` | Por defecto es `outcome`, así que hay que enviarlo siempre |
| `limit` | `5` | Entero entre 1 y 20; fuera de ese rango, `422` |
| `business_type` | `B2B` y luego `B2C` | Distingue mayúsculas: `b2b` da `422` |
| `start_date` | `YYYY-MM-DD` | Solo si tiene valor |
| `end_date` | `YYYY-MM-DD` | Solo si tiene valor |

Este endpoint **no** acepta `category`: lo ignora en silencio.

**Respuesta:** `TopCategoriesResponse` (`CategoryEntry[]`), ordenada por
`total_amount` de mayor a menor. Los tipos están en `frontend/specs/api-types.ts`:

```ts
interface CategoryEntry {
  category: Category
  operation_type: OperationType
  total_amount: number // redondeado a 2 decimales
}
```

Ejemplo real con `business_type=B2B`:

```json
[{ "category": "sales", "operation_type": "income", "total_amount": 557903.97 },
 { "category": "others", "operation_type": "income", "total_amount": 57636.75 }]
```

Con un rango sin datos (por ejemplo `start_date=2030-01-01`) devuelve `200 []`.

## Cambios en el frontend

### Fetch (en `App.tsx`)

```ts
async function fetchTopIncomeCategories(
  params: TopCategoriesParams, // frontend/specs/param-types.ts
  signal?: AbortSignal,
): Promise<TopCategoriesResponse>
```

- Mensaje de error: `Failed to fetch top categories: ${status}`.
- El efecto depende de `[view, dateRange]` y solo hace la petición cuando
  `view === "business-comparison"`. Sáltalo si el rango es inválido (spec 1) y
  cancela la petición anterior.
- Pide B2B y B2C con `Promise.all`. Si falla cualquiera de las dos, no muestres
  datos parciales.

### Componentes, helpers y estados

`ViewTabs`, `BusinessComparisonView`, `BusinessCategoryTable` y
`BusinessIncomeChart` (props, disposición en dos paneles, panel vacío y qué
representan los dos puntos del gráfico) están en
[frontend/specs/components.md](../../frontend/specs/components.md#feature-3-b2b-vs-b2c-comparison-view).
Ahí también están los helpers `computeCategoryShares` y
`computeBusinessIncomeTotals`, y los tipos derivados `CategoryShare`,
`BusinessIncomeTotal` y `DashboardView`, que van en `src/lib/financial-types.ts`.

## Tests (`src/lib/`)

`computeCategoryShares`:

- Con `[]` devuelve `rows: []` y `groupTotal: 0`, sin dividir por cero.
- Con una sola fila, el resultado es 100.
- Con dos filas, los porcentajes son proporcionales y suman 100 dentro de una
  tolerancia.
- Conserva el orden de la API.

`computeBusinessIncomeTotals`: devuelve siempre 2 puntos, B2B primero, y un
total de 0 para una lista vacía.

## Criterios de aceptación

1. Sin fechas, el total de B2B en la tabla y en el gráfico es igual a la suma de
   `total_amount` de
   `/api/metrics/categories/top?operation_type=income&limit=5&business_type=B2B`.
   Lo mismo para B2C.
2. Las tablas solo listan las categorías que devuelve la API. Hoy son `Sales` y
   `Others`.
3. Cambiar las fechas en una pestaña también las cambia en la otra.
4. En la pestaña "Overview" no se hacen peticiones a `/categories/top`.
