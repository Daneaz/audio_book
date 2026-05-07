export interface Env {
  XFYUN_APP_ID: string;
  XFYUN_API_KEY: string;
  XFYUN_API_SECRET: string;
  APP_PROXY_TOKEN: string;
}

type Synthesizer = (env: Env, text: string, voiceId: string, speed: number) => Promise<string>;

const XFYUN_HOST = 'tts-api.xfyun.cn';
const XFYUN_PATH = '/v2/tts';
const MAX_TEXT_LENGTH = 1000;

function json(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...init?.headers,
    },
  });
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function textToBase64(text: string): string {
  return bytesToBase64(new TextEncoder().encode(text));
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function mergeBase64AudioChunks(chunks: string[]): string {
  const byteChunks = chunks.map(base64ToBytes);
  const total = byteChunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of byteChunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return bytesToBase64(merged);
}

async function hmacSha256Base64(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return bytesToBase64(new Uint8Array(signature));
}

export async function buildXfyunWsUrl(env: Env, date = new Date().toUTCString()): Promise<string> {
  const signatureOrigin = `host: ${XFYUN_HOST}\ndate: ${date}\nGET ${XFYUN_PATH} HTTP/1.1`;
  const signature = await hmacSha256Base64(env.XFYUN_API_SECRET, signatureOrigin);
  const authorization = btoa(
    `api_key="${env.XFYUN_API_KEY}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`
  );

  return `wss://${XFYUN_HOST}${XFYUN_PATH}?authorization=${encodeURIComponent(authorization)}&date=${encodeURIComponent(date)}&host=${XFYUN_HOST}`;
}

export async function synthesizeWithXfyun(env: Env, text: string, voiceId: string, speed: number): Promise<string> {
  const ws = new WebSocket(await buildXfyunWsUrl(env));
  const chunks: string[] = [];

  return await new Promise<string>((resolve, reject) => {
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };

    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({
        common: { app_id: env.XFYUN_APP_ID },
        business: {
          aue: 'lame',
          auf: 'audio/L16;rate=48000',
          vcn: voiceId,
          speed,
          volume: 50,
          pitch: 50,
          bgs: 0,
          tte: 'UTF8',
        },
        data: { status: 2, text: textToBase64(text) },
      }));
    });

    ws.addEventListener('message', event => {
      try {
        const resp = JSON.parse(event.data as string);
        if (resp.code !== 0) {
          ws.close();
          settle(() => reject(new Error(`iFlyTek error ${resp.code}: ${resp.message}`)));
          return;
        }

        if (resp.data?.audio) chunks.push(resp.data.audio);
        if (resp.data?.status === 2) {
          ws.close();
          settle(() => resolve(mergeBase64AudioChunks(chunks)));
        }
      } catch (error) {
        ws.close();
        settle(() => reject(error));
      }
    });

    ws.addEventListener('error', () => {
      settle(() => reject(new Error('iFlyTek WebSocket error')));
    });

    ws.addEventListener('close', event => {
      if (!settled && event.code !== 1000) {
        settle(() => reject(new Error(`WebSocket closed: ${event.code} ${event.reason}`)));
      }
    });
  });
}

export async function handleTtsRequest(
  request: Request,
  env: Env,
  synthesize: Synthesizer = synthesizeWithXfyun
): Promise<Response> {
  if (request.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, { status: 405 });
  }

  if (request.headers.get('x-app-token') !== env.APP_PROXY_TOKEN) {
    return json({ error: 'unauthorized' }, { status: 401 });
  }

  let payload: { text?: unknown; voiceId?: unknown; speed?: unknown };
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'invalid_json' }, { status: 400 });
  }

  const text = typeof payload.text === 'string' ? payload.text.trim() : '';
  const voiceId = typeof payload.voiceId === 'string' ? payload.voiceId.trim() : '';
  const speedValue = typeof payload.speed === 'number' ? payload.speed : 50;
  const speed = Math.max(0, Math.min(100, Math.round(speedValue)));

  if (!text || text.length > MAX_TEXT_LENGTH || !voiceId) {
    return json({ error: 'invalid_request' }, { status: 400 });
  }

  try {
    const audioBase64 = await synthesize(env, text, voiceId, speed);
    return json({ audioBase64 });
  } catch (error) {
    console.warn('xfyun synthesis failed', error);
    return json({ error: 'synthesis_failed' }, { status: 502 });
  }
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handleTtsRequest(request, env);
  },
};
