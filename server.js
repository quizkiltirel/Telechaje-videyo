require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');
const util = require('util');
const execPromise = util.promisify(exec);
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
const PORT = process.env.PORT || 3000;

// Verifye API key
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('❌ EREUR: ANTHROPIC_API_KEY pa defini nan fichye .env');
  process.exit(1);
}

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/downloads', express.static('downloads'));

// Kreye folders
['downloads', 'public'].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);
});

// Verifye yt-dlp
async function checkYtDlp() {
  try {
    await execPromise('yt-dlp --version');
    return true;
  } catch (error) {
    return false;
  }
}

// Route pou analize videyo ak Claude
app.post('/api/analyze', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ 
        error: 'Tanpri bay yon lyen videyo',
        isValid: false
      });
    }

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1500,
      messages: [{
        role: "user",
        content: `Analize lyen videyo sa a epi bay enfòmasyon an JSON sèlman:
${url}

Bay repons lan nan fòma JSON sa a SÈLMAN (pa mete okenn lòt tèks):
{
  "platform": "non platfòm lan (YouTube, Facebook, Instagram, etc)",
  "isValid": true oswa false,
  "videoId": "ID videyo a si disponib",
  "title": "tit videyo a si ou ka jwenn li",
  "canDownload": true oswa false,
  "reason": "eksplikasyon si pa ka telechaje"
}

Platfòm sipòte: YouTube, Facebook, Instagram, TikTok, Twitter, Vimeo, Dailymotion`
      }]
    });

    const text = message.content[0].text.trim()
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
    
    const analysis = JSON.parse(text);
    res.json(analysis);

  } catch (error) {
    console.error('Erè:', error);
    res.status(500).json({ 
      error: 'Pwoblèm nan analize',
      isValid: false,
      details: error.message
    });
  }
});

// Route pou telechaje videyo
app.post('/api/download', async (req, res) => {
  try {
    const { url, quality = 'best', format = 'mp4' } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'Tanpri bay yon lyen' });
    }

    const hasYtDlp = await checkYtDlp();
    if (!hasYtDlp) {
      return res.status(500).json({
        error: 'yt-dlp pa enstale. Kòmand: pip install yt-dlp',
        needsInstall: true
      });
    }

    // Jwenn info videyo
    const infoCmd = `yt-dlp --dump-json "${url}"`;
    const { stdout: infoJson } = await execPromise(infoCmd);
    const videoInfo = JSON.parse(infoJson);

    const sanitizedTitle = videoInfo.title.replace(/[^\w\s-]/g, '').substring(0, 50);
    const filename = `${sanitizedTitle}-${Date.now()}.${format}`;
    const outputPath = path.join('downloads', filename);

    // Kalite opsyon
    const qualityMap = {
      'best': 'bestvideo+bestaudio/best',
      'high': 'bestvideo[height<=1080]+bestaudio/best[height<=1080]',
      'medium': 'bestvideo[height<=720]+bestaudio/best[height<=720]',
      'low': 'bestvideo[height<=480]+bestaudio/best[height<=480]'
    };

    const formatOption = format === 'mp3' 
      ? '--extract-audio --audio-format mp3'
      : `--merge-output-format ${format}`;

    const downloadCmd = `yt-dlp -f "${qualityMap[quality] || qualityMap.best}" ${formatOption} -o "${outputPath}" "${url}"`;
    
    console.log('🎬 Telechajman:', videoInfo.title);
    await execPromise(downloadCmd, { timeout: 300000 }); // 5 min timeout

    const stats = fs.statSync(outputPath);
    
    res.json({
      success: true,
      filename: filename,
      title: videoInfo.title,
      downloadUrl: `/downloads/${filename}`,
      size: stats.size,
      duration: videoInfo.duration
    });

  } catch (error) {
    console.error('Download Error:', error);
    res.status(500).json({ 
      error: 'Pwoblèm nan telechaje',
      details: error.message
    });
  }
});

// Route pou chache mizik ak Claude
app.post('/api/search', async (req, res) => {
  try {
    const { query } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'Tanpri bay yon rechèch' });
    }

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      messages: [{
        role: "user",
        content: `Chache videyo mizik sou YouTube pou: "${query}"

Bay 6 rezilta an JSON sèlman (pa mete okenn lòt tèks):
{
  "results": [
    {
      "title": "tit videyo a",
      "channel": "non chanel la",
      "duration": "3:45",
      "views": "1.2M",
      "videoId": "ID YouTube la (11 karaktè)"
    }
  ]
}

Si ou pa ka jwenn rezilta reyèl, kreye rezilta reyalis pou rechèch sa a.`
      }]
    });

    const text = message.content[0].text.trim()
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
    
    const results = JSON.parse(text);
    res.json(results);

  } catch (error) {
    console.error('Search Error:', error);
    res.status(500).json({ 
      error: 'Pwoblèm nan rechèch',
      details: error.message
    });
  }
});

// Efase fichye apre telechajman
app.delete('/api/cleanup/:filename', (req, res) => {
  try {
    const filepath = path.join('downloads', req.params.filename);
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Fichye pa jwenn' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Routes pou paj yo
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/search', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'search.html'));
});

// Health check
app.get('/health', async (req, res) => {
  const hasYtDlp = await checkYtDlp();
  res.json({ 
    status: 'ok',
    apiKey: !!process.env.ANTHROPIC_API_KEY,
    ytDlp: hasYtDlp
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('✅ Sèvè ap kouri sou: http://localhost:' + PORT);
  console.log('🤖 Claude API: OK');
  console.log('📁 Downloads: ./downloads/');
  checkYtDlp().then(has => {
    console.log('🎥 yt-dlp:', has ? 'OK' : 'PA ENSTALE');
  });
});

module.exports = app;
