require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { spawn, exec } = require('child_process');
const fs = require('fs');
const crypto = require('crypto');
const util = require('util');
const execPromise = util.promisify(exec);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/downloads', express.static('downloads'));

['downloads', 'public'].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);
});

// ---------------------------------------------------------------------------
// jobs anmemwa pou swivi pwogrè telechajman (senp, san baz done)
// ---------------------------------------------------------------------------
const jobs = new Map();
const JOB_TTL_MS = 30 * 60 * 1000; // netwaye job apre 30 min

function createJob() {
  const id = crypto.randomUUID();
  jobs.set(id, { status: 'pending', progress: 0, result: null, error: null, createdAt: Date.now() });
  return id;
}

function cleanupOldJobs() {
  const now = Date.now();
  for (const [id, job] of jobs.entries()) {
    if (now - job.createdAt > JOB_TTL_MS) jobs.delete(id);
  }
}
setInterval(cleanupOldJobs, 5 * 60 * 1000);

// ---------------------------------------------------------------------------
// verifye yt-dlp enstale
// ---------------------------------------------------------------------------
async function checkYtDlp() {
  try {
    await execPromise('yt-dlp --version');
    return true;
  } catch {
    return false;
  }
}

function detectPlatform(extractor, originalUrl) {
  if (!extractor) return 'Enkoni';
  const e = extractor.toLowerCase();
  if (e.includes('youtube')) return 'YouTube';
  if (e.includes('facebook')) return 'Facebook';
  if (e.includes('instagram')) return 'Instagram';
  if (e.includes('tiktok')) return 'TikTok';
  if (e.includes('twitter') || e.includes('x.com')) return 'Twitter/X';
  if (e.includes('vimeo')) return 'Vimeo';
  if (e.includes('dailymotion')) return 'Dailymotion';
  return extractor;
}

function isSupportedUrl(url) {
  try {
    const u = new URL(url);
    return !!u.hostname;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// POST /api/analyze — verifye lyen an REYÈLMAN ak yt-dlp, san envante done
// ---------------------------------------------------------------------------
app.post('/api/analyze', async (req, res) => {
  const { url } = req.body || {};

  if (!url || !url.trim()) {
    return res.status(400).json({ isValid: false, reason: 'Tanpri mete yon lyen videyo' });
  }
  if (!isSupportedUrl(url.trim())) {
    return res.status(400).json({ isValid: false, reason: 'Lyen sa a pa gen fòma URL ki valid' });
  }

  const hasYtDlp = await checkYtDlp();
  if (!hasYtDlp) {
    return res.status(500).json({
      isValid: false,
      reason: 'yt-dlp pa enstale sou sèvè a. Kòmand pou enstale l: pip install -U yt-dlp',
    });
  }

  try {
    const { stdout } = await execPromise(
      `yt-dlp --no-playlist --skip-download --dump-json "${url.trim()}"`,
      { timeout: 30000, maxBuffer: 1024 * 1024 * 10 }
    );
    const info = JSON.parse(stdout);

    return res.json({
      isValid: true,
      platform: detectPlatform(info.extractor_key || info.extractor, url),
      videoId: info.id || null,
      title: info.title || null,
      thumbnail: info.thumbnail || null,
      duration: info.duration || null,
      uploader: info.uploader || info.channel || null,
      canDownload: true,
    });
  } catch (error) {
    console.error('Erè analiz:', error.message);
    return res.json({
      isValid: false,
      reason: 'Nou pa ka jwenn videyo sa a. Verifye lyen an oswa videyo a ka prive/efase.',
    });
  }
});

// ---------------------------------------------------------------------------
// POST /api/download — kòmanse yon travay telechajman, retounen jobId imedyatman
// GET  /api/download/status/:jobId — swiv pwogrè a (poll chak segond)
// ---------------------------------------------------------------------------
app.post('/api/download', async (req, res) => {
  const { url, quality = 'best', format = 'mp4' } = req.body || {};

  if (!url || !url.trim()) {
    return res.status(400).json({ error: 'Tanpri bay yon lyen' });
  }

  const hasYtDlp = await checkYtDlp();
  if (!hasYtDlp) {
    return res.status(500).json({
      error: 'yt-dlp pa enstale. Kòmand: pip install -U yt-dlp',
      needsInstall: true,
    });
  }

  const jobId = createJob();
  res.json({ success: true, jobId });

  // Lanse telechajman an background, pa bloke repons lan
  runDownloadJob(jobId, url.trim(), quality, format).catch(err => {
    const job = jobs.get(jobId);
    if (job) {
      job.status = 'error';
      job.error = err.message || 'Erè pandan telechajman';
    }
  });
});

async function runDownloadJob(jobId, url, quality, format) {
  const job = jobs.get(jobId);
  job.status = 'running';

  const qualityMap = {
    best: 'bestvideo+bestaudio/best',
    high: 'bestvideo[height<=1080]+bestaudio/best[height<=1080]',
    medium: 'bestvideo[height<=720]+bestaudio/best[height<=720]',
    low: 'bestvideo[height<=480]+bestaudio/best[height<=480]',
  };

  // Pran info videyo a dabò pou konstwi non fichye a
  let videoInfo;
  try {
    const { stdout } = await execPromise(`yt-dlp --no-playlist --skip-download --dump-json "${url}"`, {
      timeout: 30000,
      maxBuffer: 1024 * 1024 * 10,
    });
    videoInfo = JSON.parse(stdout);
  } catch {
    job.status = 'error';
    job.error = 'Nou pa ka jwenn enfòmasyon sou videyo sa a.';
    return;
  }

  const sanitizedTitle = (videoInfo.title || 'videyo').replace(/[^\w\s-]/g, '').trim().substring(0, 60) || 'videyo';
  const filename = `${sanitizedTitle}-${Date.now()}.${format}`;
  const outputPath = path.join('downloads', filename);

  const args = ['--no-playlist'];
  if (format === 'mp3') {
    args.push('--extract-audio', '--audio-format', 'mp3');
  } else {
    args.push('-f', qualityMap[quality] || qualityMap.best, '--merge-output-format', format);
  }
  args.push('--newline', '-o', outputPath, url);

  await new Promise((resolve, reject) => {
    const proc = spawn('yt-dlp', args);
    let lastError = '';

    proc.stdout.on('data', chunk => {
      const line = chunk.toString();
      const match = line.match(/\[download\]\s+(\d+(?:\.\d+)?)%/);
      if (match) {
        job.progress = Math.round(parseFloat(match[1]));
      }
    });

    proc.stderr.on('data', chunk => {
      lastError += chunk.toString();
    });

    proc.on('close', code => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(lastError.split('\n').filter(Boolean).pop() || `yt-dlp fini ak kòd erè ${code}`));
      }
    });

    proc.on('error', reject);

    // Kwape pwosesis la si li pran twòp tan
    setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error('Telechajman an pran twòp tan (limit: 5 minit)'));
    }, 5 * 60 * 1000);
  });

  if (!fs.existsSync(outputPath)) {
    // Fòma final la ka gen ekstansyon diferan (egz. mp3 apre ekstraksyon)
    const dirFiles = fs.readdirSync('downloads');
    const match = dirFiles.find(f => f.startsWith(`${sanitizedTitle}-`));
    if (!match) {
      job.status = 'error';
      job.error = 'Fichye telechaje a pa jwenn apre operasyon an.';
      return;
    }
    finishJob(job, match, videoInfo);
    return;
  }

  finishJob(job, filename, videoInfo);
}

