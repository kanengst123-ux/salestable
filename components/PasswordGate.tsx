import React, { useState, useEffect, useRef } from 'react';
import { Lock, ShieldCheck, KeyRound, AlertCircle, ArrowRight, Eye, EyeOff } from 'lucide-react';

interface PasswordGateProps {
  onAuthenticated: () => void;
}

const CORRECT_PIN = '9632';

export const PasswordGate: React.FC<PasswordGateProps> = ({ onAuthenticated }) => {
  const [pin, setPin] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [isShaking, setIsShaking] = useState<boolean>(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Auto-focus input on mount
    inputRef.current?.focus();
  }, []);

  const handleVerify = (inputPin: string) => {
    const trimmed = inputPin.trim();
    if (trimmed === CORRECT_PIN) {
      try {
        localStorage.setItem('ws_app_unlocked', 'true');
        localStorage.setItem('ws_app_auth', CORRECT_PIN);
      } catch (e) {
        console.warn('LocalStorage error:', e);
      }
      onAuthenticated();
    } else {
      setError('密碼錯誤，請重新輸入');
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 500);
      setPin('');
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleVerify(pin);
    }
  };

  const handleNumberClick = (digit: string) => {
    setError(null);
    if (pin.length < 8) {
      const nextPin = pin + digit;
      setPin(nextPin);
      if (nextPin.length === CORRECT_PIN.length) {
        handleVerify(nextPin);
      }
    }
  };

  const handleBackspace = () => {
    setError(null);
    setPin(prev => prev.slice(0, -1));
  };

  const handleClear = () => {
    setError(null);
    setPin('');
    inputRef.current?.focus();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4 select-none">
      <div 
        className={`w-full max-w-sm bg-slate-900/90 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-blue-950/40 text-center relative overflow-hidden transition-transform duration-200 ${
          isShaking ? 'translate-x-[-8px] animate-[pulse_0.1s_ease-in-out_infinite]' : ''
        }`}
      >
        {/* Decorative background glow */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none" />

        {/* Lock Icon */}
        <div className="relative mx-auto w-16 h-16 rounded-2xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center mb-5 text-blue-400 shadow-inner">
          <Lock className="w-8 h-8" />
        </div>

        {/* Header */}
        <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
          榮昇業務系統
        </h1>
        <p className="text-xs sm:text-sm text-slate-400 mt-1.5 font-medium leading-relaxed">
          首次訪問請輸入系統密碼以解鎖
        </p>

        {/* Input Box */}
        <div className="mt-6 relative">
          <div className="flex items-center bg-slate-950 border border-slate-800 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 rounded-2xl px-4 py-3 transition-all">
            <KeyRound className="w-5 h-5 text-slate-500 mr-2.5 shrink-0" />
            <input
              ref={inputRef}
              type={showPassword ? 'text' : 'password'}
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={8}
              value={pin}
              onChange={(e) => {
                setError(null);
                const val = e.target.value;
                setPin(val);
                if (val.length === CORRECT_PIN.length) {
                  handleVerify(val);
                }
              }}
              onKeyDown={handleKeyDown}
              placeholder="請輸入密碼"
              className="w-full bg-transparent text-white font-mono text-center text-lg sm:text-xl tracking-widest outline-none placeholder:text-slate-600 placeholder:text-sm placeholder:tracking-normal placeholder:font-sans"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="text-slate-500 hover:text-slate-300 ml-2 focus:outline-none shrink-0"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {/* Error Message */}
          {error && (
            <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-rose-400 mt-2.5 animate-in fade-in slide-in-from-top-1">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Numeric Keypad for convenience on touch & mobile devices */}
        <div className="grid grid-cols-3 gap-2.5 mt-6">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              type="button"
              onClick={() => handleNumberClick(digit)}
              className="h-12 rounded-xl bg-slate-800/60 hover:bg-slate-700/80 active:bg-blue-600 active:text-white text-white font-black text-lg border border-slate-700/40 transition-all flex items-center justify-center shadow-xs"
            >
              {digit}
            </button>
          ))}
          <button
            type="button"
            onClick={handleClear}
            className="h-12 rounded-xl bg-slate-800/30 hover:bg-slate-800 active:bg-slate-700 text-slate-400 hover:text-slate-200 font-bold text-xs border border-slate-800 transition-all flex items-center justify-center"
          >
            清除
          </button>
          <button
            type="button"
            onClick={() => handleNumberClick('0')}
            className="h-12 rounded-xl bg-slate-800/60 hover:bg-slate-700/80 active:bg-blue-600 active:text-white text-white font-black text-lg border border-slate-700/40 transition-all flex items-center justify-center shadow-xs"
          >
            0
          </button>
          <button
            type="button"
            onClick={handleBackspace}
            className="h-12 rounded-xl bg-slate-800/30 hover:bg-slate-800 active:bg-slate-700 text-slate-400 hover:text-slate-200 font-bold text-xs border border-slate-800 transition-all flex items-center justify-center"
          >
            刪除
          </button>
        </div>

        {/* Submit Button */}
        <button
          type="button"
          onClick={() => handleVerify(pin)}
          disabled={!pin}
          className={`w-full mt-5 py-3.5 px-4 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition-all shadow-lg ${
            pin 
              ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/30 active:scale-95' 
              : 'bg-slate-800/50 text-slate-500 border border-slate-800 cursor-not-allowed'
          }`}
        >
          <span>解鎖進入系統</span>
          <ArrowRight className="w-4 h-4" />
        </button>

        {/* Security badge note */}
        <div className="mt-5 flex items-center justify-center gap-1.5 text-[11px] font-medium text-slate-500">
          <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
          <span>驗證後此設備自動記住，無需重複輸入</span>
        </div>
      </div>
    </div>
  );
};

export default PasswordGate;
