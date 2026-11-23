# CVE-2025-27516（Jinja2）业务影响调查报告 · SCC chatops-api / adr-api

## 一、整体判断与调查范围

- **漏洞**：CVE-2025-27516 — Jinja2 沙箱逃逸：`|attr` 过滤器可取得字符串未包装的 format 方法引用，绕过沙箱对 `str.format` 的拦截，在攻击者可控模板内容的前提下执行任意 Python 代码（官方公告 GHSA-cpwx-vrp4-4pq7，2025-03-05 发布）。受影响版本 **Jinja2 <= 3.1.5（即 < 3.1.6）**，修复版本 **3.1.6**。[M02]
- **业务范围（操作者选择，仅限两系统）**：SCC/chatops-api、SCC/adr-api。[M01][M03]
- **整体结论：undetermined（无法判定）**，status=**incomplete**。逐系统汇总：impacted 0、not_impacted 0、undetermined 2（SCC/chatops-api、SCC/adr-api）。
- **判定依据（不改写）**：两系统给定仓库经实测均不可达（TLS 握手被终止/直连超时），未取得当前源码、requirements.txt 实文、git revision 或部署信息；唯一业务证据是 2025-12-04 扫描工作区的历史依赖线索（Jinja2-2.10.1 wheel，落在 < 3.1.6 范围内），按 [M03] 原文「扫描记录是历史依赖线索，不代表当前部署版本或可利用性」仅作候选依据——**无排除依据（不能写 not_impacted），亦无当前版本与触发证据（不能写 impacted）**，故两者均维持 undetermined。
- 本报告为报告展示层：忠实汇总本轮输入的 status 与 overall_conclusion，确定性汇总结论未作改写。

## 二、逐系统影响核对表

| 系统 | 实际版本 | 触发条件核查 | 结论 | 来源 | 待补事项 |
|---|---|---|---|---|---|
| SCC/chatops-api | 未取得（revision=null、environment=null）；唯一历史扫描线索 Jinja2-2.10.1（2025-12-04 扫描，< 3.1.6 落在受影响范围，不代表当前部署版本） | ① 版本 < 3.1.6：未确认（仅历史线索）；② 攻击者可控模板内容：无证据；③ 执行不可信模板入口：无源码，未知；④ `\|attr` 可达路径：无源码，未知；⑤ SandboxedEnvironment 配置：无证据；⑥ 排除依据（≥ 3.1.6 或无不可信模板渲染）：不存在 → 全部无法核实 | **undetermined** | 线索：`/home/mike/projs/main/cve-fix/artifacts/vulnerabilities.clean.jsonl#L1682`（本轮实读复核一致）；仓库：`https://mq.code.sangfor.org/CMP/SCC/Subscription/chatops/chatops-api.git`（三种访问配置实测不可达）；上游：GHSA-cpwx-vrp4-4pq7、NVD CVE API、Release 3.1.6、commit 90457bbf；制品：`cleaned-cve-2025-27516-chatops-clue-line1682.json`、`cleaned-cve-2025-27516-chatops-repo-access-20261022.txt` | 提供可达入口（白名单/直连/源码包/镜像/制品库路径）；读取 requirements.txt 实文与 git revision；grep Jinja2 调用点（Environment/SandboxedEnvironment/from_string/render/render_template*）；确认攻击者可控模板路径；在部署环境核实实际安装版本 |
| SCC/adr-api | 未取得（revision=null、environment=null）；历史扫描线索两条：requirements.txt 与 test-requirements.txt 各一条 Jinja2-2.10.1（2025-12-04 扫描，< 3.1.6 落在受影响范围，不代表当前部署版本；测试依赖与运行时依赖在实际部署中的构成未区分） | ①–⑥ 同上均未确认（漏洞侧条件本身已由官方来源复核成立：需 ≤ 3.1.5 且应用执行攻击者可控模板）；排除依据不存在 | **undetermined** | 线索：同上第 1682 行（本轮实读复核一致，adr-api 两条线索逐字存在）；仓库：`https://mq.code.sangfor.org/CMP/SCC/ThirdParty/aDR/adr-api.git`（M03 预检不可达，本轮未重试）；上游来源同上；制品：`cleaned-cve-2025-27516-adr-api-clue-line1682.json` | 同上；另需读取 test-requirements.txt 与 requirements.txt 并区分测试/运行时构成；在部署环境（pip freeze/锁文件/镜像层）核实实际安装的 Jinja2 版本 |

## 三、本轮核实事实与用户线索（分开列示）

