import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Bullseye, Spinner } from '@patternfly/react-core';
import {
  DataView,
  DataViewState,
  DataViewTable,
  isDataViewTdObject,
  isDataViewTrObject,
} from '@patternfly/react-data-view';
import type {
  DataViewTh,
  DataViewTr,
} from '@patternfly/react-data-view/dist/esm/DataViewTable/DataViewTable';
import type { K8sResourceCommon } from '@openshift-console/dynamic-plugin-sdk';
import { ISortBy, SortByDirection, Tbody, Td, ThProps, Tr } from '@patternfly/react-table';

export type KuadrantDataViewColumn<T> = {
  id: string;
  title: React.ReactNode;
  /** plain-text label stamped onto body cells for responsive stacking. required when title is not a string */
  label?: string;
  sort?: string | ((data: T[], direction: SortByDirection) => T[]);
  props?: Omit<ThProps, 'sort'>;
};

type PaginationEvent = React.MouseEvent | React.KeyboardEvent | MouseEvent | undefined;
type SortEvent = React.MouseEvent | React.KeyboardEvent | MouseEvent | undefined;

export const useKuadrantDataViewPagination = (itemCount: number, initialPerPage = 10) => {
  const [page, setPage] = React.useState(1);
  const [perPage, setPerPage] = React.useState(initialPerPage);
  const lastPage = Math.max(1, Math.ceil(itemCount / perPage));

  React.useEffect(() => {
    setPage((currentPage) => Math.min(currentPage, lastPage));
  }, [lastPage]);

  const onSetPage = React.useCallback((_event: PaginationEvent, pageNumber: number) => {
    setPage(pageNumber);
  }, []);

  const onPerPageSelect = React.useCallback((_event: PaginationEvent, perPageNumber: number) => {
    setPerPage(perPageNumber);
    setPage(1);
  }, []);

  const resetPage = React.useCallback(() => setPage(1), []);

  return { page, perPage, onSetPage, onPerPageSelect, resetPage };
};

type KuadrantDataViewProps<T extends K8sResourceCommon> = {
  ariaLabel: string;
  columns: KuadrantDataViewColumn<T>[];
  data: T[];
  getRow: (item: T) => DataViewTr;
  loaded: boolean;
  loadError?: Error | null;
  page?: number;
  perPage?: number;
  ouiaId?: string;
};

const getNestedValue = (value: unknown, path: string): unknown =>
  path.split('.').reduce((current, key) => {
    if (!current || typeof current !== 'object') {
      return undefined;
    }
    return (current as Record<string, unknown>)[key];
  }, value);

const compareValues = (left: unknown, right: unknown): number => {
  if (left === right) {
    return 0;
  }
  if (left === undefined || left === null) {
    return -1;
  }
  if (right === undefined || right === null) {
    return 1;
  }
  if (typeof left === 'number' && typeof right === 'number') {
    return left - right;
  }
  return String(left).localeCompare(String(right), undefined, {
    numeric: true,
    sensitivity: 'base',
  });
};

const getResourceRowKey = (resource: K8sResourceCommon): string =>
  resource.metadata?.uid ??
  [resource.apiVersion, resource.kind, resource.metadata?.namespace, resource.metadata?.name]
    .map((value) => value ?? '')
    .join(':');

// stacked (narrow) tables render the label next to each cell, so an action column
// with no header deliberately resolves to undefined rather than falling back to its id
const getColumnLabel = <T,>(column: KuadrantDataViewColumn<T>): string | undefined => {
  if (column.label !== undefined) {
    return column.label || undefined;
  }
  if (typeof column.title === 'string') {
    return column.title || undefined;
  }
  return column.id;
};

const decorateRowCells = (row: DataViewTr, rowKey: string, labels: (string | undefined)[]) => {
  const cells = isDataViewTrObject(row) ? row.row : row;
  const decorated = cells.map((cell, columnIndex) => {
    const key = `${rowKey}:${columnIndex}`;
    const dataLabel = labels[columnIndex];

    if (isDataViewTdObject(cell)) {
      return {
        ...cell,
        cell: <React.Fragment key={key}>{cell.cell}</React.Fragment>,
        props: { ...(dataLabel ? { dataLabel } : {}), ...cell.props },
      };
    }

    const keyedCell = <React.Fragment key={key}>{cell}</React.Fragment>;
    return dataLabel ? { cell: keyedCell, props: { dataLabel } } : keyedCell;
  });

  return isDataViewTrObject(row) ? { ...row, row: decorated } : decorated;
};

