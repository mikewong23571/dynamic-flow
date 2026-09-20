import type { Definition, Json, Run } from '../../shared/records.ts';

export const PROFILE_FLOW_LABEL = '系统·数据剖析';

/**
 * 内置数据剖析流程：上传触发，[文件来源节点] → probe 判断规模，
 * 小文件直接拆分登记，大文件产出 schema 化洞见与 cleaned- 清洗制品。
 * file 为规范模板中的占位文件名，seed 时按实际上传文件实例化。
 */
export function buildProfileDefinition(file = ''): Definition {
  return {
    schemaVersion: 1,
    inputs: [],
    nodes: [
      {
        id: 'source',
        label: '上传文件',
        kind: 'file',
        mode: 'each',
        file: { name: file },
      },
      {
        id: 'probe',
        label: '识别格式与规模',
        kind: 'agent',
        mode: 'each',
        operation: 'map',
        task: '输入值是工作目录中一个上传文件的文件名。用 read 或 Node 脚本快速识别它的格式（kind，如 csv/xlsx/docx/pdf/txt）、字节数（bytes）、条目行数（rows，无法统计时为 null），并判断规模（scale）：内容能在一次阅读内完整看完（如几百行以内的文本）记 small，更大的文本或大型二进制文件记 large。preview 给出一两句内容摘要。只输出 JSON。',
        expectedOutput: {
          type: 'object',
          properties: {
            kind: { type: 'string' },
            bytes: { type: 'number' },
            rows: { type: ['number', 'null'] },
            scale: { enum: ['small', 'large'] },
            preview: { type: 'string' },
          },
          required: ['kind', 'bytes', 'scale'],
        },
      },
      {
        id: 'by-scale',
        label: '按规模分流',
        kind: 'branch',
        mode: 'all',
        condition: { field: 'scale', operator: 'equals', value: 'large' },
      },
      {
        id: 'register-small',
        label: '小文件直接拆分',
        kind: 'agent',
        mode: 'each',
        operation: 'map',
        task: '输入是上游识别为小文件的结果，其 preview 与输入值包含文件名。读取该文件全文，按内容自然边界（每条记录、每条反馈、每行表格）拆成独立条目，保持原文，不编造、不遗漏、不合并不同条目；表格保留表头与各列含义。只输出 {"materials": [...]}。',
        expectedOutput: {
          type: 'object',
          properties: {
            materials: {
              type: 'array',
              items: { type: 'string', minLength: 1 },
              minItems: 1,
              maxItems: 200,
            },
          },
          required: ['materials'],
        },
      },
      {
        id: 'profile',
        label: '大文件剖析与洞见',
        kind: 'agent',
        mode: 'each',
        operation: 'map',
        task: '输入是上游识别为大文件的结果，其 preview 与输入值包含文件名。剖析这个文件而不是搬运它：识别结构（表格的 sheet/列名/列含义/行数，文档的章节），统计关键分布（唯一键、类别、空值、重复、异常），抽样查看典型与异常记录，不逐行阅读。如格式不利于后续处理，写脚本生成 cleaned- 开头的清洗制品保存在当前目录。把洞见写成 JSON 保存到当前目录 cleaned-insight.json，字段固定为：overview（文件概况）、structure（结构/schema）、stats（关键统计）、qualityIssues（数据质量问题）、artifacts（制品文件名清单，无则空数组）、suggestions（对后续处理的建议）；写完后用脚本校验该文件是合法 JSON 且字段齐全。洞见必须来自真实查看过的数据，不得编造。最终回复用一两句话总结发现，不要输出 JSON 全文。',
        expectedOutput: { type: 'string' },
      },
    ],
    edges: [
      { from: ['source', 'output'], to: ['probe', 'input'] },
      { from: ['probe', 'output'], to: ['by-scale', 'input'] },
      { from: ['by-scale', 'unmatched'], to: ['register-small', 'input'] },
      { from: ['by-scale', 'matched'], to: ['profile', 'input'] },
    ],
    outputs: {
      materials: ['register-small', 'output'],
      insight: ['profile', 'output'],
    },
  };
}

/** 用实际上传文件名实例化规范定义中的来源节点。 */
export function withProfileFile(
  definition: Definition,
  file: string,
): Definition {
  const next = structuredClone(definition);
  const source = next.nodes.find((node) => node.kind === 'file');
  if (!source?.file) throw new Error('剖析定义缺少文件来源节点。');
  source.file.name = file;
  return next;
}

/** 从完成的剖析运行中取指定节点的成功输出值。 */
export function profileOutputs(run: Run, nodeId: string): Json[] {
  return run.results
    .filter((result) => result.nodeId === nodeId && result.status === 'completed')
    .flatMap((result) => Object.values(result.outputs).flat())
    .map((item) => item.value);
}
