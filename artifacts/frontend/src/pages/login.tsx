import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { LoginForm } from '../features/auth/LoginForm';
import { RegisterForm } from '../features/auth/RegisterForm';
import { loginUser, registerUser } from '../features/auth/api';
import { Button } from '../components/ui/button';
import { LoginInput, RegisterInput } from '../types/auth';

export const LoginPage: React.FC = () => {
  const [isLoginView, setIsLoginView] = useState(true);
  const [, setLocation] = useLocation();

  const handleLoginSubmit = async (data: LoginInput) => {
    const res = await loginUser(data);
    if (res.token) {
      localStorage.setItem('token', res.token);
      if (res.user) {
        localStorage.setItem('user', JSON.stringify(res.user));
      }
    }
    setLocation('/');
  };

  const handleRegisterSubmit = async (data: RegisterInput) => {
    const res = await registerUser(data);
    if (res.token) {
      localStorage.setItem('token', res.token);
      if (res.user) {
        localStorage.setItem('user', JSON.stringify(res.user));
      }
    }
    setLocation('/');
  };

  return (
    <div className="relative min-h-[calc(100vh-4rem)] w-full grid grid-cols-1 lg:grid-cols-2 bg-slate-50/80 dark:bg-slate-950 overflow-hidden px-6 lg:px-16 py-8 items-center">
      
      {/* Existing Subtle Grid Pattern */}
      <div 
        className="absolute inset-0 bg-[linear-gradient(to_right,#00000008_1px,transparent_1px),linear-gradient(to_bottom,#00000008_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_50%,#000_70%,transparent_100%)] pointer-events-none" 
      />

      {/* Existing Background Ambient Glows */}
      <div className="absolute -top-20 left-1/4 w-[550px] h-[550px] bg-[#005691]/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute -bottom-20 right-1/4 w-[450px] h-[450px] bg-amber-400/10 rounded-full blur-[150px] pointer-events-none" />

      {/* LEFT SIDE: Big Bold Greeting */}
      <div className="hidden lg:flex flex-col justify-center relative z-10 pl-8 space-y-2 select-none">
        <h1 className="text-8xl xl:text-9xl font-extrabold tracking-tight text-slate-800 dark:text-slate-100">
          Queue Got You?
        </h1>
        <h2 className="text-4xl xl:text-5xl font-extrabold tracking-tight text-[#005691] dark:text-sky-400">
          We’ve got you covered.
        </h2>
        <p className="text-small font-xs text-slate-500 dark:text-slate-400 pt-2 max-w-medium">
          Log in or register to access the QueueLess campus ordering platform.
        </p>
      </div>

      {/* RIGHT SIDE: Glassmorphism Form Container */}
      <div className="relative z-10 w-full max-w-lg mx-auto space-y-4">
        {isLoginView ? (
          <>
            <LoginForm onSubmit={handleLoginSubmit} />
            <div className="text-center text-xs text-slate-600 dark:text-slate-400 pt-2 font-medium">
              Don&apos;t have an account?{' '}
              <Button
                variant="link"
                className="p-0 text-xs font-semibold text-[#005691] hover:underline underline-offset-4"
                onClick={() => setIsLoginView(false)}
              >
                Register here
              </Button>
            </div>
          </>
        ) : (
          <>
            <RegisterForm onSubmit={handleRegisterSubmit} />
            <div className="text-center text-xs text-slate-600 dark:text-slate-400 pt-2 font-medium">
              Already have an account?{' '}
              <Button
                variant="link"
                className="p-0 text-xs font-semibold text-[#005691] hover:underline underline-offset-4"
                onClick={() => setIsLoginView(true)}
              >
                Log in here
              </Button>
            </div>
          </>
        )}
      </div>

    </div>
  );
};

export default LoginPage;