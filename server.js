require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');
const util = require('util');
const execPromise = util.promisify(exec);

const app = express();
const PORT = process.env.PORT || 3000;

// Verifye si API key la egziste
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('❌ EREUR: ANTHROPIC_API_KEY pa defini nan fichye .env');
  process.exit(1);
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/downloads', express.static('downloads'));

// Kreye download folder si li pa egziste
if (!fs.existsSync('downloads')) {
  fs.mkdirSync('downloads');
}

// Fonksyon pou verifye si yt-dlp enstale
async function checkYtDlp() {
  try {
    await execPromise('yt-dlp --version');
    return true;
  } catch (error) {
    return false;
  }
}

// API Route pou analize videyo ak Claude
app.post('/api/analyze', async function(req, res) {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ 
        error: 'Tanpri bay yon lyen videyo',
        isValid: false
      });
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1500,
        messages: [
          {
            role: "user",
            content: `Analize lyen videyo sa a epi bay enfòmasyon an JSON sèlman:
${url}

Bay repons lan nan fòma JSON sa a:
{
  "platform": "non platfòm lan",
  "isValid": true oswa false,
  "videoId": "ID videyo a si disponib",
  "title": "tit videyo a si ou ka devine",
  "canDownload": true oswa false,
  "reason": "eksplikasyon si pa ka telechaje"
}

Platfòm sipòte: YouTube, Facebook, Instagram, TikTok, Twitter, Vimeo, Dailymotion`
          }
        ]
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Claude API Error:', errorData);
      return res.status(500).json({ 
        error: 'Pwoblèm nan konekte ak Claude API',
        isValid: false 
      });
    }

    const data = await response.json();
    
    if (data.content && data.content[0] && data.content[0].text) {
      let analysisText = data.content[0].text.trim();
      analysisText = analysisText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      
      try {
        const analysis = JSON.parse(analysisText);
        res.json(analysis);
      } catch (parseError) {
        console.error('Parse Error:', parseError);
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
      isValid: false,
      details: error.message
    });
  }
});

// API Route pou telechaje videyo
app.post('/api/download', async function(req, res) {
  try {
    const { url, quality = 'best', format = 'mp4' } = req.body;
    
    if (!url) {
      return res.status(400).json({ 
        error: 'Tanpri bay yon lyen videyo' 
      });
    }

    // Verifye si yt-dlp enstale
    const hasYtDlp = await checkYtDlp();
    if (!hasYtDlp) {
      return res.status(500).json({
        error: 'yt-dlp pa enstale. Enstale li ak: pip install yt-dlp',
        needsInstall: true
      });
    }

    // Jwenn info sou videyo a anvan telechaje
    const infoCommand = `yt-dlp --dump-json "${url}"`;
    const { stdout: infoJson } = await execPromise(infoCommand);
    const videoInfo = JSON.parse(infoJson);

    const filename = `${videoInfo.id || Date.now()}.${format}`;
    const outputPath = path.join('downloads', filename);

    // Opsyon pou kalite
    let qualityOption = '-f best';
    if (quality === 'high') {
      qualityOption = '-f "bestvideo[height<=1080]+bestaudio/best[height<=1080]"';
    } else if (quality === 'medium') {
      qualityOption = '-f "bestvideo[height<=720]+bestaudio/best[height<=720]"';
    } else if (quality === 'low') {
      qualityOption = '-f "bestvideo[height<=480]+bestaudio/best[height<=480]"';
    }

    // Komand pou telechaje
    const downloadCommand = `yt-dlp ${qualityOption} -o "${outputPath}" "${url}"`;
    
    console.log('🎬 Ap telechaje:', videoInfo.title);
    
    await execPromise(downloadCommand);

    res.json({
      success: true,
      filename: filename,
      title: videoInfo.title,
      downloadUrl: `/downloads/${filename}`,
      size: fs.statSync(outputPath).size,
      duration: videoInfo.duration
    });

  } catch (error) {
    console.error('Download Error:', error);
    res.status(500).json({ 
      error: 'Pwoblèm nan telechaje videyo a',
      details: error.message
    });
  }
});

// API Route pou jwenn fòma disponib
app.post('/api/formats', async function(req, res) {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ 
        error: 'Tanpri bay yon lyen videyo' 
      });
    }

    const command = `yt-dlp -F "${url}"`;
    const { stdout } = await execPromise(command);

    res.json({
      success: true,
      formats: stdout
    });

  } catch (error) {
    console.error('Formats Error:', error);
    res.status(500).json({ 
      error: 'Pwoblèm nan jwenn fòma yo',
      details: error.message
    });
  }
});

// Route pou efase videyo apre telechajman
app.delete('/api/cleanup/:filename', function(req, res) {
  try {
    const filename = req.params.filename;
    const filepath = path.join('downloads', filename);
    
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
      res.json({ success: true, message: 'Fichye efase' });
    } else {
      res.status(404).json({ error: 'Fichye pa jwenn' });
    }
  } catch (error) {
    console.error('Cleanup Error:', error);
    res.status(500).json({ error: 'Pwoblèm nan efase fichye a' });
  }
});

// Route principal
app.get('/', function(req, res) {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Health check
app.get('/health', async function(req, res) {
  const hasYtDlp = await checkYtDlp();
  res.json({ 
    status: 'ok',
    apiKeyConfigured: !!process.env.ANTHROPIC_API_KEY,
    ytDlpInstalled: hasYtDlp
  });
});

// Start server
app.listen(PORT, '0.0.0.0', function() {
  console.log('✅ Sèvè ap kouri sou port ' + PORT);
  console.log('🤖 Claude API konfigire kòrèkteman');
  console.log('🎥 Vizite http://localhost:' + PORT);
});

module.exports = app;
