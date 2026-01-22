#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
EXAMPLES_DIR="$ROOT_DIR/examples"

# Parse arguments
CLEAN_INSTALL=false
for arg in "$@"; do
  case $arg in
    --clean)
      CLEAN_INSTALL=true
      ;;
  esac
done

# Load .env file if it exists
if [ -f "$ROOT_DIR/.env" ]; then
  set -a
  source "$ROOT_DIR/.env"
  set +a
fi

echo "Testing all examples..."
if [ "$CLEAN_INSTALL" = true ]; then
  echo "(clean install mode)"
fi
echo ""

# Track results
PASSED=0
FAILED=0
SKIPPED=0
FAILED_EXAMPLES=""

for example in "$EXAMPLES_DIR"/*/; do
  example_name=$(basename "$example")

  # Skip examples requiring API key if not set
  if [ "$example_name" = "claude-agent-sdk" ] || [ "$example_name" = "python-agent" ]; then
    if [ -z "$ANTHROPIC_API_KEY" ]; then
      echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
      echo "Skipping: $example_name (no ANTHROPIC_API_KEY)"
      echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
      echo ""
      ((SKIPPED++))
      continue
    fi
  fi

  if [ "$example_name" = "openai-agent-sdk" ]; then
    if [ -z "$OPENAI_API_KEY" ]; then
      echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
      echo "Skipping: $example_name (no OPENAI_API_KEY)"
      echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
      echo ""
      ((SKIPPED++))
      continue
    fi
  fi

  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "Testing: $example_name"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  cd "$example"

  # Remove old node_modules and lockfile if --clean flag is passed
  if [ "$CLEAN_INSTALL" = true ]; then
    rm -rf node_modules bun.lockb package-lock.json 2>/dev/null || true
  fi

  # Install dependencies (skip if node_modules exists and not --clean)
  if [ "$CLEAN_INSTALL" = true ] || [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    # Install other dependencies first
    if ! bun install 2>&1; then
      echo "✗ $example_name failed (install error)"
      ((FAILED++))
      FAILED_EXAMPLES="$FAILED_EXAMPLES $example_name"
      echo ""
      continue
    fi
    # Create symlink to root package
    mkdir -p node_modules/@poofnew
    rm -rf node_modules/@poofnew/vibe-check
    ln -s "$ROOT_DIR" node_modules/@poofnew/vibe-check
  fi

  # Setup Python virtual environment for python-agent example
  if [ "$example_name" = "python-agent" ]; then
    if [ "$CLEAN_INSTALL" = true ] || [ ! -d ".venv" ]; then
      echo "Setting up Python virtual environment..."
      if ! ./setup.sh 2>&1; then
        echo "✗ $example_name failed (Python setup error)"
        ((FAILED++))
        FAILED_EXAMPLES="$FAILED_EXAMPLES $example_name"
        echo ""
        continue
      fi
    fi
  fi

  # Run vibe-check
  echo "Running evals..."

  # Learning example: failures are expected, test the learning system instead
  if [ "$example_name" = "learning" ]; then
    # Run evals (expect failures)
    bun run vibe-check run 2>&1 || true

    # Verify learning stats works and shows failures
    echo "Verifying learning system..."
    stats_output=$(bun run vibe-check learn stats 2>&1)
    if echo "$stats_output" | grep -q "eval.*failures"; then
      echo "✓ $example_name passed (learning system working)"
      ((PASSED++))
    else
      echo "✗ $example_name failed (learning system not detecting failures)"
      ((FAILED++))
      FAILED_EXAMPLES="$FAILED_EXAMPLES $example_name"
    fi
  elif bun run vibe-check run 2>&1; then
    echo "✓ $example_name passed"
    ((PASSED++))
  else
    echo "✗ $example_name failed"
    ((FAILED++))
    FAILED_EXAMPLES="$FAILED_EXAMPLES $example_name"
  fi

  echo ""
done

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "EXAMPLES TEST SUMMARY"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Passed:  $PASSED"
echo "Failed:  $FAILED"
echo "Skipped: $SKIPPED"

if [ $FAILED -gt 0 ]; then
  echo ""
  echo "Failed examples:$FAILED_EXAMPLES"
  exit 1
fi

echo ""
echo "All examples passed!"
exit 0
