const fs = require('fs');
let c = fs.readFileSync('index.js', 'utf8');

const apiCode = `
app.get("/api/chat/:studentName", (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
    const teacher = db.users[req.session.userId];
    if (!teacher || teacher.role !== 'teacher') return res.status(403).json({ error: 'Forbidden' });

    const studentName = req.params.studentName;
    let studentId = null;
    for (const uid in db.users) {
        if (db.users[uid].role === 'student' && db.users[uid].classCode === teacher.classCode && db.users[uid].name === studentName) {
            studentId = uid;
            break;
        }
    }

    if (!studentId) return res.json([]);

    if (!db.messages) db.messages = [];
    const chatHistory = db.messages.filter(m => (m.senderId === studentId && m.recipientId === teacher.id) || (m.senderId === teacher.id && m.recipientId === studentId)).sort((a,b) => a.timestamp - b.timestamp);
    
    res.json(chatHistory.map(m => ({
        sender: m.senderId === teacher.id ? 'You' : studentName,
        message: m.message,
        isSelf: m.senderId === teacher.id
    })));
});

app.post("/api/lessons/import",
`;

c = c.replace('app.post("/api/lessons/import",', apiCode);

fs.writeFileSync('index.js', c);
console.log('done api');