const getInitialSortBy = <T,>(columns: KuadrantDataViewColumn<T>[]): ISortBy => {
  const params =
    typeof window === 'undefined' ? undefined : new URLSearchParams(window.location.search);
  const sortByParam = params?.get('sortBy');
  const restoredIndex = sortByParam
    ? columns.findIndex(
        (column) =>
          Boolean(column.sort) &&
          (column.id === sortByParam ||
            String(column.title) === sortByParam ||
            column.sort === sortByParam),
      )
    : -1;
  const index =
    restoredIndex >= 0 ? restoredIndex : columns.findIndex((column) => Boolean(column.sort));

  return index >= 0
    ? {
        index,
        direction:
          restoredIndex >= 0 && params?.get('orderBy') === SortByDirection.desc
            ? SortByDirection.desc
            : SortByDirection.asc,
      }
    : {};
};

const KuadrantDataView = <T extends K8sResourceCommon>({
  ariaLabel,
  columns,
  data,
  getRow,
  loaded,
  loadError,
  page,
  perPage,
  ouiaId = 'KuadrantDataViewTable',
}: KuadrantDataViewProps<T>): React.ReactElement => {
  const { t } = useTranslation('plugin__kuadrant-console-plugin');
  const [sortBy, setSortBy] = React.useState<ISortBy>(() => getInitialSortBy(columns));

  const onSort = React.useCallback(
    (_event: SortEvent, index: number, direction: SortByDirection) => {
      const column = columns[index];
      const sortParam = column?.id;
      if (typeof window !== 'undefined' && sortParam) {
        const params = new URLSearchParams(window.location.search);
        params.set('sortBy', sortParam);
        params.set('orderBy', direction);
        window.history.replaceState(
          window.history.state,
          '',
          window.location.pathname + '?' + params.toString() + window.location.hash,
        );
      }
      setSortBy({ index, direction });
    },
    [columns],
  );

  const dataViewColumns = React.useMemo<DataViewTh[]>(
    () =>
      columns.map((column, columnIndex) => ({
        cell: column.title,
        props: {
          ...column.props,
          ...(column.sort
            ? {
                sort: {
                  columnIndex,
                  sortBy: {
                    ...sortBy,
                    defaultDirection: SortByDirection.asc,
                  },
                  onSort,
                },
              }
            : {}),
        },
      })),
    [columns, onSort, sortBy],
  );

  const visibleData = React.useMemo(() => {
    let sortedData = [...data];
    if (sortBy.index !== undefined) {
      const sortColumn = columns[sortBy.index];
      const direction = (sortBy.direction ?? SortByDirection.asc) as SortByDirection;
      if (typeof sortColumn?.sort === 'function') {
        sortedData = sortColumn.sort(sortedData, direction);
      } else if (typeof sortColumn?.sort === 'string') {
        sortedData.sort((left, right) =>
          compareValues(
            getNestedValue(left, sortColumn.sort as string),
            getNestedValue(right, sortColumn.sort as string),
          ),
        );
        if (direction === SortByDirection.desc) {
          sortedData.reverse();
        }
      }
    }

    if (page !== undefined && perPage !== undefined) {
      const startIndex = (page - 1) * perPage;
      return sortedData.slice(startIndex, startIndex + perPage);
    }
    return sortedData;
  }, [columns, data, page, perPage, sortBy]);

  const columnLabels = React.useMemo(() => columns.map(getColumnLabel), [columns]);

  const rows = React.useMemo(
    () =>
      visibleData.map((item) =>
        decorateRowCells(getRow(item), getResourceRowKey(item), columnLabels),
      ),
    [columnLabels, getRow, visibleData],
  );
  const activeState = loadError ? DataViewState.error : !loaded ? DataViewState.loading : undefined;

  const bodyStates = React.useMemo(
    () => ({
      [DataViewState.loading]: (
        <Tbody>
          <Tr>
            <Td colSpan={columns.length}>
              <Bullseye>
                <Spinner aria-label={t('Loading')} />
              </Bullseye>
            </Td>
          </Tr>
        </Tbody>
      ),
      [DataViewState.error]: (
        <Tbody>
          <Tr>
            <Td colSpan={columns.length}>{loadError?.message}</Td>
          </Tr>
        </Tbody>
      ),
    }),
    [columns.length, loadError?.message, t],
  );

  return (
    <DataView activeState={activeState}>
      <DataViewTable
        aria-label={ariaLabel}
        bodyStates={bodyStates}
        columns={dataViewColumns}
        gridBreakPoint="grid-lg"
        ouiaId={ouiaId}
        rows={rows}
        variant="compact"
      />
    </DataView>
  );
};

export default KuadrantDataView;
