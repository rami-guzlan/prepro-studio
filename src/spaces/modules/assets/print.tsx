/* Printable brand kit: logos, colours, fonts, voice & key messages, references. */
import type { SpacePrintDocDef } from '@/spaces/print/types';
import type { BrandAsset } from '@/spaces/types';
import { ASSET_KINDS, RESOURCE_TYPES } from '@/spaces/constants';
import { optionLabel } from '@/lib/constants';
import { SpaceDocHeader } from '@/spaces/print/components';
import { PSection, PTable, Pre } from '@/print/components';
import { assetsOfSection, fontStack, hexToRgb, inkOn, keyMessageLines, normalizeHex } from './util';

const CSS = `
.bk-logos { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8pt; }
.bk-logo { border: 0.75pt solid #d4d4dc; border-radius: 4pt; overflow: hidden; break-inside: avoid; }
.bk-logo-stage { height: 1.05in; display: flex; align-items: center; justify-content: center; padding: 8pt; background: #f6f6f9; }
.bk-logo-stage img { max-width: 100%; max-height: 100%; object-fit: contain; display: block; }
.bk-cap { padding: 4pt 6pt; font-size: 7.6pt; font-weight: 650; }
.bk-cap .n { font-weight: 400; color: #707078; display: block; font-size: 7pt; margin-top: 1pt; }
.bk-colors { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8pt; }
.bk-color { border: 0.75pt solid #d4d4dc; border-radius: 4pt; overflow: hidden; break-inside: avoid; }
.bk-chip { height: 0.75in; display: flex; align-items: flex-end; padding: 4pt 6pt; font-size: 7pt; font-weight: 700; }
.bk-color .meta { padding: 4pt 6pt 5pt; }
.bk-color .name { font-size: 8pt; font-weight: 700; }
.bk-color .code { font-family: 'Cascadia Mono', Consolas, monospace; font-size: 7pt; color: #44444c; }
.bk-color .note { font-size: 6.8pt; color: #707078; margin-top: 2pt; }
.bk-font { display: grid; grid-template-columns: 1.7in minmax(0, 1fr); gap: 12pt; padding: 7pt 0; border-bottom: 0.5pt solid #dcdce2; break-inside: avoid; }
.bk-font:last-child { border-bottom: 0; }
.bk-font .fam { font-size: 10pt; font-weight: 700; }
.bk-font .role { font-size: 7.6pt; color: #55555e; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 650; margin-top: 1pt; }
.bk-font .sample { font-size: 20pt; line-height: 1.15; }
.bk-font .alpha { font-size: 9pt; color: #44444c; margin-top: 2pt; }
.bk-font .notes { font-size: 7.6pt; color: #66666f; margin-top: 3pt; white-space: pre-wrap; }
.bk-voice { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 14pt; }
.bk-tagline { font-size: 14pt; font-weight: 700; line-height: 1.3; margin-bottom: 8pt; letter-spacing: -0.01em; }
.bk-k { font-size: 6.8pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #7a7a84; margin-bottom: 2pt; }
.bk-msgs { margin: 0; padding-left: 13pt; }
.bk-msgs li { margin-bottom: 3pt; }
.bk-images { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8pt; }
.bk-image { break-inside: avoid; }
.bk-image .ph { aspect-ratio: 4 / 3; background: #e9e9ee; border-radius: 3pt; overflow: hidden; }
.bk-image .ph img { width: 100%; height: 100%; object-fit: cover; display: block; }
.bk-image .c { font-size: 7.4pt; margin-top: 2pt; color: #33333c; }
.bk-image .c .t { color: #7a7a84; }
.bk-tags { color: #7a7a84; font-size: 7pt; }
`;

const kindLabel = (k: string) => ASSET_KINDS.find((x) => x.value === k)?.label ?? k;
const tagText = (a: BrandAsset) => (a.tags?.length ? a.tags.map((t) => `#${t}`).join(' ') : '');

