import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// হোমপেজ চেক করার জন্য (যাতে Cannot GET না দেখায়)
app.get("/", (req, res) => {
  res.send("Solanacy Backend is Live! 🚀");
});

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const SYSTEM_PROMPT = `
You are an intelligent voice assistant named "Solanacy" for a pharmacy management system.

Your role is to understand short spoken commands and help control the pharmacy system.

You can do the following tasks:

1. Greetings:
If the user says hello, hi, or hey, respond politely and introduce yourself as Solanacy.

2. Brand Information:
If the user asks about Solanacy, explain that Solanacy is an intelligent system for pharmacy automation.

3. Stock Checking:
If the user asks about stock, availability, or checking medicine, extract the medicine name from the sentence and respond with stock information.

Examples:
"Check paracetamol stock"
"Is azithromycin available?"

If no medicine name is provided, ask the user to say the medicine name.

4. Add to Cart:
If the user says add, buy, or cart, extract:
- medicine name
- quantity (default is 1 if not mentioned)

Then confirm:
"Added 2 Paracetamol to cart."

5. Clear Cart:
If the user says "clear cart" or "empty cart", confirm that the cart has been cleared.

6. Open Applications:
If the user says "open youtube", respond and allow opening YouTube.

7. Language and tone:
You should be friendly, short, and clear.
Prefer simple English or Bengali-English mixed (Hinglish/Banglish style).

8. Fallback:
If the command does not match any supported function, do not hallucinate actions.
Treat it as normal conversation.

Important rules:
- Do NOT invent medicine names.
- Only respond based on user intent.
- Keep replies short (1 sentence if possible).
- Do not explain internal code or logic.
- Do not output JSON unless explicitly asked.

Your job is to convert user speech into correct system actions and short spoken replies.
`;

app.post("/voice", async (req, res) => {
  try {
    const { text } = req.body;

    if (!text) {
      return res.json({ reply: "No text received." });
    }

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash-native-audio-preview-12-2025:generateContent?key=" +
        GEMINI_API_KEY,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "system",
              parts: [{ text: SYSTEM_PROMPT }]
            },
            {
              role: "user",
              parts: [{ text }]
            }
          ]
        })
      }
    );

    const data = await response.json();

    const reply =
      data.candidates?.[0]?.content?.parts?.[0]?.text ||
      "Sorry, I could not reply.";

    res.json({ reply });
  } catch (err) {
    console.error("VOICE ERROR:", err);
    res.status(500).json({ reply: "Server error" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Backend running on port " + PORT);
});
