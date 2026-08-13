set dotenv-load := false
set shell := ["bash", "-euo", "pipefail", "-c"]

# Show the project task surface.
default:
    @just --list

# Install exact dependencies, patch Effect tooling, and activate repository hooks.
install:
    bun install --frozen-lockfile
    bun run hooks:install

# Produce disposable package artifacts under dist/.
build:
    bun run build

# Run read-only static analysis.
check:
    bun run check

# Apply formatter and Oxlint safe fixes. Pre-commit narrows this to staged paths.
fix:
    bun run fix

# Run the test suite.
test:
    bun run test

# Run every readiness gate used by CI.
verify:
    bun run verify

# Re-run the current vertical demonstration as source changes.
dev:
    bun run dev

# Experience the current user-facing demonstration once.
preview:
    bun run preview
