interface ChartDataTableProps {
  caption: string
  columns: string[]
  rows: string[][]
}

// Visually hidden table with the same values as a chart, so screen reader
// users get a text alternative to the SVG (WCAG 1.1.1). The wrapper carries
// sr-only because a <table> ignores the 1px width and height on itself.
export function ChartDataTable({ caption, columns, rows }: ChartDataTableProps) {
  return (
    <div className="sr-only">
    <table>
      <caption>{caption}</caption>
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column} scope="col">
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map(([rowHeader, ...cells]) => (
          <tr key={rowHeader}>
            <th scope="row">{rowHeader}</th>
            {cells.map((cell, index) => (
              <td key={index}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  )
}
