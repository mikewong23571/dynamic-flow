# 托管服务更新

2026-11-02 用户明确授权“更新服务”。发布产品版本：`e7b340cbab7f8d30d5fb3a4b05a11ccf7d965126`。完成时间：`2026-11-02T11:13:14.720716+00:00`。

- 主工作区pnpm build成功；产物与此前独立验收同名bundle一致。现有大chunk提示仍存在，不影响构建。
- 保持原systemd托管方式：flowcraft.service的command.conf使用pnpm dev:managed，前端0.0.0.0:4320、API4321、数据根data。没有改成其它部署架构或调试数据根。
- 按本次用户授权执行systemctl --user restart flowcraft。主PID从1678814更新为1750245；active/running，NRestarts=0。
- 前端首页4320、API4321工作项摘要读取、4320代理同一API均HTTP200；实际读取Vite提供的OpenUI模块和CSS，确认SectionRenderer、标题样式和默认分界已加载。
- 启动期间前端先于后端就绪，已有浏览器轮询短暂ECONNREFUSED；后端11:13:01就绪后本轮读回全部成功。未将启动窗口错误隐藏为全程无中断。
- 既有工作项文件均保留；models.toml及data/model-settings.json前后哈希一致，未输出或修改配置内容，未写业务输入/执行/条件。
- 本轮仅构建、服务更新及只读健康检查；此前12模块/25浏览器、两尺寸视觉证据仍为先前验证，不宣称本次重跑模型或浏览器业务路线。

访问：http://10.134.94.200:4320/

独立4336合成预览保留。此前review/integration中未主动重启托管服务的描述为当时状态，由本次明确发布授权及记录更新。
