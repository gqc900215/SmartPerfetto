# 架构总览

[English](overview.en.md) | [中文](overview.md)

SmartPerfetto 在 Perfetto UI 之上增加 AI 分析层。Perfetto 仍负责 trace 加载、时间线和 SQL 基础能力；SmartPerfetto 后端负责 agent 编排、Skill 执行、报告生成和流式输出。

```text
Frontend: Perfetto UI @ :10000
  └─ com.smartperfetto.AIAssistant plugin
       ├─ trace upload / open trace
       ├─ AI panel / floating window
       ├─ DataEnvelope tables and charts
       └─ SSE client

Backend: Express @ :3000
  ├─ /api/agent/v1/*          agentv3 分析主路径
  ├─ /api/traces/*            trace 上传和生命周期
  ├─ /api/skills/*            Skill 查询和执行
  ├─ /api/export/*            导出
  ├─ /api/reports/*           HTML report
  └─ trace_processor_shell    HTTP RPC pool, 9100-9900

Standalone CLI: smp / smartperfetto
  └─ 复用同一后端 runtime、Skill、SQL、session、report 和 comparison contract
```

## 产品入口与发布形态

| 入口 | 用户形态 | 运行边界 |
|---|---|---|
| Web UI | Docker、免安装包、源码 `./start.sh` | 通过 HTTP/SSE 调后端，使用提交的 `frontend/` 预构建 UI |
| CLI | npm 包 `@gracker/smartperfetto` | Node.js `>=24 <25`，不启动 Web UI，写本地 `~/.smartperfetto/` session/report |
| API/SSE | `/api/agent/v1/*` 等 | 前端和外部集成都依赖同一契约 |
| Portable launcher | GitHub 三平台 asset | 包内自带 Node.js 24、native deps、后端、`frontend/` 和 `trace_processor_shell` |
| Docker | Docker Hub image | Linux container，不读取宿主机 Claude Code 登录态 |

Feature/Bug 设计要同时判断 Web UI、CLI、API、报告、Docker、免安装包、runtime/provider、
预构建内容和 Node 版本边界。LLM/Agent 的具体检查清单在
[`../../.claude/rules/product-surface.md`](../../.claude/rules/product-surface.md)。

## 核心模块

| 模块 | 位置 | 责任 |
|---|---|---|
| Perfetto UI plugin | `perfetto/ui/src/plugins/com.smartperfetto.AIAssistant/` | 面板、SSE、结果渲染、场景导航、选区交互 |
| Express backend | `backend/src/index.ts` | 路由注册、健康检查、中间件、进程清理 |
| Runtime selector | `backend/src/agentRuntime/` | 每个 session 选择 Claude Agent SDK 或 OpenAI Agents SDK |
| Claude runtime | `backend/src/agentv3/` | Claude Agent SDK 编排、MCP server、策略注入、verifier、记忆 |
| OpenAI runtime | `backend/src/agentOpenAI/` | OpenAI Agents SDK 编排，通过同一 assistant contract 输出 |
| assistant application | `backend/src/assistant/` | session 管理、stream projection、结果 contract |
| Skill engine | `backend/src/services/skillEngine/` | YAML Skill 加载、参数替换、SQL 执行、DataEnvelope 输出 |
| Skills | `backend/skills/` | 原子、组合、深度、渲染管线分析 |
| Strategies | `backend/strategies/` | 场景策略、Prompt 模板、知识模板 |
| Trace processor | `backend/src/services/traceProcessorService.ts` | trace 加载、RPC 管理、SQL 查询 |
| Reports | `backend/src/services/htmlReportGenerator.ts` | HTML 报告生成 |
| CLI | `backend/src/cli-user/` | `smp` / `smartperfetto` 命令、session/history/report export |
| Comparison services | `backend/src/services/comparison*Service.ts` | Raw trace 与 analysis-result 对比共享证据/报告 contract |

## 主分析数据流

```text
1. 用户加载 trace
   UI -> /api/traces/upload -> TraceProcessorService -> trace_processor_shell

2. 用户发起分析
   UI -> POST /api/agent/v1/analyze
      -> AgentAnalyzeSessionService.prepareSession()
      -> createAgentOrchestrator()
      -> ClaudeRuntime.analyze() | OpenAIRuntime.analyze()

3. Agent 获取证据
   Runtime -> MCP tools
      -> execute_sql -> trace_processor_shell
      -> invoke_skill -> SkillExecutor -> SQL / DataEnvelope
      -> lookup_knowledge / lookup_sql_schema / fetch_artifact

4. 后端流式输出
   Claude SDK events -> claudeSseBridge -> StreamProjector -> SSE
      -> frontend renders progress, tables, thought, answer tokens

5. 结束与报告
   conclusion -> analysis_completed -> HTML report -> /api/reports/:id
```

CLI `smp run` / `smp ask` / `smp compare` 复用同一 session、runtime、Skill、report
和 trace_processor 路径；区别只是本地存储在 `~/.smartperfetto/`，输出可以是
`text`、`json` 或 `ndjson`。

## Runtime 与 Provider 边界

| Runtime | Provider | 关键边界 |
|---|---|---|
| `claude-agent-sdk` | Anthropic、Bedrock、Vertex、Claude/Anthropic-compatible provider、本地 Claude Code fallback | 本地 Claude 登录态只适用于源码运行；Docker/portable/npm CLI 需要显式 provider/env |
| `openai-agents-sdk` | OpenAI、Ollama、OpenAI-compatible provider | 按 OpenAI runtime 规则验证凭证和 chat-completions/Responses 协议 |

Provider Manager active profile 优先于 `.env` fallback。历史 session 恢复时必须保留
原 provider/runtime/comparison identity，不能因为当前 active provider 变化而静默切换。

## 对比模式

| 模式 | 入口 | 数据来源 | 合约 |
|---|---|---|---|
| Raw Trace Compare | 前端 reference trace、CLI `smp compare` | current trace + reference trace 实时查询 | 共享 comparison identity、evidence pack、session snapshot 和 report section |
| Analysis Result Compare | 前端多结果对比 API | 已完成分析结果 snapshot | 保留 workspace/RBAC/matrix 能力，并复用共享 report section |

## 文档与策略分工

SmartPerfetto 有两类“内容”：

| 内容 | 位置 | 运行时角色 |
|---|---|---|
| Strategy / Prompt template | `backend/strategies/*.strategy.md`, `*.template.md` | 进入系统 Prompt，约束 agent 思考方式 |
| YAML Skill | `backend/skills/**/*.skill.yaml` | 被 MCP `invoke_skill` 调用，确定性执行 SQL 分析 |
| Rendering pipeline docs | `docs/rendering_pipelines/*.md` | 教学模式和管线结果的知识来源 |
| 普通 docs | `docs/` 其他目录 | 面向用户和贡献者 |

不要在 TypeScript 中硬编码 Prompt 内容。TypeScript 只负责加载、变量替换和结构性编排。
