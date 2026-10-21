/* Brand Kit & Assets: section definitions and small pure helpers (shared by the screen and print). */
import { FileText, Film, Images, LayoutTemplate, Link2, Music, Palette, Shapes, Type, type LucideIcon } from 'lucide-react';
import type { AssetKind, BrandAsset } from '@/spaces/types';

export type SectionId = 'logos' | 'colors' | 'fonts' | 'images' | 'templates' | 'video' | 'audio' | 'links';

export interface SectionDef {
  id: SectionId;
  title: string;
  kinds: AssetKind[];
  /** kind of new items added from the section */
  addKind: AssetKind;
  icon: LucideIcon;
  hint: string;
  addLabel: string;
}

export const SECTIONS: SectionDef[] = [
  { id: 'logos', title: 'Logos', kinds: ['logo'], addKind: 'logo', icon: Shapes, hint: 'Primary, secondary, icon / avatar, watermark', addLabel: 'Add logo' },
  { id: 'colors', title: 'Colours', kinds: ['color'], addKind: 'color', icon: Palette, hint: 'Click a swatch to copy its hex', addLabel: 'Add colour' },
  { id: 'fonts', title: 'Fonts', kinds: ['font'], addKind: 'font', icon: Type, hint: 'Typefaces and where to use them', addLabel: 'Add font' },
  { id: 'images', title: 'Images & references', kinds: ['image'], addKind: 'image', icon: Images, hint: 'Mood, look references, stills, portraits', addLabel: 'Add images' },
  { id: 'templates', title: 'Templates', kinds: ['template'], addKind: 'template', icon: LayoutTemplate, hint: 'Thumbnail, carousel and caption templates', addLabel: 'Add template' },
  { id: 'video', title: 'Video / footage', kinds: ['video'], addKind: 'video', icon: Film, hint: 'Intros, stingers, b-roll libraries, trailers', addLabel: 'Add video' },
  { id: 'audio', title: 'Music / sound', kinds: ['audio'], addKind: 'audio', icon: Music, hint: 'Theme music, licensed tracks, sound logos', addLabel: 'Add audio' },
  { id: 'links', title: 'Links & documents', kinds: ['link', 'doc', 'resource', 'other'], addKind: 'link', icon: Link2, hint: 'Guidelines, shared drives and every campaign’s downloadable resources', addLabel: 'Add link' },
];

export const SECTION_OF_KIND: Record<AssetKind, SectionId> = Object.fromEntries(SECTIONS.flatMap((s) => s.kinds.map((k) => [k, s.id]))) as Record<AssetKind, SectionId>;

export const KIND_ICON: Partial<Record<AssetKind, LucideIcon>> = { doc: FileText };

export const DEFAULT_NAMES: Record<AssetKind, string> = {
  logo: 'Logo',
  image: '',
  color: 'New colour',
  font: 'Headlines',
  template: 'New template',
  video: 'New video',
  audio: 'New track',
  link: 'New link',
  doc: 'New document',
  resource: 'New resource',
  other: 'New asset',
};

/** '#abc' / 'abc' / '#AABBCC' → '#aabbcc' (null when not a hex colour). */
export function normalizeHex(v: string | undefined | null): string | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((v ?? '').trim());
  if (!m) return null;
  let h = m[1].toLowerCase();
  if (h.length === 3)
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  return `#${h}`;
}

export function hexToRgb(hex: string): [number, number, number] | null {
  const h = normalizeHex(hex);
  if (!h) return null;
  return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

/** Black or white text for a background colour. */
export function inkOn(hex: string | undefined): string {
  const rgb = hexToRgb(hex ?? '');
  if (!rgb) return '#141418';
  const [r, g, b] = rgb.map((c) => c / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45 ? '#141418' : '#ffffff';
}

/** Lines of the key messages field without bullets / numbering. */
export function keyMessageLines(text: string | undefined): string[] {
  return (text ?? '')
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-*•–]|\d+[.)])\s*/, '').trim())
    .filter(Boolean);
}

export function assetsOfSection(assets: BrandAsset[], id: SectionId): BrandAsset[] {
  const kinds = SECTIONS.find((s) => s.id === id)?.kinds ?? [];
  return assets.filter((a) => kinds.includes(a.kind) || (id === 'links' && !SECTION_OF_KIND[a.kind]));
}

/** Font family as a CSS font-family value (quoted) with a fallback. */
export function fontStack(family: string | undefined, fallback = 'sans-serif'): string {
  const f = (family ?? '').trim().replace(/["\\]/g, '');
  return f ? `"${f}", ${fallback}` : fallback;
}

