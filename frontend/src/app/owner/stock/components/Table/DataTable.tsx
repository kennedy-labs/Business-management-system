import { ReactNode } from "react";

export interface ColumnDef<T> {
  key: string;
  header: string;
  cell: (item: T) => ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  columns: ColumnDef<T>[];
  data: T[];
  isLoading?: boolean;
  emptyMessage?: string;
  rowKey: (item: T) => string;
}

/**
 * Reusable data table component.
 * Handles loading states, empty states, and consistent styling.
 */
export default function DataTable<T>({
  columns,
  data,
  isLoading,
  emptyMessage = "No items found.",
  rowKey,
}: DataTableProps<T>) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />
        ))}
      </div>
    );
  }

  if (!data?.length) {
    return <p className="text-gray-500 py-6 text-center">{emptyMessage}</p>;
  }

  return (
    <table className="min-w-full divide-y divide-gray-200">
      <thead className="bg-gray-50">
        <tr>
          {columns.map((col) => (
            <th
              key={col.key}
              className={`px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${col.className || ""}`}
            >
              {col.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="bg-white divide-y divide-gray-200">
        {data.map((item) => (
          <tr key={rowKey(item)} className="hover:bg-gray-50">
            {columns.map((col) => (
              <td
                key={col.key}
                className={`px-6 py-4 whitespace-nowrap text-sm ${col.className || ""}`}
              >
                {col.cell(item)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

