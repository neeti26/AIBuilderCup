import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { authApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { Sparkles, Lock, User, Activity } from 'lucide-react';
import { sanitizeInput, validatePassword } from '../lib/security';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const { login } = useAuthStore();
  const navigate = useNavigate();

  const loginMutation = useMutation({
    mutationFn: () => authApi.login(username, password),
    onSuccess: (response) => {
      const { access_token, user } = response.data;
      login(user, access_token);
      toast.success(`Welcome back, ${user.full_name}`);
      navigate('/');
    },
    onError: (error: any) => {
      console.error('Login error:', error);
      const detail = error.response?.data?.detail || error.response?.data?.error || error.message || 'Invalid credentials';
      toast.error(`Login failed: ${detail}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validate inputs
    const usernameSanitized = sanitizeInput(username);
    const passwordValidation = validatePassword(password);

    if (!usernameSanitized) {
      toast.error('Username is required');
      return;
    }
    if (!passwordValidation.valid) {
      toast.error(passwordValidation.message);
      return;
    }

    setUsername(usernameSanitized);
    loginMutation.mutate();
  };

  return (
    <div className="min-h-screen bg-slate-900 flex">
      {/* Left panel — branding */}
      <div className="hidden lg:flex flex-col justify-between w-1/2 bg-gradient-to-br from-slate-900 to-blue-950 p-12 border-r border-slate-800">
        <div>
          <div className="flex items-center gap-3 mb-12">
            <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center" aria-hidden="true">
              <span className="text-white font-bold text-xl">SS</span>
            </div>
            <div>
              <h1 className="text-white font-bold text-2xl leading-tight">ShiftSync AI</h1>
              <p className="text-slate-400 text-sm">Intelligent Operations Platform</p>
            </div>
          </div>

          <h2 className="text-white text-5xl font-bold leading-tight mb-6">
            Zero-gap shift<br />
            transitions.<br />
            <span className="text-blue-400">Powered by AI.</span>
          </h2>
          <p className="text-slate-400 text-lg leading-relaxed max-w-xl mb-8">
            Eliminate communication failures between shifts. AI analyzes operator logs, machine data, and quality records to generate structured handover briefings in seconds.
          </p>

          <div className="space-y-4">
            {[
              { icon: Sparkles, text: 'Gemini 2.5 Flash automatically classifies every log entry' },
              { icon: Activity, text: 'Real-time anomaly detection across all machines' },
              { icon: User, text: 'Predictive maintenance recommendations' },
              { icon: Lock, text: 'Critical safety alerts never get missed again' },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-600/20 rounded-xl flex items-center justify-center flex-shrink-0" aria-hidden="true">
                  <Icon className="w-5 h-5 text-blue-400" />
                </div>
                <p className="text-slate-300 text-base">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel — login form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="text-center mb-8 lg:hidden">
            <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-3" aria-hidden="true">
              <span className="text-white font-bold text-xl">SS</span>
            </div>
            <h1 className="text-white font-bold text-xl">ShiftSync AI</h1>
          </div>

          <h2 className="text-white text-2xl font-bold mb-2">Sign in</h2>
          <p className="text-slate-400 text-sm mb-8">Access your shift operations dashboard</p>

          <form onSubmit={handleSubmit} className="space-y-4" aria-label="Login form">
            <div>
              <label htmlFor="username" className="input-label">Username</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" aria-hidden="true" />
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="supervisor"
                  className="input-field"
                  autoComplete="username"
                  required
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="input-label">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" aria-hidden="true" />
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="input-field"
                  autoComplete="current-password"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loginMutation.isPending}
              className="btn-primary w-full"
            >
              {loginMutation.isPending ? (
                <div className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938V7.626A8.001 8.001 0 017.539 2.06zM10.791 3.099c.243-.669 1.22-.669 1.463 0l1.953 5.372c.243.669-.199 1.484-.731 1.484H7.61c-.532 0-.974-.815-.731-1.484zm5.427 2.818c.243-.669 1.22-.669 1.463 0l1.953 5.372c.243.669-.199 1.484-.731 1.484H7.61c-.532 0-.974-.815-.731-1.484zm-7.287 5.372c.243-.669 1.22-.669 1.463 0l1.953 5.372c.243.669-.199 1.484-.731 1.484H.172c-.532 0-.974-.815-.731-1.484zM11.539 20.06c.243-.669 1.22-.669 1.463 0l1.953 5.372c.243.669-.199 1.484-.731 1.484H7.61c-.532 0-.974-.815-.731-1.484zm2.891-10.88c-.243-.669-1.22-.669-1.463 0l-1.953 5.372c-.243.669.199 1.484.731 1.484H7.61c-.532 0-.974-.815-.731-1.484zm15.539 18.06c-.243-.669-1.22-.669-1.463 0l-1.953 5.372c-.243.669.199 1.484.731 1.484H7.61c-.532 0-.974-.815-.731-1.484zm10.791 18.06c-.243-.669-1.22-.669-1.463 0l-1.953 5.372c-.243.669.199 1.484.731 1.484H7.61c-.532 0-.974-.815-.731-1.484z" />
                  </svg>
                  Signing in...
                </div>
              ) : 'Sign In'
            }
          </button>
          </form>

          <div className="mt-8 p-6 bg-slate-800/50 border border-slate-700 rounded-xl">
            <p className="text-slate-400 text-xs mb-2 font-medium">Demo Credentials:</p>
            <div className="space-y-1 text-xs text-slate-500">
              <p><span className="text-slate-300">supervisor</span> / <span className="text-slate-300">spidey@01</span> — Supervisor</p>
              <p><span className="text-slate-300">staff</span> / <span className="text-slate-300">webby001</span> — Operator</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
