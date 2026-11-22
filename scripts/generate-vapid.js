#!/usr/bin/env node
/* Generate a VAPID key pair for Web Push.
   Put the public key in assets/js/config.js and both keys in Supabase Edge Function secrets. */

'use strict';

const webpush = require('web-push');

const keys = webpush.generateVAPIDKeys();

console.log('VAPID public key (safe for the browser — paste into config.js):');
console.log(keys.publicKey);
console.log('\nVAPID private key (SECRET — set as a Supabase Edge Function secret):');
console.log(keys.privateKey);
console.log('\nAlso set VAPID_SUBJECT, for example: mailto:you@example.com');
