import { Buffer } from 'buffer';
import TcpSocket from 'react-native-tcp-socket';
import * as Network from 'expo-network';
import { cacheDirectory, writeAsStringAsync, EncodingType } from 'expo-file-system/legacy';

export const WIFI_SERVER_PORT = 8080;

export type FileReceivedCallback = (fileName: string, tempUri: string) => Promise<void>;

// ─── Upload page HTML ────────────────────────────────────────────────────────

const PAGE_STRINGS: Record<'zh' | 'en', {
  title: string; subtitle: string; dropText: string; dropHint: string;
  btnEmpty: string; btnUpload: string; btnContinue: string;
  successMsg: string; partialMsg: string;
}> = {
  zh: {
    title: '传书到书架',
    subtitle: '将 TXT 文件传输到手机书架',
    dropText: '点击选择 · 或拖入文件',
    dropHint: '支持 .txt 格式，可多选',
    btnEmpty: '请先选择文件',
    btnUpload: '上传 {n} 个文件',
    btnContinue: '继续上传',
    successMsg: '✅ 已成功上传 {n} 本书到书架',
    partialMsg: '⚠️ {ok}/{total} 本上传成功',
  },
  en: {
    title: 'Transfer to Shelf',
    subtitle: 'Send TXT files to your bookshelf',
    dropText: 'Click to select · or drag & drop',
    dropHint: 'Supports .txt, multiple files allowed',
    btnEmpty: 'Select a file first',
    btnUpload: 'Upload {n} file(s)',
    btnContinue: 'Upload more',
    successMsg: '✅ Successfully uploaded {n} book(s)',
    partialMsg: '⚠️ {ok}/{total} uploaded successfully',
  },
};

