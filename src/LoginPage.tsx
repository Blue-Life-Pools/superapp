import { useState, type FormEvent } from 'react';
import { API_URL, setAppToken } from './api';

export type AppRole = 'COMMERCIAL' | 'CHEMICALS' | 'HEALTH' | 'REPORTS' | 'SUPER_ADMIN';

export type AppUser = {
  id: string;
  name: string;
  email: string;
  role: AppRole;
};

export type AppSession = {
  user: AppUser;
  expiresAt: string;
  allowedAreas: string[];
};

export function LoginPage({ onLogin }: { onLogin: (session: AppSession) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const result = await response.json().catch(() => null) as (AppSession & { token?: string; message?: string | string[] }) | null;
      if (!response.ok || !result?.token || !result.user) {
        const message = Array.isArray(result?.message) ? result.message.join(' ') : result?.message;
        throw new Error(message || 'El correo o la clave no son correctos.');
      }
      setAppToken(result.token);
      setPassword('');
      onLogin(result);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'No fue posible iniciar sesión.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="app-login-page">
      <section className="app-login-card" aria-labelledby="app-login-title">
        <img src="/blue-life-logo.png" alt="Blue Life Pool Service" />
        <div className="app-login-heading">
          <span>BLUE LIFE INTERNAL APP</span>
          <h1 id="app-login-title">Iniciar sesión</h1>
          <p>Ingresa con el usuario asignado a Commercial, Chemicals o Reports.</p>
        </div>
        <form onSubmit={submit}>
          <label>
            <span>Correo</span>
            <input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label>
            <span>Contraseña</span>
            <input type="password" autoComplete="current-password" required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          {error && <p className="app-login-error" role="alert">{error}</p>}
          <button type="submit" disabled={submitting}>{submitting ? 'Ingresando…' : 'Ingresar'}</button>
        </form>
        <small>El acceso muestra Home y únicamente la sección asignada.</small>
      </section>
    </main>
  );
}
