import * as React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import KuadrantDataView, {
  KuadrantDataViewColumn,
  useKuadrantDataViewPagination,
} from './KuadrantDataView';

type Item = { metadata: { name: string; namespace?: string; uid?: string } };

const columns: KuadrantDataViewColumn<Item>[] = [
  { id: 'name', title: 'Name', sort: 'metadata.name' },
];
const items = (...names: string[]): Item[] => names.map((name) => ({ metadata: { name } }));
const getRow = (item: Item) => [item.metadata.name];

const StatefulRowAction: React.FC<{
  item: Item;
  onDelete: (item: Item) => void;
}> = ({ item, onDelete }) => {
  const [isOpen, setIsOpen] = React.useState(false);

  return (
    <>
      <button type="button" onClick={() => setIsOpen((open) => !open)}>
        Actions for {item.metadata.name}
      </button>
      {isOpen && (
        <div role="menu">
          <button type="button" role="menuitem" onClick={() => onDelete(item)}>
            Delete {item.metadata.name}
          </button>
        </div>
      )}
    </>
  );
};

type ViewProps = {
  data?: Item[];
  loaded?: boolean;
  loadError?: Error | null;
  page?: number;
  perPage?: number;
};

const view = ({ data = [], loaded = true, ...props }: ViewProps = {}) => (
  <KuadrantDataView
    ariaLabel="Items"
    columns={columns}
    data={data}
    loaded={loaded}
    getRow={getRow}
    {...props}
  />
);

const PaginatedView: React.FC<{ data: Item[] }> = ({ data }) => {
  const { page, perPage, onSetPage } = useKuadrantDataViewPagination(data.length, 2);

  return (
    <>
      <button type="button" onClick={() => onSetPage(undefined, 3)}>
        Show page 3
      </button>
      <span>Current page: {page}</span>
      <KuadrantDataView
        ariaLabel="Paginated items"
        columns={columns}
        data={data}
        loaded
        page={page}
        perPage={perPage}
        getRow={getRow}
      />
    </>
  );
};

describe('KuadrantDataView', () => {
  afterEach(() => window.history.replaceState({}, '', '/'));

  it('sorts the full data set before selecting the current page', () => {
    render(view({ data: items('charlie', 'alice', 'bob'), page: 1, perPage: 2 }));

    const table = screen.getByRole('grid', { name: 'Items' });
    expect(within(table).getByRole('cell', { name: 'alice' })).toBeInTheDocument();
    expect(within(table).getByRole('cell', { name: 'bob' })).toBeInTheDocument();
    expect(within(table).queryByRole('cell', { name: 'charlie' })).not.toBeInTheDocument();
  });

  it.each(['Name', 'name'])('restores a descending sort from URL key %s', (sortBy) => {
    window.history.replaceState({}, '', `/?sortBy=${sortBy}&orderBy=desc`);
    render(view({ data: items('charlie', 'alice', 'bob'), page: 1, perPage: 2 }));

    const table = screen.getByRole('grid', { name: 'Items' });
    expect(within(table).getByRole('cell', { name: 'charlie' })).toBeInTheDocument();
    expect(within(table).getByRole('cell', { name: 'bob' })).toBeInTheDocument();
    expect(within(table).queryByRole('cell', { name: 'alice' })).not.toBeInTheDocument();
  });

  it('updates the URL without dropping existing query parameters or the hash', () => {
    window.history.replaceState({}, '', '/items?view=all#results');
    render(view({ data: items('alice') }));

    fireEvent.click(screen.getByRole('button', { name: 'Name' }));

    const params = new URLSearchParams(window.location.search);
    expect(params.get('sortBy')).toBe('name');
    expect(params.get('orderBy')).toBe('desc');
    expect(params.get('view')).toBe('all');
    expect(window.location.hash).toBe('#results');
  });

  it('renders loading, error, loaded, and empty watch states', () => {
    const { rerender } = render(view({ loaded: false }));
    expect(screen.getByRole('progressbar', { name: 'Loading' })).toBeInTheDocument();

    rerender(view({ loaded: false, loadError: new Error('Unable to watch items') }));
    expect(screen.getByText('Unable to watch items')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar', { name: 'Loading' })).not.toBeInTheDocument();

    rerender(view({ data: items('alice') }));
    expect(screen.getByRole('cell', { name: 'alice' })).toBeInTheDocument();

    rerender(view());
    expect(screen.queryByRole('cell', { name: 'alice' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(1);
  });

  it('clamps an out-of-range page when watched data shrinks', async () => {
    const { rerender } = render(
      <PaginatedView data={items('alpha', 'bravo', 'charlie', 'delta', 'echo')} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Show page 3' }));
    expect(screen.getByText('Current page: 3')).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'echo' })).toBeInTheDocument();

    rerender(<PaginatedView data={items('alpha')} />);
    expect(await screen.findByText('Current page: 1')).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'alpha' })).toBeInTheDocument();
  });

  it.each([
    ['resource UIDs', 'uid-alpha', 'uid-bravo'],
    ['the namespace/name fallback', undefined, undefined],
  ])(
    'closes a stateful row action when watched rows reorder using %s',
    (_label, alphaUid, bravoUid) => {
      const onDelete = jest.fn();
      const actionColumns: KuadrantDataViewColumn<Item>[] = [
        { id: 'name', title: 'Name' },
        { id: 'actions', title: 'Actions' },
      ];
      const getActionRow = (item: Item) => [
        item.metadata.name,
        { cell: <StatefulRowAction item={item} onDelete={onDelete} /> },
      ];
      const alpha = { metadata: { name: 'alpha', namespace: 'apps', uid: alphaUid } };
      const bravo = { metadata: { name: 'bravo', namespace: 'apps', uid: bravoUid } };
      const renderActionView = (data: Item[]) => (
        <KuadrantDataView
          ariaLabel="Action items"
          columns={actionColumns}
          data={data}
          loaded
          getRow={getActionRow}
        />
      );

      const { rerender } = render(renderActionView([alpha, bravo]));
      fireEvent.click(screen.getByRole('button', { name: 'Actions for alpha' }));
      expect(screen.getByRole('menuitem', { name: 'Delete alpha' })).toBeInTheDocument();

      rerender(renderActionView([bravo, alpha]));

      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      expect(onDelete).not.toHaveBeenCalled();
    },
  );

  it('labels body cells so narrow viewports stack them with field names', () => {
    const labelledColumns: KuadrantDataViewColumn<Item>[] = [
      { id: 'name', title: 'Name' },
      { id: 'status', title: <span>Status</span>, label: 'Status' },
      { id: 'namespace', title: 'Namespace' },
      { id: 'kebab', title: '' },
    ];
    const getLabelledRow = (item: Item) => [
      item.metadata.name,
      'Healthy',
      { cell: item.metadata.namespace },
      { cell: <button type="button">Actions</button> },
    ];

    render(
      <KuadrantDataView
        ariaLabel="Items"
        columns={labelledColumns}
        data={[{ metadata: { name: 'alpha', namespace: 'apps' } }]}
        loaded
        getRow={getLabelledRow}
      />,
    );

    const cells = screen.getAllByRole('cell');
    expect(cells[0]).toHaveAttribute('data-label', 'Name');
    expect(cells[1]).toHaveAttribute('data-label', 'Status');
    expect(cells[2]).toHaveAttribute('data-label', 'Namespace');
    expect(cells[3]).not.toHaveAttribute('data-label');
  });
});
