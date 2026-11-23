// 由 Pi 自己的扩展加载器加载，沿用 Pi 对旧版扩展 API 的兼容入口。
import { createMcpAdapter } from 'pi-mcp-adapter';

export default function mcpExtension(pi) {
  pi.events.on('flowcraft:mcp-configuration', (config) => {
    createMcpAdapter({ config })(pi);
  });
}
