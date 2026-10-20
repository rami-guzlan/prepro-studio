/* Absolute font URLs embedded in generated print HTML. */
import cpRegular from '@fontsource/courier-prime/files/courier-prime-latin-400-normal.woff2?url';
import cpItalic from '@fontsource/courier-prime/files/courier-prime-latin-400-italic.woff2?url';
import cpBold from '@fontsource/courier-prime/files/courier-prime-latin-700-normal.woff2?url';
import cpBoldItalic from '@fontsource/courier-prime/files/courier-prime-latin-700-italic.woff2?url';
import cpExtRegular from '@fontsource/courier-prime/files/courier-prime-latin-ext-400-normal.woff2?url';
import cpExtBold from '@fontsource/courier-prime/files/courier-prime-latin-ext-700-normal.woff2?url';
// static (non-variable) weights embed as real fonts in PDFs (variable fonts become Type3 outlines)
import inter400 from '@fontsource/inter/files/inter-latin-400-normal.woff2?url';
import inter400i from '@fontsource/inter/files/inter-latin-400-italic.woff2?url';
import inter500 from '@fontsource/inter/files/inter-latin-500-normal.woff2?url';
import inter600 from '@fontsource/inter/files/inter-latin-600-normal.woff2?url';
import inter700 from '@fontsource/inter/files/inter-latin-700-normal.woff2?url';
import inter700i from '@fontsource/inter/files/inter-latin-700-italic.woff2?url';
import inter800 from '@fontsource/inter/files/inter-latin-800-normal.woff2?url';

const abs = (u: string) => new URL(u, document.baseURI).href;

export function fontFaceCss(): string {
  return `
@font-face { font-family: 'Courier Prime'; font-style: normal; font-weight: 400; src: url('${abs(cpRegular)}') format('woff2'); }
@font-face { font-family: 'Courier Prime'; font-style: italic; font-weight: 400; src: url('${abs(cpItalic)}') format('woff2'); }
@font-face { font-family: 'Courier Prime'; font-style: normal; font-weight: 700; src: url('${abs(cpBold)}') format('woff2'); }
@font-face { font-family: 'Courier Prime'; font-style: italic; font-weight: 700; src: url('${abs(cpBoldItalic)}') format('woff2'); }
@font-face { font-family: 'Courier Prime'; font-style: normal; font-weight: 400; src: url('${abs(cpExtRegular)}') format('woff2'); unicode-range: U+0100-024F, U+0259, U+1E00-1EFF, U+2020, U+20A0-20AB, U+20AD-20CF, U+2113, U+2C60-2C7F, U+A720-A7FF; }
@font-face { font-family: 'Courier Prime'; font-style: normal; font-weight: 700; src: url('${abs(cpExtBold)}') format('woff2'); unicode-range: U+0100-024F, U+0259, U+1E00-1EFF, U+2020, U+20A0-20AB, U+20AD-20CF, U+2113, U+2C60-2C7F, U+A720-A7FF; }
@font-face { font-family: 'Inter'; font-style: normal; font-weight: 100 449; src: url('${abs(inter400)}') format('woff2'); }
@font-face { font-family: 'Inter'; font-style: italic; font-weight: 100 549; src: url('${abs(inter400i)}') format('woff2'); }
@font-face { font-family: 'Inter'; font-style: normal; font-weight: 450 549; src: url('${abs(inter500)}') format('woff2'); }
@font-face { font-family: 'Inter'; font-style: normal; font-weight: 550 649; src: url('${abs(inter600)}') format('woff2'); }
@font-face { font-family: 'Inter'; font-style: normal; font-weight: 650 749; src: url('${abs(inter700)}') format('woff2'); }
@font-face { font-family: 'Inter'; font-style: italic; font-weight: 550 900; src: url('${abs(inter700i)}') format('woff2'); }
@font-face { font-family: 'Inter'; font-style: normal; font-weight: 750 900; src: url('${abs(inter800)}') format('woff2'); }
`;
}
