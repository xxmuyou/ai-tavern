import { createAudioPlayer, type AudioPlayer } from 'expo-audio';

// One voice clip plays at a time. Starting a new one stops the previous.
let currentNative: AudioPlayer | null = null;
let currentWeb: HTMLAudioElement | null = null;

export async function playAudioUrl(url: string): Promise<void> {
  stopAudio();

  if (typeof window !== 'undefined' && typeof Audio !== 'undefined') {
    const audio = new Audio(url);
    currentWeb = audio;
    audio.preload = 'auto';
    await audio.play();
    return;
  }

  const player = createAudioPlayer({ uri: url });
  currentNative = player;
  player.play();
}

export function stopAudio(): void {
  if (currentWeb) {
    try {
      currentWeb.pause();
      currentWeb.removeAttribute('src');
      currentWeb.load();
    } catch {
      // audio element may already be released
    }
    currentWeb = null;
  }

  if (currentNative) {
    try {
      currentNative.remove();
    } catch {
      // player may already be released
    }
    currentNative = null;
  }
}
