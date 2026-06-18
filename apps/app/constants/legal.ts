import type { Href } from 'expo-router';

export type LegalDocumentId = 'terms' | 'privacy' | 'refund' | 'safety' | 'contact';

export type LegalSection = {
  body: string[];
  heading: string;
};

export type LegalDocument = {
  contactEmail: string;
  id: LegalDocumentId;
  intro: string;
  lastUpdated: string;
  route: Href;
  sections: LegalSection[];
  shortTitle: string;
  title: string;
};

export const LEGAL_CONTACT_EMAIL = 'admin@aiappsbox.com';
export const LEGAL_LAST_UPDATED = 'June 18, 2026';

export const LEGAL_DOCUMENTS: Record<LegalDocumentId, LegalDocument> = {
  terms: {
    contactEmail: LEGAL_CONTACT_EMAIL,
    id: 'terms',
    intro:
      'These Terms describe the basic rules for using CharaPal, including accounts, AI companions, credits, subscriptions, and acceptable use.',
    lastUpdated: LEGAL_LAST_UPDATED,
    route: '/terms' as Href,
    shortTitle: 'Terms',
    title: 'Terms of Service',
    sections: [
      {
        heading: '1. Accounts',
        body: [
          'You are responsible for the email address, login method, and activity associated with your account.',
          'You must provide accurate account information and keep your access secure. If you believe your account has been used without permission, contact us promptly.',
        ],
      },
      {
        heading: '2. AI companions and generated content',
        body: [
          'CharaPal provides AI-generated conversations, images, voices, scenes, stories, and related interactive content. AI companions are fictional and are not real people.',
          'Generated content may be inaccurate, unexpected, incomplete, or inappropriate. You should not rely on CharaPal for medical, legal, financial, emergency, or other professional advice.',
        ],
      },
      {
        heading: '3. Credits, subscriptions, and usage',
        body: [
          'Certain features use credits, including chat replies, image generation, and voice generation. The app may show the current credit cost before or near the feature that uses credits.',
          'Subscriptions and one-time credit purchases are processed through our payment provider. Subscription benefits, credit grants, and feature limits may change as the product evolves.',
        ],
      },
      {
        heading: '4. User content and acceptable use',
        body: [
          'You are responsible for prompts, uploads, custom companions, stories, profile images, and other content you provide.',
          'You may not use CharaPal to create, request, upload, or distribute illegal content, sexual content involving minors, non-consensual sexual content, harassment, threats, abuse, self-harm encouragement, or content that violates another person\'s rights.',
        ],
      },
      {
        heading: '5. Service changes and availability',
        body: [
          'CharaPal is an evolving product. We may update, limit, suspend, or remove features, models, content, pricing, or availability.',
          'We try to keep the service reliable, but we do not guarantee uninterrupted access, exact model behavior, or permanent availability of any generated output.',
        ],
      },
      {
        heading: '6. Contact',
        body: [
          `For questions about these Terms, account access, billing, or product support, contact ${LEGAL_CONTACT_EMAIL}.`,
        ],
      },
    ],
  },
  privacy: {
    contactEmail: LEGAL_CONTACT_EMAIL,
    id: 'privacy',
    intro:
      'This Privacy Policy explains what information CharaPal handles, why it is used, and how to contact us about privacy or account requests.',
    lastUpdated: LEGAL_LAST_UPDATED,
    route: '/privacy' as Href,
    shortTitle: 'Privacy',
    title: 'Privacy Policy',
    sections: [
      {
        heading: '1. Information we collect',
        body: [
          'We may collect account information such as email address, login provider, subscription status, credit balance, preferences, and product settings.',
          'We also process content you create or submit, including chat messages, companion profiles, personas, scenes, story text, uploaded images, generated images, and voice settings.',
        ],
      },
      {
        heading: '2. How we use information',
        body: [
          'We use information to provide the product, run AI features, remember your settings, manage credits and subscriptions, improve reliability, prevent abuse, and respond to support requests.',
          'Chat, image, and story content may be sent to service providers that help generate AI responses, images, voices, or other requested outputs.',
        ],
      },
      {
        heading: '3. Payments and third-party services',
        body: [
          'Payments are handled by Stripe or another payment provider. CharaPal does not need to store your full payment card details.',
          'We may use infrastructure, email, analytics, storage, AI model, and image generation providers to operate the service. These providers process data only as needed to provide their services to us.',
        ],
      },
      {
        heading: '4. Data retention and deletion',
        body: [
          'We keep account and product data for as long as needed to provide CharaPal, comply with obligations, resolve disputes, prevent abuse, and maintain records.',
          `To request account deletion, data access, or privacy support, contact ${LEGAL_CONTACT_EMAIL} from the email address associated with your account.`,
        ],
      },
      {
        heading: '5. Minors',
        body: [
          'CharaPal is not intended for children. Do not use the product if you are not old enough to consent to these terms under the laws that apply to you.',
          'We prohibit sexual or exploitative content involving minors, including fictional, generated, or role-play content.',
        ],
      },
      {
        heading: '6. Contact',
        body: [
          `For privacy questions, requests, or concerns, contact ${LEGAL_CONTACT_EMAIL}.`,
        ],
      },
    ],
  },
  refund: {
    contactEmail: LEGAL_CONTACT_EMAIL,
    id: 'refund',
    intro:
      'This Refund Policy explains how subscriptions, credit purchases, consumed credits, and billing issues are handled.',
    lastUpdated: LEGAL_LAST_UPDATED,
    route: '/refund' as Href,
    shortTitle: 'Refund',
    title: 'Refund Policy',
    sections: [
      {
        heading: '1. Subscriptions',
        body: [
          'Subscriptions renew automatically unless canceled before the next billing date. You can manage or cancel a subscription through the billing portal when available in your account.',
          'Canceling a subscription stops future renewals. It does not automatically refund the current billing period unless required by applicable law or approved by support.',
        ],
      },
      {
        heading: '2. Credit purchases',
        body: [
          'One-time credit purchases add credits to your account for eligible product features such as chat, image generation, and voice generation.',
          'Purchased credits may be subject to feature limits, model availability, abuse prevention, and service changes described in the Terms.',
        ],
      },
      {
        heading: '3. Consumed credits',
        body: [
          'Credits that have already been consumed by successful chat replies, image jobs, voice jobs, story invites, or other completed product actions are generally not refundable.',
          'If a provider failure or product error charged credits without delivering the requested result, contact us and include the account email, approximate time, and feature used.',
        ],
      },
      {
        heading: '4. Duplicate or accidental charges',
        body: [
          'If you believe you were charged twice, charged incorrectly, or billed after cancellation, contact us as soon as possible.',
          'We may review account records, payment provider records, credit ledger entries, and product logs to determine whether a correction is appropriate.',
        ],
      },
      {
        heading: '5. Contact',
        body: [
          `For billing or refund questions, contact ${LEGAL_CONTACT_EMAIL}.`,
        ],
      },
    ],
  },
  safety: {
    contactEmail: LEGAL_CONTACT_EMAIL,
    id: 'safety',
    intro:
      'These Safety Rules explain the boundaries for using CharaPal and how to report harmful, illegal, or unsafe content.',
    lastUpdated: LEGAL_LAST_UPDATED,
    route: '/safety' as Href,
    shortTitle: 'Safety',
    title: 'Safety and Content Rules',
    sections: [
      {
        heading: '1. Fictional AI interactions',
        body: [
          'CharaPal companions are AI-generated fictional characters. They are not real people, licensed professionals, emergency services, or a substitute for real-world support.',
          'If you may be in danger, need medical help, or are considering self-harm, contact local emergency services or a qualified crisis resource immediately.',
        ],
      },
      {
        heading: '2. Prohibited content',
        body: [
          'You may not request, create, upload, or distribute illegal sexual content, sexual content involving minors, non-consensual sexual content, threats, harassment, hate, exploitation, or instructions for wrongdoing.',
          'You may not use CharaPal to impersonate others without permission, violate privacy rights, evade safety systems, or abuse the service.',
        ],
      },
      {
        heading: '3. Image, voice, and story generation',
        body: [
          'Generated images, voices, and stories must follow the same safety rules as chat content.',
          'Uploads must be content you have the right to use. Do not upload private, intimate, or identifying images of another person without permission.',
        ],
      },
      {
        heading: '4. Safety reviews and enforcement',
        body: [
          'We may limit, block, remove, or refuse content or accounts that appear to violate these rules or create risk for users, other people, or the service.',
          'Safety systems can make mistakes. If you believe something was blocked or handled incorrectly, contact us with relevant details.',
        ],
      },
      {
        heading: '5. Contact',
        body: [
          `To report safety issues, content concerns, or account abuse, contact ${LEGAL_CONTACT_EMAIL}.`,
        ],
      },
    ],
  },
  contact: {
    contactEmail: LEGAL_CONTACT_EMAIL,
    id: 'contact',
    intro:
      'Use this page to find the right contact path for account, billing, privacy, safety, and general product support.',
    lastUpdated: LEGAL_LAST_UPDATED,
    route: '/contact' as Href,
    shortTitle: 'Contact',
    title: 'Contact and Support',
    sections: [
      {
        heading: '1. General support',
        body: [
          `For general product questions, bug reports, or account help, email ${LEGAL_CONTACT_EMAIL}.`,
          'Include the email address on your CharaPal account, the feature involved, and a short description of what happened.',
        ],
      },
      {
        heading: '2. Billing and refunds',
        body: [
          `For subscription, credits, duplicate charge, or refund questions, email ${LEGAL_CONTACT_EMAIL}.`,
          'Please include the approximate purchase time, amount, and whether the issue relates to a subscription or a credit package.',
        ],
      },
      {
        heading: '3. Privacy and account requests',
        body: [
          `For data access, deletion, correction, or privacy questions, email ${LEGAL_CONTACT_EMAIL} from the email address linked to your account.`,
          'We may need to verify account ownership before making account or data changes.',
        ],
      },
      {
        heading: '4. Safety reports',
        body: [
          `For safety concerns, harmful content, content involving minors, abuse, or urgent moderation issues, email ${LEGAL_CONTACT_EMAIL}.`,
          'If there is an immediate danger or emergency, contact local emergency services first.',
        ],
      },
    ],
  },
};

export const LEGAL_DOCUMENT_ORDER: LegalDocumentId[] = ['terms', 'privacy', 'refund', 'safety', 'contact'];
