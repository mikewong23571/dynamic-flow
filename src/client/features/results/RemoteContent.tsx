import { useEffect, useState } from 'react';
import { api } from '../../core/api';
import { errorText } from '../../core/format';
import { Button } from '../../components/ui/button';

type Page = {
  text: string;
  offset: number;
  characters: number;
  hasMore: boolean;
};
/** One bounded page stays in memory; opening a different source releases its body. */
export function RemoteContent({ url }: { url: string }) {
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<Page>();
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let live = true;
    setPage(undefined);
    setError('');
    void api<Page>(`${url}&offset=${offset}`)
      .then((value) => {
        if (live) setPage(value);
      })
      .catch((reason) => {
        if (live) setError(errorText(reason));
      });
    return () => {
      live = false;
    };
  }, [url, offset, retry]);
  return (
    <div className="artifact-value">
      <div className="artifact-value-mode">
        <Button
          size="sm"
          variant="ghost"
          disabled={!page || offset === 0}
          onClick={() => setOffset(Math.max(0, offset - 20_000))}
        >
          上一段
        </Button>
        <span className="meta-text">
          {page
            ? `${page.offset + 1}–${page.offset + page.text.length} / ${page.characters} 字符`
            : '正在读取…'}
        </span>
        <Button
          size="sm"
          variant="ghost"
          disabled={!page?.hasMore}
          onClick={() => setOffset(offset + 20_000)}
        >
          下一段
        </Button>
        <a href={`${url}&download=true`} download>
          下载完整内容
        </a>
      </div>
      {error && (
        <p role="alert">
          {error}{' '}
          <Button size="sm" variant="ghost" onClick={() => setRetry(retry + 1)}>
            重试
          </Button>
        </p>
      )}
      {page && <pre className="artifact-raw">{page.text}</pre>}
    </div>
  );
}
