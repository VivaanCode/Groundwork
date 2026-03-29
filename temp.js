const fs = require('fs');
const code = fs.readFileSync('backend/index.js', 'utf8');
code.split('\n').forEach((line, i) => {
    if (line.includes('app.get("/",')) {
        console.log(i + 1, line);
    }
});