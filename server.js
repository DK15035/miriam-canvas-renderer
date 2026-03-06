const express = require('express');
const { createCanvas, loadImage, registerFont } = require('canvas');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json({ limit: '50mb' }));

const FONTS_DIR = path.join(__dirname, 'fonts');
const W = 1080;
const H = 1920;

async function setupFonts() {
  if (!fs.existsSync(FONTS_DIR)) fs.mkdirSync(FONTS_DIR);
  const fonts = [
    { name: 'Lora', file: 'Lora-Regular.ttf', url: 'https://github.com/google/fonts/raw/main/ofl/lora/Lora%5Bwght%5D.ttf' },
    { name: 'Playfair', file: 'Playfair-Regular.ttf', url: 'https://github.com/google/fonts/raw/main/ofl/playfairdisplay/PlayfairDisplay%5Bwght%5D.ttf' }
  ];
  for (const font of fonts) {
    const fontPath = path.join(FONTS_DIR, font.file);
    if (!fs.existsSync(fontPath)) {
      try {
        const res = await axios.get(font.url, { responseType: 'arraybuffer', timeout: 15000 });
        fs.writeFileSync(fontPath, Buffer.from(res.data));
        console.log('Downloaded:', font.name);
      } catch (e) { console.warn('Font download failed:', font.name, e.message); continue; }
    }
    try { registerFont(fontPath, { family: font.name }); console.log('Registered:', font.name); }
    catch (e) { console.warn('Font register failed:', font.name, e.message); }
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let current = '';
  for (const word of words) {
    const test = current ? current + ' ' + word : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function drawParchment(ctx) {
  ctx.fillStyle = '#F0E6C8';
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 20000; i++) {
    const x = Math.random() * W;
    const y = Math.random() * H;
    ctx.fillStyle = 'rgba(80,45,5,' + (Math.random() * 0.05).toFixed(3) + ')';
    ctx.fillRect(x, y, 1.5, 1.5);
  }
  const vig = ctx.createRadialGradient(W/2, H/2, H*0.3, W/2, H/2, H*0.82);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(40,20,5,0.22)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);
}

async function renderSlide(text, bgImage) {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // 1. Clean parchment base — this is the background, NOT the AI image
  drawParchment(ctx);

  // 2. Portrait box bottom-right — AI sketch cropped here only
  const PW = 360;
  const PH = 400;
  const PX = W - PW - 50;
  const PY = H - PH - 60;

  ctx.save();
  roundRect(ctx, PX, PY, PW, PH, 16);
  ctx.clip();
  ctx.drawImage(bgImage, 0, 0, bgImage.width, bgImage.height, PX, PY, PW, PH);
  ctx.restore();

  // Thin border around portrait
  ctx.strokeStyle = 'rgba(120, 80, 30, 0.5)';
  ctx.lineWidth = 2;
  roundRect(ctx, PX, PY, PW, PH, 16);
  ctx.stroke();

  // 3. Render dialogue text — top-left, well within bounds
  const MARGIN = 72;
  const TEXT_MAX_W = W - MARGIN * 2;
  const TEXT_START_Y = 110;
  const TEXT_END_Y = PY - 60; // stop well above portrait
  let curY = TEXT_START_Y;

  const paragraphs = text.split('\n');

  for (const para of paragraphs) {
    if (curY >= TEXT_END_Y) break;

    if (para.trim() === '') {
      curY += 40;
      continue;
    }

    // Detect "Miriam:" or "Ruth:" speaker label
    const speakerMatch = para.match(/^(Miriam|Ruth):\s*/i);

    if (speakerMatch) {
      const speaker = speakerMatch[1].toUpperCase();
      const dialogue = para.slice(speakerMatch[0].length);

      // Speaker name
      ctx.font = 'bold 40px "Lora"';
      ctx.fillStyle = '#7A3B0A';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(speaker, MARGIN, curY);
      curY += 56;

      // Dialogue text
      ctx.font = 'italic 58px "Lora"';
      ctx.fillStyle = '#1A0F06';
      const lines = wrapText(ctx, dialogue, TEXT_MAX_W);
      for (const line of lines) {
        if (curY >= TEXT_END_Y) break;
        ctx.fillText(line, MARGIN, curY);
        curY += 80;
      }
      curY += 20;
    } else {
      ctx.font = 'italic 58px "Lora"';
      ctx.fillStyle = '#1A0F06';
      const lines = wrapText(ctx, para, TEXT_MAX_W);
      for (const line of lines) {
        if (curY >= TEXT_END_Y) break;
        ctx.fillText(line, MARGIN, curY);
        curY += 80;
      }
    }
  }

  // 4. Footer
  ctx.font = '26px "Lora"';
  ctx.fillStyle = 'rgba(100, 65, 20, 0.55)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText('— Madame Miriam —', W / 2, H - 24);

  return canvas.toBuffer('image/jpeg', { quality: 0.93 });
}

async function uploadToImgbb(base64, apiKey) {
  const params = new URLSearchParams();
  params.append('image', base64);
  const response = await axios.post(
    'https://api.imgbb.com/1/upload?key=' + apiKey,
    params,
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 20000 }
  );
  if (!response.data?.data?.url) throw new Error('imgbb upload failed: ' + JSON.stringify(response.data));
  return response.data.data.url;
}

app.post('/render', async (req, res) => {
  try {
    const { backgroundUrl, slides, imgbbKey } = req.body;
    if (!backgroundUrl) return res.status(400).json({ error: 'backgroundUrl required' });
    if (!slides || !slides.length) return res.status(400).json({ error: 'slides required' });
    if (!imgbbKey) return res.status(400).json({ error: 'imgbbKey required' });

    console.log('Fetching background image...');
    const bgRes = await axios.get(backgroundUrl, { responseType: 'arraybuffer', timeout: 15000 });
    const bgImage = await loadImage(Buffer.from(bgRes.data));
    console.log('Background loaded:', bgImage.width, 'x', bgImage.height);

    const imageUrls = [];
    for (let i = 0; i < slides.length; i++) {
      console.log('Rendering slide', i + 1, '/', slides.length);
      const buf = await renderSlide(slides[i].text, bgImage);
      const base64 = buf.toString('base64');
      const url = await uploadToImgbb(base64, imgbbKey);
      console.log('Slide', i + 1, 'uploaded:', url);
      imageUrls.push(url);
    }

    res.json({ success: true, imageUrls });
  } catch (err) {
    console.error('Render error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/', (req, res) => res.json({ status: 'ok', service: 'Madame Miriam Canvas Renderer v3', version: '3.0.0' }));

const PORT = process.env.PORT || 3000;
setupFonts().then(() => {
  app.listen(PORT, () => console.log('Canvas renderer running on port ' + PORT));
});
