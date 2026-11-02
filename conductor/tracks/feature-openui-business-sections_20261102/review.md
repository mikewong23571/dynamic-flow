# 编排者独立审查

结论：本轮需求已实现，当前diff与受影响调用路径未发现阻断问题。用户主观视觉接受及真实模型首版质量不由本结论代替。

## 责任边界
Assistant以既有Section表达业务分组，平台以统一轻分隔线、间距和嵌套侧线呈现；Stack仅布局。SectionRenderer的React context与useId提供实际命名region和h2→h3→h4（h6封顶）；空标题无悬空aria-labelledby且不占标题层级，重复标题ID独立；Dialog由任务标题重新建立层级。共享schema/API保持，未引入领域推断、DSL或业务状态。shared/openui的组件定义被Renderer与describe_capabilities共用，workItemInstructions同步通用分组规则；高层系统准则未改。

## 验收证据
- S1/S2：真实fixture同一Section混排表格/表单/文字/动作，不同Section一致默认边界；另独立4336合成预览得到两个命名区域和唯一标题。
- S3：实际查看fixture的1440/1024子组滚动截图；标题层次与轻侧线/缩进明确，无嵌套卡片。浏览器证明真实h2/h3/h4及任务内h3，空标题和重复标题兼容。
- S4：fixture将同一程序改成无Section排列后保持正常内容/表单，无自动分组；Stack无区域名及分界。模块验证分组不改变记录/输入/输出/Mutation合同。
- S5：独立预览两尺寸实际勾选、填草稿、打开弹窗、Escape关闭后焦点返回，同一选择及草稿保留；窄屏下滚后的底部输入动作命中通过，页面无全局横向溢出。独立记录见evidence/preview-browser.json，实看preview-sections两尺寸、preview-task-1024、preview-input-bottom-1024；fixture嵌套两尺寸也已实看。
- S6：独立检查shared/openui→prompt/schema→describe_capabilities与workItemInstructions及作者指南调用路径，一份组件合同。

12项相关模块、25条浏览器（包含新2条及OpenUI capabilities/workitem和15治理）、typecheck:app、build、变更文件格式通过；父会话另运行check:styles与git diff 8be1587 --check通过。构建原有大chunk提示不阻断本功能，无新增依赖。未扩大为全项目/全浏览器测试。

## 隔离预览与保护
通过正式checkUiProgram和saveUiProgram，携带baseRevision/expectedProgramId，更新原合成工作项revision5→6。两个组为处理清单和补充范围，第二组含表单及“在弹窗中补充范围”入口；这只是作者安排，非平台预设。固定delivery身份保留，未追加输入/执行/模型请求。旧source备份在.flowcraft-preview-data/sections-before-source.txt，变更回执在sections-preview-update.json。

仅重启本worktree的4336预览以载入新作者说明，持久数据位于worktree/.flowcraft-preview-data。托管4320/4321及既有4335未操作。原仓242个src文件聚合SHA256实施前后均为`e462402fefd033287d3d40a9fa78d4034e784d1537c4ba05da603a71d90dfd84`。原仓仅同步本次track资料和对应索引入口，产品src保持原样。

预览：http://10.134.94.200:4336/items/78abd2d8-cad5-42b5-9567-2d93938dd392

## 未测边界
未请求真实模型生成新界面，因此不声称模型能稳定遵循新的分组指引。现有无Section的保存程序不会自动迁移；平台通过作者明确的Section提供边界。未部署托管实例、未push/MR，代码在独立治理worktree本地提交。