export const spacePrintDocs: SpacePrintDocDef[] = [
  {
    id: 'space-brand-kit',
    title: 'Brand Kit',
    group: 'Strategy',
    orientation: 'portrait',
    description: 'Logos, colour swatches with hex codes, fonts, voice & key messages and image references',
    options: [
      { key: 'showVoice', label: 'Brand voice & key messages', type: 'boolean', default: true },
      { key: 'showImages', label: 'Image references', type: 'boolean', default: true },
      { key: 'showFiles', label: 'Templates, media & links', type: 'boolean', default: true },
    ],
    emptyReason: (s) => (s.assets.length || s.strategy.tagline || s.strategy.voice || s.strategy.keyMessages ? false : 'Add logos, colours or fonts in Brand Kit & Assets first'),
    render: (ctx) => {
      const { space, options } = ctx;
      const assets = space.assets;
      const logos = assetsOfSection(assets, 'logos');
      const colors = assetsOfSection(assets, 'colors');
      const fonts = assetsOfSection(assets, 'fonts');
      const images = assetsOfSection(assets, 'images').filter((a) => a.image);
      const files = [...assetsOfSection(assets, 'templates'), ...assetsOfSection(assets, 'video'), ...assetsOfSection(assets, 'audio'), ...assetsOfSection(assets, 'links')];
      const st = space.strategy;
      const msgs = keyMessageLines(st.keyMessages);
      const hasVoice = !!(st.tagline?.trim() || st.voice?.trim() || msgs.length);
      const counts = [logos.length && `${logos.length} logo${logos.length === 1 ? '' : 's'}`, colors.length && `${colors.length} colour${colors.length === 1 ? '' : 's'}`, fonts.length && `${fonts.length} font${fonts.length === 1 ? '' : 's'}`]
        .filter(Boolean)
        .join(' · ');

      return {
        css: CSS,
        body: (
          <>
            <SpaceDocHeader ctx={ctx} title="Brand Kit" subtitle={counts || space.meta.description} />

            {logos.length > 0 && (
              <PSection title="Logos">
                <div className="bk-logos">
                  {logos.map((a) => (
                    <div key={a.id} className="bk-logo">
                      <div className="bk-logo-stage">{a.image ? <img src={ctx.asset(a.image)} alt="" /> : <span className="pp-muted pp-small">No file</span>}</div>
                      <div className="bk-cap">
                        {a.name || 'Logo'}
                        {a.notes?.trim() && <span className="n">{a.notes}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </PSection>
            )}

            {colors.length > 0 && (
              <PSection title="Colours">
                <div className="bk-colors">
                  {colors.map((a) => {
                    const hex = normalizeHex(a.value);
                    const rgb = hex ? hexToRgb(hex) : null;
                    return (
                      <div key={a.id} className="bk-color">
                        <div className="bk-chip" style={{ background: hex ?? '#f1f1f4', color: inkOn(hex ?? undefined) }}>
                          {hex ? '' : 'No value'}
                        </div>
                        <div className="meta">
                          <div className="name">{a.name || 'Colour'}</div>
                          {hex && <div className="code">{hex.toUpperCase()}</div>}
                          {rgb && <div className="code">RGB {rgb.join(' · ')}</div>}
                          {a.notes?.trim() && <div className="note">{a.notes}</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </PSection>
            )}

            {fonts.length > 0 && (
              <PSection title="Typography">
                {fonts.map((a) => (
                  <div key={a.id} className="bk-font">
                    <div>
                      <div className="fam">{a.value?.trim() || 'Font family not set'}</div>
                      {a.name?.trim() && <div className="role">{a.name}</div>}
                      {a.url?.trim() && <div className="pp-tiny pp-muted" style={{ marginTop: '2pt', wordBreak: 'break-all' }}>{a.url}</div>}
                    </div>
                    <div style={{ fontFamily: fontStack(a.value, 'Inter, Arial, sans-serif') }}>
                      <div className="sample">{st.tagline?.trim() || space.meta.title || 'The quick brown fox'}</div>
                      <div className="alpha">ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz 0123456789</div>
                      {a.notes?.trim() && <div className="notes">{a.notes}</div>}
                    </div>
                  </div>
                ))}
              </PSection>
            )}

            {options.showVoice && hasVoice && (
              <PSection title="Brand voice" className="pp-avoid">
                {st.tagline?.trim() && <div className="bk-tagline">“{st.tagline.trim()}”</div>}
                <div className="bk-voice">
                  {st.voice?.trim() ? (
                    <div>
                      <div className="bk-k">Tone of voice</div>
                      <Pre>{st.voice.trim()}</Pre>
                    </div>
                  ) : (
                    <div />
                  )}
                  {msgs.length > 0 && (
                    <div>
                      <div className="bk-k">Key messages</div>
                      <ol className="bk-msgs">
                        {msgs.map((m, i) => (
                          <li key={i}>{m}</li>
                        ))}
                      </ol>
                    </div>
                  )}
                </div>
              </PSection>
            )}

            {options.showImages && images.length > 0 && (
              <PSection title="Image references" right={`${images.length}`}>
                <div className="bk-images">
                  {images.map((a) => (
                    <div key={a.id} className="bk-image">
                      <div className="ph">
                        <img src={ctx.asset(a.image)} alt="" />
                      </div>
                      {(a.name?.trim() || a.tags?.length) && (
                        <div className="c">
                          {a.name}
                          {a.tags?.length ? <span className="t"> {tagText(a)}</span> : null}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </PSection>
            )}

            {options.showFiles && files.length > 0 && (
              <PSection title="Templates, media, links & resources">
                <PTable
                  zebra
                  rows={files}
                  columns={[
                    { header: 'Type', width: '14%', cell: (a) => (a.resourceType ? optionLabel(RESOURCE_TYPES, a.resourceType) : kindLabel(a.kind)) + (a.gated ? ' · gated' : '') },
                    { header: 'Name', width: '22%', cell: (a) => <span className="pp-strong">{a.name || '—'}</span> },
                    { header: 'Campaign', width: '14%', cell: (a) => (a.campaignId ? space.campaigns.find((c) => c.id === a.campaignId)?.name ?? '' : '') },
                    { header: 'File / link', width: '26%', cell: (a) => <span style={{ wordBreak: 'break-all' }}>{[a.fileName, a.value, a.url].filter((x) => x?.trim()).join(' · ') || '—'}</span> },
                    { header: 'Notes', cell: (a) => <>{a.notes}{a.tags?.length ? <div className="bk-tags">{tagText(a)}</div> : null}</> },
                  ]}
                />
              </PSection>
            )}

            {!assets.length && !hasVoice && <p className="pp-muted">This space has no brand assets yet.</p>}
          </>
        ),
      };
    },
  },
];
