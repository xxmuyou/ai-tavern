import type { BillingEnv, BillingTier } from "../billing/types";

export type CreditLedgerType =
  | "grant_monthly"
  | "purchase"
  | "reserve"
  | "commit"
  | "release"
  | "refund"
  | "expire"
  | "adjustment";

export type CreditTaskType =
  | "chat_message"
  | "image_generation"
  | "voice_generation"
  | "signal_extract"
  | "summary"
  | "admin_prewarm";

export type CreditPackageId = "small" | "medium" | "large";

export type CreditsEnv = BillingEnv & {
  STRIPE_PRICE_CREDITS_SMALL?: string;
  STRIPE_PRICE_CREDITS_MEDIUM?: string;
  STRIPE_PRICE_CREDITS_LARGE?: string;
  STRIPE_CREDITS_SUCCESS_URL?: string;
  STRIPE_CREDITS_CANCEL_URL?: string;
};

export type CreditAccountRow = {
  user_id: string;
  available_credits: number;
  reserved_credits: number;
  updated_at: number;
};

export type CreditLedgerRow = {
  id: string;
  user_id: string;
  type: CreditLedgerType;
  amount: number;
  balance_after: number | null;
  reserved_after: number | null;
  task_type: string | null;
  reference_type: string | null;
  reference_id: string | null;
  stripe_session_id: string | null;
  stripe_payment_id: string | null;
  expires_at: number | null;
  metadata: string | null;
  created_at: number;
};

export type CreditActivityType =
  | "spent"
  | "released"
  | "pending"
  | "credit_purchase"
  | "monthly_credits"
  | "signup_credits"
  | "refund"
  | "adjustment"
  | "expired";

export type CreditActivityEntry = {
  id: string;
  type: CreditActivityType;
  title: string;
  amount: number;
  created_at: number;
  task_type: string | null;
};

export type CreditBalance = {
  available_credits: number;
  reserved_credits: number;
};

export type ReserveResult = {
  reservation_id: string;
  available_credits: number;
  reserved_credits: number;
};

export type MonthlyGrantDto = {
  tier: BillingTier;
  period: string;
  amount: number;
  granted: boolean;
};

/** Thrown by credits helpers; carries the HTTP status the endpoint layer should surface. */
export class CreditsError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number, message?: string) {
    super(message ?? code);
    this.name = "CreditsError";
    this.code = code;
    this.status = status;
  }
}
