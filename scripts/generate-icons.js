const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PUBLIC_DIR = path.join(__dirname, '../public');

// 1. Write public/icon.svg
const svgContent = `<svg 
  viewBox="0 0 100 100" 
  fill="none" 
  xmlns="http://www.w3.org/2000/svg" 
  width="100%"
  height="100%"
>
  <defs>
    <linearGradient id="emeraldMainCircle-icon" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#a7f3d0" />
      <stop offset="40%" stop-color="#34d399" />
      <stop offset="75%" stop-color="#059669" />
      <stop offset="100%" stop-color="#047857" />
    </linearGradient>

    <linearGradient id="emeraldDarkCircle-icon" x1="100%" y1="100%" x2="0%" y2="0%">
      <stop offset="0%" stop-color="#064e3b" />
      <stop offset="50%" stop-color="#047857" />
      <stop offset="100%" stop-color="#059669" />
    </linearGradient>

    <linearGradient id="jadeHighlightCircle-icon" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.95" />
      <stop offset="50%" stop-color="#e6fbf4" stop-opacity="0.5" />
      <stop offset="100%" stop-color="#34d399" stop-opacity="0" />
    </linearGradient>
    
    <filter id="emeraldGlowCircle-icon" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="2.5" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>

  <rect width="100" height="100" fill="#09090b" />

  <circle 
    cx="50" 
    cy="50" 
    r="32" 
    stroke="url(#emeraldDarkCircle-icon)" 
    stroke-width="16" 
    opacity="0.95"
  />

  <path 
    d="M 18 50 A 32 32 0 1 1 82 50 A 32 32 0 0 1 18 50" 
    stroke="url(#emeraldMainCircle-icon)" 
    stroke-width="15" 
    stroke-linecap="round"
    filter="url(#emeraldGlowCircle-icon)"
  />

  <path 
    d="M 22 36 A 32 32 0 0 1 78 36" 
    stroke="url(#jadeHighlightCircle-icon)" 
    stroke-width="5" 
    stroke-linecap="round"
  />
</svg>`;

if (!fs.existsSync(PUBLIC_DIR)) {
  fs.mkdirSync(PUBLIC_DIR, { recursive: true });
}
fs.writeFileSync(path.join(PUBLIC_DIR, 'icon.svg'), svgContent);
console.log('✓ Created public/icon.svg');

// 2. Generate PNGs using Headless Chrome
const sizes = [
  { size: 180, name: 'apple-touch-icon.png' },
  { size: 192, name: 'icon-192.png' },
  { size: 512, name: 'icon-512.png' }
];

const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

sizes.forEach(({ size, name }) => {
  const tempHtmlPath = path.join(PUBLIC_DIR, `temp-${size}.html`);
  const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #09090b;
      width: ${size}px;
      height: ${size}px;
      overflow: hidden;
      display: flex;
      justify-content: center;
      align-items: center;
    }
    svg {
      width: ${size}px;
      height: ${size}px;
    }
  </style>
</head>
<body>
  ${svgContent}
</body>
</html>`;

  fs.writeFileSync(tempHtmlPath, htmlContent);

  const outputPath = path.join(PUBLIC_DIR, name);
  try {
    execSync(`"${chromePath}" --headless --disable-gpu --screenshot="${outputPath}" --window-size=${size},${size} "${tempHtmlPath}"`, { stdio: 'ignore' });
    console.log(`✓ Generated public/${name} (${size}x${size})`);
  } catch (err) {
    console.error(`✗ Failed to generate ${name}:`, err.message);
  } finally {
    if (fs.existsSync(tempHtmlPath)) {
      fs.unlinkSync(tempHtmlPath);
    }
  }
});
