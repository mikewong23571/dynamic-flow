# 本地文件与状态恢复（伪代码，不可运行）

对应 F4、保存失败与断线恢复。只有具体文件读写函数，没有存储适配器或通用 Repository。

```text
writeNewDefinition(definition):
  生成新 ID；将字面量对象确定性保存为 export default 的 JS 定义
  先写临时文件，再替换为新文件名；已有 ID 永不覆盖
  成功后返回 ID，不把文件未写完的 ID 提交给 Work

change(workId, edit):
  同一工作的小型保存操作按提交顺序执行，不在模型调用期间占用
  复制最新已保存 Work，edit(copy) 检查并修改
  若检查冲突或写入失败：保留原状态，返回具体问题，不发成功事件
  将 copy 写临时 work.json 再替换原文件
  成功后更新内存并向工作区推送完整最新状态
  // 仅为避免本原型异步保存互相覆盖，用一条 promise 串联即可；不是任务队列平台

openWork(workId):
  从 work.json 和草稿/采用版/Run/Comparison 引用的不可变定义文件重建状态
  只读操作，不会把正常运行标为中断

onServerStart():
  找出保存为 queued/running/stopping 且本进程已无调用句柄的 Run/Comparison
  标为 interrupted，保留完成结果，不自动重跑；清理未完成实例的“运行中”状态
  用户可以查看并显式重试

subscribeWork(workId):
  建立连接立即发送最新完整状态；以后每次 change 成功推送
  重连重新发送当前状态，不要求客户端重放完整事件历史
```

每个工作一份 work.json，包含材料、运行元数据、结果、比较、消息、视图；定义单独存 JS。先写新定义再更新索引，失败最多留下未引用定义，不让旧工作指向未完成内容。第一版小数据量可接受整份写入，不预建数据库、日志恢复或备份平台；流式 token 在内存显示，完成消息及有意义的节点状态才持久化。
