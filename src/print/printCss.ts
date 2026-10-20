/* Base stylesheet for all printed documents (class prefix "pp-"). */
export const BASE_PRINT_CSS = `
*, *::before, *::after { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; font-family: 'Inter', 'Segoe UI', Arial, sans-serif; font-size: 9pt; line-height: 1.38; color: #141418; background: #fff; }
h1, h2, h3, h4 { margin: 0; font-weight: 700; letter-spacing: -0.01em; }
p { margin: 0 0 6pt; }
img { max-width: 100%; }
.pp-muted { color: #707078; }
.pp-small { font-size: 7.5pt; }
.pp-tiny { font-size: 6.5pt; }
.pp-strong { font-weight: 650; }
.pp-upper { text-transform: uppercase; letter-spacing: 0.04em; }
.pp-right { text-align: right; }
.pp-center { text-align: center; }
.pp-nowrap { white-space: nowrap; }
.pp-pre { white-space: pre-wrap; }
.pp-mono { font-family: 'Courier Prime', 'Courier New', monospace; }
.pp-avoid { break-inside: avoid; page-break-inside: avoid; }
.pp-break { break-after: page; page-break-after: always; }
.pp-break-before { break-before: page; page-break-before: always; }
.pp-row { display: flex; gap: 10pt; align-items: flex-start; }
.pp-grow { flex: 1; min-width: 0; }
.pp-grid { display: grid; gap: 10pt; }

/* document title block */
.pp-doc-header { display: flex; align-items: flex-end; gap: 14pt; padding-bottom: 8pt; margin-bottom: 12pt; border-bottom: 2pt solid var(--pp-accent, #6d4aff); }
.pp-doc-header .pp-logo { max-height: 38pt; max-width: 120pt; object-fit: contain; }
.pp-doc-header .pp-titles { flex: 1; min-width: 0; }
.pp-doc-header .pp-project { font-size: 8pt; font-weight: 650; text-transform: uppercase; letter-spacing: 0.08em; color: #6b6b75; }
.pp-doc-header h1 { font-size: 18pt; line-height: 1.15; margin-top: 2pt; }
.pp-doc-header .pp-sub { font-size: 9pt; color: #55555e; margin-top: 2pt; }
.pp-doc-header .pp-meta { text-align: right; font-size: 8pt; color: #55555e; white-space: nowrap; }

/* sections */
.pp-section { margin-top: 12pt; }
.pp-section-title { font-size: 9pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: #2a2a33; padding-bottom: 3pt; margin: 14pt 0 6pt; border-bottom: 0.75pt solid #c9c9d1; break-after: avoid; page-break-after: avoid; }
.pp-section-title:first-child { margin-top: 0; }

/* tables */
.pp-table { width: 100%; border-collapse: collapse; font-size: 8.3pt; }
.pp-table thead { display: table-header-group; }
.pp-table tfoot { display: table-row-group; }
.pp-table th { text-align: left; font-size: 6.8pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #3a3a44; background: #efeff3; padding: 4pt 5pt; border-bottom: 0.75pt solid #b9b9c3; vertical-align: bottom; }
.pp-table td { padding: 3.5pt 5pt; border-bottom: 0.5pt solid #dcdce2; vertical-align: top; }
.pp-table tr { break-inside: avoid; page-break-inside: avoid; }
.pp-table td.num, .pp-table th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.pp-table tr.pp-group { break-after: avoid; page-break-after: avoid; }
.pp-table tr.pp-group td { background: #f6f6f9; font-weight: 700; font-size: 7.6pt; text-transform: uppercase; letter-spacing: 0.05em; color: #33333c; border-bottom: 0.75pt solid #c9c9d1; padding-top: 6pt; }
.pp-table tr.pp-total td { font-weight: 700; border-top: 1pt solid #888; background: #f6f6f9; }
.pp-table.pp-zebra tbody tr:nth-child(even) td { background: #fafafc; }
.pp-table.pp-bordered td, .pp-table.pp-bordered th { border: 0.5pt solid #c9c9d1; }

/* key / value grid */
.pp-kv { display: grid; grid-template-columns: repeat(var(--pp-cols, 3), minmax(0, 1fr)); gap: 6pt 14pt; }
.pp-kv .pp-k { font-size: 6.6pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #7a7a84; }
.pp-kv .pp-v { font-size: 9pt; white-space: pre-wrap; word-break: break-word; }

/* boxes & badges */
.pp-box { border: 0.75pt solid #c9c9d1; border-radius: 4pt; padding: 7pt 9pt; }
.pp-box-title { font-size: 6.8pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #55555e; margin-bottom: 4pt; }
.pp-badge { display: inline-block; padding: 0.5pt 5pt; border-radius: 8pt; font-size: 6.8pt; font-weight: 700; background: #ececf1; color: #33333c; white-space: nowrap; }
.pp-dot { display: inline-block; width: 6pt; height: 6pt; border-radius: 50%; vertical-align: middle; margin-right: 3pt; }
.pp-check { display: inline-block; width: 8pt; height: 8pt; border: 0.75pt solid #555; border-radius: 1.5pt; vertical-align: -1pt; }
.pp-check.on { background: #333; }
.pp-photo { background: #e9e9ee; overflow: hidden; border-radius: 3pt; }
.pp-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
.pp-photo.contain img { object-fit: contain; }
.pp-lines { border-bottom: 0.5pt solid #bbb; height: 14pt; }

/* watermark (repeats on every page) */
.pp-watermark { position: fixed; left: 0; right: 0; top: 42%; text-align: center; font-size: 84pt; font-weight: 800; color: rgba(0,0,0,0.055); transform: rotate(-28deg); z-index: 0; pointer-events: none; text-transform: uppercase; letter-spacing: 0.08em; }

/* black & white */
.pp-bw img { filter: grayscale(1); }

/* fixed pages */
.pp-page { position: relative; overflow: hidden; break-after: page; page-break-after: always; background: #fff; }
.pp-page:last-child { break-after: auto; page-break-after: auto; }

@media screen {
  html { background: #8c8c96; }
  body.pp-screen-flow { background: #fff; margin: 24px auto; box-shadow: 0 2px 18px rgba(0,0,0,.35); }
  body.pp-screen-fixed { background: transparent; padding: 24px 0; }
  body.pp-screen-fixed .pp-page { margin: 0 auto 24px; box-shadow: 0 2px 18px rgba(0,0,0,.35); }
}
`;
