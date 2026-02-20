# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.1   | Actively supported |
| 1.0.0   | Critical fixes only|
| 1.1.0   | Not supported      |

## Reporting a Vulnerability

**Please do NOT report security vulnerabilities through public GitHub issues.**

Instead, report them privately:

### Option 1: GitHub Private Disclosure (Preferred)
Use GitHub's built-in private vulnerability reporting:
- Go to the **Security** tab of this repository
- Click **"Report a vulnerability"**

### Option 2: Email
Send details to: rjmithu7@gmail.com

Please include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Your suggested fix (optional)

## What to Expect

| Timeline | Action |
|----------|--------|
| 48 hours | Acknowledgement of your report |
| 7 days   | Initial assessment and severity rating |
| 30 days  | Fix released (for critical issues) |

## Scope

### In Scope
- Data leakage or corruption bugs
- Authentication/PIN bypass
- Local file system vulnerabilities
- SQLite injection vulnerabilities

### Out of Scope
- Issues requiring physical access to the machine
- Social engineering attacks
- Third-party dependency vulnerabilities (report those upstream)

## Disclosure Policy

Once a fix is released, we will:
1. Credit the reporter (unless anonymity is requested)
2. Publish a security advisory on GitHub
3. Tag the fix release with a patch version bump

Thank you for helping keep Money Manager secure.
