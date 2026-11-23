# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: work-journey.spec.ts >> 完整路线：生成、原始输入比较、正式单步、跨方法合同修正、结项与重开 1024
- Location: tests/browser/work-journey.spec.ts:592:3

# Error details

```
Test timeout of 60000ms exceeded.
```

```
Error: locator.check: Test timeout of 60000ms exceeded.
Call log:
  - waiting for getByRole('dialog', { name: '准备本次执行' }).locator('[data-result-id="412c251a-107a-4d7b-a15d-2af196dff900"]').getByRole('checkbox')

```

# Page snapshot

```yaml
- generic:
  - generic:
    - generic:
      - complementary [aria-hidden]:
        - generic:
          - strong: Flowcraft
        - generic:
          - button: 工作项
          - button: 全部流水线
        - generic: 已打开的流水线
        - navigation:
          - generic:
            - button:
              - generic: 反馈分类与汇总
            - button
        - generic:
          - button:
            - generic:
              - strong: 模型设置
              - generic: fixture
          - generic: 重新连接中
      - main:
        - generic [aria-hidden]:
          - region:
            - article:
              - generic:
                - generic:
                  - generic:
                    - button: 返回
                    - generic: WI-20261026-ee28a2
                    - generic: 待推进
                  - heading [level=1]: 从反馈开始
                - generic:
                  - button: 查看处理方案
                  - button: 运行流水线
              - generic:
                - generic:
                  - generic:
                    - generic:
                      - generic: 业务阶段
                      - strong: 待处理
                    - generic:
                      - generic: 当前执行
                      - generic: 已完成
                    - button: 查看工作目标
                  - region:
                    - generic:
                      - generic: 人工验收
                      - strong: 尚未设置验收条件
                    - generic:
                      - button: 设置完成条件
              - generic:
                - tablist:
                  - tab: 子项
                  - tab: 处理方案
                  - tab [selected]: 成果与过程
                  - tab: 证据材料 3
                  - tab:
                    - text: 验收与结项
                    - generic: 待设置
                  - tab: 业务记录
                - tabpanel:
                  - region:
                    - navigation:
                      - generic:
                        - combobox
                      - generic: 10/26 07:13
                      - button: 打开流水线
                    - generic:
                      - generic:
                        - generic:
                          - navigation:
                            - button:
                              - generic: 分类反馈
                              - generic: 已完成
                            - button:
                              - generic: 汇总建议
                              - generic: 已完成
                          - generic:
                            - button: 第 1 项 / 2 项
                          - generic:
                            - generic:
                              - generic:
                                - heading [level=3]: 分类反馈
                                - generic: 已完成
                              - generic:
                                - button: 继续处理
                                - button: 拆分工作
                                - button: 引用
                                - button: 加入比较
                                - button: 复制
                            - generic:
                              - generic:
                                - tablist:
                                  - tab [selected]: 产物 1
                                  - tab: 输入与依据
                                  - tab: 执行记录
                                - generic:
                                  - button [pressed]: 查看内容
                                  - button: 原始数据
                              - tabpanel:
                                - generic:
                                  - generic:
                                    - generic:
                                      - generic: original
                                      - generic: 导出失败
  - dialog [ref=e2]:
    - generic [ref=e3]:
      - heading "准备本次执行" [level=2] [ref=e4]
      - paragraph [ref=e5]: 选择保存版本与本次工作项材料
    - generic [ref=e6]:
      - generic [ref=e7]:
        - generic [ref=e8]:
          - text: 处理方法
          - combobox "处理方法" [ref=e10]:
            - option "反馈分类与汇总" [selected]
            - option "报告整理方法"
        - generic [ref=e11]:
          - text: 保存版本
          - combobox "保存版本" [ref=e13]:
            - option "保存版本 1 · 536a85be"
            - option "当前保存草稿 · 68e89f91" [selected]
      - generic [ref=e14]:
        - text: 处理范围
        - combobox "处理范围" [ref=e16]:
          - option "完整流程"
          - option "单步骤 · 分类反馈"
          - option "单步骤 · 汇总建议" [selected]
      - generic [ref=e17]:
        - button "编辑所选方法" [ref=e18] [cursor=pointer]
        - generic [ref=e19]: 单步骤正式处理
        - generic [ref=e20]: 从反馈开始
      - region "本次输入材料" [ref=e21]:
        - generic [ref=e22]:
          - strong [ref=e23]: 本次输入
          - generic [ref=e24]: 已选 1 项
        - generic [ref=e25]:
          - tablist [ref=e26]:
            - tab "工作项材料" [ref=e27] [cursor=pointer]
            - tab "历史成果" [selected] [ref=e28] [cursor=pointer]
          - tabpanel "历史成果" [ref=e29]:
            - generic [ref=e30]:
              - generic [ref=e31]:
                - checkbox "选择成果 分类反馈 · output · 第 1 项" [ref=e32]
                - group [ref=e33]:
                  - generic "分类反馈 · output · 第 1 项 反馈分类与汇总 · 10/26 07:13 · 536a85be 1 个字段" [ref=e34] [cursor=pointer]:
                    - generic [ref=e37]:
                      - strong [ref=e38]: 分类反馈 · output · 第 1 项
                      - generic [ref=e39]: 反馈分类与汇总 · 10/26 07:13 · 536a85be
                      - generic [ref=e40]: 1 个字段
                - button "补齐／修正输入" [ref=e41] [cursor=pointer]
              - generic [ref=e42]:
                - checkbox "选择成果 分类反馈 · output · 第 2 项" [checked] [active] [ref=e43]
                - group [ref=e44]:
                  - generic "分类反馈 · output · 第 2 项 反馈分类与汇总 · 10/26 07:13 · 536a85be 1 个字段" [ref=e45] [cursor=pointer]:
                    - generic [ref=e48]:
                      - strong [ref=e49]: 分类反馈 · output · 第 2 项
                      - generic [ref=e50]: 反馈分类与汇总 · 10/26 07:13 · 536a85be
                      - generic [ref=e51]: 1 个字段
                - button "补齐／修正输入" [ref=e52] [cursor=pointer]
              - generic [ref=e53]:
                - checkbox "选择成果 汇总建议 · output · 第 1 项" [ref=e54]
                - group [ref=e55]:
                  - 'generic "汇总建议 · output · 第 1 项 反馈分类与汇总 · 10/26 07:13 · 536a85be # 建议报告 [{\"original\":\"导出失败\"},{\"original\":\"搜索很快\"}]" [ref=e56] [cursor=pointer]':
                    - generic [ref=e59]:
                      - strong [ref=e60]: 汇总建议 · output · 第 1 项
                      - generic [ref=e61]: 反馈分类与汇总 · 10/26 07:13 · 536a85be
                      - generic [ref=e62]: "# 建议报告 [{\"original\":\"导出失败\"},{\"original\":\"搜索很快\"}]"
                - button "补齐／修正输入" [ref=e63] [cursor=pointer]
      - paragraph [ref=e64]: 端口「feedback」第 1 条不符合 schema：data must be string
      - generic [ref=e65]:
        - button "取消" [ref=e66] [cursor=pointer]
        - button "开始处理 1 项输入" [ref=e67] [cursor=pointer]
    - button "关闭" [ref=e68] [cursor=pointer]
```

