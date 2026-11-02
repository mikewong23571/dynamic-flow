# 原生OpenUI与前端验证（2026-10-30）

在独立worktree完成，所有browser应用使用临时dataRoot与随机端口，读取正式Vite构建dist，没有连接托管4320/4321。

- `pnpm exec tsx --test tests/openui.test.ts`：3/3通过，官方库schema/prompt、保存拒绝不完整/未知引用/Query写工具、官方具名merge。
- `flock /tmp/flowcraft-openui-build.lock pnpm build`：通过；Vite保留已有大包体积提示，未为此增加新平台抽象。
- `pnpm exec playwright test tests/browser/openui-workitem.spec.ts tests/browser/openui-process.spec.ts tests/browser/workitem-composition-conversations.spec.ts tests/browser/workitem-composition-call-node.spec.ts --output /tmp/flowcraft-openui-browser-results --reporter=line`：11/11通过（47.0秒）。

| 场景 | 实际操作与结论 |
| --- | --- |
| 两尺寸原生Renderer | 1440×900、1024×768，真实表格、选择、记录详情和合同InputForm；原生Mutation提交真实业务API |
| 失败和版本 | 首次保存503保留输入；重试成功。另一会话推进revision后提交保留原baseRevision并冲突；保留草稿，明确采用当前版本后重试成功 |
| 局部编辑与固定身份 | 官方具名patch只改列标签，选择保留；重新发布形成新delivery后对应选择清空 |
| 历史预览 | 展开/关闭/重新展开同一Renderer，历史Mutation按钮禁用；Query误用execute没有任何业务POST或新Run |
| 真实过程 | 固定call进入持久化子Run、实际节点/实例、输入与依据和原始输出，保留来源轨迹。流程页滚动可达，避免下方内容被裁切 |
| 选记录与用户字段 | 只选择R2，服务端读取固定原记录，包装record加人工note，按固定后续方法合同保存；不启动新Run、不改变旧成果 |
| 会话与导航 | 两尺寸多会话独立草稿、刷新恢复、独立Pi会话目录；迟到旧会话回执不清新草稿；固定call预览读取旧Definition而非新草稿 |
| 读取恢复 | 首页暂时502后自动轮询200，读取错误消失；动作错误与读取错误分开 |

截图records/process/nested-process的1440与1024各一张，已实际打开检查。1024为底部Composer，1440并排Assistant。过程检查是实际Run，不是工具活动文本。

这组节点输出是明确测试fixture，只证明正式SDK/HTTP/运行/页面联通，不作为真实模型业务验收。真实默认模型无模板路线与失败观察由主代理另行记录。

增量收口：正式原生与相邻会话/导航/固定版本/原语/roots场景统一24/24通过（1.5分钟）。额外将source编辑器保存回执场景扩到两尺寸，最后`openui-workitem + openui-process`8/8通过（33.4秒）：发送保存后继续编辑，迟到回执保留新文本，第二次保存使用新基线并成功。编辑器两尺寸截图已实看；旧planned/旧界面安排CSS已清除。`pnpm typecheck:app`完整通过。

真实过程成功实例的应用工具复用RecordTools：完成依据、建立子项、审阅候选和打开实际流水线。交接使用当前真实端口/index及原值，不再猜output端口或复制整包产物。

最后增量：原生与过程8/8再次通过（34.3秒）；真实过程应用工具2/2通过（13.1秒），实际打开完成依据和添加子项弹窗并返回原过程，不提交伪造业务状态。固定delivery读取错误直接以alert显示，不当作空成果。
