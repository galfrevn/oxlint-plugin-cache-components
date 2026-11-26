# Changesets

Each pull request that changes the published package adds a changeset. Run `pnpm changeset`, choose the bump (patch, minor, or major), and describe the change for users in one or two sentences. The release workflow turns the changesets into a `chore: release` pull request that bumps the version and updates `CHANGELOG.md`.
