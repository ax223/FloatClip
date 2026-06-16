# Contributing

Thanks for taking the time to improve FloatClip.

## Local Setup

1. Install Node.js, npm, Rust, and Cargo.
2. Run `npm install`.
3. Run `npm run tauri:dev` to start the desktop app in development mode.

## Before Opening a Pull Request

- Keep changes focused and describe the user-facing behavior they affect.
- Run `npm run build`.
- For Rust changes, run `cargo check` from `src-tauri/`.
- Avoid committing generated output such as `dist/`, `node_modules/`, logs, or `src-tauri/target/`.

## Notes

FloatClip currently targets Windows for full file clipboard support. Cross-platform changes are welcome, but please call out any platform-specific behavior in the pull request.
