import { GoogleGenAI, Type } from "@google/genai";

const GEMINI_MODEL = "gemini-flash-latest";

export interface RecipeData {
  name: string;
  description: string;
  ingredients: string[];
  instructions: string[];
  tags?: string[];
  servings?: number;
}

async function getAI() {
  // Check for platform-injected keys
  let apiKey = process.env.GEMINI_API_KEY;
  
  // If the key is missing or a placeholder, try to use the selected key
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    apiKey = process.env.API_KEY;
  }

  // If the key is still a placeholder, treat it as missing
  const placeholders = ["MY_GEMINI_API_KEY", "MY_APP_KEY", "MY_API_KEY", "YOUR_API_KEY", "placeholder"];
  if (apiKey && placeholders.includes(apiKey)) {
    apiKey = "";
  }

  // If we're in the browser and still have no key, try fetching from the server
  if (!apiKey && typeof window !== 'undefined') {
    try {
      const res = await fetch('/api/config');
      if (res.ok) {
        const config = await res.json();
        apiKey = config.geminiApiKey || config.apiKey;
        if (apiKey && placeholders.includes(apiKey)) {
          apiKey = "";
        }
      }
    } catch (e) {
      console.error("Failed to fetch config from server:", e);
    }
  }

  // If still no valid key, and we are in the browser, check for key selection
  if (typeof window !== 'undefined' && (window as any).aistudio) {
    const aistudio = (window as any).aistudio;
    const hasKey = await aistudio.hasSelectedApiKey();
    
    if (!apiKey) {
      if (!hasKey) {
        // Only open the dialog if we truly have no key at all
        await aistudio.openSelectKey();
        // We can't wait for the dialog to close, so we'll throw a helpful error
        throw new Error("Please select an API key in the dialog that just opened, then try again.");
      } else {
        // If hasKey is true, the key should be in process.env.API_KEY or on the server
        // We already tried the server above, so if it's still missing, we might need a refresh
        throw new Error("API key selected but not detected. Please refresh the page or try selecting the key again.");
      }
    }
  }

  if (!apiKey || apiKey.trim() === "") {
    throw new Error("Gemini API key is missing. Please configure GEMINI_API_KEY in your secrets or select a key via the platform.");
  }

  return new GoogleGenAI({ apiKey });
}

export async function extractRecipeFromImage(images: { base64Data: string, mimeType: string }[]): Promise<RecipeData> {
  const ai = await getAI();
  
  const prompt = `
    You are an expert at reading handwritten recipes. 
    Extract the recipe information from the provided images or PDF pages.
    These images represent multiple pages of the SAME recipe.
    Return the data in a structured JSON format.
    If the text is handwritten, do your best to transcribe it accurately.
    Include:
    - name: The title of the recipe.
    - description: A brief summary or notes about the recipe.
    - ingredients: A list of ingredients with their quantities.
    - instructions: A step-by-step list of instructions.
    - servings: The number of servings this recipe makes (as a number).
  `;

  const imageParts = images.map(img => ({
    inlineData: {
      data: img.base64Data.split(",")[1] || img.base64Data,
      mimeType: img.mimeType,
    },
  }));

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: {
      parts: [
        ...imageParts,
        { text: prompt },
      ],
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          description: { type: Type.STRING },
          ingredients: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          instructions: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          servings: { type: Type.NUMBER },
        },
        required: ["name", "ingredients", "instructions"],
      },
    },
  });

  const text = response.text;
  if (!text) throw new Error("No response from Gemini");
  
  return JSON.parse(text);
}

export async function analyzeNutrition(recipe: { name: string, ingredients: string[], instructions: string[] }): Promise<any> {
  const ai = await getAI();
  
  const prompt = `
    Analyze the nutritional content of the following recipe:
    Name: ${recipe.name}
    Ingredients: ${recipe.ingredients.join(", ")}
    Instructions: ${recipe.instructions.join(" ")}

    Provide an estimate per serving for:
    - calories
    - protein (g)
    - carbohydrates (g)
    - fat (g)
    - fiber (g)
    - sugar (g)

    Return the data in a structured JSON format.
  `;

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: { parts: [{ text: prompt }] },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          calories: { type: Type.NUMBER },
          protein: { type: Type.NUMBER },
          carbohydrates: { type: Type.NUMBER },
          fat: { type: Type.NUMBER },
          fiber: { type: Type.NUMBER },
          sugar: { type: Type.NUMBER },
        },
        required: ["calories", "protein", "carbohydrates", "fat"],
      },
    },
  });

  const text = response.text;
  if (!text) throw new Error("No response from Gemini");
  return JSON.parse(text);
}

export async function consolidateShoppingList(ingredientsLists: string[][]): Promise<string[]> {
  const ai = await getAI();
  
  const prompt = `
    Consolidate the following lists of ingredients into a single, organized shopping list.
    Combine similar items and normalize units where possible.
    
    Lists:
    ${ingredientsLists.map((list, i) => `Recipe ${i + 1}: ${list.join(", ")}`).join("\n")}

    Return the consolidated list as a JSON array of strings.
  `;

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: { parts: [{ text: prompt }] },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
      },
    },
  });

  const text = response.text;
  if (!text) throw new Error("No response from Gemini");
  return JSON.parse(text);
}