### 3.1 本轮核实事实（一手取证，2026-10-22）

**漏洞侧官方事实链（A 节点材料，本轮报告如实引用）** [M02]：
1. GHSA-cpwx-vrp4-4pq7（https://github.com/pallets/jinja/security/advisories/GHSA-cpwx-vrp4-4pq7）：Affected versions「<=3.1.5」，Moderate 5.4（CVSS:4.0/AV:L/AC:L/AT:P/PR:L/UI:P/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N）；原文要求「an attacker needs to control the content of a template」，影响「applications which execute untrusted templates」。
2. NVD 官方记录（https://services.nvd.nist.gov/rest/json/cves/2.0?cveId=CVE-2025-27516）：affected「< 3.1.6」；CPE `cpe:2.3:a:palletsprojects:jinja:*` versionEndExcluding 3.1.6；CWE-1336；CVSS v3.1 Primary 8.8 HIGH（AV:L/AC:L/PR:L/UI:N/S:C/C:H/I:H/A:H）。
3. 官方 Release 3.1.6（https://github.com/pallets/jinja/releases/tag/3.1.6，2025-03-05 security release，GPG 验签）与官方 changelog（https://jinja.palletsprojects.com/en/stable/changes/）3.1.6 条目：「The \|attr filter does not bypass the environment's attribute lookup」。
4. 修复 commit `90457bbf33b8662926ae65cdde4c4c32e756e403`（「Merge commit from fork」/「attr filter uses env.getattr」，实际改动提交 `065334d1ee5b7210e1a0a93c37238c86858f2af7`）：改动 `src/jinja2/filters.py` 的 do_attr（统一走 environment.getattr）并新增 `tests/test_security.py::test_attr_filter` 回归测试；官方利用形态 `{{ "{0.__call__.__builtins__[__import__]}" | attr("format")(not_here) }}`。
5. 本地 git 取证（https://github.com/pallets/jinja 克隆）：标签 3.1.5=`877f6e51…`、3.1.6=`15206881…`；90457bbf 为 3.1.6 祖先、非 3.1.5 祖先；双版本行为验证：3.1.5 渲染成功返回 `<built-in function __import__>`，3.1.6 抛 `jinja2.exceptions.SecurityError`。

**业务访问取证（本轮逐系统核查记录）**：
6. cve-fix 扫描索引 `/home/mike/projs/main/cve-fix/artifacts/vulnerabilities.clean.jsonl` 第 1682 行实读复核一致：`grep -n 'CVE-2025-27516'` 全文件仅命中第 1682 行；`grep -c 'chatops'` = 27 行；chatops-api 与 adr-api 线索行逐字存在（含 dependencyFile 与 systemPath 全路径），字段 vulnId=CVE-2025-27516、library=Jinja2-2.10.1-py2.py3-none-any.whl、project=update-request6.txt、isTraced=true、assignedPerson=余昌发。
7. chatops-api 给定仓库三种访问配置实测均不可达：① 干净 git 配置+默认 socks5 代理：`gnutls_handshake() failed: The TLS connection was non-properly terminated.`；② curl 经 socks5h://127.0.0.1:1082：TLS Client Hello 后 `SSL_ERROR_SYSCALL in connection to mq.code.sangfor.org:443`；③ 去代理直连：40 秒超时（EXIT=124）。与 [M03] 预检结论一致。
8. 本机替代入口排查：`/home/mike/projs/main/cve-fix` 的 repos/work_repos 无 chatops-api/adr-api 检出（repos/jinja 为上游 pallets/jinja 取证克隆）；扫描线索 systemPath=`/tmp/ws-ua_20251204091525_XQTYYK/python_BURNIS/20251204091526/` 在本机不存在。
9. 取证制品已落盘移交下游复核：`cleaned-cve-2025-27516-chatops-clue-line1682.json`（6269 字节）、`cleaned-cve-2025-27516-chatops-repo-access-20261022.txt`（3566 字节）、`cleaned-cve-2025-27516-adr-api-clue-line1682.json`（7259 字节）。

### 3.2 用户线索（仅候选依据，未作为影响判定）

- [M03] 选定扫描线索（vulnerabilities.clean.jsonl 第 1682 行，all-scan-scc-6）：chatops-api/requirements.txt 一条、adr-api 的 requirements.txt 与 test-requirements.txt 各一条，均指向 `Jinja2-2.10.1-py2.py3-none-any.whl`；[M03] 明确「扫描记录是历史依赖线索，不代表当前部署版本或可利用性」。
- [M03] 预检（2026-10-22）：两仓库 `git ls-remote` 均失败（「TLS 连接异常终止，未取得源码或版本」）；现有源码检索服务连接被拒；指令约定「预检已确认现有访问方式不可用，没有新的明确入口时不要反复重试」，故本节点未重试。
- [M01] 约束：业务范围限定 SCC chatops-api、adr-api；不读取旧影响 manifest 当作新判定；不修改业务源码或业务环境。

