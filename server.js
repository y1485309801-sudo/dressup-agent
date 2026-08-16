// ══════════════════════════════════════════════════
// 即梦 AI 4.0 代理服务
// 对应 jimeng_test.py 的 Node.js 实现
// ══════════════════════════════════════════════════

const express = require('express');
const crypto  = require('crypto');

const app = express();
app.use(express.json({ limit: '15mb' }));

// ── CORS（允许你的前端页面跨域请求）──
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ══════════════════════════════════════════════════
// 火山引擎 HMAC-SHA256 签名
// 对应 jimeng_test.py 里 Service() 自动签名的逻辑
// 参数直接来自 jimeng_test.py：
//   host    = 'visual.volcengineapi.com'
//   service = 'cv'
//   region  = 'cn-north-1'
//   version = '2022-08-31'
// ══════════════════════════════════════════════════

const VOLCENGINE_HOST    = 'visual.volcengineapi.com';
const VOLCENGINE_SERVICE = 'cv';
const VOLCENGINE_REGION  = 'cn-north-1';
const VOLCENGINE_VERSION = '2022-08-31';

function hmacSHA256(key, data) {
  return crypto.createHmac('sha256', key).update(data).digest();
}

function sha256Hex(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function getXDate() {
  // 格式：20240115T103000Z
  return new Date().toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

function buildAuthHeaders(action, bodyStr) {
  const AK = process.env.JIMENG_AK;
  const SK = process.env.JIMENG_SK;

  if (!AK || !SK) throw new Error('环境变量 JIMENG_AK / JIMENG_SK 未设置');

  const xDate = getXDate();
  const date  = xDate.slice(0, 8); // YYYYMMDD

  // ── 查询参数（字母序排列）──
  // 对应 jimeng_test.py ApiInfo 里的 params：
  //   {'Action': '...', 'Version': '2022-08-31'}
  const queryParams = [
    ['Action',  action],
    ['Version', VOLCENGINE_VERSION],
  ].sort((a, b) => a[0].localeCompare(b[0]));

  const canonicalQueryString = queryParams
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

  // ── 规范化 Header（字母序）──
  const headersToSign = {
    'content-type': 'application/json',
    'host':         VOLCENGINE_HOST,
    'x-date':       xDate,
  };
  const sortedHeaderKeys = Object.keys(headersToSign).sort();
  const canonicalHeaders  = sortedHeaderKeys.map(k => `${k}:${headersToSign[k]}\n`).join('');
  const signedHeaders     = sortedHeaderKeys.join(';');

  // ── 规范请求体 ──
  const bodyHash = sha256Hex(bodyStr);

  const canonicalRequest = [
    'POST',
    '/',
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    bodyHash,
  ].join('\n');

  // ── 待签名字符串 ──
  const credentialScope = `${date}/${VOLCENGINE_REGION}/${VOLCENGINE_SERVICE}/request`;
  const stringToSign = [
    'HMAC-SHA256',
    xDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  // ── 派生签名密钥 ──
  const signingKey = hmacSHA256(
    hmacSHA256(
      hmacSHA256(
        hmacSHA256(SK, date),
        VOLCENGINE_REGION
      ),
      VOLCENGINE_SERVICE
    ),
    'request'
  );

  const signature    = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');
  const authorization = `HMAC-SHA256 Credential=${AK}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    'Content-Type': 'application/json',
    'Host':         VOLCENGINE_HOST,
    'X-Date':       xDate,
    'Authorization': authorization,
  };
}

// ── 统一调用火山引擎接口 ──
async function callVolcengine(action, body) {
  const bodyStr = JSON.stringify(body);
  const headers = buildAuthHeaders(action, bodyStr);

  const queryString = `Action=${encodeURIComponent(action)}&Version=${encodeURIComponent(VOLCENGINE_VERSION)}`;
  const url = `https://${VOLCENGINE_HOST}/?${queryString}`;

  const res  = await fetch(url, { method: 'POST', headers, body: bodyStr });
  const text = await res.text();
  console.log(`[${action}] 原始响应:`, text.slice(0, 500));
  const data = JSON.parse(text);
  console.log(`[${action}] 响应:`, JSON.stringify(data, null, 2));
  return data;
}

// ══════════════════════════════════════════════════
// 图片临时存储（存内存，Railway 重启后清空，测试阶段够用）
// ══════════════════════════════════════════════════

const imageStore = {}; // id → { base64, mimeType }

// 前端上传 base64 → 返回公网可访问的临时 URL
app.post('/api/image/upload', (req, res) => {
  try {
    const { base64, mimeType } = req.body;
    if (!base64) return res.status(400).json({ error: '缺少 base64 字段' });

    const id = crypto.randomBytes(16).toString('hex');
    imageStore[id] = { base64, mimeType: mimeType || 'image/jpeg' };

    // BASE_URL 在 Railway 里设置为你的部署地址，例如 https://xxx.up.railway.app
    const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3001}`;
    const url = `${baseUrl}/images/${id}`;

    console.log('图片上传成功，临时 URL:', url);
    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 对外提供临时图片访问（即梦 API 会来拉取这个 URL）
app.get('/images/:id', (req, res) => {
  const entry = imageStore[req.params.id];
  if (!entry) return res.status(404).send('Not found');

  // base64 可能带 "data:image/jpeg;base64,..." 前缀
  const raw = entry.base64.includes(',') ? entry.base64.split(',')[1] : entry.base64;
  const buf = Buffer.from(raw, 'base64');
  res.setHeader('Content-Type', entry.mimeType);
  res.setHeader('Cache-Control', 'public, max-age=600');
  res.send(buf);
});

// ══════════════════════════════════════════════════
// /api/dressup/submit
// 对应 jimeng_test.py submit_task()
// 使用 image_urls 传入人物图 + 衣服图，
// prompt 指示模型换装
// ══════════════════════════════════════════════════

app.post('/api/dressup/submit', async (req, res) => {
  try {
  const { personImageUrl, clothImageUrls, prompt } = req.body;

  if (!personImageUrl || !clothImageUrls || clothImageUrls.length === 0) {
    return res.status(400).json({ error: '缺少 personImageUrl 或 clothImageUrls' });
  }

  const body = {
    req_key:      'jimeng_t2i_v40',
    prompt:       prompt,
    size:         4194304,
    force_single: true,
    image_urls:   [personImageUrl, ...clothImageUrls], // 图1=人物，图2起=衣服
  };

    const data = await callVolcengine('CVSync2AsyncSubmitTask', body);

    // 对应 jimeng_test.py：res.get('code') == 10000 → 成功
    if (data.code !== 10000) {
      return res.status(400).json({ error: data.message || '任务提交失败' });
    }

    res.json({ task_id: data.data.task_id });
  } catch (err) {
    console.error('/api/dressup/submit 错误:', err);
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════
// /api/dressup/result
// 对应 jimeng_test.py check_task()
// status 枚举：'done' | 'in_queue' | 'generating'（来自 jimeng_test.py）
// ══════════════════════════════════════════════════

app.post('/api/dressup/result', async (req, res) => {
  try {
    const { task_id } = req.body;
    if (!task_id) return res.status(400).json({ error: '缺少 task_id' });

    // 对应 jimeng_test.py check_task() 的 body 结构，参数完全一致
    const body = {
      req_key:  'jimeng_t2i_v40',                        // 直接来自 jimeng_test.py
      task_id:  task_id,
      req_json: JSON.stringify({ return_url: true }),     // 直接来自 jimeng_test.py
    };

    const data = await callVolcengine('CVSync2AsyncGetResult', body);

    if (data.code !== 10000) {
      return res.status(400).json({ error: data.message || '查询失败' });
    }

    // 对应 jimeng_test.py：data.get('status') 的三种枚举值
    const status = data.data?.status;

    if (status === 'done') {
      // 对应 jimeng_test.py：data.get('image_urls')
      const imageUrl = data.data?.image_urls?.[0];
      if (!imageUrl) return res.status(500).json({ error: '生成成功但没有图片 URL' });
      return res.json({ status: 'SUCCEED', imageUrl });
    }

    if (status === 'in_queue' || status === 'generating') {
      return res.json({ status: 'RUNNING' });
    }

    // 其他异常状态
    return res.json({ status: 'FAILED', error: `异常状态: ${status}` });

  } catch (err) {
    console.error('/api/dressup/result 错误:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── 健康检查 ──
app.get('/', (req, res) => res.json({ status: 'ok', msg: '即梦代理服务运行中' }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`✅ 代理服务已启动，端口 ${PORT}`));

