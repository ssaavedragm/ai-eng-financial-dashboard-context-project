# Cómo funciona la aplicación

**Financial Metrics Dashboard** es un panel web que resume la situación financiera
de un negocio: cuánto entra, cuánto sale, cuánto queda y cómo evoluciona cada mes.

Los datos son **simulados**. No hay base de datos ni información real de ninguna
empresa, y nada se guarda entre una petición y la siguiente.

## Qué ve quien usa la aplicación

La aplicación tiene una sola página, con tres zonas:

| Zona | Qué muestra |
|---|---|
| **Cabecera** | El título "Financial Overview" y el periodo que cubren los datos, por ejemplo `Nov 2025 - Oct 2026` |
| **Cuatro tarjetas de indicadores (KPI)** | Ingresos totales, gastos totales, beneficio y margen de beneficio |
| **Dos gráficos mensuales** | Ingresos frente a gastos, y margen de beneficio en porcentaje |

La página solo muestra información: no tiene filtros, formularios ni inicio de
sesión. Los textos están en inglés, salvo el mensaje de error, que está en español.

## Cómo se organiza

La aplicación tiene dos partes, cada una en su propio contenedor de Docker:

```text
        Navegador
            |
            |  página y peticiones a /api
            v
   frontend (puerto 5173)      React: dibuja la página y calcula los indicadores
            |
            |  el proxy de Vite reenvía /api
            v
   backend (puerto 8000)       FastAPI: genera los datos y los sirve como JSON
```

- El **frontend** es lo que se ve y se ejecuta en el navegador.
- El **backend** es el servidor que entrega los datos.
- El **proxy de Vite** permite que el navegador pida todo al puerto 5173. Lo que
  empieza por `/api` se reenvía al backend.

## Qué pasa al abrir la página

1. El navegador carga `index.html`, que arranca `src/main.tsx`.
2. `main.tsx` monta el componente `App`.
3. Mientras no hay datos, tarjetas y gráficos muestran bloques animados de carga.
4. `App` hace dos peticiones al backend:
   - `/api/metrics` devuelve los 360 movimientos financieros.
   - `/api/metrics/facets` devuelve, entre otras cosas, la primera y la última fecha.
5. El backend genera los movimientos y los devuelve en formato JSON.
6. `App` calcula en el navegador los totales y los datos de cada mes.
7. Los componentes dibujan las tarjetas, los gráficos y el periodo de la cabecera.

Si falla la petición de movimientos, aparece un mensaje de error. Si solo falla la
del periodo, la página funciona igual y la cabecera no muestra esa etiqueta.

## El backend

Está en `backend/` y usa Python con FastAPI.

### `app/main.py`: el punto de entrada

Crea la aplicación FastAPI, configura CORS (qué sitios web pueden llamar a la API)
y registra las rutas definidas en `routes.py`.

### `app/routes.py`: toda la lógica

Este único archivo contiene cuatro cosas.

**1. Los modelos de datos.** Definen la forma de cada respuesta. El principal es
`FinancialMovement`, un movimiento financiero:

| Campo | Significado | Valores |
|---|---|---|
| `create_date` | Fecha | `AAAA-MM-DD` |
| `amount` | Importe | Número |
| `operation_type` | Tipo de operación | `income` (ingreso), `outcome` (gasto) |
| `category` | Categoría | `sales`, `suppliers`, `operational`, `administrative`, `others` |
| `business_type` | Tipo de negocio | `B2B` (a empresas), `B2C` (a consumidores) |

**2. La generación de datos.** `generate_mock_movements` crea 30 movimientos para
cada uno de los 12 meses, con estas reglas:

| Aspecto | Regla |
|---|---|
| Fechas | Los 12 meses completos anteriores al actual, entre los días 1 y 28 |
| Ingreso o gasto | Cada mes tiene entre un 45% y un 70% de probabilidad de ingreso |
| Ingresos | Entre 800 y 12.000; un 90% son `sales` y el resto `others` |
| Gastos | Entre 500 y 9.000, en una categoría de gasto elegida al azar |
| Tipo de negocio | Un 55% `B2B` y un 45% `B2C` |

Usa siempre la semilla aleatoria `42`, así que dos peticiones reciben los mismos
datos aunque se generen de nuevo cada vez. Las fechas sí avanzan con el calendario.

**3. Las funciones de cálculo.** Filtran y agregan los movimientos, sin depender de
HTTP, lo que facilita probarlas:

| Función | Qué hace |
|---|---|
| `filter_movements` | Filtra por fechas, categoría y tipo de operación |
| `build_metrics_facets` | Obtiene los valores disponibles y el rango de fechas |
| `summarize_movements` | Suma ingresos, gastos y neto por día, semana o mes |
| `build_top_categories` | Ordena las categorías por importe total |
| `calculate_net_value` | Calcula ingresos menos gastos |
| `detect_outcome_alerts` | Detecta periodos con gastos inusualmente altos |

**4. Las rutas de la API.** Todas son de lectura (`GET`):

