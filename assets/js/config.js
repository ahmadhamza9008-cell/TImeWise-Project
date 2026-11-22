/* TimeWise configuration.
   Paste your Supabase project details below to connect the app.
   Use the publishable key (sb_publishable_...) or legacy anon key — both are safe in the browser.
   Never use a secret/service_role key here. */

window.TimeWiseConfig = {
  supabaseUrl: 'https://rntlrtuufsvtxrvbrghf.supabase.co',
  supabaseAnonKey: 'sb_publishable_CKD8Mq88x4wrgaCLaw3zfg_sZG4n-Sa',

  /* Web Push VAPID public key. Generate with `npm run vapid:keys` and paste the public key here.
     Leave blank to hide the push-notification option in Settings. */
  vapidPublicKey: 'BGzoQLVfR5VwkqkCgJEK2MRYoBfQYdCOrn_iyPMqUO2JUdtAGbfTM1nsQlYM48EMzYTj2Uf1qqLUpJm1E_IXUMs',

  /* Optional: your site's base URL (origin), e.g. http://localhost:8000 or
     https://your-site.com. Each flow appends its own page (dashboard.html,
     reset.html). Leave blank to derive it from the current page. */
  redirectUrl: '',

  /* Stripe publishable key (pk_test_... or pk_live_...). Safe in the browser.
     Leave blank to run the full local-demo experience with all limits unlocked.
     Secret key, price ID and webhook secret belong ONLY in Supabase secrets. */
  stripePublishableKey: ''
};
