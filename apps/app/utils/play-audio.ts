import { createAudioPlayer, type AudioPlayer } from 'expo-audio';

// One voice clip plays at a time. Starting a new one stops the previous.
let current: AudioPlayer | null = null;

export function playAudioUrl(url: string): void {
  stopAudio();
  const player = createAudioPlayer({ uri: url });
  current = player;
  player.play();
}

export function stopAudio(): void {
  if (current) {
    try {
      current.remove();
    } catch {
      // player may already be released
    }
    current = null;
  }
}
