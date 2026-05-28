import { getBillingCustomer, upsertBillingCustomer } from "../billing/repository";
import { createCustomer, createStripeClient } from "../billing/stripe";
import type { UserRecord } from "../identity";
import { CREDIT_PACKAGES, isCreditPackageId } from "./pricing";
import { CreditsError, type CreditsEnv } from "./types";

export async function createCreditsCheckout(
  env: CreditsEnv,
  user: UserRecord,
  packageRaw: unknown,
): Promise<string> {
  if (!isCreditPackageId(packageRaw)) {
    throw new CreditsError("invalid_credit_package", 400);
  }
  const pkg = CREDIT_PACKAGES[packageRaw];

  const secretKey = env.STRIPE_SECRET_KEY?.trim();
  const priceId = (env[pkg.priceEnv] as string | undefined)?.trim();
  const successUrl = env.STRIPE_CREDITS_SUCCESS_URL?.trim() || env.STRIPE_SUCCESS_URL?.trim();
  const cancelUrl = env.STRIPE_CREDITS_CANCEL_URL?.trim() || env.STRIPE_CANCEL_URL?.trim();
  if (!secretKey || !priceId || !successUrl || !cancelUrl) {
    throw new CreditsError("billing_config_missing", 500);
  }

  const stripe = createStripeClient({ secretKey });
  const now = Date.now();

  try {
    let customer = await getBillingCustomer(env, user.id);
    if (!customer) {
      const stripeCustomer = await createCustomer(stripe, { email: user.email, userId: user.id });
      await upsertBillingCustomer(env, {
        email: user.email,
        livemode: Boolean(stripeCustomer.livemode),
        now,
        stripeCustomerId: stripeCustomer.id,
        userId: user.id,
      });
      customer = {
        created_at: now,
        email: user.email,
        livemode: stripeCustomer.livemode ? 1 : 0,
        stripe_customer_id: stripeCustomer.id,
        updated_at: now,
        user_id: user.id,
      };
    }

    const session = await stripe.checkout.sessions.create({
      cancel_url: cancelUrl,
      client_reference_id: user.id,
      customer: customer.stripe_customer_id,
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: {
        credit_package: packageRaw,
        credits: String(pkg.credits),
        user_id: user.id,
      },
      mode: "payment",
      success_url: successUrl,
    });

    if (!session.url) {
      throw new CreditsError("stripe_error", 502);
    }
    return session.url;
  } catch (err) {
    if (err instanceof CreditsError) throw err;
    console.error(JSON.stringify({ error: String(err), message: "Credits checkout failed" }));
    throw new CreditsError("stripe_error", 502);
  }
}
