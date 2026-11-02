# CVE-2025-27516（Jinja2）调查汇总 · SCC chatops-api / adr-api 前置漏洞事实

## 结论与材料状态（前置）

**漏洞结论**：CVE-2025-27516 是 Jinja2 沙箱逃逸漏洞——沙箱环境与 `|attr` 过滤器交互的疏漏，使控制模板内容的攻击者可经 `|attr` 取得字符串的原始 `format` 方法引用、绕过沙箱对 `str.format` 的拦截，在沙箱外执行任意 Python 代码。受影响版本 **Jinja2 <= 3.1.5（即 < 3.1.6）**；官方修复版本 **3.1.6（2025-03-05 security release）** [M01]。

**材料状态**：

- 输入 manifest 的 status=completed **仅表示关键漏洞事实（受影响版本范围、修复依据、触发条件）均有官方来源依据**，不表示材料完整；未闭环项见「仍缺什么」 [M01]。
- 漏洞侧官方事实链已闭环：GHSA 维护者公告、GitHub Advisory Database、NVD CVE API、官方 Release、官方 changelog、官方仓库本地 git 取证与 3.1.5/3.1.6 双版本行为验证 [M01]。
- **source_documents 保存的是本轮取得的正文或摘录**（8 条，全部来自实际读取，保留获取方式与截断标记），**尚未发布证据包**：package_ref=null，结果随 Run 保存，未生成或发布外部包；交接由操作者以工作项证据方式人工进行 [M01]。
- 业务侧（SCC chatops-api、adr-api 的实际部署版本与模板调用方式）**未核查**，属 B 节点任务；本报告仅移交扫描索引线索（见「受影响范围」），不作影响判定 [M01]。
- 本报告为本节点对输入 manifest 的汇总（map），未新增检索；全部事实与引文均出自该 manifest 保存的正文/摘录 [M01]。

## 官方事实（逐条可复核）

1. **GHSA-cpwx-vrp4-4pq7（pallets/jinja 维护者公告，davidism 2025-03-05 发布）**：Moderate 5.4，`CVSS:4.0/AV:L/AC:L/AT:P/PR:L/UI:P/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N`；CVE ID CVE-2025-27516；Weaknesses「No CWEs」；Credits securingapps；Affected versions「<=3.1.5」。保存文本中该页 Patched versions 字段显示「None」，与 Advisory Database / Release / changelog / NVD 记录的 3.1.6 不一致，按保存原文如实记录。原文（逐字）：
   > An oversight in how the Jinja sandboxed environment interacts with the |attr filter allows an attacker that controls the content of a template to execute arbitrary Python code.
   > To exploit the vulnerability, an attacker needs to control the content of a template. Whether that is the case depends on the type of application using Jinja. This vulnerability impacts users of applications which execute untrusted templates.
   > Jinja's sandbox does catch calls to str.format and ensures they don't escape the sandbox. However, it's possible to use the |attr filter to get a reference to a string's plain format method, bypassing the sandbox. After the fix, the |attr filter no longer bypasses the environment's attribute lookup.
   [M01]

2. **Release 3.1.6（2025-03-05 20:05，github-actions 发布，davidism GPG 验签 43368A7AA8CC5926 Verified）**：「This is the Jinja 3.1.6 security release, which fixes security issues but does not otherwise change behavior and should not result in breaking changes compared to the latest feature release.」修复条目：「The |attr filter does not bypass the environment's attribute lookup, allowing the sandbox to apply its checks. GHSA-cpwx-vrp4-4pq7」 [M01]

3. **官方 changelog Version 3.1.6（Released 2025-03-05）**：同一修复条目（关联 GHSA-cpwx-vrp4-4pq7）；相邻 Version 3.1.5（2024-12-21）含先前沙箱相关条目 GHSA-q2x7-8rv6-6q7h（间接 str.format 调用处理）与 GHSA-gmj6-6f8f-6699，作为上下文 [M01]。

4. **GitHub Advisory Database（GitHub Reviewed）**：Published Mar 5, 2025、Updated Nov 3, 2025；Affected versions「<= 3.1.5」、Patched versions「3.1.6」；References 含 GHSA-cpwx-vrp4-4pq7、pallets/jinja@90457bb、NVD 详情页与两条 Debian LTS 公告 [M01]。

5. **NVD CVE API 官方 JSON**：published 2025-03-05T21:15:20.073、lastModified 2026-06-17T09:03:44.560（vulnStatus Modified）；affected「< 3.1.6」；英文描述与 GHSA 一致并以「This vulnerability is fixed in 3.1.6.」收尾；weaknesses CWE-1336（Secondary）；CVSS v3.1（nvd@nist.gov，Primary）**8.8 HIGH**（`CVSS:3.1/AV:L/AC:L/PR:L/UI:N/S:C/C:H/I:H/A:H`，exploitabilityScore 2.0 / impactScore 6.0）；CVSS v4.0（security-advisories@github.com，Secondary）5.4 MEDIUM；CISA SSVC（CISA Coordinator）：exploitation=none、automatable=no、technicalImpact=total；CPE `cpe:2.3:a:palletsprojects:jinja:*` versionEndExcluding **3.1.6**，另含 Debian GNU/Linux 11.0 CPE；references 含修复 commit（Patch）、GHSA（Vendor Advisory）与两条 Debian LTS [M01]。

