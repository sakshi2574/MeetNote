import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

import {
  getCurrentUser,
  login as loginRequest,
  updateCurrentUser,
} from '../api/auth.js'

import { ACCESS_TOKEN_KEY } from '../api/client.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [token, setToken] = useState(
    () => localStorage.getItem(ACCESS_TOKEN_KEY),
  )

  const [user, setUser] = useState(null)

  const [loading, setLoading] = useState(
    () => Boolean(localStorage.getItem(ACCESS_TOKEN_KEY)),
  )

  useEffect(() => {
    const storedToken = localStorage.getItem(ACCESS_TOKEN_KEY)

    if (!storedToken) {
      setLoading(false)
      return undefined
    }

    let cancelled = false

    async function loadCurrentUser() {
      try {
        const response = await getCurrentUser()

        if (!cancelled) {
          setUser(response.data)
          setToken(storedToken)
        }
      } catch (error) {
        if (cancelled) return

        if (error.response?.status === 401) {
          localStorage.removeItem(ACCESS_TOKEN_KEY)
          setToken(null)
          setUser(null)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadCurrentUser()

    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(async (email, password) => {
    const response = await loginRequest(email, password)
    const accessToken = response.data?.access_token

    if (!accessToken) {
      throw new Error('Login response did not contain an access token.')
    }

    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken)
    setToken(accessToken)
    setLoading(true)

    try {
      const currentUser = await getCurrentUser()
      setUser(currentUser.data)
      return currentUser.data
    } catch (error) {
      localStorage.removeItem(ACCESS_TOKEN_KEY)
      setToken(null)
      setUser(null)
      throw error
    } finally {
      setLoading(false)
    }
  }, [])

  const updateProfile = useCallback(async (name) => {
    const response = await updateCurrentUser(name)
    setUser(response.data)
    return response.data
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(ACCESS_TOKEN_KEY)
    setToken(null)
    setUser(null)
    setLoading(false)
  }, [])

  const value = useMemo(
    () => ({
      token,
      user,
      loading,
      isAuthenticated: Boolean(user && token),
      login,
      logout,
      updateProfile,
    }),
    [token, user, loading, login, logout, updateProfile],
  )

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }

  return context
}