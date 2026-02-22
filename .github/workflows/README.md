# CI/CD Workflows

This directory contains GitHub Actions workflows for continuous integration and security scanning.

## Workflows

### CI (`ci.yml`)
Runs on every push and pull request to `main` or `master` branches.

**Jobs:**
- **Build and Test**: Runs on Node.js 18.x and 20.x
  - Installs dependencies
  - Runs ESLint linter
  - Type checks with TypeScript
  - Builds the project

### CodeQL Security Scan (`codeql.yml`)
Runs on push, pull request, and weekly on Monday at 2 AM UTC.

**Jobs:**
- **Analyze**: Performs security scanning of JavaScript/TypeScript code
  - Detects security vulnerabilities
  - Checks for code quality issues
  - Uses GitHub's security-extended and security-and-quality queries

### Dependency Review (`dependency-review.yml`)
Runs on pull requests to `main` or `master` branches.

**Jobs:**
- **Dependency Review**: Reviews dependency changes in PRs
  - Scans for known vulnerabilities in new dependencies
  - Fails on moderate or higher severity issues
  - Posts summary comments in PRs

### NPM Audit (`npm-audit.yml`)
Runs on push, pull request, and daily at 3 AM UTC.

**Jobs:**
- **Audit**: Scans for vulnerabilities in dependencies
  - Runs `npm audit` with moderate severity threshold
  - Runs production-only audit with high severity threshold
  - Helps identify security issues in dependencies

## Local Testing

To test the workflows locally before pushing:

```bash
# Install dependencies
npm ci

# Run linter
npm run lint

# Build the project
npm run build

# Check for vulnerabilities
npm audit
```

## Security

All workflows use secure practices:
- Use official GitHub Actions (checkout@v4, setup-node@v4)
- Use CodeQL for code security scanning
- Scan dependencies for vulnerabilities
- Pin action versions to prevent supply chain attacks

## Maintenance

- Review workflow runs regularly in the Actions tab
- Update action versions when new versions are released
- Address security findings promptly
