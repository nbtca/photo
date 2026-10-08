import { Buffer } from 'buffer';

// Implements the part of sharp's chain the app uses, on a canvas.
// Output is WebP, except for the small data URLs built after withMetadata(),
// which stay JPEG. Canvas output carries no EXIF.
class Pipeline {
  private width?: number;
  private height?: number;
  private quality = 0.8;
  private blurRadius = 0;
  private saturation = 1;
  private type = 'image/webp';

  constructor(private input: ArrayBuffer | Uint8Array) {}

  resize(width?: number, height?: number) {
    this.width = width;
    this.height = height;
    return this;
  }

  modulate({ saturation = 1 }: { saturation?: number }) {
    this.saturation = saturation;
    return this;
  }

  blur(radius: number) {
    this.blurRadius = radius;
    return this;
  }

  withMetadata() {
    this.type = 'image/jpeg';
    return this;
  }

  withExifMerge(_exif: object) {
    return this;
  }

  toFormat(_format: string, { quality = 80 }: { quality?: number } = {}) {
    this.quality = quality / 100;
    return this;
  }

  async toBuffer() {
    const bitmap = await createImageBitmap(new Blob([this.input as BlobPart]));
    const scale = Math.min(
      1,
      this.width ? this.width / bitmap.width : 1,
      this.height ? this.height / bitmap.height : 1,
    );
    const canvas = new OffscreenCanvas(
      Math.max(1, Math.round(bitmap.width * scale)),
      Math.max(1, Math.round(bitmap.height * scale)),
    );
    const context = canvas.getContext('2d')!;
    context.imageSmoothingQuality = 'high';
    if (this.blurRadius || this.saturation !== 1) {
      context.filter =
        `blur(${this.blurRadius}px) saturate(${this.saturation})`;
    }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const { quality } = this;
    let blob = await canvas.convertToBlob({ type: this.type, quality });
    // Safari cannot encode WebP from a canvas and returns PNG instead.
    if (blob.type !== this.type) {
      blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
    }
    return Buffer.from(await blob.arrayBuffer());
  }
}

export type Sharp = Pipeline;

const sharp = (input: ArrayBuffer | Uint8Array) => new Pipeline(input);

export default sharp;
