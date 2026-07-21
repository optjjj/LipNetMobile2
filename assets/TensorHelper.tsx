import { Buffer } from 'buffer';
import * as jpeg from 'jpeg-js';

// Assael et al. 2016 per-channel normalization constants, applied after /255.
// If your model was trained with dataset stats computed independently, use those instead.
const LIPNET_MEAN = [0.7136, 0.4906, 0.3283]; // R, G, B
const LIPNET_STD  = [0.1138, 0.1078, 0.0917]; // R, G, B

export async function createPyTorchLipNetTensor(
  base64Frames: string[],
  targetW = 128, // VERIFY against your ONNX input shape (Netron) before trusting this default
  targetH = 64
) {
  const framesCount = base64Frames.length;
  const channels = 3;
  const tensorData = new Float32Array(1 * channels * framesCount * targetH * targetW);

  const channelStride = framesCount * targetH * targetW;
  const frameStride = targetH * targetW;
  const heightStride = targetW;

  for (let f = 0; f < framesCount; f++) {
    const cleanBase64 = base64Frames[f].replace(/^data:image\/jpeg;base64,/, "");
    const decoded = jpeg.decode(Buffer.from(cleanBase64, 'base64'), { useTArray: true });
    const origW = decoded.width, origH = decoded.height, data = decoded.data;

    for (let y = 0; y < targetH; y++) {
      // Half-pixel-center bilinear mapping (matches PIL/cv2/torchvision defaults)
      const srcYf = ((y + 0.5) / targetH) * origH - 0.5;
      const y0 = Math.max(0, Math.floor(srcYf));
      const y1 = Math.min(origH - 1, y0 + 1);
      const wy = srcYf - y0;

      for (let x = 0; x < targetW; x++) {
        const srcXf = ((x + 0.5) / targetW) * origW - 0.5;
        const x0 = Math.max(0, Math.floor(srcXf));
        const x1 = Math.min(origW - 1, x0 + 1);
        const wx = srcXf - x0;

        const i00 = (y0 * origW + x0) * 4;
        const i01 = (y0 * origW + x1) * 4;
        const i10 = (y1 * origW + x0) * 4;
        const i11 = (y1 * origW + x1) * 4;

        for (let c = 0; c < 3; c++) {
          const top = data[i00 + c] * (1 - wx) + data[i01 + c] * wx;
          const bot = data[i10 + c] * (1 - wx) + data[i11 + c] * wx;
          const pixel = (top * (1 - wy) + bot * wy) / 255.0;
          const normalized = (pixel - LIPNET_MEAN[c]) / LIPNET_STD[c];

          const tIndex = (c * channelStride) + (f * frameStride) + (y * heightStride) + x;
          tensorData[tIndex] = normalized;
        }
      }
    }
  }

  return tensorData;
}