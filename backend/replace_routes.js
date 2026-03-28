const fs = require('fs');
let code = fs.readFileSync('index.js', 'utf8');

const routesMarker = '// --- Routes ---';
const emailMarker = '// --- Email Contacts AI Routes ---';

const routesStart = code.indexOf(routesMarker);
const emailStart = code.indexOf(emailMarker);

if (routesStart === -1 || emailStart === -1) {
    console.error("Markers not found");
    process.exit(1);
}

const newRoutes = `
app.get("/", (req, res) => {
    res.send(renderLandingPage());
});

app.get("/student/login", (req, res) => {
    const url = createOAuthClient().generateAuthUrl({
        access_type: "offline",
        scope: ["openid", "email", "profile"],
        prompt: "consent",
        state: "student"
    });
    res.redirect(url);
});

app.get("/teacher/login", (req, res) => {
    const url = createOAuthClient().generateAuthUrl({
        access_type: "offline",
        scope: ["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.send", "openid", "email", "profile"],
        prompt: "consent",
        state: "teacher"
    });
    res.redirect(url);
});

app.get("/auth/google/callback", async (req, res) => {
    const { code, state } = req.query;
    try {
        const client = createOAuthClient();
        const { tokens } = await client.getToken(code);
        client.setCredentials(tokens);
        
        const oauth2 = google.oauth2({ version: 'v2', auth: client });
        const userInfo = await oauth2.userinfo.get();
        const profile = userInfo.data;
        const userId = profile.id;

        let user = db.users[userId];
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
        
        req.session.tokens = tokens;
        req.session.userId = userId;

        if (user.role === 'teacher') res.redirect("/teacher/dashboard");
        else res.redirect("/student/dashboard");
    } catch (e) { res.status(500).send("Auth failed: " + e.message); }
});

app.get("/student/dashboard", (req, res) => {
    if (!req.session.userId || !db.users[req.session.userId]) return res.redirect("/");
    const user = db.users[req.session.userId];

    if (!user.classCode) {
        return res.send(renderDashboard(\`
            <div class="max-w-md mx-auto mt-24 p-8 bg-white app-border rounded-xl text-center shadow-sm">
                <div class="w-12 h-12 bg-zinc-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <i data-lucide="key" class="w-6 h-6 text-zinc-600"></i>
                </div>
                <h2 class="text-2xl font-bold mb-2">Join a Classroom</h2>
                <p class="text-zinc-500 mb-6 text-[13px]">Enter the 6-character class code provided by your teacher to get started.</p>
                <form action="/student/join" method="POST" class="flex flex-col gap-4">
                    <input type="text" name="code" placeholder="e.g. A1B2C3" required class="p-3 border border-zinc-200 rounded-lg text-center font-mono text-xl tracking-widest uppercase focus:outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400 transition-all">
                    <button type="submit" class="p-3 bg-zinc-950 text-white rounded-lg font-medium hover:bg-zinc-800 transition-all">Join Classroom</button>
                </form>
            </div>
        \`, user));
    }

    const teacherId = db.teachersByCode[user.classCode];
    const teacher = db.users[teacherId] || { name: 'Your Teacher' };

    const content = \`
        <div class="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <h1 class="text-2xl font-bold tracking-tight text-zinc-900">Student Workspace</h1>
            <div class="flex items-center gap-2 text-sm font-medium text-zinc-700 bg-white px-3 py-1.5 rounded-lg app-border shadow-sm">
                <i data-lucide="presentation" class="w-4 h-4 text-zinc-400"></i> Class: \${teacher.name}
            </div>
        </div>
        
        <div class="grid grid-cols-12 gap-8">
            <div class="col-span-12 lg:col-span-8 space-y-6">
                <div class="bg-white app-border rounded-xl p-6 shadow-sm">
                    <h2 class="text-[13px] font-bold text-zinc-400 uppercase tracking-widest mb-4">Current Tasks & Lessons</h2>
                    <div class="space-y-3">
                        <div class="flex items-center justify-between p-4 bg-zinc-50 border border-zinc-100 rounded-lg hover:border-zinc-300 transition-colors cursor-pointer group">
                            <div class="flex items-center gap-3">
                                <div class="p-2 bg-orange-100 text-accent rounded-md group-hover:scale-110 transition-transform"><i data-lucide="book-open" class="w-4 h-4"></i></div>
                                <div>
                                    <div class="font-bold text-sm text-zinc-900">The Industrial Revolution</div>
                                    <div class="text-[11px] font-medium text-zinc-500 mt-0.5">History &bull; Due Friday</div>
                                </div>
                            </div>
                            <button class="px-3 py-1.5 bg-white border border-zinc-200 text-xs font-semibold rounded shadow-sm hover:bg-zinc-100">Resume</button>
                        </div>
                        <div class="flex items-center justify-between p-4 bg-zinc-50 border border-zinc-100 rounded-lg hover:border-zinc-300 transition-colors cursor-pointer group">
                            <div class="flex items-center gap-3">
                                <div class="p-2 bg-blue-100 text-blue-600 rounded-md group-hover:scale-110 transition-transform"><i data-lucide="pen-tool" class="w-4 h-4"></i></div>
                                <div>
                                    <div class="font-bold text-sm text-zinc-900">Forces & Motion Essay</div>
                                    <div class="text-[11px] font-medium text-zinc-500 mt-0.5">Physics &bull; Due Next Week</div>
                                </div>
                            </div>
                            <button class="px-3 py-1.5 bg-white border border-zinc-200 text-xs font-semibold rounded shadow-sm hover:bg-zinc-100">Start</button>
                        </div>
                    </div>
                </div>

                <div class="bg-white app-border rounded-xl p-6 shadow-sm">
                   <h2 class="text-[13px] font-bold text-zinc-400 uppercase tracking-widest mb-4">Teacher Chat</h2>
                   <div class="h-48 bg-zinc-50 rounded-lg border border-zinc-100 p-4 overflow-y-auto mb-4 custom-scroll">
                       <div class="text-center text-[11px] font-medium text-zinc-400 my-2 uppercase tracking-wider">Conversation started</div>
                   </div>
                   <div class="flex gap-2">
                       <input type="text" placeholder="Message \${teacher.name}..." class="flex-1 p-3 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400 transition-all">
                       <button class="px-5 bg-zinc-950 text-white rounded-lg hover:bg-zinc-800 transition-colors"><i data-lucide="send" class="w-4 h-4"></i></button>
                   </div>
                </div>
            </div>

            <div class="col-span-12 lg:col-span-4 space-y-6">
                <div class="bg-indigo-50 border border-indigo-100 rounded-xl p-8 text-center relative overflow-hidden">
                    <div class="absolute -right-4 -top-4 w-24 h-24 bg-indigo-200/50 rounded-full blur-2xl"></div>
                    <i data-lucide="life-buoy" class="w-10 h-10 text-indigo-500 mx-auto mb-4 relative z-10"></i>
                    <h3 class="text-lg font-bold text-indigo-950 mb-2 relative z-10">Stuck on a concept?</h3>
                    <p class="text-[13px] text-indigo-800 mb-6 relative z-10 leading-relaxed">Don't stay blocked. Access AI tools, peer networks, and your teacher to overcome roadblocks.</p>
                    <a href="/student/help" class="block w-full py-3 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition-colors shadow-md hover:shadow-lg relative z-10">
                        Get Help Now
                    </a>
                </div>
            </div>
        </div>
    \`;
    res.send(renderDashboard(content, user));
});

app.post("/student/join", (req, res) => {
    if (!req.session.userId || !db.users[req.session.userId]) return res.redirect("/");
    const code = (req.body.code || "").toUpperCase().trim();
    if (db.teachersByCode[code]) {
        db.users[req.session.userId].classCode = code;
    }
    res.redirect("/student/dashboard");
});

app.get("/student/help", (req, res) => {
    if (!req.session.userId || !db.users[req.session.userId]) return res.redirect("/");
    const user = db.users[req.session.userId];

    const content = \`
        <div class="mb-8 flex items-center gap-4">
            <a href="/student/dashboard" class="p-2.5 bg-white border border-zinc-200 rounded-lg hover:bg-zinc-50 transition-colors"><i data-lucide="arrow-left" class="w-4 h-4"></i></a>
            <div>
                <h1 class="text-2xl font-bold tracking-tight text-zinc-900">Support Center</h1>
                <p class="text-sm text-zinc-500 mt-0.5">Select a resource below to get assistance</p>
            </div>
        </div>
        
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <button class="p-6 bg-white app-border rounded-xl text-left hover:shadow-lg hover:-translate-y-1 transition-all group flex flex-col h-full">
                <div class="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center mb-5"><i data-lucide="users" class="w-6 h-6"></i></div>
                <h3 class="font-bold text-lg text-zinc-900 mb-2">Find Study Group</h3>
                <p class="text-[13px] text-zinc-500 leading-relaxed flex-1">Connect with peers working on the same topics. Join a live voice or text channel.</p>
            </button>
            
            <button class="p-6 bg-white app-border rounded-xl text-left hover:shadow-lg hover:-translate-y-1 transition-all group flex flex-col h-full">
                <div class="w-12 h-12 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center mb-5"><i data-lucide="sparkles" class="w-6 h-6"></i></div>
                <h3 class="font-bold text-lg text-zinc-900 mb-2">Get AI Help</h3>
                <p class="text-[13px] text-zinc-500 leading-relaxed flex-1">Ask the ClassLoop assistant to explain concepts simply or check your work.</p>
            </button>

            <button class="p-6 bg-white app-border rounded-xl text-left hover:shadow-lg hover:-translate-y-1 transition-all group flex flex-col h-full">
                <div class="w-12 h-12 bg-green-50 text-green-600 rounded-xl flex items-center justify-center mb-5"><i data-lucide="message-square" class="w-6 h-6"></i></div>
                <h3 class="font-bold text-lg text-zinc-900 mb-2">Contact Teacher</h3>
                <p class="text-[13px] text-zinc-500 leading-relaxed flex-1">Send a direct priority message to your instructor for specific clarifications.</p>
            </button>
        </div>
    \`;
    res.send(renderDashboard(content, user));
});

app.get("/teacher/dashboard", async (req, res) => {
    const auth = getAuthedOAuthClient(req);
    if (!auth || !req.session.userId) return res.redirect("/");
    
    const user = db.users[req.session.userId];

    let emails = [];
    let gmailError = null;
    try {
        emails = await fetchEmails(auth);
    } catch (e) {
        gmailError = "Gmail Sync Temporarily Unavailable";
    }

    const emailHtml = emails.length > 0 
        ? emails.map(e => \`
            <div class="p-3 bg-white border-b border-zinc-100 last:border-0 hover:bg-zinc-50 transition-colors group">
                <div class="flex justify-between items-start mb-1">
                    <span class="text-[12px] font-bold text-zinc-900">\${e.from.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span>
                    <span class="text-[10px] text-zinc-400">\${e.date}</span>
                </div>
                <div class="text-[12px] font-medium text-zinc-700 truncate">\${e.subject.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
            </div>\`).join("")
        : \`<div class="p-8 text-center text-zinc-400 text-sm">\${gmailError || "No emails found."}</div>\`;

    const content = \`
        <div class="mb-8 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div class="col-span-1 md:col-span-2 bg-zinc-950 rounded-xl p-6 text-white overflow-hidden relative">
                <div class="absolute -right-10 -top-10 w-40 h-40 bg-zinc-800 rounded-full blur-3xl opacity-50"></div>
                <h2 class="text-xl font-bold tracking-tight mb-1 relative z-10">Welcome back, \${user.name.split(' ')[0]}</h2>
                <p class="text-zinc-400 text-sm relative z-10">You have 2 pending items to review today.</p>
            </div>
            
            <div class="col-span-1 bg-white app-border rounded-xl p-5 flex flex-col justify-between">
                <div class="text-[11px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-1.5"><i data-lucide="key" class="w-3.5 h-3.5"></i> Class Code</div>
                <div class="flex items-center justify-between mt-2">
                    <div class="text-3xl font-mono font-bold tracking-[0.2em] text-zinc-900">\${user.classCode}</div>
                    <button class="p-2 bg-zinc-50 text-zinc-600 rounded-lg hover:bg-zinc-100 transition-colors" title="Copy Code"><i data-lucide="copy" class="w-4 h-4"></i></button>
                </div>
                <div class="text-[10px] text-zinc-500 mt-2">Share this securely with your students.</div>
            </div>
        </div>

        <div class="grid grid-cols-12 gap-8">
            <div class="col-span-12 lg:col-span-8">
                <h2 class="text-[13px] font-bold text-zinc-400 uppercase tracking-widest mb-4">Command Center</h2>
                <div class="grid grid-cols-2 gap-4">
                    <button class="p-5 bg-white app-border rounded-xl flex flex-col items-start gap-3 hover:shadow-md transition-all group">
                        <div class="p-2 bg-orange-50 text-accent rounded-lg group-hover:scale-110 transition-transform"><i data-lucide="users" class="w-5 h-5"></i></div>
                        <div class="text-left font-bold text-sm">Class Roster</div>
                    </button>
                    <a href="/teacher/email" class="p-5 bg-white app-border rounded-xl flex flex-col items-start gap-3 hover:shadow-md transition-all group block" style="text-decoration:none; color:inherit;">
                        <div class="p-2 bg-green-50 text-green-600 rounded-lg group-hover:scale-110 transition-transform"><i data-lucide="mail-open" class="w-5 h-5"></i></div>
                        <div class="text-left font-bold text-sm">Email Contacts</div>
                    </a>
                    <button class="p-5 bg-white app-border rounded-xl flex flex-col items-start gap-3 hover:shadow-md transition-all group">
                        <div class="p-2 bg-blue-50 text-blue-600 rounded-lg group-hover:scale-110 transition-transform"><i data-lucide="sparkles" class="w-5 h-5"></i></div>
                        <div class="text-left font-bold text-sm">Lesson Generator</div>
                    </button>
                    <button class="p-5 bg-white app-border rounded-xl flex flex-col items-start gap-3 hover:shadow-md transition-all group">
                        <div class="p-2 bg-purple-50 text-purple-600 rounded-lg group-hover:scale-110 transition-transform"><i data-lucide="scroll-text" class="w-5 h-5"></i></div>
                        <div class="text-left font-bold text-sm">Rubric Creator</div>
                    </button>
                </div>
            </div>

            <div class="col-span-12 lg:col-span-4">
                <h2 class="text-[13px] font-bold text-zinc-400 uppercase tracking-widest mb-4 flex items-center justify-between">Inbox Stream <a href="/teacher/email" class="text-[10px] text-accent hover:underline">View All</a></h2>
                <div class="bg-white app-border rounded-xl overflow-hidden shadow-sm max-h-[350px] overflow-y-auto custom-scroll">
                    \${emailHtml}
                </div>
            </div>
        </div>
    \`;
    res.send(renderDashboard(content, user));
});
`;

code = code.substring(0, routesStart) + routesMarker + '\n' + newRoutes + '\n' + code.substring(emailStart);
fs.writeFileSync('index.js', code);
console.log('Routes strictly replaced!');
