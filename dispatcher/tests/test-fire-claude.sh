#!/usr/bin/env bash
# Tests for dispatcher/fire-claude.example.sh, the example fire_command that starts Claude Code on one order.
# Run: bash dispatcher/tests/test-fire-claude.sh
# A fake `claude` on PATH records its arguments, stdin, env and cwd into the case's temp dir; nothing real is started.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPT="$ROOT/dispatcher/fire-claude.example.sh"
TMPDIRS=()
cleanup() { for d in ${TMPDIRS[@]+"${TMPDIRS[@]}"}; do rm -rf "$d"; done; }
trap cleanup EXIT

fail() { echo "FAIL: $*" >&2; exit 1; }

# new_case: fresh temp dir T with bin/claude (fake) and project/ (cwd for the run)
new_case() {
  T="$(mktemp -d)"
  TMPDIRS+=("$T")
  BIN="$T/bin"
  mkdir -p "$BIN" "$T/project"
  cat > "$BIN/claude" <<'EOF'
#!/usr/bin/env bash
# fake claude: records how it was called into the case dir (the parent of bin/)
out="$(cd "$(dirname "$0")/.." && pwd)"
printf '%s\n' "$@" > "$out/args.txt"
pwd > "$out/cwd.txt"
echo "ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY-unset}" > "$out/env.txt"
cat > "$out/stdin.txt"
EOF
  chmod +x "$BIN/claude"
}

# run_fire <stdin> [VAR=value ...]: runs the template with the fake claude first on PATH.
# Clears FOREMAN_* variables first so the caller's environment cannot leak in. Sets RC, out.txt, err.txt.
run_fire() {
  local input="$1"; shift
  RC=0
  printf '%s' "$input" | env -u FOREMAN_PROJECT_DIR -u FOREMAN_CLAUDE_MODEL -u FOREMAN_FIRE_DRY \
    PATH="$BIN:$PATH" "$@" bash "$SCRIPT" >"$T/out.txt" 2>"$T/err.txt" || RC=$?
}

# arg_after <flag>: the argument that follows flag in the recorded claude arguments
arg_after() { awk -v k="$1" 'found{print; exit} $0==k{found=1}' "$T/args.txt"; }

expect_no_claude() { [ ! -e "$T/args.txt" ] || fail "$1: claude was called"; }

[ -f "$SCRIPT" ] || fail "missing $SCRIPT"

# a: syntax
bash -n "$SCRIPT" || fail "bash -n $SCRIPT"
echo "ok a: template passes bash -n"

# b: happy path, API key must not reach claude
new_case
export ANTHROPIC_API_KEY=sk-should-not-pass
run_fire "do the thing" FOREMAN_PROJECT_DIR="$T/project" FOREMAN_CLAUDE_MODEL=claude-sonnet-5-5
unset ANTHROPIC_API_KEY
[ "$RC" -eq 0 ] || { cat "$T/err.txt" >&2; fail "b: exit $RC"; }
[ -f "$T/args.txt" ] || fail "b: claude not called"
grep -qx -- '-p' "$T/args.txt" || fail "b: -p missing from claude args"
[ "$(arg_after --model)" = claude-sonnet-5-5 ] || fail "b: --model not followed by claude-sonnet-5-5"
grep -q 'do the thing' "$T/stdin.txt" || fail "b: order not on claude stdin"
[ "$(cat "$T/env.txt")" = "ANTHROPIC_API_KEY=unset" ] || fail "b: ANTHROPIC_API_KEY reached claude: $(cat "$T/env.txt")"
[ "$(cat "$T/cwd.txt")" = "$(cd "$T/project" && pwd)" ] || fail "b: claude cwd is $(cat "$T/cwd.txt"), not the project dir"
echo "ok b: runs claude -p --model with the order on stdin, in the project dir, without ANTHROPIC_API_KEY"

# c: model must be an exact model ID; unset, placeholder and aliases are refused
for m in UNSET "" "<exact-model-id>" opus sonnet haiku opusplan default; do
  new_case
  if [ "$m" = UNSET ]; then
    run_fire "do the thing" FOREMAN_PROJECT_DIR="$T/project"
  else
    run_fire "do the thing" FOREMAN_PROJECT_DIR="$T/project" FOREMAN_CLAUDE_MODEL="$m"
  fi
  [ "$RC" -ne 0 ] || fail "c: model '$m' accepted"
  grep -qi 'model' "$T/err.txt" || fail "c: stderr does not mention model for '$m'"
  expect_no_claude "c: model '$m'"
done
echo "ok c: unset, empty, placeholder and alias models are refused before claude runs"

# d: empty order
new_case
run_fire "" FOREMAN_PROJECT_DIR="$T/project" FOREMAN_CLAUDE_MODEL=claude-sonnet-5-5
[ "$RC" -ne 0 ] || fail "d: empty stdin accepted"
expect_no_claude "d: empty stdin"
echo "ok d: empty order is refused and claude is not called"

# e: project dir missing or not a directory
new_case
run_fire "do the thing" FOREMAN_CLAUDE_MODEL=claude-sonnet-5-5
[ "$RC" -ne 0 ] || fail "e: unset FOREMAN_PROJECT_DIR accepted"
expect_no_claude "e: unset project dir"
new_case
run_fire "do the thing" FOREMAN_PROJECT_DIR="$T/does-not-exist" FOREMAN_CLAUDE_MODEL=claude-sonnet-5-5
[ "$RC" -ne 0 ] || fail "e: missing project dir accepted"
expect_no_claude "e: missing project dir"
new_case
touch "$T/a-file"
run_fire "do the thing" FOREMAN_PROJECT_DIR="$T/a-file" FOREMAN_CLAUDE_MODEL=claude-sonnet-5-5
[ "$RC" -ne 0 ] || fail "e: project dir that is a file accepted"
expect_no_claude "e: project dir is a file"
echo "ok e: missing or non-directory project dir is refused and claude is not called"

# f: dry run prints the plan, starts nothing, and does not print the order
new_case
run_fire "do the thing" FOREMAN_PROJECT_DIR="$T/project" FOREMAN_CLAUDE_MODEL=claude-sonnet-5-5 FOREMAN_FIRE_DRY=1
[ "$RC" -eq 0 ] || { cat "$T/err.txt" >&2; fail "f: dry run exit $RC"; }
grep -q 'would run claude' "$T/out.txt" || fail "f: dry run line missing"
grep -q 'claude-sonnet-5-5' "$T/out.txt" || fail "f: dry run line does not name the model"
expect_no_claude "f: dry run"
! grep -q 'do the thing' "$T/out.txt" "$T/err.txt" || fail "f: dry run printed the order"
echo "ok f: FOREMAN_FIRE_DRY=1 says what would run, starts nothing, prints no order text"

echo "fire-claude tests: ok"
