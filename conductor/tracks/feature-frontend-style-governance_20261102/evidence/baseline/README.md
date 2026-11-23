# 2026-11-02 审查基线

这些文件记录当前缺陷与源码事实，不是治理后的 golden 或验收通过证明。浏览器和度量基于独立源码副本，正式源码与副本逐文件核对；HEAD 不包含大量既有未提交实现，不能单独用于重现。

## 文件与结论

| 文件 | 内容 |
| --- | --- |
| provenance.json | HEAD、源码快照摘要、环境、原生会话和隔离边界 |
| component-inventory.json | 逐文件 SHA、模块 imports/CSS、两类 Button/原生控件候选、CSS 层和尺寸分布、导入可达性 |
| scan-inventory.cjs | 静态候选盘点脚本；CSS 使用已安装的 PostCSS，JSX/import 为启发式扫描，重点调用另行人工核对 |
| build.log | 独立源码副本的当前构建通过记录，带已知 bundle 大小提示 |
| browser-baseline.log | 1 条审查路线，控件/布局/缩窗命中结果；ERRORS=[]，不是缺陷已修复 |
| screenshots/ | 12 张样式基线，包括两尺寸、Inspector、记录/设置弹窗、两种列表、缩窗与冷打开 |
| browser-deep.log、deep/ | 两尺寸深入路线，10 张图和两个度量 JSON；包含长文本、嵌套组合、任务弹窗、失败呈现、折叠表格、非空菜单 |
| ui-style-audit.spec.ts、ui-hierarchy-audit.spec.ts | 审查采集程序，按下面方式在独立测试副本中运行；未安装为正式产品验收测试 |

关键事实：页内 field margin-bottom=19px、actions margin-top=24px；弹窗 field margin=18px 0 19px；字段 wrapper 宽度不同；缩窗后保存按钮中心命中 Assistant；两尺寸任务弹窗关闭后焦点为 BODY。错误和输入保留本身正常。

采集脚本的成功退出只证明确定性路线和采集完成。现存缺陷被主动记录而没有作为正确状态断言；后续必须新增最小失败回归并修复，不能把这些日志当治理通过。

## 重跑

从仓库根先扫描源码（只读，不访问服务）：

```sh
node conductor/tracks/feature-frontend-style-governance_20261102/evidence/baseline/scan-inventory.cjs "$PWD" > /tmp/flowcraft-ui-inventory-rerun.json
```

浏览器必须在独立源码目录运行，先将当前 src、tests、package.json、index.html、vite.config.ts、playwright.config.ts、tsconfig*.json 复制到临时自动测试目录，链接已安装 node_modules；不要复制 data、models.toml、用户会话或上传。将这里两个审查 spec 复制到该副本的 tests/browser/，再执行：

```sh
pnpm exec vite build
FLOWCRAFT_EVIDENCE_DIR=/tmp/flowcraft-style-evidence pnpm exec playwright test tests/browser/ui-style-audit.spec.ts --reporter=list
FLOWCRAFT_EVIDENCE_DIR=/tmp/flowcraft-hierarchy-evidence pnpm exec playwright test tests/browser/ui-hierarchy-audit.spec.ts --reporter=list
```

运行目录须为独立副本。copied fixtures.ts 自建真实应用、随机 loopback 端口及临时 dataRoot，dist 也来自该副本。临时自动测试数据可放 /tmp；交给用户持续查看的预览须另用独立 worktree 与持久 .flowcraft-preview-data，不在 /tmp 存业务数据。

没有使用用户模型或真实业务输入。一次 503 明确由审查 fixture 注入；普通函数运行不是模型结果。没有调用托管 4320/4321、重启服务或改变其它 track 状态。
