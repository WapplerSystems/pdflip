/**
 * Page turn sound. Without a sound file the rustle of paper is synthesised with the
 * Web Audio API — filtered noise with a short swell — so no audio asset has to be shipped.
 */
export class FlipSound {
  private context: AudioContext | undefined;
  private buffer: Promise<AudioBuffer | undefined> | undefined;

  constructor(private readonly url?: string) {}

  play(duration: number): void {
    try {
      this.context ??= new AudioContext();
      if (this.context.state === 'suspended') {
        void this.context.resume();
      }
      if (this.url) {
        void this.playFile();
      } else {
        this.playNoise(Math.min(0.6, Math.max(0.25, duration / 1000)));
      }
    } catch {
      // audio is a nicety; browsers without Web Audio just stay silent
    }
  }

  private async playFile(): Promise<void> {
    const context = this.context!;
    this.buffer ??= fetch(this.url!)
      .then((response) => response.arrayBuffer())
      .then((data) => context.decodeAudioData(data))
      .catch(() => undefined);
    const buffer = await this.buffer;
    if (!buffer) return;
    const node = context.createBufferSource();
    node.buffer = buffer;
    node.connect(context.destination);
    node.start();
  }

  private playNoise(seconds: number): void {
    const context = this.context!;
    const length = Math.floor(context.sampleRate * seconds);
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    let previous = 0;
    for (let i = 0; i < length; i++) {
      // brown-ish noise sounds more like paper than white noise
      previous = (previous + (Math.random() * 2 - 1) * 0.2) * 0.96;
      data[i] = previous;
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1800, context.currentTime);
    filter.frequency.linearRampToValueAtTime(3200, context.currentTime + seconds);
    filter.Q.value = 0.7;
    const gain = context.createGain();
    const now = context.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.35, now + seconds * 0.35);
    gain.gain.exponentialRampToValueAtTime(0.001, now + seconds);
    source.connect(filter).connect(gain).connect(context.destination);
    source.start(now);
    source.stop(now + seconds);
  }

  destroy(): void {
    void this.context?.close();
    this.context = undefined;
  }
}
