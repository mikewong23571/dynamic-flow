export const samples = [
  {
    id: 's1',
    title: '登录后页面一直转圈',
    category: 'bug',
    expected: 'bug',
    score: 91,
  },
  {
    id: 's2',
    title: '希望支持导出 CSV',
    category: 'feature',
    expected: 'feature',
    score: 87,
  },
  {
    id: 's3',
    title: '导出失败，文件是空的',
    category: 'feature',
    expected: 'bug',
    score: 43,
  },
  {
    id: 's4',
    title: '深色主题很好看',
    category: 'praise',
    expected: 'praise',
    score: 96,
  },
  {
    id: 's5',
    title: '搜索找不到刚创建的项目',
    category: 'bug',
    expected: 'bug',
    score: 82,
  },
  {
    id: 's6',
    title: '增加按负责人筛选',
    category: 'feature',
    expected: 'feature',
    score: 89,
  },
];
export type Sample = (typeof samples)[number];
export const method = `type Feedback = { text: string };

export async function classify(input: Feedback, agent: Agent) {
  return agent.ask({
    instruction: "Classify as bug, feature, or praise.",
    text: input.text,
  });
}

interface Agent {
  ask(input: { instruction: string; text: string }): Promise<string>;
}
`;
export const candidateMethod = method.replace(
  'Classify as bug, feature, or praise.',
  'Classify as bug, feature, or praise. A broken existing feature is a bug.',
);
