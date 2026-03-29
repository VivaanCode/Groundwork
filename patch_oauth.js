const fs = require('fs');
let code = fs.readFileSync('C:/Users/vivaan/Documents/GitHub/Groundwork/backend/index.js', 'utf8');

// 1. Remove saveDb(); call from markGuideCompleted to prevent ReferenceError
code = code.replace(/saveDb\(\);/g, "fs.writeFileSync(path.join(__dirname, 'db.json'), JSON.stringify(db, null, 2));");

// 2. Fix /student/lesson/:assignmentId redirect for guides
const studentLessonOld = `    const lesson = db.lessons[assignment.lessonId];
    if (!lesson) return res.status(404).send("Lesson not found");

    let progress = Object.values(db.studentProgress).find(p =>`;

const studentLessonNew = `    const lesson = db.lessons[assignment.lessonId];
    if (!lesson) return res.status(404).send("Lesson not found");
    
    if (lesson.type === 'guide' && lesson.guideURL) {
        return res.redirect(lesson.guideURL);
    }

    let progress = Object.values(db.studentProgress).find(p =>`;

code = code.replace(studentLessonOld, studentLessonNew);

// 3. Fix teacher auth flow to split identity and gmail

const authOldStart = `app.get("/teacher/login", (req, res) => {
    const url = createOAuthClient(req).generateAuthUrl({
        access_type: "offline",
        scope: ["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.send", "openid", "email", "profile"],
        prompt: "consent",
        state: "teacher"
    });
    res.redirect(url);
});

app.get("/auth/google/callback", async (req, res) => {`;

const authNewStart = `app.get("/teacher/login", (req, res) => {
    const url = createOAuthClient(req).generateAuthUrl({
        access_type: "offline",
        scope: ["openid", "email", "profile"],
        state: "teacher"
    });
    res.redirect(url);
});

app.get("/teacher/auth/gmail", (req, res) => {
    const url = createOAuthClient(req).generateAuthUrl({
        access_type: "offline",
        scope: ["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.send", "openid", "email", "profile"],
        prompt: "consent",
        state: "teacher_gmail"
    });
    res.redirect(url);
});

app.get("/auth/google/callback", async (req, res) => {`;

code = code.replace(authOldStart, authNewStart);

// Callback adjustments
const callbackOld = `        let user = db.users[userId];
        if (!user) {
            user = {
                id: userId,
                role: state || 'student',
                name: profile.name,
                email: profile.email,
                picture: profile.picture,
                classCode: state === 'teacher' ? generateCode() : null
            };
            db.users[userId] = user;
            if (state === 'teacher') {
                db.teachersByCode[user.classCode] = userId;
            }
        }

        // Ensure they have a persistent login token
        if (!user.loginToken) {
            user.loginToken = "tk_" + Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
        }

        req.session.tokens = tokens;
        req.session.userId = userId;

        if (user.role === 'teacher') res.redirect("/teacher/dashboard?token=" + user.loginToken);
        else res.redirect("/student/dashboard?token=" + user.loginToken);       
    } catch (e) { res.status(500).send("Auth failed: " + e.message); }
});`;

const callbackNew = `        let roleFromState = state;
        if (state === 'teacher_gmail') roleFromState = 'teacher';

        let user = db.users[userId];
        if (!user) {
            user = {
                id: userId,
                role: roleFromState || 'student',
                name: profile.name,
                email: profile.email,
                picture: profile.picture,
                classCode: roleFromState === 'teacher' ? generateCode() : null,
                gmailRefreshToken: null
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
        }
    } catch (e) { res.status(500).send("Auth failed: " + e.message); }
});`;

code = code.replace(callbackOld, callbackNew);


// And finally adjust /api/auth/restore so it avoids Google entirely if a teacher has a refresh token
const restoreOld = `        if (user.role === 'teacher') return res.redirect("/teacher/login");
        req.session.userId = user.id;
        return res.redirect("/student/dashboard");`;

const restoreNew = `        req.session.userId = user.id;
        if (user.role === 'teacher') {
            if (user.gmailRefreshToken) {
                req.session.tokens = { refresh_token: user.gmailRefreshToken };
                return res.redirect("/teacher/dashboard");
            }
            return res.redirect("/teacher/login");
        }
        return res.redirect("/student/dashboard");`;

code = code.replace(restoreOld, restoreNew);

fs.writeFileSync('C:/Users/vivaan/Documents/GitHub/Groundwork/backend/index.js', code);
console.log('Patch complete.');
