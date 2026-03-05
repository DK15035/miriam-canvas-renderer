const express = require('express');
const { createCanvas, loadImage } = require('canvas');
const axios = require('axios');

const app = express();
app.use(express.json({ limit: '50mb' }));

// ─────────────────────────────────────────────
// POST /render
// Body: { backgroundUrl, slides[], imgbbKey }
// Slide: { text, x, y, fontSize, align, maxWidth, color, lineHeight, fontWeight }
// Returns: { success, imageUrls[] }
// ─────────────────────────────────────────────
app.post('/render', async (req, res) => {
  try {
    const { backgroundUrl, slides, imgbbKey } = req.body;

    if (!backgroundUrl) return res.status(400).json({ error: 'backgroundUrl required' });
    if (!slides || !slides.length) return res.status(400).json({ error: 'slides required' });
    if (!imgbbKey) return res.status(400).json({ error: 'imgbbKey required' });

    // Download background
    const bgResponse = await axios.get(backgroundUrl, { responseType: 'arraybuffer' });
    const bgImage = await loadImage(Buffer.from(bgResponse.data));

    const W = bgImage.width;
    const H = bgImage.height;
    const imageUrls = [];

    for (const slide of slides) {
      const canvas = createCanvas(W, H);
      const ctx = canvas.getContext('2d');

      // Draw background
      ctx.drawImage(bgImage, 0, 0, W, H);

      // Font setup
      const fontSize = slide.fontSize || 52;
      const fontWeight = slide.fontWeight || 'normal';
      ctx.font = `${fontWeight} ${fontSize}px Georgia`;
      ctx.fillStyle = slide.color || '#2C1810';
      ctx.textAlign = slide.align || 'left';
      ctx.textBaseline = 'top';

      // Optional: semi-transparent text background for readability
      // (disabled by default, enable per slide with slide.textBg: true)
      const maxWidth = slide.maxWidth || W - slide.x - 80;
      const lineHeight = fontSize * (slide.lineHeight || 1.5);
      const lines = wrapText(ctx, slide.text, maxWidth);

      if (slide.textBg) {
        const padding = 20;
        const blockH = lines.length * lineHeight + padding * 2;
        const blockW = maxWidth + padding * 2;
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.fillRect(slide.x - padding, slide.y - padding, blockW, blockH);
        ctx.fillStyle = slide.color || '#2C1810';
      }

      lines.forEach((line, i) => {
        ctx.fillText(line, slide.x, slide.y + i * lineHeight);
      });

      // Convert to base64 and upload to imgbb
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

// ─────────────────────────────────────────────
// Word wrap utility — respects \n line breaks
// ─────────────────────────────────────────────
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

// ─────────────────────────────────────────────
// Upload base64 image to imgbb, return URL
// ─────────────────────────────────────────────
async function uploadToImgbb(base64, apiKey) {
  const params = new URLSearchParams();
  params.append('image', base64);

  const response = await axios.post(
    `https://api.imgbb.com/1/upload?key=${apiKey}`,
    params,
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  if (!response.data?.data?.url) {
    throw new Error('imgbb upload failed: ' + JSON.stringify(response.data));
  }

  return response.data.data.url;
}

// Health check
app.get('/', (req, res) => res.json({ status: 'ok', service: 'Madame Miriam Canvas Renderer' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Canvas renderer running on port ${PORT}`));
