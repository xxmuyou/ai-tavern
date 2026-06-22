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
  eyebrow: 'Story-driven AI character chat',
  headline: 'Meet fictional AI companions with scenes and memories.',
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
    'Choose a character, enter a roleplay scene, and let daily conversations, memories, and relationship progress shape a PG-13 story.',
};