## 四、未覆盖范围（单独展示）

1. **两系统当前部署版本/revision 与实际源码**：requirements.txt 实文、锁文件、Dockerfile/部署清单、运行环境均未取得（仓库不可达且本机无检出）。
2. **触发条件业务侧取证**：两系统是否存在「以 SandboxedEnvironment 执行攻击者可控模板内容」「`|attr` 过滤器可达路径」的调用方式，无任何源码或部署证据。
3. **adr-api 依赖构成**：test-requirements.txt（测试）与 requirements.txt（运行时）两条线索在实际部署中的构成未区分。
4. **约定范围外的 16 条线索系统**（同一扫描索引记录中其余 Jinja2-2.10.1 依赖线索，本轮未核查）：python-securityscoreclient、python-xaasclient、python-biclient、cbsp-api（test 与主 requirements 各一条）、python-adrapiclient/python-adr-api-client、python-cspmclient、python-janusclient、wcms-api、python-guanceclient、python-sangforoneclient、mssp-api、cspm-server、python-msspclient、python-marketplaceclient、cspm-api——如需覆盖须由操作者扩大范围确认。
5. **上游材料补充性缺口**（不影响漏洞事实链闭环）[M02]：私有安全修复流程的 PR 正文与编号不可得；Red Hat CVE 页正文未取得；两条 Debian LTS 公告（msg00022、msg00045）被 lists.debian.org Varnish PoW 反爬挑战页拦截，正文未取得。

## 五、材料来源（materials_ref）

- **materials_ref**：M02（操作者选中的 A 节点 materials 结果正文）；source：workId=`a6b0f746-1095-46b4-8f20-008d80d8c654`，runId=`12f37002-976b-4746-bc6c-54b4bb1e723c`，definitionId=`bbfd0ac7-307e-490f-8b88-7268f92fe83a`，resultId=`7462ce40-64a0-4f4b-98f8-0694e1cd30bb`；materialsVersion=`12f37002-976b-4746-bc6c-54b4bb1e723c/7462ce40-64a0-4f4b-98f8-0694e1cd30bb`。
- 本轮材料编号：M01（调查任务与约束）、M02（A 节点漏洞材料 manifest）、M03（业务线索选择与访问方式）。

## 六、完成状态确认（两项分别确认）

- **调查完成确认**：报告汇总节点任务已完成——总体与分项一致（undetermined ×2），未覆盖范围与证据缺口可见；漏洞侧官方事实链闭环。但 status=**incomplete** 表示漏洞影响调查本身未完成：两系统当前版本、源码、触发条件均未核实，不能出具 impacted/not_impacted 结论。
- **业务结项确认**：**未达成**。overall_conclusion=undetermined，两系统均待复核；本报告不构成结项，不构成任何修复发布或变更动作；结项须由操作者在补齐证据并复核改判后确认。

## 七、给操作者的下一步

1. **提供可达入口**：为 mq.code.sangfor.org 开通网络白名单/直连，或提供源码包、镜像、制品库路径（节点按 [M03] 约定不自建连接、不读取凭据、不反复重试不可达方式）。
2. **优先只读读取**：chatops-api 当前 requirements.txt 实文与 git revision；adr-api 的 requirements.txt、test-requirements.txt 与依赖锁定文件。
3. **核查 Jinja2 调用点**：grep Environment/SandboxedEnvironment/from_string/render/render_template* 等，确认是否存在攻击者可控模板内容的路径（GHSA 触发条件）。
4. **在部署环境核实实际安装版本**（pip freeze、锁文件或镜像层清单），确认是否 < 3.1.6。
5. **复核改判规则**：核实当前版本 >= 3.1.6 或不存在不可信模板渲染路径 → 改判 not_impacted 并留存代码/配置片段；核实版本 < 3.1.6 且存在可控模板渲染（沙箱）路径 → 改判 impacted；在此之前维持 undetermined，**不以历史线索 Jinja2-2.10.1 直接判 impacted**。
6. **范围扩展**：若需覆盖其余 16 条线索系统（见第四节第 4 项），请操作者确认扩大范围后另行核查。