6. **修复 commit（pallets/jinja@90457bbf…）**：标题「Merge commit from fork」/「attr filter uses env.getattr」，双亲 033c200 + 065334d，3 files changed +30/−21（CHANGES.rst +4、src/jinja2/filters.py +16/−21、tests/test_security.py +10）。do_attr 重写为先 `getattr_static` 判存在性、统一 `return environment.getattr(obj, name)`（代码注释原文：「But we want to call env.getattr to get behavior such as sandboxing.」）；新增回归测试 `tests/test_security.py::test_attr_filter`，官方利用形态模板 `{{ "{0.__call__.__builtins__[__import__]}" | attr("format")(not_here) }}` 期望抛出 SecurityError [M01]。

7. **官方仓库本地 git 取证**（克隆官方 https://github.com/pallets/jinja，`GIT_CONFIG_GLOBAL/SYSTEM=/dev/null` 直连）：标签 3.1.5=877f6e51be8e1765b06d911cfaa9033775f051d1、3.1.6=15206881c006c79667fe5154fe80c01c65410679；`merge-base --is-ancestor`：90457bbf 是 3.1.6 祖先、非 3.1.5 祖先；实际改动提交 065334d1ee5b7210e1a0a93c37238c86858f2af7。3.1.5 源码：do_attr 直接 `getattr` 取值返回，未经 `environment.getattr` 的 `wrap_str_format` 拦截路径（sandbox.py L306/L326、L344 起，L352 检查 `__name__ in ("format", "format_map")`）。双版本行为验证（python 3.12.3 + markupsafe 2.1.5，直接加载官方 tag 源码运行回归测试模板）：**3.1.5 RENDER OK -> '<built-in function __import__>'；3.1.6 RAISED jinja2.exceptions.SecurityError** [M01]。

## 受影响范围

- 组件范围：**Jinja2 <= 3.1.5（即 < 3.1.6）**。交叉印证：GHSA「<=3.1.5」；Advisory Database「<= 3.1.5」/Patched「3.1.6」；NVD affected「< 3.1.6」且 CPE versionEndExcluding 3.1.6；官方仓库 3.1.5 为最后一个受影响标签，修复 commit 为 3.1.6 祖先、非 3.1.5 祖先 [M01]。
- NVD configurations 另含 Debian GNU/Linux 11.0 的 CPE 匹配（发行方维度；对应公告正文未取得）[M01]。
- 业务范围（待 B 节点核查）：SCC **chatops-api**、**adr-api**。cve-fix 扫描索引线索（source_documents 末条，sourceLine=1682；**仅线索、非影响判定**）：libraryRaw「Jinja2-2.10.1-py2.py3-none-any.whl」（all-scan-scc-6 直接依赖，assignedPerson 余昌发），与业务范围相关的 dependencyFile 线索为：
  - `/home/jenkins/3/mq_gitlab/scan_code/CMP/SCC/Subscription/chatops/chatops-api/chatops-api/requirements.txt`
  - `/home/jenkins/3/mq_gitlab/scan_code/CMP/SCC/ThirdParty/aDR/adr-api/adr-api/requirements.txt`
  - `/home/jenkins/3/mq_gitlab/scan_code/CMP/SCC/ThirdParty/aDR/adr-api/adr-api/test-requirements.txt`

  线索均指向 Jinja2 **2.10.1** wheel（< 3.1.6）；实际部署版本与调用方式须由 B 节点核查 [M01]。

## 触发条件

| # | 条件 | 状态 | 依据（要点） |
|---|------|------|------|
| 1 | 版本：Jinja2 <= 3.1.5（< 3.1.6） | 已证（known=true） | GHSA / Advisory Database / NVD / Release / changelog / 本地 git 标签与祖先关系 |
| 2 | 攻击者控制被渲染模板的内容（而非仅数据变量） | 已证 | GHSA/NVD 原文「To exploit the vulnerability, an attacker needs to control the content of a template.」 |
| 3 | 应用执行不可信模板 | 已证 | GHSA 原文「This vulnerability impacts users of applications which execute untrusted templates.」 |
| 4 | 利用路径：`|attr` 取得字符串原始 `format` 引用并调用，绕过沙箱对 `str.format` 的拦截 | 已证 | GHSA 原文 + 官方回归测试模板 + 3.1.5 源码取证 + 3.1.5 渲染逃逸成功可达内建 `__import__` |
| 5 | 必要配置：使用沙箱环境（SandboxedEnvironment）；被绕过防线是 `wrap_str_format` 对 `str.format`/`str.format_map` 的包装拦截 | 已证 | GHSA 沙箱场景描述 + sandbox.py 取证 + 修复 commit 注释 |
| 6 | 危害：沙箱外执行任意 Python 代码（NVD v3.1 C/I/A 均 High、Scope Changed；SSVC technicalImpact=total） | 已证 | GHSA/NVD 描述与 CVSS/SSVC + 本地行为验证 |
| 7 | 业务适用性：chatops-api / adr-api 实际部署 < 3.1.6，且存在渲染攻击者可控模板内容的调用方式 | **未核查（known=false，B 节点项）** | 仅扫描索引线索（2.10.1 wheel）；部署版本与调用方式待 B 核查，不计为 A 必须补齐的官方材料缺口 |

