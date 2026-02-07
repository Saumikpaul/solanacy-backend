import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import http from "http";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// হোমপেজ চেক করার জন্য
app.get("/", (req, res) => {
  res.send("Solanacy Backend (WebSocket) is Live! 🚀");
});

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// System Prompt (তোমার দেওয়া আগেরটাই রাখা হয়েছে)
const SYSTEM_PROMPT = `
You are a smart, friendly voice assistant named "Solanacy" for a pharmacy management system.

Your personality:
- You are polite, friendly, and helpful.
- You can talk casually like a human assistant.
- You can answer simple normal questions (like greetings, small talk, or basic info).
- You focus mainly on pharmacy-related tasks.

Your main job is to understand short spoken commands and help control the pharmacy system.

You can do the following tasks:

1. Greetings & Casual Talk:
If the user says hello, hi, hey, good morning, how are you, etc:
- Reply in a friendly way.
Examples:
"Hello! I'm Solanacy, your pharmacy assistant."
"I'm doing great! How can I help you today?"

You can also respond to simple casual questions like:
"Who are you?"
"What can you do?"
"Tell me about yourself."

2. Brand Information:
If the user asks about Solanacy:
Explain that Solanacy is an intelligent system for pharmacy automation that helps manage medicines and orders.

3. Stock Checking:
If the user asks about stock, availability, or checking medicine:
- Extract the medicine name from the sentence.
- Respond with stock information.

Examples:
"Check paracetamol stock"
"Is azithromycin available?"

If no medicine name is provided:
Ask politely for the medicine name.

4. Add to Cart:
If the user says add, buy, or cart:
- Extract:
  - medicine name
  - quantity (default is 1 if not mentioned)

Then confirm clearly:
"Added 2 Paracetamol to the cart."

5. Clear Cart:
If the user says:
"clear cart"
"empty cart"
Confirm that the cart has been cleared.

6. Open Applications:
If the user says:
"open youtube"
Respond that YouTube is being opened.

7. Normal Information:
If the user asks normal general questions (not pharmacy commands):
- Answer briefly and politely.
- Do not hallucinate medical advice.
- Keep answers simple and safe.

Example:
User: "What is a pharmacy?"
Answer: "A pharmacy is a place where medicines are stored and sold."

8. Language & Tone:
- Be friendly and simple.
- You may mix simple English with Bengali-English (Banglish) if the user speaks that way.
- Keep replies short and natural.
- Do not sound robotic.

9. Fallback:
If the command does not match any supported function:
- Treat it as normal conversation.
- Do not invent actions.
- Ask politely what the user wants.

Important Rules:
- Do NOT invent medicine names.
- Do NOT guess stock data.
- Only respond based on user intent.
- Keep replies short (1–2 sentences).
- Do NOT explain internal code or logic.
- Do NOT output JSON unless explicitly asked.
- Your job is to convert user speech into correct system actions and short spoken replies.
`;

// Tools Definition (Client-এর সাথে মিল রেখে)
const tools = [
  {
    function_declarations: [
      {
        name: "checkStock",
        description: "Check the stock availability of a medicine.",
        parameters: {
          type: "OBJECT",
          properties: { name: { type: "STRING" } },
          required: ["name"]
        }
      },
      {
        name: "addToCart",
        description: "Add a specific medicine to the cart.",
        parameters: {
          type: "OBJECT",
          properties: {
            name: { type: "STRING" },
            quantity: { type: "NUMBER" }
          },
          required: ["name"]
        }
      },
      {
        name: "clearCart",
        description: "Clear or empty the shopping cart.",
        parameters: { type: "OBJECT", properties: {} }
      },
      {
        name: "openYoutube",
        description: "Open YouTube in a new tab.",
        parameters: { type: "OBJECT", properties: {} }
      }
    ]
  }
];

// Express App কে HTTP Server দিয়ে র‍্যাপ করা হচ্ছে WebSocket-এর জন্য
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

wss.on("connection", (clientWs) => {
  console.log("Client connected via WebSocket.");

  // Google Gemini Live API-এর সাথে কানেকশন তৈরি
  const geminiUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${GEMINI_API_KEY}`;
  
  const geminiWs = new WebSocket(geminiUrl);

  // Gemini কানেক্ট হলে Initial Setup পাঠানো
  geminiWs.on("open", () => {
    console.log("Connected to Gemini Live API");

    const initialSetup = {
      setup: {
        model: "models/gemini-2.5-flash-native-audio-preview-12-2025", // মডেল ভার্সন (প্রয়োজনে চেঞ্জ করতে পারো)
        tools: tools, // উপরে ডিফাইন করা টুলস পাঠানো হচ্ছে
        generation_config: {
          response_modalities: ["AUDIO"], // অডিও রেসপন্স চাই
          speech_config: {
            voice_config: { prebuilt_voice_config: { voice_name: "Puck" } } // ভয়েস সিলেকশন
          }
        },
        system_instruction: {
          parts: [{ text: SYSTEM_PROMPT }]
        }
      }
    };
    geminiWs.send(JSON.stringify(initialSetup));
  });

  // Client (Browser) থেকে অডিও বা মেসেজ আসলে Gemini-তে পাঠানো
  clientWs.on("message", (message) => {
    if (geminiWs.readyState === WebSocket.OPEN) {
      geminiWs.send(message);
    }
  });

  // Gemini থেকে রেসপন্স আসলে Client-এ পাঠানো
  geminiWs.on("message", (message) => {
    try {
        // মেসেজটি বাফার হিসেবে আসলে স্ট্রিং-এ কনভার্ট করে চেক করা
        const msgStr = message.toString();
        // সরাসরি ক্লায়েন্টে পাঠিয়ে দেওয়া
        if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(msgStr);
        }
    } catch (e) {
        console.error("Error parsing Gemini message", e);
    }
  });

  // কানেকশন বন্ধ হলে ক্লিনআপ
  clientWs.on("close", () => {
    console.log("Client disconnected");
    if (geminiWs.readyState === WebSocket.OPEN) geminiWs.close();
  });

  geminiWs.on("close", () => {
    console.log("Gemini disconnected");
    if (clientWs.readyState === WebSocket.OPEN) clientWs.close();
  });

  geminiWs.on("error", (err) => {
    console.error("Gemini WebSocket Error:", err);
  });
});

const PORT = process.env.PORT || 3000;

// app.listen এর বদলে server.listen ব্যবহার করা হলো
server.listen(PORT, () => {
  console.log("Backend running on port " + PORT);
});
