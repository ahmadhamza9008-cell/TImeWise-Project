// TimeWise — create a Paystack subscription management link.
// Secrets: PAYSTACK_SECRET_KEY. The user manages card/cancel on Paystack's
// hosted page; webhooks update the entitlement in our database.

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

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  try {
    const secretKey = Deno.env.get('PAYSTACK_SECRET_KEY');
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
      .select('provider_subscription_code, provider_email_token, status, plan')
      .eq('user_id', authData.user.id)
      .maybeSingle();
    if (lookupError) throw lookupError;

    const code = entitlement?.provider_subscription_code;
    if (!code) {
      return json({ error: 'No active Paystack subscription found yet. If you just paid, wait a moment for confirmation.' }, 404);
    }

    const response = await fetch(`https://api.paystack.co/subscription/${encodeURIComponent(code)}/manage/link`, {
      headers: { Authorization: `Bearer ${secretKey}` }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.status === false) {
      throw new Error(payload?.message || `Paystack request failed (${response.status}).`);
    }

    return json({ url: payload?.data?.link });
  } catch (error) {
    console.error('manage-paystack-subscription failed', error);
    return json({ error: (error as Error).message || 'Could not open billing portal.' }, 500);
  }
});
