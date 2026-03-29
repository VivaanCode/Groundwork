const fs = require('fs');
let code = fs.readFileSync('C:/Users/vivaan/Documents/GitHub/Groundwork/backend/index.js', 'utf8');

const sIdx = code.indexOf(`db.lessons[lessonId] = {
        id: lessonId,
        teacherId: teacher.id,`);

const eIdxStr = `createdAt: new Date()\n    };`;
const eIdx = code.indexOf(eIdxStr, sIdx);

if (sIdx !== -1 && eIdx !== -1) {
    const rep = `db.lessons[lessonId] = {
        id: lessonId,
        teacherId: teacher.id,
        title: req.body.title,
        content: req.body.content,
        classCode: teacher.classCode,
        slides,
        dueDate: req.body.dueDate || null,
        createdAt: new Date(),
        type: req.body.type || 'lesson',
        guideURL: req.body.guideURL || null
    };`;

    code = code.substring(0, sIdx) + rep + code.substring(eIdx + eIdxStr.length);
    fs.writeFileSync('C:/Users/vivaan/Documents/GitHub/Groundwork/backend/index.js', code);
    console.log("ACTUALLY replaced create route");
} else {
    console.log("Could not find the target string...");
}