function finishJob(job, filename, videoInfo) {
  const stats = fs.statSync(path.join('downloads', filename));
  job.status = 'done';
  job.progress = 100;
  job.result = {
    success: true,
    filename,
    title: videoInfo.title || filename,
    downloadUrl: `/downloads/${filename}`,
    size: stats.size,
    duration: videoInfo.duration || null,
  };
}

app.get('/api/download/status/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Travay sa a pa jwenn oswa li ekspire' });
  res.json(job);
});

// ---------------------------------------------------------------------------
// GET /api/search — rechèch REYÈL sou YouTube atravè yt-dlp (ytsearch), san
// okenn done envante
// ---------------------------------------------------------------------------
app.post('/api/search', async (req, res) => {
  const { query, limit = 8 } = req.body || {};

  if (!query || !query.trim()) {
    return res.status(400).json({ error: 'Tanpri bay yon rechèch' });
  }

  const hasYtDlp = await checkYtDlp();
  if (!hasYtDlp) {
    return res.status(500).json({ error: 'yt-dlp pa enstale. Kòmand: pip install -U yt-dlp' });
  }

  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 8, 1), 20);
  const safeQuery = query.trim().replace(/"/g, '');

  try {
    const { stdout } = await execPromise(
      `yt-dlp "ytsearch${safeLimit}:${safeQuery}" --flat-playlist --dump-json`,
      { timeout: 30000, maxBuffer: 1024 * 1024 * 10 }
    );

    const results = stdout
      .split('\n')
      .filter(Boolean)
      .map(line => {
        try {
          const item = JSON.parse(line);
          return {
            title: item.title || 'San tit',
            channel: item.uploader || item.channel || 'Enkoni',
            duration: formatDurationSeconds(item.duration),
            views: formatViews(item.view_count),
            videoId: item.id,
            thumbnail: item.thumbnails?.[0]?.url || `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`,
            url: `https://www.youtube.com/watch?v=${item.id}`,
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    res.json({ results });
  } catch (error) {
    console.error('Erè rechèch:', error.message);
    res.status(500).json({ error: 'Pwoblèm pandan rechèch la. Eseye ankò.' });
  }
});

function formatDurationSeconds(seconds) {
  if (!seconds && seconds !== 0) return null;
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatViews(count) {
  if (!count && count !== 0) return null;
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return `${count}`;
}

// ---------------------------------------------------------------------------
// Efase fichye apre telechajman
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Paj yo ak health check
// ---------------------------------------------------------------------------
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/search', (req, res) => res.sendFile(path.join(__dirname, 'public', 'search.html')));

app.get('/health', async (req, res) => {
  const hasYtDlp = await checkYtDlp();
  res.json({ status: 'ok', ytDlp: hasYtDlp });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('✅ Sèvè ap kouri sou: http://localhost:' + PORT);
  console.log('📁 Downloads: ./downloads/');
  checkYtDlp().then(has => {
    console.log('🎥 yt-dlp:', has ? 'OK' : 'PA ENSTALE — kòmand: pip install -U yt-dlp');
  });
});

module.exports = app;
 
