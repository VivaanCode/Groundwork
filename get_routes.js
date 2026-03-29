const fs = require('fs');

const code = fs.readFileSync('C:/Users/vivaan/Documents/GitHub/Groundwork/backend/index.js', 'utf8');
const lines = code.split('\n');

let out = '';
lines.forEach((l, i) => { if(l.includes('app.get(')) out += (i+1) + ': ' + l + '\n'; });

fs.writeFileSync('C:/Users/vivaan/Documents/GitHub/Groundwork/backend/routes.txt', out);
