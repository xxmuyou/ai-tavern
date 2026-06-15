import { describe, expect, it } from "vitest";

import { ensureMonthlyGrant } from "./grants";
import {
  commitReservation,
  getCreditBalance,
  grantCredits,
  listLedger,
  recordPurchase,
  refundCredits,
  releaseReservation,
  reserveCredits,
} from "./ledger";
import { SIGNUP_GRANT, TASK_CREDIT_COST } from "./pricing";
import { createCreditsTestEnv } from "./test-fixtures";
import { CreditsError } from "./types";

const USER = "usr_1";

async function seed(env: Env, amount: number): Promise<void> {
  await grantCredits(env, {
    amount,
    now: 1000,
    referenceId: `${USER}:seed`,
    referenceType: "monthly_grant",
    userId: USER,
  });
}

describe("credits ledger", () => {
  it("reserve moves available into reserved, commit settles it", async () => {
    const env = createCreditsTestEnv();
    await seed(env, 300);

    const reservation = await reserveCredits(env, {
      amount: 100,
      referenceId: "job_1",
      referenceType: "art_job",
      taskType: "image_generation",
      userId: USER,
    });
    expect(reservation.available_credits).toBe(200);
    expect(reservation.reserved_credits).toBe(100);

    await commitReservation(env, reservation.reservation_id);
    const balance = await getCreditBalance(env, USER);
    expect(balance.available_credits).toBe(200);
    expect(balance.reserved_credits).toBe(0);
  });

  it("release returns reserved credits to available", async () => {
    const env = createCreditsTestEnv();
    await seed(env, 300);
    const reservation = await reserveCredits(env, {
      amount: 100,
      referenceId: "job_2",
      referenceType: "art_job",
      taskType: "image_generation",
      userId: USER,
    });

    await releaseReservation(env, reservation.reservation_id, "provider_failed");
    const balance = await getCreditBalance(env, USER);
    expect(balance.available_credits).toBe(300);
    expect(balance.reserved_credits).toBe(0);
  });

  it("rejects a reserve that exceeds available without mutating the account", async () => {
    const env = createCreditsTestEnv();
    await seed(env, 50);

    await expect(
      reserveCredits(env, {
        amount: 100,
        referenceId: "job_3",
        referenceType: "art_job",
        taskType: "image_generation",
        userId: USER,
      }),
    ).rejects.toMatchObject({ code: "credits_insufficient", status: 402 } satisfies Partial<CreditsError>);

    const balance = await getCreditBalance(env, USER);
    expect(balance).toEqual({ available_credits: 50, reserved_credits: 0 });
  });

  it("does not overspend across sequential reserves", async () => {
    const env = createCreditsTestEnv();
    await seed(env, 150);

    await reserveCredits(env, {
      amount: 100,
      referenceId: "job_a",
      referenceType: "art_job",
      taskType: "image_generation",
      userId: USER,
    });
    await expect(
      reserveCredits(env, {
        amount: 100,
        referenceId: "job_b",
        referenceType: "art_job",
        taskType: "image_generation",
        userId: USER,
      }),
    ).rejects.toMatchObject({ code: "credits_insufficient" });

    const balance = await getCreditBalance(env, USER);
    expect(balance.available_credits).toBe(50);
    expect(balance.reserved_credits).toBe(100);
  });

  it("reserve is idempotent on a repeated reference", async () => {
    const env = createCreditsTestEnv();
    await seed(env, 300);
    const first = await reserveCredits(env, {
      amount: 100,
      referenceId: "job_dup",
      referenceType: "art_job",
      taskType: "image_generation",
      userId: USER,
    });
    const second = await reserveCredits(env, {
      amount: 100,
      referenceId: "job_dup",
      referenceType: "art_job",
      taskType: "image_generation",
      userId: USER,
    });

    expect(second.reservation_id).toBe(first.reservation_id);
    const balance = await getCreditBalance(env, USER);
    expect(balance.available_credits).toBe(200);
    expect(balance.reserved_credits).toBe(100);
  });

  it("commit is idempotent and conflicts with a prior release", async () => {
    const env = createCreditsTestEnv();
    await seed(env, 300);
    const reservation = await reserveCredits(env, {
      amount: 100,
      referenceId: "job_4",
      referenceType: "art_job",
      taskType: "image_generation",
      userId: USER,
    });

    await commitReservation(env, reservation.reservation_id);
    await commitReservation(env, reservation.reservation_id); // no-op
    expect((await getCreditBalance(env, USER)).reserved_credits).toBe(0);

    await expect(releaseReservation(env, reservation.reservation_id, "late")).rejects.toMatchObject({
      code: "reservation_already_settled",
      status: 409,
    });
  });

  it("refund adds credits to available", async () => {
    const env = createCreditsTestEnv();
    await refundCredits(env, {
      amount: 100,
      reason: "goodwill",
      referenceId: "job_5",
      referenceType: "art_job",
      userId: USER,
    });
    expect((await getCreditBalance(env, USER)).available_credits).toBe(100);
  });

  it("free monthly grant is disabled", async () => {
    const env = createCreditsTestEnv();
    const now = Date.UTC(2026, 4, 15);
    expect(await ensureMonthlyGrant(env, USER, "free", now)).toBeNull();
    expect((await getCreditBalance(env, USER)).available_credits).toBe(0);
    expect(await listLedger(env, USER, { limit: 10 })).toEqual([]);
  });

  it("pro monthly grant is idempotent within a month", async () => {
    const env = createCreditsTestEnv();
    const now = Date.UTC(2026, 4, 15);
    await ensureMonthlyGrant(env, USER, "pro", now);
    await ensureMonthlyGrant(env, USER, "pro", now);
    expect((await getCreditBalance(env, USER)).available_credits).toBe(30000);
  });

  it("purchase credits idempotently by stripe session", async () => {
    const env = createCreditsTestEnv();
    const purchase = {
      credits: 500,
      packageId: "small",
      paymentId: "pi_1",
      sessionId: "cs_1",
      userId: USER,
    };
    expect(await recordPurchase(env, purchase)).toBe(true);
    expect(await recordPurchase(env, purchase)).toBe(false); // duplicate webhook
    expect((await getCreditBalance(env, USER)).available_credits).toBe(500);
  });

  it("rejects non-positive amounts", async () => {
    const env = createCreditsTestEnv();
    await seed(env, 100);
    for (const amount of [0, -5, 1.5]) {
      await expect(
        reserveCredits(env, {
          amount,
          referenceId: `bad_${amount}`,
          referenceType: "art_job",
          taskType: "image_generation",
          userId: USER,
        }),
      ).rejects.toMatchObject({ code: "invalid_amount", status: 400 });
    }
  });

  it("lists ledger entries newest first", async () => {
    const env = createCreditsTestEnv();
    await seed(env, 300);
    await reserveCredits(env, {
      amount: 100,
      referenceId: "job_6",
      referenceType: "art_job",
      taskType: "image_generation",
      userId: USER,
    });
    const entries = await listLedger(env, USER, { limit: 10 });
    expect(entries.length).toBe(2);
    expect(entries[0]?.type).toBe("reserve");
    expect(entries[1]?.type).toBe("grant_monthly");
  });

  it("exposes the live signup and voice pricing constants", () => {
    expect(SIGNUP_GRANT).toBe(1000);
    expect(TASK_CREDIT_COST.voice_generation).toBe(3);
  });
});
