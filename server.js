const express = require('express');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

const STREAM_MODELS = [
  "mistralai/mistral-7b-instruct",
  "google/gemini-2.5-pro"
];

app.post('/api/jarvis', async (req, res) => {
  const { query, model, memoryContext } = req.body;

  if (!query || !model) {
    return res.status(400).json({ reply: "Missing query or model." });
  }

  const selectedModel = model === "jarvis-custom"
    ? "mistralai/mistral-7b-instruct"
    : model;

  const supportsStream = STREAM_MODELS.includes(selectedModel);

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
        messages,
        stream: supportsStream,
        max_tokens: 1024
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenRouter API Error:", errorText);
      return res.status(500).json({ reply: "Jarvis backend failed to stream (HTTP error)." });
    }

    if (supportsStream && response.body && response.headers.get('content-type')?.includes('text/event-stream')) {
      res.setHeader('Content-Type', 'text/plain');

      let buffer = '';

      response.body.on('data', (chunk) => {
        buffer += chunk.toString();

        const parts = buffer.split('\n');
        buffer = parts.pop(); // incomplete part remains

        for (const part of parts) {
          const cleaned = part.trim().replace(/^data:\s*/, '');
          if (cleaned === '[DONE]') return;

          try {
            const json = JSON.parse(cleaned);
            const text = json.choices?.[0]?.delta?.content;
            if (text) res.write(text);
          } catch (err) {
            // Ignore JSON parse errors (likely empty lines or partial chunks)
          }
        }
      });

      response.body.on('end', () => res.end());
      response.body.on('error', (err) => {
        console.error("Stream error:", err);
        res.end();
      });

      return;
    }

    // Fallback for models not supporting stream
    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || "Sorry, no reply generated.";
    res.json({ reply });

  } catch (err) {
    console.error("Backend Error:", err);
    res.status(500).json({ reply: "Jarvis backend failed to stream (exception)." });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✅ Jarvis backend running on port ${PORT}`);
});
