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
  AlertCircle,
  Search,
  Tag,
  Download,
  History,
  Filter,
  Calendar,
  ShoppingCart,
  LayoutDashboard,
  Activity,
  Clock,
  Sun,
  Moon,
  Printer,
  Layers,
  FolderHeart,
  Zap,
  Share2,
  Scale,
  Globe,
  Timer
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { extractRecipeFromImage, RecipeData } from "./services/gemini";

const randomUUID = () => crypto.randomUUID();

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
  tags_json?: string;
  collection_id?: string;
  nutrition_info?: string; // JSON string
  additional_images?: { image_data: string, mime_type: string }[];
  public_token?: string;
  created_at: string;
}

interface Collection {
  id: string;
  name: string;
  description: string;
}

interface MealPlanEntry {
  id: string;
  recipe_id: string;
  recipe_name: string;
  date: string;
  meal_type: string;
}

interface PendingUpload {
  id: string;
  files: { file: File, preview: string }[];
  status: 'pending' | 'processing' | 'completed' | 'error';
  data?: RecipeData;
  error?: string;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'upload' | 'library' | 'settings' | 'admin' | 'audit' | 'meal-plan' | 'shopping-list' | 'collections'>('dashboard');
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [library, setLibrary] = useState<SavedRecipe[]>([]);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [mealPlans, setMealPlans] = useState<MealPlanEntry[]>([]);
  const [shoppingList, setShoppingList] = useState<string[]>([]);
  const [isGeneratingList, setIsGeneratingList] = useState(false);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const [printRecipe, setPrintRecipe] = useState<SavedRecipe | null>(null);
  const [viewRecipe, setViewRecipe] = useState<SavedRecipe | null>(null);
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
  const [deletingRecipeId, setDeletingRecipeId] = useState<string | null>(null);
  
