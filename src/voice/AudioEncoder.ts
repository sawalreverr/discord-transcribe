export class AudioEncoder {
  static pcmToWav(pcmBuffer: Buffer, channels: number = 1): Buffer {
    if (pcmBuffer.length === 0) {
      return Buffer.alloc(0);
    }

    const downsampled = this.downsample48kTo16k(pcmBuffer);
    const normalized = this.normalizePeak(downsampled);

    const dataSize = normalized.length;
    const header = this.getWavHeader(dataSize, 16000, channels);
    return Buffer.concat([header, normalized]);
  }

  static downsample48kTo16k(buffer: Buffer): Buffer {
    const inputSamples = buffer.length / 2;
    const outputSamples = Math.floor(inputSamples / 3);
    const output = Buffer.alloc(outputSamples * 2);

    const filterTaps = 7;
    const coefficients = [0.015, 0.085, 0.235, 0.33, 0.235, 0.085, 0.015];
    const filterOffset = 3;

    for (let i = 0; i < outputSamples; i++) {
      const centerIdx = (i * 3 + filterOffset) * 2;
      if (centerIdx - (filterTaps - 1) * 2 < 0 || centerIdx + filterTaps * 2 > buffer.length) {
        const inputIdx = i * 3 * 2;
        if (inputIdx + 5 >= buffer.length) break;
        const s1 = buffer.readInt16LE(inputIdx);
        const s2 = buffer.readInt16LE(inputIdx + 2);
        const s3 = buffer.readInt16LE(inputIdx + 4);
        output.writeInt16LE(Math.round((s1 + s2 + s3) / 3), i * 2);
        continue;
      }

      let sum = 0;
      for (let t = 0; t < filterTaps; t++) {
        const sampleIdx = centerIdx - (filterOffset - t) * 2;
        const sample = buffer.readInt16LE(sampleIdx);
        sum += sample * coefficients[t];
      }

      output.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(sum))), i * 2);
    }

    return output;
  }

  static normalizePeak(buffer: Buffer): Buffer {
    let peakAmplitude = 0;
    for (let i = 0; i < buffer.length; i += 2) {
      const sample = Math.abs(buffer.readInt16LE(i));
      if (sample > peakAmplitude) {
        peakAmplitude = sample;
      }
    }

    if (peakAmplitude === 0 || peakAmplitude > 30000) {
      return buffer;
    }

    const targetPeak = 32000;
    const scale = targetPeak / peakAmplitude;
    const result = Buffer.alloc(buffer.length);

    for (let i = 0; i < buffer.length; i += 2) {
      const sample = buffer.readInt16LE(i);
      result.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(sample * scale))), i);
    }

    return result;
  }

  static getWavHeader(dataSize: number, sampleRate: number, channels: number): Buffer {
    const header = Buffer.alloc(44);
    const bitsPerSample = 16;
    const byteRate = sampleRate * channels * (bitsPerSample / 8);
    const blockAlign = channels * (bitsPerSample / 8);

    header.write('RIFF', 0);
    header.writeUInt32LE(36 + dataSize, 4);
    header.write('WAVE', 8);

    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(channels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitsPerSample, 34);

    header.write('data', 36);
    header.writeUInt32LE(dataSize, 40);

    return header;
  }
}
