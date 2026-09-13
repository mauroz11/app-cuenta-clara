const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const publicDir = path.join(rootDir, 'public');

// Ensure public directory exists
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Copy index.html
fs.copyFileSync(path.join(rootDir, 'index.html'), path.join(publicDir, 'index.html'));

// Copy src directory
const srcDest = path.join(publicDir, 'src');
if (fs.existsSync(srcDest)) {
  fs.rmSync(srcDest, { recursive: true, force: true });
}
fs.cpSync(path.join(rootDir, 'src'), srcDest, { recursive: true });

console.log('Build completed successfully. Files generated in ./public');
