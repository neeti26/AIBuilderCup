import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { authApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import Button from '../components/ui/Button';
import { Sparkles, Lock, User, Cpu, Activity, Shield } from 'lucide-react';

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
      toast.error(error.response?.data?.detail || 'Invalid credentials');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate();
  };

  return (
    <div className="min-h-screen bg-slate-900 flex">
      {/* Left panel — branding */}
      <div className="hidden lg:flex flex-col justify-between w-1/2 bg-gradient-to-br from-slate-900 to-blue-950 p-12 border-r border-slate-800">
        <div>
          <div className="flex items-center gap-3 mb-12">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center" aria-hidden="true">
              <span className="text-white font-bold">SS</span>
            </div>
            <div>
              <h1 className="text-white font-bold text-lg">ShiftSync AI</h1>
              <p className="text-slate-400 text-xs">Intelligent Operations Platform</p>
            </div>
          </div>

          <h2 className="text-white text-4xl font-bold leading-tight mb-4">
            Zero-gap shift<br />transitions.<br />
            <span className="text-blue-400">Powered by AI.</span>
          </h2>
          <p className="text-slate-400 text-base leading-relaxed max-w-md">
            Eliminate communication failures between shifts. AI analyzes operator logs, machine data, and quality records to generate structured handover briefings in seconds.
          </p>
        </div>

        <div className="space-y-4">
          {[
            { icon: Sparkles, text: 'Gemini 2.5 Flash automatically classifies every log entry' },
            { icon: Activity, text: 'Real-time anomaly detection across all machines' },
            { icon: Cpu, text: 'Predictive maintenance recommendations' },
            { icon: Shield, text: 'Critical safety alerts never get missed again' },
          ].map(({ icon: Icon, text }) => (
            <div key={text} className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-600/20 rounded-lg flex items-center justify-center flex-shrink-0" aria-hidden="true">
                <Icon className="w-4 h-4 text-blue-400" />
              </div>
              <p className="text-slate-300 text-sm">{text}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel — login form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8 lg:hidden">
            <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center mx-auto mb-3" aria-hidden="true">
              <span className="text-white font-bold">SS</span>
            </div>
            <h1 className="text-white font-bold text-xl">ShiftSync AI</h1>
          </div>

          <h2 className="text-white text-2xl font-bold mb-2">Sign in</h2>
          <p className="text-slate-400 text-sm mb-8">Access your shift operations dashboard</p>

          <form onSubmit={handleSubmit} className="space-y-4" aria-label="Login form">
            <div>
              <label htmlFor="username" className="text-slate-400 text-sm mb-1.5 block">Username</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" aria-hidden="true" />
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="operator.john"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-10 pr-4 py-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  autoComplete="username"
                  required
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="text-slate-400 text-sm mb-1.5 block">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" aria-hidden="true" />
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-10 pr-4 py-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  autoComplete="current-password"
                  required
                />
              </div>
            </div>

            <Button
              type="submit"
              loading={loginMutation.isPending}
              className="w-full justify-center"
              size="lg"
            >
              Sign In
            </Button>
          </form>

          <div className="mt-6 p-4 bg-slate-800/50 border border-slate-700 rounded-xl">
            <p className="text-slate-400 text-xs mb-2 font-medium">Demo Credentials:</p>
            <div className="space-y-1 text-xs text-slate-500">
              <p><span className="text-slate-300">supervisor</span> / <span className="text-slate-300">spidey@01</span> — Supervisor</p>
              <p><span className="text-slate-300">operator</span> / <span className="text-slate-300">webby001</span> — Operator</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
