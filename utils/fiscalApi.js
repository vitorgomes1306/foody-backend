const FISCAL_API_URL = String(process.env.FISCAL_API_URL || 'https://fiscal.altersoft.dev.br').replace(/\/$/, '')
const FISCAL_API_TIMEOUT_MS = Math.max(1000, Number(process.env.FISCAL_API_TIMEOUT_MS) || 30000)

export async function fiscalApiRequest(path, { method = 'GET', body } = {}) {
  if (!process.env.FISCAL_API_KEY) {
    const error = new Error('FISCAL_API_KEY não configurada no Chefito')
    error.code = 'FISCAL_API_NOT_CONFIGURED'
    throw error
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FISCAL_API_TIMEOUT_MS)
  try {
    const response = await fetch(`${FISCAL_API_URL}${path}`, {
      method,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${process.env.FISCAL_API_KEY}`,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    const text = await response.text()
    let data = null
    try { data = text ? JSON.parse(text) : null } catch { data = { raw: text } }
    if (!response.ok) {
      const error = new Error(data?.message || data?.error || `API fiscal respondeu HTTP ${response.status}`)
      error.code = data?.error || 'FISCAL_API_ERROR'
      error.status = response.status
      error.details = data
      throw error
    }
    return data
  } finally {
    clearTimeout(timeout)
  }
}
