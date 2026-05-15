/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  onSnapshot, 
  collection, 
  query, 
  orderBy, 
  where,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc,
  getDoc,
  Timestamp,
  writeBatch,
  arrayUnion
} from 'firebase/firestore';
import { 
  onAuthStateChanged, 
  User, 
  signInAnonymously 
} from 'firebase/auth';
import { 
  CheckCircle,
  Plus, 
  Settings as SettingsIcon, 
  LogOut, 
  ChevronRight, 
  CheckCircle2, 
  Clock, 
  User as UserIcon,
  Search,
  ArrowRightLeft,
  Calendar,
  Mic2,
  Trash2,
  Download,
  FileText,
  Video,
  History,
  Eye,
  PenBox,
  Pencil,
  ArrowRight,
  Bell,
  Users,
  ChevronUp,
  ChevronDown,
  Rocket,
  Archive,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { 
  X,
  BarChart2,
  PieChart as PieChartIcon,
  Share2
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell,
  Legend
} from 'recharts';
import { Timeline } from './components/Timeline';
import { getToken, onMessage } from 'firebase/messaging';
import { 
  db, 
  auth, 
  rtdb,
  messaging,
  VAPID_KEY,
  Project, 
  Settings, 
  OperationType, 
  handleFirestoreError,
  testConnection,
  ClientProfile,
  UserRole,
  ProjectStage,
  AppNotification
} from './lib/firebase';
import { 
  ref, 
  onValue, 
  set, 
  onDisconnect, 
  serverTimestamp as rtdbTimestamp 
} from 'firebase/database';
import { cn } from './lib/utils';

type Tab = 'active' | 'production' | 'submission' | 'done' | 'archive' | 'timeline';

const generateProjectID = () => {
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const random = Math.floor(100 + Math.random() * 900);
  return `PRJ-${year}${month}${day}-${random}`;
};

const calculateTotalDuration = (min: number, sec: number) => min + (sec / 60);

const safeTimestamp = (dateStr: string) => {
  if (!dateStr) return null;
  return Timestamp.fromDate(new Date(dateStr));
};

const STATUS_CONFIG: Record<Project['status'], { label: string; color: string; border: string; dot: string }> = {
  'project-entry': { label: 'Inisiasi', color: 'bg-slate-50 text-slate-500', border: 'border-slate-200', dot: 'bg-slate-400' },
  'translation-phase': { label: 'Translation', color: 'bg-blue-50 text-blue-700', border: 'border-blue-200', dot: 'bg-blue-500' },
  'editing-phase': { label: 'Editing', color: 'bg-violet-50 text-violet-700', border: 'border-violet-200', dot: 'bg-violet-500' },
  'qc-phase': { label: 'QC Phase', color: 'bg-amber-50 text-amber-700', border: 'border-amber-200', dot: 'bg-amber-500' },
  'done': { label: 'Clear', color: 'bg-emerald-50 text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  'under-revision': { label: 'Revisi: Perbaikan', color: 'bg-rose-50 text-rose-700', border: 'border-rose-200', dot: 'bg-rose-500' },
  'revision-review': { label: 'Revisi: Review', color: 'bg-indigo-50 text-indigo-700', border: 'border-indigo-200', dot: 'bg-indigo-500' },
};

interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  className?: string;
}

const Logo = ({ size = 'md', showText = true, className }: LogoProps) => {
  const sizes = {
    sm: { box: 'w-8 h-8', text: 'text-xs', icon: 14, k: 'text-xl', v: 'text-xl' },
    md: { box: 'w-12 h-12', text: 'text-sm', icon: 20, k: 'text-2xl', v: 'text-2xl' },
    lg: { box: 'w-20 h-20', text: 'text-lg', icon: 32, k: 'text-4xl', v: 'text-4xl' },
    xl: { box: 'w-32 h-32', text: 'text-2xl', icon: 48, k: 'text-6xl', v: 'text-6xl' }
  };

  const s = sizes[size];

  return (
    <div className={cn("flex flex-col items-center justify-center", className)}>
      <div className="flex items-center relative gap-0">
        <span className={cn("font-black tracking-tighter text-indigo-950", s.k)}>K</span>
        <div className={cn("relative z-10 flex items-center justify-center -mx-1", s.box)}>
          <Mic2 size={s.icon} className="text-sky-500 fill-sky-100" />
        </div>
        <span className={cn("font-black tracking-tighter text-sky-500", s.v)}>V</span>
      </div>
      {showText && (
        <span className={cn("font-medium tracking-tight text-slate-600 -mt-1", s.text)}>Voice</span>
      )}
    </div>
  );
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [rtdbOnlineUsers, setRtdbOnlineUsers] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [isRegistering, setIsRegistering] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [loginForm, setLoginForm] = useState({ name: '', role: 'translator' as UserRole });
  const [registerForm, setRegisterForm] = useState({ name: '', email: '', password: '', role: 'translator' as UserRole });
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [userSettings, setUserSettings] = useState<Settings | null>(null);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  const getFriendlyAuthError = (code: string) => {
    if (code.includes('email-already-in-use')) return "Email ini sudah terdaftar. Silakan gunakan email lain atau masuk.";
    if (code.includes('operation-not-allowed')) return "Metode Email/Password belum diaktifkan di Firebase Console.";
    if (code.includes('weak-password')) return "Password terlalu lemah. Minimal 6 karakter.";
    if (code.includes('invalid-email')) return "Format email tidak valid.";
    if (code.includes('user-not-found') || code.includes('wrong-password') || code.includes('invalid-credential') || code.includes('invalid-login-credentials')) {
      return "Email atau password salah. Pastikan data sudah benar.";
    }
    if (code.includes('user-disabled')) return "Akun ini telah dinonaktifkan.";
    if (code.includes('too-many-requests')) return "Terlalu banyak percobaan. Silakan coba lagi nanti.";
    return "Terjadi kesalahan pada sistem. Silakan coba lagi.";
  };

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((u) => {
      setUser(u);
      setLoading(false);
      if (u) {
        testConnection();
        
        // Presence Logic
        const userStatusRef = ref(rtdb, `/status/${u.uid}`);
        const connectedRef = ref(rtdb, '.info/connected');

        onValue(connectedRef, (snap) => {
          if (snap.val() === true) {
            onDisconnect(userStatusRef).set({
              state: 'offline',
              lastChanged: rtdbTimestamp()
            });

            set(userStatusRef, {
              state: 'online',
              lastChanged: rtdbTimestamp(),
              email: u.email,
              displayName: u.displayName || u.email?.split('@')[0]
            });
          }
        });
      } else {
        setUserSettings(null);
        setSettingsLoaded(false);
      }
    });

    // Subscribing to all users presence
    const allUsersStatusRef = ref(rtdb, '/status');
    const unsubscribePresence = onValue(allUsersStatusRef, (snapshot) => {
      if (snapshot.exists()) {
        setRtdbOnlineUsers(snapshot.val());
      } else {
        setRtdbOnlineUsers({});
      }
    });

    return () => {
      unsubscribe();
      unsubscribePresence();
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    const userSettingsRef = doc(db, 'settings', user.uid);
    const unsub = onSnapshot(userSettingsRef, (snapshot) => {
      if (snapshot.exists()) {
        setUserSettings(snapshot.data() as Settings);
      } else {
        setUserSettings({});
      }
      setSettingsLoaded(true);
    }, (err) => {
      console.error("Settings Load Error:", err);
      setSettingsLoaded(true);
    });
    return unsub;
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen bg-bg-main flex items-center justify-center">
        <motion.div 
          animate={{ opacity: [0.5, 1, 0.5] }} 
          transition={{ repeat: Infinity, duration: 1.5 }}
          className="text-primary font-mono text-sm uppercase tracking-widest"
        >
          ENGINE_BOOTING...
        </motion.div>
      </div>
    );
  }
  
  const handleSimpleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginForm.name) return;

    setIsLoggingIn(true);
    try {
      // For the registration option, if the user doesn't want Google, 
      // we can use Email/Password if enabled, or stay with anonymous + profile for this applet platform.
      // Given the request for "pendaftaran", we'll use a profile-first approach.
      let cred;
      if (!auth.currentUser) {
        cred = await signInAnonymously(auth);
      } else {
        cred = { user: auth.currentUser };
      }
      
      await setDoc(doc(db, 'settings', cred.user.uid), {
        profile: {
          name: loginForm.name,
          role: loginForm.role,
          updatedAt: serverTimestamp()
        }
      });
    } catch (err: any) {
      console.error("Login Error:", err);
      alert("Gagal masuk: " + err.message);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    const { createUserWithEmailAndPassword, updateProfile } = await import('firebase/auth');
    setIsLoggingIn(true);
    setAuthError(null);
    try {
      const cred = await createUserWithEmailAndPassword(auth, registerForm.email, registerForm.password);
      await updateProfile(cred.user, { displayName: registerForm.name });
      
      await setDoc(doc(db, 'settings', cred.user.uid), {
        profile: {
          name: registerForm.name,
          email: registerForm.email,
          role: registerForm.role,
          updatedAt: serverTimestamp()
        }
      });
    } catch (err: any) {
      console.error("Registration Error:", err);
      setAuthError(getFriendlyAuthError(err.code || ""));
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const { signInWithEmailAndPassword } = await import('firebase/auth');
    setIsLoggingIn(true);
    setAuthError(null);
    try {
      await signInWithEmailAndPassword(auth, registerForm.email, registerForm.password);
    } catch (err: any) {
      console.error("Login Error:", err);
      setAuthError(getFriendlyAuthError(err.code || ""));
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleGoogleLogin = async () => {
    const { signInWithPopup, GoogleAuthProvider } = await import('firebase/auth');
    try {
      const provider = new GoogleAuthProvider();
      const cred = await signInWithPopup(auth, provider);
      
      // Removed strict email check as per request "Setiap Role harus masuk dengan gmail"
      // implying all gmail users are welcome to onboard.
      
      const snap = await getDoc(doc(db, 'settings', cred.user.uid));
      if (!snap.exists()) {
        // We'll let them pick a role in the onboarding view if they don't have a profile yet
        // instead of defaulting to 'translator' silently.
      }
    } catch (err: any) {
      console.error("Google Login Error:", err);
      if (err.code === 'auth/unauthorized-domain') {
        alert("Domain ini belum diizinkan di Firebase Console.");
      } else {
        alert("Gagal masuk dengan Google: " + err.message);
      }
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl p-10 border border-slate-100"
        >
          <Logo size="lg" className="mb-8" />

          {authError && (
            <motion.div 
              id="auth-error-notif"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mb-6 p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-start gap-3 relative group"
            >
              <div className="w-5 h-5 rounded-full bg-rose-500 flex items-center justify-center text-white shrink-0 mt-0.5">
                <X size={12} />
              </div>
              <div className="text-xs font-bold text-rose-600 leading-relaxed pr-6">
                {authError}
              </div>
              <button 
                onClick={() => setAuthError(null)}
                className="absolute top-4 right-4 text-rose-300 hover:text-rose-600 transition-colors"
                title="Tutup"
              >
                <X size={14} />
              </button>
            </motion.div>
          )}
          
          <div className="flex gap-1 p-1 bg-slate-100 rounded-2xl mb-8">
            <button 
              onClick={() => {
                setIsRegistering(false);
                setAuthError(null);
              }}
              className={cn(
                "flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all",
                !isRegistering ? "bg-white text-slate-900 shadow-sm" : "text-slate-400"
              )}
            >
              Masuk
            </button>
            <button 
              onClick={() => {
                setIsRegistering(true);
                setAuthError(null);
              }}
              className={cn(
                "flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all",
                isRegistering ? "bg-white text-slate-900 shadow-sm" : "text-slate-400"
              )}
            >
              Daftar
            </button>
          </div>

          {isRegistering ? (
            <form onSubmit={handleRegister} className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Nama Lengkap</label>
                <input 
                  required
                  value={registerForm.name}
                  onChange={e => setRegisterForm({...registerForm, name: e.target.value})}
                  placeholder="Udjo Playboy"
                  className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 text-sm font-semibold focus:ring-2 focus:ring-primary outline-none transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Email</label>
                <input 
                  required
                  type="email"
                  value={registerForm.email}
                  onChange={e => setRegisterForm({...registerForm, email: e.target.value})}
                  placeholder="udjoplayboy@example.com"
                  className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 text-sm font-semibold focus:ring-2 focus:ring-primary outline-none transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Password</label>
                <input 
                  required
                  type="password"
                  value={registerForm.password}
                  onChange={e => setRegisterForm({...registerForm, password: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 text-sm font-semibold focus:ring-2 focus:ring-primary outline-none transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Role Utama</label>
                <select
                  required
                  value={registerForm.role}
                  onChange={e => setRegisterForm({...registerForm, role: e.target.value as UserRole})}
                  className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 text-sm font-semibold focus:ring-2 focus:ring-primary outline-none transition-all"
                >
                  <option value="pm">Project Manager (PM)</option>
                  <option value="head_translator">Head Translator</option>
                  <option value="translator">Translator</option>
                  <option value="head_editor">Head Editor</option>
                  <option value="editor">Editor</option>
                  <option value="head_qc">Head QC</option>
                  <option value="qc">QC Staff</option>
                </select>
              </div>
              <button 
                type="submit"
                disabled={isLoggingIn}
                className="w-full bg-primary text-white py-4 rounded-2xl font-bold hover:bg-primary-hover transition-all shadow-lg shadow-primary/30 disabled:opacity-50 mt-4"
              >
                {isLoggingIn ? 'Memproses...' : 'Daftar Akun'}
              </button>
            </form>
          ) : (
            <div className="space-y-6">
              <button 
                onClick={handleGoogleLogin}
                className="w-full flex items-center justify-center gap-3 bg-white border border-slate-200 text-slate-600 py-4 rounded-2xl font-bold hover:bg-slate-50 transition-all shadow-sm"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Masuk dengan Gmail
              </button>

              <div className="relative flex items-center justify-center py-2">
                <div className="absolute w-full h-[1px] bg-slate-100" />
                <span className="relative bg-white px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">atau</span>
              </div>

              <form onSubmit={handleEmailLogin} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Email</label>
                  <input 
                    required
                    type="email"
                    value={registerForm.email}
                    onChange={e => setRegisterForm({...registerForm, email: e.target.value})}
                    placeholder="email@gmail.com"
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 text-sm font-semibold focus:ring-2 focus:ring-primary outline-none transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Password</label>
                  <input 
                    required
                    type="password"
                    value={registerForm.password}
                    onChange={e => setRegisterForm({...registerForm, password: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 text-sm font-semibold focus:ring-2 focus:ring-primary outline-none transition-all"
                  />
                </div>
                <button 
                  type="submit"
                  disabled={isLoggingIn}
                  className="w-full bg-slate-900 text-white py-4 rounded-2xl font-bold hover:bg-slate-800 transition-all shadow-lg disabled:opacity-50"
                >
                  {isLoggingIn ? 'Memproses...' : 'Mulai Bekerja'}
                </button>
              </form>
            </div>
          )}
        </motion.div>
      </div>
    );
  }


  if (!settingsLoaded && user) {
    return (
      <div className="min-h-screen bg-bg-main flex items-center justify-center">
        <motion.div 
          animate={{ opacity: [0.5, 1, 0.5] }} 
          transition={{ repeat: Infinity, duration: 1.5 }}
          className="text-primary font-mono text-sm uppercase tracking-widest"
        >
          SYNCING_SETTINGS...
        </motion.div>
      </div>
    );
  }

  if (user && settingsLoaded && !userSettings?.profile) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl p-10 border border-slate-100"
        >
          <div className="text-center mb-8">
            <div className="w-20 h-20 bg-primary/10 rounded-3xl flex items-center justify-center text-primary mx-auto mb-4">
              <UserIcon size={40} />
            </div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">Lengkapi Profil Anda</h2>
            <p className="text-slate-500 text-sm mt-2">Pilih peran dan nama untuk memulai kolaborasi.</p>
          </div>

          <form 
            onSubmit={async (e) => {
              e.preventDefault();
              setIsLoggingIn(true);
              try {
                await setDoc(doc(db, 'settings', user.uid), {
                  profile: {
                    name: loginForm.name || user.displayName || 'User',
                    email: user.email || '',
                    role: loginForm.role,
                    updatedAt: serverTimestamp()
                  }
                });
              } catch (err) {
                console.error(err);
                alert("Gagal menyimpan profil.");
              } finally {
                setIsLoggingIn(false);
              }
            }}
            className="space-y-6"
          >
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Nama Tampilan</label>
              <input 
                required
                value={loginForm.name || user.displayName || ''}
                onChange={e => setLoginForm({...loginForm, name: e.target.value})}
                className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 text-sm font-semibold focus:ring-2 focus:ring-primary outline-none transition-all"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Peran Anda</label>
              <select
                required
                value={loginForm.role}
                onChange={e => setLoginForm({...loginForm, role: e.target.value as UserRole})}
                className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 text-sm font-semibold focus:ring-2 focus:ring-primary outline-none transition-all"
              >
                <option value="pm">Project Manager (PM)</option>
                <option value="head_translator">Head Translator</option>
                <option value="translator">Translator</option>
                <option value="head_editor">Head Editor</option>
                <option value="editor">Editor</option>
                <option value="head_qc">Head QC</option>
                <option value="qc">QC Staff</option>
              </select>
            </div>

            <button 
              type="submit"
              disabled={isLoggingIn}
              className="w-full bg-primary text-white py-4 rounded-2xl font-bold hover:bg-primary-hover transition-all shadow-lg shadow-primary/30 disabled:opacity-50"
            >
              {isLoggingIn ? 'Menyimpan...' : 'Selesaikan Profil'}
            </button>
            
            <button 
              type="button"
              onClick={() => auth.signOut()}
              className="w-full text-slate-400 text-xs font-bold hover:text-slate-600 transition-all mt-4"
            >
              Ganti Akun / Logout
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  return <Dashboard user={user} userSettings={userSettings || {}} setUserSettings={setUserSettings} rtdbOnlineUsers={rtdbOnlineUsers} />;
}

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

function Modal({ isOpen, onClose, title, children }: ModalProps) {
  if (!isOpen) return null;
  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0 }} 
          animate={{ opacity: 1 }} 
          exit={{ opacity: 0 }} 
          onClick={onClose} 
          className="absolute inset-0 bg-slate-950/80 backdrop-blur-md" 
        />
        <motion.div 
          initial={{ scale: 0.9, opacity: 0, y: 30 }} 
          animate={{ scale: 1, opacity: 1, y: 0 }} 
          exit={{ scale: 0.9, opacity: 0, y: 30 }} 
          className="relative w-full max-w-xl bg-white rounded-[2rem] shadow-2xl overflow-hidden border border-white/20"
        >
          <div className="px-10 py-8 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
            <h3 className="text-2xl font-black tracking-tight text-slate-900">{title}</h3>
            <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-full bg-white border border-slate-200 text-slate-400 hover:text-slate-900 hover:border-slate-300 transition-all shadow-sm">
              <Plus size={24} className="rotate-45" />
            </button>
          </div>
          {children}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

// APP VERSION SETTINGS
const IS_TEAM_VERSION = true;

function Dashboard({ 
  user, 
  userSettings, 
  setUserSettings, 
  rtdbOnlineUsers 
}: { 
  user: User; 
  userSettings: Settings; 
  setUserSettings: React.Dispatch<React.SetStateAction<Settings | null>>;
  rtdbOnlineUsers: any;
}) {
  const [activeTab, setActiveTab] = useState<Tab>('active');
  
  const [projects, setProjects] = useState<Project[]>([]);
  const [teamMembers, setTeamMembers] = useState<{id: string, name: string, role?: string, email?: string}[]>([]);
  const [settings, setSettings] = useState<Settings>({});

  useEffect(() => {
    // Listen for all projects
    const unsubProjects = onSnapshot(collection(db, 'projects'), (snap) => {
      setProjects(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Project)));
    });

    // Listen for all users (team members)
    const unsubMembers = onSnapshot(collection(db, 'settings'), (snap) => {
      setTeamMembers(snap.docs.map(doc => ({ 
        id: doc.id, 
        name: doc.data().profile?.name || '...',
        role: doc.data().profile?.role,
        email: doc.data().profile?.email
      })));
    });

    // Listen for global settings (if any) or just re-use userSettings for some parts
    // Actually, global settings would be at settings/global or similar. 
    // For now, let's just ensure we have the listeners.

    return () => {
      unsubProjects();
      unsubMembers();
    };
  }, []);

  const formatDuration = (decimalMinutes: number) => {
    const mins = Math.floor(decimalMinutes);
    const secs = Math.round((decimalMinutes - mins) * 60);
    return `${mins},${secs < 10 ? '0' + secs : secs}`;
  };

  const isMyTurn = (project: Project, profile: Settings['profile'], userId: string) => {
    if (!profile) return false;
    
    // Project-specific role or global role
    const role = project.memberRoles?.[userId] || profile.role;
    const { status, stages } = project;
    
    if (role === 'pm') return true;

    // Sequential check
    if (status === 'project-entry') return false; // Only PM starts it

    if (status === 'under-revision' || status === 'revision-review') {
      const cat = project.revisionCategory;
      if (!cat) return false;
      
      const stage = project.stages[cat];
      
      // Stage mapping
      const roleMap = {
        translation: { staff: 'translator', head: 'head_translator', field: 'translators' },
        editing: { staff: 'editor', head: 'head_editor', field: 'editors' },
        qc: { staff: 'qc', head: 'head_qc', field: 'qcStaff' }
      } as const;

      const config = roleMap[cat];
      if (role === config.staff && (stage.staffIds?.includes(userId) || (project as any)[config.field]?.includes(userId))) {
        return status === 'under-revision';
      }
      if (role === config.head && (project as any)[`head${cat.charAt(0).toUpperCase() + cat.slice(1)}`] === userId) {
        return status === 'revision-review';
      }
      
      // Always include Head QC for ANY revision review after head div approved
      if (role === 'head_qc' && project.headQC === userId && status === 'revision-review') {
        return true;
      }

      return false;
    }

    if (status === 'translation-phase') {
      if (role === 'translator' && (stages.translation.staffIds?.includes(userId) || project.translators?.includes(userId))) {
        return stages.translation.status === 'in_progress' || stages.translation.status === 'rejected';
      }
      if (role === 'head_translator' && project.headTranslator === userId) {
        // Head can either assign staff OR review
        return stages.translation.status === 'pending' || stages.translation.status === 'review';
      }
    }

    if (status === 'editing-phase') {
      if (role === 'editor' && (stages.editing.staffIds?.includes(userId) || project.editors?.includes(userId))) {
        return stages.editing.status === 'in_progress' || stages.editing.status === 'rejected';
      }
      if (role === 'head_editor' && project.headEditor === userId) {
        return stages.editing.status === 'pending' || stages.editing.status === 'review';
      }
    }

    if (status === 'qc-phase') {
      if (role === 'qc' && (stages.qc.staffIds?.includes(userId) || project.qcStaff?.includes(userId))) {
        return stages.qc.status === 'in_progress' || stages.qc.status === 'rejected';
      }
      if (role === 'head_qc' && project.headQC === userId) {
        return stages.qc.status === 'pending' || stages.qc.status === 'review';
      }
    }

    return false;
  };

  const getMemberName = (ids: string | string[] | undefined) => {
    if (!ids) return '-';
    if (Array.isArray(ids)) {
      return ids.map(uid => teamMembers.find(m => m.id === uid)?.name || '...').join(', ');
    }
    return teamMembers.find(m => m.id === ids)?.name || '...';
  };

  const isSuperUser = userSettings.profile?.email === 'ayahnieda@gmail.com';
  const myRole = userSettings.profile?.role;
  const attentionProjects = projects.filter(p => isMyTurn(p, userSettings.profile, user.uid));
  const canManageProjects = isSuperUser || myRole === 'pm';
  const canManageTeam = isSuperUser || myRole === 'pm';
  const canSeeReports = isSuperUser || myRole === 'pm' || myRole?.startsWith('head_');
  const [isPushLoading, setIsPushLoading] = useState(false);

  const requestNotificationPermission = async () => {
    if (!messaging || !('serviceWorker' in navigator)) {
      alert('Browser Anda tidak mendukung Web Push notifications.');
      return;
    }
    setIsPushLoading(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
        const token = await getToken(messaging, { 
          vapidKey: VAPID_KEY,
          serviceWorkerRegistration: registration 
        });
        
        if (token) {
          const userRef = doc(db, 'settings', user.uid);
          await updateDoc(userRef, {
            'profile.fcmToken': token,
            'profile.updatedAt': serverTimestamp()
          });
          alert('Notifikasi berhasil diaktifkan! Anda akan menerima update real-time.');
        }
      } else {
        alert('Izin notifikasi ditolak. Anda dapat mengaktifkannya nanti di Pengaturan.');
      }
    } catch (err) {
      console.error('Error getting push token', err);
      alert('Gagal mengaktifkan notifikasi: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsPushLoading(false);
    }
  };

  useEffect(() => {
    if (messaging) {
      const unsubMessage = onMessage(messaging, (payload) => {
        console.log('Message received. ', payload);
        if (payload.notification) {
          alert(`${payload.notification.title}: ${payload.notification.body}`);
        }
      });
      return () => unsubMessage();
    }
  }, []);
  const [isAdding, setIsAdding] = useState(false);
  const [isManageClientsOpen, setIsManageClientsOpen] = useState(false);
  const [clientProfiles, setClientProfiles] = useState<ClientProfile[]>([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string, type: 'project' | 'client' } | null>(null);
  const [isClientView, setIsClientView] = useState(false);
  const [projectHoldingRoleSelection, setProjectHoldingRoleSelection] = useState<Project | null>(null);
  const [showOnlyMyProjects, setShowOnlyMyProjects] = useState<boolean>(false);

  const [sortField, setSortField] = useState<'client' | 'title' | 'deadline'>('deadline');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const toggleSort = (field: 'client' | 'title' | 'deadline') => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const selectAllFiltered = () => {
    const allFilteredIds = filteredProjects.map(p => p.id);
    if (selectedIds.length === allFilteredIds.length && allFilteredIds.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(allFilteredIds);
    }
  };

  const handleBatchUpdate = async (updates: Partial<Project>) => {
    if (selectedIds.length === 0) return;
    
    if (!window.confirm(`Update ${selectedIds.length} proyek sekaligus?`)) return;

    const batch = writeBatch(db);
    selectedIds.forEach(id => {
      const docRef = doc(db, 'projects', id);
      batch.update(docRef, {
        ...updates,
        updatedAt: serverTimestamp()
      });
    });

    try {
      await batch.commit();
      setSelectedIds([]);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `batch-update/${selectedIds.length}-projects`);
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    setDeleteTarget({ id: projectId, type: 'project' });
    setIsDeleting(true);
  };

  const [showHistoryFor, setShowHistoryFor] = useState<Project | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', user.uid)
      // Removing orderBy to avoid index requirement, sorting client-side below
    );
    const unsub = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AppNotification));
      // Manual client-side sort
      docs.sort((a, b) => {
        const timeA = (a.createdAt as any)?.toMillis?.() || (a.createdAt as any)?.seconds * 1000 || 0;
        const timeB = (b.createdAt as any)?.toMillis?.() || (b.createdAt as any)?.seconds * 1000 || 0;
        return timeB - timeA;
      });
      setNotifications(docs);
    }, (err) => {
      console.error("Notification Load Error:", err);
    });
    return unsub;
  }, [user]);

  const handleMarkNotificationAsRead = async (notificationId: string) => {
    try {
      const notifRef = doc(db, 'notifications', notificationId);
      await updateDoc(notifRef, { read: true });
    } catch (err) {
      console.error("Mark Read Error:", err);
    }
  };

  const handleSendNotification = async (userId: string, title: string, message: string, type: AppNotification['type'], projectId?: string) => {
    try {
      await addDoc(collection(db, 'notifications'), {
        userId,
        title,
        message,
        type,
        read: false,
        projectId,
        createdAt: serverTimestamp()
      });
    } catch (err) {
      console.error("Send Notification Error:", err);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.type === 'project') {
        await deleteDoc(doc(db, 'projects', deleteTarget.id));
      } else {
        await deleteDoc(doc(db, 'clients', deleteTarget.id));
      }
      setIsDeleting(false);
      setDeleteTarget(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `${deleteTarget.type === 'project' ? 'projects' : 'clients'}/${deleteTarget.id}`);
    }
  };

  const generateTeamReport = () => {
    if (!canSeeReports) return;
    const doc = new jsPDF();
    const activeProjects = [...projects].filter(p => {
      const matchesTab = activeTab === 'active' ? p.status !== 'done' : p.status === 'done';
      const matchesSearch = p.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            p.client.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesTab && matchesSearch;
    }).sort((a, b) => a.client.localeCompare(b.client));

    doc.setFontSize(22);
    doc.setTextColor(30, 41, 59);
    doc.text('LAPORAN PROGRESS TIM', 14, 20);
    
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text(`Status Laporan: ${activeTab === 'active' ? 'SEDANG BERJALAN' : 'SELESAI'}`, 14, 28);
    doc.text(`Dibuat pada: ${new Date().toLocaleString('id-ID')}`, 14, 33);

    const tableData = activeProjects.map(p => {
      const deadlineStr = p.deadline ? (p.deadline.toDate ? p.deadline.toDate().toLocaleDateString('id-ID') : new Date(p.deadline).toLocaleDateString('id-ID')) : '-';
      const stageStr = `TR: ${p.stages.translation.status} | ED: ${p.stages.editing.status} | QC: ${p.stages.qc.status}`;
      
      return [
        p.client.toUpperCase(),
        p.title,
        p.status.replace('-', ' ').toUpperCase(),
        stageStr,
        formatDuration(p.duration),
        deadlineStr
      ];
    });

    autoTable(doc, {
      startY: 40,
      head: [['Klien', 'Judul Film', 'Status Utama', 'Progress Tahapan', 'Durasi', 'Deadline']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [51, 65, 85], fontSize: 8, cellPadding: 2, halign: 'center' },
      bodyStyles: { fontSize: 7, cellPadding: 2 },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 25 },
        1: { cellWidth: 40 },
        3: { cellWidth: 45 },
        4: { halign: 'center' },
        5: { halign: 'right' }
      }
    });

    doc.save(`Production_Report_${activeTab}_${new Date().toISOString().split('T')[0]}.pdf`);
  };


  const copyWASummary = (project: Project) => {
    const getStageStatusLabel = (stage: ProjectStage) => {
      switch (stage.status) {
        case 'approved': return 'CLEARED ✅';
        case 'review': return 'UNDER REVIEW ⏳';
        case 'in_progress': return 'IN PROGRESS 🎧';
        case 'rejected': return 'NEEDS REVISION ❌';
        default: return 'WAITING... 💤';
      }
    };

    const summary = `
📊 *KV VOICE - STATUS REPORT*
━━━━━━━━━━━━━━━━━━━━━━━━
📌 *Title:* ${project.title}
🏢 *Client:* ${project.client}
🎭 *Service:* ${project.serviceType.toUpperCase()}
⏱️ *Duration:* ${project.duration} Min

✅ *PRODUCTION PIPELINE:*
• Translation: ${getStageStatusLabel(project.stages.translation)}
• Editing/Mixing: ${getStageStatusLabel(project.stages.editing)}
• QC Review: ${getStageStatusLabel(project.stages.qc)}

━━━━━━━━━━━━━━━━━━━━━━━━
📊 *OVERALL STATUS:* ${STATUS_CONFIG[project.status]?.label?.toUpperCase() || project.status.toUpperCase()}
📅 *LAST UPDATE:* ${project.updatedAt?.toDate ? project.updatedAt.toDate().toLocaleString('id-ID') : 'Baru saja'}

🔗 *Preview:* ${project.stages.qc.resultLink || project.stages.editing.resultLink || '-'}
🚀 _Laporan terkirim via KV Management System_
    `.trim();

    navigator.clipboard.writeText(summary).then(() => {
      alert("Summary Progres berhasil disalin! Siap di-paste ke WhatsApp.");
    });
  };

  const isStale = (project: Project) => {
    if (project.status === 'done') return false;
    const lastUpdate = project.lastStatusUpdateAt?.toDate ? project.lastStatusUpdateAt.toDate() : (project.lastStatusUpdateAt ? new Date(project.lastStatusUpdateAt) : project.createdAt?.toDate ? project.createdAt.toDate() : (project.createdAt ? new Date(project.createdAt) : new Date(0)));
    if (!lastUpdate || lastUpdate.getTime() === 0) return false;
    const diffDays = (new Date().getTime() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24);
    return diffDays > 2;
  };

  const [newProject, setNewProject] = useState({
    client: '',
    title: '',
    duration: 1,
    min: 1,
    sec: 0,
    deadline: '',
    translators: [] as string[],
    headTranslator: '',
    editors: [] as string[],
    headEditor: '',
    qcStaff: [] as string[],
    headQC: '',
    serviceType: 'dubbing' as Project['serviceType'],
    scriptLink: '',
    referenceLink: '',
  });

  const handleAssignStaff = async (projectId: string, stage: keyof Project['stages'], staffIds: string[]) => {
    try {
      const projRef = doc(db, 'projects', projectId);
      const updates: any = {
        [`stages.${stage}.staffIds`]: staffIds,
        [`stages.${stage}.assignedAt`]: serverTimestamp(),
        [`stages.${stage}.status`]: 'in_progress',
        updatedAt: serverTimestamp()
      };

      // Also sync to the legacy arrays for UI consistency if needed
      if (stage === 'translation') updates.translators = staffIds;
      else if (stage === 'editing') updates.editors = staffIds;
      else if (stage === 'qc') updates.qcStaff = staffIds;

      // Update memberRoles to include new staff
      const p = projects.find(proj => proj.id === projectId);
      if (p) {
        const newRoles = { ...p.memberRoles };
        staffIds.forEach(id => {
          newRoles[id] = stage === 'translation' ? 'translator' : stage === 'editing' ? 'editor' : 'qc';
        });
        updates.memberRoles = newRoles;
      }

      await updateDoc(projRef, updates);
      await handleLogAction(projectId, `${stage.toUpperCase()}_ASSIGNED`, `Staff assigned: ${getMemberName(staffIds)}`);
      
      staffIds.forEach(id => {
        handleSendNotification(
          id,
          "Tugas Baru Terdeteksi",
          `Anda ditugaskan pada proyek: ${p?.title} (${stage.toUpperCase()}). Segera cek workstation!`,
          'assignment',
          projectId
        );
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `projects/${projectId}/assign-${stage}`);
    }
  };

  const handleOpenRevision = async (projectId: string, category: 'translation' | 'editing' | 'qc', feedback: string) => {
    try {
      const projRef = doc(db, 'projects', projectId);
      const p = projects.find(proj => proj.id === projectId);
      if (!p) return;

      const historyItem = {
        category,
        feedback,
        requestedBy: user.uid,
        createdAt: new Date().toISOString()
      };

      await updateDoc(projRef, {
        status: 'under-revision',
        isRevision: true,
        revisionCategory: category,
        revisionHistory: [...(p.revisionHistory || []), historyItem],
        [`stages.${category}.status`]: 'in_progress',
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `projects/${projectId}/open-revision`);
    }
  };

  const handleAddProject = async (e: React.FormEvent) => {
    e.preventDefault();
    const totalDur = calculateTotalDuration(newProject.min, newProject.sec);
    
    // Validate assignments
    if (!newProject.headTranslator || !newProject.headEditor || !newProject.headQC) {
      alert('Semua kepala tim (Head) harus ditunjuk.');
      return;
    }

    try {
      const memberRoles: { [userId: string]: UserRole } = {
        [user.uid]: 'pm'
      };

      // Add project heads to roles map
      if (newProject.headTranslator) memberRoles[newProject.headTranslator] = 'head_translator';
      if (newProject.headEditor) memberRoles[newProject.headEditor] = 'head_editor';
      if (newProject.headQC) memberRoles[newProject.headQC] = 'head_qc';

      await addDoc(collection(db, 'projects'), {
        projectCode: generateProjectID(),
        client: newProject.client,
        title: newProject.title,
        duration: totalDur,
        deadline: safeTimestamp(newProject.deadline),
        serviceType: newProject.serviceType,
        scriptLink: newProject.scriptLink || '',
        referenceLink: newProject.referenceLink || '',
        status: 'project-entry',
        headTranslator: newProject.headTranslator,
        headEditor: newProject.headEditor,
        headQC: newProject.headQC,
        stages: {
          translation: { status: 'pending' },
          editing: { status: 'pending' },
          qc: { status: 'pending' }
        },
        memberRoles,
        ownerId: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        history: [{
          userId: user.uid,
          action: 'PROJECT_CREATED',
          timestamp: new Date(),
          details: 'Project initially entered into system.'
        }]
      });
      setIsAdding(false);
      setNewProject({ 
        client: '', 
        title: '', 
        duration: 1, 
        min: 1,
        sec: 0,
        deadline: '',
        translators: [],
        headTranslator: '',
        editors: [],
        headEditor: '',
        qcStaff: [],
        headQC: '',
        serviceType: 'dubbing', 
        scriptLink: '',
        referenceLink: '',
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'projects');
    }
  };

  const [isEditingProject, setIsEditingProject] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);

  const formatDateForInput = (timestamp: any) => {
    if (!timestamp) return '';
    try {
      const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      return d.toISOString().split('T')[0];
    } catch (e) {
      return '';
    }
  };

  const isKukuTV = (name: string) => (name || '').toLowerCase().replace(/\s/g, '').includes('kukutv');
  const isGlobal100 = (name: string) => (name || '').toLowerCase().replace(/\s/g, '').includes('global100');

  const handleUpdateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProject) return;
    
    try {
      const { id, deadline, translator, editor, breakdownBy, ...updateData } = editingProject;
      const projRef = doc(db, 'projects', id);
      
      let cleanedDeadline = null;
      if (deadline) {
        if (deadline instanceof Timestamp) {
          cleanedDeadline = deadline;
        } else if (deadline.toDate) {
          cleanedDeadline = deadline;
        } else {
          cleanedDeadline = safeTimestamp(deadline);
        }
      }

      await updateDoc(projRef, {
        ...updateData,
        deadline: cleanedDeadline,
        translator: translator || '',
        editor: editor || '',
        breakdownBy: breakdownBy || '',
        updatedAt: serverTimestamp()
      });

      await handleLogAction(id, 'PROJECT_UPDATED', `Detail proyek diperbarui oleh PM/Owner`);

      setIsEditingProject(false);
      setEditingProject(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `projects/${editingProject.id}`);
    }
  };

  const handleAssignProjectRole = async (projectId: string, role: UserRole) => {
    try {
      const projRef = doc(db, 'projects', projectId);
      await updateDoc(projRef, {
        [`memberRoles.${user.uid}`]: role,
        updatedAt: serverTimestamp()
      });
      
      const p = projects.find(proj => proj.id === projectId);
      if (p) {
        setEditingProject({ ...p, memberRoles: { ...p.memberRoles, [user.uid]: role } });
        setIsEditingProject(true);
      }
      
      setProjectHoldingRoleSelection(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `projects/${projectId}`);
    }
  };

  const handleLogAction = async (projectId: string, action: string, details?: string) => {
    try {
      const projRef = doc(db, 'projects', projectId);
      await updateDoc(projRef, {
        history: arrayUnion({
          userId: user.uid,
          action,
          timestamp: new Date(),
          details: details || ''
        })
      });
    } catch (err) {
      console.error("Log Error:", err);
    }
  };

  const [isSwapModalOpen, setIsSwapModalOpen] = useState(false);
  const [swapData, setSwapData] = useState<{ projectId: string; stage: keyof Project['stages']; oldStaffIds: string[] } | null>(null);
  const [swapReason, setSwapReason] = useState('');
  const [selectedSwapNewStaffIds, setSelectedSwapNewStaffIds] = useState<string[]>([]);

  const handleSwapStaff = async () => {
    if (!swapData || selectedSwapNewStaffIds.length === 0 || !swapReason) {
      alert("Harap pilih staf baru dan masukkan alasan penggantian.");
      return;
    }

    const { projectId, stage, oldStaffIds } = swapData;

    try {
      const projRef = doc(db, 'projects', projectId);
      const p = projects.find(proj => proj.id === projectId);
      if (!p) return;

      const newRoles = { ...p.memberRoles };
      oldStaffIds.forEach(id => {
        // Keep Heads/PMs but remove specialized staff roles
        if (id !== p.headTranslator && id !== p.headEditor && id !== p.headQC && id !== p.ownerId) {
          delete newRoles[id];
        }
      });
      
      const roleType = stage === 'translation' ? 'translator' : stage === 'editing' ? 'editor' : 'qc';
      selectedSwapNewStaffIds.forEach(id => {
        newRoles[id] = roleType as UserRole;
      });

      await updateDoc(projRef, {
        [`stages.${stage}.staffIds`]: selectedSwapNewStaffIds,
        memberRoles: newRoles,
        updatedAt: serverTimestamp(),
      });

      await handleLogAction(projectId, 'STAFF_SWAP', `Handover from ${getMemberName(oldStaffIds)} to ${getMemberName(selectedSwapNewStaffIds)}. Reason: ${swapReason}`);
      
      selectedSwapNewStaffIds.forEach(id => {
        handleSendNotification(
          id,
          "TUGAS PENGGANTI (URGENT)",
          `Tugas dialihkan kepada Anda: ${p.title} (${stage.toUpperCase()}). Segera lanjutkan pengerjaan!`,
          'assignment',
          projectId
        );
      });

      oldStaffIds.forEach(id => {
        handleSendNotification(
          id,
          "Akses Dicabut",
          `Penugasan Anda pada proyek ${p.title} telah dialihkan.`,
          'update',
          projectId
        );
      });
      
      setIsSwapModalOpen(false);
      setSwapData(null);
      setSwapReason('');
      setSelectedSwapNewStaffIds([]);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `projects/${projectId}/swap-${stage}`);
    }
  };

  const handleStartWorking = async (projectId: string, stage: keyof Project['stages']) => {
    try {
      const projRef = doc(db, 'projects', projectId);
      await updateDoc(projRef, {
        [`stages.${stage}.startedAt`]: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastStatusUpdateAt: serverTimestamp()
      });
      await handleLogAction(projectId, `${stage.toUpperCase()}_STARTED`, `Staff started working on ${stage}`);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `projects/${projectId}/start-${stage}`);
    }
  };

  const handleUpdateStageStatus = async (projectId: string, stage: keyof Project['stages'], newStatus: ProjectStage['status'], feedback?: string) => {
    try {
      const projRef = doc(db, 'projects', projectId);
      const p = projects.find(proj => proj.id === projectId);
      if (!p) return;

      const updates: any = {
        [`stages.${stage}.status`]: newStatus,
        updatedAt: serverTimestamp(),
        lastStatusUpdateAt: serverTimestamp()
      };

      if (feedback) updates[`stages.${stage}.feedback`] = feedback;
      
      if (newStatus === 'approved') {
        updates[`stages.${stage}.completedAt`] = serverTimestamp();
        
        if (p.status === 'under-revision') {
          // Linear re-verification: Translation -> Editing -> QC -> Done (Re-Released)
          if (stage === 'translation') {
            updates.status = 'revision-review';
            updates['stages.editing.status'] = 'pending'; // Roll forward to editing
            updates.revisionCategory = 'editing'; // Update current revision category
          } else if (stage === 'editing') {
            updates.status = 'revision-review';
            updates['stages.qc.status'] = 'pending'; // Roll forward to QC
            updates.revisionCategory = 'qc';
          } else if (stage === 'qc') {
            updates.status = 'done'; // Finished re-verification
            updates.isRevision = false;
          }
        } else if (p.status === 'revision-review') {
          // If we are in the middle of re-verification
          if (stage === 'editing') {
             updates['stages.qc.status'] = 'pending';
             updates.revisionCategory = 'qc';
          } else if (stage === 'qc') {
             updates.status = 'done';
             updates.isRevision = false;
          }
        } else {
          // Normal phase advancing
          if (stage === 'translation') updates.status = 'editing-phase';
          else if (stage === 'editing') updates.status = 'qc-phase';
          else if (stage === 'qc') updates.status = 'done';
        }
      } else if (newStatus === 'rejected') {
        const staffIds = p.stages[stage].staffIds || [];
        staffIds.forEach(id => {
          handleSendNotification(
            id,
            "Pekerjaan Ditolak / Revisi",
            `Pekerjaan Anda pada ${p.title} (${stage.toUpperCase()}) ditolak oleh Head. Cek catatan revisi!`,
            'rejection',
            projectId
          );
        });
      } else if (newStatus === 'in_progress') {
        updates[`stages.${stage}.assignedAt`] = serverTimestamp();
        
        if (p.status !== 'under-revision') {
          // Ensure overall status matches the stage being worked on in normal flow
          if (stage === 'translation') updates.status = 'translation-phase';
          else if (stage === 'editing') updates.status = 'editing-phase';
          else if (stage === 'qc') updates.status = 'qc-phase';
        }
      }

      await updateDoc(projRef, updates);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `projects/${projectId}/stages/${stage}`);
    }
  };

  const handleFinalRelease = async (projectId: string) => {
    try {
      const projRef = doc(db, 'projects', projectId);
      await updateDoc(projRef, {
        isFinalReleased: true,
        finalReleaseAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      await handleLogAction(projectId, "FINAL_RELEASE", "Project fully released to client.");
      alert("Proyek berhasil di-release final ke klien!");
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `projects/${projectId}/release`);
    }
  };

  const copyProjectSummary = (p: Project) => {
    const summary = `
📝 *LAPORAN PROGRES KV VOICE STUDIO*
📌 *Judul:* ${p.title}
🏢 *Klien:* ${p.client}
📊 *Status:* ${p.status.toUpperCase().replace(/-/g, ' ')}
📅 *Terakhir Update:* ${p.updatedAt?.toDate ? p.updatedAt.toDate().toLocaleString('id-ID') : 'Baru saja'}

✅ *PROGRES TAHAPAN:*
- Translation: ${p.stages.translation.status.toUpperCase()}
- Editing/Mixing: ${p.stages.editing.status.toUpperCase()}
- QC/Final Review: ${p.stages.qc.status.toUpperCase()}

🔗 *LINK REFERENSI:* ${p.referenceLink || '-'}
🔗 *LINK NASKAH:* ${p.scriptLink || '-'}

🚀 _Laporan otomatis dari Sistem Produksi KV Voice_
    `.trim();

    navigator.clipboard.writeText(summary).then(() => {
      alert("Summary berhasil disalin ke clipboard! Siap di-paste ke WhatsApp.");
    });
  };

  const handleUpdateResultLink = async (projectId: string, stage: keyof Project['stages'], link: string) => {
    try {
      const projRef = doc(db, 'projects', projectId);
      await updateDoc(projRef, {
        [`stages.${stage}.resultLink`]: link,
        updatedAt: serverTimestamp(),
        lastStatusUpdateAt: serverTimestamp()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `projects/${projectId}/link-${stage}`);
    }
  };

  const handleManualTriggerRevision = async (projectId: string, category: 'translation' | 'editing' | 'qc') => {
    try {
      const projRef = doc(db, 'projects', projectId);
      await updateDoc(projRef, {
        status: 'under-revision',
        isRevision: true,
        isPriority: true,
        revisionCategory: category,
        [`stages.${category}.status`]: 'in_progress',
        updatedAt: serverTimestamp(),
        lastStatusUpdateAt: serverTimestamp()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `projects/${projectId}/manual-revision`);
    }
  };

  const handleStartProject = async (projectId: string) => {
    try {
      await updateDoc(doc(db, 'projects', projectId), {
        status: 'translation-phase',
        'stages.translation.status': 'in_progress',
        'stages.translation.assignedAt': serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastStatusUpdateAt: serverTimestamp()
      });
      await handleLogAction(projectId, "PROJECT_STARTED", "Project moved to Translation Phase");
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `projects/${projectId}/start`);
    }
  };
  
  const handleCloseProject = async (projectId: string) => {
    try {
      await updateDoc(doc(db, 'projects', projectId), {
        status: 'done',
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `projects/${projectId}/close`);
    }
  };

  const getSummaryStats = () => {
    const entryCount = projects.filter(p => p.status === 'project-entry').length;
    const productionCount = projects.filter(p => ['translate', 'subtitle-burn', 'breakdown', 'recording', 'editing'].includes(p.status)).length;
    const submissionCount = projects.filter(p => ['submission', 'revision'].includes(p.status)).length;
    const doneCount = projects.filter(p => p.status === 'done').length;

    return { 
      entryCount,
      productionCount,
      submissionCount,
      doneCount,
      totalProjects: projects.length,
    };
  };

  const stats = getSummaryStats();

  const [teamMemberFilter, setTeamMemberFilter] = useState<string>('all');

  const filteredProjects = projects.filter(p => {
    // Focus Mode: Non-PM staff only see projects they are assigned to
    if (!isSuperUser && myRole !== 'pm') {
      const isMyProject = p.memberRoles?.[user.uid] || 
                          p.headTranslator === user.uid || 
                          p.headEditor === user.uid || 
                          p.headQC === user.uid ||
                          p.stages.translation.staffIds?.includes(user.uid) ||
                          p.stages.editing.staffIds?.includes(user.uid) ||
                          p.stages.qc.staffIds?.includes(user.uid);
      if (!isMyProject) return false;
    }

    if (searchTerm) {
      const matchesSearch = p.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            p.client.toLowerCase().includes(searchTerm.toLowerCase());
      if (!matchesSearch) return false;
    }

    if (teamMemberFilter !== 'all') {
      // Find if this project has this member assigned via memberRoles
      const isAssigned = p.memberRoles?.[teamMemberFilter];
      
      if (!isAssigned) return false;
    }

    if (showOnlyMyProjects) {
      if (!p.memberRoles?.[user.uid]) return false;
    }

    if (activeTab === 'archive') {
      return p.isFinalReleased === true;
    }

    if (activeTab === 'active') {
      return p.status !== 'done' && !p.isFinalReleased;
    } else if (activeTab === 'done') {
      return p.status === 'done' && !p.isFinalReleased;
    }
    return true;
  }).sort((a, b) => {
    let comparison = 0;
    if (sortField === 'client') {
      comparison = a.client.localeCompare(b.client);
    } else if (sortField === 'title') {
      comparison = a.title.localeCompare(b.title);
    } else {
      const dateA = a.deadline?.toDate ? a.deadline.toDate() : (a.deadline ? new Date(a.deadline) : new Date(8640000000000000));
      const dateB = b.deadline?.toDate ? b.deadline.toDate() : (b.deadline ? new Date(b.deadline) : new Date(8640000000000000));
      comparison = dateA.getTime() - dateB.getTime();
      
      // If deadlines are equal (or both missing), fall back to createdAt (newest first)
      if (comparison === 0) {
        const createA = a.createdAt?.toDate ? a.createdAt.toDate() : (a.createdAt ? new Date(a.createdAt) : new Date(0));
        const createB = b.createdAt?.toDate ? b.createdAt.toDate() : (b.createdAt ? new Date(b.createdAt) : new Date(0));
        comparison = createB.getTime() - createA.getTime();
      }
    }
    return sortDirection === 'asc' ? comparison : -comparison;
  });

  useEffect(() => {
    setSelectedIds([]); // Reset selection when tab changes
  }, [activeTab]);


  const handleUpdateMemberRole = async (memberUserId: string, newRole: UserRole) => {
    try {
      await updateDoc(doc(db, 'settings', memberUserId), {
        'profile.role': newRole,
        'profile.updatedAt': serverTimestamp()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `settings/${memberUserId}`);
    }
  };

  const onlineCount = Object.values(rtdbOnlineUsers || {}).filter((u: any) => u.state === 'online').length;
  const onlineNames = Object.values(rtdbOnlineUsers || {}).filter((u: any) => u.state === 'online').map((u: any) => u.displayName || u.email).join(', ');

  return (
    <div className="flex min-h-screen bg-bg-main text-text-main h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 bg-sidebar text-white flex flex-col shrink-0 border-r border-white/5">
        <div className="p-8">
          <div className="flex items-center gap-2 mb-1">
            <Logo size="sm" showText={false} className="mr-1" />
            <div className="text-white font-extrabold text-2xl tracking-tighter">KV <span className="text-sky-400">VOICE</span></div>
          </div>
          <div className="text-[10px] text-slate-500 font-mono tracking-widest uppercase pl-10 leading-none">Management v1.0</div>
        </div>

        <nav className="flex-1 px-4 space-y-1.5 mt-2">
          <button 
            onClick={() => setActiveTab('active')}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all",
              activeTab === 'active' ? "bg-primary text-white shadow-lg shadow-primary/20" : "text-slate-400 hover:text-white hover:bg-white/5"
            )}
          >
            <BarChart2 size={18} />
            Workspace
          </button>

          <button 
            onClick={() => setActiveTab('timeline')}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all",
              activeTab === 'timeline' ? "bg-primary text-white shadow-lg shadow-primary/20" : "text-slate-400 hover:text-white hover:bg-white/5"
            )}
          >
            <Calendar size={18} />
            Timeline
          </button>

          <button 
            onClick={() => setActiveTab('archive')}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all",
              activeTab === 'archive' ? "bg-slate-700 text-white shadow-lg" : "text-slate-400 hover:text-white hover:bg-white/5"
            )}
          >
            <Archive size={18} />
            Active Archive
          </button>
          
          <div className="pt-4 px-4 pb-2">
            <p className="text-[10px] font-black text-slate-600 uppercase tracking-[0.2em]">Tools</p>
          </div>

          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="w-full flex items-center gap-3 px-4 py-3 text-slate-400 hover:text-white hover:bg-white/5 rounded-xl text-sm font-semibold transition-all group"
          >
            <SettingsIcon size={18} className="group-hover:rotate-45 transition-transform" />
            Pengaturan
          </button>

          <div className="pt-6 px-4 pb-2">
            <p className="text-[10px] font-black text-slate-600 uppercase tracking-[0.2em]">Reports</p>
          </div>
          {canSeeReports && (
            <button onClick={generateTeamReport} className="w-full flex items-center gap-3 px-4 py-3 text-slate-400 hover:text-white hover:bg-white/5 rounded-xl text-sm font-medium transition-all group">
              <Download size={16} className="group-hover:-translate-y-0.5 transition-transform" />
              Team Report
            </button>
          )}
        </nav>

        <div className="p-6 border-t border-white/5 bg-black/20">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-indigo-800 flex items-center justify-center text-white font-bold text-sm">
              {userSettings.profile?.name?.[0] || 'U'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-white truncate leading-none mb-1">{userSettings.profile?.name || user.displayName || 'Admin'}</p>
              <p className="text-[10px] text-slate-500 truncate uppercase tracking-widest font-black">{userSettings.profile?.role}</p>
            </div>
            <button 
              onClick={() => auth.signOut()}
              className="p-2 text-slate-500 hover:text-red-400 transition-colors"
              title="Keluar"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="h-20 glass border-b border-border-main px-8 flex items-center justify-between shrink-0 z-10">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-slate-900 group flex items-center gap-2">
              Production Dashboard
              <div className="flex items-center gap-1.5 px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded-full border border-emerald-100/50">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span 
                  className="text-[9px] font-black uppercase tracking-tighter cursor-help"
                  title={onlineNames}
                >
                  Live: {onlineCount} Online
                </span>
              </div>
              <ArrowRight size={16} className="text-primary opacity-0 group-hover:opacity-100 transition-all translate-x-[-10px] group-hover:translate-x-0" />
            </h2>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">Control Panel & Operations</p>
          </div>
          
          <div className="flex items-center gap-4">
            {/* Notification Center */}
            <div className="relative">
              <button 
                onClick={() => setIsNotificationOpen(!isNotificationOpen)}
                className="p-2 bg-white border border-slate-200 rounded-xl text-slate-500 hover:text-primary hover:border-primary/20 transition-all relative shadow-sm group"
              >
                <Bell size={18} className={cn("transition-transform group-hover:rotate-12", notifications.some(n => !n.read) && "text-primary")} />
                {notifications.some(n => !n.read) && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 border border-white rounded-full animate-bounce" />
                )}
              </button>

              <AnimatePresence>
                {isNotificationOpen && (
                  <>
                    <div 
                      className="fixed inset-0 z-40 bg-transparent" 
                      onClick={() => setIsNotificationOpen(false)} 
                    />
                    <motion.div 
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className="absolute right-0 mt-3 w-80 bg-white rounded-3xl shadow-2xl border border-slate-100 z-50 overflow-hidden"
                    >
                      <div className="p-4 border-b border-slate-50 bg-slate-50/50 flex items-center justify-between">
                        <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Notifikasi</h4>
                        <span className="text-[9px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                          {notifications.filter(n => !n.read).length} Baru
                        </span>
                      </div>
                      <div className="max-h-96 overflow-y-auto custom-scrollbar">
                        {notifications.length === 0 ? (
                          <div className="p-10 text-center text-slate-400 text-xs font-medium">Belum ada notifikasi.</div>
                        ) : (
                          notifications.map((n) => (
                            <div 
                              key={n.id} 
                              onClick={() => {
                                handleMarkNotificationAsRead(n.id);
                                setIsNotificationOpen(false);
                              }}
                              className={cn(
                                "p-4 border-b border-slate-50 hover:bg-slate-50 transition-colors cursor-pointer group",
                                !n.read ? "bg-primary/5 shadow-[inset_4px_0_0_#4f46e5]" : "opacity-75"
                              )}
                            >
                              <div className="flex gap-3">
                                <div className={cn(
                                  "w-8 h-8 rounded-lg shrink-0 flex items-center justify-center",
                                  n.type === 'assignment' ? "bg-emerald-100 text-emerald-600" : 
                                  n.type === 'rejection' ? "bg-rose-100 text-rose-600" : "bg-blue-100 text-blue-600"
                                )}>
                                  {n.type === 'assignment' ? <CheckCircle size={14} /> : <Clock size={14} />}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-[11px] font-black text-slate-900 leading-tight mb-0.5">{n.title}</p>
                                  <p className="text-[10px] text-slate-500 font-medium leading-relaxed mb-2">{n.message}</p>
                                  <p className="text-[8px] font-bold text-slate-400 flex items-center gap-1">
                                    <Clock size={8} />
                                    {n.createdAt?.toDate ? n.createdAt.toDate().toLocaleString('id-ID') : 'Baru saja'}
                                  </p>
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-full">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">System Online</span>
            </div>
            {canManageProjects && (
              <button
                onClick={() => setIsAdding(true)}
                className="flex items-center gap-2 bg-primary text-white px-6 py-3 rounded-2xl hover:bg-primary-hover transition-all font-bold text-sm shadow-xl shadow-primary/30 active:scale-95"
              >
                <Plus size={18} />
                New Project
              </button>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          {/* Attention Required Section */}
          {attentionProjects.length > 0 && (
            <div className="px-8 pt-8">
              <div className="bg-rose-50 border border-rose-100 rounded-[2.5rem] p-8 space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-black text-rose-900 tracking-tight flex items-center gap-3">
                      <div className="w-10 h-10 bg-rose-500 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-rose-200">
                        <Bell size={20} />
                      </div>
                      Tugas Prioritas: Waktunya Anda Bekerja
                    </h3>
                    <p className="text-xs font-bold text-rose-600 mt-1 uppercase tracking-widest">
                      Role Anda: {userSettings.profile?.role?.toUpperCase()} • {attentionProjects.length} Proyek butuh tindakan segera
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {attentionProjects.slice(0, 3).map(p => (
                    <div key={p.id} className="bg-white rounded-3xl p-6 shadow-sm border border-rose-100/50 flex flex-col justify-between group hover:shadow-md transition-all">
                      <div>
                        <div className="flex justify-between items-start mb-4">
                          <span className="px-3 py-1 bg-rose-100 text-rose-700 text-[10px] font-black uppercase rounded-lg">Wajib: {STATUS_CONFIG[p.status as keyof typeof STATUS_CONFIG]?.label || p.status}</span>
                          <span className="text-[10px] font-mono font-bold text-slate-400">{p.projectCode || p.id.slice(0, 8)}</span>
                        </div>
                        <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">{p.client}</p>
                        <h4 className="text-lg font-black text-slate-900 leading-tight mb-2 line-clamp-1">{p.title}</h4>
                      </div>
                      <div className="mt-4 pt-4 border-t border-slate-50 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                           <Clock size={14} className="text-rose-500" />
                           <span className="text-xs font-bold text-slate-600 italic">Deadline Mendekat</span>
                        </div>
                        <button 
                          onClick={() => {
                            setActiveTab(
                              ['project-entry', 'translate', 'subtitle-burn', 'breakdown'].includes(p.status) ? 'active' :
                              ['recording', 'editing'].includes(p.status) ? 'production' : 'submission'
                            );
                            setSearchTerm(p.title);
                          }}
                          className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center hover:bg-rose-600 transition-all shadow-lg shadow-slate-200"
                        >
                          <ChevronRight size={18} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {attentionProjects.length > 3 && (
                    <div className="bg-rose-100/50 rounded-3xl border border-dashed border-rose-200 flex items-center justify-center p-6 text-center group cursor-pointer hover:bg-rose-100 transition-all">
                      <p className="text-sm font-black text-rose-700 uppercase tracking-widest">+{attentionProjects.length - 3} Proyek Lainnya</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Tabs */}
          <div className="px-8 py-6 bg-white border-b border-border-main flex items-center justify-between shrink-0 overflow-x-auto">
            <div className="flex gap-2 p-1 bg-slate-50 rounded-2xl border border-slate-100">
              {(['active', 'done', 'timeline'] as const).map((tab) => {
                return (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={cn(
                      "px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-[0.1em] transition-all relative flex items-center gap-2",
                      activeTab === tab 
                        ? "bg-white text-primary shadow-sm ring-1 ring-slate-100" 
                        : "text-slate-400 hover:text-slate-600 hover:bg-slate-100/50"
                    )}
                  >
                    {tab === 'active' && 'Sedang Diproses'}
                    {tab === 'done' && 'Proyek Selesai'}
                    {tab === 'timeline' && 'Timeline Produksi'}
                    
                    {tab !== 'timeline' && (
                      <span className={cn(
                        "px-1.5 py-0.5 rounded-md text-[9px] font-bold",
                        activeTab === tab ? "bg-primary/10 text-primary" : "bg-slate-200 text-slate-500"
                      )}>
                        {tab === 'active' && projects.filter(p => p.status !== 'done').length}
                        {tab === 'done' && projects.filter(p => p.status === 'done').length}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Deadline Notifications */}
          {settings.reminders?.enabled && projects.filter(p => {
            if (p.status === 'completed' || p.status === 'paid') return false;
            if (!p.deadline) return false;
            
            const now = new Date();
            const [remHour, remMin] = (settings.reminders?.time || '09:00').split(':').map(Number);
            const reminderTimeToday = new Date(now);
            reminderTimeToday.setHours(remHour, remMin, 0, 0);

            // Only show after the reminder time has passed today
            if (now < reminderTimeToday) return false;

            const d = p.deadline.toDate ? p.deadline.toDate() : new Date(p.deadline);
            const diffMs = d.getTime() - now.getTime();
            const diffHrs = diffMs / (1000 * 60 * 60);
            
            // Daily: within 48h, Weekly: within 7 days
            const maxHrs = settings.reminders?.frequency === 'weekly' ? 168 : 48;
            return diffHrs <= maxHrs && diffHrs > -2;
          }).length > 0 && (
            <div className="px-8 pt-4">
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-3"
              >
                <div className="flex items-center gap-2 text-amber-800">
                  <Bell size={16} className="animate-pulse" />
                  <span className="text-[10px] font-black uppercase tracking-widest">
                    Pengingat Deadline Berjangka ({settings.reminders?.frequency === 'weekly' ? '< 7 Hari' : '< 48 Jam'})
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {projects.filter(p => {
                    if (p.status === 'completed' || p.status === 'paid') return false;
                    if (!p.deadline) return false;
                    
                    const now = new Date();
                    const d = p.deadline.toDate ? p.deadline.toDate() : new Date(p.deadline);
                    const diffMs = d.getTime() - now.getTime();
                    const diffHrs = diffMs / (1000 * 60 * 60);
                    
                    const maxHrs = settings.reminders?.frequency === 'weekly' ? 168 : 48;
                    return diffHrs <= maxHrs && diffHrs > -2;
                  }).map(p => {
                    const d = p.deadline.toDate ? p.deadline.toDate() : new Date(p.deadline);
                    return (
                      <div key={p.id} className="bg-white border border-amber-100 rounded-xl px-4 py-3 flex items-center justify-between shadow-sm">
                        <div className="min-w-0">
                          <p className="text-[9px] font-bold text-amber-600 uppercase truncate">{p.client}</p>
                          <p className="text-xs font-bold text-slate-800 truncate">{p.title}</p>
                        </div>
                        <div className="text-right shrink-0 ml-4 font-mono">
                          <p className="text-[9px] font-bold text-slate-400 uppercase">Deadline</p>
                          <p className="text-xs font-black text-amber-700">
                            {d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })} {d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            </div>
          )}

          {/* Production Dashboard Content */}
          {activeTab === 'timeline' && (
            <Timeline projects={projects} teamMembers={teamMembers} />
          )}

          {activeTab === 'active' && activeTab !== 'timeline' && canSeeReports && (
            <div className="px-8 pt-8 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white p-6 rounded-[2rem] border border-border-main shadow-sm flex items-center justify-between group hover:border-primary/50 transition-all"
                >
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Inisiasi</p>
                    <p className="text-3xl font-black text-slate-900 tracking-tighter">{projects.filter(p => p.status === 'project-entry').length}</p>
                  </div>
                  <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 group-hover:bg-primary group-hover:text-white transition-all">
                    <Mic2 size={24} />
                  </div>
                </motion.div>
                
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="bg-white p-6 rounded-[2rem] border border-border-main shadow-sm flex items-center justify-between group hover:border-amber-400/50 transition-all"
                >
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Production Area</p>
                    <p className="text-3xl font-black text-slate-900 tracking-tighter">{projects.filter(p => ['translation-phase', 'editing-phase', 'qc-phase'].includes(p.status)).length}</p>
                  </div>
                  <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 group-hover:bg-amber-400 group-hover:text-white transition-all">
                    <CheckCircle size={24} />
                  </div>
                </motion.div>

                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="bg-white p-6 rounded-[2rem] border border-border-main shadow-sm flex items-center justify-between group hover:border-indigo-400/50 transition-all"
                >
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Sub/Rev</p>
                    <p className="text-3xl font-black text-slate-900 tracking-tighter">{stats.submissionCount}</p>
                  </div>
                  <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 group-hover:bg-indigo-400 group-hover:text-white transition-all">
                    <Share2 size={24} />
                  </div>
                </motion.div>

                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="bg-slate-900 text-white p-6 rounded-[2rem] border border-white/5 shadow-2xl flex items-center justify-between group hover:scale-[1.02] transition-all"
                >
                  <div>
                    <p className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-1">Done</p>
                    <p className="text-3xl font-black text-white tracking-tighter font-mono">{stats.doneCount}</p>
                  </div>
                  <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center text-white/40 group-hover:bg-primary group-hover:text-white transition-all">
                    <CheckCircle2 size={24} />
                  </div>
                </motion.div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white border border-border-main p-8 rounded-[2rem] shadow-sm">
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest mb-6 flex items-center gap-2">
                    <PieChartIcon size={16} className="text-primary" />
                    Monitoring Antrian
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100 transition-all hover:bg-blue-50/50">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2">Total Proyek</span>
                      <span className="text-2xl font-black text-slate-900 font-mono tracking-tight">{stats.totalProjects}</span>
                    </div>
                    <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100 transition-all hover:bg-green-50/50">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2">Selesai (Done)</span>
                      <span className="text-2xl font-black text-slate-900 font-mono tracking-tight">{stats.doneCount}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-indigo-50 border border-indigo-100 p-8 rounded-[2rem] shadow-sm">
                  <h4 className="text-xs font-black text-indigo-800 uppercase tracking-widest mb-6 flex items-center gap-2">
                    <CheckCircle2 size={16} className="text-indigo-500" />
                    Kesehatan Produksi
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-6 bg-white rounded-2xl shadow-sm border border-indigo-100/50">
                      <p className="text-[9px] font-black text-indigo-400 uppercase mb-2 tracking-widest">Active/Progress</p>
                      <p className="text-2xl font-black text-indigo-900">{stats.productionCount}</p>
                    </div>
                    <div className="p-6 bg-white rounded-2xl shadow-sm border border-indigo-100/50">
                      <p className="text-[9px] font-black text-indigo-400 uppercase mb-2 tracking-widest">Awaiting Submission</p>
                      <p className="text-2xl font-black text-indigo-900">{stats.submissionCount}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Quick Monitoring Stats - REMOVED from main tabs */}
          {/* ... */}

          {/* Actions Bar */}
          {activeTab !== 'timeline' && (
            <div className="flex items-center justify-between px-8 py-6 border-b border-border-main bg-slate-50/50">
            <div className="flex items-center gap-4">
              <div className="relative">
                <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                  placeholder="Cari proyek (Klien atau Judul)..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="bg-white border border-border-main pl-11 pr-4 py-2.5 rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none w-80 transition-all font-medium" 
                />
              </div>

              <button
                onClick={() => setShowOnlyMyProjects(!showOnlyMyProjects)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-sm border",
                  showOnlyMyProjects 
                    ? "bg-primary text-white border-primary" 
                    : "bg-white text-slate-600 border-border-main hover:bg-slate-50"
                )}
              >
                <UserIcon size={14} />
                {showOnlyMyProjects ? 'Proyek Saya' : 'Semua Proyek'}
              </button>

              {/* Team Filter */}
              {canManageTeam && (
                <div className="flex items-center gap-2 bg-white border border-border-main rounded-xl px-4 py-2.5 shadow-sm transition-all hover:border-primary/30">
                  <Users size={16} className="text-slate-400" />
                  <select 
                    value={teamMemberFilter}
                    onChange={(e) => setTeamMemberFilter(e.target.value)}
                    className="bg-transparent border-none text-[11px] font-black uppercase tracking-widest focus:ring-0 outline-none cursor-pointer text-slate-600 min-w-[140px]"
                  >
                    <option value="all">Semua Tim</option>
                    {teamMembers.sort((a,b) => a.name.localeCompare(b.name)).map(member => (
                      <option key={member.id} value={member.id}>{member.name}</option>
                    ))}
                  </select>
                </div>
              )}

               {canSeeReports && (
                <div className="flex gap-2">
                   <button onClick={generateTeamReport} className="flex items-center gap-2 px-4 py-2.5 bg-white border border-border-main rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 transition-all shadow-sm">
                      <Download size={14} className="text-primary" /> Report Team
                   </button>
                   <button 
                    onClick={() => setIsClientView(!isClientView)} 
                    className={cn(
                      "flex items-center gap-2 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-sm border",
                      isClientView ? "bg-amber-600 text-white border-amber-600" : "bg-white text-slate-600 border-border-main"
                    )}
                   >
                     {isClientView ? <Eye size={14} /> : <Eye size={14} />}
                     {isClientView ? 'Exit Client View' : 'Preview Client View'}
                   </button>
                </div>
              )}
            </div>
          </div>
        )}

          {/* Table Area */}
          {activeTab !== 'timeline' && (
            <div className="px-8 pb-12">
            <div className="bg-white border border-border-main rounded-2xl shadow-sm overflow-hidden min-w-full">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-50/80 backdrop-blur-sm sticky top-0 z-10 border-b border-border-main text-nowrap text-[10px] font-black text-text-muted uppercase tracking-[0.2em]">
                    <tr>
                      {!isClientView && (
                        <th className="px-6 py-5 w-10">
                          <input 
                            type="checkbox" 
                            className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary"
                            checked={filteredProjects.length > 0 && selectedIds.length === filteredProjects.length}
                            onChange={selectAllFiltered}
                          />
                        </th>
                      )}
                      <th className="px-6 py-5">Status</th>
                      <th className="px-6 py-5 group cursor-pointer" onClick={() => toggleSort('deadline')}>
                        <div className="flex items-center gap-1">
                          Proyek / Deadline Terdekat
                          <div className={cn(
                            "flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity",
                            sortField === 'deadline' && "opacity-100"
                          )}>
                            <ChevronUp size={8} className={cn(sortField === 'deadline' && sortDirection === 'asc' ? "text-primary" : "text-slate-300")} />
                            <ChevronDown size={8} className={cn(sortField === 'deadline' && sortDirection === 'desc' ? "text-primary" : "text-slate-300")} />
                          </div>
                        </div>
                      </th>
                      {!isClientView && <th className="px-6 py-5">Assignees</th>}
                      <th className="px-6 py-5 text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <AnimatePresence mode="popLayout" initial={false}>
                      {filteredProjects.length === 0 ? (
                        <motion.tr
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                        >
                          <td colSpan={5} className="px-6 py-32 text-center text-text-muted font-medium italic">
                            <div className="flex flex-col items-center gap-3">
                              <Search size={48} className="text-slate-100" />
                              <p className="text-sm">Tidak ada proyek yang sesuai kriteria</p>
                            </div>
                          </td>
                        </motion.tr>
                      ) : (
                        filteredProjects.map((p, idx) => {
                          const projectRole = p.memberRoles?.[user.uid] || (isSuperUser || userSettings.profile?.role === 'pm' ? 'pm' : userSettings.profile?.role);
                          const myTurn = isMyTurn(p, userSettings.profile, user.uid);
                          return (
                            <motion.tr
                              key={p.id}
                              layout
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0, scale: 0.95 }}
                              transition={{ duration: 0.2, delay: idx * 0.02 }}
                              className={cn(
                                "hover:bg-slate-50/80 transition-colors group relative",
                                selectedIds.includes(p.id) && "bg-blue-50/30",
                                myTurn && "bg-rose-50/30"
                              )}
                            >
                              {(() => {
                                const canChangeStatus = isSuperUser || userSettings.profile?.role === 'pm' || !!projectRole;
                                const canDelete = isSuperUser || userSettings.profile?.role === 'pm' || projectRole === 'pm';
                                const role = projectRole; // Alias for nested buttons

                                return (
                                  <>
                                    {!isClientView && (
                                      <td className="px-6 py-5">
                                        <div className="flex items-center gap-3">
                                          <input 
                                            type="checkbox" 
                                            className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary"
                                            checked={selectedIds.includes(p.id)}
                                            onChange={() => toggleSelect(p.id)}
                                          />
                                          {myTurn && (
                                            <div className="relative flex h-2 w-2">
                                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                                              <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                                            </div>
                                          )}
                                        </div>
                                      </td>
                                    )}
                                    <td className="px-6 py-5 text-nowrap">
                                      <div className="flex flex-col gap-2">
                                        <div className="flex items-center gap-2">
                                          <div className={cn(
                                            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest shadow-sm border transition-all h-8 w-fit",
                                            isClientView 
                                              ? (p.status === 'done' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-blue-50 text-blue-700 border-blue-100')
                                              : (STATUS_CONFIG[p.status]?.color || 'bg-slate-50 text-slate-400'),
                                            isClientView
                                              ? (p.status === 'done' ? 'border-emerald-100' : 'border-blue-100')
                                              : (STATUS_CONFIG[p.status]?.border || 'border-slate-100')
                                          )}>
                                            <div className={cn("w-1.5 h-1.5 rounded-full", isClientView ? (p.status === 'done' ? 'bg-emerald-500' : 'bg-blue-500') : (STATUS_CONFIG[p.status]?.dot || 'bg-slate-300'))} />
                                            {isClientView 
                                              ? (p.status === 'done' ? 'Project Completed' : 'In Progress') 
                                              : (STATUS_CONFIG[p.status]?.label || 'Unknown')
                                            }
                                          </div>
                                          {!isClientView && p.isPriority && (
                                            <span className="px-2 py-1 bg-red-500 text-white text-[8px] font-black uppercase rounded-md animate-pulse">Priority</span>
                                          )}
                                          {!isClientView && isStale(p) && (
                                            <div className="flex items-center gap-1.5 px-2 py-1 bg-amber-100 text-amber-700 text-[8px] font-black uppercase rounded-md border border-amber-200">
                                              <Clock size={10} />
                                              Stale
                                            </div>
                                          )}
                                        </div>
                                        
                                        {/* Stages Progress Indicator */}
                                        <div className="flex gap-1">
                                          {(['translation', 'editing', 'qc'] as const).map(s => (
                                            <div 
                                              key={s} 
                                              title={`${s}: ${p.stages[s].status}`}
                                              className={cn(
                                                "w-4 h-1 rounded-full transition-all",
                                                p.stages[s].status === 'approved' ? "bg-emerald-400" :
                                                p.stages[s].status === 'review' ? "bg-amber-400 animate-pulse" :
                                                p.stages[s].status === 'rejected' ? "bg-rose-400" :
                                                p.stages[s].status === 'in_progress' ? "bg-blue-400" : "bg-slate-200"
                                              )} 
                                            />
                                          ))}
                                        </div>
                                      </div>
                                    </td>
                                    <td className="px-6 py-5">
                                      <div className="flex flex-col gap-1.5">
                                        <div className="flex items-center gap-2 group/title">
                                          <span className="text-[10px] font-black text-primary bg-primary/10 px-1.5 py-0.5 rounded-md border border-primary/20">{p.projectCode || 'NO-ID'}</span>
                                          <p className="font-bold text-text-main text-sm truncate max-w-[240px] tracking-tight">{p.title}</p>
                                          <button 
                                            onClick={() => copyWASummary(p)}
                                            className="p-1 text-slate-300 hover:text-green-600 hover:bg-green-50 rounded-md transition-all opacity-0 group-hover/title:opacity-100"
                                            title="Salin Laporan WA"
                                          >
                                            <Share2 size={12} />
                                          </button>
                                          {p.scriptLink && (
                                            <a 
                                              href={p.scriptLink} target="_blank" rel="noreferrer"
                                              className="p-1 text-blue-400 hover:bg-blue-50 rounded-md transition-all"
                                              title="Buka Naskah"
                                            >
                                              <FileText size={12} />
                                            </a>
                                          )}
                                          {p.referenceLink && (
                                            <a 
                                              href={p.referenceLink} target="_blank" rel="noreferrer"
                                              className="p-1 text-purple-400 hover:bg-purple-50 rounded-md transition-all"
                                              title="Video Reference"
                                            >
                                              <Video size={12} />
                                            </a>
                                          )}
                                        </div>
                                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                          <span className="text-[10px] font-black text-slate-400 bg-slate-100/50 px-1.5 py-0.5 rounded-sm border border-slate-200/50 uppercase tracking-tighter">{p.client}</span>
                                          <span className="text-[10px] font-bold text-slate-500 font-mono">
                                            {(() => {
                                              const mins = Math.floor(p.duration);
                                              const secs = Math.round((p.duration - mins) * 60);
                                              return `${mins},${secs < 10 ? '0' + secs : secs}`;
                                            })()} m
                                          </span>
                                          {p.deadline && (
                                            <span className={cn(
                                              "text-[10px] font-black px-2 py-0.5 rounded-full border flex items-center gap-1",
                                              (() => {
                                                const d = p.deadline.toDate ? p.deadline.toDate() : new Date(p.deadline);
                                                const diff = d.getTime() - new Date().getTime();
                                                if (diff < 0) return "bg-rose-50 text-rose-600 border-rose-100";
                                                if (diff < 86400000) return "bg-amber-50 text-amber-600 border-amber-100 animate-pulse";
                                                return "bg-slate-50 text-slate-500 border-slate-100";
                                              })()
                                            )}>
                                              <Calendar size={10} />
                                              {(() => {
                                                const d = p.deadline.toDate ? p.deadline.toDate() : new Date(p.deadline);
                                                return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }) + ' ' + d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
                                              })()}
                                            </span>
                                          )}
                                        </div>

                                        {/* Current Handler Indicator */}
                                        <div className="mt-1 flex items-center gap-2 border-t border-slate-50 pt-1.5">
                                          <span className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">PIC Aktif:</span>
                                          {(() => {
                                            let currentPicIds: string[] = [];
                                            let stageLabel = "";
                                            let stageColor = "";
                                            
                                            if (p.status === 'translation-phase') {
                                              currentPicIds = p.stages.translation.staffIds || [];
                                              stageLabel = "Translation";
                                              stageColor = "bg-blue-50 text-blue-700 border-blue-100";
                                            } else if (p.status === 'editing-phase') {
                                              currentPicIds = p.stages.editing.staffIds || [];
                                              stageLabel = "Editing";
                                              stageColor = "bg-violet-50 text-violet-700 border-violet-100";
                                            } else if (p.status === 'qc-phase') {
                                              currentPicIds = p.stages.qc.staffIds || [];
                                              stageLabel = "QC Phase";
                                              stageColor = "bg-amber-50 text-amber-700 border-amber-100";
                                            } else if (p.status === 'done') {
                                              return <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100 uppercase">Selesai</span>;
                                            } else if (p.status === 'under-revision') {
                                              currentPicIds = [...(p.stages.translation.staffIds || []), ...(p.stages.editing.staffIds || [])];
                                              stageLabel = "Revisi";
                                              stageColor = "bg-rose-50 text-rose-700 border-rose-100";
                                            }

                                            if (currentPicIds.length === 0 && p.status !== 'project-entry') 
                                              return <span className="text-[9px] font-bold text-rose-400 italic">Belum ditugaskan</span>;
                                            
                                            if (p.status === 'project-entry')
                                              return <span className="text-[9px] font-bold text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100 uppercase">Inisiasi</span>;

                                            return (
                                              <div className="flex items-center gap-1.5 overflow-hidden">
                                                <span className={cn("text-[9px] font-black px-1.5 py-0.5 rounded border uppercase shrink-0", stageColor)}>{stageLabel}</span>
                                                <span className="text-[10px] font-bold text-slate-700 truncate underline decoration-slate-200 decoration-2 underline-offset-2">{getMemberName(currentPicIds)}</span>
                                              </div>
                                            );
                                          })()}
                                        </div>

                                        {/* Result Links Display */}
                                        <div className="flex flex-wrap gap-1.5 mt-1">
                                          {['translation', 'editing', 'qc'].map((stage) => {
                                            const s = p.stages[stage as keyof Project['stages']];
                                            if (!s.resultLink) return null;
                                            return (
                                              <a 
                                                key={stage}
                                                href={s.resultLink}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded text-[8px] font-bold transition-all border border-slate-200"
                                              >
                                                <Download size={8} />
                                                {stage.toUpperCase()} LINK
                                              </a>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    </td>
                                    {!isClientView && (
                                      <td className="px-6 py-5 whitespace-nowrap">
                                        <div className="flex flex-col gap-1 max-w-[300px]">
                                          <div className="flex flex-wrap gap-1">
                                            <span className="px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-700 text-[8px] font-black uppercase border border-blue-100">TR: {getMemberName(p.stages.translation.staffIds || p.translators)}</span>
                                            <span className="px-1.5 py-1 rounded bg-slate-100 text-slate-500 text-[7px] font-bold border border-slate-200">HT: {getMemberName(p.headTranslator)}</span>
                                          </div>
                                          <div className="flex flex-wrap gap-1">
                                            <span className="px-1.5 py-0.5 rounded-md bg-violet-50 text-violet-700 text-[8px] font-black uppercase border border-violet-100">ED: {getMemberName(p.stages.editing.staffIds || p.editors)}</span>
                                            <span className="px-1.5 py-1 rounded bg-slate-100 text-slate-500 text-[7px] font-bold border border-slate-200">HE: {getMemberName(p.headEditor)}</span>
                                          </div>
                                          <div className="flex flex-wrap gap-1">
                                            <span className="px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 text-[8px] font-black uppercase border border-amber-100">QC: {getMemberName(p.stages.qc.staffIds || p.qcStaff)}</span>
                                            <span className="px-1.5 py-1 rounded bg-slate-100 text-slate-500 text-[7px] font-bold border border-slate-200">HQ: {getMemberName(p.headQC)}</span>
                                          </div>

                                          {/* Actions for Heads/PMs to swap staff */}
                                          {(isSuperUser || 
                                            role === 'pm' || 
                                            (role === 'head_translator' && p.status === 'translation-phase') ||
                                            (role === 'head_editor' && p.status === 'editing-phase') ||
                                            (role === 'head_qc' && p.status === 'qc-phase')) && 
                                            p.status !== 'done' && p.status !== 'project-entry' && (
                                            <div className="flex flex-wrap gap-1 mt-2 border-t border-slate-50 pt-2">
                                              {(['translation', 'editing', 'qc'] as const).map(stage => {
                                                const staffIds = p.stages[stage].staffIds || [];
                                                if (staffIds.length === 0) return null;
                                                
                                                // Heads can only swap their own division
                                                if (!isSuperUser && role !== 'pm') {
                                                  if (role === 'head_translator' && stage !== 'translation') return null;
                                                  if (role === 'head_editor' && stage !== 'editing') return null;
                                                  if (role === 'head_qc' && stage !== 'qc') return null;
                                                }

                                                return (
                                                  <button 
                                                    key={stage}
                                                    onClick={() => {
                                                      setSwapData({ projectId: p.id, stage, oldStaffIds: staffIds });
                                                      setIsSwapModalOpen(true);
                                                    }}
                                                    className="text-[8px] font-black uppercase tracking-tighter px-2 py-1 bg-slate-100 hover:bg-rose-100 hover:text-rose-600 rounded transition-all flex items-center gap-1"
                                                  >
                                                    <ArrowRightLeft size={10} /> Swap {stage.slice(0,2).toUpperCase()}
                                                  </button>
                                                );
                                              })}
                                            </div>
                                          )}
                                        </div>
                                      </td>
                                    )}
                                    <td className="px-6 py-5 text-center">
                                      <div className="flex items-center justify-center gap-2">
                                        {/* Final Release Button */}
                                        {!isClientView && (isSuperUser || role === 'pm') && p.status === 'done' && !p.isFinalReleased && (
                                          <button 
                                            onClick={() => handleFinalRelease(p.id)}
                                            className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                                            title="Final Release (Kirim ke Client)"
                                          >
                                            <Rocket size={16} />
                                          </button>
                                        )}
                                        {/* PM/SuperUser Manual Revision Button */}
                                        {(isSuperUser || role === 'pm') && p.status !== 'done' && p.status !== 'project-entry' && (
                                          <button 
                                            onClick={() => {
                                              const cat = prompt("Pilih Kategori Revisi (translation/editing/qc):");
                                              if (cat === 'translation' || cat === 'editing' || cat === 'qc') {
                                                handleManualTriggerRevision(p.id, cat);
                                              }
                                            }}
                                            className="p-2 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                                            title="Manual Revision"
                                          >
                                            <PenBox size={16} />
                                          </button>
                                        )}

                                        {/* History View Button */}
                                        <button 
                                          onClick={() => setShowHistoryFor(p)}
                                          className="p-2 text-slate-400 hover:text-primary hover:bg-slate-50 rounded-lg transition-all"
                                          title="View History Log"
                                        >
                                          <Eye size={16} />
                                        </button>

                                        {/* Edit Project Button */}
                                        {(isSuperUser || role === 'pm') && (
                                          <button 
                                            onClick={() => {
                                              setEditingProject({...p});
                                              setIsEditingProject(true);
                                            }}
                                            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                                            title="Edit Project Details"
                                          >
                                            <Pencil size={16} />
                                          </button>
                                        )}

                                        {/* PM Actions at Inisiasi */}
                                        {p.status === 'project-entry' && role === 'pm' && (
                                          <button 
                                            onClick={() => handleStartProject(p.id)}
                                            className="px-4 py-2 bg-indigo-900 text-white text-[10px] font-black uppercase rounded-lg hover:bg-slate-800 transition-all shadow-md shadow-indigo-100"
                                          >
                                            Start Project
                                          </button>
                                        )}

                                        {/* Head Actions (Assign Staff) */}
                                        {((p.status === 'translation-phase' && role === 'head_translator' && p.stages.translation.status === 'pending') ||
                                          (p.status === 'editing-phase' && role === 'head_editor' && p.stages.editing.status === 'pending') ||
                                          (p.status === 'qc-phase' && role === 'head_qc' && p.stages.qc.status === 'pending') ||
                                          (p.status === 'under-revision' && p.revisionCategory === 'translation' && role === 'head_translator' && p.stages.translation.status === 'pending') ||
                                          (p.status === 'under-revision' && p.revisionCategory === 'editing' && role === 'head_editor' && p.stages.editing.status === 'pending') ||
                                          (p.status === 'under-revision' && p.revisionCategory === 'qc' && role === 'head_qc' && p.stages.qc.status === 'pending')) && (
                                          <button 
                                            onClick={() => {
                                              const stage = p.status === 'under-revision' ? p.revisionCategory! : p.status.split('-')[0] as any;
                                              const roleType = stage === 'translation' ? 'translator' : stage === 'editing' ? 'editor' : 'qc';
                                              const staff = prompt(`Masukkan ID Staf (Pisahkan koma jika lebih satu) untuk ${roleType}:`);
                                              if (staff) {
                                                const ids = staff.split(',').map(s => s.trim());
                                                handleAssignStaff(p.id, stage, ids);
                                              }
                                            }}
                                            className="px-4 py-2 bg-indigo-600 text-white text-[10px] font-black uppercase rounded-lg transition-all"
                                          >
                                            Assign Staff
                                          </button>
                                        )}

                                        {/* Staff Actions (Submit for Review / Submit Link) */}
                                        {(() => {
                                          const currentStage = p.status === 'under-revision' ? p.revisionCategory! : p.status.split('-')[0] as keyof Project['stages'];
                                          const stageData = p.stages[currentStage];
                                          const isWorking = stageData?.status === 'in_progress' || stageData?.status === 'rejected';
                                          const canWork = (
                                            (role === 'translator' && currentStage === 'translation') ||
                                            (role === 'editor' && currentStage === 'editing') ||
                                            (role === 'qc' && currentStage === 'qc')
                                          );

                                          if (isWorking && canWork) {
                                            const isAlreadyStarted = !!stageData.startedAt;
                                            return (
                                              <div className="flex items-center gap-2">
                                                {!isAlreadyStarted && (
                                                  <button 
                                                    onClick={() => handleStartWorking(p.id, currentStage)}
                                                    className="px-3 py-2 bg-indigo-50 text-indigo-700 text-[10px] font-black uppercase rounded-lg hover:bg-indigo-100 transition-all border border-indigo-200"
                                                  >
                                                    Start Working
                                                  </button>
                                                )}
                                                <button 
                                                  onClick={() => {
                                                    const link = prompt("Masukkan Link Google Drive / Cloud Hasil Pekerjaan:");
                                                    if (link) handleUpdateResultLink(p.id, currentStage, link);
                                                  }}
                                                  className="p-2 text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                                                  title="Input Result Link"
                                                >
                                                  <Share2 size={16} />
                                                </button>
                                                <button 
                                                  onClick={() => {
                                                    if (confirm("Serahkan pekerjaan ke Head Divisi (via WA/System)?")) {
                                                      handleUpdateStageStatus(p.id, currentStage, 'review');
                                                    }
                                                  }}
                                                  className="px-4 py-2 bg-emerald-600 text-white text-[10px] font-black uppercase rounded-lg hover:bg-emerald-700 transition-all shadow-md shadow-emerald-100"
                                                >
                                                  Mark as Done
                                                </button>
                                              </div>
                                            );
                                          }
                                          return null;
                                        })()}

                                        {/* Head Review Actions */}
                                        {(() => {
                                          const currentStage = (p.status === 'under-revision' || p.status === 'revision-review') ? p.revisionCategory! : p.status.split('-')[0] as keyof Project['stages'];
                                          const stageData = p.stages[currentStage];
                                          const isReviewing = stageData?.status === 'review';
                                          const isHead = (
                                            (role === 'head_translator' && currentStage === 'translation') ||
                                            (role === 'head_editor' && currentStage === 'editing') ||
                                            (role === 'head_qc' && currentStage === 'qc')
                                          );

                                          if (isReviewing && isHead) {
                                            return (
                                              <div className="flex items-center gap-2">
                                                <button 
                                                  onClick={() => {
                                                    const fb = prompt("Alasan Penolakan / Revisi:");
                                                    if (fb) handleUpdateStageStatus(p.id, currentStage, 'rejected', fb);
                                                  }}
                                                  className="px-3 py-2 border border-rose-200 text-rose-600 text-[10px] font-bold rounded-lg hover:bg-rose-50"
                                                >
                                                  Reject
                                                </button>
                                                <button 
                                                  onClick={() => handleUpdateStageStatus(p.id, currentStage, 'approved')}
                                                  className="px-4 py-2 bg-emerald-600 text-white text-[10px] font-black uppercase rounded-lg hover:bg-emerald-700 shadow-md shadow-emerald-100"
                                                >
                                                  Approve
                                                </button>
                                              </div>
                                            );
                                          }
                                          return null;
                                        })()}

                                        {/* PM Open Revision Action */}
                                        {p.status === 'done' && role === 'pm' && (
                                          <div className="flex gap-1.5">
                                            <button 
                                              onClick={() => {
                                                const cat = prompt('Kategori (A: Naskah, B: Teknis, C: Minor/QC)?')?.toUpperCase();
                                                const feedback = prompt('Catatan revisi:');
                                                if (cat && feedback) {
                                                  const category = cat === 'A' ? 'translation' : cat === 'B' ? 'editing' : 'qc';
                                                  handleOpenRevision(p.id, category, feedback);
                                                }
                                              }}
                                              className="px-4 py-2 bg-rose-600 text-white text-[10px] font-black uppercase rounded-lg hover:bg-rose-700 transition-all"
                                            >
                                              Open Revision
                                            </button>
                                             <button 
                                              onClick={() => handleCloseProject(p.id)}
                                              className="px-4 py-2 bg-slate-900 text-white text-[10px] font-black uppercase rounded-lg hover:bg-slate-800 transition-all"
                                            >
                                              Finalize
                                            </button>
                                          </div>
                                        )}

                                        {/* Info for ongoing review */}
                                        {role !== 'pm' && ((p.status === 'translation-phase' && role === 'translator' && p.stages.translation.status === 'review') ||
                                          (p.status === 'editing-phase' && role === 'editor' && p.stages.editing.status === 'review') ||
                                          (p.status === 'qc-phase' && role === 'qc' && p.stages.qc.status === 'review')) && (
                                          <span className="text-[10px] font-bold text-slate-400 italic">Menunggu Review Head...</span>
                                        )}
                                      </div>
                                    </td>
                                  </>
                                );
                              })()}
                            </motion.tr>
                          );
                        })
                      )}
                    </AnimatePresence>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

        {/* Selection Toolbar */}
        <AnimatePresence>
          {selectedIds.length > 0 && (
            <motion.div 
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              className="fixed bottom-10 left-1/2 -translate-x-1/2 z-50 bg-slate-900 border border-white/10 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-6 backdrop-blur-xl"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-[11px] font-black shadow-lg shadow-primary/20">
                  {selectedIds.length}
                </div>
                <div className="flex flex-col">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Terpilih</p>
                  <p className="text-sm font-bold text-white tracking-tight leading-none">Status & Aksi</p>
                </div>
              </div>
              
              <div className="h-8 w-px bg-white/10" />
              
              <div className="flex items-center gap-2">
                <div className="relative group/status">
                  <select 
                    className="appearance-none bg-white/5 border border-white/10 hover:border-white/20 text-white pl-4 pr-10 py-2.5 rounded-xl text-xs font-bold focus:ring-2 focus:ring-primary outline-none transition-all cursor-pointer"
                    onChange={(e) => {
                      if (e.target.value) {
                        handleBatchUpdate({ status: e.target.value as any });
                        e.target.value = "";
                      }
                    }}
                  >
                    <option value="" className="bg-slate-900">Update Status...</option>
                    <option value="project-entry" className="bg-slate-900">1. Project Masuk</option>
                    <option value="translation-phase" className="bg-slate-900">2. Translation</option>
                    <option value="editing-phase" className="bg-slate-900">3. Editing Audio</option>
                    <option value="qc-phase" className="bg-slate-900">4. QC Phase</option>
                    <option value="done" className="bg-slate-900">5. Done</option>
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" />
                </div>

                <div className="flex items-center bg-white/5 border border-white/10 hover:border-white/20 px-3 py-1.5 rounded-xl transition-all">
                  <Calendar size={14} className="text-slate-400 mr-2" />
                  <input 
                    type="date"
                    className="bg-transparent text-white text-xs font-bold outline-none cursor-pointer"
                    onChange={(e) => {
                      if (e.target.value) {
                        const date = safeTimestamp(e.target.value);
                        if (date) {
                          handleBatchUpdate({ deadline: date });
                        }
                      }
                    }}
                  />
                </div>
              </div>

              <div className="h-8 w-px bg-white/10" />

              <button 
                onClick={() => setSelectedIds([])}
                className="flex items-center gap-2 text-slate-400 hover:text-white px-3 py-2 text-xs font-bold transition-colors"
              >
                <X size={14} />
                Batal
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <Modal
        isOpen={isSwapModalOpen}
        onClose={() => setIsSwapModalOpen(false)}
        title="Swap Staf Produksi"
      >
        <div className="p-8 space-y-6">
          <header className="text-center">
            <p className="text-[10px] font-black text-rose-500 uppercase tracking-[0.2em] mb-1">Perubahan Penugasan Urgent</p>
            <h4 className="text-lg font-black text-slate-900 leading-tight">Prosedur Handover Staf</h4>
            <div className="mt-3 flex items-center justify-center gap-2">
              <span className="px-2 py-1 bg-slate-100 text-slate-500 text-[10px] font-bold rounded capitalize">{swapData?.stage}</span>
              <ArrowRight size={12} className="text-slate-300" />
              <span className="text-[10px] text-slate-400 font-medium">Dari: {getMemberName(swapData?.oldStaffIds)}</span>
            </div>
          </header>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Staf Pengganti Baru</label>
              <select 
                multiple
                className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 text-sm font-semibold focus:ring-2 focus:ring-primary outline-none transition-all min-h-[120px]"
                value={selectedSwapNewStaffIds}
                onChange={(e) => {
                  const options = Array.from(e.target.selectedOptions);
                  const values = options.map(option => (option as HTMLOptionElement).value);
                  setSelectedSwapNewStaffIds(values);
                }}
              >
                {teamMembers
                  .filter(m => {
                    if (swapData?.stage === 'translation') return m.role === 'translator';
                    if (swapData?.stage === 'editing') return m.role === 'editor';
                    if (swapData?.stage === 'qc') return m.role === 'qc';
                    return false;
                  })
                  .map(m => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({projects.filter(p => p.status !== 'done' && (p.stages.translation.staffIds?.includes(m.id) || p.stages.editing.staffIds?.includes(m.id) || p.stages.qc.staffIds?.includes(m.id))).length} Active)
                    </option>
                  ))
                }
              </select>
              <p className="text-[9px] text-slate-400 font-medium italic mt-1">* Tekan Ctrl/Cmd untuk memilih lebih dari satu staf.</p>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Alasan Penggantian (Wajib)</label>
              <textarea 
                required
                value={swapReason}
                onChange={e => setSwapReason(e.target.value)}
                placeholder="Contoh: Staf sakit / slow response / kendala teknis..."
                className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 text-sm font-semibold focus:ring-2 focus:ring-primary outline-none transition-all h-24"
              />
            </div>
          </div>

          <div className="flex gap-4 pt-4 border-t border-slate-100">
            <button 
              onClick={() => setIsSwapModalOpen(false)}
              className="flex-1 py-4 border border-slate-200 text-slate-500 rounded-2xl font-bold hover:bg-slate-50 transition-all text-xs"
            >
              Batal
            </button>
            <button 
              onClick={handleSwapStaff}
              className="flex-1 py-4 bg-rose-600 text-white rounded-2xl font-bold hover:bg-rose-700 transition-all text-xs shadow-lg shadow-rose-200"
            >
              Laksanakan Swap
            </button>
          </div>
        </div>
      </Modal>

      {/* Role Selection Modal */}
      <Modal 
        isOpen={!!projectHoldingRoleSelection} 
        onClose={() => setProjectHoldingRoleSelection(null)}
        title="Pilih Peran Anda"
      >
        <div className="p-8 space-y-6">
          <div className="text-center">
            <p className="text-sm text-slate-500 font-medium mb-1">Anda akan mengakses proyek:</p>
            <h4 className="text-lg font-black text-slate-900">{projectHoldingRoleSelection?.title}</h4>
            <p className="text-[10px] font-bold text-primary uppercase tracking-widest mt-1">{projectHoldingRoleSelection?.client}</p>
          </div>
          
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {(['pm', 'translator', 'head_translator', 'editor', 'head_editor', 'qc', 'head_qc'] as const).map(role => (
              <button
                key={role}
                onClick={() => projectHoldingRoleSelection && handleAssignProjectRole(projectHoldingRoleSelection.id, role)}
                className="flex flex-col items-center justify-center p-4 bg-slate-50 border border-slate-100 rounded-2xl hover:border-primary hover:bg-white transition-all group shadow-sm active:scale-95"
              >
                <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-slate-400 group-hover:text-primary group-hover:bg-primary/5 transition-all mb-2 shadow-sm border border-slate-100">
                  {(role === 'pm') && <Users size={20} />}
                  {(role.includes('head')) && <CheckCircle size={20} />}
                  {(role === 'translator' || role === 'editor' || role === 'qc') && <PenBox size={20} />}
                </div>
                <span className="text-[8px] font-black uppercase tracking-widest text-slate-400 group-hover:text-slate-900 text-center">
                  {role.replace('_', ' ').toUpperCase()}
                </span>
              </button>
            ))}
          </div>
          
          <p className="text-[10px] text-center text-slate-400 font-medium italic">
            Peran ini akan menentukan tampilan dan aksi yang tersedia untuk Anda di proyek ini.
          </p>
        </div>
      </Modal>

      {/* Project Modal */}
      <Modal 
        isOpen={isAdding} 
        onClose={() => setIsAdding(false)} 
        title="Input Proyek Baru"
      >
        <form onSubmit={handleAddProject} className="p-8 space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Nama Klien</label>
              <input required value={newProject.client} onChange={e => setNewProject({...newProject, client: e.target.value})} placeholder="Contoh: Netflix / CCJK" className="w-full bg-slate-50 border border-border-main rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary outline-none transition-all font-semibold" />
            </div>
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">ID Proyek / Kode</label>
              <input value={newProject.projectCode} onChange={e => setNewProject({...newProject, projectCode: e.target.value})} placeholder="P-001" className="w-full bg-slate-50 border border-border-main rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary outline-none transition-all font-semibold uppercase" />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Judul Proyek / Episode</label>
            <input required value={newProject.title} onChange={e => setNewProject({...newProject, title: e.target.value})} placeholder="The Glory Ep 01" className="w-full bg-slate-50 border border-border-main rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary outline-none transition-all font-semibold" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Durasi (Menit)</label>
              <input 
                required 
                type="number" 
                min="0" 
                value={newProject.min} 
                onChange={e => setNewProject({...newProject, min: parseInt(e.target.value) || 0, duration: (parseInt(e.target.value) || 0) + (newProject.sec / 60)})} 
                className="w-full bg-slate-50 border border-border-main rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary outline-none transition-all font-mono"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Detik</label>
              <input 
                required 
                type="number" 
                min="0"
                max="59"
                value={newProject.sec} 
                onChange={e => setNewProject({...newProject, sec: parseInt(e.target.value) || 0, duration: newProject.min + ((parseInt(e.target.value) || 0) / 60)})} 
                className="w-full bg-slate-50 border border-border-main rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary outline-none transition-all font-mono" 
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Jenis Layanan</label>
              <select 
                value={newProject.serviceType}
                onChange={e => setNewProject({...newProject, serviceType: e.target.value as any})}
                className="w-full bg-slate-50 border border-border-main rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary outline-none transition-all font-semibold"
              >
                <option value="dubbing">Dubbing</option>
                <option value="subtitling">Subtitling</option>
                <option value="transkreasi">Transkreasi</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Deadline</label>
              <input required type="date" value={newProject.deadline} onChange={e => setNewProject({...newProject, deadline: e.target.value})} className="w-full bg-slate-50 border border-border-main rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary outline-none transition-all" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Link Naskah (Drive)</label>
              <input value={newProject.scriptLink} onChange={e => setNewProject({...newProject, scriptLink: e.target.value})} placeholder="https://drive.google.com/..." className="w-full bg-slate-50 border border-border-main rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary outline-none transition-all font-semibold" />
            </div>
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Link Video Ref (Streaming)</label>
              <input value={newProject.referenceLink} onChange={e => setNewProject({...newProject, referenceLink: e.target.value})} placeholder="https://..." className="w-full bg-slate-50 border border-border-main rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary outline-none transition-all font-semibold" />
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t border-slate-100">
            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Penugasan Kepala Tim (Heads)</h4>
            
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Head Translator</label>
                  <select 
                    required
                    value={newProject.headTranslator}
                    onChange={e => setNewProject({...newProject, headTranslator: e.target.value})}
                    className="w-full bg-slate-50 border border-border-main rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="">Pilih Head Translator</option>
                    {teamMembers.filter(m => (m as any).role === 'head_translator' || (m as any).role === 'pm').map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Head Editor</label>
                  <select 
                    required
                    value={newProject.headEditor}
                    onChange={e => setNewProject({...newProject, headEditor: e.target.value})}
                    className="w-full bg-slate-50 border border-border-main rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="">Pilih Head Editor</option>
                    {teamMembers.filter(m => (m as any).role === 'head_editor' || (m as any).role === 'pm').map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Head QC</label>
                  <select 
                    required
                    value={newProject.headQC}
                    onChange={e => setNewProject({...newProject, headQC: e.target.value})}
                    className="w-full bg-slate-50 border border-border-main rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="">Pilih Head QC</option>
                    {teamMembers.filter(m => (m as any).role === 'head_qc' || (m as any).role === 'pm').map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-4 flex gap-4">
            <button type="button" onClick={() => setIsAdding(false)} className="flex-1 px-4 py-3 border border-border-main rounded-xl font-bold text-text-muted hover:bg-slate-50 transition-all text-sm uppercase tracking-wider">Batal</button>
            <button type="submit" className="flex-1 px-4 py-3 bg-primary text-white rounded-xl font-bold hover:bg-primary-hover transition-all text-sm uppercase tracking-wider shadow-lg shadow-primary/20">Simpan Proyek</button>
          </div>
        </form>
      </Modal>

      {/* History Modal */}
      <Modal 
        isOpen={!!showHistoryFor} 
        onClose={() => setShowHistoryFor(null)} 
        title={`History Progres: ${showHistoryFor?.title}`}
      >
        <div className="p-8 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
          {!showHistoryFor?.history || showHistoryFor.history.length === 0 ? (
            <div className="text-center py-10 text-slate-400 font-medium font-sans">Belum ada riwayat aktivitas.</div>
          ) : (
            <div className="space-y-4">
              {showHistoryFor.history.map((log, idx) => (
                <div key={idx} className="flex gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="w-10 h-10 bg-white rounded-xl shadow-sm border border-slate-100 flex items-center justify-center text-primary shrink-0">
                    <History size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-xs font-black text-slate-900 uppercase tracking-tight">{log.action.replace(/_/g, ' ')}</span>
                      <span className="text-[10px] font-bold text-slate-400">
                        {log.timestamp?.toDate ? log.timestamp.toDate().toLocaleString('id-ID') : new Date(log.timestamp).toLocaleString('id-ID')}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 font-medium leading-relaxed">{log.details}</p>
                    <div className="mt-2 flex items-center gap-1.5 text-[9px] font-bold text-primary bg-primary/5 px-2 py-0.5 rounded-full w-fit">
                      <UserIcon size={10} />
                      {getMemberName(log.userId)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      {/* Settings Modal */}
      <Modal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
        title="Pengaturan Sistem"
      >
        <div className="p-8 space-y-6 overflow-y-auto max-h-[70vh]">
          {/* User Profile Section */}
          <div className="space-y-4 pb-6 border-b border-border-main">
            <div className="flex items-center gap-2 mb-4">
              <UserIcon size={18} className="text-primary" />
              <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest">Profil Anda</h4>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-text-muted uppercase">Nama Tampilan</label>
                <input 
                  value={userSettings.profile?.name || ''} 
                  onChange={e => {
                    const newProfile = { ...(userSettings.profile || { name: '', role: 'editor' as const }), name: e.target.value };
                    setUserSettings({ ...userSettings, profile: newProfile });
                    updateDoc(doc(db, 'settings', user.uid), { profile: newProfile });
                  }}
                  className="w-full bg-slate-50 border border-border-main rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none transition-all font-semibold"
                  placeholder="Nama Lengkap"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-text-muted uppercase">Peran (Role)</label>
                <select 
                  value={userSettings.profile?.role || 'translator'}
                  onChange={e => {
                    const newProfile = { ...(userSettings.profile || { name: '', role: 'translator' as const }), role: e.target.value as any };
                    setUserSettings({ ...userSettings, profile: newProfile });
                    updateDoc(doc(db, 'settings', user.uid), { profile: newProfile });
                  }}
                  className="w-full bg-slate-50 border border-border-main rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none transition-all font-semibold"
                >
                  <option value="pm">Project Manager (PM)</option>
                  <option value="head_translator">Head Translator</option>
                  <option value="translator">Translator</option>
                  <option value="head_editor">Head Editor</option>
                  <option value="editor">Editor</option>
                  <option value="head_qc">Head QC</option>
                  <option value="qc">QC Staff</option>
                </select>
              </div>
            </div>
          </div>

          {/* Team Management Section */}
          {canManageTeam && (
            <div className="space-y-4 pb-6 border-b border-border-main">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Users size={18} className="text-primary" />
                  <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest">Manajemen Tim</h4>
                </div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{teamMembers.length} Personel Terdaftar</span>
              </div>
              
              <div className="space-y-2">
                {teamMembers.map((member: any) => (
                  <div key={member.id} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-100 rounded-xl hover:border-primary/20 transition-all group">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-white border border-slate-200 rounded-lg flex items-center justify-center text-[10px] font-black text-primary">
                        {(member.name || '?')[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="text-xs font-black text-slate-900 leading-tight">
                          {member.name} {member.id === user.uid && <span className="text-[8px] bg-primary text-white px-1.5 py-0.5 rounded ml-1">ANDA</span>}
                        </p>
                        <div className="flex items-center gap-2">
                          {canManageTeam && member.id !== user.uid ? (
                            <select
                              value={member.role || 'translator'}
                              onChange={(e) => handleUpdateMemberRole(member.id, e.target.value as UserRole)}
                              className="text-[10px] font-bold text-slate-500 uppercase tracking-widest bg-transparent border-none p-0 focus:ring-0 outline-none cursor-pointer hover:text-primary"
                            >
                              <option value="pm">Project Manager (PM)</option>
                              <option value="head_translator">Head Translator</option>
                              <option value="translator">Translator</option>
                              <option value="head_editor">Head Editor</option>
                              <option value="editor">Editor</option>
                              <option value="head_qc">Head QC</option>
                              <option value="qc">QC Staff</option>
                            </select>
                          ) : (
                            <p className="text-[10px] text-slate-500 font-medium uppercase tracking-widest">
                              {member.role?.toUpperCase()}
                            </p>
                          )}
                          <span className="text-[8px] text-slate-300">•</span>
                          <p className="text-[10px] text-slate-500 font-medium whitespace-nowrap overflow-hidden text-ellipsis max-w-[120px]">
                            {member.email || 'No Email'}
                          </p>
                        </div>
                      </div>
                    </div>
                    
                    {canManageTeam && member.id !== user.uid && (
                      <button 
                        onClick={async () => {
                          if (window.confirm(`Hapus ${member.name} dari sistem? User ini tidak akan bisa login lagi.`)) {
                            try {
                              await deleteDoc(doc(db, 'settings', member.id));
                            } catch (err) {
                              handleFirestoreError(err, OperationType.DELETE, `settings/${member.id}`);
                            }
                          }
                        }}
                        className="w-8 h-8 rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-all opacity-0 group-hover:opacity-100 flex items-center justify-center"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-4">
              <Bell size={18} className="text-primary" />
              <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest">Pengaturan Pengingat</h4>
            </div>
            
            <div className="flex items-center justify-between p-4 bg-slate-50 border border-border-main rounded-xl">
              <div className="space-y-0.5">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Web Push Notifications</label>
                <p className="text-[10px] text-slate-500">Terima pemberitahuan langsung di browser Anda.</p>
              </div>
              <button 
                onClick={requestNotificationPermission}
                disabled={isPushLoading || !!userSettings.profile?.fcmToken}
                className={cn(
                  "px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                  userSettings.profile?.fcmToken 
                    ? "bg-emerald-100 text-emerald-600 cursor-default" 
                    : "bg-primary text-white hover:bg-primary-hover active:scale-95 disabled:opacity-50"
                )}
              >
                {isPushLoading ? 'Proses...' : userSettings.profile?.fcmToken ? 'Aktif' : 'Aktifkan'}
              </button>
            </div>

            <div className="flex items-center justify-between p-4 bg-slate-50 border border-border-main rounded-xl">
              <div className="space-y-0.5">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Aktifkan Pengingat</label>
                <p className="text-[10px] text-slate-500">Notifikasi otomatis untuk proyek mendekati deadline.</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={settings.reminders?.enabled || false}
                  onChange={e => setSettings({
                    ...settings, 
                    reminders: { 
                      frequency: settings.reminders?.frequency || 'daily',
                      time: settings.reminders?.time || '09:00',
                      enabled: e.target.checked 
                    }
                  })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>

            <AnimatePresence>
              {settings.reminders?.enabled && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-4 overflow-hidden"
                >
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-text-muted uppercase">Frekuensi</label>
                      <select 
                        value={settings.reminders?.frequency || 'daily'}
                        onChange={e => setSettings({
                          ...settings,
                          reminders: {
                            ...(settings.reminders!),
                            frequency: e.target.value as 'daily' | 'weekly'
                          }
                        })}
                        className="w-full bg-slate-50 border border-border-main rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none transition-all"
                      >
                        <option value="daily">Setiap Hari</option>
                        <option value="weekly">Setiap Minggu</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-text-muted uppercase">Waktu Pengingat</label>
                      <input 
                        type="time" 
                        value={settings.reminders?.time || '09:00'}
                        onChange={e => setSettings({
                          ...settings,
                          reminders: {
                            ...(settings.reminders!),
                            time: e.target.value
                          }
                        })}
                        className="w-full bg-slate-50 border border-border-main rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary outline-none transition-all font-mono"
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="pt-6 border-t border-border-main flex gap-4">
            <button 
              type="button"
              onClick={() => setIsSettingsOpen(false)} 
              className="flex-1 py-3 border border-border-main text-text-muted rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-slate-50 transition-all font-sans"
            >
              Tutup
            </button>
          </div>
        </div>
      </Modal>

      <Modal 
        isOpen={isDeleting} 
        onClose={() => setIsDeleting(false)} 
        title="Confirm Deletion"
      >
        <div className="p-8 space-y-6 text-center">
          <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <Trash2 size={32} />
          </div>
          <div className="space-y-2">
            <h4 className="text-xl font-bold text-slate-800">Are you absolutely sure?</h4>
            <p className="text-sm text-slate-500">This action cannot be undone. This will permanently delete the entry from our servers.</p>
          </div>
          <div className="flex gap-4">
            <button 
              onClick={() => setIsDeleting(false)} 
              className="flex-1 px-4 py-3 border border-border-main rounded-xl font-bold text-slate-500 text-sm uppercase tracking-wider hover:bg-slate-50 transition-all"
            >
              Cancel
            </button>
            <button 
              onClick={confirmDelete} 
              className="flex-1 px-4 py-3 bg-red-600 text-white rounded-xl font-bold text-sm uppercase tracking-wider shadow-lg shadow-red-200 hover:bg-red-700 transition-all"
            >
              Confirm Delete
            </button>
          </div>
        </div>
      </Modal>

      <Modal 
        isOpen={isEditingProject} 
        onClose={() => setIsEditingProject(false)} 
        title="Modify Project Workspace"
      >
        {editingProject && (() => {
          const effectiveRole = editingProject.memberRoles?.[user.uid] || userSettings.profile?.role || 'editor';
          const canEditAll = isSuperUser || effectiveRole === 'pm' || effectiveRole === 'editor';
          
          return (
            <form onSubmit={handleUpdateProject} className="p-8 space-y-6 max-h-[80vh] overflow-y-auto">
              <div className="space-y-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-black text-primary bg-primary/10 px-2 py-1 rounded-full uppercase tracking-tighter">
                    Role: {effectiveRole} 
                  </span>
                  {!canEditAll && (
                    <button 
                      type="button"
                      onClick={() => {
                        setIsEditingProject(false);
                        setProjectHoldingRoleSelection(editingProject);
                      }}
                      className="text-[10px] font-bold text-slate-400 hover:text-primary transition-colors uppercase tracking-widest"
                    >
                      Ganti Role Proyek
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Nama Klien</label>
                    <input 
                      required 
                      readOnly={!canEditAll}
                      value={editingProject.client || ''} 
                      onChange={e => setEditingProject({...editingProject, client: e.target.value})} 
                      className={cn("w-full bg-slate-50 border border-border-main rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary outline-none text-sm font-semibold", !canEditAll && "opacity-60 cursor-not-allowed")} 
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">ID Proyek / Kode</label>
                    <input 
                      readOnly={!canEditAll} 
                      value={editingProject.projectCode || ''} 
                      onChange={e => setEditingProject({...editingProject, projectCode: e.target.value})} 
                      className={cn("w-full bg-slate-50 border border-border-main rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary outline-none text-sm font-semibold uppercase", !canEditAll && "opacity-60 cursor-not-allowed")} 
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Judul Proyek / Episode</label>
                  <input 
                    required 
                    readOnly={!canEditAll} 
                    value={editingProject.title || ''} 
                    onChange={e => setEditingProject({...editingProject, title: e.target.value})} 
                    className={cn("w-full bg-slate-50 border border-border-main rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary outline-none text-sm font-semibold", !canEditAll && "opacity-60 cursor-not-allowed")} 
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Durasi (Menit)</label>
                    <div className="flex gap-2">
                      <input 
                        required 
                        readOnly={!canEditAll} 
                        type="number" 
                        value={Math.floor(editingProject.duration || 0)} 
                        onChange={e => {
                          const mins = parseInt(e.target.value) || 0;
                          const currentSecs = Math.round((editingProject.duration - Math.floor(editingProject.duration)) * 60);
                          setEditingProject({...editingProject, duration: mins + (currentSecs / 60)});
                        }} 
                        className={cn("w-20 bg-slate-50 border border-border-main rounded-xl px-4 py-3 text-sm font-mono", !canEditAll && "opacity-60 cursor-not-allowed")} 
                      />
                      <span className="flex items-center text-slate-400">:</span>
                      <input 
                        required 
                        readOnly={!canEditAll} 
                        type="number" 
                        max="59"
                        value={Math.round((editingProject.duration - Math.floor(editingProject.duration)) * 60)} 
                        onChange={e => {
                          const secs = parseInt(e.target.value) || 0;
                          const currentMins = Math.floor(editingProject.duration || 0);
                          setEditingProject({...editingProject, duration: currentMins + (secs / 60)});
                        }} 
                        className={cn("w-20 bg-slate-50 border border-border-main rounded-xl px-4 py-3 text-sm font-mono", !canEditAll && "opacity-60 cursor-not-allowed")} 
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Status Produksi</label>
                    <div className="relative">
                      <select 
                        disabled={!canEditAll}
                        value={editingProject.status} 
                        onChange={e => setEditingProject({...editingProject, status: e.target.value as any})}
                        className={cn(
                          "w-full appearance-none bg-slate-50 border border-border-main rounded-xl px-4 py-3 font-bold text-sm outline-none focus:ring-2 focus:ring-primary transition-all", 
                          !canEditAll && "opacity-60 cursor-not-allowed",
                          STATUS_CONFIG[editingProject.status]?.color || "bg-slate-50 text-slate-400",
                          "border-l-4",
                          editingProject.status === 'done' ? "border-l-emerald-500" : "border-l-primary"
                        )}
                      >
                        {Object.entries(STATUS_CONFIG).map(([key, config], i) => (
                          <option key={key} value={key}>{i + 1}. {config.label}</option>
                        ))}
                      </select>
                      <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none opacity-40" />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 py-4 border-y border-slate-50 mt-4">
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Jenis Layanan</label>
                    <select 
                      disabled={!canEditAll}
                      value={editingProject.serviceType}
                      onChange={e => setEditingProject({...editingProject, serviceType: e.target.value as any})}
                      className={cn("w-full bg-slate-50 border border-border-main rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary outline-none text-sm font-semibold", !canEditAll && "opacity-60 cursor-not-allowed")}
                    >
                      <option value="dubbing">Dubbing</option>
                      <option value="subtitling">Subtitling</option>
                      <option value="transkreasi">Transkreasi</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Link Video Ref</label>
                    <input 
                      readOnly={!canEditAll}
                      value={editingProject.referenceLink || ''} 
                      onChange={e => setEditingProject({...editingProject, referenceLink: e.target.value})} 
                      placeholder="https://..."
                      className={cn("w-full bg-slate-50 border border-border-main rounded-xl px-4 py-3 text-sm font-semibold", !canEditAll && "opacity-60 cursor-not-allowed")} 
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Link Naskah (Drive)</label>
                  <input 
                    readOnly={!canEditAll}
                    value={editingProject.scriptLink || ''} 
                    onChange={e => setEditingProject({...editingProject, scriptLink: e.target.value})} 
                    placeholder="https://drive.google.com/..."
                    className={cn("w-full bg-slate-50 border border-border-main rounded-xl px-4 py-3 text-sm font-semibold", !canEditAll && "opacity-60 cursor-not-allowed")} 
                  />
                </div>

                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100">
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-orange-600 uppercase tracking-wider">Translator Assigned</label>
                    <input readOnly={!canEditAll && effectiveRole !== 'translator'} value={editingProject.translator || ''} onChange={e => setEditingProject({...editingProject, translator: e.target.value})} className={cn("w-full bg-orange-50/50 border border-orange-100 rounded-xl px-4 py-3 outline-none text-sm font-semibold", (!canEditAll && effectiveRole !== 'translator') && "opacity-60 cursor-not-allowed")} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-blue-600 uppercase tracking-wider">Editor Assigned</label>
                    <input readOnly={!canEditAll && effectiveRole !== 'editor'} value={editingProject.editor || ''} onChange={e => setEditingProject({...editingProject, editor: e.target.value})} className={cn("w-full bg-blue-50/50 border border-blue-100 rounded-xl px-4 py-3 outline-none text-sm font-semibold", !canEditAll && "opacity-60 cursor-not-allowed")} />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-cyan-600 uppercase tracking-wider">Breakdown By</label>
                  <input readOnly={!canEditAll && effectiveRole !== 'breakdown'} value={editingProject.breakdownBy || ''} onChange={e => setEditingProject({...editingProject, breakdownBy: e.target.value})} className={cn("w-full bg-cyan-50/50 border border-cyan-100 rounded-xl px-4 py-3 outline-none text-sm font-semibold", (!canEditAll && effectiveRole !== 'breakdown') && "opacity-60 cursor-not-allowed")} />
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Deadline Proyek</label>
                  <input 
                    readOnly={!canEditAll}
                    type="date" 
                    value={formatDateForInput(editingProject.deadline)} 
                    onChange={e => setEditingProject({...editingProject, deadline: e.target.value})} 
                    className={cn("w-full bg-slate-50 border border-border-main rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary outline-none transition-all text-sm font-mono", !canEditAll && "opacity-60 cursor-not-allowed")} 
                  />
                </div>

                <div className="space-y-4 pt-4 border-t border-slate-100">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Penugasan Kepala Tim (Heads)</h4>
                  
                  <div className="grid grid-cols-1 gap-4">
                    <div className="space-y-2">
                      <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Head Translator</label>
                      <select 
                        disabled={!canEditAll}
                        value={editingProject.headTranslator}
                        onChange={e => setEditingProject({...editingProject, headTranslator: e.target.value})}
                        className="w-full bg-slate-50 border border-border-main rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary"
                      >
                        <option value="">Pilih Head Translator</option>
                        {teamMembers.filter(m => (m as any).role === 'head_translator' || (m as any).role === 'pm').map(m => (
                          <option key={m.id} value={m.id}>{m.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Head Editor</label>
                      <select 
                        disabled={!canEditAll}
                        value={editingProject.headEditor}
                        onChange={e => setEditingProject({...editingProject, headEditor: e.target.value})}
                        className="w-full bg-slate-50 border border-border-main rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary"
                      >
                        <option value="">Pilih Head Editor</option>
                        {teamMembers.filter(m => (m as any).role === 'head_editor' || (m as any).role === 'pm').map(m => (
                          <option key={m.id} value={m.id}>{m.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Head QC</label>
                      <select 
                        disabled={!canEditAll}
                        value={editingProject.headQC}
                        onChange={e => setEditingProject({...editingProject, headQC: e.target.value})}
                        className="w-full bg-slate-50 border border-border-main rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary"
                      >
                        <option value="">Pilih Head QC</option>
                        {teamMembers.filter(m => (m as any).role === 'head_qc' || (m as any).role === 'pm').map(m => (
                          <option key={m.id} value={m.id}>{m.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="pt-6 border-t border-border-main flex gap-4">
                  <button type="button" onClick={() => setIsEditingProject(false)} className="flex-1 px-4 py-3 border border-border-main rounded-xl font-bold text-text-muted hover:bg-slate-50 transition-all text-xs uppercase tracking-widest">Tutup</button>
                  <button type="submit" className="flex-1 px-4 py-3 bg-primary text-white rounded-xl font-bold hover:bg-primary-hover shadow-lg shadow-primary/20 transition-all text-xs uppercase tracking-widest">Update Proyek</button>
                </div>
              </div>
            </form>
          );
        })()}
      </Modal>
    </div>
  );
}
