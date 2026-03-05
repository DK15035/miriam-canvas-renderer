const express = require('express');
const { createCanvas, loadImage, registerFont } = require('canvas');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json({ limit: '50mb' }));

const FONTS_DIR = path.join(__dirname, 'fonts');

async function setupFonts() {
  if (!fs.existsSync(FONTS_DIR)) fs.mkdirSync(FONTS_DIR);

  const fonts = [
    {
      name: 'Lora',
      file: 'Lora-Regular.ttf',
      url: 'https://github.com/google/fonts/raw/main/ofl/lora/Lora%5Bwght%5D.ttf'
    },
    {
      name: 'Playfair',
      file: 'Playfair-Regular.ttf',
      url: 'https://github.com/google/fonts/raw/main/ofl/playfairdisplay/PlayfairDisplay%5Bwght%5D.ttf'
    }
  ];

  for (const font of fonts) {
    const fontPath = path.join(FONTS_DIR, font.file);
    if (!fs.existsSync(fontPath)) {
      console.log(`Downloading font: ${font.name}...`);
      try {
        const response = await axios.get(font.url, { responseType: 'arraybuffer', timeout: 15000 });
        fs.writeFileSync(fontPath, Buffer.from(response.data));
        console.log(`Downloaded: ${font.name}`);
      } catch (e) {
        console.warn(`Failed to download ${font.name}:`, e.message);
        continue;
      }
    }
    try {
      registerFont(fontPath, { family: font.name });
      console.log(`Registered font: ${font.name}`);
    } catch (e) {
      console.warn(`Failed to register ${font.name}:`, e.message);
    }
  }
}

app.post('/render', async (req, res) => {
  try {
    const { backgroundUrl, slides, imgbbKey } = req.body;
    if (!backgroundUrl) return res.status(400).json({ error: 'backgroundUrl required' });
    if (!slides || !slides.length) return res.status(400).json({ error: 'slides required' });
    if (!imgbbKey) return res.status(400).json({ error: 'imgbbKey required' });

    const bgResponse = await axios.get(backgroundUrl, { responseType: 'arraybuffer', timeout: 15000 });
    const bgImage = await loadImage(Buffer.from(bgResponse.data));

    const W = bgImage.width;
    const H = bgImage.height;
    const imageUrls = [];

    for (const slide of slides) {
      const canvas = createCanvas(W, H);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bgImage, 0, 0, W, H);

      const fontSize = slide.fontSize || 52;
      const fontFamily = slide.fontFamily || 'Lora';
      const fontWeight = slide.fontWeight || 'normal';
      ctx.font = `${fontWeight} ${fontSize}px "${fontFamily}"`;
      ctx.fillStyle = slide.color || '#2C1810';
      ctx.textAlign = slide.align || 'left';
      ctx.textBaseline = 'top';

      const maxWidth = slide.maxWidth || (W - slide.x - 80);
      const lineHeight = fontSize * (slide.lineHeight || 1.5);
      const lines = wrapText(ctx, slide.text, maxWidth);

      lines.forEach((line, i) => {
        ctx.fillText(line, slide.x, slide.y + i * lineHeight);
      });

      const base64 = canvas.toBuffer('image/jpeg', { quality: 0.93 }).toString('base64');
      const url = await uploadToImgbb(base64, imgbbKey);
      imageUrls.push(url);
    }

    res.json({ success: true, imageUrls });
  } catch (err) {
    console.error('Render error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

function wrapText(ctx, text, maxWidth) {
  const paragraphs = text.split('\n');
  const lines = [];
  for (const para of paragraphs) {
    if (para.trim() === '') { lines.push(''); continue; }
    const words = para.split(' ');
    let current = '';
    for (const word of words) {
      const test = current ? `${current} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

async function uploadToImgbb(base64, apiKey) {
  const params = new URLSearchParams();
  params.append('image', base64);
  const response = await axios.post(
    `https://api.imgbb.com/1/upload?key=${apiKey}`,
    params,
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  if (!response.data?.data?.url) throw new Error('imgbb upload failed: ' + JSON.stringify(response.data));
  return response.data.data.url;
}

app.get('/', (req, res) => res.json({ status: 'ok', service: 'Madame Miriam Canvas Renderer v2' }));

const PORT = process.env.PORT || 3000;
setupFonts().then(() => {
  app.listen(PORT, () => console.log(`Canvas renderer running on port ${PORT}`));
});
