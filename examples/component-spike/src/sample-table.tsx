import { useMemo, useState } from 'react';
import {
  createColumnHelper,
  createSortedRowModel,
  rowSelectionFeature,
  rowSortingFeature,
  sortFn_text,
  tableFeatures,
  useTable,
} from '@tanstack/react-table';
import { ArrowUpDown, Search } from 'lucide-react';
import { Checkbox } from './components/ui/checkbox';
import { samples, type Sample } from './fixtures';

const features = tableFeatures({
  rowSelectionFeature,
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { text: sortFn_text },
});
const helper = createColumnHelper<typeof features, Sample>();
const columns = helper.columns([
  helper.accessor('id', { header: '样本', sortFn: 'text' }),
  helper.accessor('title', { header: '反馈', sortFn: 'text' }),
  helper.accessor('category', { header: '当前结果', sortFn: 'text' }),
  helper.accessor('score', { header: '置信度' }),
]);

export function SampleTable({
  selection,
  onSelection,
  focus,
  onFocus,
}: {
  selection: Record<string, true>;
  onSelection: React.Dispatch<React.SetStateAction<Record<string, true>>>;
  focus: string;
  onFocus: (id: string) => void;
}) {
  const [filter, setFilter] = useState('');
  const data = useMemo(
    () =>
      samples.filter((sample) =>
        `${sample.id} ${sample.title} ${sample.category}`
          .toLowerCase()
          .includes(filter.toLowerCase()),
      ),
    [filter],
  );
  const table = useTable({
    features,
    data,
    columns,
    getRowId: (row) => row.id,
    state: { rowSelection: selection },
    onRowSelectionChange: onSelection,
  });
  return (
    <div className="sample-table">
      <div className="panel-heading">
        <h2>样本</h2>
        <span>
          {Object.values(selection).filter(Boolean).length} / {samples.length}{' '}
          已选
        </span>
      </div>
      <label className="search">
        <Search size={15} />
        <input
          aria-label="筛选样本"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="筛选样本"
        />
      </label>
      <div className="table-scroll">
        <table>
          <thead>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                <th aria-label="选择" />
                {group.headers.map((header) => (
                  <th key={header.id}>
                    <button onClick={header.column.getToggleSortingHandler()}>
                      <table.FlexRender header={header} />
                      <ArrowUpDown size={12} />
                    </button>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                data-testid={`row-${row.id}`}
                data-focused={focus === row.id}
              >
                <td>
                  <Checkbox
                    aria-label={`选择 ${row.id}`}
                    checked={row.getIsSelected()}
                    onCheckedChange={(value) =>
                      row.toggleSelected(value === true)
                    }
                  />
                </td>
                {row.getAllCells().map((cell) => (
                  <td key={cell.id}>
                    {cell.column.id === 'title' ? (
                      <button
                        className="row-title"
                        onClick={() => onFocus(row.id)}
                      >
                        {row.original.title}
                      </button>
                    ) : cell.column.id === 'category' ? (
                      <span className={`badge ${row.original.category}`}>
                        {row.original.category}
                      </span>
                    ) : (
                      <table.FlexRender cell={cell} />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.length === 0 && <p className="empty">没有匹配的样本</p>}
    </div>
  );
}
