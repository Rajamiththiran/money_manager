# Contributing to Money Manager

Thank you for your interest in contributing! Here's how to get started.

## Before You Start

- Check existing [Issues](../../issues) to avoid duplicates
- For major changes, open an issue first to discuss
- Never commit directly to `main` or `V1.x.x` branches

## Development Setup

### Prerequisites
- Rust (latest stable)
- Node.js 22+
- pnpm
- Windows OS (this is a Windows desktop app)

### Getting Started
```bash
# Clone the repository
git clone https://github.com/Rajamiththiran/money_manager.git
cd money_manager

# Install frontend dependencies
pnpm install

# Run in development mode
pnpm tauri dev
```

## Branching Strategy

### Branch Structure
```
main                        ← production only, NEVER touch directly
└── V1.1.0                 ← current version branch
    ├── feat/<name>-<username>
    ├── fix/<name>-<username>
    ├── docs/<name>-<username>
    └── refactor/<name>-<username>
```

### Branch Naming Convention
| Type | Format | Example |
|------|--------|---------|
| New feature | `feat/<feature-name>-<username>` | `feat/quick-entry-rajamiththiran` |
| Bug fix | `fix/<bug-name>-<username>` | `fix/balance-calculation-rajamiththiran` |
| Documentation | `docs/<what-changed>-<username>` | `docs/contributing-rajamiththiran` |
| Refactor | `refactor/<what>-<username>` | `refactor/transaction-logic-rajamiththiran` |
| Tests | `test/<what>-<username>` | `test/double-entry-rajamiththiran` |

### ❌ Forbidden
- Never commit directly to `main`
- Never commit directly to `V1.x.x` version branches
- Never open a PR targeting `main` directly
- Never merge without a PR review

## Correct Workflow

### Step 1 — Start from the version branch
```bash
git checkout V1.1.0
git pull origin V1.1.0
```

### Step 2 — Create your branch
```bash
# For a new feature
git checkout -b feat/your-feature-name-yourusername

# For a bug fix
git checkout -b fix/bug-name-yourusername
```

### Step 3 — Make your changes & commit
```bash
git add .
git commit -m "feat(scope): short description

- detail 1
- detail 2"
```

### Step 4 — Push your branch
```bash
git push origin feat/your-feature-name-yourusername
```

### Step 5 — Open a Pull Request
- Base branch: `V1.1.0` ← **NOT main**
- Fill in the PR template completely
- Link the related issue number

### Step 6 — After review & approval
- PR merges into `V1.1.0`
- `main` is only updated when a version is fully released

## Commit Message Format
```
type(scope): short description

- detail 1
- detail 2
```

### Types
| Type | When to use |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `refactor` | Code restructure, no functional change |
| `docs` | Documentation only |
| `test` | Tests only |

### Scopes
| Scope | Area |
|-------|------|
| `transactions` | Transaction logic |
| `accounts` | Account management |
| `budgets` | Budget module |
| `reports` | Analytics & reporting |
| `recurring` | Recurring transactions |
| `installments` | Installment plans |
| `credit-cards` | Credit card logic |
| `settings` | App settings |
| `ui` | Frontend components |
| `db` | Database/migrations |

### Examples
```
feat(transactions): add quick entry toolbar

- add QuickEntryBar component to Dashboard
- call get_recent_categories for top 5 suggestions
- support Ctrl+N keyboard shortcut

fix(accounts): correct balance calculation for transfers

- transfers were double-counting outflow
- fixes #23

docs(contributing): update branching strategy
```

## Code Standards

### Rust (Backend)
- No `.unwrap()` without justification
- Use `Result<T, String>` for error handling
- All database operations must use parameterized queries
- Double-entry accounting: debits must always equal credits
- Use `sqlx::query!` macro for compile-time checking

### TypeScript (Frontend)
- No `any` types
- Handle all async errors gracefully
- Follow existing component patterns
- Use proper TypeScript interfaces, no inline object types

## Testing Requirements

Before opening a PR:
```bash
# Backend
cargo test

# Frontend + Integration
pnpm tauri dev
```

Manual testing checklist:
- [ ] Feature works in light mode
- [ ] Feature works in dark mode
- [ ] Edge cases handled (zero amounts, empty states)
- [ ] No console errors

## What We Won't Accept
- ❌ Direct commits to `main` or version branches
- ❌ PRs targeting `main`
- ❌ Breaking double-entry accounting logic
- ❌ `.unwrap()` calls without justification
- ❌ TypeScript `any` types
- ❌ Unhandled errors
- ❌ Changes without testing

## Questions?
Open a [Discussion](../../discussions) or use the issue templates.
