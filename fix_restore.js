const fs = require('fs');
let code = fs.readFileSync('C:/Users/vivaan/Documents/GitHub/Groundwork/backend/index.js', 'utf8');

const restoreRegex = /app\.get\("\/api\/auth\/restore", \(req, res\) => \{[\s\S]*?res\.redirect\("\/\?cleartoken=1"\);\s*\}\);/;
const restoreNew = `app.get("/api/auth/restore", (req, res) => {
    const token = req.query.token;
    if (!token) return res.redirect("/");

    const user = Object.values(db.users).find(u => u.loginToken === token);
    if (user) {
        if (user.role === 'teacher') return res.redirect("/teacher/login");
        req.session.userId = user.id;
        return res.redirect("/student/dashboard");
    }

    res.redirect("/?cleartoken=1");
});`;

if (restoreRegex.test(code)) {
    code = code.replace(restoreRegex, restoreNew);
    fs.writeFileSync('C:/Users/vivaan/Documents/GitHub/Groundwork/backend/index.js', code);
    console.log('Fixed restore correctly');
} else {
    console.log('Regex failed');
}
