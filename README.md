# SecureAgent

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/Tests-Passing-brightgreen)](tests/)
[![OWASP](https://img.shields.io/badge/OWASP-AG01--AG10-orange)](https://owasp.org/)

**Enterprise-Grade Personal AI Assistant with OWASP Top 10 Compliance**

SecureAgent is a comprehensive, security-first AI assistant platform designed for production deployments. It provides multi-channel communication, AI cost control, and specialized industry verticals while maintaining strict security standards.

## Key Features

- **Security First**: OWASP Top 10 for AI Agents compliance, Zero Trust architecture, gVisor sandboxing
- **Multi-Channel**: Discord, Slack, Telegram, WhatsApp, Signal, SMS, Email
- **AI Cost Control**: Budget management, rate limiting, loop detection, provider routing
- **Industry Verticals**: Healthcare/ABA, Finance/Trading, Enterprise SaaS, Content Creation
- **Multi-Agent**: Orchestration, personas, parallel execution, hierarchical delegation
- **Money Makers**: Negotiation automation, price tracking, expense management, subscription killer

## Table of Contents

- [Installation](#installation)
- [Architecture](#architecture)
- [Security Features](#security-features)
- [Module Highlights](#module-highlights)
- [Configuration](#configuration)
- [Testing](#testing)
- [Deployment](#deployment)
- [Roadmap](#roadmap)
- [Pricing](#pricing)
- [Contributing](#contributing)

## Installation

### One-Line Install (Recommended)

Get SecureAgent running on your machine in under 5 minutes:

```bash
curl -fsSL https://raw.githubusercontent.com/Francosimon53/secureagent/main/install.sh | bash
```

This will:
- Detect your OS (macOS, Linux, Windows WSL)
- Install Node.js if needed
- Clone the repository
- Install dependencies
- Create a `.env` template
- Set up the CLI

After installation:
```bash
cd ~/secureagent
nano .env  # Add your ANTHROPIC_API_KEY
./start.sh
```

### Docker Install

```bash
# Clone the repo
git clone https://github.com/Francosimon53/secureagent.git
cd secureagent

# Create .env file
cp .env.example .env
nano .env  # Add your API keys

# Start with Docker
docker-compose up -d

# View logs
docker-compose logs -f secureagent
```

### Manual Install

```bash
# Prerequisites: Node.js 20+, npm

# Clone the repository
git clone https://github.com/Francosimon53/secureagent.git
cd secureagent

# Install dependencies
npm install --legacy-peer-deps

# Copy environment template
cp .env.example .env

# Configure your API keys in .env
nano .env

# Start the application
npm run dev
```

### Guided Setup

For an interactive setup experience:

```bash
git clone https://github.com/Francosimon53/secureagent.git
cd secureagent
./scripts/setup-local.sh
```

### Raspberry Pi / ARM Devices

SecureAgent works on Raspberry Pi 4+ and other ARM64 devices:

```bash
# Install Node.js 20 on Raspberry Pi
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install SecureAgent
curl -fsSL https://raw.githubusercontent.com/Francosimon53/secureagent/main/install.sh | bash
```

### VPS Deployment (DigitalOcean, Linode, etc.)

```bash
# SSH into your VPS
ssh root@your-server-ip

# Install SecureAgent
curl -fsSL https://raw.githubusercontent.com/Francosimon53/secureagent/main/install.sh | bash

# Configure
cd ~/secureagent
nano .env

# Start with systemd (auto-restart)
sudo cp scripts/secureagent.service /etc/systemd/system/
sudo systemctl enable secureagent
sudo systemctl start secureagent

# View logs
sudo journalctl -u secureagent -f
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Your Anthropic API key |
| `TELEGRAM_BOT_TOKEN` | No | Telegram bot token from @BotFather |
| `PORT` | No | Server port (default: 3000) |
| `NODE_ENV` | No | Environment (development/production) |
| `LOG_LEVEL` | No | Logging level (debug/info/warn/error) |

### Development Mode

```bash
npm run dev
```

## Architecture

SecureAgent follows a modular architecture with clear separation of concerns:

```
src/
├── agent/              # Core agent execution and tool management
├── ai-gateway/         # AI provider routing, budgets, rate limiting
├── channels/           # Multi-channel integrations
│   ├── discord/
│   ├── slack/
│   ├── telegram/
│   ├── whatsapp/
│   ├── signal/
│   ├── sms/
│   └── email/
├── config/             # Configuration schemas and management
├── content-creator/    # Social media and content automation
├── daily-driver/       # Productivity features (email, calendar, tasks)
├── devtools/           # Developer productivity tools
├── enterprise/         # Multi-tenant SaaS features
├── family/             # Family coordination features
├── finance/            # Trading, portfolio, crypto
├── health/             # Health checks and monitoring
├── healthcare/         # ABA therapy practice management
├── lifestyle/          # Entertainment, events, dining
├── memory/             # Conversation memory and proactive insights
├── money-makers/       # Negotiation, expenses, subscriptions
├── observability/      # Logging, metrics, tracing
├── orchestration/      # Multi-agent coordination
├── productivity/       # Focus, pomodoro, habits
├── savings/            # Budget optimization
├── security/           # Auth, encryption, sandboxing
├── storage/            # Database and file storage
└── wellness/           # Mental health, meditation
```

## Security Features

SecureAgent implements comprehensive security measures aligned with OWASP Top 10 for AI Agents:

| OWASP ID | Vulnerability | SecureAgent Mitigation |
|----------|--------------|------------------------|
| AG01 | Prompt Injection | Input sanitization, context isolation, instruction hierarchy |
| AG02 | Insecure Output | Output validation, content filtering, sanitization |
| AG03 | Tool Misuse | Permission system, sandboxing, rate limiting |
| AG04 | Privilege Escalation | RBAC, least privilege, capability-based security |
| AG05 | Memory Poisoning | Memory isolation, integrity checks, TTL policies |
| AG06 | Goal Hijacking | Goal validation, intent verification, human-in-loop |
| AG07 | Dependency Attacks | Supply chain security, dependency scanning, SBOMs |
| AG08 | Model Extraction | Rate limiting, query monitoring, output restrictions |
| AG09 | Insufficient Logging | Comprehensive audit logs, immutable records |
| AG10 | Resource Exhaustion | Budget limits, rate limiting, circuit breakers |

### Additional Security Features

- **Zero Trust Architecture**: Every request authenticated and authorized
- **gVisor Sandboxing**: Isolated execution environment for untrusted code
- **Encryption at Rest**: AES-256 encryption for sensitive data
- **PII Redaction**: Automatic redaction of sensitive information in logs
- **JWT + PASETO Tokens**: Secure session management
- **Multi-Factor Authentication**: TOTP, WebAuthn support
- **SSO Integration**: Google, Microsoft, SAML 2.0

## Module Highlights

### AI Gateway

Intelligent routing and cost control for AI providers:

```typescript
import { createAIGateway } from 'secureagent/ai-gateway';

const gateway = createAIGateway({
  providers: [
    { name: 'anthropic', apiKey: process.env.ANTHROPIC_API_KEY },
    { name: 'openai', apiKey: process.env.OPENAI_API_KEY },
  ],
  routing: { strategy: 'cost_optimized' },
  budgets: {
    daily: { limitCents: 10000 }, // $100/day
    monthly: { limitCents: 200000 }, // $2000/month
  },
});

const response = await gateway.complete({
  messages: [{ role: 'user', content: 'Hello!' }],
  model: 'auto', // Gateway selects optimal model
});
```

### Healthcare/ABA Module

HIPAA-compliant therapy practice management:

```typescript
import { createHealthcareManager } from 'secureagent/healthcare';

const healthcare = createHealthcareManager({
  encryption: { enabled: true, algorithm: 'aes-256-gcm' },
  audit: { enabled: true, retention: 7 * 365 }, // 7 years
});

// Create a client with full session tracking
const client = await healthcare.clients.create({
  firstName: 'John',
  lastName: 'Doe',
  dateOfBirth: '2018-05-15',
  diagnosis: ['autism_spectrum'],
  insuranceProvider: 'BlueCross',
});

// Record therapy session with behavioral data
const session = await healthcare.sessions.create({
  clientId: client.id,
  type: 'dtt', // Discrete Trial Training
  duration: 60,
  behaviors: [
    { name: 'Manding', trials: 10, correct: 8 },
    { name: 'Tacting', trials: 15, correct: 12 },
  ],
});
```

### Multi-Agent Orchestration

Coordinate multiple AI agents for complex tasks:

```typescript
import { createOrchestrator } from 'secureagent/orchestration';

const orchestrator = createOrchestrator({
  personas: {
    researcher: { specialty: 'information_gathering' },
    analyst: { specialty: 'data_analysis' },
    writer: { specialty: 'content_creation' },
  },
});

const result = await orchestrator.execute({
  task: 'Research AI trends and write a report',
  strategy: 'hierarchical',
  agents: ['researcher', 'analyst', 'writer'],
});
```

### Money Makers

Financial productivity with proven ROI:

```typescript
import { createMoneyMakers } from 'secureagent/money-makers';

const money = createMoneyMakers();

// Auto-negotiation (saved one user $4,200 on a car)
const negotiation = await money.startNegotiation({
  userId: 'user-1',
  type: 'car_purchase',
  description: 'Honda Accord 2024',
  targetItem: 'Honda Accord',
  maxBudget: { amount: 35000, currency: 'USD' },
  dealers: ['dealer1@email.com', 'dealer2@email.com'],
  strategy: 'aggressive',
});

// Expense tracking with natural language
money.logExpense('user-1', 'Spent $47.50 at Costco for groceries');

// Kill unused subscriptions
const cancelList = money.getJustCancelList('user-1');
// Returns subscriptions to cancel with phone scripts and email templates
```

## Configuration

SecureAgent uses a hierarchical configuration system:

1. **Environment Variables** (`.env`)
2. **Configuration Files** (`config/*.json`)
3. **Runtime Configuration** (API)

See [.env.example](.env.example) for all available options.

### Key Configuration Areas

```bash
# AI Provider (required - at least one)
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...

# Budget Controls
AI_DAILY_BUDGET_CENTS=10000
AI_MONTHLY_BUDGET_CENTS=200000

# Security
ENCRYPTION_KEY=your-256-bit-key
JWT_SECRET=your-jwt-secret

# Database
DATABASE_PATH=./data/secureagent.db
```

## Testing

SecureAgent maintains comprehensive test coverage:

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific module tests
npm test -- tests/ai-gateway/
npm test -- tests/healthcare/
npm test -- tests/money-makers/

# Run in watch mode
npm run test:watch
```

### Test Structure

```
tests/
├── ai-gateway/         # 80 tests
├── daily-driver/       # 49 tests
├── money-makers/       # 82 tests
├── healthcare/         # 75 tests
├── security/           # 60 tests
└── ...
```

## Deployment

### Docker

```bash
# Build the image
docker build -t secureagent .

# Run the container
docker run -d \
  --name secureagent \
  -p 3000:3000 \
  -v ./data:/app/data \
  --env-file .env \
  secureagent
```

### Docker Compose

```bash
# Start all services
docker-compose up -d

# Start with local AI (Ollama)
docker-compose --profile local-ai up -d

# Production mode with nginx
docker-compose --profile production up -d
```

### Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod
```

### Railway

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login and deploy
railway login
railway up
```

## Roadmap

### Completed Phases

| Phase | Name | Status |
|-------|------|--------|
| 1.0 | Core Security & Agent Foundation | ✅ Complete |
| 1.1 | Multi-Channel Support | ✅ Complete |
| 1.2 | Healthcare/ABA Module | ✅ Complete |
| 1.3 | Finance & Trading | ✅ Complete |
| 1.4 | Enterprise SaaS | ✅ Complete |
| 1.5 | Memory & Proactivity | ✅ Complete |
| 1.6 | AI Gateway & Cost Control | ✅ Complete |
| 2.0 | Daily Driver Productivity | ✅ Complete |
| 2.5 | Money Makers | ✅ Complete |

### Future Enhancements

- Voice interface integration (Whisper, ElevenLabs)
- Mobile app (React Native)
- Browser extension
- Zapier/Make integration
- Custom model fine-tuning

## Pricing

| Feature | Free | Pro | Business | Enterprise |
|---------|------|-----|----------|------------|
| **Price** | $0/mo | $29/mo | $99/mo | $299/mo |
| Users | 1 | 5 | 25 | Unlimited |
| AI Messages/day | 100 | 1,000 | 10,000 | Unlimited |
| Channels | 2 | 5 | All | All |
| Memory | 7 days | 30 days | 1 year | Unlimited |
| Healthcare/ABA | - | Basic | Full | Full + Compliance |
| Trading | - | Paper | Paper + Live | Full |
| Enterprise SSO | - | - | ✓ | ✓ |
| White Label | - | - | - | ✓ |
| SLA | - | - | 99.9% | 99.99% |
| Support | Community | Email | Priority | Dedicated |

## Contributing

We welcome contributions! Please read our guidelines before submitting.

### Development Setup

```bash
# Fork and clone the repo
git clone https://github.com/yourusername/secureagent.git

# Install dependencies
npm install

# Create a branch
git checkout -b feature/your-feature

# Make changes and test
npm test

# Submit a PR
```

### Code Standards

- TypeScript strict mode
- ESLint + Prettier
- Vitest for testing
- Conventional commits
- Security-first mindset

### Pull Request Process

1. Update tests for any new functionality
2. Update documentation as needed
3. Ensure all tests pass
4. Request review from maintainers

## License

MIT License - see [LICENSE](LICENSE) for details.

## Security

For security vulnerabilities, please email security@secureagent.dev instead of using public issues.

## Support

- **Documentation**: [docs.secureagent.dev](https://docs.secureagent.dev)
- **Discord**: [discord.gg/secureagent](https://discord.gg/secureagent)
- **Email**: support@secureagent.dev

---

Built with security and productivity in mind.
