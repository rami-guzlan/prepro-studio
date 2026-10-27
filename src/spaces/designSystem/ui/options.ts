/* Option lists and section definitions of the design-system screens. */
import { BookOpen, Brush, ClipboardCheck, Component, FileStack, Frame, Gavel, Images, Palette, Ruler, Sparkles, Type, type LucideIcon } from 'lucide-react';
import type { DSColorRole, DSFormat, DSLayoutKind, DSLevel, DSReference, DSReferenceRole, DSRuleArea, DSTextCase, DSTokenGroup } from '../types';

export type DSSectionId = 'overview' | 'color' | 'type' | 'tokens' | 'components' | 'art' | 'rules' | 'references' | 'formats' | 'briefs' | 'review' | 'sources';

export interface DSSectionDef {
  id: DSSectionId;
  label: string;
  icon: LucideIcon;
  /** one line: what the section is for */
  hint: string;
}

export const DS_SECTIONS: DSSectionDef[] = [
  { id: 'overview', label: 'Overview', icon: BookOpen, hint: 'What the system is for, how agents should use it, brand intent' },
  { id: 'color', label: 'Colour & themes', icon: Palette, hint: 'Palette groups and roles, themes and the semantic tokens per theme' },
  { id: 'type', label: 'Typography', icon: Type, hint: 'Typefaces and the type scale' },
  { id: 'tokens', label: 'Spacing & shape', icon: Ruler, hint: 'Spacing, radius, borders, shadows, grid, motion' },
  { id: 'components', label: 'Components & layouts', icon: Component, hint: 'Building blocks with props and states; page, slide and social layouts' },
  { id: 'art', label: 'Art direction', icon: Brush, hint: 'Imagery, composition, colour behaviour and signature treatments for new imagery' },
  { id: 'rules', label: 'Rules', icon: Gavel, hint: 'Required, preferred and open decisions — brand-wide or per campaign' },
  { id: 'references', label: 'References', icon: Images, hint: 'Annotated examples: what each one controls, on brand or not' },
  { id: 'formats', label: 'Formats', icon: Frame, hint: 'Output sizes, safe areas and production specs' },
  { id: 'briefs', label: 'Generation briefs', icon: Sparkles, hint: 'Reusable requests for image models and designers' },
  { id: 'review', label: 'Review & finishing', icon: ClipboardCheck, hint: 'How results are checked and finished' },
  { id: 'sources', label: 'Imported files', icon: FileStack, hint: 'Design-system files imported into this space' },
];

export const DS_SECTION_IDS = DS_SECTIONS.map((s) => s.id);

/** Where a readiness to-do is fixed (labels of dsReadiness). 'assets' = the Assets tab. */
export function sectionOfMissing(label: string): DSSectionId | 'assets' {
  const l = label.toLowerCase();
  if (l.includes('logo')) return 'assets';
  if (l.includes('summary') || l.includes('intent')) return 'overview';
  if (l.includes('colour behaviour')) return 'art';
  if (l.includes('colour')) return 'color';
  if (l.includes('typeface') || l.includes('type style')) return 'type';
  if (l.includes('spacing')) return 'tokens';
  if (l.includes('component') || l.includes('layout')) return 'components';
  if (l.includes('composition') || l.includes('imagery')) return 'art';
  if (l.includes('rule')) return 'rules';
  if (l.includes('reference') || l.includes('near miss')) return 'references';
  if (l.includes('format')) return 'formats';
  if (l.includes('brief')) return 'briefs';
  if (l.includes('review')) return 'review';
  return 'overview';
}

export const COLOR_ROLES: { value: DSColorRole; label: string }[] = [
  { value: 'primary', label: 'Primary' },
  { value: 'secondary', label: 'Secondary' },
  { value: 'accent', label: 'Accent' },
  { value: 'neutral', label: 'Neutral' },
  { value: 'background', label: 'Background' },
  { value: 'surface', label: 'Surface' },
  { value: 'text', label: 'Text' },
  { value: 'border', label: 'Border' },
  { value: 'success', label: 'Success' },
  { value: 'warning', label: 'Warning' },
  { value: 'danger', label: 'Danger' },
  { value: 'info', label: 'Info' },
  { value: 'data', label: 'Data / charts' },
  { value: 'other', label: 'Other' },
];
export const colorRoleLabel = (r?: string) => COLOR_ROLES.find((x) => x.value === r)?.label ?? r ?? '';

export const LEVELS: { value: DSLevel; label: string; hint: string }[] = [
  { value: 'required', label: 'Required', hint: 'Never break it' },
  { value: 'preferred', label: 'Preferred', hint: 'The default — deviate only with a reason' },
  { value: 'open', label: 'Open', hint: 'Up to the maker' },
];

export const RULE_AREAS: { value: DSRuleArea; label: string }[] = [
  { value: 'brand', label: 'Brand' },
  { value: 'logo', label: 'Logo' },
  { value: 'color', label: 'Colour' },
  { value: 'typography', label: 'Typography' },
  { value: 'imagery', label: 'Imagery' },
  { value: 'composition', label: 'Composition' },
  { value: 'treatment', label: 'Treatments' },
  { value: 'layout', label: 'Layout' },
  { value: 'components', label: 'Components' },
  { value: 'voice', label: 'Voice' },
  { value: 'accessibility', label: 'Accessibility' },
  { value: 'production', label: 'Production' },
  { value: 'other', label: 'Other' },
];

