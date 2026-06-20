import type { Href } from 'expo-router';

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
  subcopy: string;
};

export const LANDING_CONFIG: LandingConfig = {
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
  subcopy:
    'Choose a companion, enter a scene, and let daily conversations, memories, and relationship progress shape your story.',
};
