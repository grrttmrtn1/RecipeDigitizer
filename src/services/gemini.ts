import { GoogleGenAI, Type } from "@google/genai";

const GEMINI_MODEL = "gemini-3-flash-preview";

export interface RecipeData {
  name: string;
  description: string;
  ingredients: string[];
  instructions: string[];
  tags?: string[];
}

export async function extractRecipeFromImage(base64Data: string, mimeType: string): Promise<RecipeData> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
  
  const prompt = `
    You are an expert at reading handwritten recipes. 
    Extract the recipe information from the provided image or PDF.
    Return the data in a structured JSON format.
    If the text is handwritten, do your best to transcribe it accurately.
    Include:
    - name: The title of the recipe.
    - description: A brief summary or notes about the recipe.
    - ingredients: A list of ingredients with their quantities.
    - instructions: A step-by-step list of instructions.
  `;

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: {
      parts: [
        {
          inlineData: {
            data: base64Data.split(",")[1] || base64Data,
            mimeType: mimeType,
          },
        },
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
