#!/bin/bash
# Setup virtual environment for Python agent example

set -e

cd "$(dirname "$0")"

if [ ! -d ".venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv .venv
fi

echo "Activating virtual environment..."
source .venv/bin/activate

echo "Installing dependencies..."
pip install claude-agent-sdk

echo "Setup complete! Run 'source .venv/bin/activate' before running vibe-check"
