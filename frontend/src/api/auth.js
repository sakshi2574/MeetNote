import client from './client.js'

export function login(email, password) {
  return client.post('/auth/login', { email, password })
}

export function register(name, email, password) {
  return client.post('/auth/register', { name, email, password })
}

export function getCurrentUser() {
  return client.get('/auth/me')
}

export function updateCurrentUser(name) {
  return client.patch('/auth/me', { name })
}
