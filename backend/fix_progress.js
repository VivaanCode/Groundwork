const fs = require('fs');
let code = fs.readFileSync('C:/Users/vivaan/Documents/GitHub/Groundwork/backend/index.js', 'utf8');

code = code.replaceAll(
    'const progressPercent = progress && lesson.slides && lesson.slides.length ? Math.round((progress.progress / lesson.slides.length) * 100) : 0;',
    `let progressPercent = progress && lesson.slides && lesson.slides.length ? Math.round((progress.progress / lesson.slides.length) * 100) : 0;
     if (lesson.type === 'guide') { progressPercent = progress && progress.completed ? 100 : 0; }`
);

fs.writeFileSync('C:/Users/vivaan/Documents/GitHub/Groundwork/backend/index.js', code);
console.log('Fixed progress calculation');
