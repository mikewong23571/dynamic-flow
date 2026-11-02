# Section 业务分组实施证据

基线为8be1587；Task1实现为0f56951。全部产品/测试修改仅在隔离worktree，浏览器fixture以临时dataRoot/随机端口使用真实后端和当前dist，不使用托管或4335。

| 合同 | 实际验证 |
| --- | --- |
| S1 | 同一个“处理事项”region混合真实read_inputs表格、表单、文字和本组动作；选择保持、Dialog草稿同步、真实submit_input读回。 |
| S2 | 两个作者显式Section同一轻横线默认边界；名字/数量不进入平台固定结构，不按内容类型推断。 |
| S3 | 实际SDK Renderer的heading roles证明h2→h3→h4；Dialog内部Section在任务h2下为h3。空标题不生成aria-labelledby、不占层级；重复标题各有唯一引用ID。子组细侧线/缩进，没有卡片套卡片。 |
| S4 | Stack无边界/无可访问区域命名。保存source完全不含Section的旧程序仍可读表/输入，平台不改写source或自动套组。模块验证分组/重命名不改变记录、输入及Mutation合同。 |
| S5 | 1440×900、1024×768真实操作；主区、滚动子组、任务各2张截图已实看。无横溢出，任务Escape焦点及草稿保持。既有治理15条与OpenUI真实路线回归保持。 |
| S6 | shared/openui.ts的同源Section/Stack描述、prompt规则/例子→实际Renderer及describe_capabilities；workitem.ts通用指导及authoring/模块AGENTS一致。后端工具fixture实际读能力说明；真实模型遵从质量未测试。 |

sections-red.txt是改前找不到“处理事项”命名region的有效失败回归。browser-adjacent-25.txt是冻结构建25/25通过（新Section2、capabilities2、workitem6、治理15），没有更新golden。browser-sections-final-2.txt在旧程序夹具完全去掉Section后定向2/2通过；它们是相同case重验，不新增不同用例数量。modules-adjacent-12.txt为OpenUI6+工作项后端6通过；openui-modules-6.txt为早期定向轮次，不累加。

typecheck/style-check/build/format.txt分别证明当前类型、最小样式检查、构建及变更文件格式通过；build-manifest.json冻结浏览器产物哈希。现有bundle大小警告没有扩展为本次优化。sections-*/sections-nested-*/section-task-*是执行agent最终两尺寸截图；preview-*由父会话独立操作4336持久合成样例，最终审查按review.md与Task3记录。

未使用真实模型、真实用户材料、托管端口/服务；无模型配置/密钥复制。后端SessionRunner fixture只证明接线，浏览器与类型检查不代表模型会自动组织出理想业务分组。
