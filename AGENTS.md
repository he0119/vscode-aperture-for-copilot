# AGENTS.md

## 项目概览

本仓库是一个 VS Code 扩展，用于把 OpenAI-compatible 的 Aperture 模型接入
GitHub Copilot Chat 的模型选择器。

## 常用命令

- 安装依赖：`npm install`
- 编译扩展：`npm run compile`
- 运行测试：`npm test`
- 打包 VSIX：`npm run package`

## 代码风格

- 使用 TypeScript strict mode，并遵循 `src/` 下现有的模块组织方式。
- 面向 provider 的模型元数据改动应优先放在 model service 或 registry 层。
- 涉及 registry、配置、解析、请求行为的改动，需要在 `test/` 下补充聚焦测试。

## Git 约定

- 分支名遵循约定式提交风格：`<type>/<short-kebab-summary>`。
- `type` 使用常见提交类型，例如 `feat`、`fix`、`docs`、`refactor`、`test`、`chore`、`ci`、`build`、`perf`、`style` 或 `revert`。
- 示例：`feat/model-metadata`、`fix/model-refresh-cache`、`docs/agent-instructions`。
- 提交信息和 Pull Request 标题使用中文，并遵循约定式提交格式。
