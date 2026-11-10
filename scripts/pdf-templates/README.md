# Exact-copy PDF templates

The Certificate of Origin and Set of Documents are generated on top of the
owner's own sample PDFs (Excel "Print to PDF" output). To (re)build a
template from a new sample:

1. List the sample's text runs, to find the ones holding per-shipment values:
   `node scripts/pdf-templates/runs.js sample.pdf`
2. Describe the values to remove in a spec (`page`, `run`, `text`, `occ`,
   `key`, `align`) - see `*.spec.json`.
3. Remove them and record their positions ("slots"):
   `node scripts/pdf-templates/clean.js sample.pdf spec.json template.pdf slots.json`
   Every other glyph stays exactly where it was.
4. Put `template.pdf` in `lib/pdf/assets/` and the slots in `lib/pdf/slots/`
   (keys starting with `_` are removals only, e.g. the "#" after SEAL).

`lib/pdf/templateFill.ts` prints the values into the slots at runtime with
OFL fonts metric-identical to the originals (Liberation Sans = Arial,
Carlito = Calibri, Liberation Serif = Times New Roman), kerning off like
Excel.
