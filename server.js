const express = require('express');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

app.post('/api/jarvis', async (req, res) => {
  const { query, model, memoryContext } = req.body;

  if (!query || !model) {
    return res.status(400).json({ reply: "Missing query or model." });
  }

  const selectedModel = model === "jarvis-custom"
    ? "mistralai/mistral-7b-instruct"
    : model;

  console.log("🔁 Using model:", selectedModel);

  const systemPromptMap = {
    "jarvis-custom": "You are Jarvis, a personal AI assistant for Deep. Speak naturally and helpfully. Never prefix replies with your name. Remember what Deep tells you and refer back to it if needed.",
    "mistralai/mistral-7b-instruct": "You are a helpful assistant. Reply clearly and briefly. Do not invent features like calendar access, inbox scanning, or meeting schedules unless asked specifically.",
    "google/gemini-2.5-pro": "You are Gemini, a helpful and factual assistant created by Google. Respond concisely and helpfully without adding imaginary details."
  };

  const systemPrompt = systemPromptMap[model] || "You are a helpful assistant.";

  const messages = [
    { role: "system", content: systemPrompt },
    ...(model === "jarvis-custom" && memoryContext
      ? [{ role: "user", content: memoryContext }]
      : []),
    { role: "user", content: query }
  ];

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: selectedModel,
        stream: true,
        messages,
        max_tokens: 1024
      })
    });

    if (!response.ok || !response.body) {
      const err = await response.text();
      console.error("OpenRouter error:", err);
      return res.status(500).json({ reply: "Streaming error from OpenRouter." });
    }

    res.setHeader('Content-Type', 'text/plain');
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');

    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const chunks = buffer.split("data: ").filter(Boolean);
      for (let chunk of chunks) {
        if (chunk.includes('[DONE]')) return;

        try {
          const json = JSON.parse(chunk.trim());
          const text = json.choices?.[0]?.delta?.content;
          if (text) res.write(text);
        } catch (err) {
          console.error("JSON stream error:", err);
        }
      }
    }

    res.end();

  } catch (err) {
    console.error("Backend stream error:", err);
    res.status(500).json({ reply: "Jarvis backend failed to stream." });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✅ Jarvis backend running on port ${PORT}`);
});
