import https from 'node:https';

const DEFAULT_TOKEN_URL = 'https://auth.sicoob.com.br/auth/realms/cooperado/protocol/openid-connect/token';
const DEFAULT_API_URL = 'https://api.sicoob.com.br/pix/api/v2';
const DEFAULT_SCOPE = 'cob.write cob.read pix.read webhook.write webhook.read';
let cachedToken = null;

function fromBase64(name) {
  const value = String(process.env[name] || '').trim();
  return value ? Buffer.from(value, 'base64') : null;
}

function tlsOptions() {
  const pfx = fromBase64('SICOOB_CERTIFICATE_BASE64');
  if (pfx) return { pfx, passphrase: process.env.SICOOB_CERTIFICATE_PASSWORD || '' };
  const cert = fromBase64('SICOOB_CERT_PEM_BASE64');
  const key = fromBase64('SICOOB_PRIVATE_KEY_BASE64');
  if (cert && key) return { cert, key, passphrase: process.env.SICOOB_CERTIFICATE_PASSWORD || '' };
  throw new Error('Certificado mTLS do Sicoob não configurado');
}

function request({ url, method = 'GET', headers = {}, body }) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request({
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: `${parsed.pathname}${parsed.search}`,
      method,
      headers: { Accept: 'application/json', ...headers },
      rejectUnauthorized: true,
      timeout: 20000,
      ...tlsOptions(),
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let data = null;
        try { data = text ? JSON.parse(text) : null; } catch { data = text; }
        if (response.statusCode >= 200 && response.statusCode < 300) return resolve(data);
        const detail = data?.detail || data?.error_description || data?.message || `HTTP ${response.statusCode}`;
        return reject(new Error(`Sicoob: ${detail}`));
      });
    });
    req.on('timeout', () => req.destroy(new Error('Sicoob: tempo limite excedido')));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function accessToken() {
  if (cachedToken?.value && cachedToken.expiresAt > Date.now() + 30000) return cachedToken.value;
  const clientId = String(process.env.SICOOB_CLIENT_ID || '').trim();
  if (!clientId) throw new Error('SICOOB_CLIENT_ID não configurado');
  const form = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    scope: process.env.SICOOB_SCOPES || DEFAULT_SCOPE,
  });
  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Content-Length': Buffer.byteLength(form.toString()),
  };
  if (process.env.SICOOB_CLIENT_SECRET) {
    headers.Authorization = `Basic ${Buffer.from(`${clientId}:${process.env.SICOOB_CLIENT_SECRET}`).toString('base64')}`;
  }
  const data = await request({ url: process.env.SICOOB_TOKEN_URL || DEFAULT_TOKEN_URL, method: 'POST', headers, body: form.toString() });
  if (!data?.access_token) throw new Error('Sicoob não retornou o token de acesso');
  cachedToken = { value: data.access_token, expiresAt: Date.now() + (Number(data.expires_in) || 300) * 1000 };
  return cachedToken.value;
}

async function apiRequest(path, options = {}) {
  const clientId = String(process.env.SICOOB_CLIENT_ID || '').trim();
  const token = await accessToken();
  const body = options.body ? JSON.stringify(options.body) : null;
  return request({
    url: `${String(process.env.SICOOB_PIX_API_URL || DEFAULT_API_URL).replace(/\/$/, '')}${path}`,
    method: options.method || 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      client_id: clientId,
      ...(body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : {}),
    },
    body,
  });
}

export function sicoobConfigurationStatus() {
  const hasPfx = Boolean(process.env.SICOOB_CERTIFICATE_BASE64);
  const hasPemPair = Boolean(process.env.SICOOB_CERT_PEM_BASE64 && process.env.SICOOB_PRIVATE_KEY_BASE64);
  const fields = {
    clientId: Boolean(process.env.SICOOB_CLIENT_ID),
    pixKey: Boolean(process.env.SICOOB_PIX_KEY),
    certificate: hasPfx || hasPemPair,
  };
  return { ...fields, ready: Object.values(fields).every(Boolean) };
}

export async function createSicoobCheckout({ subscriptionId, plan, amount }) {
  const pixKey = String(process.env.SICOOB_PIX_KEY || '').trim();
  if (!pixKey) throw new Error('SICOOB_PIX_KEY não configurada');
  const txid = subscriptionId.replace(/-/g, '').toUpperCase();
  const charge = await apiRequest(`/cob/${txid}`, {
    method: 'PUT',
    body: {
      calendario: { expiracao: Number(process.env.SICOOB_PIX_EXPIRATION_SECONDS) || 1800 },
      valor: { original: Number(amount).toFixed(2) },
      chave: pixKey,
      solicitacaoPagador: `Assinatura Chefito ${plan} - 30 dias`,
      infoAdicionais: [{ nome: 'assinatura', valor: subscriptionId }],
    },
  });
  const copyPaste = charge?.pixCopiaECola || charge?.brcode || charge?.qrCode || null;
  if (!charge?.txid || !copyPaste) throw new Error('Sicoob não retornou os dados completos da cobrança Pix');
  return {
    checkoutId: charge.txid,
    pix: {
      txid: charge.txid,
      copyPaste,
      location: charge?.loc?.location || charge?.location || null,
      expiresIn: Number(charge?.calendario?.expiracao) || 1800,
    },
  };
}

export async function getSicoobCharge(txid) {
  return apiRequest(`/cob/${encodeURIComponent(txid)}`);
}

export async function configureSicoobWebhook(webhookUrl) {
  const pixKey = String(process.env.SICOOB_PIX_KEY || '').trim();
  if (!pixKey) throw new Error('SICOOB_PIX_KEY não configurada');
  return apiRequest(`/webhook/${encodeURIComponent(pixKey)}`, { method: 'PUT', body: { webhookUrl } });
}
