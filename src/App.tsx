import { useState, useEffect, useRef, ReactNode } from "react";
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
  Image as ImageIcon
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { extractRecipeFromImage, RecipeData } from "./services/gemini";

interface SavedRecipe extends RecipeData {
  id: number;
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
  const [activeTab, setActiveTab] = useState<'upload' | 'library' | 'settings'>('upload');
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [library, setLibrary] = useState<SavedRecipe[]>([]);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);
  
  // Mealie Config
  const [mealieUrl, setMealieUrl] = useState(localStorage.getItem('mealieUrl') || '');
  const [mealieToken, setMealieToken] = useState(localStorage.getItem('mealieToken') || '');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    localStorage.setItem('mealieUrl', mealieUrl);
    localStorage.setItem('mealieToken', mealieToken);
  }, [mealieUrl, mealieToken]);

  useEffect(() => {
    fetchLibrary();
  }, []);

  const fetchLibrary = async () => {
    setIsLoadingLibrary(true);
    try {
      const res = await fetch('/api/recipes');
      const data = await res.json();
      setLibrary(data.map((r: any) => ({
        ...r,
        ingredients: JSON.parse(r.ingredients),
        instructions: JSON.parse(r.instructions)
      })));
    } catch (err) {
      console.error("Failed to fetch library", err);
    } finally {
      setIsLoadingLibrary(false);
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
        })
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

  const deleteFromLibrary = async (id: number) => {
    if (!confirm("Are you sure you want to delete this recipe?")) return;
    try {
      await fetch(`/api/recipes/${id}`, { method: 'DELETE' });
      fetchLibrary();
    } catch (err) {
      console.error("Delete failed", err);
    }
  };

  const submitToMealie = async (recipe: RecipeData) => {
    if (!mealieUrl || !mealieToken) {
      alert("Please configure Mealie settings first.");
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
        })
      });
      const data = await res.json();
      if (res.ok) {
        alert("Successfully submitted to Mealie!");
      } else {
        alert(`Mealie error: ${data.error || 'Unknown error'}`);
      }
    } catch (err) {
      alert("Failed to connect to Mealie server.");
    }
  };

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
          </div>
        </div>
      </nav>

      <main className="pt-24 pb-12 max-w-6xl mx-auto px-4">
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
              className="max-w-2xl mx-auto"
            >
              <div className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm space-y-8">
                <div>
                  <h2 className="text-2xl font-medium mb-2">Mealie Integration</h2>
                  <p className="text-stone-500 text-sm">Configure your Mealie instance to export recipes directly.</p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-stone-700">Mealie URL</label>
                    <input 
                      type="url" 
                      placeholder="https://mealie.yourdomain.com"
                      value={mealieUrl}
                      onChange={(e) => setMealieUrl(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-stone-200 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-stone-700">API Token</label>
                    <input 
                      type="password" 
                      placeholder="Your Mealie API Token"
                      value={mealieToken}
                      onChange={(e) => setMealieToken(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-stone-200 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
                    />
                  </div>
                </div>

                <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl text-amber-800 text-sm">
                  <p className="font-medium mb-1">Security Note</p>
                  <p>Your API token is stored locally in your browser and sent to the server only when submitting recipes. Ensure you use HTTPS for your Mealie instance.</p>
                </div>
              </div>
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

function RecipeForm({ data, onChange, onSave, onMealie }: { data: RecipeData, onChange: (d: RecipeData) => void, onSave: () => void, onMealie: () => void }) {
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
          className="flex-1 py-3 bg-stone-900 text-white rounded-xl font-medium hover:bg-stone-800 transition-colors flex items-center justify-center gap-2"
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
