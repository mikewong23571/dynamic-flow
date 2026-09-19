# 应用源文件的实现说明

当前仅有 `.pseudo.md`，**没有可执行源码**。本目录对应未来一个应用，client/server 是组织文件用的目录，不是多个发布包。

- [client](./client/README.md)：完整工作区和面板，不按六类故事建六个独立页面。
- [server](./server/README.md)：具体业务函数、单进程运行和本地保存。
- [shared](./shared/README.md)：这些函数交接的少量记录。

未来组装：一个 Vite 入口挂载 Workspace；一个 Hono 入口加载本地工作状态、处理具体 HTTP 操作和 SSE；启动模型调用时读取根目录已有 .env.local。开发脚本在真正有代码后再添加，不复制旧实验成为新产品。

完成标准以 [验收路线](../tests/walkthroughs.md) 为准。新增模块前先指出哪个故事无法由当前文件承载；没有具体阻塞就留在现有函数里。
