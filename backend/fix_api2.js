const fs = require('fs');
let code = fs.readFileSync('C:/Users/vivaan/Documents/GitHub/Groundwork/backend/index.js', 'utf8');

const markGuidedApi = `

app.post('/api/markGuideCompleted', express.json(), (req, res) => {
    const { guideURL, studentEmail } = req.body;
    
    // Find the student by email
    const student = Object.values(db.users).find(u => u.email === studentEmail && u.role === 'student');
    if (!student) {
        return res.status(404).json({ error: "Student not found" });
    }

    // Find the assignment that has this guide URL and is assigned to the student's class
    const assignment = Object.values(db.assignments).find(a => {
        if (a.classCode !== student.classCode) return false;
        const lesson = db.lessons[a.lessonId];
        return lesson && lesson.type === 'guide' && lesson.guideURL === guideURL;
    });

    if (!assignment) {
        return res.status(404).json({ error: "Guide assignment not found" });
    }

    const progressId = student.id + "_" + assignment.id;
    if (!db.studentProgress[progressId]) {
        db.studentProgress[progressId] = {
            id: progressId,
            studentId: student.id,
            assignmentId: assignment.id,
            progress: 100,
            completed: true,
            responses: {}
        };
    } else {
        db.studentProgress[progressId].completed = true;
        db.studentProgress[progressId].progress = 100;
    }
    
    saveDb();
    
    return res.redirect("/student/dashboard");
});

`;

code = code.replace('server.listen(port,', markGuidedApi + '\nserver.listen(port,');

fs.writeFileSync('C:/Users/vivaan/Documents/GitHub/Groundwork/backend/index.js', code);
console.log('Appended API properly');
