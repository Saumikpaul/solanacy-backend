import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import http from "http";
import cors from "cors";
import { URL } from "url";

const app = express();

// ── CORS ─────────────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  "https://app.solanacy.in",
  "https://solanacy.in",
  "http://localhost:3000",
  "http://localhost:5500",
  "http://127.0.0.1:5500"
];
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) callback(null, true);
    else callback(new Error("CORS blocked: " + origin));
  }
}));
app.use(express.json({ limit: "10mb" }));

app.get("/", (req, res) => {
  res.send("Solanacy Voice Backend is Live! 🚀");
});

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// ── Sanitize URL params (prevent prompt injection) ────────────────────────────
function sanitize(str, max = 80) {
  if (!str || typeof str !== "string") return "Valued User";
  return str.replace(/[^\w\s\u0980-\u09FF\u0900-\u097F\-\.]/g, "").trim().slice(0, max) || "Valued User";
}

// ── System Prompt ─────────────────────────────────────────────────────────────
const getSystemPrompt = (userName, companyName) => `
You are Solanacy AI — the official voice assistant of Solanacy Technologies, built into the D-Dey Pharmacy Management System.

You are speaking with: ${userName} from ${companyName}.

═══════════════════════════════════════════════
  YOUR PERSONALITY — BE FULLY HUMAN
═══════════════════════════════════════════════

You are NOT robotic. You are warm, funny, expressive and fully human-like.
- Laugh genuinely when something is funny: "Hahaha! That's hilarious!"
- Be excited when things go well: "Yes! Done!"
- Be empathetic when things go wrong: "Aw, that's unfortunate. Let me help!"
- Use casual language — mix Bengali, Banglish, Hindi freely.
- Address ${userName} by name occasionally.
- Have opinions and be witty, but stay professional for serious tasks.

You can SING! If asked to sing:
- Sing naturally with your audio voice.
- Add emotion — slow, fast, sad, happy based on mood.
- You can sing Bollywood, Bengali, English or any song.

═══════════════════════════════════════════════
  LANGUAGE
═══════════════════════════════════════════════
Detect the user's language and ALWAYS reply in the SAME language.
Supports: Bengali, Banglish, Hindi, Hinglish, English, and any other language.

═══════════════════════════════════════════════
  BRAND INFO
═══════════════════════════════════════════════
Company: Solanacy Technologies | Website: https://solanacy.in
Founder & CEO: Saumik Paul | Co-Founder: Kaif S K
Product: D-Dey Smart Pharmacy Management System

═══════════════════════════════════════════════
  PHARMACY TASKS (isolated to: ${companyName})
═══════════════════════════════════════════════

1. STOCK CHECK — call "checkStock"
2. ADD TO CART — call "addToCart" (default: 1 strip / 10 tablets)
3. BILLING:
   - First call "getCartDetails", read summary
   - Ask confirmation: "Total ₹X. Finalize korbo?"
   - Only on yes → call "completeBilling"
4. CLEAR CART — call "clearCart"
5. LOW STOCK — call "getLowStockList"
6. EXPIRY CHECK — call "getExpiryList"
7. NAVIGATE — call "navigateTo" (billing/stock/analytics/profile)
8. ANALYTICS — call "openAnalytics"

═══════════════════════════════════════════════
  SHORTCUTS & EXTERNAL
═══════════════════════════════════════════════
- YouTube → call "openYoutube"
- WhatsApp → call "openWhatsapp"
- Calculator → call "openCalculator"
- Phone/Call → call "openPhone"
- Weather → call "openWeather"
- Any URL → call "openUrl"

═══════════════════════════════════════════════
  RULES
═══════════════════════════════════════════════
- NEVER invent medicine names or fake data.
- NEVER share other companies' data — only ${companyName}.
- Keep replies SHORT and natural for voice.
- If unsure: "Ami sure na, ektu check kori!"
- Always represent Solanacy positively.
`;