# Test source

```ts
  716 |     const firstSnapshot = (await (
  717 |       await request.get(`${url}/api/works/${now.workflowId}`)
  718 |     ).json()) as Snapshot;
  719 |     const firstRun = firstSnapshot.work.runs.at(-1)!;
  720 |     const f1 = firstRun.results.find(
  721 |       (result) =>
  722 |         result.nodeId === 'classify' &&
  723 |         result.input.input[0].materialIds.includes('M01'),
  724 |     )!;
  725 |     const f3 = firstRun.results.find(
  726 |       (result) =>
  727 |         result.nodeId === 'classify' &&
  728 |         result.input.input[0].materialIds.includes('M03'),
  729 |     )!;
  730 |     const detail = page.getByRole('article', { name: '工作项详情' });
  731 |     await detail
  732 |       .getByRole('navigation', { name: '处理环节' })
  733 |       .getByRole('button', { name: /分类反馈/ })
  734 |       .click();
  735 |     await detail.getByRole('button', { name: '执行实例', exact: true }).click();
  736 |     await page
  737 |       .locator(`[role="menuitemradio"][data-result-id="${f1.id}"]`)
  738 |       .click();
  739 |     await detail
  740 |       .getByRole('button', { name: '打开流水线', exact: true })
  741 |       .click();
  742 |     await page
  743 |       .locator('.results-view')
  744 |       .getByRole('button', { name: '从此结果改进', exact: true })
  745 |       .click();
  746 |     await page
  747 |       .getByRole('dialog', { name: '选择改进的起点' })
  748 |       .getByRole('button', { name: '创建候选', exact: true })
  749 |       .click();
  750 |     await page
  751 |       .getByRole('textbox', { name: '任务要求', exact: true })
  752 |       .fill('classify-improved');
  753 |     await page.getByRole('button', { name: '保存修改', exact: true }).click();
  754 |     await page
  755 |       .getByRole('button', { name: '选择输入并试运行', exact: true })
  756 |       .click();
  757 |     const trial = page.getByRole('dialog', { name: '试验「分类反馈」' });
  758 |     await expect(trial.getByRole('combobox', { name: '输入来源' })).toHaveValue(
  759 |       'run',
  760 |     );
  761 |     await expect(
  762 |       trial.getByRole('checkbox', { name: '原始输入 M01' }),
  763 |     ).toBeChecked();
  764 |     await trial.getByRole('checkbox', { name: '原始输入 M03' }).check();
  765 |     await trial
  766 |       .getByRole('button', { name: '比较当前与候选', exact: true })
  767 |       .click();
  768 |     await expect
  769 |       .poll(
  770 |         async () =>
  771 |           (
  772 |             (await (
  773 |               await request.get(`${url}/api/works/${now.workflowId}`)
  774 |             ).json()) as Snapshot
  775 |           ).work.comparisons.at(-1)?.status,
  776 |       )
  777 |       .toBe('completed');
  778 |     const compared = (await (
  779 |       await request.get(`${url}/api/works/${now.workflowId}`)
  780 |     ).json()) as Snapshot;
  781 |     const candidateRun = compared.work.runs.find(
  782 |       (run) => run.id === compared.work.comparisons.at(-1)!.candidateRunId,
  783 |     )!;
  784 |     const candidateF1 = candidateRun.results.find((result) =>
  785 |       result.input.input[0].materialIds.includes('M01'),
  786 |     )!;
  787 |     expect(candidateRun.effectMode).toBe('preview');
  788 |     expect(candidateRun.workItem?.id).toBe(item.id);
  789 |     expect(
  790 |       seen
  791 |         .filter(
  792 |           (context) =>
  793 |             context.nodeId === 'classify' && context.effectMode === 'preview',
  794 |         )
  795 |         .map((context) => context.inputs.input[0].value),
  796 |     ).toEqual(['导出失败', '搜索很快', '导出失败', '搜索很快']);
  797 |     await page
  798 |       .getByRole('button', { name: '← 返回工作项', exact: true })
  799 |       .click();
  800 |     await detail.getByRole('button', { name: '继续处理', exact: true }).click();
  801 |     const continued = page.getByRole('dialog', { name: '准备本次执行' });
  802 |     await continued
  803 |       .getByRole('combobox', { name: '处理范围' })
  804 |       .selectOption('summarize');
  805 |     await continued
  806 |       .locator(`[data-result-id="${f1.id}"]`)
  807 |       .getByRole('checkbox')
  808 |       .uncheck();
  809 |     await continued
  810 |       .locator(`[data-result-id="${f3.id}"]`)
  811 |       .getByRole('checkbox')
  812 |       .check();
  813 |     await continued
  814 |       .locator(`[data-result-id="${candidateF1.id}"]`)
  815 |       .getByRole('checkbox')
> 816 |       .check();
      |        ^ Error: locator.check: Test timeout of 60000ms exceeded.
  817 |     const classificationCalls = seen.filter(
  818 |       (context) => context.nodeId === 'classify',
  819 |     ).length;
  820 |     await continued.getByRole('button', { name: '开始处理 2 项输入' }).click();
  821 |     await expect(continued).toBeHidden();
  822 |     await expect
  823 |       .poll(
  824 |         async () =>
  825 |           (
  826 |             (await (
  827 |               await request.get(`${url}/api/items/${item.id}`)
  828 |             ).json()) as WorkItemView
  829 |           ).execution?.status,
  830 |       )
  831 |       .toBe('completed');
  832 |     const final = (await (
  833 |       await request.get(`${url}/api/works/${now.workflowId}`)
  834 |     ).json()) as Snapshot;
  835 |     const summary = final.work.runs.at(-1)!;
  836 |     expect(summary.scope).toEqual({ nodeId: 'summarize' });
  837 |     expect(summary.effectMode).toBe('commit');
  838 |     expect(
  839 |       summary.inputSources!.map((source) => source.resultId).sort(),
  840 |     ).toEqual([f3.id, candidateF1.id].sort());
  841 |     expect(
  842 |       seen.filter((context) => context.nodeId === 'classify'),
  843 |     ).toHaveLength(classificationCalls);
  844 |     await expect(detail).toContainText('单步骤正式处理');
  845 |     await page.screenshot({
  846 |       path: join(evidence, `formal-summary-${width}.png`),
  847 |     });
  848 |     // Refresh the public method list by reopening the retained item workspace.
  849 |     await detail.getByRole('button', { name: '工作项', exact: true }).click();
  850 |     await page
  851 |       .getByRole('button', { name: `打开工作项 ${item.key}`, exact: true })
  852 |       .click();
  853 |     await detail.getByRole('button', { name: '继续处理', exact: true }).click();
  854 |     const handoff = page.getByRole('dialog', { name: '准备本次执行' });
  855 |     await handoff
  856 |       .getByRole('combobox', { name: '处理方法', exact: true })
  857 |       .selectOption(createdB.work.id);
  858 |     await handoff
  859 |       .locator(`[data-result-id="${summary.results[0].id}"]`)
  860 |       .getByRole('checkbox')
  861 |       .uncheck();
  862 |     await handoff
  863 |       .locator(`[data-result-id="${f3.id}"]`)
  864 |       .getByRole('checkbox')
  865 |       .check();
  866 |     await handoff
  867 |       .locator(`[data-result-id="${candidateF1.id}"]`)
  868 |       .getByRole('checkbox')
  869 |       .check();
  870 |     await handoff.getByRole('button', { name: '开始处理 2 项输入' }).click();
  871 |     await expect(handoff.getByRole('alert')).toContainText('schema');
  872 |     expect(
  873 |       (
  874 |         (await (
  875 |           await request.get(`${url}/api/works/${createdB.work.id}`)
  876 |         ).json()) as Snapshot
  877 |       ).work.runs,
  878 |     ).toHaveLength(0);
  879 |     await handoff
  880 |       .getByRole('button', { name: '编辑所选方法', exact: true })
  881 |       .click();
  882 |     await page.getByRole('button', { name: 'Assistant', exact: true }).click();
  883 |     await page
  884 |       .getByRole('textbox', { name: '对话修改' })
  885 |       .fill('将方法入口与消费步骤改为接收对象，保留结构化输入并汇总报告。');
  886 |     await page.getByRole('button', { name: '发送修改', exact: true }).click();
  887 |     await expect
  888 |       .poll(async () => {
  889 |         const saved = (await (
  890 |           await request.get(`${url}/api/works/${createdB.work.id}`)
  891 |         ).json()) as Snapshot;
  892 |         return saved.definitions[saved.work.draftId!]?.inputContracts?.records
  893 |           .item;
  894 |       })
  895 |       .toEqual({ type: 'object' });
  896 |     const repaired = (await (
  897 |       await request.get(`${url}/api/works/${createdB.work.id}`)
  898 |     ).json()) as Snapshot;
  899 |     await page
  900 |       .getByRole('button', { name: '← 返回工作项', exact: true })
  901 |       .click();
  902 |     await expect(handoff).toBeVisible();
  903 |     await handoff
  904 |       .getByRole('combobox', { name: '保存版本', exact: true })
  905 |       .selectOption(repaired.work.draftId!);
  906 |     await expect(
  907 |       handoff
  908 |         .locator(`[data-result-id="${candidateF1.id}"]`)
  909 |         .getByRole('checkbox'),
  910 |     ).toBeChecked();
  911 |     await handoff.getByRole('button', { name: '开始处理 2 项输入' }).click();
  912 |     await expect(handoff).toBeHidden();
  913 |     await expect
  914 |       .poll(
  915 |         async () =>
  916 |           (
```