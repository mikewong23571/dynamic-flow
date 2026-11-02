# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: workitem-decomposition-lifecycle.spec.ts >> 批量启动窗口：等待与中断释放、恢复原Run和暂停新提交
- Location: tests/browser/workitem-decomposition-lifecycle.spec.ts:722:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('dialog', { name: '批量处理', exact: true }).getByRole('row').filter({ hasText: '窗口项 C' }).getByRole('cell', { name: '已完成', exact: true })
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByRole('dialog', { name: '批量处理', exact: true }).getByRole('row').filter({ hasText: '窗口项 C' }).getByRole('cell', { name: '已完成', exact: true }) with timeout 10000ms
  - waiting for getByRole('dialog', { name: '批量处理', exact: true }).getByRole('row').filter({ hasText: '窗口项 C' }).getByRole('cell', { name: '已完成', exact: true })

```

```yaml
- dialog "批量处理":
  - heading "批量处理" [level=2]
  - paragraph: 批量处理
  - text: 处理方法
  - combobox "处理方法" [disabled]:
    - option "沿用各项方法" [selected]
    - option "等待或直接核查"
  - text: 已启动 6 可启动 2 需补充 0
  - table:
    - rowgroup:
      - row "工作项 处理状态 操作":
        - columnheader "工作项"
        - columnheader "处理状态"
        - columnheader "操作"
    - rowgroup:
      - row "窗口项 A 已完成 查看":
        - cell "窗口项 A"
        - cell "已完成"
        - cell "查看":
          - button "查看"
      - row "窗口项 B 等待事件 查看":
        - cell "窗口项 B"
        - cell "等待事件"
        - cell "查看":
          - button "查看"
      - row "窗口项 C 等待事件 查看":
        - cell "窗口项 C"
        - cell "等待事件"
        - cell "查看":
          - button "查看"
      - row "窗口项 D 已中断 查看":
        - cell "窗口项 D"
        - cell "已中断"
        - cell "查看":
          - button "查看"
      - row "窗口项 E 等待事件 查看":
        - cell "窗口项 E"
        - cell "等待事件"
        - cell "查看":
          - button "查看"
      - row "窗口项 F 等待事件 查看":
        - cell "窗口项 F"
        - cell "等待事件"
        - cell "查看":
          - button "查看"
      - row "窗口项 G 可启动 查看":
        - cell "窗口项 G"
        - cell "可启动"
        - cell "查看":
          - button "查看"
      - row "窗口项 H 可启动 查看":
        - cell "窗口项 H"
        - cell "可启动"
        - cell "查看":
          - button "查看"
  - button "准备输入"
  - button "启动就绪项"
  - button "关闭"
