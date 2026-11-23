import { useState } from 'react';
import type {
  InputItem,
  ItemInputSelection,
  Json,
} from '../../../shared/records';
import { DeferredDetails } from '../../components/DeferredContent';
import { ArtifactValue } from '../results/ArtifactValue';
import { ListPagination } from '../../components/Management';
function inputChoiceKey(selection: ItemInputSelection) {
  return selection.kind === 'material'
    ? `material:${selection.materialId}`
    : selection.kind === 'received'
      ? `received:${selection.inputId}`
      : selection.kind === 'child-results'
        ? `child-results:${selection.itemId}`
        : selection.kind === 'completion'
          ? `completion:${selection.itemId}:${selection.completionHistoryId}`
          : JSON.stringify(selection.source);
}
export function CompletionInputChoices({
  choices,
  selected,
  inputs,
  onChange,
}: {
  choices: ItemInputSelection[];
  selected: ItemInputSelection[];
  inputs: InputItem[];
  onChange: (selected: ItemInputSelection[]) => void;
}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const keys = new Set(selected.map(inputChoiceKey));
  return (
    <section aria-label="已确认结论">
      <div className="materials-list">
        {choices
          .slice((page - 1) * pageSize, page * pageSize)
          .map((choice, index) => {
            const value =
              choice.kind === 'completion'
                ? inputs.find((input) => {
                    const value = input.value;
                    return (
                      value &&
                      typeof value === 'object' &&
                      !Array.isArray(value) &&
                      value.itemId === choice.itemId
                    );
                  })?.value
                : undefined;
            const title =
              value &&
              typeof value === 'object' &&
              !Array.isArray(value) &&
              typeof value.title === 'string'
                ? value.title
                : `已确认结论 ${(page - 1) * pageSize + index + 1}`;
            return (
              <div key={inputChoiceKey(choice)} className="prepare-material">
                <input
                  type="checkbox"
                  aria-label={`使用 ${title}`}
                  checked={keys.has(inputChoiceKey(choice))}
                  onChange={(e) =>
                    onChange(
                      e.target.checked
                        ? [...selected, choice]
                        : selected.filter(
                            (item) =>
                              inputChoiceKey(item) !== inputChoiceKey(choice),
                          ),
                    )
                  }
                />
                <DeferredDetails summary={<strong>{title}</strong>}>
                  {() =>
                    value ? (
                      <ArtifactValue value={value} />
                    ) : (
                      <p>选择汇总方法后查看本次输入。</p>
                    )
                  }
                </DeferredDetails>
              </div>
            );
          })}
      </div>
      {choices.length > pageSize && (
        <ListPagination
          page={page}
          pageSize={pageSize}
          total={choices.length}
          onPage={setPage}
          onPageSize={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      )}
    </section>
  );
}
