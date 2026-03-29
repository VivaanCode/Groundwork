const fs = require('fs');
let code = fs.readFileSync('C:/Users/vivaan/Documents/GitHub/Groundwork/backend/index.js', 'utf8');

const targetStr = `db.lessons[lessonId] = {
        id: lessonId,
        teacherId: teacher.id,
        title: req.body.title,
        content: req.body.content,
        classCode: teacher.classCode,
        slides,
        dueDate: req.body.dueDate || null,
        createdAt: new Date()
    };`;

const replaceStr = `db.lessons[lessonId] = {
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

code = code.replace(targetStr, replaceStr);
fs.writeFileSync('C:/Users/vivaan/Documents/GitHub/Groundwork/backend/index.js', code);
console.log("Replaced create route");