| Ruta | Qué devuelve | ¿La usa la página? |
|---|---|---|
| `/health` | Confirma que el servidor funciona | No |
| `/api/metrics` | Los movimientos, con filtros opcionales | **Sí** |
| `/api/metrics/facets` | Valores disponibles y rango de fechas | **Sí** |
| `/api/metrics/b2b`, `/api/metrics/b2c` | Solo los movimientos de ese tipo de negocio | No |
| `/api/metrics/summary` | Ingresos, gastos y neto por periodo | No |
| `/api/metrics/categories/top` | Las categorías con mayor importe | No |
| `/api/metrics/comparison` | Neto de un periodo frente al anterior de igual duración | No |
| `/api/metrics/alerts` | Periodos cuyo gasto supera la media de los anteriores | No |

En `/api/metrics/alerts`, un periodo genera una alerta cuando su gasto supera la
media de los periodos anteriores en más de un 30%, salvo que se indique otro umbral.

Con el backend en marcha, todas se pueden probar desde http://localhost:8000/docs.

## El frontend

Está en `frontend/` y usa React y TypeScript.

### Arranque

| Archivo | Función |
|---|---|
| `index.html` | La página base, con el contenedor donde se monta la aplicación |
| `src/main.tsx` | Monta `App` dentro de esa página |
| `src/index.css` | Define Tailwind y los colores del tema |

### `src/App.tsx`: el coordinador

Es el componente principal. Pide los datos, llama a los cálculos, guarda el estado
de la página (datos, carga y error) y coloca todos los demás componentes.

### Componentes del panel (`src/components/dashboard/`)

| Componente | Función |
|---|---|
| `dashboard-header.tsx` | Muestra el título y, si está disponible, la etiqueta del periodo |
| `kpi-row.tsx` | Coloca las cuatro tarjetas y les da su texto, icono y valor con formato |
| `kpi-card.tsx` | Dibuja una tarjeta individual, con su color según el indicador |
| `income-outcome-chart.tsx` | Gráfico de líneas de ingresos y gastos por mes |
| `profit-percent-chart.tsx` | Gráfico de línea del margen mensual, con una referencia en el 0% |

Las tarjetas muestran bloques de carga y, si no hay datos, un guion. Los gráficos
muestran bloques de carga y, si no hay datos, el texto "No data available to display".

### Componentes base (`src/components/ui/`)

Son piezas genéricas que no saben nada de finanzas:

| Componente | Función |
|---|---|
| `card.tsx` | El contenedor con borde que usan tarjetas y gráficos, con sus partes de título y contenido |
| `skeleton.tsx` | El bloque animado que se muestra durante la carga |

### Lógica y datos (`src/lib/`)

| Archivo | Función |
|---|---|
| `financial-types.ts` | Define en TypeScript la forma de los datos de la API |
| `financial-utils.ts` | Calcula indicadores y datos mensuales, y da formato a moneda, porcentajes y periodos |
| `financial-utils.test.ts` | Pruebas de esos cálculos y formatos |
| `utils.ts` | La función `cn`, que combina clases de CSS |
| `mock-data.ts` | Datos de ejemplo de 2024. **Ningún archivo los usa** |

### Cómo se calculan los indicadores

| Indicador | Cálculo |
|---|---|
| Total Income | Suma de todos los ingresos |
| Total Outcome | Suma de todos los gastos |
| Profit | Ingresos menos gastos |
| Profit Margin | Beneficio dividido entre ingresos, por 100. Si no hay ingresos, es 0 |

Por ejemplo, con ingresos de $1.258.147 y gastos de $762.132, el beneficio es de
$496.015 y el margen del 39,4%. Son los valores que mostraba la página al comprobarla.

Los gráficos usan el mismo cálculo, pero agrupando los movimientos por mes.

## Docker y herramientas

`docker-compose.yml` levanta los dos servicios con `docker compose up --build`:

| Servicio | Puertos | Función |
|---|---|---|
| `frontend` | 5173 | Servidor de desarrollo de Vite |
| `backend` | 8000 y 5678 | La API, y un puerto para conectar un depurador (`debugpy`) |

Ambos servicios ven el código de tu carpeta, así que los cambios se aplican al
guardar, sin reconstruir nada. Solo hace falta reconstruir si cambian las dependencias.

Las pruebas están en `backend/tests/test_routes.py` (pytest) y en
`frontend/src/lib/financial-utils.test.ts` (Vitest). Las de frontend solo cubren los
cálculos y formatos, no cómo se ven los componentes.

## Limitaciones actuales

- **Datos simulados:** no reflejan ningún negocio real.
- **Sin interacción:** no hay filtros ni selección de fechas.
- **Rutas sin usar:** la página solo usa dos rutas de la API, y las demás únicamente
  se pueden consultar directamente.
- **Cálculos repetidos:** los totales mensuales existen en el frontend y en el backend.
- **Sin persistencia ni usuarios:** no hay base de datos ni inicio de sesión.

La lista completa de problemas conocidos está en
[current-state.md](../memory-bank/current-state.md).

## Glosario

| Término | Significado |
|---|---|
| **API** | Conjunto de rutas por las que un programa pide datos a otro |
| **JSON** | Formato de texto para intercambiar datos |
| **Frontend** | La parte que se ejecuta en el navegador |
| **Backend** | La parte que se ejecuta en el servidor |
| **Componente** | Pieza reutilizable de la interfaz en React |
| **KPI** | Indicador clave de rendimiento |
| **Proxy** | Intermediario que reenvía peticiones a otro servidor |
| **Contenedor** | Entorno aislado de Docker donde se ejecuta un servicio |
| **Semilla** | Valor inicial que hace repetibles los números aleatorios |
