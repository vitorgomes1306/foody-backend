import express from 'express'

const router = express.Router()

router.get('/public/address/cep/:cep', async (req, res) => {
  const cep = String(req.params.cep || '').replace(/\D/g, '')
  if (!/^\d{8}$/.test(cep)) return res.status(400).json({ error: 'CEP deve conter 8 números' })
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)
  try {
    const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal: controller.signal })
    if (!response.ok) return res.status(502).json({ error: 'Não foi possível consultar o CEP' })
    const data = await response.json()
    if (data?.erro) return res.status(404).json({ error: 'CEP não encontrado' })
    return res.json({
      zipCode: data.cep || cep, street: data.logradouro || '', complement: data.complemento || '',
      district: data.bairro || '', city: data.localidade || '', state: data.uf || '',
    })
  } catch (error) {
    return res.status(error.name === 'AbortError' ? 504 : 502).json({ error: error.name === 'AbortError' ? 'A consulta do CEP demorou demais' : 'Serviço de CEP indisponível' })
  } finally { clearTimeout(timeout) }
})

export default router
