import fs from 'fs';
import path from 'path';

const files = ['main.js', 'football-data.js', 'football-ui.js', 'football-features.js'];
files.forEach(file => {
  fs.copyFileSync(file, path.join('dist', file));
});
console.log('JS files copied to dist/ successfully!');
