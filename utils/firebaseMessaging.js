import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app'
import { getMessaging } from 'firebase-admin/messaging'

let initializationError = null

function serviceAccountFromEnvironment() {
  const raw = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim()
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    try {
      return JSON.parse(Buffer.from(raw, 'base64').toString('utf8'))
    } catch {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON inválido')
    }
  }
}

export function getFirebaseMessaging() {
  try {
    if (!getApps().length) {
      const serviceAccount = serviceAccountFromEnvironment()
      if (!serviceAccount && !process.env.GOOGLE_APPLICATION_CREDENTIALS) throw new Error('Configure FIREBASE_SERVICE_ACCOUNT_JSON no backend')
      initializeApp({ credential: serviceAccount ? cert(serviceAccount) : applicationDefault() })
    }
    return getMessaging()
  } catch (error) {
    initializationError = error
    return null
  }
}

export function firebaseMessagingStatus() {
  const messaging = getFirebaseMessaging()
  return { ready: Boolean(messaging), error: messaging ? null : initializationError?.message || 'Credencial Firebase não configurada' }
}
