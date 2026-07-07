# Aperture for Copilot Chat

Expose OpenAI-compatible Aperture models inside the GitHub Copilot Chat model
picker. The extension registers an `aperture` language model provider and
forwards Copilot Chat requests to an Aperture `/chat/completions` endpoint.

## Setup

1. Install dependencies and compile:

   ```sh
   npm install
   npm run compile
   ```

2. Run the extension in VS Code's extension host.

3. Set your Aperture base URL from the command palette:

   ```text
   Aperture: Set Base URL
   ```

   For the current environment, use:

   ```json
   {
     "aperture-copilot.baseUrl": "https://ai.long-antares.ts.net/v1"
   }
   ```

4. Open Copilot Chat and choose an Aperture model from the model picker.

API keys are optional. If your Aperture deployment requires one, run
`Aperture: Set API Key`; the value is stored in VS Code SecretStorage.

## Features

- Auto-discovers `${baseUrl}/models` and deduplicates repeated model IDs.
- Supports manual model definitions through `aperture-copilot.models`.
- Streams OpenAI-compatible chat completions into Copilot Chat.
- Emits `reasoning_content` as Copilot thinking parts for configured thinking models.
- Supports OpenAI-compatible tool calls for Copilot agent mode.
- Does not enable image input in the first version.

## Useful Settings

```json
{
  "aperture-copilot.baseUrl": "https://ai.long-antares.ts.net/v1",
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

Manual model example:

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
