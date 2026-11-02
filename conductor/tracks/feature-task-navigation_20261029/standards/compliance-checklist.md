# 提交前编码合规检查清单

> 来源：cospowers skill `code-compliance-check`（`D:\Users\User\cospowers\skills\code-compliance-check\`）及两个 backend-developer skill 的手动检查清单。
> - §1–§2 提取自 `go-backend-developer/SKILL.md` §3.2 与 `python-backend-developer/SKILL.md` §4.2（手动检查清单）
> - §3 整文件复制自 `code-compliance-check/references/must-check-first.md`（高频规则 + grep 候选发现模板；编码前置场景可只保留规则条文、删掉 grep 命令，待 Owner 裁剪）
> - §4 摘自 `code-compliance-check/SKILL.md` 的门禁语义
>
> 提取日期：2026-09-03

## 1. Go 手动检查清单

出处：go-backend-developer SKILL.md §3.2

- [ ] 是否有语法错误
- [ ] 是否使用 gofmt 格式化
- [ ] 是否正确处理错误
- [ ] 是否使用 logger 而不是 print
- [ ] 是否有资源泄漏风险
- [ ] 函数和变量命名是否清晰
- [ ] 是否有必要的注释
- [ ] 是否遵循 Go 编码规范
- [ ] API struct 字段类型是否按字段名语义匹配（`*_id`→UUID类型、`*_ip`→IP类型、`*_port`→uint16、`*_at`→time.Time 等）

自动检查基线（go-backend-developer SKILL.md §3.1）：`go fmt ./...`、`go vet ./...`、`golangci-lint run`（如有）。

## 2. Python 手动检查清单

出处：python-backend-developer SKILL.md §4.2

- [ ] 是否有语法错误
- [ ] 是否遵循 Python 版本规范（Py2/Py3）
- [ ] 是否使用 logger 而不是 print
- [ ] 是否正确处理异常
- [ ] 是否定义错误码
- [ ] 是否有安全风险
- [ ] 变量和函数命名是否清晰
- [ ] 是否有必要的注释
- [ ] API 参数字段类型是否按字段名语义匹配（`*_id`→UUIDType、`*_ip`→IPv4Type、`*_port`→PortType、`*_at`→Datetime 等）

自动检查基线（python-backend-developer SKILL.md §4.1）：`code_checker.py`（语法、编码风格、版本特定问题、裸 except、SQL 注入、TODO/FIXME）。

## 3. 高频合规规则（must-check-first，整文件副本）

> 来源：`code-compliance-check/references/must-check-first.md`。这些是提交合规检查中命中率最高的规则，编码阶段就应遵守；grep 命令是检查 Agent 的候选发现手段，不是自动定罪（解释规则见文末）。

# MUST CHECK FIRST Reference

This reference contains the bulky grep templates for `code-compliance-check` and `kb-compliance-checker`. Main skills should point here instead of inlining this content.

## Python high-hit rules (2026-06-25)

Run when Python files are changed, before document-specific checks.

1. **E1.3** `raise` must have `LOG.error(...)` / `LOG.exception(...)` within the previous 5 lines.
2. **E8.7** CRUD endpoints must log key fields at INFO level.
3. **E1.6** No bare `except:` / `except Exception:` / `except BaseException`.
4. **E1.7** No `continue` / `pass` inside `except` blocks.
5. **E1.4** No built-in exceptions such as `ValueError`, `RuntimeError`, `TypeError`, `Exception`; use project-specific `VisibleEx*` / `InvisibleEx*`.

```bash
changed_py=$(git diff --name-only HEAD | grep -E "\.py$" | tr '\n' ' ')

# E1.3: raise before LOG.error / LOG.exception
if [ -n "$changed_py" ]; then
  grep -nE "raise " $changed_py
fi
# Inspect the previous 5 lines for LOG.error/LOG.exception.

# E8.7: CRUD endpoint INFO logging candidates
if [ -n "$changed_py" ]; then
  grep -nE "@router\.|@app\.route|@api_view" $changed_py
fi
# Inspect every CRUD endpoint for INFO logs with key fields.

