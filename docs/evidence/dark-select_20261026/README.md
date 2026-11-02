# 暗色下拉框修复验证（2026-10-26）

用户反馈：展开下拉框后白色背景配灰色文字，只有蓝色选中项较清楚。

当前源码已有 `:root { color-scheme: dark }`，但 NativeSelect 使用透明背景并继承文字颜色，分页框继承了 muted 灰色；只有 NativeSelectOption/OptGroup 使用系统 Canvas 色，业务中另有大量普通 option。当前 Linux Chromium 的修改前菜单未复现白底，不能据此确认用户浏览器的具体触发条件。

修复：NativeSelect 使用不透明背景及前景色；封装选项使用 popover 色；base 层覆盖普通 select option/optgroup，禁用项使用 GrayText；HTML 提前声明暗色主题。保留浏览器原生选择、焦点和键盘行为。

参考：

- [Chrome 团队：color-scheme](https://web.dev/articles/color-scheme)：声明页面主题以匹配原生表单控件；HTML meta 可以在 CSS 加载前生效。
- [MDN：option 样式](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/option#legacy_option_styling)：原生选项可设颜色的范围取决于操作系统和浏览器。

## 验证

使用当前未提交工作区的独立副本 `/tmp/flowcraft-dark-select-TJFbDI`，独立测试数据，Vite 4330、API 4331，代理指向 4331；未连接托管实例或使用用户数据。副本包含本次三个产品文件的修改，构建及浏览器验证均针对该副本。

- `pnpm typecheck:app`：退出 0。
- `pnpm build`：退出 0；有现存的 bundle 大小提示。
- Playwright Chromium 临时操作脚本：1440×900、1024×768 均通过。在系统浅色偏好下验证应用暗色主题，检查工作项状态菜单、分页菜单、设置中的普通 select；断言控件不透明、分页文字为 `#ededed`、选项背景 `#0a0a0a` 及文字 `#ededed`；状态使用方向键及 Enter 切换为“未完成”，分页选择 20 项成功。设置仅展开检查，没有配置模型或发起模型调用。
- 实际查看了状态菜单 1440、分页菜单 1024、设置菜单 1024 截图。其余尺寸截图亦已保存。
- 现有 `management-presentation.spec.ts` 使用独立配置运行，两尺寸均在第 116 行失败：预期 10 行，实际 12 行。恢复修改前的三个产品文件，复跑 1440，仍在同一断言失败。未修改测试或扩大本次修复范围。

截图：

- [状态菜单 1440](status-open-1440.png) / [1024](status-open-1024.png)
- [分页菜单 1440](page-size-open-1440.png) / [1024](page-size-open-1024.png)
- [设置菜单 1440](settings-open-1440.png) / [1024](settings-open-1024.png)

未验证 Safari、Firefox、Windows 原生菜单及用户原始浏览器环境；原生选中高亮由系统和浏览器绘制。此次无业务语义或模型行为变更，未运行模型与业务全套测试。
