# 样本试验与候选比较

## 快速定位

- 入口：`index.ts` → `createTrials(files, runs)`，compare/stopComparison/wait；结果作为 Comparison 保存在 Work。
- compare 固定两侧定义与同一 Inputs，使用 runs.reserve/release 协调占用并顺序调用公共 runs.start；没有独立执行器。
- 前端：`client/features/results/Comparison.tsx`；`client/core/compare.ts` 根据当前 draftId、输入指纹和未保存修改派生过期状态。flow 保存语义版本，不额外持久化一个过期标记。
- 验证入口：`tests/trials.test.ts`、`tests/client.test.ts`，结合 `tests/browser/workspace.spec.ts` 检查工作区；完整比较路线见 [用户故事 E1–E4](../../../docs/user-stories.md)。

适用本目录，继承上层约定。同输入顺序比较已实现；产品级验收见整个应用 track。

## 职责与子问题

能否用完全相同的小样本比较当前做法与候选，并知道比较何时失效？负责固定版本/输入、顺序运行两侧、结果对齐、失败/过期和整体停止。故事：E1–E4。

## 目标

- 两侧同输入，不偷跑上游或全量；输入契约不兼容时明确提示。
- 区分执行完成、比较仍有效和候选更好，质量决定留给用户。
- 改语义/输入会过期；布局/展示排序不会；取消后不启动下一侧。

## 非目标

不建试验 runtime、自动评分/优化平台或基线缓存，不代用户采用结果。

## 接口与依赖

提供 compare / stopComparison / wait；读取比较通过工作快照。输入为明确基线、候选、节点及样本；输出为 comparisonId、每侧结果和有效性。

直接依赖 runs、files，无额外第三方包，不直接调用 Pi。参考 [伪代码](../../../spike/src/server/trials.pseudo.md)。

## 验收与证据

下文编号只是查阅索引：P 表示具体测试场景，T 表示完整用户验收路线；含义见 [术语与编号](../../../docs/glossary.md)。

- [x] 两侧 F01/F03 输入一致，F02 未运行；模式/端口不兼容不能硬拼比较（场景 P14/P15）。
- [x] 候选变化后晚到完成仍过期；只改布局/排序保持有效（场景 P16/P17）。
- [x] 基线失败如实展示，停止不启动第二侧，重复点击不会重复执行（场景 P27/P28）。
- [x] 与 runs 验证调用范围，与 client/flow 验证比较、过期和独立采用/保留。

## 假设与未知

先支持同节点单节点试验；节点删除、each/all 切换、输入形状变化可能无法直接对齐。遇到真实改法后调整边界，不能为了“全覆盖”制造假比较。本清单不穷尽未知。

## 当前交接与证据

`createTrials(files, runs)` 提供 compare/stopComparison/wait；默认基线为 draftBaseId，固定两侧定义和完整输入，顺序复用 runs。tests/trials.test.ts 验证基线失败后继续候选、同样本输入、取消不启动第二侧、拒绝重复链。比较 completed 只指执行结束；界面依据当前草稿与所选输入判断过期，用户自己判断质量。

产品级验证与边界见 [本轮验收证据](../../../conductor/tracks/full-application_20260920/evidence.md)。
