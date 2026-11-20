import type { ArtworkPixels } from './designArtworkPixels';

export interface ArtworkBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ArtworkGeometry {
  width: number;
  height: number;
  content?: ArtworkBounds;
}

export function visibleArtworkBounds(input: ArtworkPixels): ArtworkBounds | undefined {
  const { width, height, data } = input;
  let left = width,
    top = height,
    right = -1,
    bottom = -1;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      if (!data[(y * width + x) * 4 + 3]) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  return right < left
    ? undefined
    : { left, top, width: right - left + 1, height: bottom - top + 1 };
}

/** Cropping is for thumbnails only. Placement retains the original coordinate frame. */
export function trimArtworkPixels(input: ArtworkPixels): ArtworkPixels {
  const { width, height, data } = input;
  const bounds = visibleArtworkBounds(input);
  if (!bounds || (bounds.width === width && bounds.height === height)) return input;
  const { left, top, width: croppedWidth, height: croppedHeight } = bounds,
    cropped = new Uint8ClampedArray(croppedWidth * croppedHeight * 4);
  for (let y = 0; y < croppedHeight; y++) {
    const offset = ((top + y) * width + left) * 4;
    cropped.set(data.subarray(offset, offset + croppedWidth * 4), y * croppedWidth * 4);
  }
  return { width: croppedWidth, height: croppedHeight, data: cropped };
}

/** Match CSS object-fit: contain inside the saved placement frame, in centimetres. */
export function visibleArtworkSize(
  geometry: ArtworkGeometry,
  frameWidth: number,
  frameHeight: number,
) {
  if (!geometry.content || frameWidth <= 0 || frameHeight <= 0) return undefined;
  const scale = Math.min(frameWidth / geometry.width, frameHeight / geometry.height);
  return { width: geometry.content.width * scale, height: geometry.content.height * scale };
}

export function resizeArtworkFrame(
  geometry: ArtworkGeometry,
  frameWidth: number,
  frameHeight: number,
  axis: 'width' | 'height',
  requested: number,
) {
  const visible = visibleArtworkSize(geometry, frameWidth, frameHeight);
  if (!visible || !Number.isFinite(requested) || requested <= 0) return undefined;
  const factor = Math.max(
    1 / frameWidth,
    1 / frameHeight,
    Math.min(requested / visible[axis], 100 / frameWidth, 100 / frameHeight),
  );
  return { widthCm: frameWidth * factor, heightCm: frameHeight * factor };
}
