// AudioWorklet Processor for PCM16 conversion
class PCMProcessor extends AudioWorkletProcessor {
  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (input.length > 0) {
      const channelData = input[0];
      const pcm16 = this.floatTo16BitPCM(channelData);
      this.port.postMessage(pcm16.buffer, [pcm16.buffer]);
    }
    return true;
  }
  
  floatTo16BitPCM(float32Array) {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return int16Array;
  }
}

registerProcessor('pcm-processor', PCMProcessor);
