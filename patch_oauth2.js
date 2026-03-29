const fs = require('fs');
const path = require('path');
let code = fs.readFileSync('C:/Users/vivaan/Documents/GitHub/Groundwork/backend/index.js', 'utf8');

const tLoginRegex = /app\.get\("\/teacher\/login", \(req, res\) => \{[\s\S]*?res\.redirect\(url\);\s*\}\);/;
const tLoginNew = `app.get("/teacher/login", (req, res) => {
    const url = createOAuthClient(req).generateAuthUrl({
        access_type: "offline",
        scope: ["openid", "email", "profile"],
        state: "teacher"
    });
    res.redirect(url);
});

app.get("/teacher/auth/gmail", (req, res) => {
    if (!req.session.userId) return res.redirect("/");
    const url = createOAuthClient(req).generateAuthUrl({
        access_type: "offline",
        scope: ["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.send", "openid", "email", "profile"],
        prompt: "consent",
        state: "teacher_gmail"
    });
    res.redirect(url);
});`;
if (tLoginRegex.test(code)) code = code.replace(tLoginRegex, tLoginNew);


const cbRegex = /let user = db\.users\[userId\];[\s\S]*?if \(user\.role === 'teacher'\) res\.redirect\("\/teacher\/dashboard\?token=" \+ user\.loginToken\);\s*else res\.redirect\("\/student\/dashboard\?token=" \+ user\.loginToken\);\s*\}/;
const cbNew = `let roleFromState = state;
        if (state === 'teacher_gmail') roleFromState = 'teacher';

        let user = db.users[userId];
        if (!user) {
            user = {
                id: userId,
                role: roleFromState || 'student',
                name: profile.name,
                email: profile.email,
                picture: profile.picture,
                classCode: roleFromState === 'teacher' ? generateCode() : null
            };
            db.users[userId] = user;
            if (roleFromState === 'teacher') {
                db.teachersByCode[user.classCode] = userId;
            }
        }

        if (!user.loginToken) {
            user.loginToken = "tk_" + Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
        }

        req.session.userId = userId;

        if (user.role === 'teacher') {
            if (state === 'teacher_gmail') {
                if (tokens.refresh_token) {
                    user.gmailRefreshToken = tokens.refresh_token; 
                    fs.writeFileSync(path.join(__dirname, 'db.json'), JSON.stringify(db, null, 2));
                }
                req.session.tokens = tokens;
                return res.redirect("/teacher/dashboard?token=" + user.loginToken);
            } else {
                if (user.gmailRefreshToken) {
                    req.session.tokens = { refresh_token: user.gmailRefreshToken };
                    return res.redirect("/teacher/dashboard?token=" + user.loginToken);
                } else {
                    return res.redirect("/teacher/auth/gmail");
                }
            }
        } else {
            req.session.tokens = tokens;
            return res.redirect("/student/dashboard?token=" + user.loginToken);
        }`;
if (cbRegex.test(code)) code = code.replace(cbRegex, cbNew);


const studentLessonRegex = /const lesson = db\.lessons\[assignment\.lessonId\];\s*if \(\!lesson\) return res\.status\(404\)\.send\(\"Lesson not found\"\);/;
const studentLessonNew = `const lesson = db.lessons[assignment.lessonId];
    if (!lesson) return res.status(404).send("Lesson not found");
    if (lesson.type === 'guide' && lesson.guideURL) {
        return res.redirect(lesson.guideURL);
    }`;
if (studentLessonRegex.test(code)) code = code.replace(studentLessonRegex, studentLessonNew);

const restoreRegex = /if \(user\.role === 'teacher'\) return res\.redirect\("\/teacher\/login"\);\s*req\.session\.userId = user\.id;\s*return res\.redirect\("\/student\/dashboard"\);/;
const restoreNew = `req.session.userId = user.id;
        if (user.role === 'teacher') {
            if (user.gmailRefreshToken) {
                req.session.tokens = { refresh_token: user.gmailRefreshToken };
                return res.redirect("/teacher/dashboard");
            }
            return res.redirect("/teacher/login");
        }
        return res.redirect("/student/dashboard");`;
if (restoreRegex.test(code)) code = code.replace(restoreRegex, restoreNew);

code = code.replace(/saveDb\(\);/g, "fs.writeFileSync(path.join(__dirname, 'db.json'), JSON.stringify(db, null, 2));");

fs.writeFileSync('C:/Users/vivaan/Documents/GitHub/Groundwork/backend/index.js', code);
console.log('Regex patch complete.');
