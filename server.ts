import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import multer from "multer";
import Database from "better-sqlite3";
import dotenv from "dotenv";
import axios from "axios";
import bcrypt from "bcryptjs";
import session from "express-session";
import SQLiteStoreFactory from "connect-sqlite3";
import rateLimit from "express-rate-limit";

const SQLiteStore = SQLiteStoreFactory(session);

declare module "express-session" {
  interface SessionData {
    userId: string;
    username: string;
    role: string;
  }
}

import { randomUUID } from "crypto";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("recipes.db");

// Initialize database
console.log("Initializing database...");
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'user', -- 'admin', 'user', 'readonly'
    can_edit_mealie INTEGER DEFAULT 0,
    require_password_change INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS recipes (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    name TEXT NOT NULL,
    description TEXT,
    ingredients TEXT,
    instructions TEXT,
    image_data TEXT,
    mime_type TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    action TEXT NOT NULL,
    details TEXT,
    ip_address TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS collections (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS meal_plan (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    recipe_id TEXT NOT NULL,
    date TEXT NOT NULL, -- YYYY-MM-DD
    meal_type TEXT, -- 'breakfast', 'lunch', 'dinner', 'snack'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(recipe_id) REFERENCES recipes(id)
  );

  CREATE TABLE IF NOT EXISTS recipe_images (
    id TEXT PRIMARY KEY,
    recipe_id TEXT NOT NULL,
    image_data TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    page_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(recipe_id) REFERENCES recipes(id)
  );
`);

// Migration: Add tags column to recipes if it doesn't exist
try {
  db.prepare("ALTER TABLE recipes ADD COLUMN tags TEXT").run();
} catch (e) {}

// Migration: Add collection_id to recipes
try {
  db.prepare("ALTER TABLE recipes ADD COLUMN collection_id TEXT").run();
} catch (e) {}

// Migration: Add nutrition_info to recipes
try {
  db.prepare("ALTER TABLE recipes ADD COLUMN nutrition_info TEXT").run();
} catch (e) {}

// Migration: Add public_token to recipes
try {
  db.prepare("ALTER TABLE recipes ADD COLUMN public_token TEXT").run();
} catch (e) {}

// Migration: Add servings to recipes
try {
  db.prepare("ALTER TABLE recipes ADD COLUMN servings INTEGER DEFAULT 1").run();
} catch (e) {}

// Migration: Check if id column is INTEGER (old schema)
const tableInfo = db.prepare("PRAGMA table_info(users)").all();
const idColumn: any = tableInfo.find((c: any) => c.name === 'id');
if (idColumn && idColumn.type.toUpperCase() === 'INTEGER') {
  console.log("Migrating users table from INTEGER to TEXT IDs...");
  db.transaction(() => {
    // Rename old tables
    db.exec("ALTER TABLE users RENAME TO users_old");
    db.exec("ALTER TABLE recipes RENAME TO recipes_old");

    // Create new tables with TEXT IDs
    db.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT DEFAULT 'user',
        can_edit_mealie INTEGER DEFAULT 0,
        require_password_change INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE recipes (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        name TEXT NOT NULL,
        description TEXT,
        ingredients TEXT,
        instructions TEXT,
        image_data TEXT,
        mime_type TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
      );
    `);

    // Migrate data
    const oldUsers = db.prepare("SELECT * FROM users_old").all();
    const idMap = new Map();

    for (const u of oldUsers as any[]) {
      const newId = randomUUID();
      idMap.set(u.id, newId);
      db.prepare(`
        INSERT INTO users (id, username, password, role, can_edit_mealie, require_password_change, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(newId, u.username, u.password, u.role, u.can_edit_mealie, u.require_password_change, u.created_at);
    }

    const oldRecipes = db.prepare("SELECT * FROM recipes_old").all();
    for (const r of oldRecipes as any[]) {
      const newId = randomUUID();
      const newUserId = idMap.get(r.user_id);
      db.prepare(`
        INSERT INTO recipes (id, user_id, name, description, ingredients, instructions, image_data, mime_type, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(newId, newUserId, r.name, r.description, r.ingredients, r.instructions, r.image_data, r.mime_type, r.created_at);
    }

    // Drop old tables
    db.exec("DROP TABLE users_old");
    db.exec("DROP TABLE recipes_old");
  })();
  console.log("Migration completed.");
}

