# 工作项列表搜索与状态筛选纠偏

用户反馈4320/items的搜索/状态控件比例失衡，状态占满剩余宽度。本轮从master b320c61在独立治理worktree复现、修正并验证；不使用托管数据作测试。

反例：1440宽真实fixture截图中搜索输入宽234.34px、状态宽856.16px。失败假设为“所有工具栏下拉调用已显式fit”；WorkItems漏传layout=fit，NativeSelect的字段默认fill导致扩张挤压；ListToolbar的space-between又把相关筛选分散。

最小修正：WorkItems状态显式layout=fit。共享ListToolbar用独立动作容器统一管理就近排列/换行，搜索沿用390px上限并允许窄屏100%，不受状态扩张挤压。复用原有Input/Button/NativeSelect，不修改原语内部或业务筛选接口。工作项、流水线与子项工具栏共用这一责任，表单仍默认fill。控件README同步。

现有roots真实浏览器用例增加相对宽度、同高同排和就近间距检查，修改前因234<856失败；修改后两尺寸通过。管理列表2、流水线1、roots2共5条浏览器通过，含真实搜索/状态/分页/归档及子项范围行为；typecheck:app、check:styles、build、变更文件Prettier和diff检查通过。已实际查看before-1440、list-1440、list-1024，两尺寸搜索/状态紧邻且比例合理。证据在evidence/toolbar-followup。

按用户当前修正请求整合到master；托管Vite将加载前端变更，无需重启后端或修改业务数据。此前治理“已完成”不表示没有遗漏，本反例和最小回归记录于此。
