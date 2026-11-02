import test from 'node:test';
import assert from 'node:assert/strict';
import { materialPresentation } from '../src/client/core/material';

test('material previews expose actual labels and repository refs without changing evidence', () => {
  const text = JSON.stringify({
    repository: 'repo/project',
    ref: { value: 'develop' },
    purpose: '候选映射待确认',
    evidence: ['原文'],
  });
  const material = { id: 'M02', text };
  assert.deepEqual(materialPresentation(material), {
    title: 'repo/project · develop',
    summary: '候选映射待确认',
    value: JSON.parse(text),
  });
  assert.equal(material.text, text);
  assert.equal(
    materialPresentation({
      id: 'M01',
      text: '# 扫描原始记录\n来自扫描表，两条待核实记录。',
    }).title,
    '扫描原始记录',
  );
  assert.equal(
    materialPresentation({
      id: 'M03',
      text: '{"label":"核查结果","source":{"resultId":"r1"}}',
    }).title,
    '核查结果',
  );
  assert.equal(
    materialPresentation({ id: 'M04', text: '[1,2]' }).title,
    '材料集合（2 项）',
  );
  const broken = '{this is incomplete';
  assert.equal(materialPresentation({ id: 'M05', text: broken }).value, broken);
  assert.equal(materialPresentation({ id: 'M06', text: '' }).title, '空材料');
});

test('large original files keep complete content while previews remain short and whitespace is normalized', () => {
  const text = `\n\n文件：records.json\n\n${'a'.repeat(2_000_000)}\n保留末尾`;
  const preview = materialPresentation({ id: 'M01', text });
  assert.equal(preview.title, '文件：records.json');
  assert.equal(preview.summary, 'a'.repeat(200) + '…');
  assert.equal(preview.value, text);
  const plain = materialPresentation({
    id: 'M02',
    text: '  # 标题  \n\n   第一段\t内容 \n 第二段  \n',
  });
  assert.equal(plain.title, '标题');
  assert.equal(plain.summary, '第一段 内容 第二段');
  assert.equal(
    materialPresentation({ id: 'M03', text: '标题\n \t\n' }).summary,
    '正文 6 字符',
  );
});
