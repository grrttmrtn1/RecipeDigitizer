import { useState, useEffect, useRef, ReactNode, FormEvent } from "react";
import { 
  Upload, 
  BookOpen, 
  Settings, 
  Trash2, 
  Save, 
  ChevronLeft, 
  ChevronRight, 
  Loader2, 
  ExternalLink,
  Plus,
  X,
  FileText,
  Image as ImageIcon,
  Users,
  LogOut,
  Lock,
  User,
  Shield,
  Eye,
  CheckCircle,
  AlertCircle
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { extractRecipeFromImage, RecipeData } from "./services/gemini";

interface UserProfile {
  id: string;
  username: string;
  role: 'admin' | 'user' | 'readonly';
  can_edit_mealie: number;
  require_password_change: number;
}

interface SavedRecipe extends RecipeData {
  id: string;
  image_data?: string;
  mime_type?: string;
  created_at: string;
}

interface PendingUpload {
  file: File;
  preview: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  data?: RecipeData;
  error?: string;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'upload' | 'library' | 'settings' | 'admin'>('upload');
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [library, setLibrary] = useState<SavedRecipe[]>([]);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);
  
  // Auth State
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(true);
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [newPasswordValue, setNewPasswordValue] = useState('');
  const [passwordChangeError, setPasswordChangeError] = useState('');
  const [passwordChangeSuccess, setPasswordChangeSuccess] = useState('');
  const [settingsError, setSettingsError] = useState('');
  const [settingsSuccess, setSettingsSuccess] = useState('');
  const [mealieStatus, setMealieStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  // Mealie Config (now persistent on server)
  const [mealieUrl, setMealieUrl] = useState('');
  const [mealieToken, setMealieToken] = useState('');

  // Password Complexity Settings
  const [passwordMinLength, setPasswordMinLength] = useState(10);
  const [passwordRequireSpecial, setPasswordRequireSpecial] = useState(true);
  const [passwordRequireNumber, setPasswordRequireNumber] = useState(true);
  const [passwordReqs, setPasswordReqs] = useState<any>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (user && user.require_password_change !== 1) {
      fetchLibrary();
      fetchSettings();
    }
    fetchPasswordRequirements();
  }, [user]);

  const fetchPasswordRequirements = async () => {
    try {
      const res = await fetch('/api/auth/password-requirements', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setPasswordReqs(data);
      }
    } catch (err) {
      console.error("Failed to fetch password requirements", err);
    }
  };

  const checkAuth = async () => {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setUser(data);
        if (data.require_password_change === 1) {
          setShowPasswordChange(true);
        } else {
          setShowPasswordChange(false);
        }
      }
    } catch (err) {
      console.error("Auth check failed", err);
    } finally {
      setIsAuthenticating(false);
    }
  };

  const fetchLibrary = async () => {
    setIsLoadingLibrary(true);
    try {
      const res = await fetch('/api/recipes', { credentials: 'include' });
      if (!res.ok) {
        if (res.status === 401) {
          setUser(null);
          return;
        }
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error! status: ${res.status}`);
      }
      const data = await res.json();
      if (Array.isArray(data)) {
        setLibrary(data.map((r: any) => ({
          ...r,
          ingredients: typeof r.ingredients === 'string' ? JSON.parse(r.ingredients) : (r.ingredients || []),
          instructions: typeof r.instructions === 'string' ? JSON.parse(r.instructions) : (r.instructions || [])
        })));
      } else {
        console.error("Library data is not an array", data);
        setLibrary([]);
      }
    } catch (err) {
      console.error("Failed to fetch library", err);
      setLibrary([]);
    } finally {
      setIsLoadingLibrary(false);
    }
  };

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoginError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUsername, password: loginPassword }),
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data);
        if (data.require_password_change === 1) {
          setShowPasswordChange(true);
        } else {
          setShowPasswordChange(false);
        }
      } else {
        setLoginError('Invalid username or password');
      }
    } catch (err) {
      setLoginError('Connection failed');
    }
  };

  const handlePasswordChange = async (e: FormEvent) => {
    e.preventDefault();
    setPasswordChangeError('');
    setPasswordChangeSuccess('');
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: newPasswordValue }),
        credentials: 'include'
      });
      console.log(`Password change response status: ${res.status}`);
      if (res.ok) {
        setShowPasswordChange(false);
        setNewPasswordValue('');
        setUser(prev => prev ? { ...prev, require_password_change: 0 } : null);
        setPasswordChangeSuccess("Password changed successfully");
      } else {
        const data = await res.json();
        setPasswordChangeError(data.error || "Failed to change password");
      }
    } catch (err) {
      setPasswordChangeError("Connection failed");
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    setUser(null);
    setActiveTab('upload');
  };

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/settings', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setMealieUrl(data.mealieUrl || '');
        setMealieToken(data.mealieToken || '');
        setPasswordMinLength(parseInt(data.passwordMinLength || "10"));
        setPasswordRequireSpecial(data.passwordRequireSpecial === "1");
        setPasswordRequireNumber(data.passwordRequireNumber === "1");
      } else if (res.status === 401) {
        setUser(null);
      }
    } catch (err) {
      console.error("Failed to fetch settings", err);
    }
  };

  const saveSettings = async () => {
    setSettingsError('');
    setSettingsSuccess('');
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          mealieUrl, 
          mealieToken,
          passwordMinLength,
          passwordRequireSpecial,
          passwordRequireNumber
        }),
        credentials: 'include'
      });
      if (res.ok) {
        setSettingsSuccess("Settings saved successfully");
        fetchPasswordRequirements();
      } else {
        const data = await res.json();
        setSettingsError(data.error || "Failed to save settings");
      }
    } catch (err) {
      setSettingsError("Failed to save settings");
    }
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    
    const newUploads: PendingUpload[] = Array.from(files)
      .filter(file => file.type.startsWith('image/') || file.type === 'application/pdf')
      .map(file => ({
        file,
        preview: URL.createObjectURL(file),
        status: 'pending'
      }));

    setPendingUploads(prev => [...prev, ...newUploads]);
    setActiveTab('upload');
  };

  const processRecipe = async (index: number) => {
    const upload = pendingUploads[index];
    if (!upload || upload.status === 'processing') return;

    setPendingUploads(prev => prev.map((u, i) => i === index ? { ...u, status: 'processing' } : u));

    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(upload.file);
      });
      const base64 = await base64Promise;
      
      const data = await extractRecipeFromImage(base64, upload.file.type);
      
      setPendingUploads(prev => prev.map((u, i) => i === index ? { 
        ...u, 
        status: 'completed', 
        data 
      } : u));
    } catch (err: any) {
      setPendingUploads(prev => prev.map((u, i) => i === index ? { 
        ...u, 
        status: 'error', 
        error: err.message 
      } : u));
    }
  };

  const saveToLibrary = async (index: number) => {
    const upload = pendingUploads[index];
    if (!upload.data) return;

    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(upload.file);
      });
      const base64 = await base64Promise;

      const res = await fetch('/api/recipes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...upload.data,
          image_data: base64,
          mime_type: upload.file.type
        }),
        credentials: 'include'
      });

      if (res.ok) {
        fetchLibrary();
        // Optionally remove from pending
        setPendingUploads(prev => prev.filter((_, i) => i !== index));
        if (currentIndex >= pendingUploads.length - 1) {
          setCurrentIndex(Math.max(0, pendingUploads.length - 2));
        }
      }
    } catch (err) {
      console.error("Save failed", err);
    }
  };

  const deleteFromLibrary = async (id: string) => {
    if (!confirm("Are you sure you want to delete this recipe?")) return;
    try {
      await fetch(`/api/recipes/${id}`, { method: 'DELETE', credentials: 'include' });
      fetchLibrary();
    } catch (err) {
      console.error("Delete failed", err);
    }
  };

  const submitToMealie = async (recipe: RecipeData) => {
    setMealieStatus(null);
    if (!mealieUrl || !mealieToken) {
      setMealieStatus({ type: 'error', message: "Please configure Mealie settings first." });
      setActiveTab('settings');
      return;
    }

    try {
      const res = await fetch('/api/mealie/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mealieUrl,
          apiToken: mealieToken,
          recipe
        }),
        credentials: 'include'
      });
      const data = await res.json();
      if (res.ok) {
        setMealieStatus({ type: 'success', message: "Successfully submitted to Mealie!" });
      } else {
        setMealieStatus({ type: 'error', message: `Mealie error: ${data.error || 'Unknown error'}` });
      }
    } catch (err) {
      setMealieStatus({ type: 'error', message: "Failed to connect to Mealie server." });
    }
  };

  if (isAuthenticating) {
    return (
      <div className="min-h-screen bg-[#FDFCFB] flex items-center justify-center">
        <Loader2 className="animate-spin text-emerald-600" size={48} />
      </div>
    );
  }

  if (showPasswordChange) {
    return (
      <div className="min-h-screen bg-[#FDFCFB] flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white p-8 rounded-3xl border border-stone-200 shadow-xl max-w-md w-full"
        >
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-amber-500 rounded-2xl flex items-center justify-center text-white mb-4">
              <Lock size={32} />
            </div>
            <h1 className="text-2xl font-serif font-medium">Password Change Required</h1>
            <p className="text-stone-500 text-sm mt-1 text-center">For security reasons, you must change your password before continuing.</p>
          </div>

          <form onSubmit={handlePasswordChange} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-stone-700">New Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
                <input 
                  type="password" 
                  required
                  value={newPasswordValue}
                  onChange={(e) => setNewPasswordValue(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-stone-200 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
                  placeholder="New Password"
                />
              </div>
              {passwordReqs && (
                <div className="text-[10px] text-stone-400 space-y-0.5 px-1">
                  <p>• Minimum {passwordReqs.passwordMinLength} characters</p>
                  {passwordReqs.passwordRequireNumber === "1" && <p>• At least one number</p>}
                  {passwordReqs.passwordRequireSpecial === "1" && <p>• At least one special character</p>}
                </div>
              )}
            </div>
            {passwordChangeError && <p className="text-red-500 text-sm text-center">{passwordChangeError}</p>}
            <button 
              type="submit"
              className="w-full py-3 bg-stone-900 text-white rounded-xl font-medium hover:bg-stone-800 transition-colors shadow-lg"
            >
              Update Password
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#FDFCFB] flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-8 rounded-3xl border border-stone-200 shadow-xl max-w-md w-full"
        >
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-emerald-600 rounded-2xl flex items-center justify-center text-white font-bold text-3xl mb-4">R</div>
            <h1 className="text-2xl font-serif font-medium">RecipeDigitizer</h1>
            <p className="text-stone-500 text-sm mt-1">Sign in to manage your recipes</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-stone-700">Username</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
                <input 
                  type="text" 
                  required
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-stone-200 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
                  placeholder="admin"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-stone-700">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
                <input 
                  type="password" 
                  required
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-stone-200 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
                  placeholder="••••••••"
                />
              </div>
            </div>
            {loginError && <p className="text-red-500 text-sm text-center">{loginError}</p>}
            <button 
              type="submit"
              className="w-full py-3 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-600/20"
            >
              Sign In
            </button>
          </form>
          <div className="mt-8 pt-6 border-t border-stone-100 text-center">
            <p className="text-xs text-stone-400">Default credentials: admin / Admin@12345</p>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FDFCFB] text-stone-900 font-sans">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 bg-white/80 backdrop-blur-md border-b border-stone-200 z-50">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center text-white font-bold">R</div>
            <h1 className="text-xl font-semibold tracking-tight">RecipeDigitizer</h1>
          </div>
          <div className="flex gap-1">
            <NavButton active={activeTab === 'upload'} onClick={() => setActiveTab('upload')} icon={<Upload size={18} />} label="Upload" />
            <NavButton active={activeTab === 'library'} onClick={() => setActiveTab('library')} icon={<BookOpen size={18} />} label="Library" />
            <NavButton active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} icon={<Settings size={18} />} label="Settings" />
            {user.role === 'admin' && (
              <NavButton active={activeTab === 'admin'} onClick={() => setActiveTab('admin')} icon={<Users size={18} />} label="Admin" />
            )}
            <button 
              onClick={handleLogout}
              className="p-2 text-stone-400 hover:text-stone-600 transition-colors ml-2"
              title="Sign Out"
            >
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </nav>

      <main className="pt-24 pb-12 max-w-6xl mx-auto px-4">
        {mealieStatus && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className={`mb-6 p-4 rounded-2xl flex items-center justify-between ${mealieStatus.type === 'success' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-red-50 text-red-600 border border-red-100'}`}
          >
            <div className="flex items-center gap-2">
              {mealieStatus.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
              <span className="text-sm font-medium">{mealieStatus.message}</span>
            </div>
            <button onClick={() => setMealieStatus(null)} className="p-1 hover:bg-black/5 rounded-full">
              <X size={16} />
            </button>
          </motion.div>
        )}
        <AnimatePresence mode="wait">
          {activeTab === 'upload' && (
            <motion.div 
              key="upload"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-8"
            >
              {pendingUploads.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed border-stone-200 rounded-3xl bg-white shadow-sm">
                  <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mb-4">
                    <Upload size={32} />
                  </div>
                  <h2 className="text-2xl font-medium mb-2">Start Digitizing</h2>
                  <p className="text-stone-500 mb-8 max-w-md text-center">
                    Upload a single photo of a handwritten recipe or an entire folder of PDFs and images.
                  </p>
                  <div className="flex gap-4">
                    <button 
                      onClick={() => fileInputRef.current?.click()}
                      className="px-6 py-3 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 transition-colors flex items-center gap-2 shadow-lg shadow-emerald-600/20"
                    >
                      <ImageIcon size={18} /> Select Files
                    </button>
                    <button 
                      onClick={() => folderInputRef.current?.click()}
                      className="px-6 py-3 bg-white border border-stone-200 text-stone-700 rounded-xl font-medium hover:bg-stone-50 transition-colors flex items-center gap-2"
                    >
                      <Plus size={18} /> Upload Folder
                    </button>
                  </div>
                  <input type="file" ref={fileInputRef} className="hidden" multiple accept="image/*,application/pdf" onChange={(e) => handleFiles(e.target.files)} />
                  <input type="file" ref={folderInputRef} className="hidden" {...{webkitdirectory: "", directory: ""} as any} onChange={(e) => handleFiles(e.target.files)} />
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Left: Preview & Navigation */}
                  <div className="space-y-4">
                    <div className="bg-white p-4 rounded-3xl border border-stone-200 shadow-sm relative overflow-hidden aspect-[4/3] flex items-center justify-center">
                      {pendingUploads[currentIndex].file.type === 'application/pdf' ? (
                        <div className="flex flex-col items-center text-stone-400">
                          <FileText size={64} />
                          <p className="mt-2 font-medium">{pendingUploads[currentIndex].file.name}</p>
                        </div>
                      ) : (
                        <img 
                          src={pendingUploads[currentIndex].preview} 
                          className="max-h-full max-w-full object-contain rounded-lg" 
                          alt="Recipe preview" 
                        />
                      )}
                      
                      {pendingUploads.length > 1 && (
                        <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 flex justify-between pointer-events-none">
                          <button 
                            onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))}
                            disabled={currentIndex === 0}
                            className="w-10 h-10 bg-white/90 backdrop-blur shadow-md rounded-full flex items-center justify-center text-stone-700 hover:bg-white disabled:opacity-0 transition-all pointer-events-auto"
                          >
                            <ChevronLeft size={20} />
                          </button>
                          <button 
                            onClick={() => setCurrentIndex(prev => Math.min(pendingUploads.length - 1, prev + 1))}
                            disabled={currentIndex === pendingUploads.length - 1}
                            className="w-10 h-10 bg-white/90 backdrop-blur shadow-md rounded-full flex items-center justify-center text-stone-700 hover:bg-white disabled:opacity-0 transition-all pointer-events-auto"
                          >
                            <ChevronRight size={20} />
                          </button>
                        </div>
                      )}
                    </div>
                    
                    <div className="flex items-center justify-between px-2">
                      <span className="text-sm font-medium text-stone-500">
                        Recipe {currentIndex + 1} of {pendingUploads.length}
                      </span>
                      <button 
                        onClick={() => {
                          const newUploads = pendingUploads.filter((_, i) => i !== currentIndex);
                          setPendingUploads(newUploads);
                          if (currentIndex >= newUploads.length) setCurrentIndex(Math.max(0, newUploads.length - 1));
                        }}
                        className="text-sm text-red-500 hover:text-red-600 font-medium flex items-center gap-1"
                      >
                        <X size={14} /> Remove
                      </button>
                    </div>

                    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                      {pendingUploads.map((u, i) => (
                        <button 
                          key={i}
                          onClick={() => setCurrentIndex(i)}
                          className={`flex-shrink-0 w-16 h-16 rounded-xl border-2 transition-all overflow-hidden ${currentIndex === i ? 'border-emerald-500 scale-105' : 'border-transparent opacity-60'}`}
                        >
                          {u.file.type === 'application/pdf' ? (
                            <div className="w-full h-full bg-stone-100 flex items-center justify-center text-stone-400">
                              <FileText size={20} />
                            </div>
                          ) : (
                            <img src={u.preview} className="w-full h-full object-cover" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Right: Editor */}
                  <div className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm min-h-[500px] flex flex-col">
                    {pendingUploads[currentIndex].status === 'pending' && (
                      <div className="flex-1 flex flex-col items-center justify-center text-center">
                        <div className="w-16 h-16 bg-stone-50 text-stone-400 rounded-full flex items-center justify-center mb-4">
                          <Loader2 size={32} className="animate-spin" />
                        </div>
                        <h3 className="text-xl font-medium mb-2">Ready to Process</h3>
                        <p className="text-stone-500 mb-6">Click the button below to extract recipe data using Gemini AI.</p>
                        <button 
                          onClick={() => processRecipe(currentIndex)}
                          className="px-8 py-3 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-600/20"
                        >
                          Extract Recipe
                        </button>
                      </div>
                    )}

                    {pendingUploads[currentIndex].status === 'processing' && (
                      <div className="flex-1 flex flex-col items-center justify-center text-center">
                        <Loader2 size={48} className="animate-spin text-emerald-600 mb-4" />
                        <h3 className="text-xl font-medium mb-2">Gemini is Reading...</h3>
                        <p className="text-stone-500">Transcribing handwriting and organizing ingredients.</p>
                      </div>
                    )}

                    {pendingUploads[currentIndex].status === 'completed' && pendingUploads[currentIndex].data && (
                      <RecipeForm 
                        data={pendingUploads[currentIndex].data!} 
                        user={user}
                        onChange={(newData) => {
                          setPendingUploads(prev => prev.map((u, i) => i === currentIndex ? { ...u, data: newData } : u));
                        }}
                        onSave={() => saveToLibrary(currentIndex)}
                        onMealie={() => submitToMealie(pendingUploads[currentIndex].data!)}
                      />
                    )}

                    {pendingUploads[currentIndex].status === 'error' && (
                      <div className="flex-1 flex flex-col items-center justify-center text-center">
                        <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-4">
                          <X size={32} />
                        </div>
                        <h3 className="text-xl font-medium mb-2">Processing Failed</h3>
                        <p className="text-stone-500 mb-6">{pendingUploads[currentIndex].error || "An unknown error occurred."}</p>
                        <button 
                          onClick={() => processRecipe(currentIndex)}
                          className="px-8 py-3 bg-stone-900 text-white rounded-xl font-medium hover:bg-stone-800 transition-colors"
                        >
                          Try Again
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'library' && (
            <motion.div 
              key="library"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-3xl font-serif font-medium">Your Recipe Library</h2>
                <div className="text-sm text-stone-500">{library.length} recipes saved</div>
              </div>

              {isLoadingLibrary ? (
                <div className="flex justify-center py-20">
                  <Loader2 className="animate-spin text-emerald-600" size={32} />
                </div>
              ) : library.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-3xl border border-stone-200">
                  <BookOpen size={48} className="mx-auto text-stone-200 mb-4" />
                  <p className="text-stone-500">Your library is empty. Start by uploading some recipes!</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {library.map((recipe) => (
                    <div key={recipe.id} className="bg-white rounded-3xl border border-stone-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow group">
                      <div className="aspect-[16/9] bg-stone-100 relative overflow-hidden">
                        {recipe.image_data ? (
                          <img src={recipe.image_data} className="w-full h-full object-cover" alt={recipe.name} />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-stone-300">
                            <ImageIcon size={32} />
                          </div>
                        )}
                        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={() => deleteFromLibrary(recipe.id)}
                            className="p-2 bg-white/90 backdrop-blur text-red-500 rounded-full hover:bg-red-50"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                      <div className="p-6">
                        <h3 className="text-xl font-medium mb-1 line-clamp-1">{recipe.name}</h3>
                        <p className="text-stone-500 text-sm mb-4 line-clamp-2">{recipe.description || "No description provided."}</p>
                        <div className="flex gap-2">
                          <button 
                            onClick={() => {
                              // Load into editor/viewer
                              setPendingUploads([{
                                file: new File([], "saved-recipe"), // dummy file
                                preview: recipe.image_data || "",
                                status: 'completed',
                                data: {
                                  name: recipe.name,
                                  description: recipe.description,
                                  ingredients: recipe.ingredients,
                                  instructions: recipe.instructions
                                }
                              }]);
                              setCurrentIndex(0);
                              setActiveTab('upload');
                            }}
                            className="flex-1 py-2 bg-stone-100 text-stone-700 rounded-xl text-sm font-medium hover:bg-stone-200 transition-colors"
                          >
                            View Details
                          </button>
                          <button 
                            onClick={() => submitToMealie(recipe)}
                            className="p-2 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-100 transition-colors"
                            title="Submit to Mealie"
                          >
                            <ExternalLink size={18} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'settings' && (
            <motion.div 
              key="settings"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="max-w-2xl mx-auto space-y-8"
            >
              <div className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm space-y-8">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-medium mb-2">Mealie Integration</h2>
                    <p className="text-stone-500 text-sm">Configure your Mealie instance to export recipes directly.</p>
                  </div>
                  {(user.role === 'admin' || user.can_edit_mealie === 1) ? (
                    <button 
                      onClick={saveSettings}
                      className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 transition-colors flex items-center gap-2"
                    >
                      <Save size={16} /> Save Settings
                    </button>
                  ) : (
                    <div className="flex items-center gap-1 text-amber-600 text-xs font-medium bg-amber-50 px-3 py-1.5 rounded-lg">
                      <Lock size={14} /> Read Only
                    </div>
                  )}
                </div>

                {settingsError && (
                  <div className="p-4 bg-red-50 border border-red-100 rounded-2xl text-red-600 text-sm flex items-center gap-2">
                    <AlertCircle size={18} />
                    {settingsError}
                  </div>
                )}

                {settingsSuccess && (
                  <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl text-emerald-600 text-sm flex items-center gap-2">
                    <CheckCircle size={18} />
                    {settingsSuccess}
                  </div>
                )}

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-stone-700">Mealie URL</label>
                    <input 
                      type="url" 
                      placeholder="https://mealie.yourdomain.com"
                      value={mealieUrl}
                      onChange={(e) => setMealieUrl(e.target.value)}
                      disabled={user.role !== 'admin' && user.can_edit_mealie === 0}
                      className="w-full px-4 py-3 rounded-xl border border-stone-200 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all disabled:bg-stone-50 disabled:text-stone-400"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-stone-700">API Token</label>
                    <input 
                      type="password" 
                      placeholder="Your Mealie API Token"
                      value={mealieToken}
                      onChange={(e) => setMealieToken(e.target.value)}
                      disabled={user.role !== 'admin' && user.can_edit_mealie === 0}
                      className="w-full px-4 py-3 rounded-xl border border-stone-200 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all disabled:bg-stone-50 disabled:text-stone-400"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm space-y-8">
                <div>
                  <h2 className="text-2xl font-medium mb-2">Account Security</h2>
                  <p className="text-stone-500 text-sm">Update your account password. Ensure it meets the complexity requirements.</p>
                </div>
                <form onSubmit={handlePasswordChange} className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-stone-700">New Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
                      <input 
                        type="password" 
                        required
                        value={newPasswordValue}
                        onChange={(e) => setNewPasswordValue(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 rounded-xl border border-stone-200 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
                        placeholder="New Password"
                      />
                    </div>
                    {passwordReqs && (
                      <div className="text-[10px] text-stone-400 space-y-0.5 px-1">
                        <p>• Minimum {passwordReqs.passwordMinLength} characters</p>
                        {passwordReqs.passwordRequireNumber === "1" && <p>• At least one number</p>}
                        {passwordReqs.passwordRequireSpecial === "1" && <p>• At least one special character</p>}
                      </div>
                    )}
                  </div>
                  {passwordChangeError && <p className="text-red-500 text-sm">{passwordChangeError}</p>}
                  {passwordChangeSuccess && <p className="text-emerald-600 text-sm font-medium">{passwordChangeSuccess}</p>}
                  <button 
                    type="submit"
                    className="px-6 py-3 bg-stone-900 text-white rounded-xl font-medium hover:bg-stone-800 transition-colors shadow-lg"
                  >
                    Update Password
                  </button>
                </form>
              </div>

              {user.role === 'admin' && (
                <div className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm space-y-8">
                  <div>
                    <h2 className="text-2xl font-medium mb-2">Security Settings</h2>
                    <p className="text-stone-500 text-sm">Configure password complexity requirements for all users.</p>
                  </div>

                  <div className="space-y-6">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-stone-700">Minimum Password Length (Min 10)</label>
                      <input 
                        type="number" 
                        min={10}
                        value={passwordMinLength}
                        onChange={(e) => setPasswordMinLength(Math.max(10, parseInt(e.target.value) || 10))}
                        className="w-full px-4 py-3 rounded-xl border border-stone-200 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
                      />
                    </div>
                    
                    <div className="flex items-center justify-between p-4 bg-stone-50 rounded-2xl">
                      <div>
                        <p className="font-medium text-stone-800">Require Special Character</p>
                        <p className="text-xs text-stone-500">Must contain at least one: !@#$%^&*(),.?":{}|&lt;&gt;</p>
                      </div>
                      <input 
                        type="checkbox" 
                        checked={passwordRequireSpecial}
                        onChange={(e) => setPasswordRequireSpecial(e.target.checked)}
                        className="w-5 h-5 accent-emerald-600"
                      />
                    </div>

                    <div className="flex items-center justify-between p-4 bg-stone-50 rounded-2xl">
                      <div>
                        <p className="font-medium text-stone-800">Require Number</p>
                        <p className="text-xs text-stone-500">Must contain at least one digit (0-9)</p>
                      </div>
                      <input 
                        type="checkbox" 
                        checked={passwordRequireNumber}
                        onChange={(e) => setPasswordRequireNumber(e.target.checked)}
                        className="w-5 h-5 accent-emerald-600"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl text-amber-800 text-sm">
                <p className="font-medium mb-1">Security Note</p>
                <p>Ensure you use HTTPS for your Mealie instance to protect data in transit. Password complexity changes apply to all new passwords set after saving.</p>
              </div>
            </motion.div>
          )}

          {activeTab === 'admin' && user.role === 'admin' && (
            <motion.div 
              key="admin"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <AdminPanel passwordReqs={passwordReqs} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

function NavButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={`px-4 py-2 rounded-xl flex items-center gap-2 font-medium transition-all ${active ? 'bg-emerald-50 text-emerald-700' : 'text-stone-500 hover:bg-stone-50'}`}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function RecipeForm({ data, user, onChange, onSave, onMealie }: { data: RecipeData, user: UserProfile | null, onChange: (d: RecipeData) => void, onSave: () => void, onMealie: () => void }) {
  return (
    <div className="flex-1 flex flex-col space-y-6 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-stone-200">
      <div className="space-y-2">
        <label className="text-xs font-bold uppercase tracking-wider text-stone-400">Recipe Name</label>
        <input 
          type="text" 
          value={data.name}
          onChange={(e) => onChange({ ...data, name: e.target.value })}
          className="w-full text-2xl font-serif font-medium border-b border-stone-100 focus:border-emerald-500 outline-none pb-1 transition-colors"
        />
      </div>

      <div className="space-y-2">
        <label className="text-xs font-bold uppercase tracking-wider text-stone-400">Description</label>
        <textarea 
          value={data.description}
          onChange={(e) => onChange({ ...data, description: e.target.value })}
          className="w-full text-stone-600 resize-none outline-none min-h-[60px]"
          placeholder="Add a description or notes..."
        />
      </div>

      <div className="space-y-4">
        <label className="text-xs font-bold uppercase tracking-wider text-stone-400">Ingredients</label>
        <div className="space-y-2">
          {data.ingredients.map((ing, i) => (
            <div key={i} className="flex gap-2 group">
              <input 
                type="text" 
                value={ing}
                onChange={(e) => {
                  const newIngs = [...data.ingredients];
                  newIngs[i] = e.target.value;
                  onChange({ ...data, ingredients: newIngs });
                }}
                className="flex-1 px-3 py-2 bg-stone-50 rounded-lg text-sm outline-none focus:ring-1 focus:ring-emerald-500"
              />
              <button 
                onClick={() => {
                  const newIngs = data.ingredients.filter((_, idx) => idx !== i);
                  onChange({ ...data, ingredients: newIngs });
                }}
                className="p-2 text-stone-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <button 
            onClick={() => onChange({ ...data, ingredients: [...data.ingredients, ""] })}
            className="text-sm text-emerald-600 font-medium flex items-center gap-1 hover:text-emerald-700"
          >
            <Plus size={14} /> Add Ingredient
          </button>
        </div>
      </div>

      <div className="space-y-4">
        <label className="text-xs font-bold uppercase tracking-wider text-stone-400">Instructions</label>
        <div className="space-y-3">
          {data.instructions.map((inst, i) => (
            <div key={i} className="flex gap-3 group">
              <span className="flex-shrink-0 w-6 h-6 bg-stone-100 text-stone-500 rounded-full flex items-center justify-center text-xs font-bold">{i + 1}</span>
              <textarea 
                value={inst}
                onChange={(e) => {
                  const newInsts = [...data.instructions];
                  newInsts[i] = e.target.value;
                  onChange({ ...data, instructions: newInsts });
                }}
                className="flex-1 text-sm text-stone-700 outline-none resize-none min-h-[40px]"
              />
              <button 
                onClick={() => {
                  const newInsts = data.instructions.filter((_, idx) => idx !== i);
                  onChange({ ...data, instructions: newInsts });
                }}
                className="p-2 text-stone-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <button 
            onClick={() => onChange({ ...data, instructions: [...data.instructions, ""] })}
            className="text-sm text-emerald-600 font-medium flex items-center gap-1 hover:text-emerald-700"
          >
            <Plus size={14} /> Add Step
          </button>
        </div>
      </div>

      <div className="pt-8 mt-auto flex gap-3">
        <button 
          onClick={onSave}
          disabled={user?.role === 'readonly'}
          className="flex-1 py-3 bg-stone-900 text-white rounded-xl font-medium hover:bg-stone-800 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Save size={18} /> Save to Library
        </button>
        <button 
          onClick={onMealie}
          className="px-6 py-3 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20"
        >
          <ExternalLink size={18} /> Mealie
        </button>
      </div>
    </div>
  );
}

function AdminPanel({ passwordReqs }: { passwordReqs: any }) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [adminSuccess, setAdminSuccess] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'user' | 'readonly'>('user');
  const [newCanEditMealie, setNewCanEditMealie] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editUsername, setEditUsername] = useState('');
  const [editRole, setEditRole] = useState<'admin' | 'user' | 'readonly'>('user');
  const [editCanEditMealie, setEditCanEditMealie] = useState(false);
  const [editRequirePasswordChange, setEditRequirePasswordChange] = useState(false);
  const [editPassword, setEditPassword] = useState('');

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/admin/users', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setUsers(data);
        } else {
          console.error("Users data is not an array", data);
          setUsers([]);
        }
      } else {
        if (res.status === 401) {
          window.location.reload(); // Force full app refresh on auth loss
          return;
        }
        console.error("Failed to fetch users", res.status);
        setUsers([]);
      }
    } catch (err) {
      console.error("Error fetching users", err);
      setUsers([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddUser = async (e: FormEvent) => {
    e.preventDefault();
    setAdminError(null);
    setAdminSuccess(null);
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        username: newUsername, 
        password: newPassword, 
        role: newRole, 
        can_edit_mealie: newCanEditMealie 
      }),
      credentials: 'include'
    });
    if (res.ok) {
      fetchUsers();
      setIsAdding(false);
      setNewUsername('');
      setNewPassword('');
      setAdminSuccess("User created successfully");
    } else {
      const data = await res.json();
      setAdminError(data.error);
    }
  };

  const handleDeleteUser = async (id: string) => {
    if (!confirm("Delete this user?")) return;
    setAdminError(null);
    setAdminSuccess(null);
    const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE', credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      if (data.loggedOut) {
        window.location.reload();
      } else {
        fetchUsers();
        setAdminSuccess("User deleted successfully");
      }
    } else {
      const data = await res.json();
      setAdminError(data.error || "Delete failed");
    }
  };

  const startEditing = (user: UserProfile) => {
    setEditingUserId(user.id);
    setEditUsername(user.username);
    setEditRole(user.role);
    setEditCanEditMealie(user.can_edit_mealie === 1);
    setEditRequirePasswordChange(user.require_password_change === 1);
    setEditPassword('');
  };

  const handleUpdateUser = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingUserId) return;
    setAdminError(null);
    setAdminSuccess(null);

    const res = await fetch(`/api/admin/users/${editingUserId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        username: editUsername, 
        role: editRole, 
        can_edit_mealie: editCanEditMealie ? 1 : 0,
        require_password_change: editRequirePasswordChange ? 1 : 0,
        password: editPassword || undefined
      }),
      credentials: 'include'
    });

    if (res.ok) {
      setEditingUserId(null);
      fetchUsers();
      setAdminSuccess("User updated successfully");
    } else {
      const data = await res.json();
      setAdminError(data.error || "Update failed");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-serif font-medium">User Administration</h2>
        <button 
          onClick={() => {
            setIsAdding(true);
            setAdminError(null);
          }}
          className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 transition-colors flex items-center gap-2"
        >
          <Plus size={16} /> Add User
        </button>
      </div>

      {adminError && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 bg-red-50 border border-red-100 rounded-2xl text-red-600 text-sm flex items-center gap-2"
        >
          <AlertCircle size={18} />
          {adminError}
        </motion.div>
      )}

      {adminSuccess && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl text-emerald-600 text-sm flex items-center gap-2"
        >
          <CheckCircle size={18} />
          {adminSuccess}
        </motion.div>
      )}

      {isAdding && (
        <motion.div 
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm"
        >
          <form onSubmit={handleAddUser} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
            <div className="space-y-1">
              <label className="text-xs font-bold text-stone-400 uppercase">Username</label>
              <input 
                type="text" 
                required
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-stone-200 text-sm"
              />
            </div>
            <div className="space-y-1 relative">
              <label className="text-xs font-bold text-stone-400 uppercase">Password</label>
              <input 
                type="password" 
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-stone-200 text-sm"
              />
              {passwordReqs && (
                <div className="absolute top-full left-0 z-10 bg-white p-2 rounded-lg border border-stone-200 shadow-lg text-[9px] text-stone-400 space-y-0 leading-tight mt-1 min-w-[120px]">
                  <p>• Min {passwordReqs.passwordMinLength} chars</p>
                  {passwordReqs.passwordRequireNumber === "1" && <p>• One number</p>}
                  {passwordReqs.passwordRequireSpecial === "1" && <p>• One special char</p>}
                </div>
              )}
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-stone-400 uppercase">Role</label>
              <select 
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as any)}
                className="w-full px-3 py-2 rounded-lg border border-stone-200 text-sm"
              >
                <option value="user">User</option>
                <option value="admin">Admin</option>
                <option value="readonly">Read Only</option>
              </select>
            </div>
            <div className="flex items-center gap-2 h-10">
              <input 
                type="checkbox" 
                id="can_edit"
                checked={newCanEditMealie}
                onChange={(e) => setNewCanEditMealie(e.target.checked)}
              />
              <label htmlFor="can_edit" className="text-sm text-stone-600">Can Edit Mealie</label>
            </div>
            <div className="flex gap-2">
              <button type="submit" className="flex-1 py-2 bg-stone-900 text-white rounded-lg text-sm font-medium">Create</button>
              <button type="button" onClick={() => setIsAdding(false)} className="px-3 py-2 bg-stone-100 text-stone-600 rounded-lg text-sm">Cancel</button>
            </div>
          </form>
        </motion.div>
      )}

      <div className="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden overflow-x-auto">
        <table className="w-full text-left min-w-[800px]">
          <thead>
            <tr className="bg-stone-50 border-b border-stone-200">
              <th className="px-6 py-4 text-xs font-bold text-stone-400 uppercase">User</th>
              <th className="px-6 py-4 text-xs font-bold text-stone-400 uppercase">Role</th>
              <th className="px-6 py-4 text-xs font-bold text-stone-400 uppercase">Mealie Access</th>
              <th className="px-6 py-4 text-xs font-bold text-stone-400 uppercase">Password Change</th>
              <th className="px-6 py-4 text-xs font-bold text-stone-400 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-stone-50/50 transition-colors">
                <td className="px-6 py-4">
                  {editingUserId === u.id ? (
                    <input 
                      type="text"
                      value={editUsername}
                      onChange={(e) => setEditUsername(e.target.value)}
                      className="px-2 py-1 border border-stone-200 rounded text-sm w-32"
                    />
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-stone-100 rounded-full flex items-center justify-center text-stone-500">
                        <User size={16} />
                      </div>
                      <span className="font-medium">{u.username}</span>
                    </div>
                  )}
                </td>
                <td className="px-6 py-4">
                  {editingUserId === u.id ? (
                    <select 
                      value={editRole}
                      onChange={(e) => setEditRole(e.target.value as any)}
                      className="px-2 py-1 border border-stone-200 rounded text-sm"
                    >
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                      <option value="readonly">Read Only</option>
                    </select>
                  ) : (
                    <span className="text-sm font-medium capitalize">{u.role}</span>
                  )}
                </td>
                <td className="px-6 py-4">
                  {editingUserId === u.id ? (
                    <input 
                      type="checkbox"
                      checked={editCanEditMealie}
                      onChange={(e) => setEditCanEditMealie(e.target.checked)}
                    />
                  ) : (
                    <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${u.can_edit_mealie === 1 ? 'bg-emerald-50 text-emerald-600' : 'bg-stone-100 text-stone-400'}`}>
                      {u.can_edit_mealie === 1 ? <Shield size={12} /> : <Eye size={12} />}
                      {u.can_edit_mealie === 1 ? 'CAN EDIT' : 'READ ONLY'}
                    </div>
                  )}
                </td>
                <td className="px-6 py-4">
                  {editingUserId === u.id ? (
                    <input 
                      type="checkbox"
                      checked={editRequirePasswordChange}
                      onChange={(e) => setEditRequirePasswordChange(e.target.checked)}
                    />
                  ) : (
                    <span className={`text-xs font-medium ${u.require_password_change === 1 ? 'text-amber-600' : 'text-stone-400'}`}>
                      {u.require_password_change === 1 ? 'Required' : 'No'}
                    </span>
                  )}
                </td>
                <td className="px-6 py-4">
                  {editingUserId === u.id ? (
                    <div className="flex items-center gap-2 relative">
                      <input 
                        type="password"
                        placeholder="New Password"
                        value={editPassword}
                        onChange={(e) => setEditPassword(e.target.value)}
                        className="px-2 py-1 border border-stone-200 rounded text-sm w-32"
                      />
                      {passwordReqs && editPassword && (
                        <div className="absolute bottom-full left-0 z-20 bg-white p-2 rounded-lg border border-stone-200 shadow-lg text-[9px] text-stone-400 space-y-0 leading-tight mb-2 min-w-[120px]">
                          <p>• Min {passwordReqs.passwordMinLength} chars</p>
                          {passwordReqs.passwordRequireNumber === "1" && <p>• One number</p>}
                          {passwordReqs.passwordRequireSpecial === "1" && <p>• One special char</p>}
                        </div>
                      )}
                      <button onClick={handleUpdateUser} className="text-emerald-600 hover:text-emerald-700 font-medium text-sm">Save</button>
                      <button onClick={() => setEditingUserId(null)} className="text-stone-400 hover:text-stone-600 font-medium text-sm">Cancel</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => startEditing(u)}
                        className="p-2 text-stone-300 hover:text-emerald-600 transition-colors"
                        title="Edit User"
                      >
                        <Settings size={18} />
                      </button>
                      <button 
                        onClick={() => handleDeleteUser(u.id)}
                        className="p-2 text-stone-300 hover:text-red-500 transition-colors"
                        title="Delete User"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
