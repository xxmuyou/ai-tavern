import { Asset } from 'expo-asset';
import { useEffect, useState } from 'react';
import type { ImageSourcePropType } from 'react-native';
import { Image } from 'react-native';

export const DEFAULT_IMAGE_ASPECT_RATIO = 16 / 9;

const ratioCache = new Map<string, number>();

function cacheKey(source: ImageSourcePropType | null | undefined): string | null {
  if (typeof source === 'number') {
    return `asset:${source}`;
  }
  if (source && !Array.isArray(source) && typeof source.uri === 'string' && source.uri) {
    return `uri:${source.uri}`;
  }
  return null;
}

/**
 * Resolves the natural width/height ratio of an image so containers can hug
 * the artwork instead of hard-coding an aspect ratio. Results are cached per
 * source, so the layout only shifts on the very first load of a remote image.
 */
export function useImageAspectRatio(
  source: ImageSourcePropType | null | undefined,
  fallbackRatio: number = DEFAULT_IMAGE_ASPECT_RATIO,
): { ratio: number; loaded: boolean } {
  const key = cacheKey(source);
  const cached = key ? ratioCache.get(key) : undefined;
  const [measured, setMeasured] = useState<number | undefined>(cached);

  useEffect(() => {
    if (!key || ratioCache.has(key)) {
      setMeasured(key ? ratioCache.get(key) : undefined);
      return;
    }

    let cancelled = false;
    const record = (width: number, height: number) => {
      if (!width || !height) return;
      ratioCache.set(key, width / height);
      if (!cancelled) {
        setMeasured(width / height);
      }
    };

    if (typeof source === 'number') {
      // Local require(): expo-asset reads dimensions from the metro asset
      // registry (Image.resolveAssetSource is unavailable on web).
      try {
        const asset = Asset.fromModule(source);
        if (asset.width && asset.height) {
          record(asset.width, asset.height);
        }
      } catch {
        // keep fallback ratio
      }
    } else if (source && !Array.isArray(source) && typeof source.uri === 'string' && source.uri) {
      Image.getSize(
        source.uri,
        (width, height) => record(width, height),
        () => {
          // keep fallback ratio
        },
      );
    }

    return () => {
      cancelled = true;
    };
  }, [key, source]);

  return { ratio: measured ?? fallbackRatio, loaded: measured != null };
}
