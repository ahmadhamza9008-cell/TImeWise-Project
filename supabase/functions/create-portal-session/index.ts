// TimeWise — open the Stripe billing portal so users can change card or
// cancel their Pro subscription. Requires STRIPE_SECRET_KEY and SITE_URL.

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

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  try {
    const secretKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!secretKey) return json({ error: 'Billing is not configured yet.' }, 503);

    const jwt = (request.headers.get('Authorization') || '').match(/^Bearer\s+(.+)$/i)?.[1] || '';
    if (!jwt) return json({ error: 'Sign in to manage billing.' }, 401);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    const { data: authData, error: authError } = await supabase.auth.getUser(jwt);
    if (authError || !authData?.user) return json({ error: 'Your session expired. Sign in again.' }, 401);

    const { data: entitlement, error: lookupError } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', authData.user.id)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (!entitlement?.stripe_customer_id) {
      return json({ error: 'No billing account yet. Upgrade to Pro first.' }, 404);
    }

    const params = new URLSearchParams({
      customer: entitlement.stripe_customer_id,
      return_url: `${siteUrl(request)}/settings.html?billing=return`
    });

    const response = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error?.message || `Stripe request failed (${response.status}).`);

    return json({ url: payload.url });
  } catch (error) {
    console.error('create-portal-session failed', error);
    return json({ error: (error as Error).message || 'Could not open billing portal.' }, 500);
  }
});
