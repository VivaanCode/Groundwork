const fs = require('fs');
let c = fs.readFileSync('index.js', 'utf8');

const importCode = `
app.post("/api/lessons/import", express.json(), (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
    const teacher = db.users[req.session.userId];
    if (!teacher || teacher.role !== 'teacher') return res.status(403).json({ error: 'Forbidden' });

    try {
        const lessonData = req.body;
        if (!lessonData.title || !lessonData.content) {
            return res.status(400).json({ error: 'Missing required fields: title, content' });
        }

        const newLessonId = 'lesson_' + Date.now();
        db.lessons[newLessonId] = {
            id: newLessonId,
            teacherId: teacher.id,
            title: String(lessonData.title),
            content: String(lessonData.content),
            slides: Array.isArray(lessonData.slides) ? lessonData.slides : [],
            createdAt: new Date().toISOString()
        };

        saveDb();
        res.json({ success: true, lessonId: newLessonId, message: 'Lesson imported successfully' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post("/api/lessons/create", (req, res) => {`;

c = c.replace('app.post("/api/lessons/create", (req, res) => {', importCode);

fs.writeFileSync('index.js', c);
console.log('done');