## 修复线索

- **修复版本：Jinja2 >= 3.1.6**（2025-03-05 security release，tag 提交 15206881…，GPG 验签；官方说明不改变其他行为、无破坏性变更）[M01]。
- 修复 commit 90457bbf33b8662926ae65cdde4c4c32e756e403（实际改动提交 065334d1）：do_attr 统一走 `environment.getattr`，使 `str.format` 引用经 `wrap_str_format` 包装、沙箱检查生效；新增回归测试 `test_attr_filter`；该 commit 为 3.1.6 祖先、非 3.1.5 祖先 [M01]。
- 行为验证：3.1.6 对官方回归测试模板抛 SecurityError，3.1.5 渲染成功（逃逸可达内建 `__import__`）[M01]。
- 修复后行为（GHSA 原文）：「After the fix, the |attr filter no longer bypasses the environment's attribute lookup.」[M01]

## 来源 URL

官方来源（已取得正文或摘录）：

1. https://github.com/pallets/jinja/security/advisories/GHSA-cpwx-vrp4-4pq7 （GHSA 维护者公告）
2. https://github.com/advisories/GHSA-cpwx-vrp4-4pq7 （GitHub Advisory Database）
3. https://services.nvd.nist.gov/rest/json/cves/2.0?cveId=CVE-2025-27516 （NVD CVE API，对应 https://nvd.nist.gov/vuln/detail/CVE-2025-27516）
4. https://github.com/pallets/jinja/releases/tag/3.1.6 （Release 3.1.6）
5. https://jinja.palletsprojects.com/en/stable/changes/ （官方 changelog）
6. https://github.com/pallets/jinja/commit/90457bbf33b8662926ae65cdde4c4c32e756e403 （修复 commit）
7. https://github.com/pallets/jinja （官方仓库：本地 git 取证与双版本行为验证）

补充性来源（正文未取得，仅列出出处，不作为证据）：

- https://access.redhat.com/security/cve/cve-2025-27516 （Red Hat；仅搜索摘要标注 important，全文未取得）
- https://lists.debian.org/debian-lts-announce/2025/04/msg00022.html 、 https://lists.debian.org/debian-lts-announce/2025/04/msg00045.html （Debian LTS，反爬拦截）

## 仍缺什么

- **Red Hat CVE 页正文未取得**：上一轮 request/auto 两种方式均失败，本轮未再重试 [M01]。
- **两条 Debian LTS 公告正文未取得**：本轮以 fetchWebContent request 模式、browser 模式（本环境未安装 Playwright）与 bash curl 直连各尝试一次，均被 lists.debian.org 的 Varnish PoW 反爬挑战页拦截；按「每方法一次、不反复重试」原则停止，未尝试绕过 [M01]。
- **私有 PR 正文与编号不可得**：修复以「Merge commit from fork」标题合入；实际改动提交与官方回归测试已由本地 git 取证补齐（次要缺口）[M01]。
- **业务侧事实完全未核查**：chatops-api / adr-api 实际部署的 Jinja2 版本、是否使用沙箱环境、是否存在渲染攻击者可控模板的调用路径——属 B 节点核查项 [M01]。
- **过程性收集错误（已记录、有替代路径）**：第二次检索后端转发超时；NVD HTML 详情页 request 模式仅返回 JS 壳（已改用官方 NVD CVE API）；首次 git 克隆因环境 URL 重写致 TLS 失败（已用 GIT_CONFIG_GLOBAL/SYSTEM=/dev/null 直连解决）；首轮误用 v 前缀标签名（已用正确标签 3.1.5/3.1.6 重跑）[M01]。
- 前三项均为补充性来源，不影响受影响版本边界、修复依据与触发条件的官方证据链；但据此**不得声称材料完整** [M01]。

## 下一步

1. 操作者审阅本报告；将本结果正文连同实际 workId/runId/definitionId/resultId 作为工作项新证据，人工移交 B 节点（不自动发布、不结项）。
2. B 节点核查：chatops-api / adr-api 实际部署的 Jinja2 版本（requirements 线索指向 2.10.1，< 3.1.6）与模板调用方式（是否执行不可信模板、是否使用沙箱环境）；依材料约束不读取旧影响 manifest 当作新判定、不修改业务源码或业务环境 [M01]。
3. 补充性来源（Red Hat、Debian LTS）如需补齐再按需安排，遵循「每方法一次、不反复重试」；不影响现有上游官方事实链。
4. 证据包发布属后续环节：source_documents 目前仅为本轮取得的正文或摘录，尚未发布证据包。