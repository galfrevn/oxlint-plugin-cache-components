# Post-edit hook recipes

Each recipe runs oxlint on the file the agent edited and returns the findings to the agent. Hook formats change often. Check the harness reference before installing a recipe.

## Claude Code

Claude Code runs a `PostToolUse` command hook after `Edit`, `Write`, and `MultiEdit`. The hook receives JSON on stdin, and the edited file is in `tool_input.file_path`. Reference: https://code.claude.com/docs/en/hooks

`.claude/settings.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write|MultiEdit",
        "hooks": [
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/cache-components.sh"
          }
        ]
      }
    ]
  }
}
```

`.claude/hooks/cache-components.sh`, the warn variant. It passes every error and warning to the agent as additional context:

```bash
#!/usr/bin/env bash
file=$(jq -r '.tool_input.file_path // empty')
case "$file" in
  *.ts|*.tsx|*.js|*.jsx|*.mts|*.mjs) ;;
  *) exit 0 ;;
esac

cd "$CLAUDE_PROJECT_DIR" || exit 0
findings=$(npx --no-install oxlint --format agent "$file" 2>/dev/null)
if [ -n "$findings" ]; then
  jq -n --arg ctx "$findings" \
    '{hookSpecificOutput: {hookEventName: "PostToolUse", additionalContext: $ctx}}'
fi
exit 0
```

The block variant stops the agent only on errors. Replace every line after the `cd` line with:

```bash
if ! findings=$(npx --no-install oxlint --format agent "$file" 2>/dev/null); then
  jq -n --arg reason "$findings" '{decision: "block", reason: $reason}'
fi
exit 0
```

The script reads only the linter's standard output, so Node.js warnings don't reach the agent. `--no-install` keeps `npx` from downloading oxlint when the project doesn't have it.

Make the script executable with `chmod +x .claude/hooks/cache-components.sh`. The script needs `jq`.

## Other harnesses

Codex, OpenCode, Gemini CLI, and other harnesses with post-edit hooks follow the same pattern: run `npx --no-install oxlint --format agent <file>` on the changed files and return the output to the agent.

If the harness has no hooks, add this instruction to `AGENTS.md`:

```md
After editing any file under `app/`, or any file that contains "use cache", run `npx oxlint <files>` and fix every `cache-components/*` error before continuing.
```

## Pre-commit and CI

- Pre-commit with `lefthook` or `husky`: run `npx oxlint --deny-warnings` on the staged files.
- GitHub Actions: run `npx oxlint --format github`, which adds annotations to the pull request.
