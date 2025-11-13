# 🎬 Telechajè Videyo & Rechèch Mizik

Aplikasyon web pou telechaje videyo ak chache mizik avèk Claude AI & yt-dlp.

## ✨ Karakteristik

- 🎥 **Telechaje Videyo** - YouTube, Facebook, Instagram, TikTok, Twitter, Vimeo
- 🎵 **Rechèch Mizik** - Chache mizik pa non atis, tit oswa mo kle
- 🤖 **Claude AI** - Analize videyo ak chache mizik entèlijan
- 📱 **Responsive** - Fonksyone sou telefòn ak òdinatè
- 🌍 **Kreyòl Ayisyen** - Entèfas nan lang kreyòl

## 📋 Kondisyon (Prerequisites)

- **Node.js** 18 oswa pi wo
- **yt-dlp** - Pou telechaje videyo
- **Claude API Key** - Pou itilize Claude AI

## 🚀 Enstalasyon

### 1. Klone Repository a

```bash
git clone <your-repo-url>
cd video-downloader-claude
```

### 2. Enstale Dependencies

```bash
npm install
```

### 3. Enstale yt-dlp

**Windows:**
```bash
# Avèk Chocolatey
choco install yt-dlp

# Oswa telechaje dirèkteman
# Vizite: https://github.com/yt-dlp/yt-dlp/releases
```

**Mac:**
```bash
brew install yt-dlp
```

**Linux:**
```bash
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
sudo chmod a+rx /usr/local/bin/yt-dlp
```

**Oswa ak pip:**
```bash
pip install yt-dlp
```

### 4. Konfigire API Key

Kreye yon fichye `.env` nan direktwa rasin lan:

```bash
cp .env.example .env
```

Modifye `.env` epi ajoute Claude API key ou:

```
ANTHROPIC_API_KEY=sk-ant-your-api-key-here
PORT=3000
```

**Kijan pou jwenn Claude API Key:**
1. Ale sou https://console.anthropic.com/
2. Kreye yon kont oswa konekte
3. Ale nan "Settings" → "API Keys"
4. Kreye yon nouvo key
5. Kopye key la epi mete li nan `.env`

### 5. Kreye Folder yo

```bash
mkdir public downloads
```

### 6. Mete Fichye HTML yo

Mete fichye sa yo nan folder `public/`:
- `index.html` - Paj telechajman
- `search.html` - Paj rechèch

## ▶️ Kòmanse Sèvè a

**Mode Devlopman:**
```bash
npm run dev
```

**Mode Pwodiksyon:**
```bash
npm start
```

Sèvè a ap kouri sou: **http://localhost:3000**

## 📁 Estrikti Pwojè

```
video-downloader-claude/
├── server.js           # Backend Node.js
├── package.json        # Dependencies
├── .env               # Konfigirasyon (pa pataje sa!)
├── .env.example       # Egzanp konfigirasyon
├── README.md          # Dokimantasyon sa a
├── public/            # Fichye frontend
│   ├── index.html     # Paj telechajman
│   └── search.html    # Paj rechèch
└── downloads/         # Videyo telechaje yo
```

## 🎯 Kijan pou Itilize

### Telechaje Videyo

1. Ouvri http://localhost:3000
2. Kopye lyen yon videyo (YouTube, Facebook, etc.)
3. Kole lyen an epi klike "Analize"
4. Chwazi kalite ak fòma
5. Klike "Telechaje Kounye a"
6. Videyo a pral telechaje nan folder `downloads/`

### Chache Mizik

1. Ouvri http://localhost:3000/search
2. Tape non atis, tit mizik oswa mo kle
3. Klike "Chache"
4. Rezilta yo pral parèt
5. Klike "Telechaje" sou videyo ou vle a

## 🔧 API Endpoints

### POST /api/analyze
Analize yon lyen videyo

**Request:**
```json
{
  "url": "https://www.youtube.com/watch?v=..."
}
```

**Response:**
```json
{
  "platform": "YouTube",
  "isValid": true,
  "videoId": "...",
  "title": "...",
  "canDownload": true
}
```

### POST /api/download
Telechaje yon videyo

**Request:**
```json
{
  "url": "https://www.youtube.com/watch?v=...",
  "quality": "best",
  "format": "mp4"
}
```

**Response:**
```json
{
  "success": true,
  "filename": "...",
  "title": "...",
  "downloadUrl": "/downloads/...",
  "size": 12345678,
  "duration": 180
}
```

### POST /api/search
Chache videyo mizik

**Request:**
```json
{
  "query": "Alan Cave"
}
```

**Response:**
```json
{
  "results": [
    {
      "title": "...",
      "channel": "...",
      "duration": "3:45",
      "views": "1.2M",
      "videoId": "..."
    }
  ]
}
```

## ⚠️ Pwoblèm Komen

### "yt-dlp pa enstale"

**Solisyon:**
```bash
pip install yt-dlp
# Oswa
npm install -g yt-dlp
```

Verifye enstalasyon:
```bash
yt-dlp --version
```

### "ANTHROPIC_API_KEY pa defini"

**Solisyon:**
- Asire w kreye fichye `.env`
- Verifye w mete API key a kòrèkteman
- Pa gen espas anvan oswa apre key la

### "Port 3000 deja itilize"

**Solisyon:**
Chanje port lan nan `.env`:
```
PORT=3001
```

### Telechajman twò long

**Solisyon:**
- Chwazi kalite pi ba (720p oswa 480p)
- Verifye koneksyon entènèt ou
- Kèk videyo gwo anpil

## 🌐 Platfòm Sipòte

- ✅ YouTube
- ✅ Facebook
- ✅ Instagram
- ✅ TikTok
- ✅ Twitter (X)
- ✅ Vimeo
- ✅ Dailymotion
- ✅ Anpil lòt... (1000+ sites)

## 📝 Nòt

- **Dwa Otè:** Respekte dwa otè yo. Sèlman itilize pou itilizasyon pèsonèl.
- **Limit API:** Claude API gen limit. Gade plan ou.
- **Gwosè Fichye:** Videyo yo ka gwo. Asire w gen espas.
- **Timeout:** Telechajman long gen 5 minit timeout.

## 🔐 Sekirite

- Pa pataje fichye `.env` ou
- Pa upload `.env` sou GitHub
- Pwoteje Claude API key ou
- Itilize HTTPS pou pwodiksyon

## 📞 Sipò

Si w gen pwoblèm:
1. Verifye limit API key ou
2. Gade si yt-dlp enstale kòrèkteman
3. Tcheke konsol pou erè
4. Verifye lyen videyo a valid

## 📄 Lisans

MIT License - Itilize lib!

---

**Fèt avèk ❤️ an Ayiti 🇭🇹**
