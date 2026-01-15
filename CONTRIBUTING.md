# Contributing to vibe-check

Thank you for your interest in contributing to vibe-check! This document provides guidelines and instructions for contributing.

## Code of Conduct

Be respectful, inclusive, and collaborative. We're building this together!

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) >= 1.0
- Git
- A GitHub account

### Setup

1. Fork the repository on GitHub
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/vibe-check.git
   cd vibe-check
   ```
3. Install dependencies:
   ```bash
   bun install
   ```
4. Create a feature branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```

## Development Workflow

### Running Tests

```bash
# Run all tests
bun test

# Watch mode for development
bun test --watch

# Run specific test file
bun test src/__tests__/your-test.test.ts
```

### Type Checking

```bash
bun run typecheck
```

### Building

```bash
bun run build
```

### Testing CLI Locally

```bash
# After building
bun run dist/bin/vibe-check.js run

# Or test directly
cd examples/basic
bun install
bun run ../../dist/bin/vibe-check.js run
```

## Making Changes

### 1. Code Style

- Write TypeScript with strict mode enabled
- Follow existing code patterns and conventions
- Use descriptive variable and function names
- Keep functions focused and single-purpose
- Add JSDoc comments for public APIs

### 2. Testing

- Add tests for all new features
- Add tests for bug fixes to prevent regressions
- Ensure all tests pass before submitting PR
- Aim for high code coverage

### 3. Documentation

- Update README.md for user-facing changes
- Add JSDoc comments for new APIs
- Update CHANGELOG.md following [Keep a Changelog](https://keepachangelog.com/) format
- Update examples if relevant

### 4. Commits

- Write clear, descriptive commit messages
- Use conventional commit format:
  - `feat:` for new features
  - `fix:` for bug fixes
  - `docs:` for documentation changes
  - `test:` for test changes
  - `refactor:` for code refactoring
  - `perf:` for performance improvements
  - `chore:` for maintenance tasks
- Keep commits focused and atomic
- Reference issues in commit messages when applicable

Example:
```
feat: add semantic similarity judge

Add new built-in judge for comparing semantic similarity between
expected and actual output using embeddings.

Closes #123
```

## Submitting Changes

### Pull Request Process

1. Ensure all tests pass: `bun test`
2. Ensure types check: `bun run typecheck`
3. Update documentation as needed
4. Commit your changes with clear messages
5. Push to your fork:
   ```bash
   git push origin feature/your-feature-name
   ```
6. Create a Pull Request on GitHub
7. Fill out the PR template completely
8. Wait for review and address feedback

### PR Guidelines

- Link related issues in the PR description
- Provide clear description of changes
- Include screenshots/demos for UI changes
- Keep PRs focused on a single feature or fix
- Be responsive to review feedback

## Areas We Need Help

### High Priority

- Additional built-in judges (semantic similarity, LLM-as-judge, etc.)
- More comprehensive examples
- Integration guides for popular frameworks (LangChain, LlamaIndex, etc.)
- Performance optimizations
- Bug fixes

### Documentation

- Tutorial guides for common use cases
- Video walkthroughs
- Blog posts about using vibe-check
- Improved API documentation

### Community

- Answer questions in Discord
- Review pull requests
- Triage issues
- Share your use cases

## Development Tips

### Project Structure

```
src/
├── bin/                  # CLI entry points
├── config/               # Configuration system
├── harness/              # Test execution engine
├── judges/               # Judge system
│   └── builtin/          # Built-in judges
├── learning/             # Learning system
├── runner/               # Test orchestration
└── utils/                # Shared utilities
```

### Adding a New Judge

1. Create judge file in `src/judges/builtin/`
2. Extend `BaseJudge` class
3. Implement `evaluate()` method
4. Export from `src/judges/builtin/index.ts`
5. Add tests in `src/__tests__/judges/`
6. Update documentation

Example:
```typescript
import { BaseJudge, type JudgeContext, type JudgeResult } from '../judge-interface.js';

export class MyCustomJudge extends BaseJudge {
  id = 'my-custom-judge';
  name = 'My Custom Judge';
  type = 'code' as const;

  async evaluate(context: JudgeContext): Promise<JudgeResult> {
    // Your validation logic
    return this.createResult({
      passed: true,
      score: 100,
      reasoning: 'Validation passed',
    });
  }
}
```

### Adding a New Eval Category

1. Update schema in `src/config/schemas.ts`
2. Add type guards if needed
3. Update documentation in README
4. Add example eval case

## Release Process

(For maintainers)

1. Update version in `package.json`
2. Update CHANGELOG.md
3. Commit changes: `git commit -m "chore: release v0.x.0"`
4. Create git tag: `git tag v0.x.0`
5. Push: `git push && git push --tags`
6. Build: `bun run build`
7. Publish: `npm publish`

## Questions?

- Check existing [Issues](https://github.com/pooflabs/vibe-check/issues)
- Join our [Discord](https://t.co/tu734iDt9Q)
- Reach out on [X](https://x.com/poofnew)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
