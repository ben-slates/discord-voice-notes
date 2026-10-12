# Development & Contribution Guide

## Prerequisites

- Debian 12 (Bookworm), Debian 13 (Trixie), or Kali Linux x86_64
- Node.js >= 18.0.0
- npm >= 9.0.0
- `dpkg-deb` (for Debian package generation)

## Setting Up Workspace

```bash
git clone <repo-url> discord-voice-notes
cd discord-voice-notes
npm install
```

## Available Scripts & Make Commands

| Command | Action |
|---|---|
| `make build` / `npm run build` | Compiles TypeScript and creates esbuild bundles (`dist/plugin/index.js`, `index.cjs`, `index.css`) |
| `make test` / `npm test` | Runs the automated test suite with Node's native test runner |
| `make package` / `bash scripts/package.sh` | Compiles code, runs tests, and packages `discord-voice-notes.deb` |
| `make doctor` / `bash scripts/doctor.sh` | Runs system diagnostics |
| `make clean` | Removes build directories and artifacts |

## Coding Standards

- **Strict TypeScript**: `noImplicitAny: true`, `strict: true`.
- **Zero Proprietary Binaries**: Do not commit Discord binaries or keys.
- **Audio Cleanup**: Every `AudioContext` and `MediaStream` must be cleaned up on cancel or completion to avoid memory and audio descriptor leaks.
- **Unit Testing**: Add tests in `tests/` for any new logic added to `src/audio` or `src/discord`.
