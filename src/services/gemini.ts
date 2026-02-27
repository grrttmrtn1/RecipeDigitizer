import { GoogleGenAI, Type } from "@google/genai";

const GEMINI_MODEL = "gemini-3-flash-preview";

export interface RecipeData {
  name: string;
  description: string;
  ingredients: string[];
  instructions: string[];
  tags?: string[];
}

export async function extractRecipeFromImage(images: { base64Data: string, mimeType: string }[]): Promise<RecipeData> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
  
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
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
  
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
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
  
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
