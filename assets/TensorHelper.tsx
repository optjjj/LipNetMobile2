import { Buffer } from 'buffer';
import * as jpeg from 'jpeg-js';

// Assael et al. 2016 per-channel normalization constants, applied after /255.
// If your model was trained with dataset stats computed independently, use those instead.
const LIPNET_MEAN = [0.7136, 0.4906, 0.3283]; // R, G, B
const LIPNET_STD  = [0.1138, 0.1078, 0.0917]; // R, G, B

export async function createPyTorchLipNetTensor(
  base64Frames: string[],
  targetW = 128,
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

// tensorC is the channel we are writing to the ONNX model (0=B, 1=G, 2=R)
        for (let tensorC = 0; tensorC < 3; tensorC++) {
          
          // imageC is where we pull the data from jpeg-js (0=R, 1=G, 2=B)
          // This simple math (2 - tensorC) does the swap:
          // If tensorC is 0 (Blue), imageC becomes 2 (Blue).
          // If tensorC is 2 (Red), imageC becomes 0 (Red).
          const imageC = 2 - tensorC;

          // Pull the exact color pixel using the swapped imageC
          const top = data[i00 + imageC] * (1 - wx) + data[i01 + imageC] * wx;
          const bot = data[i10 + imageC] * (1 - wx) + data[i11 + imageC] * wx;
          const pixel = (top * (1 - wy) + bot * wy) / 255.0;
          
          // IMPORTANT: Apply the Mean/Std corresponding to that specific color
          const normalized = (pixel - LIPNET_MEAN[imageC]) / LIPNET_STD[imageC];

          // Save it to the tensor stride using tensorC
          const tIndex = (tensorC * channelStride) + (f * frameStride) + (y * heightStride) + x;
          tensorData[tIndex] = normalized;
        }
      }
    }
  }

  return tensorData;
}