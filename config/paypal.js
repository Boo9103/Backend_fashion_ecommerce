const checkoutNodeJssdk = require('@paypal/checkout-server-sdk');

const clientId = process.env.PAYPAL_CLIENT_ID;
const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
const env = (process.env.PAYPAL_ENV === 'live')
  ? new checkoutNodeJssdk.core.LiveEnvironment(clientId, clientSecret)
  : new checkoutNodeJssdk.core.SandboxEnvironment(clientId, clientSecret);

module.exports = {
  client: new checkoutNodeJssdk.core.PayPalHttpClient(env),
  sdk: checkoutNodeJssdk
};
