// TimeWise — initialize a Paystack transaction for the Pro plan.
// Secrets: PAYSTACK_SECRET_KEY, PAYSTACK_PLAN_CODE, SITE_URL.
// The browser only sends a Supabase JWT; no secret key is exposed to the client.

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

async function paystack(path: string, init: RequestInit, secretKey: string): Promise<any> {
  const response = await fetch(`https://api.paystack.co${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
      ...(init.headers || {})
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.status === false) {
    throw new Error(payload?.message || `Paystack request failed (${response.status}).`);
  }
  return payload;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  try {
    const secretKey = Deno.env.get('PAYSTACK_SECRET_KEY');
    const planCode = Deno.env.get('PAYSTACK_PLAN_CODE');
    if (!secretKey || !planCode) {
      return json({ error: 'Billing is not configured yet. Try again after payments are set up.' }, 503);
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
    if (!user.email) return json({ error: 'An email address is required for billing.' }, 400);

    const { data: entitlement, error: lookupError } = await supabase
      .from('subscriptions')
      .select('plan, status')
      .eq('user_id', user.id)
      .maybeSingle();
    if (lookupError) throw lookupError;

    if (entitlement?.plan === 'pro' && ['active', 'trialing', 'attention', 'non-renewing'].includes(entitlement.status)) {
      return json({ error: 'You are already on Pro. Use Manage billing to change your plan.' }, 409);
    }

    // Fetch the plan so we can send the expected amount; Paystack requires amount.
    const planPayload = await paystack(`/plan/${encodeURIComponent(planCode)}`, { method: 'GET' }, secretKey);
    const amount = Number(planPayload?.data?.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('Could not read the Paystack plan amount.');
    }

    const origin = siteUrl(request);
    const reference = `tw_${user.id.replace(/-/g, '').slice(0, 12)}_${Date.now()}`;
    const initPayload = await paystack('/transaction/initialize', {
      method: 'POST',
      body: JSON.stringify({
        email: user.email,
        amount,
        plan: planCode,
        reference,
        callback_url: `${origin}/pricing.html?checkout=success&reference=${encodeURIComponent(reference)}`,
        metadata: {
          user_id: user.id,
          app: 'timewise',
          plan: 'pro'
        }
      })
    }, secretKey);

    // Store a pending reference so the webhook can resolve the user even if
    // metadata is missing. The webhook remains the entitlement source of truth.
    const { error: upsertError } = await supabase.from('subscriptions').upsert({
      user_id: user.id,
      provider: 'paystack',
      provider_reference: reference,
      plan: entitlement?.plan === 'pro' ? 'pro' : 'free',
      status: entitlement?.status || 'inactive',
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });
    if (upsertError) throw upsertError;

    return json({
      url: initPayload?.data?.authorization_url,
      reference: initPayload?.data?.reference || reference,
      accessCode: initPayload?.data?.access_code
    });
  } catch (error) {
    console.error('initialize-paystack-payment failed', error);
    return json({ error: (error as Error).message || 'Could not start checkout.' }, 500);
  }
});
