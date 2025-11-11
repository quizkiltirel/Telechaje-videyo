const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// API Route pou analize videyo
app.post('/api/analyze', async function(req, res) {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ 
        error: 'Tanpri bay yon lyen videyo' 
      });
    }

    // Rele Claude API
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        messages: [
          {
            role: "user",
            content: `Analize lyen videyo sa a epi bay enfòmasyon an JSON sèlman (pa gen okenn tèks anplis):
${url}

Bay repons lan nan fòma JSON sa a:
{
  "platform": "non platfòm lan",
  "isValid": true oswa false,
  "downloadMethod": "eksplikasyon kout sou kijan pou telechaje",
  "tips": "konsèy rapid"
}

Si lyen an pa valid oswa ou pa konnen platfòm lan, mete isValid: false.`
          }
        ]
      })
    });

    const data = await response.json();
    
    if (data.content && data.content[0] && data.content[0].text) {
      let analysisText = data.content[0].text.trim();
      analysisText = analysisText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      
      try {
        const analysis = JSON.parse(analysisText);
        res.json(analysis);
      } catch (parseError) {
        res.status(500).json({ 
          error: 'Pwoblèm nan trete repons lan',
          isValid: false 
        });
      }
    } else {
      res.status(500).json({ 
        error: 'Pa jwenn repons',
        isValid: false 
      });
    }
  } catch (error) {
    console.error('Erè:', error);
    res.status(500).json({ 
      error: 'Gen yon pwoblèm ki fèt. Tanpri eseye ankò.',
      isValid: false 
    });
  }
});

// Route principal
app.get('/', function(req, res) {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Health check
app.get('/health', function(req, res) {
  res.json({ status: 'ok' });
});

// Catch all
app.get('*', function(req, res) {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, '0.0.0.0', function() {
  console.log('Server ap kouri sou port ' + PORT);
});
