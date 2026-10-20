/** Passed to every module's seedSample(): lets seeders store images in the sample project. */
export interface SampleContext {
  /** store raw bytes (png/jpg/svg...) as a project asset; returns the asset name */
  addAsset(bytes: Uint8Array, ext: string): Promise<string>;
  /** store an SVG string as an asset; returns the asset name */
  addSvg(svg: string): Promise<string>;
}

/** Fixed scene ids of the sample screenplay. */
export const SAMPLE_SCENES = {
  roof1: 'sc_sample_roof1',
  stairs: 'sc_sample_stairs',
  roof2: 'sc_sample_roof2',
  edit: 'sc_sample_edit',
} as const;

/** Fixed element ids used by tags in the sample screenplay. */
export const SAMPLE_ELEMENTS = {
  camera: 'el_sample_camera',
  walkie: 'el_sample_walkie',
  coat: 'el_sample_coat',
  script: 'el_sample_script',
  crackle: 'el_sample_crackle',
  monitors: 'el_sample_monitors',
  wind: 'el_sample_wind',
} as const;

