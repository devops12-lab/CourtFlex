import type { CSSProperties, ReactNode } from "react";
import { cn } from "./cn";
import { Skeleton } from "./States";

export interface Column<Row> {
  key: string;
  header: string;
  cell: (row: Row) => ReactNode;
  /** Numbers and money: right-aligned, condensed tabular figures. */
  numeric?: boolean;
  /** Hide on phones to keep the table readable. */
  hideOnMobile?: boolean;
  className?: string;
}

interface DataTableProps<Row> {
  /** Read by screen readers; describe what the rows are. */
  caption: string;
  columns: Array<Column<Row>>;
  rows: Row[] | undefined;
  rowKey: (row: Row) => string;
  loading?: boolean;
  /** Shown when rows is an empty array. */
  empty?: ReactNode;
  onRowClick?: (row: Row) => void;
  /** Rows that can't be opened render as plain text. Defaults to every row. */
  isRowClickable?: (row: Row) => boolean;
  /** Accessible name for the row action, e.g. "Open invoice CF-INV-0112". */
  rowActionLabel?: (row: Row) => string;
  minWidth?: number;
}

/**
 * A ruled table: a heavy line under the header, court lines between rows.
 * On phones each row becomes a card: the first column as its title and the
 * rest as "label: value" lines, so nothing scrolls sideways.
 */
/** Phones: each row is a card. */
const cardRow =
  "max-sm:block max-sm:rounded-2xl max-sm:border max-sm:border-line-faint max-sm:bg-court-surface max-sm:p-4";

export function DataTable<Row>({
  caption,
  columns,
  rows,
  rowKey,
  loading,
  empty,
  onRowClick,
  isRowClickable = () => true,
  rowActionLabel,
  minWidth = 520,
}: DataTableProps<Row>) {
  if (!loading && rows && rows.length === 0 && empty) return <>{empty}</>;

  const cellClass = (c: Column<Row>, first: boolean) =>
    cn(
      "py-3 pr-4 align-middle last:pr-0",
      c.numeric && "text-right font-condensed",
      c.hideOnMobile && "hidden sm:table-cell",
      // Phones: a card line with its label on the left; the first column is the card's title.
      first
        ? "max-sm:block max-sm:pt-0 max-sm:pr-0 max-sm:pb-2 max-sm:text-left max-sm:text-base"
        : "max-sm:flex max-sm:items-baseline max-sm:justify-between max-sm:gap-4 max-sm:py-1.5 max-sm:pr-0 max-sm:text-right max-sm:before:shrink-0 max-sm:before:text-left max-sm:before:font-sans max-sm:before:font-normal max-sm:before:text-line-dim max-sm:before:content-[attr(data-label)]",
      c.className,
    );

  return (
    <div className="sm:overflow-x-auto">
      <table
        className="w-full text-left text-sm max-sm:block sm:min-w-(--table-min)"
        style={{ "--table-min": `${minWidth}px` } as CSSProperties}
      >
        <caption className="sr-only">{caption}</caption>
        <thead className="border-b-2 border-line text-line-dim max-sm:sr-only">
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={cn(
                  "py-2 pr-4 font-medium last:pr-0",
                  c.numeric && "text-right",
                  c.hideOnMobile && "hidden sm:table-cell",
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody aria-busy={loading || undefined} className="max-sm:flex max-sm:flex-col max-sm:gap-3">
          {loading &&
            Array.from({ length: 3 }, (_, i) => (
              <tr key={`sk-${i}`} className={cn("border-b court-line", cardRow)}>
                {columns.map((c, ci) => (
                  <td key={c.key} data-label={c.header} className={cellClass(c, ci === 0)}>
                    <Skeleton className={cn("h-4", c.numeric ? "ml-auto w-16" : "w-3/4")} />
                  </td>
                ))}
              </tr>
            ))}
          {!loading &&
            rows?.map((row) => {
              const clickable = !!onRowClick && isRowClickable(row);
              return (
                <tr
                  key={rowKey(row)}
                  className={cn(
                    "border-b court-line",
                    cardRow,
                    clickable && "cursor-pointer hover:bg-court-surface",
                  )}
                  onClick={clickable ? () => onRowClick!(row) : undefined}
                >
                  {columns.map((c, i) => (
                    <td key={c.key} data-label={c.header} className={cellClass(c, i === 0)}>
                      {i === 0 && clickable ? (
                        // The first cell carries a real button so rows work from the keyboard.
                        <button
                          type="button"
                          className="tap text-left font-semibold hover:underline max-sm:w-full"
                          aria-label={rowActionLabel?.(row)}
                          onClick={(e) => {
                            e.stopPropagation();
                            onRowClick!(row);
                          }}
                        >
                          {c.cell(row)}
                        </button>
                      ) : (
                        c.cell(row)
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
        </tbody>
      </table>
    </div>
  );
}