export const RULE_KINDS: { value: 'rule' | 'do' | 'dont'; label: string }[] = [
  { value: 'rule', label: 'Rule' },
  { value: 'do', label: 'Do' },
  { value: 'dont', label: 'Don’t' },
];

export const VERDICTS: { value: DSReference['verdict']; label: string; hint: string }[] = [
  { value: 'on_brand', label: 'On brand', hint: 'This is us' },
  { value: 'near_miss', label: 'Near miss', hint: 'Attractive, but not us — say why' },
  { value: 'off_brand', label: 'Off brand', hint: 'What we never do' },
];

export const REF_ROLES: { value: DSReferenceRole; label: string }[] = [
  { value: 'style', label: 'Style' },
  { value: 'composition', label: 'Composition' },
  { value: 'asset', label: 'Asset' },
  { value: 'campaign', label: 'Campaign' },
  { value: 'mood', label: 'Mood' },
  { value: 'color', label: 'Colour' },
  { value: 'typography', label: 'Typography' },
];

export const TOKEN_GROUPS: { value: DSTokenGroup; label: string; hint: string; example: [string, string] }[] = [
  { value: 'spacing', label: 'Spacing', hint: 'The steps used for padding, gaps and margins', example: ['space-4', '16px'] },
  { value: 'radius', label: 'Radius', hint: 'Corner rounding', example: ['radius-card', '12px'] },
  { value: 'border', label: 'Border', hint: 'Stroke widths and styles', example: ['border-hairline', '1px solid #e2e2e8'] },
  { value: 'shadow', label: 'Shadow', hint: 'Elevation', example: ['shadow-card', '0 4px 16px rgba(0,0,0,.12)'] },
  { value: 'grid', label: 'Grid', hint: 'Columns, gutters, margins, max widths', example: ['grid-columns', '12'] },
  { value: 'breakpoint', label: 'Breakpoint', hint: 'Responsive widths', example: ['bp-tablet', '768px'] },
  { value: 'motion', label: 'Motion', hint: 'Durations and easings', example: ['ease-out', 'cubic-bezier(.2,.8,.2,1)'] },
  { value: 'opacity', label: 'Opacity', hint: 'Overlays and disabled states', example: ['overlay', '0.6'] },
  { value: 'other', label: 'Other', hint: 'Anything else', example: ['z-modal', '100'] },
];

export const LAYOUT_KINDS: { value: DSLayoutKind; label: string }[] = [
  { value: 'page', label: 'Page / document' },
  { value: 'slide', label: 'Slide' },
  { value: 'social', label: 'Social post' },
  { value: 'web', label: 'Web' },
  { value: 'print', label: 'Print' },
  { value: 'ui_kit', label: 'UI kit' },
  { value: 'other', label: 'Other' },
];

export const TEXT_CASES: { value: DSTextCase; label: string }[] = [
  { value: 'none', label: 'As typed' },
  { value: 'upper', label: 'UPPERCASE' },
  { value: 'lower', label: 'lowercase' },
  { value: 'title', label: 'Title Case' },
  { value: 'sentence', label: 'Sentence case' },
];

export const WEIGHTS = ['100', '200', '300', '400', '500', '600', '700', '800', '900'].map((w) => ({ value: w, label: `${w}${w === '400' ? ' · regular' : w === '700' ? ' · bold' : ''}` }));

export const FORMAT_PRESETS: (Omit<DSFormat, 'id'> & { label: string })[] = [
  { label: 'Instagram post', name: 'Instagram post', width: 1080, height: 1350, unit: 'px', aspect: '4:5', safeArea: 'Keep text 60px from every edge', minText: '28px' },
  { label: 'Story / Reel', name: 'Story / Reel', width: 1080, height: 1920, unit: 'px', aspect: '9:16', safeArea: 'Keep the top 250px and bottom 340px free of text (app UI)', minText: '36px' },
  { label: 'LinkedIn post', name: 'LinkedIn post', width: 1200, height: 1500, unit: 'px', aspect: '4:5', safeArea: '60px on every side', minText: '30px' },
  { label: 'YouTube thumbnail', name: 'YouTube thumbnail', width: 1280, height: 720, unit: 'px', aspect: '16:9', safeArea: 'Keep the bottom-right corner free (timestamp)', minText: '60px — must read at phone size' },
  { label: '16:9 slide', name: '16:9 slide', width: 1920, height: 1080, unit: 'px', aspect: '16:9', safeArea: '80px margins', minText: '24px' },
  { label: 'A4 portrait', name: 'A4 one-pager', width: 210, height: 297, unit: 'mm', aspect: '1:1.414', safeArea: '15 mm margins, 3 mm bleed', minText: '8 pt', resolution: '300 dpi' },
];

/** "4:5" from 1080 × 1350. */
export function aspectOf(w?: number, h?: number): string {
  if (!w || !h || w <= 0 || h <= 0) return '';
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
  const g = gcd(Math.round(w), Math.round(h));
  const a = Math.round(w) / g;
  const b = Math.round(h) / g;
  if (a > 50 || b > 50) return `${(w / h).toFixed(2)}:1`;
  return `${a}:${b}`;
}
