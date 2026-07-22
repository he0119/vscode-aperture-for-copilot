# Aperture for Copilot Chat

把 OpenAI-compatible 的 Aperture 模型接入 GitHub Copilot Chat 的模型选择器。本扩展会注册一个 `aperture` language model provider，并把 Copilot Chat 请求转发到 Aperture 的 `/chat/completions` 端点。

## 功能

- 自动读取 `${baseUrl}/v1/models`，并按模型 ID 去重。
- 自动从模型列表字段或 models.dev `models.json` 补齐上下文、最大输出 token 和能力标记。
- 支持通过 `aperture-copilot.models` 覆盖自动发现的模型或补充额外模型。
- 将 OpenAI-compatible 的流式 chat completions 输出到 Copilot Chat。
- 对配置为 thinking 的模型，把 `reasoning_content` 输出为 Copilot thinking part。
- 支持 OpenAI-compatible tool calls，可用于 Copilot agent mode。
- 首版不启用图片输入。

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

   填入你的 Aperture 地址，例如：

   ```json
   {
     "aperture-copilot.baseUrl": "http://<aperture-hostname>"
   }
   ```

   扩展会在调用 OpenAI-compatible API 时自动追加 `/v1`，因此不要把 base URL 写成 `http://<aperture-hostname>/v1`。

4. 打开 Copilot Chat，并在模型选择器里选择 Aperture 模型。

## 常用设置

```json
{
  "aperture-copilot.baseUrl": "http://<aperture-hostname>",
  "aperture-copilot.modelMetadataUrl": "",
  "aperture-copilot.enabledModelIds": [],
  "aperture-copilot.models": [],
  "aperture-copilot.maxTokens": 0,
  "aperture-copilot.toolLimit": 128,
  "aperture-copilot.debugMode": "minimal"
}
```

常用命令：

- `Aperture: Set Base URL`：设置 Aperture 地址。
- `Aperture: Refresh Models`：重新拉取并刷新模型列表。
- `Aperture: Open Settings`：打开扩展设置。
- `Aperture: Show Logs`：查看诊断日志。

模型 token 限制按以下优先级决定：

1. `aperture-copilot.models` 中同 ID 模型的显式覆盖字段。
2. Aperture `/v1/models` 返回的显式字段，例如 `context_length`、`limit.context`、`limit.input`、`max_output_tokens`。
3. models.dev `models.json` 中的 `limit.context` / `limit.input` / `limit.output`。
4. 扩展内置默认值：输入 `128000`，输出 `16384`。

`modelMetadataUrl` 留空时使用默认地址 `https://models.dev/models.json`。

扩展也会从 metadata 读取部分能力标记：

- `tool_call: false` 会禁用该自动模型的工具调用。
- `reasoning: true` 会自动启用 thinking 控制。

thinking 模型会向 Copilot 暴露请求级 `reasoningEffort` 选项。当前在 models.dev 提供结构化 reasoning 选项前（见 [anomalyco/models.dev#314](https://github.com/anomalyco/models.dev/issues/314)），扩展按模型临时决定可选项：

- DeepSeek 模型显示 `auto`、`none`、`high`、`max`；选择 `high` 或 `max` 时会额外发送 `reasoning_effort`。
- 其他 reasoning 模型只显示开/关；默认 `auto` 只启用 thinking，让上游模型自行决定强度。

`models` 会按 ID 与自动发现结果合并：同 ID 条目只覆盖明确填写的字段，不存在的 ID 会作为额外模型加入。比如只修正自动发现的 K3，同时保留其他模型：

```json
{
  "aperture-copilot.models": [
    {
      "id": "k3",
      "name": "Kimi K3",
      "maxInputTokens": 1048576,
      "maxOutputTokens": 131072,
      "toolCalling": 128,
      "thinking": true
    }
  ]
}
```

要只显示配置中的模型，可同时把 `enabledModelIds` 设置为这些模型 ID；配置中未被自动发现的模型仍会加入选择器。

## 关于 Aperture

Aperture 是 Tailscale 提供的集中式 AI gateway，用于在组织内安全地路由、监控和管理 LLM 请求，并通过 Tailscale 身份进行鉴权。

目前 Aperture 仍处于 beta 阶段。想了解更多，参见官方文档：<https://tailscale.com/docs/aperture>

## 开发与发布

本仓库的 GitHub Actions 会在 push 和 pull request 到 `main` 时运行 `npm test`，并通过 `npm run package` 验证 VSIX 打包；push 到 `main` 或更新 pull request 时会维护 Release Draft；推送 `v*` tag 时会运行测试并发布到 Visual Studio Marketplace。

发布新版本的常用流程：

```sh
npm version patch
git push --follow-tags
```

## 致谢

本扩展是一个面向 Aperture 的独立实现，provider 架构参考了 MIT License 分发的 `Vizards/deepseek-v4-for-copilot`。

参考仓库：<https://github.com/Vizards/deepseek-v4-for-copilot>