function getUploadHtml(lang: 'zh' | 'en'): string {
  const s = PAGE_STRINGS[lang];
  // Inject translated strings as a JS object so the page script can reference them
  const T = JSON.stringify(s);
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${s.title}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f0f4f8;min-height:100vh;display:flex;align-items:center;justify-content:center}
.card{background:#fff;border-radius:16px;padding:40px;width:440px;max-width:92vw;box-shadow:0 4px 24px rgba(0,0,0,.08)}
.logo{text-align:center;margin-bottom:28px}
.logo-icon{font-size:48px}
h1{font-size:22px;color:#1a1a2e;margin-top:8px}
.sub{color:#888;font-size:14px;margin-top:4px}
.dz{border:2px dashed #c5d5ea;border-radius:12px;padding:32px 20px;text-align:center;cursor:pointer;transition:all .2s;margin:20px 0;background:#f8fafc}
.dz:hover,.dz.over{border-color:#1E88E5;background:#e8f1fb}
.dz input{display:none}
.dz-icon{font-size:32px;margin-bottom:8px}
.dz-text{color:#444;font-size:15px}
.dz-hint{color:#aaa;font-size:13px;margin-top:4px}
ul{list-style:none;margin:0 0 16px;max-height:120px;overflow-y:auto}
ul li{padding:6px 10px;background:#f0f4f8;border-radius:6px;font-size:13px;color:#555;margin-bottom:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.btn{display:block;width:100%;padding:14px;background:#1E88E5;color:#fff;border:none;border-radius:10px;font-size:16px;cursor:pointer;transition:background .2s}
.btn:hover{background:#1565C0}
.btn:disabled{background:#b0c4de;cursor:not-allowed}
.pg{margin-top:14px;display:none}
.pg-bar{height:4px;background:#e0e0e0;border-radius:2px;overflow:hidden}
.pg-fill{height:100%;background:#1E88E5;border-radius:2px;width:0%;transition:width .3s}
.st{margin-top:14px;padding:12px 16px;border-radius:8px;font-size:14px;display:none}
.st.ok{background:#e8f5e9;color:#2e7d32;display:block}
.st.err{background:#fdecea;color:#c62828;display:block}
</style>
</head>
<body>
<div class="card">
<div class="logo">
<div class="logo-icon">📚</div>
<h1>${s.title}</h1>
<p class="sub">${s.subtitle}</p>
</div>
<div class="dz" id="dz">
<input type="file" id="fi" accept=".txt" multiple>
<div class="dz-icon">📄</div>
<div class="dz-text">${s.dropText}</div>
<div class="dz-hint">${s.dropHint}</div>
</div>
<ul id="fl"></ul>
<button class="btn" id="btn" disabled>${s.btnEmpty}</button>
<div class="pg" id="pg"><div class="pg-bar"><div class="pg-fill" id="pf"></div></div></div>
<div class="st" id="st"></div>
</div>
<script>
var T=${T};
var dz=document.getElementById('dz'),fi=document.getElementById('fi'),btn=document.getElementById('btn'),fl=document.getElementById('fl'),pg=document.getElementById('pg'),pf=document.getElementById('pf'),st=document.getElementById('st');
var files=[];
dz.addEventListener('click',function(){fi.click()});
dz.addEventListener('dragover',function(e){e.preventDefault();dz.classList.add('over')});
dz.addEventListener('dragleave',function(){dz.classList.remove('over')});
dz.addEventListener('drop',function(e){e.preventDefault();dz.classList.remove('over');setFiles(e.dataTransfer.files)});
fi.addEventListener('change',function(){setFiles(fi.files)});
function setFiles(fs){
  files=Array.from(fs).filter(function(f){return f.name.endsWith('.txt')});
  fl.innerHTML=files.map(function(f){return'<li>'+f.name+'</li>'}).join('');
  btn.textContent=files.length?T.btnUpload.replace('{n}',files.length):T.btnEmpty;
  btn.disabled=!files.length;st.className='st';
}
btn.addEventListener('click',async function(){
  if(!files.length)return;
  btn.disabled=true;st.className='st';pg.style.display='block';
  var ok=0,total=files.length;
  for(var i=0;i<total;i++){
    pf.style.width=((i/total)*100)+'%';
    var fd=new FormData();fd.append('file',files[i]);
    try{var r=await fetch('/upload',{method:'POST',body:fd});if(r.ok)ok++;}catch(e){}
    pf.style.width=(((i+1)/total)*100)+'%';
  }
  pg.style.display='none';
  st.textContent=ok===total?T.successMsg.replace('{n}',ok):T.partialMsg.replace('{ok}',ok).replace('{total}',total);
  st.className='st '+(ok===total?'ok':'err');
  btn.textContent=T.btnContinue;btn.disabled=false;files=[];fl.innerHTML='';fi.value='';
});
</script>
</body>
</html>`;
}

// ─── HTTP helpers ────────────────────────────────────────────────────────────

function parseMultipart(
  body: Buffer,
  boundary: string,
): Array<{ name: string; filename?: string; content: Buffer }> {
  const result: Array<{ name: string; filename?: string; content: Buffer }> = [];
  const dashBoundary = Buffer.from('--' + boundary);
  const crlfDashBoundary = Buffer.from('\r\n--' + boundary);
  const headerEndMarker = Buffer.from('\r\n\r\n');

  let pos = body.indexOf(dashBoundary);
  if (pos === -1) return result;
  pos += dashBoundary.length;
  if (body.slice(pos, pos + 2).toString() === '\r\n') pos += 2;

  while (pos < body.length) {
    const hEnd = body.indexOf(headerEndMarker, pos);
    if (hEnd === -1) break;

    const headers = body.slice(pos, hEnd).toString('utf-8');
    const contentStart = hEnd + 4;
    const nextSep = body.indexOf(crlfDashBoundary, contentStart);
    const contentEnd = nextSep !== -1 ? nextSep : body.length;
    const content = body.slice(contentStart, contentEnd);

    const m = headers.match(
      /content-disposition:[^\r\n]*?name="([^"]+)"(?:[^\r\n]*?filename="([^"]+)")?/i,
    );
    if (m) result.push({ name: m[1], filename: m[2], content });

    if (nextSep === -1) break;
    pos = nextSep + crlfDashBoundary.length;
    if (body.slice(pos, pos + 2).toString() === '--') break;
    if (body.slice(pos, pos + 2).toString() === '\r\n') pos += 2;
  }

  return result;
}

function sendResponse(socket: any, status: number, contentType: string, bodyBuf: Buffer) {
  const statusText = status === 200 ? 'OK' : status === 404 ? 'Not Found' : 'Bad Request';
  const header = `HTTP/1.1 ${status} ${statusText}\r\nContent-Type: ${contentType}\r\nContent-Length: ${bodyBuf.length}\r\nConnection: close\r\n\r\n`;
  socket.write(Buffer.concat([Buffer.from(header), bodyBuf]));
  socket.destroy();
}

// ─── Service ─────────────────────────────────────────────────────────────────

class WifiServerService {
  private server: ReturnType<typeof TcpSocket.createServer> | null = null;
  private _isRunning = false;
  private lang: 'zh' | 'en' = 'zh';

  get isRunning() {
    return this._isRunning;
  }

  async getLocalIp(): Promise<string | null> {
    try {
      const ip = await Network.getIpAddressAsync();
      return ip === '0.0.0.0' ? null : ip;
    } catch {
      return null;
    }
  }

  start(onFileReceived: FileReceivedCallback, lang: 'zh' | 'en' = 'zh'): void {
    if (this._isRunning) return;
    this.lang = lang;

    this.server = TcpSocket.createServer((socket: any) => {
      const chunks: Buffer[] = [];
      let totalLen = 0;
      let headersEndIdx = -1;
      let reqMethod = '';
      let reqPath = '';
      let reqHeaders: Record<string, string> = {};
      let contentLength = 0;
      let handled = false;

      socket.on('data', (data: Buffer | string) => {
        if (handled) return;
        const chunk = Buffer.isBuffer(data) ? data : Buffer.from(data as string);
        chunks.push(chunk);
        totalLen += chunk.length;

        if (headersEndIdx === -1) {
          const combined = Buffer.concat(chunks);
          const idx = combined.indexOf('\r\n\r\n');
          if (idx !== -1) {
            headersEndIdx = idx;
            const headerStr = combined.slice(0, idx).toString('utf-8');
            const lines = headerStr.split('\r\n');
            const parts = lines[0].split(' ');
            reqMethod = parts[0] ?? '';
            reqPath = parts[1] ?? '/';
            for (let i = 1; i < lines.length; i++) {
              const ci = lines[i].indexOf(':');
              if (ci > -1) {
                reqHeaders[lines[i].slice(0, ci).toLowerCase().trim()] =
                  lines[i].slice(ci + 1).trim();
              }
            }
            contentLength = parseInt(reqHeaders['content-length'] ?? '0', 10);
          }
        }

        if (headersEndIdx !== -1) {
          const bodyReceived = totalLen - headersEndIdx - 4;
          if (reqMethod === 'GET' || bodyReceived >= contentLength) {
            handled = true;
            this.handleRequest(
              socket,
              Buffer.concat(chunks),
              reqMethod,
              reqPath,
              reqHeaders,
              headersEndIdx,
              onFileReceived,
            );
          }
        }
      });

      socket.on('error', () => {});
    });

    this.server.listen({ port: WIFI_SERVER_PORT, host: '0.0.0.0' });
    this.server.on('error', () => {
      this._isRunning = false;
    });
    this._isRunning = true;
  }

  private handleRequest(
    socket: any,
    buffer: Buffer,
    method: string,
    path: string,
    headers: Record<string, string>,
    headersEnd: number,
    onFileReceived: FileReceivedCallback,
  ) {
    const body = buffer.slice(headersEnd + 4);

    if (method === 'GET' && (path === '/' || path === '/index.html')) {
      const htmlBuf = Buffer.from(getUploadHtml(this.lang), 'utf-8');
      sendResponse(socket, 200, 'text/html; charset=utf-8', htmlBuf);
      return;
    }

    if (method === 'POST' && path === '/upload') {
      const ct = headers['content-type'] ?? '';
      const boundaryMatch = ct.match(/boundary=(?:"([^"]+)"|([^\s;]+))/);
      if (!boundaryMatch) {
        sendResponse(socket, 400, 'text/plain', Buffer.from('Bad Request'));
        return;
      }
      const boundary = boundaryMatch[1] ?? boundaryMatch[2];
      const parts = parseMultipart(body, boundary);
      const filePart = parts.find(p => p.filename);

      if (!filePart) {
        sendResponse(socket, 400, 'text/plain', Buffer.from('No file'));
        return;
      }

      // Respond immediately so the browser gets feedback
      sendResponse(socket, 200, 'text/plain', Buffer.from('OK'));

      // Save to cache then invoke callback
      const fileName = filePart.filename!;
      const safeFileName = fileName.replace(/[^a-zA-Z0-9\u4e00-\u9fa5._-]/g, '_');
      const tempUri = `${cacheDirectory}wifi_${Date.now()}_${safeFileName}`;
      const base64 = filePart.content.toString('base64');

      writeAsStringAsync(tempUri, base64, {
        encoding: EncodingType.Base64,
      })
        .then(() => onFileReceived(fileName, tempUri))
        .catch(err => console.error('[WifiServer] write error:', err));

      return;
    }

    sendResponse(socket, 404, 'text/plain', Buffer.from('Not Found'));
  }

  stop(): void {
    if (this.server) {
      try {
        this.server.close();
      } catch {}
      this.server = null;
    }
    this._isRunning = false;
  }
}

export default new WifiServerService();
