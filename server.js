const express = require('express');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

app.post('/api/jarvis', async (req, res) => {
  const { query, model } = req.body;

  if (!query) {
    return res.status(400).json({ reply: "Missing query." });
  }

  const selectedModel = model || "openai/gpt-3.5-turbo";

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: selectedModel,
        messages: [
          {
            role: "system",
            content: "You are Jarvis, a personal AI assistant for Deep. Speak naturally and helpfully. Never prefix replies with your name."
          },
          {
            role: "user",
            content: query
          }
        ]
      })
    });

    const data = await response.json();

    if (!data.choices || !data.choices[0]?.message?.content) {
      console.error("OpenRouter API error:", data);
      return res.json({ reply: "Sorry, Jarvis had a problem understanding that." });
    }

    const reply = data.choices[0].message.content.trim();
    res.json({ reply });

  } catch (err) {
    console.error("Backend error:", err);
    res.status(500).json({ reply: "Jarvis encountered an error." });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✅ Jarvis backend running on port ${PORT}`);
});
