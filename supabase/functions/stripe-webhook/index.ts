// TimeWise — Stripe webhook. Verifies the signature with STRIPE_WEBHOOK_SECRET
// and is the ONLY writer of subscription entitlements. config.toml must set
// verify_jwt = false for this function (Stripe cannot send a Supabase JWT).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const TOLERANCE_SECONDS = 300;

type StripeSubscription = {
  id: string;
  customer: string | { id: string };
  status: string;
  metadata?: Record<string, string>;
  items?: { data?: Array<{ price?: { id?: string } }> };
  current_period_end?: number;
  cancel_at_period_end?: boolean;
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function constantTimeEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function expectedSignature(secret: string, signedPayload: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(signedPayload));
  return toHex(new Uint8Array(signature));
}

async function verifyStripeSignature(request: Request, payload: string, secret: string): Promise<boolean> {
  const header = request.headers.get('Stripe-Signature') || '';
  const parts: Record<string, string[]> = {};
  header.split(',').forEach((piece) => {
    const [name, ...rest] = piece.trim().split('=');
    if (name && rest.length) parts[name] = (parts[name] || []).concat(rest.join('='));
  });
  const timestamp = parts.t?.[0];
  const signatures = parts.v1 || [];
  if (!timestamp || !signatures.length) return false;
  if (!/^\d+$/.test(timestamp)) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > TOLERANCE_SECONDS) return false;

  const expected = await expectedSignature(secret, `${timestamp}.${payload}`);
  return signatures.some((signature) => constantTimeEqual(signature, expected));
}

async function stripeGetSubscription(id: string, secretKey: string): Promise<StripeSubscription> {
  const response = await fetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${secretKey}` }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || `Stripe lookup failed (${response.status}).`);
  return payload as StripeSubscription;
}

function customerId(subscription: StripeSubscription): string {
  return typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id || '';
}

function planFor(subscription: StripeSubscription): 'free' | 'pro' {
  const priceId = subscription.items?.data?.[0]?.price?.id || '';
  return priceId && priceId === Deno.env.get('STRIPE_PRICE_PRO') ? 'pro' : 'free';
}

const STATUSES = ['inactive', 'incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused'];

function statusFor(subscription: StripeSubscription, eventType: string): string {
  if (eventType === 'customer.subscription.deleted') return 'canceled';
  return STATUSES.includes(subscription.status) ? subscription.status : 'inactive';
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const secretKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (!webhookSecret || !serviceKey) return json({ error: 'Billing is not configured.' }, 503);

  const payload = await request.text();
  if (!(await verifyStripeSignature(request, payload, webhookSecret))) {
    return json({ error: 'Invalid Stripe signature.' }, 400);
  }

  let event: any;
  try {
    event = JSON.parse(payload);
  } catch (_) {
    return json({ error: 'Invalid JSON payload.' }, 400);
  }
  if (!event?.id || !event?.type) return json({ error: 'Missing event fields.' }, 400);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    serviceKey,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  // Idempotency: Stripe retries events; only the first write should apply.
  const { error: recordError } = await supabase
    .from('stripe_webhook_events')
    .insert({ event_id: event.id, event_type: event.type });
  if (recordError) {
    if (recordError.code === '23505') return json({ received: true, duplicate: true });
    console.error('Could not record webhook event', recordError);
    return json({ error: 'Could not record event.' }, 500);
  }

  try {
    const object = event.data?.object || {};
    let subscription: StripeSubscription | null = null;
    let userId = '';

    if (event.type === 'checkout.session.completed') {
      if (object.mode !== 'subscription' || !object.subscription) {
        return json({ received: true, ignored: true });
      }
      userId = object.client_reference_id || object.metadata?.user_id || '';
      if (!secretKey) return json({ error: 'Stripe secret key missing.' }, 503);
      subscription = await stripeGetSubscription(String(object.subscription), secretKey);
    } else if (
      event.type === 'customer.subscription.created' ||
      event.type === 'customer.subscription.updated' ||
      event.type === 'customer.subscription.deleted'
    ) {
      subscription = object as StripeSubscription;
      userId = subscription.metadata?.user_id || '';
      if (!userId && customerId(subscription)) {
        const { data: found } = await supabase
          .from('subscriptions')
          .select('user_id')
          .eq('stripe_customer_id', customerId(subscription))
          .maybeSingle();
        userId = found?.user_id || '';
      }
    } else {
      return json({ received: true, ignored: true });
    }

    if (!subscription?.id) return json({ received: true, ignored: true });
    if (!userId) {
      console.warn('Webhook event without a known TimeWise user', event.id, event.type);
      return json({ received: true, ignored: true });
    }

    const canceled = event.type === 'customer.subscription.deleted';
    const row = {
      user_id: userId,
      stripe_customer_id: customerId(subscription) || null,
      stripe_subscription_id: canceled ? null : subscription.id,
      plan: canceled ? 'free' : planFor(subscription),
      status: statusFor(subscription, event.type),
      current_period_end: subscription.current_period_end
        ? new Date(subscription.current_period_end * 1000).toISOString()
        : null,
      cancel_at_period_end: canceled ? false : Boolean(subscription.cancel_at_period_end),
      updated_at: new Date().toISOString()
    };

    const { error: upsertError } = await supabase
      .from('subscriptions')
      .upsert(row, { onConflict: 'user_id' });
    if (upsertError) {
      console.error('Could not save subscription entitlement', upsertError);
      return json({ error: 'Could not save entitlement.' }, 500);
    }

    return json({ received: true, plan: row.plan, status: row.status });
  } catch (error) {
    console.error('stripe-webhook failed', error);
    // Release the idempotency marker so Stripe's retry can apply the event
    // once the underlying problem (e.g. a temporary DB outage) is resolved.
    await supabase.from('stripe_webhook_events').delete().eq('event_id', event.id);
    return json({ error: (error as Error).message || 'Processing failed.' }, 500);
  }
});
