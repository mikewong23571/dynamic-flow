import { test, expect } from './fixtures';
import { interfaceFixture } from '../interface-fixture';

async function prepared(
  application: Parameters<typeof interfaceFixture>[0],
  omitPort = false,
) {
  const scenario = await interfaceFixture(application);
  const path = `/api/items/${scenario.item.id}/workspace`;
  let ws = scenario.ws;
  if (omitPort)
    ws = await scenario.post(`${path}/actions`, {
      action: 'saveUiProgram',
      baseRevision: ws.item.revision,
      expectedProgramId: ws.uiProgram.id,
      source: scenario.source.replace('inputPort: "records", ', ''),
    });
  ws = await scenario.post(`${path}/actions`, {
    action: 'run',
    baseRevision: ws.item.revision,
  });
  await expect
    .poll(async () => {
      ws = await (await application.app.request(path)).json();
      return ws.work.work.runs.at(-1)?.status;
    })
    .toBe('completed');
  const run = ws.work.work.runs.at(-1);
  ws = await scenario.post(`${path}/actions`, {
    action: 'publishDelivery',
    baseRevision: ws.item.revision,
    runId: run.id,
    output: 'records',
    programId: ws.uiProgram.id,
  });
  return { ...scenario, path, ws, run };
}

test('原生记录表单省略可推导端口时仍固定首编辑修订', async ({
  page,
  request,
  application,
}) => {
  const s = await prepared(application, true);
  await page.goto(`/items/${s.item.id}?tab=results`);
  await page
    .getByRole('checkbox', { name: '选择记录 R2', exact: true })
    .check();
  await page
    .getByRole('textbox', { name: '补充依据', exact: true })
    .fill('保留这份未提交依据');
  const baseline = s.ws.item.revision;
  await application.items.addEvidence(s.item.id, ['另一会话追加的新材料']);
  await expect(
    page.getByText('工作项已变化，当前输入仍基于编辑开始时的版本。'),
  ).toBeVisible();
  const sent = page.waitForRequest(
    (r) =>
      r.method() === 'POST' &&
      r.url().endsWith('/workspace/actions') &&
      r.postDataJSON()?.action === 'continueRecords',
  );
  await page
    .getByRole('button', { name: '补充并登记依据', exact: true })
    .click();
  expect((await sent).postDataJSON()).toMatchObject({
    baseRevision: baseline,
    inputPort: 'records',
  });
  await expect(
    page.getByRole('alert').filter({ hasText: '版本已变化' }).first(),
  ).toBeVisible();
  expect(
    (await (await request.get(s.path)).json()).item.receivedInputs,
  ).toHaveLength(2);
  await expect(
    page.getByRole('textbox', { name: '补充依据', exact: true }),
  ).toHaveValue('保留这份未提交依据');
  await page
    .getByRole('button', { name: '保留内容，使用当前版本', exact: true })
    .click();
  await page
    .getByRole('button', { name: '补充并登记依据', exact: true })
    .click();
  await expect
    .poll(async () => {
      const ws = await (await request.get(s.path)).json();
      return ws.item.receivedInputs.at(-1)?.value;
    })
    .toMatchObject({ record: { id: 'R2' }, note: '保留这份未提交依据' });
});

test('重开已结项子项时明确确认并同时重开已结项父项', async ({
  page,
  application,
}) => {
  const parent = await application.items.create({
    title: '已完成的整批任务',
    materials: [],
    goal: '核对范围',
    criteria: ['已核对'],
  });
  const child = await application.items.create({
    title: '已完成的子项',
    materials: [],
    goal: '核对这一项',
    parentId: parent.id,
    criteria: ['已核对'],
  });
  for (const item of [child, parent]) {
    await application.items.criteria(
      item.id,
      item.criteria.map((c) => ({ ...c, met: true, evidence: '实际人工核对' })),
    );
    await application.items.complete(item.id);
  }
  await page.goto(`/items/${child.id}?tab=results`);
  await page.getByRole('button', { name: /^完成条件 / }).click();
  await page
    .getByRole('dialog', { name: '完成条件', exact: true })
    .getByRole('button', { name: '重新打开', exact: true })
    .click();
  const reopen = page.getByRole('dialog', {
    name: '重新打开工作项',
    exact: true,
  });
  await reopen
    .getByLabel('重开原因', { exact: true })
    .fill('收到影响父项范围的新结论');
  await reopen.getByRole('button', { name: '重新打开', exact: true }).click();
  await expect(reopen).toContainText('此操作将同时重新打开：已完成的整批任务');
  expect((await application.items.get(parent.id)).status).toBe('completed');
  expect((await application.items.get(child.id)).status).toBe('completed');
  await expect(
    reopen.getByRole('textbox', { name: '重开原因', exact: true }),
  ).toHaveValue('收到影响父项范围的新结论');
  await reopen
    .getByRole('button', { name: '同时重开上级与本项', exact: true })
    .click();
  await expect(reopen).toBeHidden();
  expect((await application.items.get(parent.id)).status).toBe('open');
  expect((await application.items.get(child.id)).status).toBe('open');
});

test('方法预览成功不提供工作项正式发布入口或替换已发布成果', async ({
  page,
  application,
}) => {
  const s = await prepared(application);
  const delivery = s.ws.item.deliveries[0];
  const preview = await application.runs.start(s.item.workId, {
    definitionId: s.run.definitionId,
    scope: 'full',
    inputs: s.run.inputs,
    workItem: s.run.workItem,
    materials: s.run.materials,
    effectMode: 'preview',
  });
  await expect
    .poll(async () => {
      const work = await application.files.read(s.item.workId);
      return work.runs.find((r) => r.id === preview)?.status;
    })
    .toBe('completed');
  await page.goto(`/items/${s.item.id}?tab=results`);
  await expect(
    page.getByRole('columnheader', { name: '来件', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: '工作项更多操作' }).click();
  await expect(
    page.getByRole('menuitem', { name: '保留本轮成果', exact: true }),
  ).toBeDisabled();
  expect((await application.items.get(s.item.id)).deliveries[0].id).toBe(
    delivery.id,
  );
});