# E1.6: bare/broad except candidates
if [ -n "$changed_py" ]; then
  grep -nE "^\s*except\s*:|^\s*except\s+(Exception|BaseException)\b" $changed_py
fi

# E1.7: continue/pass candidates; inspect whether inside except block
if [ -n "$changed_py" ]; then
  grep -nE "^\s*(continue|pass)\s*$" $changed_py
fi

# E1.4: built-in exception candidates
if [ -n "$changed_py" ]; then
  grep -nE "raise\s+(ValueError|RuntimeError|TypeError|Exception)\b" $changed_py
fi
```

## Go high-hit rules (2026-06-27)

Run when Go files are changed, before document-specific checks.

1. **G-SEC-01** No hardcoded secret / token / password / key.
2. **G-SEC-02** No sensitive information in logs.
3. **G-SEC-03** No SQL string concatenation.
4. **G-ARCH-01** No business-logic `panic(err)`.
5. **G-ARCH-02** No goroutine closure capture of loop variables.
6. **G-ARCH-03** `http.Response.Body` must be closed.
7. **G-ARCH-04** No ignored `error` return values.

```bash
changed_go=$(git diff --name-only HEAD | grep -E "\.go$" | tr '\n' ' ')

# G-SEC-01: hardcoded secret/token/password/key candidates
if [ -n "$changed_go" ]; then
  grep -nEi '(token|secret|password|apikey|api_key|key)\s*(:=|=)\s*"[^"]+"' $changed_go
fi

# G-SEC-02: sensitive variables in logs/prints
if [ -n "$changed_go" ]; then
  grep -nEi '(log\.|fmt\.Print|Printf).*%(s|v).*\b(token|secret|password|apikey|apiKey|api_key)\b|\b(token|secret|password|apikey|apiKey|api_key)\b.*(log\.|fmt\.Print|Printf)' $changed_go
fi

# G-SEC-03: SQL string formatting/concatenation candidates
if [ -n "$changed_go" ]; then
  grep -nEi 'fmt\.Sprintf\(.*(SELECT|INSERT|UPDATE|DELETE)|("|`).*(SELECT|INSERT|UPDATE|DELETE).*("|`)\s*\+' $changed_go
fi

# G-ARCH-01: panic(err)
if [ -n "$changed_go" ]; then
  grep -nE 'panic\(err\)' $changed_go
fi

# G-ARCH-02: goroutine closure candidates
if [ -n "$changed_go" ]; then
  grep -nE 'go\s+func\s*\(\s*\)\s*\{' $changed_go
fi

# G-ARCH-03: http response body close candidates
if [ -n "$changed_go" ]; then
  grep -nE '\.Do\(.*\)|http\.(Get|Post|Head)\(' $changed_go
fi

# G-ARCH-04: ignored errors
if [ -n "$changed_go" ]; then
  grep -nE '_,\s*_|_\s*:=|=\s*[^\n,]+,\s*_' $changed_go
