import { useState, useEffect, FormEvent } from 'react'
import { Button } from '@/components/ui/button'

const API_BASE = import.meta.env.VITE_API_BASE || ''

export function Login() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(false)
  const [returnTo, setReturnTo] = useState('/')

  useEffect(() => {
    // Get returnTo from URL params
    const params = new URLSearchParams(window.location.search)
    const returnToParam = params.get('returnTo') || '/'
    setReturnTo(returnToParam)
  }, [])

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(false)

    try {
      const formData = new FormData()
      formData.append('password', password)
      formData.append('returnTo', returnTo)

      const response = await fetch(`${API_BASE}/api/login`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      })

      if (response.ok) {
        // Redirect on success
        window.location.href = returnTo
      } else {
        setError(true)
        setPassword('')
      }
    } catch (err) {
      setError(true)
      setPassword('')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-purple-600 to-purple-900 px-4">
      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-2xl">
        <div className="mb-8 text-center">
          <img
            src="https://assets.shirhatti.com/weddinglogo.svg"
            alt="Wedding Logo"
            className="mx-auto h-16 w-auto"
          />
        </div>

        <h1 className="mb-2 text-center text-2xl font-bold text-zinc-900">
          Welcome
        </h1>
        <p className="mb-8 text-center text-zinc-600">
          Enter the password to view the gallery
        </p>

        {error && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-center text-sm text-red-700">
            Invalid password. Please try again.
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter password"
            required
            autoFocus
            disabled={loading}
            className="mb-4 w-full rounded-md border-2 border-zinc-200 px-4 py-3 text-base transition-colors focus:border-purple-600 focus:outline-none disabled:bg-zinc-50 disabled:text-zinc-500"
          />

          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-purple-600 to-purple-900 py-6 text-base font-semibold hover:opacity-90"
          >
            {loading ? 'Checking...' : 'Access Gallery'}
          </Button>
        </form>
      </div>
    </div>
  )
}
