# Table成果入口与操作列局部修正

范围仅ResultsOverview.tsx及ResultsOverview.css、对应私有浏览器用例。用户明确不要大改；结果阅读工作区/主路径重做的临时提议已撤回，未实施。

成果沿用同一对象行：固定File/Files图标槽、左对齐名称，多项尾部数量/展开符，单项直达。操作列保留“查看过程”动词按钮。运行表和仅成果表各有稳定列分配，长名称在本列换行，不把其他列推到行中间。通过现有primitive工具类明确左/顶对齐，修复先前components层声明被utilities覆盖而实际居中的问题；无!important、业务特判或新配置平台。

[两尺寸局部回归](browser.log)2项通过，使用非CVE长名称/单项/多项样例，验证展开、直达、键盘、返回以及实际图标/文字坐标；[类型](typecheck.log)、[构建](build.log)通过。此次未重复上轮21项测试。

[独立最终复看](review/final-review.md)实际检查真实页面两尺寸与计算样式，并查看非CVE截图。根也查看真实1024和非CVE两尺寸截图、坐标。

- [真实1024](review/final-1024.png) / [真实1440](review/final-1440.png)
- [非CVE长名称1024](objects-long-names-1024.png) / [1440](objects-long-names-1440.png)
- [坐标1024](object-coordinates-1024.json)

单/多成果图标与文字x一致；第一成果与操作按钮top一致；表格实际fixed、单元格top/left生效。保留既有导航与真实数据，未提交/push。
