const fs = require('fs');
let code = fs.readFileSync('C:/Users/vivaan/Documents/GitHub/Groundwork/backend/index.js', 'utf8');

const regex = /db\.lessons\[lessonId\] = \{\s*id: lessonId,\s*teacherId: teacher\.id,\s*title: req\.body\.title,\s*content: req\.body\.content,\s*classCode: teacher\.classCode,\s*slides,\s*dueDate: req\.body\.dueDate \|\| null,\s*createdAt: new Date\(\)\s*\};/m;

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

if(regex.test(code)) {
    code = code.replace(regex, rep);
    fs.writeFileSync('C:/Users/vivaan/Documents/GitHub/Groundwork/backend/index.js', code);
    console.log("Success with regex!");
} else {
    console.log("Fail");
}