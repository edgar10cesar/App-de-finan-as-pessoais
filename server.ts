import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

// Load environment variables from .env if present
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // AI Service Helper
  const getAI = () => {
    // Debug logging (sanitized)
    const envKeys = Object.keys(process.env).filter(k => k.includes('API_KEY') || k.includes('GEMINI'));
    console.log(`AI Auth Check. Available keys: ${envKeys.join(', ')}`);

    // Priority: GEMINI_API_KEY (platform) > API_KEY (user secret fallback) > VITE_GEMINI_API_KEY
    const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || process.env.VITE_GEMINI_API_KEY;
    
    if (!apiKey || apiKey === 'undefined' || apiKey === 'null' || apiKey.trim() === '') {
      throw new Error(`GEMINI_API_KEY_NOT_FOUND: [${envKeys.join(', ')}]`);
    }
    
    return new GoogleGenAI({ apiKey });
  };

  // API Routes
  app.post("/api/ai/diagnose", async (req, res) => {
    try {
      const { prompt } = req.body;
      const ai = getAI();
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt
      });
      res.json({ text: response.text });
    } catch (error: any) {
      console.error("AI Error:", error);
      let message = error.message;
      if (error.message.startsWith("GEMINI_API_KEY_NOT_FOUND")) {
        message = `Chave de API não encontrada no servidor. Chaves disponíveis: ${error.message.split(': ')[1] || 'nenhuma'}. Certifique-se de que removeu duplicatas nos Secrets e clicou em 'Apply changes'.`;
      }
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/ai/chat", async (req, res) => {
    try {
      const { history, message, systemInstruction } = req.body;
      const ai = getAI();
      
      const chat = ai.chats.create({
        model: "gemini-3-flash-preview",
        config: {
          systemInstruction,
          temperature: 0.7,
        },
        history: (history || []).map((m: any) => ({
          role: m.role,
          parts: m.parts
        }))
      });

      const response = await chat.sendMessage({ message });
      res.json({ text: response.text });
    } catch (error: any) {
      console.error("Chat Error:", error);
      let message = error.message;
      if (error.message.startsWith("GEMINI_API_KEY_NOT_FOUND")) {
        message = "Chave de API (GEMINI_API_KEY) não encontrada no servidor.";
      }
      res.status(500).json({ error: message });
    }
  });

  // Batch Extraction
  app.post("/api/ai/extract", async (req, res) => {
    try {
      const { contents } = req.body;
      const ai = getAI();
      
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: contents.contents || contents,
        config: {
          responseMimeType: "application/json"
        }
      });
      
      res.json({ text: response.text });
    } catch (error: any) {
      console.error("Extraction Error:", error);
      let message = error.message;
      if (error.message.startsWith("GEMINI_API_KEY_NOT_FOUND")) {
        message = "Chave de API (GEMINI_API_KEY) não encontrada no servidor.";
      }
      res.status(500).json({ error: message });
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
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
