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
    try { registerFont(fontPath, { family: font.name }); }
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
  // Warm cream base
  ctx.fillStyle = '#F0E6C8';
  ctx.fillRect(0, 0, W, H);

  // Subtle grain
  for (let i = 0; i < 20000; i++) {
    const x = Math.random() * W;
    const y = Math.random() * H;
    ctx.fillStyle = `rgba(80,45,5,${(Math.random() * 0.05).toFixed(3)})`;
    ctx.fillRect(x, y, 1.5, 1.5);
  }

  // Soft edge darkening
  const vig = ctx.createRadialGradient(W/2, H/2, H*0.3, W/2, H/2, H*0.82);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(40,20,5,0.25)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);
}

async function renderSlide(text, bgImage) {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // 1. Clean parchment background
  drawParchment(ctx);

  // 2. Portrait box - bottom right corner - shows AI image
  const PW = 340;
  const PH = 380;
  const PX = W - PW - 55;
  const PY = H - PH - 70;

  ctx.save();
  roundRect(ctx, PX, PY, PW, PH, 20);
  ctx.clip();
  // Crop the bottom-right quadrant of the AI image where Ruth & Miriam are
  ctx.drawImage(bgImage, bgImage.width * 0.4, bgImage.height * 0.45, bgImage.width * 0.6, bgImage.height * 0.55, PX, PY, PW, PH);
  ctx.restore();

  // Portrait border
  ctx.strokeStyle = 'rgba(140, 90, 35, 0.6)';
  ctx.lineWidth = 3;
  roundRect(ctx, PX, PY, PW, PH, 20);
  ctx.stroke();

  // 3. Text area - center of card
  const TX = 70;
  const TY = 100;
  const TW = W - 140;
  const TH = PY - TY - 60; // stops above the portrait

  // Parse dialogue lines
  const paragraphs = text.split('\n');
  let curY = TY + 40;
  const lineGap = 12;

  for (const para of paragraphs) {
    if (para.trim() === '') {
      curY += 36;
      continue;
    }

    const speakerMatch = para.match(/^(Miriam|Ruth):\s*/i);

    if (speakerMatch) {
      const speaker = speakerMatch[1].toUpperCase();
      const dialogue = para.slice(speakerMatch[0].length);

      // Speaker label
      ctx.font = 'bold 38px "Lora"';
      ctx.fillStyle = '#8B4A10';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(speaker, TX, curY);
      curY += 52;

      // Dialogue
      ctx.font = 'italic 52px "Lora"';
      ctx.fillStyle = '#1E1208';
      const lines = wrapText(ctx, dialogue, TW);
      for (const line of lines) {
        if (curY > TY + TH) break;
        ctx.fillText(line, TX, curY);
        curY += 52 * 1.45 + lineGap;
      }
      curY += 10;
    } else {
      ctx.font = 'italic 52px "Lora"';
      ctx.fillStyle = '#1E1208';
      const lines = wrapText(ctx, para, TW);
      for (const line of lines) {
        if (curY > TY + TH) break;
        ctx.fillText(line, TX, curY);
        curY += 52 * 1.45 + lineGap;
      }
    }
  }

  // 4. Footer brand
  ctx.font = '28px "Lora"';
  ctx.fillStyle = 'rgba(100, 65, 20, 0.6)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText('— Madame Miriam —', W / 2, H - 30);

  return canvas.toBuffer('image/jpeg', { quality: 0.93 });
}

async function uploadToImgbb(base64, apiKey) {
  const params = new URLSearchParams();
  params.append('image', base64);
  const response = await axios.post(
    `https://api.imgbb.com/1/upload?key=${apiKey}`,
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

    const bgRes = await axios.get(backgroundUrl, { responseType: 'arraybuffer', timeout: 15000 });
    const bgImage = await loadImage(Buffer.from(bgRes.data));

    const imageUrls = [];
    for (const slide of slides) {
      const buf = await renderSlide(slide.text, bgImage);
      const base64 = buf.toString('base64');
      const url = await uploadToImgbb(base64, imgbbKey);
      imageUrls.push(url);
    }

    res.json({ success: true, imageUrls });
  } catch (err) {
    console.error('Render error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/', (req, res) => res.json({ status: 'ok', service: 'Madame Miriam Canvas Renderer v3' }));

const PORT = process.env.PORT || 3000;
setupFonts().then(() => {
  app.listen(PORT, () => console.log(`Canvas renderer running on port ${PORT}`));
});
