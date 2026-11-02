# 统一运行成果页：最终共享组件版

成果页参考运行过程页的信息架构微调：横向成果分组 → 组内实例选择 → 内容区域。两页共用 RunSelection 与 ArtifactPresentation，沿用已有内容样式；单份成果直接阅读。同一运行的数据和报告统一展示，表格只呈现数量和查看成果/过程入口。

本轮只改变结果入口和阅读组织，保留精确来源、复制/使用、列表查询和每份成果的搜索、展开、滚动状态。工作项共享检查的业务操作保持原语义。

## 验证

- 类型检查和构建通过：[typecheck](implementation/typecheck.log)、[build](implementation/build.log)。构建仍提示既有大包体积，不影响本次构建完成。
- 10项定向浏览器案例通过：首批[8项](implementation/shared-browser.log)，[首次可用成果/迟到实例/多端口](implementation/shared-multiport-browser.log)1项，[工作项实例引用与比较](implementation/shared-workitem-browser.log)1项。
- [3项投影模块](implementation/shared-projection.log)通过，覆盖冻结输出分组、多端口、别名和原始预览。
- 首批第9项曾因测试导航保留旧opened-works而超时；改用实际流水线库导航后定向通过，没有为此修改产品逻辑。失败日志保留，不将首批全量宣称为通过。
- 真实A/B及私有非CVE单份、10份记录+1份报告、无成果，两尺寸1440/1024独立操作并看图：[最终审查](review/final-review.md)。10实例菜单实际溢出并可滚动，首次仅挂载1份正文；选择、查看过程及列表返回保持阅读状态。
- root实际打开B页并看图，复看A/B窄桌面与报告截图。2个Work及1个WorkItem[哈希均未变](data-after.json)，正式数据仍为3条流水线和1个工作项。

## 当前截图

- [漏洞事实研究](review/shared-A-reader-1024.png)
- [仓库漏洞核查](review/shared-B-reader-1024.png)
- [报告](review/shared-B-report-1024.png)

旧sidebar的real-*截图、browser.log及目录记录仅为中间方案；最终验收使用shared-*、fixture-*和当前implementation截图。没有全局回归或重新运行模型；视觉接受仍由用户判断。源码留在当前工作区，未提交/push。
