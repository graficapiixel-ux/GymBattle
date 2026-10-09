/** Mapas da arena. Coordenadas do mundo: x para a direita, y para BAIXO. */
export interface Platform {
  x: number;
  y: number;
  w: number;
  /** Plataforma fina: dá para atravessar por baixo e descer (baixo + pulo). */
  thin: boolean;
}

export interface MapDef {
  id: string;
  name: string;
  width: number;
  height: number;
  platforms: Platform[];
  spawns: [number, number][];
  blast: { left: number; right: number; top: number; bottom: number };
  theme: {
    skyTop: string;
    skyBottom: string;
    far: string;
    near: string;
    platform: string;
    platformTop: string;
    accent: string;
    ambient: 'dust' | 'embers' | 'leaves' | 'motes';
  };
}

const W = 1200;
const H = 720;
const BLAST = { left: -260, right: W + 260, top: -520, bottom: H + 240 };

export const MAPS: MapDef[] = [
  {
    id: 'academia', name: 'Academia Medieval', width: W, height: H, blast: BLAST,
    platforms: [
      { x: 170, y: 540, w: 860, thin: false },
      { x: 280, y: 400, w: 210, thin: true },
      { x: 710, y: 400, w: 210, thin: true },
      { x: 495, y: 275, w: 210, thin: true },
    ],
    spawns: [[360, 540], [840, 540]],
    theme: { skyTop: '#1b1410', skyBottom: '#3a2616', far: '#2a1d12', near: '#3f2a18', platform: '#4a3322', platformTop: '#8a6a3a', accent: '#f5b544', ambient: 'dust' },
  },
  {
    id: 'castelo', name: 'Castelo em Ruínas', width: W, height: H, blast: BLAST,
    platforms: [
      { x: 140, y: 550, w: 420, thin: false },
      { x: 640, y: 550, w: 420, thin: false },
      { x: 230, y: 415, w: 180, thin: true },
      { x: 790, y: 415, w: 180, thin: true },
      { x: 480, y: 300, w: 240, thin: true },
    ],
    spawns: [[330, 550], [870, 550]],
    theme: { skyTop: '#0e1424', skyBottom: '#2a3350', far: '#1a2036', near: '#262c44', platform: '#3a3f52', platformTop: '#7a8298', accent: '#8ab4ff', ambient: 'motes' },
  },
  {
    id: 'templo', name: 'Templo do Sol', width: W, height: H, blast: BLAST,
    platforms: [
      { x: 260, y: 530, w: 680, thin: false },
      { x: 70, y: 450, w: 150, thin: false },
      { x: 980, y: 450, w: 150, thin: false },
      { x: 500, y: 350, w: 200, thin: true },
      { x: 300, y: 250, w: 140, thin: true },
      { x: 760, y: 250, w: 140, thin: true },
    ],
    spawns: [[420, 530], [780, 530]],
    theme: { skyTop: '#2a1a0a', skyBottom: '#c98a3a', far: '#6a4420', near: '#8a5a2a', platform: '#b89a6a', platformTop: '#f0dcae', accent: '#ffd86b', ambient: 'leaves' },
  },
  {
    id: 'vulcao', name: 'Vulcão Rubro', width: W, height: H, blast: BLAST,
    platforms: [
      { x: 200, y: 545, w: 800, thin: false },
      { x: 250, y: 420, w: 170, thin: true },
      { x: 780, y: 420, w: 170, thin: true },
      { x: 515, y: 320, w: 170, thin: true },
      { x: 515, y: 190, w: 170, thin: true },
    ],
    spawns: [[380, 545], [820, 545]],
    theme: { skyTop: '#160606', skyBottom: '#5a140a', far: '#2a0c08', near: '#3a100a', platform: '#2a1a16', platformTop: '#ff7a2f', accent: '#ff7a2f', ambient: 'embers' },
  },
];

export const MAPS_BY_ID: Record<string, MapDef> = Object.assign(Object.create(null), Object.fromEntries(MAPS.map((m) => [m.id, m])));