  // New Features State
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') === 'dark' || 
        (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
    return false;
  });
  const [unitSystem, setUnitSystem] = useState<'metric' | 'imperial'>('metric');
  const [publicRecipe, setPublicRecipe] = useState<SavedRecipe | null>(null);
  const [activeTimer, setActiveTimer] = useState<{ id: string, seconds: number, label: string } | null>(null);

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
      fetchCollections();
      fetchMealPlans();
    }
    fetchPasswordRequirements();
  }, [user]);

  const fetchCollections = async () => {
    try {
      const res = await fetch('/api/collections', { credentials: 'include' });
      if (res.ok) setCollections(await res.json());
    } catch (err) { console.error("Failed to fetch collections", err); }
  };

  const fetchMealPlans = async () => {
    try {
      const res = await fetch('/api/meal-plan', { credentials: 'include' });
      if (res.ok) setMealPlans(await res.json());
    } catch (err) { console.error("Failed to fetch meal plans", err); }
  };

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

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('share');
    if (token) {
      fetchPublicRecipe(token);
    }
  }, []);

  const fetchPublicRecipe = async (token: string) => {
    try {
      const res = await fetch(`/api/public/recipe/${token}`);
      if (res.ok) {
        const data = await res.json();
        setPublicRecipe({
          ...data,
          ingredients: JSON.parse(data.ingredients),
          instructions: JSON.parse(data.instructions),
          tags: JSON.parse(data.tags || '[]')
        });
      }
    } catch (err) { console.error("Failed to fetch public recipe", err); }
  };

  const scaleIngredient = (ingredient: string, currentServings: number, targetServings: number) => {
    if (!currentServings || !targetServings || currentServings === targetServings) return ingredient;
    const ratio = targetServings / currentServings;
    
    // Simple regex to find numbers at the start or within the string
    return ingredient.replace(/(\d+(\.\d+)?)/g, (match) => {
      const num = parseFloat(match);
      if (isNaN(num)) return match;
      const scaled = num * ratio;
      return scaled % 1 === 0 ? scaled.toString() : scaled.toFixed(2);
    });
  };

  const convertUnits = (ingredient: string, to: 'metric' | 'imperial') => {
    // Basic conversion map
    const conversions: any = {
      metric: {
        'oz': { factor: 28.35, unit: 'g' },
        'lb': { factor: 453.59, unit: 'g' },
        'cup': { factor: 236.58, unit: 'ml' },
        'tsp': { factor: 4.92, unit: 'ml' },
        'tbsp': { factor: 14.78, unit: 'ml' },
        'quart': { factor: 946.35, unit: 'ml' },
        'gallon': { factor: 3.78, unit: 'l' },
      },
      imperial: {
        'g': { factor: 0.035, unit: 'oz' },
        'kg': { factor: 2.204, unit: 'lb' },
        'ml': { factor: 0.033, unit: 'oz' },
        'l': { factor: 0.264, unit: 'gallon' },
      }
    };

    let result = ingredient;
    const currentConversions = conversions[to];
    
    Object.keys(currentConversions).forEach(unit => {
      const regex = new RegExp(`(\\d+(\\.\\d+)?)\\s*(${unit}s?)\\b`, 'gi');
      result = result.replace(regex, (match, val) => {
        const num = parseFloat(val);
        const conv = currentConversions[unit];
        const converted = (num * conv.factor).toFixed(1);
        return `${converted} ${conv.unit}`;
      });
    });

    return result;
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
      const url = new URL('/api/recipes', window.location.origin);
      if (searchQuery) url.searchParams.append('search', searchQuery);
      if (selectedTag) url.searchParams.append('tag', selectedTag);
      if (selectedCollectionId) url.searchParams.append('collection_id', selectedCollectionId);

      const res = await fetch(url.toString(), { credentials: 'include' });
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
        const mapped = data.map((r: any) => ({
          ...r,
          ingredients: typeof r.ingredients === 'string' ? JSON.parse(r.ingredients) : (r.ingredients || []),
          instructions: typeof r.instructions === 'string' ? JSON.parse(r.instructions) : (r.instructions || []),
          tags: typeof r.tags === 'string' ? JSON.parse(r.tags) : (r.tags || [])
        }));
        setLibrary(mapped);

        // Extract all unique tags
        const tagsSet = new Set<string>();
        mapped.forEach((r: SavedRecipe) => {
          (r.tags || []).forEach((t: string) => tagsSet.add(t));
        });
        setAvailableTags(Array.from(tagsSet));
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

  useEffect(() => {
    if (user && user.require_password_change !== 1) {
      const timer = setTimeout(() => {
        fetchLibrary();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [searchQuery, selectedTag, selectedCollectionId]);

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
        id: randomUUID(),
        files: [{
          file,
          preview: URL.createObjectURL(file)
        }],
        status: 'pending'
      }));

    setPendingUploads(prev => [...prev, ...newUploads]);
    setActiveTab('upload');
  };

  const addPageToUpload = (index: number, files: FileList | null) => {
    if (!files) return;
    const newFiles = Array.from(files).map(file => ({
      file,
      preview: URL.createObjectURL(file)
    }));
    setPendingUploads(prev => prev.map((u, i) => i === index ? {
      ...u,
      files: [...u.files, ...newFiles]
    } : u));
  };

  const processRecipe = async (index: number) => {
    const upload = pendingUploads[index];
    if (!upload || upload.status === 'processing') return;

    setPendingUploads(prev => prev.map((u, i) => i === index ? { ...u, status: 'processing' } : u));

    try {
      const images = await Promise.all(upload.files.map(async (f) => {
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve) => {
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(f.file);
        });
        const base64 = await base64Promise;
        return { base64Data: base64, mimeType: f.file.type };
      }));
      
      const data = await extractRecipeFromImage(images);
      
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

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const saveToLibrary = async (index: number) => {
    const upload = pendingUploads[index];
    if (!upload.data) return;

    try {
      const images = await Promise.all(upload.files.map(async (f) => {
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve) => {
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(f.file);
        });
        const base64 = await base64Promise;
        return { image_data: base64, mime_type: f.file.type };
      }));

      const res = await fetch('/api/recipes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...upload.data,
          image_data: images[0].image_data,
          mime_type: images[0].mime_type,
          additional_images: images.slice(1),
          collection_id: selectedCollectionId
        }),
        credentials: 'include'
      });

      if (res.ok) {
        showToast("Recipe saved to library!");
        fetchLibrary();
        setPendingUploads(prev => prev.filter((_, i) => i !== index));
        if (currentIndex >= pendingUploads.length - 1) {
          setCurrentIndex(Math.max(0, pendingUploads.length - 2));
        }
      } else {
        const data = await res.json();
        showToast(data.error || "Failed to save recipe", 'error');
      }
    } catch (err) {
      console.error("Save failed", err);
      showToast("An error occurred while saving.", 'error');
    }
  };

  const deleteFromLibrary = async (id: string) => {
    console.log(`[DEBUG] Attempting to delete recipe with ID: ${id}`);
    try {
      const res = await fetch(`/api/recipes/${id}`, { method: 'DELETE', credentials: 'include' });
      console.log(`[DEBUG] Delete response status: ${res.status}`);
      if (res.ok) {
        showToast("Recipe deleted successfully");
        fetchLibrary();
      } else {
        const data = await res.json();
        console.error("[DEBUG] Delete failed:", data);
        showToast(data.error || "Delete failed", 'error');
      }
    } catch (err) {
      console.error("[DEBUG] Delete error:", err);
      showToast("An error occurred while deleting.", 'error');
    } finally {
      setDeletingRecipeId(null);
    }
  };

  const analyzeNutrition = async (id: string) => {
    try {
      const recipe = library.find(r => r.id === id);
      if (!recipe) return;

      const { analyzeNutrition: analyze } = await import('./services/gemini');
      const nutrition = await analyze({
        name: recipe.name,
        ingredients: recipe.ingredients,
        instructions: recipe.instructions
      });

      const res = await fetch(`/api/recipes/${id}/nutrition`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nutrition)
      });
      if (res.ok) fetchLibrary();
    } catch (err: any) { 
      console.error("Nutrition analysis failed:", err);
      alert(err.message || "Failed to analyze nutrition");
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

  if (publicRecipe) {
    return <PublicRecipeView recipe={publicRecipe} onClose={() => setPublicRecipe(null)} />;
  }

  if (isAuthenticating) {
    return (
      <div className="min-h-screen bg-[#FDFCFB] flex items-center justify-center">
        <Loader2 className="animate-spin text-emerald-600" size={48} />
      </div>
    );
  }

  if (showPasswordChange) {
    return (
      <div className="min-h-screen bg-[#FDFCFB] dark:bg-stone-950 flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white dark:bg-stone-900 p-8 rounded-3xl border border-stone-200 dark:border-stone-800 shadow-xl max-w-md w-full"
        >
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-amber-500 rounded-2xl flex items-center justify-center text-white mb-4">
              <Lock size={32} />
            </div>
            <h1 className="text-2xl font-serif font-medium dark:text-white">Password Change Required</h1>
            <p className="text-stone-500 dark:text-stone-400 text-sm mt-1 text-center">For security reasons, you must change your password before continuing.</p>
          </div>

          <form onSubmit={handlePasswordChange} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-stone-700 dark:text-stone-300">New Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
                <input 
                  type="password" 
                  required
                  value={newPasswordValue}
                  onChange={(e) => setNewPasswordValue(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-stone-200 dark:border-stone-700 dark:bg-stone-800 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
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
              className="w-full py-3 bg-stone-900 dark:bg-emerald-600 text-white rounded-xl font-medium hover:bg-stone-800 dark:hover:bg-emerald-700 transition-colors shadow-lg"
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
      <div className="min-h-screen bg-[#FDFCFB] dark:bg-stone-950 flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-stone-900 p-8 rounded-3xl border border-stone-200 dark:border-stone-800 shadow-xl max-w-md w-full"
        >
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-emerald-600 rounded-2xl flex items-center justify-center text-white font-bold text-3xl mb-4">R</div>
            <h1 className="text-2xl font-serif font-medium dark:text-white">RecipeDigitizer</h1>
            <p className="text-stone-500 dark:text-stone-400 text-sm mt-1">Sign in to manage your recipes</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-stone-700 dark:text-stone-300">Username</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
                <input 
                  type="text" 
                  required
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-stone-200 dark:border-stone-700 dark:bg-stone-800 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
                  placeholder="admin"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-stone-700 dark:text-stone-300">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
                <input 
                  type="password" 
                  required
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-stone-200 dark:border-stone-700 dark:bg-stone-800 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
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
          <div className="mt-8 pt-6 border-t border-stone-100 dark:border-stone-800 text-center">
            <p className="text-xs text-stone-400">Default credentials: admin / Admin@12345</p>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FDFCFB] dark:bg-stone-950 text-stone-900 dark:text-stone-100 font-sans transition-colors">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 bg-white/80 dark:bg-stone-900/80 backdrop-blur-md border-b border-stone-200 dark:border-stone-800 z-50">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center text-white font-bold">R</div>
            <h1 className="text-xl font-semibold tracking-tight dark:text-white">RecipeDigitizer</h1>
          </div>
          <div className="flex gap-1 overflow-x-auto no-scrollbar items-center">
            <NavButton active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} icon={<LayoutDashboard size={18} />} label="Dashboard" />
            <NavButton active={activeTab === 'upload'} onClick={() => setActiveTab('upload')} icon={<Upload size={18} />} label="Upload" />
            <NavButton active={activeTab === 'library'} onClick={() => setActiveTab('library')} icon={<BookOpen size={18} />} label="Library" />
            <NavButton active={activeTab === 'collections'} onClick={() => setActiveTab('collections')} icon={<FolderHeart size={18} />} label="Collections" />
            <NavButton active={activeTab === 'meal-plan'} onClick={() => setActiveTab('meal-plan')} icon={<Calendar size={18} />} label="Plan" />
            <NavButton active={activeTab === 'shopping-list'} onClick={() => setActiveTab('shopping-list')} icon={<ShoppingCart size={18} />} label="Shop" />
            <NavButton active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} icon={<Settings size={18} />} label="Settings" />
            {user.role === 'admin' && (
              <>
                <NavButton active={activeTab === 'admin'} onClick={() => setActiveTab('admin')} icon={<Users size={18} />} label="Admin" />
                <NavButton active={activeTab === 'audit'} onClick={() => setActiveTab('audit')} icon={<History size={18} />} label="Logs" />
              </>
            )}
            
            <div className="h-6 w-px bg-stone-200 dark:bg-stone-800 mx-2" />
            
            <button 
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="p-2 text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 transition-colors"
              title={isDarkMode ? "Light Mode" : "Dark Mode"}
            >
              {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>

            <button 
              onClick={handleLogout}
              className="p-2 text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 transition-colors flex-shrink-0"
              title="Sign Out"
            >
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </nav>

      {isPrinting && printRecipe && (
        <PrintView recipe={printRecipe} onClose={() => setIsPrinting(false)} />
      )}

      {viewRecipe && (
        <RecipeViewer 
          recipe={viewRecipe} 
          onClose={() => setViewRecipe(null)} 
          scaleIngredient={scaleIngredient}
          convertUnits={convertUnits}
          unitSystem={unitSystem}
          setUnitSystem={setUnitSystem}
          setActiveTimer={setActiveTimer}
        />
      )}

      {activeTimer && (
        <TimerWidget timer={activeTimer} onCancel={() => setActiveTimer(null)} />
      )}

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
          {activeTab === 'dashboard' && (
            <Dashboard 
              library={library} 
              mealPlans={mealPlans} 
              onNavigate={setActiveTab} 
            />
          )}

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
                  <div className="flex flex-wrap justify-center gap-4">
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
                    <button 
                      onClick={() => {
                        const input = document.createElement('input');
                        input.type = 'file';
                        input.accept = '.json';
                        input.onchange = async (e: any) => {
                          const file = e.target.files[0];
                          if (!file) return;
                          const reader = new FileReader();
                          reader.onload = async (re) => {
                            try {
                              const json = JSON.parse(re.target?.result as string);
                              const recipeData: RecipeData = {
                                name: json.name || "Imported Recipe",
                                description: json.description || "",
                                ingredients: (json.recipeIngredient || []).map((i: any) => typeof i === 'string' ? i : i.note || i.text),
                                instructions: (json.recipeInstructions || []).map((i: any) => typeof i === 'string' ? i : i.text),
                                tags: json.tags || [],
                                servings: json.recipeYield || 1
                              };
                              setPendingUploads([{
                                id: randomUUID(),
                                files: [],
                                status: 'completed',
                                data: recipeData
                              }]);
                              setCurrentIndex(0);
                            } catch (err) {
                              showToast("Failed to parse Mealie JSON", "error");
                            }
                          };
                          reader.readAsText(file);
                        };
                        input.click();
                      }}
                      className="px-6 py-3 bg-stone-100 text-stone-700 rounded-xl font-medium hover:bg-stone-200 transition-colors flex items-center gap-2"
                    >
                      <Download size={18} /> Import Mealie
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
                      {pendingUploads[currentIndex].files[0].file.type === 'application/pdf' ? (
                        <div className="flex flex-col items-center text-stone-400">
                          <FileText size={64} />
                          <p className="mt-2 font-medium">{pendingUploads[currentIndex].files[0].file.name}</p>
                        </div>
                      ) : (
                        <div className="relative w-full h-full">
                          <img 
                            src={pendingUploads[currentIndex].files[0].preview} 
                            className="max-h-full max-w-full object-contain rounded-lg mx-auto" 
                            alt="Recipe preview" 
                          />
                          {pendingUploads[currentIndex].files.length > 1 && (
                            <div className="absolute bottom-4 right-4 bg-emerald-600 text-white px-3 py-1 rounded-full text-xs font-bold shadow-lg flex items-center gap-1">
                              <Layers size={12} /> {pendingUploads[currentIndex].files.length} PAGES
                            </div>
                          )}
                        </div>
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
                      <div className="flex items-center gap-4">
                        <span className="text-sm font-medium text-stone-500">
                          Recipe {currentIndex + 1} of {pendingUploads.length}
                        </span>
                        <button 
                          onClick={() => {
                            const input = document.createElement('input');
                            input.type = 'file';
                            input.multiple = true;
                            input.accept = 'image/*,application/pdf';
                            input.onchange = (e) => addPageToUpload(currentIndex, (e.target as HTMLInputElement).files);
                            input.click();
                          }}
                          className="text-xs bg-stone-100 text-stone-600 px-3 py-1.5 rounded-lg hover:bg-stone-200 transition-colors flex items-center gap-1.5 font-bold uppercase tracking-wider"
                        >
                          <Plus size={14} /> Add Page
                        </button>
                      </div>
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
                          className={`flex-shrink-0 w-16 h-16 rounded-xl border-2 transition-all overflow-hidden relative ${currentIndex === i ? 'border-emerald-500 scale-105' : 'border-transparent opacity-60'}`}
                        >
                          {u.files[0].file.type === 'application/pdf' ? (
                            <div className="w-full h-full bg-stone-100 flex items-center justify-center text-stone-400">
                              <FileText size={20} />
                            </div>
                          ) : (
                            <img src={u.files[0].preview} className="w-full h-full object-cover" />
                          )}
                          {u.files.length > 1 && (
                            <div className="absolute top-0 right-0 bg-emerald-600 text-white w-5 h-5 flex items-center justify-center text-[10px] font-bold">
                              {u.files.length}
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Right: Editor */}
                  <div className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm min-h-[500px] flex flex-col">
                    <div className="mb-6">
                      <label className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-2 block">Save to Collection</label>
                      <select 
                        value={selectedCollectionId || ''} 
                        onChange={(e) => setSelectedCollectionId(e.target.value || null)}
                        className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                      >
                        <option value="">No Collection (General Library)</option>
                        {collections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>

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
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <h2 className="text-3xl font-serif font-medium">Your Recipe Library</h2>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={16} />
                    <input 
                      type="text"
                      placeholder="Search recipes..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10 pr-4 py-2 bg-white border border-stone-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none w-full md:w-64"
                    />
                  </div>
                  <div className="text-sm text-stone-500">{library.length} recipes found</div>
                </div>
              </div>

              {availableTags.length > 0 && (
                <div className="flex flex-wrap gap-2 items-center">
                  <Filter size={14} className="text-stone-400 mr-1" />
                  <button 
                    onClick={() => setSelectedTag(null)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${!selectedTag ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'}`}
                  >
                    All
                  </button>
                  {availableTags.map((tag, i) => (
                    <button 
                      key={`${tag}-${i}`}
                      onClick={() => setSelectedTag(tag === selectedTag ? null : tag)}
                      className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${tag === selectedTag ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'}`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              )}

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
                        <div className="absolute top-2 right-2 flex gap-2">
                          <button 
                            onClick={() => { setPrintRecipe(recipe); setIsPrinting(true); }}
                            className="p-2 bg-white/90 dark:bg-stone-800/90 backdrop-blur text-stone-600 dark:text-stone-300 rounded-full hover:bg-stone-50 dark:hover:bg-stone-700 shadow-sm"
                            title="Print Recipe"
                          >
                            <Printer size={16} />
                          </button>
                          <button 
                            onClick={(e) => {
                              console.log("[DEBUG] Delete button clicked for recipe:", recipe.id);
                              e.stopPropagation();
                              setDeletingRecipeId(recipe.id);
                            }}
                            className="p-2 bg-white/90 dark:bg-stone-800/90 backdrop-blur text-red-500 rounded-full hover:bg-red-50 dark:hover:bg-red-900/30 shadow-sm"
                            title="Delete Recipe"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                        {recipe.nutrition_info && (
                          <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur text-white px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider">
                            {JSON.parse(recipe.nutrition_info).calories} kcal
                          </div>
                        )}
                      </div>
                      <div className="p-6">
                        <div className="flex items-start justify-between mb-1">
                          <h3 className="text-xl font-medium line-clamp-1">{recipe.name}</h3>
                          <div className="flex items-center gap-1">
                            {!recipe.nutrition_info && (
                              <button 
                                onClick={() => analyzeNutrition(recipe.id)}
                                className="p-1.5 text-stone-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                                title="Analyze Nutrition"
                              >
                                <Zap size={16} />
                              </button>
                            )}
                            <a 
                              href={`/api/recipes/${recipe.id}/export`}
                              download
                              className="p-1.5 text-stone-400 hover:text-stone-600 hover:bg-stone-100 rounded-lg transition-all"
                              title="Export as Markdown"
                            >
                              <Download size={16} />
                            </a>
                          </div>
                        </div>
                        <p className="text-stone-500 text-sm mb-3 line-clamp-2">{recipe.description || "No description provided."}</p>
                        
                        {recipe.tags && recipe.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mb-4">
                            {recipe.tags.map((tag: string, i: number) => (
                              <span key={`${tag}-${i}`} className="px-2 py-0.5 bg-stone-50 text-stone-400 text-[10px] font-bold uppercase tracking-wider rounded border border-stone-100">
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}

                        <div className="flex gap-2">
                          <button 
                            onClick={() => setViewRecipe(recipe)}
                            className="flex-1 py-2 bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 rounded-xl text-sm font-medium hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors"
                          >
                            View Details
                          </button>
                          <button 
                            onClick={() => {
                              // Load into editor
                              setPendingUploads([{
                                id: randomUUID(),
                                files: [{
                                  file: new File([], "saved-recipe"), // dummy file
                                  preview: recipe.image_data || "",
                                }],
                                status: 'completed',
                                data: {
                                  name: recipe.name,
                                  description: recipe.description,
                                  ingredients: recipe.ingredients,
                                  instructions: recipe.instructions,
                                  tags: recipe.tags,
                                  servings: recipe.servings
                                }
                              }]);
                              setCurrentIndex(0);
                              setActiveTab('upload');
                            }}
                            className="p-2 bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 rounded-xl hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors"
                            title="Edit Recipe"
                          >
                            <Settings size={18} />
                          </button>
                          <button 
                            onClick={() => submitToMealie(recipe)}
                            className="p-2 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-xl hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors"
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

              <div className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm space-y-8">
                <div>
                  <h2 className="text-2xl font-medium mb-2">Feature Parity Checklist</h2>
                  <p className="text-stone-500 text-sm">Tracking features compared to Mealie for full parity.</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    { label: 'Recipe Digitization (OCR)', status: 'completed' },
                    { label: 'Nutrition Analysis (AI)', status: 'completed' },
                    { label: 'Unit Conversion', status: 'completed' },
                    { label: 'Recipe Scaling', status: 'completed' },
                    { label: 'User Management', status: 'completed' },
                    { label: 'Audit Logging', status: 'completed' },
                    { label: 'Meal Planning (Basic)', status: 'completed' },
                    { label: 'Shopping List (AI)', status: 'completed' },
                    { label: 'Recipe Collections', status: 'completed' },
                    { label: 'Mealie Integration', status: 'completed' },
                    { label: 'Meal Planner (Calendar)', status: 'pending' },
                    { label: 'Household/Groups', status: 'pending' },
                    { label: 'Inventory Management', status: 'pending' },
                    { label: 'Webhooks/API Access', status: 'pending' },
                    { label: 'Advanced Search/Filters', status: 'pending' },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-stone-50 rounded-xl">
                      <span className="text-sm font-medium text-stone-700">{item.label}</span>
                      {item.status === 'completed' ? (
                        <span className="flex items-center gap-1 text-[10px] font-bold uppercase text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg">
                          <CheckCircle size={12} /> Done
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[10px] font-bold uppercase text-amber-600 bg-amber-50 px-2 py-1 rounded-lg">
                          <Clock size={12} /> Planned
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

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

          {activeTab === 'meal-plan' && (
            <MealPlan 
              mealPlans={mealPlans} 
              library={library} 
              onUpdate={fetchMealPlans} 
            />
          )}

          {activeTab === 'shopping-list' && (
            <ShoppingList 
              library={library} 
              shoppingList={shoppingList}
              setShoppingList={setShoppingList}
              isGenerating={isGeneratingList}
              setIsGenerating={setIsGeneratingList}
            />
          )}

          {activeTab === 'collections' && (
            <Collections 
              collections={collections} 
              onUpdate={fetchCollections} 
              library={library}
              setSelectedCollectionId={setSelectedCollectionId}
              setActiveTab={setActiveTab}
            />
          )}

          {activeTab === 'audit' && user.role === 'admin' && (
            <motion.div 
              key="audit"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <AuditLogs />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {activeTimer && (
        <TimerWidget timer={activeTimer} onCancel={() => setActiveTimer(null)} />
      )}

      <AnimatePresence>
        {deletingRecipeId && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }}
              className="bg-white dark:bg-stone-900 p-8 rounded-[32px] max-w-sm w-full shadow-2xl border border-stone-100 dark:border-stone-800 text-center"
            >
              <div className="w-16 h-16 bg-red-50 dark:bg-red-900/30 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <Trash2 size={32} />
              </div>
              <h3 className="text-2xl font-serif font-medium mb-2 dark:text-white">Delete Recipe?</h3>
              <p className="text-stone-500 dark:text-stone-400 mb-8">This action cannot be undone. Are you sure you want to remove this recipe from your library?</p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setDeletingRecipeId(null)}
                  className="flex-1 py-3 bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 rounded-xl font-medium hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => deleteFromLibrary(deletingRecipeId)}
                  className="flex-1 py-3 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 transition-colors shadow-lg shadow-red-600/20"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className={`fixed bottom-8 left-1/2 -translate-x-1/2 px-6 py-3 rounded-2xl shadow-xl z-[200] flex items-center gap-3 font-medium ${
              toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
            }`}
          >
            {toast.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function AuditLogs() {
  const [logs, setLogs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState<any | null>(null);

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/admin/audit-logs', { credentials: 'include' });
      if (res.ok) {
        setLogs(await res.json());
      }
    } catch (err) {
      console.error("Failed to fetch logs", err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-serif font-medium">System Audit Logs</h2>
        <button 
          onClick={fetchLogs}
          className="p-2 text-stone-400 hover:text-stone-600 transition-colors"
          title="Refresh Logs"
        >
          <Loader2 className={isLoading ? "animate-spin" : ""} size={20} />
        </button>
      </div>

      <div className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-200 dark:border-stone-800 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-stone-50 dark:bg-stone-800/50 border-b border-stone-200 dark:border-stone-800">
                <th className="px-6 py-4 text-xs font-bold text-stone-400 uppercase tracking-wider">Timestamp</th>
                <th className="px-6 py-4 text-xs font-bold text-stone-400 uppercase tracking-wider">User</th>
                <th className="px-6 py-4 text-xs font-bold text-stone-400 uppercase tracking-wider">Action</th>
                <th className="px-6 py-4 text-xs font-bold text-stone-400 uppercase tracking-wider">Details</th>
                <th className="px-6 py-4 text-xs font-bold text-stone-400 uppercase tracking-wider">IP Address</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
              {logs.length === 0 && !isLoading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-stone-400 italic">
                    No audit logs found.
                  </td>
                </tr>
              ) : logs.map((log, i) => (
                <tr 
                  key={log.id || i} 
                  className="hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors cursor-pointer"
                  onClick={() => setSelectedLog(log)}
                >
                  <td className="px-6 py-4 text-sm text-stone-600 dark:text-stone-400 whitespace-nowrap">
                    {new Date(log.created_at).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-stone-900 dark:text-white">
                    {log.username || 'System'}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider ${
                      log.action.includes('DELETE') ? 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400' :
                      log.action.includes('CREATE') ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' :
                      log.action.includes('LOGIN') ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' :
                      'bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400'
                    }`}>
                      {log.action}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-stone-600 dark:text-stone-400 max-w-xs truncate" title={log.details}>
                    {log.details}
                  </td>
                  <td className="px-6 py-4 text-sm text-stone-400 font-mono">
                    {log.ip_address}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <AnimatePresence>
        {selectedLog && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }}
              className="bg-white dark:bg-stone-900 p-8 rounded-[32px] max-w-2xl w-full shadow-2xl border border-stone-100 dark:border-stone-800"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-serif font-medium dark:text-white">Log Details</h3>
                <button onClick={() => setSelectedLog(null)} className="p-2 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-full transition-colors">
                  <X size={20} />
                </button>
              </div>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-bold text-stone-400 uppercase mb-1">Timestamp</p>
                    <p className="text-sm dark:text-stone-300">{new Date(selectedLog.created_at).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-stone-400 uppercase mb-1">User</p>
                    <p className="text-sm dark:text-stone-300">{selectedLog.username || 'System'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-stone-400 uppercase mb-1">Action</p>
                    <p className="text-sm dark:text-stone-300">{selectedLog.action}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-stone-400 uppercase mb-1">IP Address</p>
                    <p className="text-sm dark:text-stone-300 font-mono">{selectedLog.ip_address || 'Unknown'}</p>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-bold text-stone-400 uppercase mb-1">Full Details</p>
                  <pre className="p-4 bg-stone-50 dark:bg-stone-800 rounded-2xl text-xs font-mono overflow-x-auto dark:text-stone-300 max-h-[300px] overflow-y-auto">
                    {JSON.stringify(JSON.parse(selectedLog.details || '{}'), null, 2)}
                  </pre>
                </div>
              </div>
              <button 
                onClick={() => setSelectedLog(null)}
                className="mt-8 w-full py-3 bg-stone-900 dark:bg-stone-800 text-white rounded-xl font-medium hover:bg-stone-800 dark:hover:bg-stone-700 transition-colors"
              >
                Close
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Dashboard({ library, mealPlans, onNavigate }: { library: SavedRecipe[], mealPlans: MealPlanEntry[], onNavigate: (tab: any) => void }) {
  const stats = [
    { label: 'Total Recipes', value: library.length, icon: <BookOpen className="text-emerald-600" /> },
    { label: 'Meal Plans', value: mealPlans.length, icon: <Calendar className="text-blue-600" /> },
    { label: 'Collections', value: [...new Set(library.flatMap(r => r.tags || []))].length, icon: <FolderHeart className="text-rose-600" /> },
    { label: 'Recent Uploads', value: library.filter(r => new Date(r.created_at) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)).length, icon: <Plus className="text-amber-600" /> },
  ];

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, i) => (
          <div key={i} className="bg-white dark:bg-stone-900 p-6 rounded-3xl border border-stone-200 dark:border-stone-800 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 bg-stone-50 dark:bg-stone-800 rounded-2xl flex items-center justify-center">
              {stat.icon}
            </div>
            <div>
              <p className="text-xs font-bold text-stone-400 uppercase tracking-wider">{stat.label}</p>
              <p className="text-2xl font-bold dark:text-white">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-serif font-medium dark:text-white">Recent Recipes</h3>
            <button onClick={() => onNavigate('library')} className="text-sm text-emerald-600 font-medium hover:underline">View All</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {library.slice(0, 4).map((recipe) => (
              <div key={recipe.id} className="bg-white dark:bg-stone-900 p-4 rounded-3xl border border-stone-200 dark:border-stone-800 shadow-sm flex gap-4 group cursor-pointer hover:border-emerald-500 transition-all">
                <div className="w-20 h-20 rounded-2xl overflow-hidden flex-shrink-0 bg-stone-100 dark:bg-stone-800">
                  {recipe.image_data ? (
                    <img src={recipe.image_data} className="w-full h-full object-cover" alt={recipe.name} />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-stone-300">
                      <ImageIcon size={24} />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-bold text-stone-900 dark:text-white truncate">{recipe.name}</h4>
                  <p className="text-xs text-stone-500 line-clamp-2 mt-1">{recipe.description}</p>
                  <div className="flex gap-1 mt-2">
                    {(recipe.tags || []).slice(0, 2).map(t => (
                      <span key={t} className="text-[9px] font-bold uppercase tracking-wider bg-stone-100 dark:bg-stone-800 text-stone-500 px-1.5 py-0.5 rounded">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <h3 className="text-xl font-serif font-medium dark:text-white">Quick Actions</h3>
          <div className="grid grid-cols-1 gap-3">
            <button 
              onClick={() => onNavigate('upload')}
              className="w-full p-4 bg-emerald-600 text-white rounded-2xl font-medium flex items-center gap-3 hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/20"
            >
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                <Plus size={20} />
              </div>
              Digitize New Recipe
            </button>
            <button 
              onClick={() => onNavigate('meal-plan')}
              className="w-full p-4 bg-white dark:bg-stone-900 text-stone-700 dark:text-stone-300 rounded-2xl font-medium flex items-center gap-3 border border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-800 transition-all shadow-sm"
            >
              <div className="w-10 h-10 bg-blue-50 dark:bg-blue-900/30 text-blue-600 rounded-xl flex items-center justify-center">
                <Calendar size={20} />
              </div>
              Plan Your Meals
            </button>
            <button 
              onClick={() => onNavigate('shopping-list')}
              className="w-full p-4 bg-white dark:bg-stone-900 text-stone-700 dark:text-stone-300 rounded-2xl font-medium flex items-center gap-3 border border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-800 transition-all shadow-sm"
            >
              <div className="w-10 h-10 bg-amber-50 dark:bg-amber-900/30 text-amber-600 rounded-xl flex items-center justify-center">
                <ShoppingCart size={20} />
              </div>
              Generate Shopping List
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
function NavButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={`px-4 py-2 rounded-xl flex items-center gap-2 font-medium transition-all ${active ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'text-stone-500 hover:bg-stone-50 dark:text-stone-400 dark:hover:bg-stone-800'}`}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function TimerWidget({ timer, onCancel }: { timer: { id: string, seconds: number, label: string }, onCancel: () => void }) {
  const [timeLeft, setTimeLeft] = useState(timer.seconds);

  useEffect(() => {
    if (timeLeft <= 0) {
      const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
      audio.play();
      return;
    }
    const interval = setInterval(() => setTimeLeft(prev => prev - 1), 1000);
    return () => clearInterval(interval);
  }, [timeLeft]);

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <motion.div 
      initial={{ y: 50, opacity: 0 }} 
      animate={{ y: 0, opacity: 1 }} 
      className="fixed bottom-8 right-8 bg-stone-900 text-white p-6 rounded-3xl shadow-2xl z-[100] flex items-center gap-6 border border-stone-800"
    >
      <div className="w-12 h-12 bg-emerald-600 rounded-full flex items-center justify-center">
        <Timer className={timeLeft > 0 ? "animate-pulse" : ""} />
      </div>
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-stone-400 mb-1">{timer.label}</p>
        <p className="text-3xl font-mono font-bold">{formatTime(timeLeft)}</p>
      </div>
      <button onClick={onCancel} className="p-2 hover:bg-stone-800 rounded-full transition-colors">
        <X size={20} />
      </button>
    </motion.div>
  );
}

function RecipeForm({ data, user, onChange, onSave, onMealie }: { data: RecipeData, user: UserProfile | null, onChange: (d: RecipeData) => void, onSave: () => void, onMealie: () => void }) {
  const [newTag, setNewTag] = useState('');

  const addTag = () => {
    if (!newTag.trim()) return;
    const tags = data.tags || [];
    if (!tags.includes(newTag.trim())) {
      onChange({ ...data, tags: [...tags, newTag.trim()] });
    }
    setNewTag('');
  };

  const removeTag = (tag: string) => {
    onChange({ ...data, tags: (data.tags || []).filter(t => t !== tag) });
  };

  return (
    <div className="flex-1 flex flex-col space-y-6 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-stone-200 dark:scrollbar-thumb-stone-800">
      <div className="flex gap-6">
        <div className="flex-1 space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-stone-400">Recipe Name</label>
          <input 
            type="text" 
            value={data.name}
            onChange={(e) => onChange({ ...data, name: e.target.value })}
            className="w-full text-2xl font-serif font-medium border-b border-stone-100 dark:border-stone-800 bg-transparent dark:text-white focus:border-emerald-500 outline-none pb-1 transition-colors"
          />
        </div>
        <div className="w-24 space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-stone-400">Servings</label>
          <input 
            type="number" 
            value={data.servings || 1}
            onChange={(e) => onChange({ ...data, servings: parseInt(e.target.value) || 1 })}
            className="w-full text-xl font-medium border-b border-stone-100 dark:border-stone-800 bg-transparent dark:text-white focus:border-emerald-500 outline-none pb-1 transition-colors"
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-bold uppercase tracking-wider text-stone-400">Tags</label>
        <div className="flex flex-wrap gap-2 mb-2">
          {(data.tags || []).map((tag, i) => (
            <span key={`${tag}-${i}`} className="px-2 py-1 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-xs font-medium rounded-lg flex items-center gap-1">
              {tag}
              <button onClick={() => removeTag(tag)} className="hover:text-emerald-900 dark:hover:text-emerald-200">
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input 
            type="text"
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addTag()}
            placeholder="Add a tag..."
            className="flex-1 px-3 py-1.5 bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 dark:text-white rounded-lg text-sm outline-none focus:ring-1 focus:ring-emerald-500"
          />
          <button 
            onClick={addTag}
            className="px-3 py-1.5 bg-stone-900 dark:bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-stone-800 dark:hover:bg-emerald-700"
          >
            Add
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-bold uppercase tracking-wider text-stone-400">Description</label>
        <textarea 
          value={data.description}
          onChange={(e) => onChange({ ...data, description: e.target.value })}
          className="w-full text-stone-600 dark:text-stone-300 bg-transparent resize-none outline-none min-h-[60px]"
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
                className="flex-1 px-3 py-2 bg-stone-50 dark:bg-stone-800 dark:text-white rounded-lg text-sm outline-none focus:ring-1 focus:ring-emerald-500"
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
            className="text-sm text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1 hover:text-emerald-700 dark:hover:text-emerald-300"
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
              <span className="flex-shrink-0 w-6 h-6 bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400 rounded-full flex items-center justify-center text-xs font-bold">{i + 1}</span>
              <textarea 
                value={inst}
                onChange={(e) => {
                  const newInsts = [...data.instructions];
                  newInsts[i] = e.target.value;
                  onChange({ ...data, instructions: newInsts });
                }}
                className="flex-1 text-sm text-stone-700 dark:text-stone-300 bg-transparent outline-none resize-none min-h-[40px]"
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
            className="text-sm text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1 hover:text-emerald-700 dark:hover:text-emerald-300"
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
                <div className="text-[9px] text-stone-400 space-y-0 leading-tight mt-1">
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

function MealPlan({ mealPlans, library, onUpdate }: { mealPlans: MealPlanEntry[], library: SavedRecipe[], onUpdate: () => void }) {
  const [selectedRecipeId, setSelectedRecipeId] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedMealType, setSelectedMealType] = useState('dinner');

  const handleAdd = async () => {
    if (!selectedRecipeId || !selectedDate) return;
    try {
      const res = await fetch('/api/meal-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipe_id: selectedRecipeId, date: selectedDate, meal_type: selectedMealType }),
      });
      if (res.ok) {
        onUpdate();
        setSelectedRecipeId('');
      }
    } catch (err) { console.error(err); }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/meal-plan/${id}`, { method: 'DELETE' });
      if (res.ok) onUpdate();
    } catch (err) { console.error(err); }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
      <div className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm">
        <h2 className="text-2xl font-semibold mb-6 flex items-center gap-2">
          <Calendar className="text-emerald-600" /> Meal Planner
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <select 
            value={selectedRecipeId} 
            onChange={(e) => setSelectedRecipeId(e.target.value)}
            className="px-4 py-3 rounded-xl border border-stone-200 outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="">Select Recipe...</option>
            {library.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <input 
            type="date" 
            value={selectedDate} 
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-4 py-3 rounded-xl border border-stone-200 outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <select 
            value={selectedMealType} 
            onChange={(e) => setSelectedMealType(e.target.value)}
            className="px-4 py-3 rounded-xl border border-stone-200 outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="breakfast">Breakfast</option>
            <option value="lunch">Lunch</option>
            <option value="dinner">Dinner</option>
            <option value="snack">Snack</option>
          </select>
          <button 
            onClick={handleAdd}
            className="bg-emerald-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-emerald-700 transition-all flex items-center justify-center gap-2"
          >
            <Plus size={18} /> Add to Plan
          </button>
        </div>

        <div className="space-y-4">
          {mealPlans.length === 0 ? (
            <p className="text-center py-12 text-stone-400 italic">No meals planned yet.</p>
          ) : (
            mealPlans.map(plan => (
              <div key={plan.id} className="flex items-center justify-between p-4 bg-stone-50 rounded-2xl border border-stone-100">
                <div>
                  <p className="font-semibold text-stone-800">{plan.recipe_name}</p>
                  <p className="text-xs text-stone-500 uppercase font-bold tracking-wider">{plan.date} • {plan.meal_type}</p>
                </div>
                <button onClick={() => handleDelete(plan.id)} className="text-stone-300 hover:text-red-500 transition-colors">
                  <Trash2 size={18} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </motion.div>
  );
}

function ShoppingList({ library, shoppingList, setShoppingList, isGenerating, setIsGenerating }: any) {
  const [selectedRecipes, setSelectedRecipes] = useState<string[]>([]);

  const handleGenerate = async () => {
    if (selectedRecipes.length === 0) return;
    setIsGenerating(true);
    try {
      const selectedIngredients = library
        .filter((r: any) => selectedRecipes.includes(r.id))
        .map((r: any) => r.ingredients);
      
      const { consolidateShoppingList } = await import('./services/gemini');
      const list = await consolidateShoppingList(selectedIngredients);
      setShoppingList(list);
    } catch (err: any) { 
      console.error("Shopping list generation failed:", err);
      alert(err.message || "Failed to generate shopping list");
    }
    setIsGenerating(false);
  };

  const toggleRecipe = (id: string) => {
    setSelectedRecipes(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
      <div className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm">
        <h2 className="text-2xl font-semibold mb-6 flex items-center gap-2">
          <ShoppingCart className="text-emerald-600" /> Smart Shopping List
        </h2>
        
        <div className="mb-8">
          <p className="text-sm font-medium text-stone-500 mb-3 uppercase tracking-wider">Select recipes to include:</p>
          <div className="flex flex-wrap gap-2">
            {library.map((r: any) => (
              <button
                key={r.id}
                onClick={() => toggleRecipe(r.id)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all border ${selectedRecipes.includes(r.id) ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-stone-600 border-stone-200 hover:border-emerald-500'}`}
              >
                {r.name}
              </button>
            ))}
          </div>
        </div>

        <button 
          onClick={handleGenerate}
          disabled={isGenerating || selectedRecipes.length === 0}
          className="w-full bg-stone-900 text-white py-4 rounded-2xl font-bold hover:bg-stone-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mb-8"
        >
          {isGenerating ? <Loader2 className="animate-spin" /> : <Zap size={18} />}
          {isGenerating ? 'Consolidating with Gemini...' : 'Generate Smart List'}
        </button>

        {shoppingList.length > 0 && (
          <div className="space-y-3 bg-stone-50 p-6 rounded-2xl border border-stone-100">
            {shoppingList.map((item: string, i: number) => (
              <div key={i} className="flex items-center gap-3">
                <input type="checkbox" className="w-5 h-5 accent-emerald-600 rounded" />
                <span className="text-stone-700">{item}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function Collections({ collections, onUpdate, library, setSelectedCollectionId, setActiveTab }: any) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const handleAdd = async () => {
    if (!name) return;
    try {
      const res = await fetch('/api/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description: desc }),
      });
      if (res.ok) {
        onUpdate();
        setName('');
        setDesc('');
        setIsAdding(false);
      }
    } catch (err) { console.error(err); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this collection? Recipes will remain but be unassigned.")) return;
    try {
      const res = await fetch(`/api/collections/${id}`, { method: 'DELETE' });
      if (res.ok) onUpdate();
    } catch (err) { console.error(err); }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold flex items-center gap-2">
          <FolderHeart className="text-emerald-600" /> Recipe Collections
        </h2>
        <button 
          onClick={() => setIsAdding(!isAdding)}
          className="bg-emerald-600 text-white px-4 py-2 rounded-xl font-medium flex items-center gap-2"
        >
          {isAdding ? <X size={18} /> : <Plus size={18} />}
          {isAdding ? 'Cancel' : 'New Collection'}
        </button>
      </div>

      <AnimatePresence>
        {isAdding && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm space-y-4">
              <input 
                placeholder="Collection Name" 
                value={name} onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-stone-200 outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <textarea 
                placeholder="Description (Optional)" 
                value={desc} onChange={(e) => setDesc(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-stone-200 outline-none focus:ring-2 focus:ring-emerald-500 h-24"
              />
              <button onClick={handleAdd} className="w-full bg-stone-900 text-white py-3 rounded-xl font-bold">Create Collection</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div 
          onClick={() => { setSelectedCollectionId(null); setActiveTab('library'); }}
          className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm hover:border-emerald-500 transition-all cursor-pointer group"
        >
          <div className="w-12 h-12 bg-stone-100 rounded-2xl flex items-center justify-center text-stone-400 mb-4 group-hover:bg-emerald-50 group-hover:text-emerald-600 transition-colors">
            <BookOpen size={24} />
          </div>
          <h3 className="text-lg font-bold mb-1">All Recipes</h3>
          <p className="text-sm text-stone-500">{library.length} recipes</p>
        </div>

        {collections.map((c: any) => (
          <div 
            key={c.id}
            className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm hover:border-emerald-500 transition-all cursor-pointer group relative"
            onClick={() => { setSelectedCollectionId(c.id); setActiveTab('library'); }}
          >
            <button 
              onClick={(e) => { e.stopPropagation(); handleDelete(c.id); }}
              className="absolute top-4 right-4 text-stone-300 hover:text-red-500 transition-colors"
            >
              <Trash2 size={16} />
            </button>
            <div className="w-12 h-12 bg-stone-100 rounded-2xl flex items-center justify-center text-stone-400 mb-4 group-hover:bg-emerald-50 group-hover:text-emerald-600 transition-colors">
              <FolderHeart size={24} />
            </div>
            <h3 className="text-lg font-bold mb-1">{c.name}</h3>
            <p className="text-sm text-stone-500 line-clamp-1">{c.description || 'No description'}</p>
            <p className="text-xs text-stone-400 mt-2 font-bold uppercase tracking-widest">
              {library.filter((r: any) => r.collection_id === c.id).length} recipes
            </p>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

function PrintView({ recipe, onClose }: { recipe: SavedRecipe, onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(() => window.print(), 500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="fixed inset-0 bg-white z-[100] overflow-auto p-12 print:p-0">
      <div className="max-w-3xl mx-auto">
        <button onClick={onClose} className="print:hidden mb-8 flex items-center gap-2 text-stone-500 hover:text-stone-800 transition-colors">
          <ChevronLeft size={20} /> Back to Library
        </button>
        
        <div className="border-b-2 border-stone-900 pb-8 mb-8">
          <h1 className="text-5xl font-bold mb-4">{recipe.name}</h1>
          <p className="text-xl text-stone-600 italic">{recipe.description}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
          <div className="md:col-span-1">
            <h2 className="text-xl font-bold uppercase tracking-widest mb-6 border-b border-stone-200 pb-2">Ingredients</h2>
            <ul className="space-y-4">
              {recipe.ingredients.map((ing, i) => (
                <li key={i} className="flex items-start gap-3">
                  <div className="w-5 h-5 border border-stone-300 rounded mt-0.5 flex-shrink-0" />
                  <span className="text-stone-800">{ing}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="md:col-span-2">
            <h2 className="text-xl font-bold uppercase tracking-widest mb-6 border-b border-stone-200 pb-2">Instructions</h2>
            <ol className="space-y-6">
              {recipe.instructions.map((inst, i) => (
                <li key={i} className="flex gap-4">
                  <span className="text-2xl font-bold text-stone-300">{i + 1}</span>
                  <span className="text-stone-800 leading-relaxed">{inst}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>

        {recipe.nutrition_info && (
          <div className="mt-12 pt-8 border-t border-stone-200">
            <h2 className="text-xl font-bold uppercase tracking-widest mb-6">Estimated Nutrition</h2>
            <div className="grid grid-cols-4 gap-4">
              {Object.entries(JSON.parse(recipe.nutrition_info)).map(([key, val]: any) => (
                <div key={key} className="bg-stone-50 p-4 rounded-xl text-center">
                  <p className="text-xs text-stone-500 uppercase font-bold tracking-wider mb-1">{key}</p>
                  <p className="text-lg font-bold text-stone-800">{val}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function RecipeViewer({ recipe, onClose, scaleIngredient, convertUnits, unitSystem, setUnitSystem, setActiveTimer }: { 
  recipe: SavedRecipe, 
  onClose: () => void, 
  scaleIngredient: (ing: string, cur: number, tar: number) => string,
  convertUnits: (ing: string, to: 'metric' | 'imperial') => string,
  unitSystem: 'metric' | 'imperial',
  setUnitSystem: (s: 'metric' | 'imperial') => void,
  setActiveTimer: (t: any) => void
}) {
  const [targetServings, setTargetServings] = useState(recipe.servings || 1);
  const [isSharing, setIsSharing] = useState(false);
  const [shareUrl, setShareUrl] = useState('');

  const handleShare = async () => {
    setIsSharing(true);
    try {
      const res = await fetch(`/api/recipes/${recipe.id}/share`, { method: 'POST', credentials: 'include' });
      if (res.ok) {
        const { token } = await res.json();
        const url = `${window.location.origin}/?share=${token}`;
        setShareUrl(url);
        navigator.clipboard.writeText(url);
      }
    } catch (err) { console.error("Failed to share", err); }
    finally { setIsSharing(false); }
  };

  const parseTimer = (text: string) => {
    const parts = [];
    const regex = /(\d+)\s*(minute|min|hour|hr)s?/gi;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
      parts.push(text.substring(lastIndex, match.index));
      const value = parseInt(match[1]);
      const unit = match[2].toLowerCase();
      const seconds = (unit.startsWith('m') ? value * 60 : value * 3600);
      
      parts.push(
        <button 
          key={match.index}
          onClick={() => setActiveTimer({ id: randomUUID(), seconds, label: `Timer for ${match[0]}` })}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded font-bold hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors mx-1"
        >
          <Clock size={12} />
          {match[0]}
        </button>
      );
      lastIndex = regex.lastIndex;
    }
    parts.push(text.substring(lastIndex));
    return parts;
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
    >
      <motion.div 
        initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }}
        className="bg-white dark:bg-stone-900 w-full max-w-4xl max-h-[90vh] rounded-3xl overflow-hidden flex flex-col shadow-2xl border border-stone-200 dark:border-stone-800"
      >
        <div className="p-6 border-b border-stone-100 dark:border-stone-800 flex items-center justify-between bg-stone-50/50 dark:bg-stone-800/50">
          <div className="flex items-center gap-4">
            <button onClick={onClose} className="p-2 hover:bg-stone-200 dark:hover:bg-stone-700 rounded-full transition-colors">
              <X size={20} />
            </button>
            <h2 className="text-2xl font-serif font-medium dark:text-white">{recipe.name}</h2>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={handleShare}
              className="px-4 py-2 bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 rounded-xl text-sm font-medium hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors flex items-center gap-2"
            >
              <Share2 size={16} />
              {shareUrl ? "Copied!" : "Share"}
            </button>
            <button 
              onClick={() => window.print()}
              className="p-2 bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 rounded-xl hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors"
            >
              <Printer size={20} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
            <div className="lg:col-span-1 space-y-8">
              <div className="space-y-4">
                {recipe.image_data && (
                  <div className="aspect-square rounded-2xl overflow-hidden border border-stone-100 dark:border-stone-800">
                    <img src={recipe.image_data} className="w-full h-full object-cover" alt={recipe.name} />
                  </div>
                )}
                
                {recipe.additional_images && recipe.additional_images.length > 0 && (
                  <div className="grid grid-cols-3 gap-2">
                    {recipe.additional_images.map((img: any, idx: number) => (
                      <div key={idx} className="aspect-square rounded-lg overflow-hidden border border-stone-100 dark:border-stone-800">
                        <img 
                          src={typeof img === 'string' ? img : img.image_data} 
                          className="w-full h-full object-cover cursor-pointer hover:opacity-80 transition-opacity" 
                          alt={`${recipe.name} ${idx + 2}`}
                          onClick={() => {
                            // Simple lightbox or just swap main image? 
                            // For now let's just show them.
                          }}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-6 bg-stone-50 dark:bg-stone-800/50 p-6 rounded-3xl">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-stone-400">Scaling</h3>
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => setTargetServings(Math.max(1, targetServings - 1))}
                      className="w-8 h-8 flex items-center justify-center bg-white dark:bg-stone-800 rounded-lg shadow-sm border border-stone-100 dark:border-stone-700"
                    >-</button>
                    <span className="font-bold w-8 text-center">{targetServings}</span>
                    <button 
                      onClick={() => setTargetServings(targetServings + 1)}
                      className="w-8 h-8 flex items-center justify-center bg-white dark:bg-stone-800 rounded-lg shadow-sm border border-stone-100 dark:border-stone-700"
                    >+</button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-stone-400">Units</h3>
                  <div className="flex bg-white dark:bg-stone-800 p-1 rounded-xl shadow-sm border border-stone-100 dark:border-stone-700">
                    <button 
                      onClick={() => setUnitSystem('metric')}
                      className={`px-3 py-1 text-[10px] font-bold uppercase rounded-lg transition-all ${unitSystem === 'metric' ? 'bg-emerald-600 text-white' : 'text-stone-400'}`}
                    >Metric</button>
                    <button 
                      onClick={() => setUnitSystem('imperial')}
                      className={`px-3 py-1 text-[10px] font-bold uppercase rounded-lg transition-all ${unitSystem === 'imperial' ? 'bg-emerald-600 text-white' : 'text-stone-400'}`}
                    >Imperial</button>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-widest text-stone-400">Ingredients</h3>
                <ul className="space-y-3">
                  {recipe.ingredients.map((ing, i) => (
                    <li key={`viewer-ing-${i}`} className="text-sm text-stone-600 dark:text-stone-300 flex gap-3">
                      <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full mt-1.5 flex-shrink-0" />
                      {convertUnits(scaleIngredient(ing, recipe.servings || 1, targetServings), unitSystem)}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="lg:col-span-2 space-y-8">
              <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-widest text-stone-400">Instructions</h3>
                <div className="space-y-6">
                  {recipe.instructions.map((inst, i) => (
                    <div key={`viewer-inst-${i}`} className="flex gap-4">
                      <span className="flex-shrink-0 w-8 h-8 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center text-sm font-bold">{i + 1}</span>
                      <p className="text-stone-700 dark:text-stone-200 leading-relaxed pt-1">
                        {parseTimer(inst)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function PublicRecipeView({ recipe, onClose }: { recipe: SavedRecipe, onClose: () => void }) {
  return (
    <div className="min-h-screen bg-[#FDFCFB] dark:bg-stone-950 p-4 md:p-12">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-12">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center text-white font-bold">R</div>
            <h1 className="text-2xl font-semibold tracking-tight dark:text-white">RecipeDigitizer</h1>
          </div>
          <button 
            onClick={onClose}
            className="px-6 py-2 bg-stone-900 text-white rounded-xl font-medium hover:bg-stone-800 transition-colors"
          >
            Back to App
          </button>
        </div>

        <div className="bg-white dark:bg-stone-900 rounded-[40px] shadow-xl border border-stone-100 dark:border-stone-800 overflow-hidden">
          <div className="aspect-[21/9] bg-stone-100 dark:bg-stone-800 relative">
            {recipe.image_data ? (
              <img src={recipe.image_data} className="w-full h-full object-cover" alt={recipe.name} />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-stone-300">
                <ImageIcon size={64} />
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex flex-col justify-end p-12">
              <h2 className="text-5xl font-serif font-medium text-white mb-2">{recipe.name}</h2>
              <p className="text-white/80 max-w-2xl">{recipe.description}</p>
            </div>
          </div>

          <div className="p-12 grid grid-cols-1 md:grid-cols-3 gap-16">
            <div className="md:col-span-1 space-y-8">
              <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-widest text-stone-400">Ingredients</h3>
                <ul className="space-y-4">
                  {recipe.ingredients.map((ing, i) => (
                    <li key={`ing-${i}`} className="text-stone-600 dark:text-stone-300 flex gap-3">
                      <span className="w-2 h-2 bg-emerald-500 rounded-full mt-2 flex-shrink-0" />
                      {ing}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="md:col-span-2 space-y-8">
              <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-widest text-stone-400">Instructions</h3>
                <div className="space-y-8">
                  {recipe.instructions.map((inst, i) => (
                    <div key={`inst-${i}`} className="flex gap-6">
                      <span className="flex-shrink-0 w-10 h-10 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center text-lg font-bold">{i + 1}</span>
                      <p className="text-stone-700 dark:text-stone-200 text-lg leading-relaxed pt-1">{inst}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
