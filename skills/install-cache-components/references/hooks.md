# Post-edit hook recipes

Each recipe runs oxlint on the file the agent just edited and returns the findings to the agent. Hook formats change often. Check the harness reference before installing a recipe.

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

`.claude/hooks/cache-components.sh`, the warn variant. It passes the findings to the agent as additional context:

```bash
#!/usr/bin/env bash
file=$(jq -r '.tool_input.file_path // empty')
case "$file" in
  *.ts|*.tsx|*.js|*.jsx|*.mts|*.mjs) ;;
  *) exit 0 ;;
esac

if ! findings=$(npx oxlint --format agent "$file" 2>&1); then
  jq -n --arg ctx "$findings" \
    '{hookSpecificOutput: {hookEventName: "PostToolUse", additionalContext: $ctx}}'
fi
exit 0
```

For the block variant, replace the `jq -n` call with:

```bash
  jq -n --arg reason "$findings" '{decision: "block", reason: $reason}'
```

Make the script executable with `chmod +x .claude/hooks/cache-components.sh`. The script needs `jq`.

## Other harnesses

Codex, OpenCode, Gemini CLI, and other harnesses with post-edit hooks follow the same pattern: run `npx oxlint --format agent <file>` on the changed files and return the output to the agent.

If the harness has no hooks, add this instruction to `AGENTS.md`:

```md
After editing any file under `app/`, or any file that contains "use cache", run `npx oxlint <files>` and fix every `cache-components/*` error before continuing.
```

## Pre-commit and CI

- Pre-commit with `lefthook` or `husky`: run `npx oxlint --deny-warnings` on the staged files.
- GitHub Actions: run `npx oxlint --format github`, which adds annotations to the pull request.
