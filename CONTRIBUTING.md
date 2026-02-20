# Contributing to Money Manager

Thank you for your interest in contributing! Here's how to get started.

## Before You Start

- Check existing [Issues](../../issues) to avoid duplicates
- For major changes, open an issue first to discuss

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

## How to Contribute

### Reporting Bugs
- Use the **Bug Report** issue template
- Include steps to reproduce
- Attach screenshots if possible

### Suggesting Features
- Use the **Feature Request** issue template
- Explain the problem it solves

### Submitting Code

1. Fork the repository
2. Create a new branch:
```bash
git checkout -b feat/your-feature-name
```
3. Make your changes
4. Test thoroughly:
```bash
cargo test
pnpm tauri dev
```
5. Commit using this format:
```
feat(scope): short description

- detail 1
- detail 2
```
6. Push and open a Pull Request

## Code Standards

### Rust (Backend)
- No `.unwrap()` without justification
- Use `Result<T, String>` for error handling
- All database operations must use parameterized queries
- Double-entry accounting: debits must always equal credits

### TypeScript (Frontend)
- No `any` types
- Handle all async errors
- Follow existing component patterns

### Commit Types
| Type | When to use |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `refactor` | Code restructure |
| `docs` | Documentation only |
| `test` | Tests only |

## What We Won't Accept
- ❌ Breaking double-entry accounting logic
- ❌ `.unwrap()` calls without justification
- ❌ TypeScript `any` types
- ❌ Unhandled errors
- ❌ Changes without testing

## Questions?
Open a [Discussion](../../discussions) or use the issue templates.
```

**Step 3:** Commit message:
```
docs: add contributing guidelines
