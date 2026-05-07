# InkVoice Xfyun TTS Proxy

Cloudflare Worker that keeps Xfyun TTS credentials off the mobile client.

## Configure Secrets

```bash
cd workers/xfyun-tts-proxy
npx wrangler secret put XFYUN_APP_ID
npx wrangler secret put XFYUN_API_KEY
npx wrangler secret put XFYUN_API_SECRET
npx wrangler secret put APP_PROXY_TOKEN
```

For local development, put the same names in `.dev.vars`. Do not commit that file.

## Run And Deploy

```bash
npx wrangler dev
npx wrangler deploy
```

Set the mobile app environment variables after deploy:

```bash
EXPO_PUBLIC_XFYUN_PROXY_URL=https://<worker-host>
EXPO_PUBLIC_XFYUN_PROXY_TOKEN=<APP_PROXY_TOKEN>
```

The token is only a lightweight app gate because mobile clients can be inspected. Use Cloudflare rate limiting and a server-issued short-lived token if this endpoint needs stronger abuse protection.
