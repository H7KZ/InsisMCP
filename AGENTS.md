# AGENTS.md

Guide for coding agents working in this repository. Domain glossary: [.claude/CONTEXT.md](.claude/CONTEXT.md).

## Project

**InSIS MCP Server**: a remote MCP server exposing academic data from InSIS (the information system of the Prague
University of Economics and Business, VŠE) to AI clients. Built as the author's bachelor's thesis at FIS VŠE. The
repository is public.

## Repository map

| Path              | What                                                         | State                               |
|-------------------|--------------------------------------------------------------|-------------------------------------|
| `mcp/`            | The MCP server (TypeScript, Node 24, npm)                    | Tooling only                        |
| `thesis/`         | Bachelor's thesis (LaTeX, FIS template)                      | Template; author writes the content |
| `planning/`       | Author's planning notes (thesis schedule, structure, …)      | Author-owned                        |
| `planning/infra/` | Agreed infra design: ETL, runtime, deployment, monitoring    | Design only, not implemented        |
| `TODO.md`         | Open questions for the thesis advisor, placeholders to fix   | Author-owned                        |
| `.github/`        | CI: thesis PDF build, chktex lint, PDF/A validation          | Working                             |

Planned by the infra design, not created yet: `etl/`, `packages/db/`, `deploy/`, `scripts/`, root workspace
`package.json` and `compose.yaml` — see [planning/infra/repo-layout.md](planning/infra/repo-layout.md).

Build on [planning/infra/](planning/infra/README.md) for data path, hosting and deployment; its
[open questions](planning/infra/open-questions.md) are not decided — ask first. MCP tool design is still undecided.

## Commands

### `mcp/`

```bash
npm ci
npm run dev          # tsx watch
npm run lint         # eslint
npm run type-check   # tsc --noEmit
npm test             # vitest
npm run build        # tsup -> dist/index.js
npm run format       # prettier
```

Keep `lint`, `type-check`, `test` and `build` green.

### `thesis/`

```bash
latexmk                                                         # build -> build/thesis.pdf
chktex -q -g0 -l .chktexrc thesis.tex chapters/*.tex            # lint
latexindent -s -w -l latexindent.yaml -m thesis.tex chapters/*.tex  # format
```

## Code style

- Formatting is owned by `.editorconfig` + Prettier: tabs (width 4), no semicolons, single quotes, no trailing commas,
  print width 160.
- `mcp/` imports use the `@mcp/*` alias, not long relative paths.

## Git

- **One branch = one feature.** Prefixes: `feat/`, `fix/`, `chore/`, `docs/`, `ci/`, `refactor/`.
- PRs target `develop`; `develop` → `main` is a release.
- Conventional-commit subjects, scoped by area: `feat(mcp): …`, `fix(mcp): …`, `ci: …`, `docs(thesis): …`,
  `thesis: …`, `chore: …`. Imperative, lower-case, no trailing period.
- **Never mention AI, agents, assistants or code generation** in commit messages, PR titles or bodies, branch names,
  or code comments. No `Co-Authored-By` trailers, no "generated with" footers.
- Do not push, open PRs, or delete remote branches unless asked.

## Thesis rules

The author writes the thesis **personally**. In `thesis/`, agents only:

- **Transcribe** text the author provides into LaTeX — markup only (sections, emphasis, lists, citations, figures,
  tables, cross-references). Keep the author's wording; do not add, remove, rephrase or "improve" content.
- Maintain the **LaTeX infrastructure**: macros, preamble, build (`latexmk`), lint/format config, biblatex setup,
  BibTeX entry syntax, CI.

Agents never:

- Author, expand, summarise or rewrite thesis prose, or invent citations.
- Stage or commit anything under `thesis/chapters/` or `thesis/references.bib` — the author commits content manually.
