import * as THREE from 'three';

export const ATLAS_SLOTS = 8;
const W = 2048;
const SLOT_H = 512;
/** Each slot is drawn as if it were a 2048x1024 equirectangular map, squashed to half height. */
const VIRTUAL_H = 1024;
/** Rows near the equator, where an equirectangular map is least stretched. */
const ROWS = [0.5, 0.39, 0.61, 0.29, 0.71, 0.2, 0.8];

/**
 * One canvas texture holding the keyword maps of a whole section group (the section and up
 * to seven sub-topics), so a single shader can wrap each blob's words around its surface.
 * Slot i covers v in [1 - (i + 1) / 8, 1 - i / 8].
 */
export class KeywordAtlas {
  readonly texture: THREE.CanvasTexture;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly drawn: string[] = [];

  constructor() {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = SLOT_H * ATLAS_SLOTS;
    this.ctx = canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 8;
    this.texture.wrapS = THREE.RepeatWrapping;
  }

  drawSlot(slot: number, keywords: string[], isRoot: boolean): void {
    const key = `${isRoot}|${keywords.join('\u0001')}`;
    if (this.drawn[slot] === key) return;
    this.drawn[slot] = key;
    const ctx = this.ctx;
    ctx.save();
    ctx.clearRect(0, slot * SLOT_H, W, SLOT_H);
    ctx.beginPath();
    ctx.rect(0, slot * SLOT_H, W, SLOT_H);
    ctx.clip();
    ctx.translate(0, slot * SLOT_H);
    ctx.scale(1, SLOT_H / VIRTUAL_H);

    if (keywords.length) {
      const size = Math.round((isRoot ? 92 : 120) * Math.max(0.55, Math.min(1, 6 / Math.max(6, keywords.length))));
      ctx.font = `600 ${size}px Inter, system-ui, sans-serif`;
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      const gap = size * 0.9;
      let row = 0;
      let x = gap / 2;
      for (const word of keywords) {
        const width = ctx.measureText(word).width;
        if (x + width > W - gap / 2 && x > gap) {
          row++;
          if (row >= ROWS.length) break;
          x = gap / 2 + ((row * 397) % 600);
        }
        const y = ROWS[row] * VIRTUAL_H;
        ctx.fillText(word, x, y);
        if (x + width > W) ctx.fillText(word, x - W, y);
        x += width + gap;
      }
    }
    ctx.restore();
    this.texture.needsUpdate = true;
  }

  clearFrom(slot: number): void {
    for (let i = slot; i < ATLAS_SLOTS; i++) if (this.drawn[i]) this.drawSlot(i, [], false);
  }

  dispose(): void {
    this.texture.dispose();
  }
}
