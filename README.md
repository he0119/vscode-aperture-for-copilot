# Aperture for Copilot Chat

把 OpenAI-compatible 的 Aperture 模型接入 GitHub Copilot Chat 的模型选择器。本扩展会注册一个 `aperture` language model provider，并把 Copilot Chat 请求转发到 Aperture 的 `/chat/completions` 端点。

## 安装与配置

1. 安装依赖并编译：

   ```sh
   npm install
   npm run compile
   ```

2. 在 VS Code 的扩展开发宿主中运行本扩展。

3. 通过命令面板设置 Aperture base URL：

   ```text
   Aperture: Set Base URL
   ```

   当前环境可以使用：

   ```json
   {
     "aperture-copilot.baseUrl": "https://ai.long-antares.ts.net"
   }
   ```

4. 打开 Copilot Chat，并在模型选择器里选择 Aperture 模型。

API key 是可选的。如果你的 Aperture 部署要求鉴权，运行 `Aperture: Set API Key`；密钥会保存在 VS Code SecretStorage 中。

## 功能

- 自动读取 `${baseUrl}/v1/models`，并按模型 ID 去重。
- 支持通过 `aperture-copilot.models` 手动定义模型。
- 将 OpenAI-compatible 的流式 chat completions 输出到 Copilot Chat。
- 对配置为 thinking 的模型，把 `reasoning_content` 输出为 Copilot thinking part。
- 支持 OpenAI-compatible tool calls，可用于 Copilot agent mode。
- 首版不启用图片输入。

## 常用设置

```json
{
  "aperture-copilot.baseUrl": "https://ai.long-antares.ts.net",
  "aperture-copilot.modelSource": "auto",
  "aperture-copilot.enabledModelIds": [],
  "aperture-copilot.thinkingModelIds": [
    "deepseek-v4-flash",
    "deepseek-v4-pro",
    "deepseek-ai/DeepSeek-V4-Flash"
  ],
  "aperture-copilot.maxTokens": 0,
  "aperture-copilot.toolLimit": 128,
  "aperture-copilot.debugMode": "minimal"
}
```

手动模型配置示例：

```json
{
  "aperture-copilot.modelSource": "manual",
  "aperture-copilot.models": [
    {
      "id": "deepseek-v4-flash",
      "apiModelId": "deepseek-v4-flash",
      "name": "DeepSeek V4 Flash",
      "detail": "Aperture",
      "toolCalling": 128,
      "thinking": true
    }
  ]
}
```

## CI 与发布

本仓库参考 `he0119/vscode-bangumiplan` 配置了 GitHub Actions：

- push 和 pull request 到 `main` 时运行 `npm test`，并用 `npm run package` 验证 VSIX 打包。
- push 到 `main` 或更新 pull request 时维护 Release Draft。
- 推送 `v*` tag 时运行测试，并发布到 Visual Studio Marketplace。

首次发布前需要在 GitHub 仓库 Secrets 中配置 `VS_MARKETPLACE_TOKEN`。该 token 需要具备 Visual Studio Marketplace 发布扩展的权限。

发布新版本的常用流程：

```sh
npm version patch
git push --follow-tags
```

当前 `package.json` 的 publisher 为 `he0119`；如果 Marketplace publisher 不同，需要先改成实际 publisher。

## 致谢

本扩展是一个面向 Aperture 的独立实现，provider 架构参考了 MIT License 分发的 `Vizards/deepseek-v4-for-copilot`。

参考仓库：https://github.com/Vizards/deepseek-v4-for-copilot
