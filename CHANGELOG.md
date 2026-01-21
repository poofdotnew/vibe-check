# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2024-01-15

### Added

- Initial release of vibe-check
- 5 eval categories: tool, code-gen, routing, multi-turn, basic
- 7 built-in judges: file-existence, tool-invocation, pattern-match, syntax-validation, skill-invocation, agent-routing, and LLM-based judges
- LLM judges with rubric support (`llm-code-quality`, `llm-response-quality`, `llm-routing-quality`, `llm-conversation-quality`)
- Reference solution support in eval cases for pairwise comparison
- Automatic tool call extraction from JSONL for `claude-code` agent type
- Extensible judge system with custom judge support
- Learning system for analyzing failures and generating prompt improvements
- Parallel execution with configurable concurrency
- Retry logic with exponential backoff
- Isolated workspace management
- Multi-trial support with pass thresholds
- CLI commands: run, list, init, learn
- Programmatic API for integration
- TypeScript-first with full type safety
- Examples for basic usage, Claude Agent SDK, custom judges, and multi-turn
- Comprehensive documentation

### Features

- Agent-agnostic testing framework (`claude-code` and `generic` agent types)
- Tool call validation with automatic JSONL extraction
- Code generation testing with syntax validation
- Multi-turn conversation testing with session persistence
- Routing validation
- Learning from failures
- JSONL data source support
- Human-in-the-loop rule review
- Workspace preservation for debugging
- Lifecycle hooks (setup, teardown, beforeEach, afterEach)
- Detailed execution reporting

[0.1.0]: https://github.com/@pooflabs/vibe-check/releases/tag/v0.1.0
