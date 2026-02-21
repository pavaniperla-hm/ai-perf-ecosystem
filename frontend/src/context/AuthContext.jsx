import { createContext, useContext, useState } from 'react'
import { getUsers, createUser } from '../api/client'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem('auth_user')
      return stored ? JSON.parse(stored) : null
    } catch {
      return null
    }
  })

  async function login(email, password) {
    const data = await getUsers({ limit: 1000 })
    const users = Array.isArray(data) ? data : (data.users || data.data || [])
    const found = users.find(u => u.email?.toLowerCase() === email.toLowerCase())
    if (!found) throw new Error('User not found')
    const loggedIn = { ...found, password }
    setUser(loggedIn)
    localStorage.setItem('auth_user', JSON.stringify(loggedIn))
    return loggedIn
  }

  async function register(name, email, phone, password) {
    const newUser = await createUser({ name, email, phone, password })
    const loggedIn = { ...newUser, password }
    setUser(loggedIn)
    localStorage.setItem('auth_user', JSON.stringify(loggedIn))
    return loggedIn
  }

  function logout() {
    setUser(null)
    localStorage.removeItem('auth_user')
  }

  return (
    <AuthContext.Provider value={{ user, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
