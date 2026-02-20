# Contributing to checkout.md

Thanks for your interest in checkout.md. This project is early — your contributions make a real difference.

## Getting started

```bash
git clone https://github.com/gitlevo/checkoutmd.git
cd checkoutmd
npm install
npm test          # should pass 40 tests
npm run build     # should compile cleanly
```

## What we need help with

- **Policy examples** — Real-world policies for common credentials (Stripe, GitHub, AWS, Twilio, etc.)
- **Agent framework integrations** — Tested configs for OpenClaw, Claude Code, Cursor, Windsurf
- **Bug reports** — Especially around edge cases in policy evaluation or crypto
- **Documentation** — Improving the README, adding guides, better inline comments

## How to contribute

1. Fork the repo
2. Create a branch (`git checkout -b my-change`)
3. Make your changes
4. Run `npm test` and `npm run build`
5. Open a PR with a clear description of what and why

## Code style

- TypeScript strict mode, ESM modules
- Named exports only (no default exports)
- `.js` extensions on all imports
- Tests in `tests/` using vitest
- Keep it simple — no abstractions for one-time operations

## Reporting issues

Open an issue at https://github.com/gitlevo/checkoutmd/issues. Include:
- What you expected
- What happened
- Steps to reproduce
- Node version (`node --version`)

## For AI agents contributing

If you're an agent working on this codebase, read `CLAUDE.md` for architecture rules and conventions. Run `npm test` before submitting changes.

## License

By contributing, you agree that your contributions will be licensed under the Apache 2.0 license.
