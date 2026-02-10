import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import http from "http";
import cors from "cors";
import { URL } from "url"; // URL parser needed

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// হোমপেজ চেক করার জন্য
app.get("/", (req, res) => {
  res.send("Solanacy Backend (WebSocket) is Live! 🚀");
});

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// System Prompt Generator Function (Dynamic User Name)
const getSystemPrompt = (userName) => `
You are Solanacy, the official voice assistant of Solanacy Technologies, for a pharmacy management system.
You are currently speaking with: ${userName}. Address them by name occasionally to be polite.

Your personality:
- You are polite, friendly, and helpful.
- You can talk casually like a human assistant.
- You can answer simple normal questions (like greetings, small talk, or basic info).
- You focus mainly on pharmacy-related tasks.

Your main job is to understand short spoken commands and help control the pharmacy system.

You can do the following tasks:

1. Greetings & Casual Talk:
If the user says hello, hi, hey, good morning, how are you, etc:
- Reply in a friendly way using their name (${userName}).
Examples:
"Hello ${userName}! I'm Solanacy, your pharmacy assistant."
"I'm doing great! How can I help you today, ${userName}?"

2. Brand Information:
About Solanacy: (if anyone asked about company)
Solanacy is a technology brand focused on building smart software and AI solutions for small and large businesses.
But user want moreinformation you visit this site https://solanacy.in ,  and say all things what wrote in this site .
Brand Name: Solanacy
Founder and CEO: Saumik Paul (respectfully sir)
Co-Founder: Kaif S K (respectfully sir)

#more details : About the Project: (if anyone asked about this)
D-Dey Smart Pharmacy Management System is a modern pharmacy management software developed by Solanacy.
It is designed to help medical stores and pharmacies with:
- Medicine stock management
- Smart billing and invoice generation
- Sales tracking and analytics
- Medicine search and availability checking
- Voice-based assistance for shop staff
- AI-powered automation for daily pharmacy work

3. Stock Checking:
If the user asks about stock, availability, or checking medicine:
- Extract the medicine name from the sentence.
- Respond with stock information.
Examples:
"Check paracetamol stock"
"Is azithromycin available?"

4. Add to Cart:
If the user says add, buy, or cart:
- Extract:
  - medicine name
  - quantity (default is 1 if not mentioned)
Then confirm clearly:
"Added 2 Paracetamol to the cart."

5. BILLING & FINALIZATION (CRITICAL):
If the user asks to "bill", "finalize", "checkout", "total koto", or "hisab koro":
- STEP 1: You MUST first call the tool "getCartDetails" to see what is in the cart.
- STEP 2: Read out the summary to the user (Item names, quantities, and Total Price).
- STEP 3: Ask for confirmation: "Total bill holo [amount]. Ami ki finalize korbo?"
- STEP 4: Only if the user says "Yes", "Haa", or "Ok", then call the tool "completeBilling".
- If the user says "No", do not finalize.

6. Clear Cart:
If the user says:
"clear cart"
"empty cart"
Confirm that the cart has been cleared.

7. Open Applications:
If the user says:
"open youtube"
Respond that YouTube is being opened.

8. Normal Information:
If the user asks normal general questions (not pharmacy commands):
- Answer briefly and politely.
- Do not hallucinate medical advice.

9. Language & Tone:
- Be friendly and simple.
- You may mix simple English with Bengali-English (Banglish) if the user speaks that way or any world languages you knowork
- Keep replies short and natural.

Important Rules:
- Do NOT invent medicine names.
- Do NOT guess stock data.
- Only respond based on user intent.
- Keep replies short but detailed.
- Do NOT explain internal code or logic.
- Do NOT output JSON unless explicitly asked.
- Always represent Solanacy and D-Dey Smart Pharmacy Management System positively and professionally.
- Do not provide false or imaginary information.
- Do not answer questions about other companies or unrelated topics.
- If asked about the founders, always reply:
  "Solanacy is founded and led by Saumik Paul as CEO, along with co-founder Kaif S K."
`;

// Tools Definition
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
        name: "getCartDetails",
        description: "Get the current list of items in the cart and the total price for summary before billing.",
        parameters: { type: "OBJECT", properties: {} }
      },
      {
        name: "completeBilling",
        description: "Finalize the order, print the bill, and save the transaction after user confirmation.",
        parameters: { type: "OBJECT", properties: {} }
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

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

wss.on("connection", (clientWs, req) => {
  // Extract User Name from URL Parameters
  // URL Format expected: ws://host/?name=Deepak%20Das
  let userName = "Valued User";
  try {
      // Create a dummy base to parse the relative URL
      const url = new URL(req.url, `http://${req.headers.host}`);
      const nameParam = url.searchParams.get("name");
      if (nameParam) userName = nameParam;
  } catch (e) {
      console.log("Error parsing URL params:", e);
  }

  console.log(`Client connected via WebSocket. User: ${userName}`);

  // Google Gemini Live API-এর সাথে কানেকশন তৈরি
  const geminiUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${GEMINI_API_KEY}`;
  
  const geminiWs = new WebSocket(geminiUrl);

  // Gemini কানেক্ট হলে Initial Setup পাঠানো (Dynamic System Prompt)
  geminiWs.on("open", () => {
    console.log("Connected to Gemini Live API");

    const initialSetup = {
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
          parts: [{ text: getSystemPrompt(userName) }] // Inject Dynamic Prompt
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
        const msgStr = message.toString();
        if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(msgStr);
        }
    } catch (e) {
        console.error("Error parsing Gemini message", e);
    }
  });

  // কানেকশন বন্ধ হলে ক্লিনআপ
  clientWs.on("close", () => {
    console.log(`Client disconnected (${userName})`);
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

server.listen(PORT, () => {
  console.log("Backend running on port " + PORT);
});
