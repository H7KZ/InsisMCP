# LaTeX docs

---

## Quick start

Requires: full **TeX Live** or **MiKTeX** install and `latexmk`

```bash
cd thesis
latexmk          # full build thesis.pdf
latexmk -pvc     # watch mode
latexmk -c       # delete aux files, keep the PDF
latexmk -C       # delete everything including the PDF
```

> Output lands in `build/thesis.pdf`

## Lint

```bash
chktex -q -g0 -l .chktexrc thesis.tex chapters/*.tex
```

## Format

```bash
latexindent -s -w -l latexindent.yaml -m thesis.tex chapters/*.tex
```
