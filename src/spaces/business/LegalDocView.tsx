/* A generated legal document as markup. Pure (no hooks): rendered on screen
   inside .biz-paper and in print / PDF with LEGAL_PRINT_CSS. */
import type { BuiltLegal } from './templates';
import { LEGAL_DISCLAIMER } from './templates';

export function LegalDocView({ doc, signedDate, showDisclaimer = true }: { doc: BuiltLegal; signedDate?: string; showDisclaimer?: boolean }) {
  return (
    <div className="lg-doc">
      {doc.letter ? (
        <div className="lg-letter">
          <div className="lg-date">{doc.letter.date}</div>
          <div className="lg-to">
            {doc.letter.to.map((l, i) => (
              <div key={i}>{l}</div>
            ))}
          </div>
          <div className="lg-re">
            <b>Re:</b> {doc.letter.re}
          </div>
          <p>{doc.letter.salutation}</p>
        </div>
      ) : (
        <div className="lg-head">
          <h1>{doc.title}</h1>
          {doc.subtitle && <div className="lg-sub">{doc.subtitle}</div>}
        </div>
      )}
      {doc.preamble.map((p, i) => (
        <p key={i} className="lg-p">
          {p}
        </p>
      ))}
      <ol className="lg-sections">
        {doc.sections.map((s, i) => (
          <li key={i} className="lg-section">
            <h2>
              <span className="lg-n">{i + 1}.</span> {s.heading}
            </h2>
            {s.clauses.length === 1 ? (
              <p className="lg-p">{s.clauses[0]}</p>
            ) : (
              s.clauses.map((c, j) => (
                <p key={j} className="lg-p lg-clause">
                  <span className="lg-n">
                    {i + 1}.{j + 1}
                  </span>
                  <span>{c}</span>
                </p>
              ))
            )}
          </li>
        ))}
      </ol>
      {doc.closing.map((p, i) => (
        <p key={i} className="lg-p lg-closing">
          {p}
        </p>
      ))}
      <div className="lg-sigs">
        {doc.signatures.map((s, i) => (
          <div key={i} className="lg-sig">
            <div className="lg-sig-role">{s.role}</div>
            {s.company && <div className="lg-sig-company">{s.company}</div>}
            <div className="lg-sig-line" />
            <div className="lg-sig-cap">Signature</div>
            <div className="lg-sig-field">
              <span>Name</span>
              <b>{s.name || ' '}</b>
            </div>
            {(s.title || s.company) && (
              <div className="lg-sig-field">
                <span>Title</span>
                <b>{s.title || ' '}</b>
              </div>
            )}
            <div className="lg-sig-field">
              <span>Date</span>
              <b>{signedDate || ' '}</b>
            </div>
          </div>
        ))}
      </div>
      {showDisclaimer && <div className="lg-disclaimer">{LEGAL_DISCLAIMER}</div>}
    </div>
  );
}

/** Print stylesheet for legal documents (literal colours, pt sizes). */
export const LEGAL_PRINT_CSS = `
.lg-doc { font-family: Georgia, 'Times New Roman', serif; font-size: 10.5pt; line-height: 1.5; color: #111; }
.lg-head { text-align: center; margin-bottom: 14pt; }
.lg-head h1 { font-family: Georgia, 'Times New Roman', serif; font-size: 16pt; letter-spacing: 0.04em; text-transform: uppercase; }
.lg-sub { font-size: 11pt; margin-top: 3pt; color: #333; }
.lg-letter { margin-bottom: 8pt; }
.lg-date { margin-bottom: 12pt; }
.lg-to { margin-bottom: 12pt; }
.lg-re { margin-bottom: 12pt; }
.lg-p { margin: 0 0 7pt; text-align: justify; }
.lg-sections { list-style: none; padding: 0; margin: 10pt 0 0; }
.lg-section { margin-bottom: 8pt; }
.lg-section h2 { font-family: Georgia, 'Times New Roman', serif; font-size: 10.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; margin: 10pt 0 5pt; break-after: avoid; page-break-after: avoid; }
.lg-clause { display: flex; gap: 8pt; }
.lg-clause .lg-n { flex: 0 0 24pt; font-weight: 600; }
.lg-clause > span:last-child { flex: 1; }
.lg-closing { margin-top: 12pt; }
.lg-sigs { display: grid; grid-template-columns: 1fr 1fr; gap: 22pt 30pt; margin-top: 18pt; break-inside: avoid; page-break-inside: avoid; }
.lg-sig { break-inside: avoid; page-break-inside: avoid; }
.lg-sig-role { font-weight: 700; text-transform: uppercase; font-size: 9pt; letter-spacing: 0.05em; }
.lg-sig-company { font-size: 9.5pt; color: #333; }
.lg-sig-line { border-bottom: 0.8pt solid #111; height: 30pt; }
.lg-sig-cap { font-size: 7.5pt; color: #666; margin: 2pt 0 5pt; }
.lg-sig-field { display: flex; gap: 6pt; font-size: 9.5pt; border-bottom: 0.5pt solid #bbb; padding: 3pt 0; }
.lg-sig-field span { color: #666; width: 34pt; flex-shrink: 0; }
.lg-sig-field b { font-weight: 500; }
.lg-disclaimer { margin-top: 22pt; padding-top: 6pt; border-top: 0.5pt solid #ccc; font-family: 'Inter', Arial, sans-serif; font-size: 7pt; color: #888; text-align: center; }
`;
