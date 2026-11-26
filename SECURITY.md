# Security policy

## Supported versions

The latest minor version receives security fixes.

## Reporting a vulnerability

Report vulnerabilities privately through GitHub private vulnerability reporting:
https://github.com/galfrevn/oxlint-plugin-cache-components/security/advisories/new

Do not open a public issue for a vulnerability.

Include the following in your report:

- The affected version, or the commit hash.
- The versions of oxlint and Next.js you used, if the report depends on them.
- The steps to reproduce the problem, with the smallest code sample that triggers it.
- The impact: what an attacker can do, or what a user loses.
- A suggested fix, if you have one.

The maintainer aims to acknowledge reports within 7 days.

## Scope

In scope:

- The plugin code in this repository.
- The published npm package, including supply-chain issues such as a compromised dependency or a release that differs from the repository.

The plugin is a set of lint rules. It is not a security control, and it does not check the security of an application. A rule that misses a problem is a rule gap, and a regular issue is the right place for it. A flaw that compromises users of the plugin or its npm package is a vulnerability, and it goes through private reporting.
