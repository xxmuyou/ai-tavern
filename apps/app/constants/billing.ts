import type { CreditPackageId } from '@/api/types';

// Mirrors the live credits pricing in packages/api/src/credits/pricing.ts.
export const CREDIT_TASK_COST = {
  chat: 1,
  image: 40,
  voice: 3,
} as const;

export const SIGNUP_CREDIT_GRANT = 1000 as const;

export const MONTHLY_CREDIT_GRANT = {
  free: 0,
  pro: 30000,
} as const;

export const CUSTOM_COMPANION_LIMIT = {
  free: 3,
  pro: null,
} as const;

export const CREDIT_PACKAGES: {
  id: CreditPackageId;
  label: string;
  credits: number;
  price: string;
}[] = [
  { id: 'small', label: 'Small', credits: 5000, price: '$4.99' },
  { id: 'medium', label: 'Medium', credits: 15000, price: '$9.99' },
  { id: 'large', label: 'Large', credits: 40000, price: '$19.99' },
];
