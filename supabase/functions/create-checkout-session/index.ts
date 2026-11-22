// TimeWise — start a Stripe Checkout session for the Pro plan.
// Requires: STRIPE_SECRET_KEY, STRIPE_PRICE_PRO, SITE_URL (Supabase secrets).
// The browser only ever sends a JWT; no secret key is exposed to the client.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

function siteUrl(request: Request): string {
  const candidate = (Deno.env.get('SITE_URL') || request.headers.get('Origin') || '').replace(/\/+$/, '');
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error('bad protocol');
    return parsed.origin;
  } catch (_) {
    throw new Error('Billing is missing a valid SITE_URL. Set it in Supabase secrets.');
  }
}

async function stripe(path: string, params: URLSearchParams, secretKey: string): Promise<any> {
  const response = await fetch(`https://api.stripe.com${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || `Stripe request failed (${response.status}).`;
    throw new Error(message);
  }
  return payload;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  try {
    const secretKey = Deno.env.get('STRIPE_SECRET_KEY');
    const priceId = Deno.env.get('STRIPE_PRICE_PRO');
    if (!secretKey || !priceId) {
      return json({ error: 'Billing is not configured yet. Try again after the store is set up.' }, 503);
    }

    const jwt = (request.headers.get('Authorization') || '').match(/^Bearer\s+(.+)$/i)?.[1] || '';
    if (!jwt) return json({ error: 'Sign in to upgrade.' }, 401);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    const { data: authData, error: authError } = await supabase.auth.getUser(jwt);
    if (authError || !authData?.user) return json({ error: 'Your session expired. Sign in again.' }, 401);
    const user = authData.user;

    const { data: entitlement, error: lookupError } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id, plan, status')
      .eq('user_id', user.id)
      .maybeSingle();
    if (lookupError) throw lookupError;

    if (entitlement?.plan === 'pro' && ['active', 'trialing'].includes(entitlement.status)) {
      return json({ error: 'You are already on Pro. Use Manage billing to change your plan.' }, 409);
    }

    let customerId = entitlement?.stripe_customer_id || '';
    if (!customerId) {
      const customerParams = new URLSearchParams({
        description: 'TimeWise account',
        'metadata[user_id]': user.id
      });
      if (user.email) customerParams.set('email', user.email);
      const customer = await stripe('/v1/customers', customerParams, secretKey);
      customerId = customer.id;

      const { error: saveError } = await supabase.from('subscriptions').upsert({
        user_id: user.id,
        stripe_customer_id: customerId,
        plan: 'free',
        status: 'inactive',
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });
      if (saveError) throw saveError;
    }

    const origin = siteUrl(request);
    const checkoutParams = new URLSearchParams({
      mode: 'subscription',
      customer: customerId,
      'line_items[0][price]': priceId,
      'line_items[0][quantity]': '1',
      success_url: `${origin}/pricing.html?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/pricing.html?checkout=cancel`,
      client_reference_id: user.id,
      'metadata[user_id]': user.id,
      'subscription_data[metadata][user_id]': user.id,
      allow_promotion_codes: 'true'
    });

    const session = await stripe('/v1/checkout/sessions', checkoutParams, secretKey);
    return json({ url: session.url, sessionId: session.id });
  } catch (error) {
    console.error('create-checkout-session failed', error);
    return json({ error: (error as Error).message || 'Could not start checkout.' }, 500);
  }
});
