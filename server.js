import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// হোমপেজ চেক করার জন্য (যাতে Cannot GET না দেখায়)
app.get('/', (req, res) => {
    res.send('Solanacy Backend is Live! 🚀');
});

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

app.post("/voice", async (req, res) => {
  try {
    const { text } = req.body;

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash-native-audio-preview-12-2025:generateContent?key=" +
        GEMINI_API_KEY,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text }] }]
        })
      }
    );

    const data = await response.json();
    const reply =
      data.candidates?.[0]?.content?.parts?.[0]?.text ||
      "Sorry, I could not reply.";

    res.json({ reply });
  } catch (err) {
    console.error(err);
    res.status(500).json({ reply: "Server error" });
  }
});

app.listen(3000, () => {
  console.log("Backend running on port 3000");
});