// Migration: Add require_password_change if it doesn't exist (for cases where table was already TEXT but missing column)
try {
  db.prepare("ALTER TABLE users ADD COLUMN require_password_change INTEGER DEFAULT 0").run();
} catch (e) {}

// Migration: Ensure all users have GUIDs (fallback for any missed ones)
const usersWithoutGuid = db.prepare("SELECT id FROM users WHERE typeof(id) != 'text' OR length(id) < 30").all();
for (const u of usersWithoutGuid as any[]) {
  const newId = randomUUID();
  db.prepare("UPDATE users SET id = ? WHERE id = ?").run(newId, u.id);
  db.prepare("UPDATE recipes SET user_id = ? WHERE user_id = ?").run(newId, u.id);
}

// Initialize default complexity settings
const initSettings = db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)");
initSettings.run("passwordMinLength", "10");
initSettings.run("passwordRequireSpecial", "1");
initSettings.run("passwordRequireNumber", "1");

// Create default admin if not exists
const adminExists = db.prepare("SELECT * FROM users WHERE role = 'admin'").get();
if (!adminExists) {
  const hashedPassword = bcrypt.hashSync("Admin@12345", 10);
  db.prepare("INSERT INTO users (id, username, password, role, can_edit_mealie, require_password_change) VALUES (?, ?, ?, ?, ?, ?)").run(randomUUID(), "admin", hashedPassword, "admin", 1, 1);
  console.log("[DB] Created default admin user with password: Admin@12345");
} else {
  const adminUser: any = db.prepare("SELECT * FROM users WHERE username = 'admin'").get();
  if (adminUser) {
    // If password is the old default 'admin123' or 'admin', reset it to 'Admin@12345' to meet complexity requirements
    if (bcrypt.compareSync("admin123", adminUser.password) || bcrypt.compareSync("admin", adminUser.password)) {
      const newHashed = bcrypt.hashSync("Admin@12345", 10);
      db.prepare("UPDATE users SET password = ?, require_password_change = 1 WHERE username = 'admin'").run(newHashed);
      console.log("[DB] Admin password reset to Admin@12345 to meet complexity requirements.");
    }
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Rate limiting for auth endpoints
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // Limit each IP to 20 requests per windowMs
    message: { error: "Too many attempts, please try again later" },
    standardHeaders: true,
    legacyHeaders: false,
  });

  const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 100, // Limit each IP to 100 requests per minute
    standardHeaders: true,
    legacyHeaders: false,
  });

  // Audit Log Helper
  const logAction = (userId: string | undefined, action: string, details: any, req: any) => {
    try {
      const id = randomUUID();
      db.prepare(`
        INSERT INTO audit_logs (id, user_id, action, details, ip_address)
        VALUES (?, ?, ?, ?, ?)
      `).run(id, userId || null, action, JSON.stringify(details), req.ip);
    } catch (err) {
      console.error("Failed to log action:", err);
    }
  };

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));

  app.set('trust proxy', 1);
  app.use((req, res, next) => {
    // Force https for session cookie security in the AI Studio iframe environment
    req.headers['x-forwarded-proto'] = 'https';
    
    const proto = req.headers['x-forwarded-proto'] || req.protocol;
    console.log(`[DEBUG] Request: ${req.method} ${req.path}`);
    console.log(`[DEBUG] Protocol: ${proto}, Secure: ${req.secure}, Host: ${req.headers.host}`);
    console.log(`[DEBUG] Derived Secure: ${req.secure}`);
    
    const oldWriteHead = res.writeHead;
    res.writeHead = function(statusCode: number, ...args: any[]) {
      const setCookie = res.getHeader('Set-Cookie');
      if (setCookie) {
        console.log(`[DEBUG] Outgoing Set-Cookie: ${setCookie}`);
      }
      return oldWriteHead.apply(this, [statusCode, ...args]);
    };
    next();
  });

  app.use(session({
    store: new SQLiteStore({ db: "sessions.db", dir: "." }) as any,
    secret: process.env.SESSION_SECRET || "recipe-digitizer-secret",
    resave: false,
    saveUninitialized: false,
    rolling: true,
    name: 'recipe_session',
    cookie: { 
      secure: true,
      httpOnly: true,
      sameSite: 'none',
      maxAge: 24 * 60 * 60 * 1000
    }
  }));

  // Auth Middleware
  const isAuthenticated = (req: any, res: any, next: any) => {
    console.log(`[AUTH] Path: ${req.path}, Method: ${req.method}, SessionID: ${req.sessionID}, userId: ${req.session.userId}, Cookie: ${req.headers.cookie}`);
    if (req.session && req.session.userId) return next();
    console.log(`[AUTH] Unauthorized! Session keys: ${req.session ? Object.keys(req.session) : 'no session'}`);
    res.status(401).json({ error: "Unauthorized" });
  };

  const isAdmin = (req: any, res: any, next: any) => {
    if (req.session.role === 'admin') return next();
    res.status(403).json({ error: "Forbidden" });
  };

  const checkPasswordChange = (req: any, res: any, next: any) => {
    if (!req.session.userId) return next();
    const user: any = db.prepare("SELECT require_password_change FROM users WHERE id = ?").get(req.session.userId);
    const path = req.path.replace(/\/$/, "");
    console.log(`[AUTH] checkPasswordChange: path=${path}, require_password_change=${user?.require_password_change}`);
    if (user?.require_password_change === 1 && path !== '/api/auth/change-password' && path !== '/api/auth/me' && path !== '/api/auth/logout') {
      return res.status(403).json({ error: "Password change required" });
    }
    next();
  };

  const validatePassword = (password: string) => {
    const rows = db.prepare("SELECT * FROM settings WHERE key LIKE 'password%'").all();
    const s = rows.reduce((acc: any, row: any) => {
      acc[row.key] = row.value;
      return acc;
    }, {});

    const minLength = parseInt(s.passwordMinLength || "10");
    const requireSpecial = s.passwordRequireSpecial === "1";
    const requireNumber = s.passwordRequireNumber === "1";

    if (password.length < minLength) return `Password must be at least ${minLength} characters.`;
    if (requireNumber && !/\d/.test(password)) return "Password must contain at least one number.";
    if (requireSpecial && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) return "Password must contain at least one special character.";
    return null;
  };

  app.use(checkPasswordChange);

  // Apply rate limiting
  app.use("/api/auth/login", authLimiter);
  app.use("/api/auth/change-password", authLimiter);
  app.use("/api/", apiLimiter);

  app.get("/api/debug/admin", (req, res) => {
    const user = db.prepare("SELECT * FROM users WHERE username = 'admin'").get();
    res.json(user);
  });

  app.get("/api/debug/session", (req: any, res) => {
    res.json({
      sessionID: req.sessionID,
      userId: req.session.userId,
      role: req.session.role,
      cookie: req.session.cookie
    });
  });

  // Auth Routes
  app.post("/api/auth/login", (req, res) => {
    const { username, password } = req.body;
    console.log(`[AUTH] Login attempt for: ${username}`);
    const user: any = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
    const passwordMatch = user && bcrypt.compareSync(password, user.password);
    
    if (passwordMatch) {
      console.log(`[AUTH] Password match for ${username}. Setting session...`);
      req.session.userId = user.id;
      req.session.username = user.username;
      req.session.role = user.role;
      
      logAction(user.id, "LOGIN", { username: user.username }, req);

      req.session.save((err) => {
        if (err) {
          console.error("[AUTH] Session save error:", err);
          return res.status(500).json({ error: "Session save failed" });
        }
        console.log(`[AUTH] Login successful for: ${username}, userId: ${user.id}, role: ${user.role}. SessionID: ${req.sessionID}`);
        res.json({ 
          id: user.id, 
          username: user.username, 
          role: user.role, 
          can_edit_mealie: user.can_edit_mealie,
          require_password_change: user.require_password_change 
        });
      });
    } else {
      console.log(`[AUTH] Login failed for: ${username}. User found: ${!!user}, Password match: false`);
      res.status(401).json({ error: "Invalid credentials" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    const userId = req.session.userId;
    req.session.destroy(() => {
      if (userId) logAction(userId, "LOGOUT", {}, req);
      res.json({ success: true });
    });
  });

  app.get("/api/auth/me", (req: any, res) => {
    console.log(`[AUTH] GET /me - SessionID: ${req.sessionID}, userId: ${req.session.userId}`);
    if (req.session.userId) {
      const user: any = db.prepare("SELECT id, username, role, can_edit_mealie, require_password_change FROM users WHERE id = ?").get(req.session.userId);
      res.json(user);
    } else {
      res.status(401).json({ error: "Not logged in" });
    }
  });

  app.post("/api/auth/change-password", isAuthenticated, (req: any, res) => {
    console.log(`[AUTH] Change password request for userId: ${req.session.userId}`);
    const { password } = req.body;
    const error = validatePassword(password);
    if (error) return res.status(400).json({ error });

    const hashedPassword = bcrypt.hashSync(password, 10);
    db.prepare("UPDATE users SET password = ?, require_password_change = 0 WHERE id = ?").run(hashedPassword, req.session.userId);
    
    logAction(req.session.userId, "PASSWORD_CHANGE", { voluntary: true }, req);

    req.session.save((err: any) => {
      if (err) {
        console.error("Session save error after password change:", err);
        return res.status(500).json({ error: "Session save failed" });
      }
      res.json({ success: true });
    });
  });

  app.get("/api/auth/password-requirements", (req, res) => {
    const rows = db.prepare("SELECT * FROM settings WHERE key LIKE 'password%'").all();
    const s = rows.reduce((acc: any, row: any) => {
      acc[row.key] = row.value;
      return acc;
    }, {});
    res.json(s);
  });

  // User Management (Admin only)
  app.get("/api/admin/users", isAuthenticated, isAdmin, (req, res) => {
    const users = db.prepare("SELECT id, username, role, can_edit_mealie, require_password_change, created_at FROM users").all();
    res.json(users);
  });

  app.post("/api/admin/users", isAuthenticated, isAdmin, (req, res) => {
    const { username, password, role, can_edit_mealie } = req.body;
    try {
      const error = validatePassword(password);
      if (error) return res.status(400).json({ error });

      const hashedPassword = bcrypt.hashSync(password, 10);
      db.prepare("INSERT INTO users (id, username, password, role, can_edit_mealie, require_password_change) VALUES (?, ?, ?, ?, ?, ?)")
        .run(randomUUID(), username, hashedPassword, role, can_edit_mealie ? 1 : 0, 1);
      
      logAction(req.session.userId, "USER_CREATE", { target_username: username, role }, req);
      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ error: "Username already exists" });
    }
  });

  app.put("/api/admin/users/:id", isAuthenticated, isAdmin, (req, res) => {
    const { username, role, can_edit_mealie, password, require_password_change } = req.body;
    try {
      if (password) {
        const error = validatePassword(password);
        if (error) return res.status(400).json({ error });
        
        const hashedPassword = bcrypt.hashSync(password, 10);
        db.prepare("UPDATE users SET username = ?, role = ?, can_edit_mealie = ?, password = ?, require_password_change = ? WHERE id = ?")
          .run(username, role, can_edit_mealie ? 1 : 0, hashedPassword, require_password_change ? 1 : 0, req.params.id);
      } else {
        db.prepare("UPDATE users SET username = ?, role = ?, can_edit_mealie = ?, require_password_change = ? WHERE id = ?")
          .run(username, role, can_edit_mealie ? 1 : 0, require_password_change ? 1 : 0, req.params.id);
      }
      logAction(req.session.userId, "USER_UPDATE", { target_id: req.params.id, username, role }, req);
      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ error: "Update failed" });
    }
  });

  app.delete("/api/admin/users/:id", isAuthenticated, isAdmin, (req, res) => {
    const userToDelete: any = db.prepare("SELECT username, role FROM users WHERE id = ?").get(req.params.id);
    if (!userToDelete) return res.status(404).json({ error: "User not found" });

    if (userToDelete.role === 'admin') {
      const otherAdmins: any = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin' AND id != ?").get(req.params.id);
      if (otherAdmins.count === 0) {
        return res.status(400).json({ error: "Cannot delete the last admin" });
      }
    }

    db.prepare("DELETE FROM users WHERE id = ?").run(req.params.id);
    logAction(req.session.userId, "USER_DELETE", { target_id: req.params.id, username: userToDelete.username }, req);
    if (req.params.id === req.session.userId) {
      req.session.destroy(() => {
        res.json({ success: true, loggedOut: true });
      });
    } else {
      res.json({ success: true });
    }
  });

  // Settings
  app.get("/api/settings", isAuthenticated, (req, res) => {
    const rows = db.prepare("SELECT * FROM settings").all();
    const settings = rows.reduce((acc: any, row: any) => {
      acc[row.key] = row.value;
      return acc;
    }, {});
    res.json(settings);
  });

  app.post("/api/settings", isAuthenticated, (req: any, res) => {
    const user: any = db.prepare("SELECT role, can_edit_mealie FROM users WHERE id = ?").get(req.session.userId);
    if (user.role !== 'admin' && !user.can_edit_mealie) {
      return res.status(403).json({ error: "Permission denied to edit settings" });
    }

    const { mealieUrl, mealieToken, passwordMinLength, passwordRequireSpecial, passwordRequireNumber } = req.body;
    
    if (passwordMinLength !== undefined && parseInt(passwordMinLength) < 10) {
      return res.status(400).json({ error: "Minimum password length cannot be less than 10" });
    }

    const upsert = db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
    db.transaction(() => {
      if (mealieUrl !== undefined) upsert.run("mealieUrl", mealieUrl);
      if (mealieToken !== undefined) upsert.run("mealieToken", mealieToken);
      if (passwordMinLength !== undefined) upsert.run("passwordMinLength", passwordMinLength.toString());
      if (passwordRequireSpecial !== undefined) upsert.run("passwordRequireSpecial", passwordRequireSpecial ? "1" : "0");
      if (passwordRequireNumber !== undefined) upsert.run("passwordRequireNumber", passwordRequireNumber ? "1" : "0");
    })();

    logAction(req.session.userId, "SETTINGS_UPDATE", { keys: Object.keys(req.body) }, req);
    res.json({ success: true });
  });

  app.get("/api/admin/audit-logs", isAuthenticated, (req: any, res) => {
    if (req.session.role !== 'admin') return res.status(403).json({ error: "Admin only" });
    const logs = db.prepare(`
      SELECT a.*, u.username 
      FROM audit_logs a 
      LEFT JOIN users u ON a.user_id = u.id 
      ORDER BY a.created_at DESC 
      LIMIT 100
    `).all();
    res.json(logs);
  });

  // Collections Routes
  app.get("/api/collections", isAuthenticated, (req: any, res) => {
    try {
      const collections = db.prepare("SELECT * FROM collections WHERE user_id = ? OR ? = 'admin' ORDER BY name ASC")
        .all(req.session.userId, req.session.role);
      res.json(collections);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch collections" });
    }
  });

  app.post("/api/collections", isAuthenticated, (req: any, res) => {
    const { name, description } = req.body;
    try {
      const id = randomUUID();
      db.prepare("INSERT INTO collections (id, user_id, name, description) VALUES (?, ?, ?, ?)")
        .run(id, req.session.userId, name, description);
      res.json({ id, name, description });
    } catch (error) {
      res.status(500).json({ error: "Failed to create collection" });
    }
  });

  app.delete("/api/collections/:id", isAuthenticated, (req: any, res) => {
    try {
      const collection: any = db.prepare("SELECT user_id FROM collections WHERE id = ?").get(req.params.id);
      if (!collection) return res.status(404).json({ error: "Collection not found" });
      if (req.session.role !== 'admin' && collection.user_id !== req.session.userId) {
        return res.status(403).json({ error: "Forbidden" });
      }
      db.prepare("DELETE FROM collections WHERE id = ?").run(req.params.id);
      // Unset collection_id for recipes in this collection
      db.prepare("UPDATE recipes SET collection_id = NULL WHERE collection_id = ?").run(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete collection" });
    }
  });

  // Meal Plan Routes
  app.get("/api/meal-plan", isAuthenticated, (req: any, res) => {
    try {
      const plans = db.prepare(`
        SELECT mp.*, r.name as recipe_name 
        FROM meal_plan mp 
        JOIN recipes r ON mp.recipe_id = r.id 
        WHERE mp.user_id = ? OR ? = 'admin'
        ORDER BY mp.date ASC
      `).all(req.session.userId, req.session.role);
      res.json(plans);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch meal plan" });
    }
  });

  app.post("/api/meal-plan", isAuthenticated, (req: any, res) => {
    const { recipe_id, date, meal_type } = req.body;
    try {
      const id = randomUUID();
      db.prepare("INSERT INTO meal_plan (id, user_id, recipe_id, date, meal_type) VALUES (?, ?, ?, ?, ?)")
        .run(id, req.session.userId, recipe_id, date, meal_type);
      res.json({ id, recipe_id, date, meal_type });
    } catch (error) {
      res.status(500).json({ error: "Failed to add to meal plan" });
    }
  });

  app.delete("/api/meal-plan/:id", isAuthenticated, (req: any, res) => {
    try {
      const plan: any = db.prepare("SELECT user_id FROM meal_plan WHERE id = ?").get(req.params.id);
      if (!plan) return res.status(404).json({ error: "Meal plan entry not found" });
      if (req.session.role !== 'admin' && plan.user_id !== req.session.userId) {
        return res.status(403).json({ error: "Forbidden" });
      }
      db.prepare("DELETE FROM meal_plan WHERE id = ?").run(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete meal plan entry" });
    }
  });

  // Recipe Routes
  app.get("/api/recipes", isAuthenticated, (req: any, res) => {
    try {
      const { search, tag, collection_id } = req.query;
      let query = "SELECT * FROM recipes";
      let params: any[] = [];
      let conditions: string[] = [];

      if (req.session.role !== 'admin') {
        conditions.push("user_id = ?");
        params.push(req.session.userId);
      }

      if (search) {
        conditions.push("(name LIKE ? OR description LIKE ?)");
        params.push(`%${search}%`, `%${search}%`);
      }

      if (tag) {
        conditions.push("tags LIKE ?");
        params.push(`%${tag}%`);
      }

      if (collection_id) {
        conditions.push("collection_id = ?");
        params.push(collection_id);
      }

      if (conditions.length > 0) {
        query += " WHERE " + conditions.join(" AND ");
      }

      query += " ORDER BY created_at DESC";
      const recipes = db.prepare(query).all(...params);
      
      // Attach additional images
      for (const recipe of recipes as any[]) {
        recipe.additional_images = db.prepare("SELECT image_data, mime_type FROM recipe_images WHERE recipe_id = ? ORDER BY page_order ASC")
          .all(recipe.id);
      }
      
      res.json(recipes);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch recipes" });
    }
  });

  app.post("/api/recipes", isAuthenticated, (req: any, res) => {
    if (req.session.role === 'readonly') return res.status(403).json({ error: "Read-only access" });
    
    const { name, description, ingredients, instructions, image_data, mime_type, tags, collection_id, additional_images } = req.body;
    try {
      const id = randomUUID();
      db.prepare(`
        INSERT INTO recipes (id, user_id, name, description, ingredients, instructions, image_data, mime_type, tags, collection_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, req.session.userId, name, description, JSON.stringify(ingredients), JSON.stringify(instructions), image_data, mime_type, JSON.stringify(tags || []), collection_id || null);
      
      if (additional_images && Array.isArray(additional_images)) {
        const insertImage = db.prepare("INSERT INTO recipe_images (id, recipe_id, image_data, mime_type, page_order) VALUES (?, ?, ?, ?, ?)");
        additional_images.forEach((img: any, index: number) => {
          insertImage.run(randomUUID(), id, img.image_data, img.mime_type, index);
        });
      }

      logAction(req.session.userId, "RECIPE_CREATE", { recipe_id: id, name }, req);
      res.json({ id });
    } catch (error) {
      res.status(500).json({ error: "Failed to save recipe" });
    }
  });

  app.put("/api/recipes/:id", isAuthenticated, (req: any, res) => {
    if (req.session.role === 'readonly') return res.status(403).json({ error: "Read-only access" });
    
    const { name, description, ingredients, instructions, tags, collection_id, additional_images } = req.body;
    try {
      const recipe: any = db.prepare("SELECT user_id FROM recipes WHERE id = ?").get(req.params.id);
      if (!recipe) return res.status(404).json({ error: "Recipe not found" });
      if (req.session.role !== 'admin' && recipe.user_id !== req.session.userId) {
        return res.status(403).json({ error: "Forbidden" });
      }

      db.prepare(`
        UPDATE recipes 
        SET name = ?, description = ?, ingredients = ?, instructions = ?, tags = ?, collection_id = ?
        WHERE id = ?
      `).run(name, description, JSON.stringify(ingredients), JSON.stringify(instructions), JSON.stringify(tags || []), collection_id || null, req.params.id);
      
      if (additional_images && Array.isArray(additional_images)) {
        db.prepare("DELETE FROM recipe_images WHERE recipe_id = ?").run(req.params.id);
        const insertImage = db.prepare("INSERT INTO recipe_images (id, recipe_id, image_data, mime_type, page_order) VALUES (?, ?, ?, ?, ?)");
        additional_images.forEach((img: any, index: number) => {
          insertImage.run(randomUUID(), req.params.id, img.image_data, img.mime_type, index);
        });
      }

      logAction(req.session.userId, "RECIPE_UPDATE", { recipe_id: req.params.id, name }, req);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to update recipe" });
    }
  });

  app.delete("/api/recipes/:id", isAuthenticated, (req: any, res) => {
    if (req.session.role === 'readonly') return res.status(403).json({ error: "Read-only access" });
    
    try {
      const recipe: any = db.prepare("SELECT name FROM recipes WHERE id = ?").get(req.params.id);
      if (req.session.role === 'admin') {
        db.prepare("DELETE FROM recipes WHERE id = ?").run(req.params.id);
      } else {
        db.prepare("DELETE FROM recipes WHERE id = ? AND user_id = ?").run(req.params.id, req.session.userId);
      }
      logAction(req.session.userId, "RECIPE_DELETE", { recipe_id: req.params.id, name: recipe?.name }, req);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete recipe" });
    }
  });

  // Public Recipe Route
  app.get("/api/public/recipe/:token", (req, res) => {
    try {
      const recipe: any = db.prepare("SELECT * FROM recipes WHERE public_token = ?").get(req.params.token);
      if (!recipe) return res.status(404).json({ error: "Recipe not found" });
      
      recipe.additional_images = db.prepare("SELECT image_data, mime_type FROM recipe_images WHERE recipe_id = ? ORDER BY page_order ASC")
        .all(recipe.id);
      
      res.json(recipe);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch public recipe" });
    }
  });

  app.post("/api/recipes/:id/share", isAuthenticated, (req: any, res) => {
    try {
      const recipe: any = db.prepare("SELECT user_id FROM recipes WHERE id = ?").get(req.params.id);
      if (!recipe) return res.status(404).json({ error: "Recipe not found" });
      if (req.session.role !== 'admin' && recipe.user_id !== req.session.userId) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const token = randomUUID();
      db.prepare("UPDATE recipes SET public_token = ? WHERE id = ?").run(token, req.params.id);
      res.json({ token });
    } catch (error) {
      res.status(500).json({ error: "Failed to share recipe" });
    }
  });

  app.get("/api/recipes/:id/export", isAuthenticated, (req: any, res) => {
    try {
      const recipe: any = db.prepare("SELECT * FROM recipes WHERE id = ?").get(req.params.id);
      if (!recipe) return res.status(404).json({ error: "Recipe not found" });
      if (req.session.role !== 'admin' && recipe.user_id !== req.session.userId) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const ingredients = JSON.parse(recipe.ingredients);
      const instructions = JSON.parse(recipe.instructions);
      const tags = JSON.parse(recipe.tags || "[]");

      let markdown = `# ${recipe.name}\n\n`;
      if (recipe.description) markdown += `${recipe.description}\n\n`;
      if (tags.length > 0) markdown += `**Tags:** ${tags.join(", ")}\n\n`;
      
      markdown += `## Ingredients\n`;
      ingredients.forEach((ing: string) => markdown += `- ${ing}\n`);
      
      markdown += `\n## Instructions\n`;
      instructions.forEach((inst: string, i: number) => markdown += `${i + 1}. ${inst}\n`);

      res.setHeader('Content-Type', 'text/markdown');
      res.setHeader('Content-Disposition', `attachment; filename="${recipe.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.md"`);
      res.send(markdown);
    } catch (error) {
      res.status(500).json({ error: "Failed to export recipe" });
    }
  });

  app.post("/api/recipes/:id/nutrition", isAuthenticated, async (req: any, res) => {
    try {
      const recipe: any = db.prepare("SELECT * FROM recipes WHERE id = ?").get(req.params.id);
      if (!recipe) return res.status(404).json({ error: "Recipe not found" });
      
      // Nutrition analysis logic will be handled by Gemini
      // For now, we'll just return a placeholder or call a service
      // I'll implement the actual service call in gemini.ts
      const { analyzeNutrition } = await import("./src/services/gemini.js");
      const nutrition = await analyzeNutrition({
        name: recipe.name,
        ingredients: JSON.parse(recipe.ingredients),
        instructions: JSON.parse(recipe.instructions)
      });

      db.prepare("UPDATE recipes SET nutrition_info = ? WHERE id = ?").run(JSON.stringify(nutrition), req.params.id);
      res.json(nutrition);
    } catch (error) {
      console.error("Nutrition analysis failed:", error);
      res.status(500).json({ error: "Failed to analyze nutrition" });
    }
  });

  app.get("/api/shopping-list", isAuthenticated, async (req: any, res) => {
    try {
      const { recipe_ids } = req.query;
      if (!recipe_ids) return res.json([]);
      
      const ids = (recipe_ids as string).split(",");
      const recipes = db.prepare(`SELECT * FROM recipes WHERE id IN (${ids.map(() => "?").join(",")})`).all(...ids);
      
      const { consolidateShoppingList } = await import("./src/services/gemini.js");
      const ingredientsList = recipes.map((r: any) => JSON.parse(r.ingredients));
      const shoppingList = await consolidateShoppingList(ingredientsList);
      
      res.json(shoppingList);
    } catch (error) {
      console.error("Shopping list generation failed:", error);
      res.status(500).json({ error: "Failed to generate shopping list" });
    }
  });

  app.post("/api/mealie/submit", isAuthenticated, async (req, res) => {
    const { recipe } = req.body;
    
    // Get settings from DB
    const mealieUrl = db.prepare("SELECT value FROM settings WHERE key = 'mealieUrl'").get() as any;
    const mealieToken = db.prepare("SELECT value FROM settings WHERE key = 'mealieToken'").get() as any;

    if (!mealieUrl?.value || !mealieToken?.value || !recipe) {
      return res.status(400).json({ error: "Missing Mealie configuration or recipe data" });
    }

    try {
      const response = await axios.post(`${mealieUrl.value.replace(/\/$/, "")}/api/recipes`, {
        name: recipe.name,
        description: recipe.description,
        recipeIngredient: recipe.ingredients.map((i: any) => ({ note: typeof i === 'string' ? i : i.note || i.text })),
        recipeInstructions: recipe.instructions.map((i: any) => ({ text: typeof i === 'string' ? i : i.text })),
      }, {
        headers: {
          Authorization: `Bearer ${mealieToken.value}`,
          "Content-Type": "application/json"
        }
      });
      logAction(req.session.userId, "MEALIE_SUBMIT", { recipe_name: recipe.name }, req);
      res.json(response.data);
    } catch (error: any) {
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
