import { Buffer } from 'buffer';
import * as jpeg from 'jpeg-js';

export async function createPyTorchLipNetTensor(base64Frames, targetW = 128, targetH = 64) {
  const framesCount = base64Frames.length; // 75
  const channels = 3; // Red, Green, Blue
  
  // PyTorch Conv3D Shape: [Batch(1), Channels(3), Frames(75), Height(64), Width(128)]
  const tensorData = new Float32Array(1 * channels * framesCount * targetH * targetW);

  // Pre-calculate memory strides for the flat Float32Array
  const channelStride = framesCount * targetH * targetW;
  const frameStride = targetH * targetW;
  const heightStride = targetW;

  for (let f = 0; f < framesCount; f++) {
    // 1. Clean and decode the Base64 JPEG
    const cleanBase64 = base64Frames[f].replace(/^data:image\/jpeg;base64,/, "");
    const rawImageData = Buffer.from(cleanBase64, 'base64');
    const decoded = jpeg.decode(rawImageData, { useTArray: true }); 
    const origW = decoded.width;
    const origH = decoded.height;
    const data = decoded.data;

    // 2. Loop through the target grid (128x64)
    for (let y = 0; y < targetH; y++) {
      for (let x = 0; x < targetW; x++) {
        // Nearest Neighbor Pixel Mapping
        const srcX = Math.floor((x / targetW) * origW);
        const srcY = Math.floor((y / targetH) * origH);
        const srcIndex = (srcY * origW + srcX) * 4; // RGBA uses 4 bytes per pixel

        // Extract and Normalize (0.0 to 1.0)
        const r = data[srcIndex] / 255.0;
        const g = data[srcIndex + 1] / 255.0;
        const b = data[srcIndex + 2] / 255.0;

        // 3. Map to PyTorch's strict Channels-First memory layout
        const rIndex = (0 * channelStride) + (f * frameStride) + (y * heightStride) + x;
        const gIndex = (1 * channelStride) + (f * frameStride) + (y * heightStride) + x;
        const bIndex = (2 * channelStride) + (f * frameStride) + (y * heightStride) + x;

        tensorData[rIndex] = r;
        tensorData[gIndex] = g;
        tensorData[bIndex] = b;
      }
    }
  }

  return tensorData;
}