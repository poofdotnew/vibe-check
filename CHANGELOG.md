# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2024-01-15

### Added
- Initial release of vibe-check
- 5 eval categories: tool, code-gen, routing, multi-turn, basic
- 3 built-in judges: file-existence, tool-invocation, pattern-match
- Extensible judge system with custom judge support
- Learning system for analyzing failures and generating prompt improvements
- Parallel execution with configurable concurrency
- Retry logic with exponential backoff
- Isolated workspace management
- Multi-trial support with pass thresholds
- CLI commands: run, list, init, learn
- Programmatic API for integration
- TypeScript-first with full type safety
- Examples for basic usage, Claude Agent SDK, and custom judges
- Comprehensive documentation

### Features
- Agent-agnostic testing framework
- Tool call validation
- Code generation testing
- Multi-turn conversation testing
- Routing validation
- Learning from failures
- JSONL data source support
- Human-in-the-loop rule review
- Workspace preservation for debugging
- Lifecycle hooks (setup, teardown, beforeEach, afterEach)
- Detailed execution reporting

[0.1.0]: https://github.com/pooflabs/vibe-check/releases/tag/v0.1.0
