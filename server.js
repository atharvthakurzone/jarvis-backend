const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { request } = require('undici');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Supabase client
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

const STREAM_MODELS = [
  "mistralai/mistral-7b-instruct",
  "google/gemini-2.5-pro",
  "deepseek/deepseek-r1-0528-qwen3-8b:free"
];

app.post('/api/jarvis', async (req, res) => {
  const { query, model, user_id = "default_user" } = req.body;

  if (!query || !model) {
    return res.status(400).json({ reply: "Missing query or model." });
  }

  const selectedModel = model === "jarvis-custom"
    ? "deepseek/deepseek-r1-0528-qwen3-8b:free"
    : model;

  const supportsStream = STREAM_MODELS.includes(selectedModel);

  // 🧠 Load memory context from Supabase
  let memoryContext = "";
  if (model === "jarvis-custom") {
    const { data, error } = await supabase
      .from('memory')
      .select('q, a')
      .eq('user_id', user_id)
      .order('created_at', { ascending: true })
      .limit(20); // optional limit

    if (error) console.error("❌ Supabase fetch error:", error);
    else {
      memoryContext = data.map(pair => `${pair.q}\n${pair.a}`).join('\n');
    }
  }

  const systemPromptMap = {
    "jarvis-custom": "You are Jarvis, a personal AI assistant for Deep. Speak naturally and helpfully. Never prefix replies with your name. Remember what Deep tells you and refer back to it if needed.",
    "mistralai/mistral-7b-instruct": "You are a helpful assistant. Reply clearly and briefly.",
    "google/gemini-2.5-pro": "You are Gemini, a helpful and factual assistant created by Google."
  };

  const systemPrompt = systemPromptMap[model] || "You are a helpful assistant.";

  const messages = [
    { role: "system", content: systemPrompt },
    ...(memoryContext ? [{ role: "user", content: memoryContext }] : []),
    { role: "user", content: query }
  ];

  try {
    const { body, statusCode, headers } = await request('https://openrouter.ai/api/v1/chat/completions', {
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

    if (statusCode !== 200) {
      const errorText = await body.text();
      console.error("❌ OpenRouter API Error:", errorText);
      return res.status(500).json({ reply: "Jarvis backend failed to stream (HTTP error)." });
    }

    if (supportsStream && headers['content-type']?.includes('text/event-stream')) {
      res.setHeader('Content-Type', 'text/plain');

      let buffer = '', replyContent = '';
      for await (const chunk of body) {
        buffer += chunk.toString();
        const parts = buffer.split('\n');
        buffer = parts.pop();

        for (const part of parts) {
          const cleaned = part.trim().replace(/^data:\s*/, '');
          if (cleaned === '[DONE]') {
            res.end();

            // 💾 Save memory to Supabase
            if (model === "jarvis-custom") {
              await supabase.from('memory').insert({ user_id, q: query, a: replyContent });
            }
            return;
          }

          try {
            const json = JSON.parse(cleaned);
            const text = json.choices?.[0]?.delta?.content;
            if (text) {
              replyContent += text;
              res.write(text);
            }
          } catch { }
        }
      }

      res.end();
      return;
    }

    // Non-stream fallback
    const data = await body.json();
    const reply = data.choices?.[0]?.message?.content || "Sorry, no reply generated.";
    res.json({ reply });

    // 💾 Save to Supabase
    if (model === "jarvis-custom") {
      await supabase.from('memory').insert({ user_id, q: query, a: reply });
    }

  } catch (err) {
    console.error("❌ Backend Error:", err);
    res.status(500).json({ reply: "Jarvis backend failed to stream (exception)." });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✅ Jarvis backend running on port ${PORT}`);
});
