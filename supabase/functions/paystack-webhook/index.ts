// TimeWise — Paystack webhook. Verifies x-paystack-signature and is the ONLY
// writer of subscription entitlements. config.toml must set verify_jwt = false.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function constantTimeEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verifyPaystackSignature(rawBody: string, signature: string | null, secretKey: string): Promise<boolean> {
  if (!signature || !/^[0-9a-f]{128}$/i.test(signature)) return false;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secretKey), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']);
  const digest = await crypto.subtle.sign('HMAC', key, encoder.encode(rawBody));
  const expected = toHex(new Uint8Array(digest));
  return constantTimeEqual(expected, signature.toLowerCase());
}

function normalizeStatus(status: string | null | undefined): string {
  const value = String(status || '').toLowerCase();
  if (['active', 'attention', 'non-renewing', 'completed', 'cancelled', 'canceled'].includes(value)) {
    return value === 'canceled' ? 'cancelled' : value;
  }
  return 'inactive';
}

function isPro(status: string): boolean {
  return ['active', 'attention', 'non-renewing'].includes(status);
}

function eventKey(event: any, rawBody: string): string {
  const type = String(event?.event || 'unknown');
  const data = event?.data || {};
  const id = data.id || data.subscription_code || data.reference || data.invoice_code || '';
  if (id) return `paystack:${type}:${id}`;
  // Fallback: stable hash-like key from body.
  let hash = 0;
  for (let i = 0; i < rawBody.length; i++) hash = ((hash << 5) - hash) + rawBody.charCodeAt(i) | 0;
  return `paystack:${type}:${hash}`;
}

async function findUserId(supabase: any, event: any): Promise<string> {
  const data = event?.data || {};
  const metaUser = data?.metadata?.user_id || data?.metadata?.userId || data?.plan?.metadata?.user_id || '';
  if (metaUser) return String(metaUser);

  const reference = data?.reference || data?.metadata?.reference || '';
  if (reference) {
    const { data: byRef } = await supabase.from('subscriptions').select('user_id').eq('provider_reference', reference).maybeSingle();
    if (byRef?.user_id) return String(byRef.user_id);
  }

  const subCode = data?.subscription_code || data?.subscription?.subscription_code || data?.subscription?.code || '';
  if (subCode) {
    const { data: bySub } = await supabase.from('subscriptions').select('user_id').eq('provider_subscription_code', subCode).maybeSingle();
    if (bySub?.user_id) return String(bySub.user_id);
  }

  const customerCode = data?.customer?.customer_code || data?.customer?.id || '';
  if (customerCode) {
    const { data: byCustomer } = await supabase.from('subscriptions').select('user_id').eq('provider_customer_code', String(customerCode)).maybeSingle();
    if (byCustomer?.user_id) return String(byCustomer.user_id);
  }

  return '';
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  const secretKey = Deno.env.get('PAYSTACK_SECRET_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!secretKey || !serviceKey) return json({ error: 'Billing is not configured.' }, 503);

  const rawBody = await request.text();
  const signature = request.headers.get('x-paystack-signature');
  if (!(await verifyPaystackSignature(rawBody, signature, secretKey))) {
    return json({ error: 'Invalid Paystack signature.' }, 401);
  }

  let event: any;
  try { event = JSON.parse(rawBody); } catch (_) { return json({ error: 'Invalid JSON payload.' }, 400); }
  const type = String(event?.event || '');
  if (!type) return json({ error: 'Missing event type.' }, 400);

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const id = eventKey(event, rawBody);
  const { error: recordError } = await supabase.from('stripe_webhook_events').insert({ event_id: id, event_type: type });
  if (recordError) {
    if (recordError.code === '23505') return json({ received: true, duplicate: true });
    console.error('Could not record webhook event', recordError);
    return json({ error: 'Could not record event.' }, 500);
  }

  try {
    const data = event.data || {};
    const userId = await findUserId(supabase, event);
    if (!userId) {
      console.warn('Paystack event without known TimeWise user', type, id);
      return json({ received: true, ignored: true });
    }

    // Load existing row to preserve fields not present in this event.
    const { data: existing } = await supabase.from('subscriptions').select('*').eq('user_id', userId).maybeSingle();

    const next: any = {
      user_id: userId,
      provider: 'paystack',
      updated_at: new Date().toISOString()
    };

    const sub = data.subscription || data;
    const subCode = data.subscription_code || sub.subscription_code || sub.code || existing?.provider_subscription_code || null;
    const emailToken = data.email_token || sub.email_token || existing?.provider_email_token || null;
    const customerCode = data.customer?.customer_code || data.customer_code || existing?.provider_customer_code || null;
    const reference = data.reference || existing?.provider_reference || null;

    if (customerCode) next.provider_customer_code = String(customerCode);
    if (subCode) next.provider_subscription_code = String(subCode);
    if (emailToken) next.provider_email_token = String(emailToken);
    if (reference) next.provider_reference = String(reference);

    if (type === 'subscription.create' || type === 'subscription.disable' || type === 'subscription.not_renew') {
      const status = normalizeStatus(sub.status || (type === 'subscription.disable' ? 'completed' : type === 'subscription.not_renew' ? 'non-renewing' : 'active'));
      next.status = status;
      next.plan = isPro(status) ? 'pro' : 'free';
      next.cancel_at_period_end = status === 'non-renewing';
      if (data.next_payment_date || sub.next_payment_date) {
        const dt = new Date(data.next_payment_date || sub.next_payment_date);
        if (!Number.isNaN(dt.getTime())) next.current_period_end = dt.toISOString();
      }
      if (status === 'completed' || status === 'cancelled') {
        next.cancel_at_period_end = false;
      }
    } else if (type === 'charge.success') {
      // For plan-based subscriptions, charge.success confirms payment. If this
      // is a subscription charge, mark pro/active; webhook subscription events
      // will refine details.
      const planCode = data.plan?.plan_code || data.plan_object?.plan_code || data.plan || null;
      const looksLikeSub = Boolean(planCode || data.subscription || subCode);
      if (looksLikeSub) {
        next.status = 'active';
        next.plan = 'pro';
        next.cancel_at_period_end = false;
        if (data.paid_at) {
          // rough period end unknown here; keep existing if present.
        }
      } else {
        return json({ received: true, ignored: true });
      }
    } else if (type === 'invoice.payment_failed') {
      next.status = 'attention';
      next.plan = 'pro';
    } else if (type === 'invoice.update' || type === 'invoice.create') {
      // Informational; don't downgrade an active pro on invoice.create.
      return json({ received: true, ignored: true });
    } else {
      return json({ received: true, ignored: true });
    }

    const { error: upsertError } = await supabase.from('subscriptions').upsert(next, { onConflict: 'user_id' });
    if (upsertError) {
      console.error('Could not save subscription entitlement', upsertError);
      return json({ error: 'Could not save entitlement.' }, 500);
    }

    return json({ received: true, plan: next.plan, status: next.status });
  } catch (error) {
    console.error('paystack-webhook failed', error);
    await supabase.from('stripe_webhook_events').delete().eq('event_id', id);
    return json({ error: (error as Error).message || 'Processing failed.' }, 500);
  }
});
