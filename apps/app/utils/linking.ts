import { Linking } from 'react-native';

export function openExternalUrl(url: string): void {
  if (typeof window !== 'undefined') {
    window.location.href = url;
    return;
  }
  void Linking.openURL(url);
}
