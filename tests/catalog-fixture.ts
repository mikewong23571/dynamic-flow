import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  stringifyCatalog,
  type CatalogModel,
  type CatalogProvider,
} from '../src/server/assistant/catalog.ts';

/**
 * 测试目录种子：把过去 env 风格的配置写成 models.toml 并设为全局默认。
 * 正式运行时目录是唯一配置来源，测试同样走目录路径。
 */
export async function seedCatalog(
  root: string,
  entry: {
    baseUrl: string;
    model: string;
    apiKey: string;
    protocol?: 'anthropic' | 'openai' | 'openai-responses';
    alias?: string;
  },
  extraModels: CatalogModel[] = [],
): Promise<{ catalogPath: string; settingsPath: string }> {
  const catalogPath = join(root, 'models.toml');
  const settingsPath = join(root, 'model-settings.json');
  const alias = entry.alias ?? 'test/test';
  const providerName = alias.split('/')[0] || 'test';
  const provider: CatalogProvider = {
    name: providerName,
    type: entry.protocol ?? 'anthropic',
    baseUrl: entry.baseUrl,
    apiKey: entry.apiKey,
  };
  await writeFile(
    catalogPath,
    stringifyCatalog({
      providers: [provider],
      models: [
        {
          alias,
          provider: providerName,
          model: entry.model,
          displayName: entry.model,
          contextWindow: 128000,
          supportedEfforts: ['low', 'medium', 'high', 'max'],
          defaultEffort: 'medium',
        },
        ...extraModels,
      ],
    }),
  );
  await writeFile(
    settingsPath,
    JSON.stringify({ defaultSelection: { alias } }),
  );
  return { catalogPath, settingsPath };
}
