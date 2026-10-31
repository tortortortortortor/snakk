import { describe, expect, it } from 'vitest';
import { concatFloat32, encodeWav, rms } from './wav';

describe('wav', () => {
  it('writes a valid 16 kHz mono PCM header and clamps samples', () => {
    const buf = encodeWav(new Float32Array([0, 1, -1, 2]), 16000);
    const v = new DataView(buf);
    expect(String.fromCharCode(...new Uint8Array(buf, 0, 4))).toBe('RIFF');
    expect(v.getUint32(24, true)).toBe(16000);
    expect(v.getUint16(22, true)).toBe(1);
    expect(v.getUint32(40, true)).toBe(8);
    expect(v.getInt16(46, true)).toBe(32767);
    expect(v.getInt16(48, true)).toBe(-32768);
    expect(v.getInt16(50, true)).toBe(32767);
  });
  it('concatenates frames and computes rms', () => {
    expect(Array.from(concatFloat32([new Float32Array([1]), new Float32Array([2, 3])]))).toEqual([1, 2, 3]);
    expect(rms(new Float32Array([0.5, -0.5]))).toBeCloseTo(0.5);
  });
});
