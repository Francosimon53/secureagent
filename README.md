# SecureAgent

**AI agent systems engineering in TypeScript — model routing, reliability controls, orchestration, testing, and security-oriented design.**

SecureAgent is a modular TypeScript project for exploring how production-style AI agent systems can be structured around explicit controls instead of a single unconstrained model call. The repository includes an AI gateway, provider routing, budget and rate controls, loop detection, multi-agent orchestration, persistence, observability, channel integrations, and domain-specific modules.

> Portfolio note: this repository demonstrates engineering patterns and implementation work. References to OWASP, healthcare, or security describe design targets and implemented controls; they are not claims of third-party certification or regulatory approval.

## Why this project matters

For AI evaluation and AI-systems work, SecureAgent demonstrates several concerns that sit around model quality rather than prompt generation alone:

- **Provider abstraction and model routing** — separate provider registry and routing logic support controlled model selection.
- **Cost and budget constraints** — dedicated cost estimation, usage tracking, and budget management modules bound model usage.
- **Rate limiting and loop detection** — explicit controls help prevent runaway agent behavior and repeated calls.
- **Multi-agent orchestration** — the codebase separates agent execution, personas, task coordination, and delegation.
- **Security-oriented architecture** — dedicated security modules and tests address authentication, permissions, isolation, logging, and unsafe agent behavior.
- **Domain adaptation** — healthcare/ABA modules show how a general AI system can be specialized for a regulated, high-context domain.
- **Testability** — Vitest suites are organized across agent, AI-gateway, MCP, security, healthcare, orchestration, and other subsystems.

## Technical evidence

The AI gateway is implemented as a set of independent TypeScript modules rather than one monolithic client:

```text
src/ai-gateway/
├── budget-manager.ts
├── constants.ts
├── cost-estimator.ts
├── index.ts
├── loop-detector.ts
├── model-router.ts
├── provider-registry.ts
├── providers/
├── rate-limiter.ts
├── types.ts
└── usage-tracker.ts
```

This structure makes provider choice, usage limits, failure controls, and accounting individually testable and reviewable.

The broader architecture includes:

```text
src/
├── agent/              # agent execution and tool management
├── ai-gateway/         # routing, budgets, rate limits, usage controls
├── channels/           # communication adapters
├── healthcare/         # ABA/healthcare domain modules
├── memory/             # conversation and state memory
├── observability/      # logging, metrics, tracing
├── orchestration/      # multi-agent coordination
├── security/           # security-oriented controls
└── storage/            # persistence
```

## Stack

- **Language:** TypeScript 5.x
- **Runtime:** Node.js 20+
- **AI SDKs:** Anthropic SDK, OpenAI SDK
- **Validation:** Zod
- **Persistence:** SQLite, Supabase
- **Browser automation:** Playwright / Puppeteer
- **Logging:** Pino
- **Testing:** Vitest
- **Quality:** ESLint, Prettier, TypeScript type checking

## Evaluation and reliability mindset

The project is useful as a portfolio example because the model is treated as one component inside a controlled system. Engineering decisions are separated into explicit mechanisms for:

1. selecting a provider/model,
2. limiting cost and call volume,
3. detecting repeated execution,
4. validating configuration and inputs,
5. isolating agent capabilities,
6. recording usage and operational signals,
7. testing system behavior outside the model itself.

This is the same general mindset required in AI evaluation work: model output should be inspected in context, bounded by deterministic controls, and tested against failure modes rather than assumed correct.

## Testing and quality checks

```bash
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
```

Tests are grouped by subsystem, including AI gateway, agent behavior, MCP, healthcare, security, channels, memory, and orchestration.

## Local setup

```bash
git clone https://github.com/Francosimon53/secureagent.git
cd secureagent
npm install --legacy-peer-deps
cp .env.example .env
npm run build
npm test
```

At least one supported model-provider API key is required for provider-backed execution paths.

## Portfolio relevance

SecureAgent complements my other AI projects by demonstrating **AI infrastructure and control-plane engineering** rather than a single end-user application. Together with Verification Layer, multi-model evaluation work, ARIABA, and ABA Sensei, it shows experience across:

- LLM integration
- AI output verification
- model/provider abstraction
- adversarial and failure-mode thinking
- TypeScript systems engineering
- testing and quality assurance
- healthcare/behavioral-science domain adaptation

## License

MIT
