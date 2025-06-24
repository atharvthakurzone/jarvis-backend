const express = require('express');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(bodyParser.json());
app.use(cors());

app.post('/api/jarvis', async (req, res) => {
  const { query, model } = req.body;

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model,
        messages: [
    { role: "system", content: "You are a helpful and conversational AI assistant. Do not prefix your replies with your name or any labels. Just give natural responses." },
    { role: "user", content: query }
  ]
});

    const data = await response.json();

    if (!data.choices || !data.choices[0]) {
      return res.json({ reply: "Sorry, Jarvis had a problem understanding that." });
    }

    const reply = data.choices[0].message.content.trim();
    res.json({ reply });

  } catch (err) {
    console.error("Backend error:", err);
    res.status(500).json({ reply: "Jarvis encountered an error." });
  }
});

app.listen(3001, () => console.log('Jarvis backend running on http://localhost:3001'));
