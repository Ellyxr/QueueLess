import React, { useState } from 'react';
import { LoginInput } from '../../types/auth';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Eye, EyeOff } from 'lucide-react';

interface LoginFormProps {
  onSubmit: (data: LoginInput) => Promise<void>;
}

export const LoginForm: React.FC<LoginFormProps> = ({ onSubmit }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!email || !password) {
      setErrorMessage('Please fill in all fields.');
      return;
    }

    try {
      setIsLoading(true);
      await onSubmit({ email, password });
    } catch (err: any) {
      setErrorMessage(err.message || 'Invalid email or password.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full flex justify-center items-center px-4">
      <Card className="w-full max-w-lg mx-auto bg-white/20 dark:bg-slate-900/30 backdrop-blur-xl border border-white/30 dark:border-white/10 shadow-[0_8px_32px_0_rgba(0,0,0,0.25)] rounded-2xl p-4 sm:p-6">
        <CardHeader className="pb-6">
          <CardTitle className="text-3xl font-bold text-center tracking-tight">
            Log in to QueueLess
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {errorMessage && (
            <Alert variant="destructive" className="mb-4 bg-red-500/10 backdrop-blur-md border-red-500/20 text-red-600">
              <AlertDescription className="text-sm">{errorMessage}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-semibold">Email Address</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your.email@example.com"
                disabled={isLoading}
                className="h-11 text-sm bg-white/40 dark:bg-slate-800/40 border-white/20 dark:border-white/10 backdrop-blur-sm"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-semibold">Password</Label>
              <div className="relative flex items-center">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  className="h-11 text-sm pr-10 bg-white/40 dark:bg-slate-800/40 border-white/20 dark:border-white/10 backdrop-blur-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 p-1 flex items-center justify-center text-gray-500 hover:text-gray-700 focus:outline-none"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            <Button type="submit" disabled={isLoading} className="w-full h-11 text-base bg-[#005691] hover:bg-[#00406c] shadow-md transition-all">
              {isLoading ? 'Logging in...' : 'Log In'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};