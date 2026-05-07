import { handleTtsRequest, mergeBase64AudioChunks } from '../workers/xfyun-tts-proxy/src/index';

const env = {
  XFYUN_APP_ID: 'appid',
  XFYUN_API_KEY: 'api-key',
  XFYUN_API_SECRET: 'api-secret',
  APP_PROXY_TOKEN: 'app-token',
};

describe('xfyun Cloudflare Worker proxy', () => {
  it('merges base64 audio chunks as bytes before returning one base64 payload', () => {
    expect(mergeBase64AudioChunks(['AQ==', 'AgM='])).toBe('AQID');
  });

  it('rejects requests without the app proxy token', async () => {
    const request = new Request('https://tts.example.com/tts', {
      method: 'POST',
      body: JSON.stringify({ text: '你好', voiceId: 'x4_yezi' }),
    });

    const response = await handleTtsRequest(request, env, jest.fn());

    expect(response.status).toBe(401);
  });

  it('returns synthesized audio from the injected synthesizer', async () => {
    const synthesize = jest.fn().mockResolvedValue('BASE64_MP3');
    const request = new Request('https://tts.example.com/tts', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-app-token': 'app-token',
      },
      body: JSON.stringify({ text: '你好', voiceId: 'x4_yezi', speed: 60 }),
    });

    const response = await handleTtsRequest(request, env, synthesize);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ audioBase64: 'BASE64_MP3' });
    expect(synthesize).toHaveBeenCalledWith(env, '你好', 'x4_yezi', 60);
  });
});