```

# Test source

```ts
  783 |         key: `WINDOW-${n}`,
  784 |         goal: '核查',
  785 |         parentId: parent.id,
  786 |         workflowId: work.id,
  787 |         materials: [],
  788 |         receivedInputs: [0, 1].map((i) => ({
  789 |           label: `目标${i}`,
  790 |           value: { wait: n < 2, index: i },
  791 |         })),
  792 |       }),
  793 |     );
  794 |   // Stable row order is part of this explicit fixture, independent of UUID tie-breaking.
  795 |   for (let n = 0; n < children.length; n++) {
  796 |     const child = await item(children[n].id);
  797 |     child.progressAt = new Date(Date.UTC(2026, 0, 20 - n)).toISOString();
  798 |     await writeFile(
  799 |       join(root, 'work-items', `${child.id}.json`),
  800 |       JSON.stringify(child),
  801 |     );
  802 |   }
  803 |   const activeCount = async () => {
  804 |     const states = (await application.files.read(work.id)).runs.map(
  805 |       (r) => r.status,
  806 |     );
  807 |     const active = states.filter((s) =>
  808 |       ['queued', 'running', 'stopping'].includes(s),
  809 |     ).length;
  810 |     runPeak = Math.max(runPeak, active);
  811 |     return active;
  812 |   };
  813 |   await openItem(page, parent.key);
  814 |   const area = await childrenTab(page);
  815 |   await area.getByRole('checkbox', { name: '选择本页子项' }).check();
  816 |   await area.getByRole('button', { name: '批量处理', exact: true }).click();
  817 |   const batch = page.getByRole('dialog', { name: '批量处理', exact: true });
  818 |   await batch.getByRole('button', { name: '准备输入' }).click();
  819 |   await expect(batch.getByText('可启动 8', { exact: true })).toBeVisible();
  820 |   await batch.getByRole('button', { name: '启动就绪项' }).click();
  821 |   await expect
  822 |     .poll(async () => (await application.files.read(work.id)).runs.length)
  823 |     .toBe(4);
  824 |   await expect
  825 |     .poll(async () => (await item(children[0].id)).execution?.status)
  826 |     .toBe('waiting');
  827 |   await expect
  828 |     .poll(async () => (await item(children[1].id)).execution?.status)
  829 |     .toBe('waiting');
  830 |   expect(await activeCount()).toBe(2);
  831 |   const originalIds = (
  832 |     await Promise.all(children.slice(0, 4).map((c) => item(c.id)))
  833 |   ).map((i) => i.runs[0].runId);
  834 |   // Recreate the application over the same files: explicit application recovery, not a child-process test.
  835 |   await endApp();
  836 |   application = await createApplication({
  837 |     dataRoot: root,
  838 |     executeNode: execute,
  839 |   });
  840 |   await expect
  841 |     .poll(async () => (await item(children[2].id)).execution?.status)
  842 |     .toBe('interrupted');
  843 |   await expect
  844 |     .poll(async () => (await application.files.read(work.id)).runs.length)
  845 |     .toBe(6);
  846 |   expect(await activeCount()).toBe(2);
  847 |   const operator = await context.newPage();
  848 |   await openItem(operator, children[2].key, children[2].title);
  849 |   await operator.getByRole('button', { name: '继续执行', exact: true }).click();
  850 |   await expect
  851 |     .poll(async () => (await item(children[2].id)).execution?.status)
  852 |     .toBe('running');
  853 |   expect((await item(children[2].id)).runs[0].runId).toBe(originalIds[2]);
  854 |   expect(await activeCount()).toBe(3);
  855 |   await openItem(operator, children[0].key, children[0].title);
  856 |   await operator.getByRole('button', { name: '发送事件', exact: true }).click();
  857 |   const signal = operator.getByRole('dialog', {
  858 |     name: '发送事件',
  859 |     exact: true,
  860 |   });
  861 |   await signal.getByRole('button', { name: '发送事件', exact: true }).click();
  862 |   await expect
  863 |     .poll(async () => (await item(children[0].id)).execution?.status)
  864 |     .toBe('running');
  865 |   expect((await item(children[0].id)).runs[0].runId).toBe(originalIds[0]);
  866 |   expect(await activeCount()).toBe(4);
  867 |   await expect(batch.getByText('已启动 6', { exact: true })).toBeVisible();
  868 |   await page.waitForTimeout(1200);
  869 |   expect((await application.files.read(work.id)).runs).toHaveLength(6);
  870 |   await batch.getByRole('button', { name: '暂停启动', exact: true }).click();
  871 |   for (const set of gates.values()) for (const release of [...set]) release();
  872 |   await expect.poll(activeCount).toBe(0);
  873 |   await page.waitForTimeout(1200);
  874 |   expect((await application.files.read(work.id)).runs).toHaveLength(6);
  875 |   expect((await item(children[6].id)).runs).toHaveLength(0);
  876 |   expect((await item(children[7].id)).runs).toHaveLength(0);
  877 |   for (const title of ['窗口项 A', '窗口项 C', '窗口项 E', '窗口项 F'])
  878 |     await expect(
  879 |       batch
  880 |         .getByRole('row')
  881 |         .filter({ hasText: title })
  882 |         .getByRole('cell', { name: '已完成', exact: true }),
> 883 |     ).toBeVisible();
      |       ^ Error: expect(locator).toBeVisible() failed
  884 |   await page.screenshot({ path: join(evidence, 'batch-window.png') });
  885 |   await writeFile(
  886 |     join(evidence, 'batch-window.json'),
  887 |     JSON.stringify(
  888 |       {
  889 |         newStartLimit: 2,
  890 |         waitingReleased: 2,
  891 |         interruptedReleased: 2,
  892 |         resumeUsesOriginalRun: true,
  893 |         signalUsesOriginalRun: true,
  894 |         runPeak,
  895 |         agentPeak,
  896 |         submittedRuns: 6,
  897 |         pausedUnsubmitted: 2,
  898 |       },
  899 |       null,
  900 |       2,
  901 |     ),
  902 |   );
  903 |   await operator.close();
  904 | });
  905 | 
```