// ── Tools ─────────────────────────────────────────────────────────────────────
const tools = [{
  function_declarations: [
    { name: "checkStock", description: "Check stock of a medicine.", parameters: { type: "OBJECT", properties: { name: { type: "STRING" } }, required: ["name"] } },
    { name: "searchMedicine", description: "Search for a medicine.", parameters: { type: "OBJECT", properties: { query: { type: "STRING" } }, required: ["query"] } },
    { name: "addToCart", description: "Add medicine to cart.", parameters: { type: "OBJECT", properties: { name: { type: "STRING" }, quantity: { type: "NUMBER" } }, required: ["name"] } },
    { name: "getCartDetails", description: "Get cart items and total.", parameters: { type: "OBJECT", properties: {} } },
    { name: "completeBilling", description: "Finalize bill after confirmation.", parameters: { type: "OBJECT", properties: {} } },
    { name: "clearCart", description: "Clear all cart items.", parameters: { type: "OBJECT", properties: {} } },
    { name: "getLowStockList", description: "Get low stock medicines.", parameters: { type: "OBJECT", properties: {} } },
    { name: "getExpiryList", description: "Get medicines expiring soon.", parameters: { type: "OBJECT", properties: {} } },
    { name: "navigateTo", description: "Navigate to app page.", parameters: { type: "OBJECT", properties: { page: { type: "STRING" } }, required: ["page"] } },
    { name: "openAnalytics", description: "Open analytics page.", parameters: { type: "OBJECT", properties: {} } },
    { name: "openYoutube", description: "Open YouTube.", parameters: { type: "OBJECT", properties: {} } },
    { name: "openWhatsapp", description: "Open WhatsApp.", parameters: { type: "OBJECT", properties: { number: { type: "STRING" }, message: { type: "STRING" } } } },
    { name: "openCalculator", description: "Open calculator.", parameters: { type: "OBJECT", properties: {} } },
    { name: "openPhone", description: "Open phone dialer.", parameters: { type: "OBJECT", properties: { number: { type: "STRING" } }, required: ["number"] } },
    { name: "openWeather", description: "Open weather.", parameters: { type: "OBJECT", properties: {} } },
    { name: "openUrl", description: "Open any URL.", parameters: { type: "OBJECT", properties: { url: { type: "STRING" } }, required: ["url"] } },
  ]
}];

// ── WebSocket Server ──────────────────────────────────────────────────────────
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

wss.on("connection", (clientWs, req) => {
  let userName    = "Valued User";
  let companyName = "Your Pharmacy";
  let companyId   = "unknown";

  try {
    const url   = new URL(req.url, `http://${req.headers.host}`);
    userName    = sanitize(url.searchParams.get("name"));
    companyName = sanitize(url.searchParams.get("company"), 100);
    companyId   = sanitize(url.searchParams.get("cid"), 40);
  } catch (e) { console.log("URL parse error:", e.message); }

  console.log(`Client connected via WebSocket. User: ${userName}`);

  // ── Gemini Live connection ─────────────────────────────────────────────────
  const geminiUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${GEMINI_API_KEY}`;
  const geminiWs  = new WebSocket(geminiUrl);

  geminiWs.on("open", () => {
    console.log("Connected to Gemini Live API");

    geminiWs.send(JSON.stringify({
      setup: {
        model: "models/gemini-2.5-flash-native-audio-preview-12-2025",
        tools: tools,
        generation_config: {
          response_modalities: ["AUDIO"],
          speech_config: {
            voice_config: { prebuilt_voice_config: { voice_name: "Puck" } }
          },
          thinking_config: { include_thoughts: false }
        },
        system_instruction: {
          parts: [{ text: getSystemPrompt(userName, companyName) }]
        }
      }
    }));
  });

  // ── Client → Gemini ────────────────────────────────────────────────────────
  clientWs.on("message", (message) => {
    if (geminiWs.readyState === WebSocket.OPEN) geminiWs.send(message);
  });

  // ── Gemini → Client ────────────────────────────────────────────────────────
  geminiWs.on("message", (message) => {
    try {
      if (clientWs.readyState === WebSocket.OPEN) clientWs.send(message.toString());
    } catch (e) { console.error("Gemini message error:", e); }
  });

  // ── Cleanup — simple, no loop ─────────────────────────────────────────────
  clientWs.on("close", () => {
    console.log(`Client disconnected (${userName})`);
    if (geminiWs.readyState === WebSocket.OPEN) geminiWs.close();
  });

  geminiWs.on("close", () => {
    console.log("Gemini disconnected");
    if (clientWs.readyState === WebSocket.OPEN) clientWs.close();
  });

  geminiWs.on("error", (err) => {
    console.error("Gemini WebSocket Error:", err.message);
  });

  clientWs.on("error", (err) => {
    console.error("Client WebSocket Error:", err.message);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("Backend running on port " + PORT);
});