fi
```

## i18n high-hit rules (2026-07-04)

Run when Python or Go files are changed, before document-specific checks.

1. **PY2-I18N-PREFIX** Python 2 user-visible Chinese strings must use `_(u"...")`. Flag raw Chinese literals and `_("...")` / `_(\'...\')` candidates.
2. **PY3-I18N-PREFIX** Python 3 user-visible Chinese strings must use `_("...")`. Flag raw Chinese literals and legacy `_(u"...")` / `_(u\'...\')` candidates.
3. **GO-I18N-WRAPPER** Go user-visible Chinese strings must use `I("...")` or `i18n.I("...")`. Flag raw Chinese literals not wrapped by an allowed i18n call.

```bash
# Python: all Chinese text candidates
if [ -n "$changed_py" ]; then
  grep -nE '[一-龥]' $changed_py
fi

# Python 2: translated Chinese strings missing u-prefix
if [ -n "$changed_py" ]; then
  grep -nE '_\(["'"'"'][^"'"'"']*[一-龥]' $changed_py
fi

# Python 3: legacy py2-style translated Chinese strings
if [ -n "$changed_py" ]; then
  grep -nE '_\(u["'"'"'][^"'"'"']*[一-龥]' $changed_py
fi

# Go: all Chinese text candidates; inspect whether wrapped by I(...) / i18n.I(...)
if [ -n "$changed_go" ]; then
  grep -nE '[一-龥]' $changed_go
fi
```

## Audit, VisibleEx, and maintainability high-hit rules (2026-07-04)

Run when changed files add or modify APIs, exception classes, or business functions.

1. **CRUD-ULOG-01** New create/update/delete APIs must write operation audit logs through `ulog` / audit logging. INFO business logs are not a substitute for operation audit.
2. **VISIBLEEX-MSG-01** `VisibleEx*` exception classes are shown to users. Their user-facing message must follow the three-part structure: current operation, failure reason, and how to handle it.
3. **COMMENT-DOC-01** New or materially changed functions should have sufficiently detailed docstrings/comments describing responsibility and high-level logic. Complex business branches need inline comments explaining why, not just what.

```bash
# CRUD API candidates: inspect for matching ulog/audit_log/ULOG/AuditLog calls in the changed handler/service path.
if [ -n "$changed_py" ]; then
  grep -nE '@(router|app)\.(post|put|patch|delete)|@app\.route\(.*methods=.*(POST|PUT|PATCH|DELETE)|def\s+(create|update|delete|remove|publish|approve|reject)_' $changed_py
  grep -nE 'ulog|audit_log|AuditLog|ULOG|operation audit|操作审计' $changed_py
fi
if [ -n "$changed_go" ]; then
  grep -nE 'Handle(Func)?\(.*(POST|PUT|PATCH|DELETE)|Method(Post|Put|Patch|Delete)|func\s+(Create|Update|Delete|Remove|Publish|Approve|Reject)' $changed_go
  grep -nE 'ulog|audit|AuditLog|OperationLog|操作审计' $changed_go
fi

# VisibleEx user-facing message candidates: inspect message_format/message text for three parts.
if [ -n "$changed_py" ]; then
  grep -nE 'class\s+VisibleEx|VisibleEx[A-Za-z0-9_]*|message_format\s*=' $changed_py
fi

# Comment/docstring candidates: inspect new functions/classes and nearby docstring/comment detail.
if [ -n "$changed_py" ]; then
  grep -nE '^(\+)?\s*(def|class)\s+[A-Za-z_][A-Za-z0-9_]*' $changed_py
  grep -nE '"""|\'\'\'|#\s*.{8,}' $changed_py
fi
if [ -n "$changed_go" ]; then
  grep -nE '^(\+)?\s*func\s+[A-Za-z_][A-Za-z0-9_]*|^(\+)?\s*func\s*\(' $changed_go
  grep -nE '^\s*//\s*.{8,}' $changed_go
fi
```

## Interpretation rule

These grep commands are mandatory candidate discovery, not automatic conviction. Final verdicts must still check:

- the matched line is part of the current diff;
- the string is user-visible;
- the match is not only a log/config key/API path/test assertion/comment false positive;
- the loaded rule document makes the violation applicable.

---

## 4. 合规门禁语义（摘自 code-compliance-check SKILL.md）

- 检查模式：`lightweight`（日常提交，完整 Critical 基线 + 变更匹配规则）/ `lights_out`（无人值守，全部匹配规则）。两种模式均 fail closed。
- 终态：`PASS`（合规检查通过）/ `FAIL`（发现代码合规问题，停止提交）/ `INCOMPLETE`（合规检查未完成，停止提交，不代表代码有无违规）。
- **扫描屏障**：检查过程中主 Agent、Sub Agent、lint、formatter、hook 均不得修改工作区（`mutation_policy=frozen-read-only`）；发现违规只记录，不得边发现边修复；修复合规问题必须在完整 FAIL 报告 finalize 后由单一 Writer 统一修改，并用递增 epoch 重新全量扫描。
- 检查 PASS 后若再运行会修改工作区的工具（如 lint --fix），原报告立即失效，必须重新走完整检查；禁止沿用旧 diff hash 或旧 PASS。
- 单条规则判罚前须确认（解释规则，来自上方 must-check-first 副本）：匹配行在当前 diff 内、字符串确为用户可见、非日志/配置键/API 路径/测试断言/注释误报、且加载的规则文档确实适用。
