# latexmk configuration for the FIS VŠE thesis (PDF/A-2u via pdfx)
# One command builds everything:  latexmk
# Clean aux files:                latexmk -c   (keep pdf)   /   latexmk -C  (remove pdf too)

$pdf_mode  = 1;                 # 1 = pdflatex (required for the template's PDF/A setup)
$bibtex_use = 2;                # run biber and treat missing .bbl as needing a run
$biber     = 'biber %O %S';

# Build into ./build to keep the source tree clean
$out_dir   = 'build';
$aux_dir   = 'build';

# Halt on the first error, emit file:line:error so editors/CI can parse it
$pdflatex  = 'pdflatex -interaction=nonstopmode -halt-on-error -file-line-error -synctex=1 %O %S';

# Root document
@default_files = ('thesis.tex');

# Extra files latexmk should treat as removable on clean
$clean_ext = 'bbl run.xml synctex.gz nav snm xmpi';
