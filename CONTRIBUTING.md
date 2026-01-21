# Contributing to vibe-check

## Development Setup

```bash
bun install
```

## Code Quality Tools

### Linting (ESLint)

```bash
bun run lint          # Check for issues
bun run lint:fix      # Auto-fix issues
```

ESLint is configured with TypeScript support and Prettier integration. Configuration is in `eslint.config.js`.

### Formatting (Prettier)

```bash
bun run format        # Format all files
bun run format:check  # Check formatting without changes
```

Prettier configuration is in `.prettierrc`.

### Pre-commit Hooks (Husky + lint-staged)

Husky runs automatically on commit:
- **pre-commit**: Runs lint-staged (eslint + prettier on staged files)
- **commit-msg**: Validates commit message format

Configuration:
- `.husky/pre-commit` - Pre-commit hook
- `.husky/commit-msg` - Commit message hook
- `.lintstagedrc` - lint-staged configuration

## Commit Messages

We use [Conventional Commits](https://www.conventionalcommits.org/). Format:

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

### Types

| Type | Description |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `style` | Formatting, no code change |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `perf` | Performance improvement |
| `test` | Adding or updating tests |
| `chore` | Maintenance tasks |

### Examples

```bash
feat: add new pattern matching judge
fix: handle empty tool calls array
docs: update README with examples
chore: update dependencies
```

## Releases (Changesets)

We use [Changesets](https://github.com/changesets/changesets) for version management.

### Adding a Changeset

When making changes that should be released:

```bash
bun run changeset
```

Follow the prompts to:
1. Select packages affected
2. Choose version bump type (patch/minor/major)
3. Write a summary of changes

### Releasing

```bash
bun run version    # Apply changesets, update versions and CHANGELOG
bun run release    # Build and publish to npm
```

## Scripts Reference

| Script | Description |
|--------|-------------|
| `bun run build` | Build the project |
| `bun run dev` | Build with watch mode |
| `bun run test` | Run all tests |
| `bun run test:unit` | Run unit tests only |
| `bun run test:watch` | Run tests in watch mode |
| `bun run lint` | Check for lint errors |
| `bun run lint:fix` | Fix lint errors |
| `bun run format` | Format code |
| `bun run format:check` | Check code formatting |
| `bun run typecheck` | Run TypeScript type checking |
| `bun run changeset` | Create a new changeset |
| `bun run version` | Apply changesets |
| `bun run release` | Build and publish |
