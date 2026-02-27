import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import multer from "multer";
import Database from "better-sqlite3";
import dotenv from "dotenv";
import axios from "axios";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("recipes.db");

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS recipes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    ingredients TEXT,
    instructions TEXT,
    image_data TEXT,
    mime_type TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));

  // Multer for file uploads
  const upload = multer({ storage: multer.memoryStorage() });

  // API Routes
  
  // Get all recipes
  app.get("/api/recipes", (req, res) => {
    try {
      const recipes = db.prepare("SELECT * FROM recipes ORDER BY created_at DESC").all();
      res.json(recipes);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch recipes" });
    }
  });

  // Save a recipe
  app.post("/api/recipes", (req, res) => {
    const { name, description, ingredients, instructions, image_data, mime_type } = req.body;
    try {
      const info = db.prepare(`
        INSERT INTO recipes (name, description, ingredients, instructions, image_data, mime_type)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(name, description, JSON.stringify(ingredients), JSON.stringify(instructions), image_data, mime_type);
      res.json({ id: info.lastInsertRowid });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to save recipe" });
    }
  });

  // Delete a recipe
  app.delete("/api/recipes/:id", (req, res) => {
    try {
      db.prepare("DELETE FROM recipes WHERE id = ?").run(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete recipe" });
    }
  });

  // Proxy to Mealie
  app.post("/api/mealie/submit", async (req, res) => {
    const { mealieUrl, apiToken, recipe } = req.body;
    
    if (!mealieUrl || !apiToken || !recipe) {
      return res.status(400).json({ error: "Missing Mealie configuration or recipe data" });
    }

    try {
      // Mealie API expects a specific format
      // This is a simplified version based on Mealie v1 API
      const response = await axios.post(`${mealieUrl.replace(/\/$/, "")}/api/recipes`, {
        name: recipe.name,
        description: recipe.description,
        recipeIngredient: recipe.ingredients.map((i: any) => ({ note: typeof i === 'string' ? i : i.note || i.text })),
        recipeInstructions: recipe.instructions.map((i: any) => ({ text: typeof i === 'string' ? i : i.text })),
      }, {
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json"
        }
      });
      res.json(response.data);
    } catch (error: any) {
      console.error("Mealie error:", error.response?.data || error.message);
      res.status(500).json({ error: "Failed to submit to Mealie", details: error.response?.data });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
