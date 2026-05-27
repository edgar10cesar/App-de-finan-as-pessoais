import express from "express";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();

app.use(express.json({ limit: '50mb' }));

// AI Service Helper
const getAI = () => {
  const envKeys = Object.keys(process.env).filter(k => k.includes('API_KEY') || k.includes('GEMINI'));
  console.log(`AI Auth Check. Available keys: ${envKeys.join(', ')}`);

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
      message = `Chave de API não encontrada no servidor. Verifique suas variáveis de ambiente no painel do Vercel (GEMINI_API_KEY).`;
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
      message = "Chave de API (GEMINI_API_KEY) não encontrada no servidor Vercel.";
    }
    res.status(500).json({ error: message });
  }
});

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
      message = "Chave de API (GEMINI_API_KEY) não encontrada no servidor Vercel.";
    }
    res.status(500).json({ error: message });
  }
});

export default app;
