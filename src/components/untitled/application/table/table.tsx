'use client';

import type { ComponentPropsWithRef, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import type {
  CellProps as AriaCellProps,
  ColumnProps as AriaColumnProps,
  RowProps as AriaRowProps,
  TableHeaderProps as AriaTableHeaderProps,
  TableProps as AriaTableProps,
} from 'react-aria-components';
import { createContext, use } from 'react';
import {
  Cell as AriaCell,
  Column as AriaColumn,
  Row as AriaRow,
  Table as AriaTable,
  TableBody as AriaTableBody,
  TableHeader as AriaTableHeader,
} from 'react-aria-components';
import { cx } from '@/utils/cx';

const TableContext = createContext<{ size: 'sm' | 'md' }>({ size: 'md' });

type TableRootProps = AriaTableProps & Omit<ComponentPropsWithRef<'table'>, 'className' | 'slot' | 'style'> & {
  size?: 'sm' | 'md';
};

const TableRoot = ({ className, size = 'md', ...props }: TableRootProps) => {
  return (
    <TableContext value={{ size }}>
      <div className="overflow-x-auto">
        <AriaTable
          {...props}
          className={state => cx('min-w-full border-separate border-spacing-0', typeof className === 'function' ? className(state) : className)}
        />
      </div>
    </TableContext>
  );
};

type TableHeaderProps<T extends object>
  = & AriaTableHeaderProps<T>
    & Omit<ComponentPropsWithRef<'thead'>, 'children' | 'className' | 'slot' | 'style'>;

const TableHeader = <T extends object>({ className, ...props }: TableHeaderProps<T>) => {
  return (
    <AriaTableHeader
      {...props}
      className={state => cx('bg-ink-50', typeof className === 'function' ? className(state) : className)}
    />
  );
};

type TableHeadProps
  = & AriaColumnProps
    & Omit<ThHTMLAttributes<HTMLTableCellElement>, 'children' | 'className' | 'style' | 'id'>;

const TableHead = ({ className, children, ...props }: TableHeadProps) => {
  return (
    <AriaColumn
      {...props}
      className={state => cx(
        'border-b border-ink-100 px-6 py-3 text-left text-xs font-semibold tracking-[0.08em] text-ink-500 uppercase outline-hidden',
        typeof className === 'function' ? className(state) : className,
      )}
    >
      {children}
    </AriaColumn>
  );
};

type TableRowProps<T extends object>
  = & AriaRowProps<T>
    & Omit<ComponentPropsWithRef<'tr'>, 'children' | 'className' | 'onClick' | 'slot' | 'style' | 'id'>;

const TableRow = <T extends object>({ className, ...props }: TableRowProps<T>) => {
  return (
    <AriaRow
      {...props}
      className={state => cx(
        'bg-white transition-colors hover:bg-ink-50/60 [&>td]:border-b [&>td]:border-ink-100 last:[&>td]:border-b-0',
        typeof className === 'function' ? className(state) : className,
      )}
    />
  );
};

type TableCellProps
  = & AriaCellProps
    & Omit<TdHTMLAttributes<HTMLTableCellElement>, 'children' | 'className' | 'style' | 'id'>;

const TableCell = ({ className, children, ...props }: TableCellProps) => {
  const { size } = use(TableContext);

  return (
    <AriaCell
      {...props}
      className={state => cx(
        'align-top text-sm text-ink-600 outline-hidden',
        size === 'sm' ? 'px-5 py-3' : 'px-6 py-4',
        typeof className === 'function' ? className(state) : className,
      )}
    >
      {children}
    </AriaCell>
  );
};

const Table = TableRoot as typeof TableRoot & {
  Body: typeof AriaTableBody;
  Cell: typeof TableCell;
  Head: typeof TableHead;
  Header: typeof TableHeader;
  Row: typeof TableRow;
};

Table.Body = AriaTableBody;
Table.Cell = TableCell;
Table.Head = TableHead;
Table.Header = TableHeader;
Table.Row = TableRow;

export { Table };
