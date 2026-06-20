import type { Href } from 'expo-router';

export type LandingVariant = 'control' | 'city' | 'creator';

export type LandingConfig = {
  eyebrow: string;
  headline: string;
  primaryCta: {
    destination: Href;
    id: string;
    label: string;
  };
  secondaryCta: {
    destination: Href;
    id: string;
    label: string;
  };
  slug: LandingVariant;
  subcopy: string;
};

export const LANDING_VARIANTS: Record<LandingVariant, LandingConfig> = {
  city: {
    eyebrow: 'A modern city of AI companions',
    headline: 'Step into a cinematic relationship life sim.',
    primaryCta: {
      destination: '/' as Href,
      id: 'explore_companions',
      label: 'Explore companions',
    },
    secondaryCta: {
      destination: '/companion-create' as Href,
      id: 'create_companion',
      label: 'Create your companion',
    },
    slug: 'city',
    subcopy:
      'Visit cafes, rooftops, bookstores, and late-night streets where fictional AI companions remember the moments you build together.',
  },
  control: {
    eyebrow: 'AI relationship life sim',
    headline: 'Meet companions who live beyond the chat box.',
    primaryCta: {
      destination: '/' as Href,
      id: 'explore_companions',
      label: 'Explore companions',
    },
    secondaryCta: {
      destination: '/companion-create' as Href,
      id: 'create_companion',
      label: 'Create your companion',
    },
    slug: 'control',
    subcopy:
      'Choose a companion, enter a scene, and let daily conversations, memories, and relationship progress shape your story.',
  },
  creator: {
    eyebrow: 'Create and revisit your story',
    headline: 'Build the companion you want to keep meeting.',
    primaryCta: {
      destination: '/' as Href,
      id: 'explore_companions',
      label: 'Explore companions',
    },
    secondaryCta: {
      destination: '/companion-create' as Href,
      id: 'create_companion',
      label: 'Create your companion',
    },
    slug: 'creator',
    subcopy:
      'Start with official characters or create your own, then return to shared scenes, relationship beats, and memories over time.',
  },
};

export const DEFAULT_LANDING_VARIANT: LandingVariant = 'control';

export function landingVariantFromParam(value: string | string[] | undefined): LandingVariant {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === 'city' || raw === 'creator' || raw === 'control') {
    return raw;
  }
  return DEFAULT_LANDING_VARIANT;
}
