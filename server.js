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

// Idantifye platfòm nan sèlman ak non domèn lan (pa mande yt-dlp), pou nou ka
// bay yon mesaj erè espesifik pou chak platfòm menm lè yt-dlp echwe.
function detectPlatformFromUrl(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes('youtube.com') || host.includes('youtu.be')) return 'YouTube';
    if (host.includes('facebook.com') || host.includes('fb.watch')) return 'Facebook';
    if (host.includes('instagram.com')) return 'Instagram';
    if (host.includes('tiktok.com')) return 'TikTok';
    if (host.includes('twitter.com') || host.includes('x.com')) return 'Twitter/X';
    if (host.includes('vimeo.com')) return 'Vimeo';
    if (host.includes('dailymotion.com')) return 'Dailymotion';
    return null;
  } catch {
    return null;
  }
}

// Mesaj erè espesifik pa platfòm, selon sa yt-dlp reponn ak sa nou konnen sou
// restriksyon chak platfòm (koneksyon obligatwa, kontni prive, elatriye).
function buildErrorMessage(platform, rawError) {
  const err = (rawError || '').toLowerCase();
  const needsLogin = err.includes('login') || err.includes('cookies') || err.includes('rate-limit')
    || err.includes('private') || err.includes('sign in') || err.includes('403') || err.includes('unable to extract');

  const messages = {
    'Facebook': needsLogin
      ? 'Videyo Facebook sa a mande koneksyon oswa li prive/Reel ki pwoteje. Facebook bloke souvan aksè otomatik pou kontni sa yo.'
      : 'Nou pa ka jwenn videyo Facebook sa a. Verifye lyen an oswa eseye retire paramèt anplis nan URL la (tout sa ki apre "?").',
    'Instagram': needsLogin
      ? 'Kontni Instagram sa a mande koneksyon (kont prive, Reel restren, oswa istwa). Instagram bloke aksè san idantifyan pou kontni sa yo.'
      : 'Nou pa ka jwenn kontni Instagram sa a. Li ka efase oswa lyen an pa kòrèk.',
    'TikTok': needsLogin
      ? 'Videyo TikTok sa a mande koneksyon oswa li rejyonal/restren.'
      : 'Nou pa ka jwenn videyo TikTok sa a. Verifye lyen an ankò.',
    'Twitter/X': needsLogin
      ? 'Videyo sa a sou X/Twitter mande koneksyon pou wè l (kont prive oswa restriksyon).'
      : 'Nou pa ka jwenn videyo sa a sou X/Twitter. Verifye lyen an.',
    'YouTube': needsLogin
      ? 'Videyo YouTube sa a mande koneksyon (kontni pou granmoun, prive, oswa restriksyon rejyonal).'
      : 'Nou pa ka jwenn videyo YouTube sa a. Li ka prive, efase, oswa rejyon w bloke.',
    'Vimeo': 'Nou pa ka jwenn videyo Vimeo sa a. Li ka prive oswa mande yon modpas.',
    'Dailymotion': 'Nou pa ka jwenn videyo Dailymotion sa a. Verifye lyen an.',
  };

  if (platform && messages[platform]) return messages[platform];
  if (platform) return `Nou pa ka jwenn kontni sa a sou ${platform}. Li ka prive oswa lyen an pa kòrèk.`;
  return 'Nou pa rekonèt platfòm lyen sa a, oswa li pa sipòte.';
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
  const trimmedUrl = url.trim();
  const urlPlatform = detectPlatformFromUrl(trimmedUrl);

  if (!isSupportedUrl(trimmedUrl)) {
    return res.status(400).json({ isValid: false, reason: 'Lyen sa a pa gen fòma URL ki valid' });
  }
  if (!urlPlatform) {
    return res.json({ isValid: false, platform: null, reason: buildErrorMessage(null) });
  }

  const hasYtDlp = await checkYtDlp();
  if (!hasYtDlp) {
    return res.status(500).json({
      isValid: false,
      platform: urlPlatform,
      reason: 'yt-dlp pa enstale sou sèvè a. Kòmand pou enstale l: pip install -U yt-dlp',
    });
  }

  try {
    const { stdout } = await execPromise(
      `yt-dlp --no-playlist --skip-download --dump-json "${trimmedUrl}"`,
      { timeout: 30000, maxBuffer: 1024 * 1024 * 10 }
    );
    const info = JSON.parse(stdout);

    return res.json({
      isValid: true,
      platform: detectPlatform(info.extractor_key || info.extractor, trimmedUrl) || urlPlatform,
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
      platform: urlPlatform,
      reason: buildErrorMessage(urlPlatform, error.message),
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
      job.error = buildErrorMessage(job.platform || detectPlatformFromUrl(url.trim()), err.message);
    }
  });
});

async function runDownloadJob(jobId, url, quality, format) {
  const job = jobs.get(jobId);
  job.status = 'running';
  const urlPlatform = detectPlatformFromUrl(url);

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
  } catch (error) {
    job.status = 'error';
    job.platform = urlPlatform;
    job.error = buildErrorMessage(urlPlatform, error.message);
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
        const rawMsg = lastError.split('\n').filter(Boolean).pop() || `yt-dlp fini ak kòd erè ${code}`;
        job.platform = urlPlatform;
        reject(new Error(rawMsg));
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
