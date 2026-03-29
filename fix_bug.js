const fs = require('fs');
let code = fs.readFileSync('C:/Users/vivaan/Documents/GitHub/Groundwork/backend/index.js', 'utf8');

// 1. Fix the infinite reload by requiring Google auth via login instead of looping directly

const restoreOld = `app.get("/api/auth/restore", (req, res) => {
    const token = req.query.token;
    if (!token) return res.redirect("/");

    // Find user by token
    const user = Object.values(db.users).find(u => u.loginToken === token);     
    if (user) {
        req.session.userId = user.id;
        if (user.role === 'teacher') return res.redirect("/teacher/dashboard"); 
        return res.redirect("/student/dashboard");
    }

    res.redirect("/?cleartoken=1");
});`;

const restoreNew = `app.get("/api/auth/restore", (req, res) => {
    const token = req.query.token;
    if (!token) return res.redirect("/");

    // Find user by token
    const user = Object.values(db.users).find(u => u.loginToken === token);     
    if (user) {
        if (user.role === 'teacher') return res.redirect("/teacher/login"); 
        req.session.userId = user.id;
        return res.redirect("/student/dashboard");
    }

    res.redirect("/?cleartoken=1");
});`;

if (code.includes(restoreOld)) {
    code = code.replace(restoreOld, restoreNew);
    console.log("Patched restore bug");
} else {
    console.log("Could not find restore logic");
}

// 2. Fix the missing form dropdown correctly

const formOldRegex = /<form action="\/api\/lessons\/create" method="POST" class="space-y-6">\s*<div class="bg-white app-border rounded-xl p-6 shadow-sm">\s*<label class="block text-sm font-bold text-zinc-900 mb-2">Lesson Title \*/;

const formNew = `<form action="/api/lessons/create" method="POST" class="space-y-6">
                <div class="bg-white app-border rounded-xl p-6 shadow-sm">
                    <label class="block text-sm font-bold text-zinc-900 mb-2">Assignment Type *</label>
                    <select id="assignmentTypeToggle" name="type" class="w-full p-3 border border-zinc-200 rounded-lg focus:ring-2 focus:ring-zinc-950 focus:outline-none" onchange="toggleAssignmentType()">
                        <option value="lesson">Normal Lesson</option>
                        <option value="guide">Guide</option>
                    </select>
                </div>

                <div class="bg-white app-border rounded-xl p-6 shadow-sm">
                    <label class="block text-sm font-bold text-zinc-900 mb-2">Title *`;

if (formOldRegex.test(code)) {
    code = code.replace(formOldRegex, formNew);
    console.log("Patched form dropdown");
} else {
    console.log("Could not find form regex");
}


const formMidRegex = /<div class=\"bg-white app-border rounded-xl p-6 shadow-sm\">\s*<label class=\"block text-sm font-bold text-zinc-900 mb-2\">Lesson Content \(Markdown\) \*/;

const formMidNew = `<div id="guide-builder-section" class="hidden">
                    <div class="bg-blue-50 border border-blue-200 rounded-xl p-6 shadow-sm mb-6 text-blue-900">
                        <div class="font-bold flex items-center gap-2 mb-2"><i data-lucide="info" class="w-5 h-5"></i> Please install our extension!</div>
                        <p class="text-sm">Before students can use Guides, you need the Groundwork extension.</p>
                        <a href="https://github.com/VivaanCode/Groundwork" target="_blank" class="text-blue-700 underline font-medium mt-2 inline-block">https://github.com/VivaanCode/Groundwork</a>
                    </div>
                    <div class="bg-white app-border rounded-xl p-6 shadow-sm">
                        <label class="block text-sm font-bold text-zinc-900 mb-2">Guide URL *</label>
                        <input type="url" id="guideUrlInput" name="guideURL" placeholder="https://example.com/guide..."
                               class="w-full p-3 border border-zinc-200 rounded-lg focus:ring-2 focus:ring-zinc-950 focus:outline-none">
                    </div>
                </div>

                <div id="lesson-builder-section" class="space-y-6">
                    <div class="bg-white app-border rounded-xl p-6 shadow-sm">      
                        <label class="block text-sm font-bold text-zinc-900 mb-2">Lesson Content (Markdown) *`;

if (formMidRegex.test(code)) {
    code = code.replace(formMidRegex, formMidNew);
    console.log("Patched form middle");
}

const formEndRegex = /<button type=\"button\" onclick=\"addSlide\(\)\" class=\"px-4 py-2 bg-zinc-100 text-zinc-700 rounded font-medium hover:bg-zinc-200\">\s*\+\s*Add Slide\s*<\/button>\s*<\/div>\s*<div class=\"bg-white app-border rounded-xl p-6 shadow-sm mb-6\">/;

const formEndNew = `<button type="button" onclick="addSlide()" class="px-4 py-2 bg-zinc-100 text-zinc-700 rounded font-medium hover:bg-zinc-200">
                        + Add Slide
                    </button>
                    </div>
                </div>

                <div class="bg-white app-border rounded-xl p-6 shadow-sm mb-6">`;

if (formEndRegex.test(code)) {
    code = code.replace(formEndRegex, formEndNew);
    console.log("Patched form end");
}

const scriptRegex = /<script>\s*function addSlide\(\) {/;
const scriptNew = `<script>
            function toggleAssignmentType() {
                var type = document.getElementById('assignmentTypeToggle').value;
                var guideSection = document.getElementById('guide-builder-section');
                var lessonSection = document.getElementById('lesson-builder-section');
                var lessonContentInput = document.getElementById('lessonContentInput');
                var guideUrlInput = document.getElementById('guideUrlInput');
                
                if (type === 'guide') {
                    guideSection.classList.remove('hidden');
                    lessonSection.classList.add('hidden');
                    if(lessonContentInput) lessonContentInput.required = false;
                    if(guideUrlInput) guideUrlInput.required = true;
                } else {
                    guideSection.classList.add('hidden');
                    lessonSection.classList.remove('hidden');
                    if(lessonContentInput) lessonContentInput.required = true;
                    if(guideUrlInput) guideUrlInput.required = false;
                }
            }

            function addSlide() {`;

if (scriptRegex.test(code)) {
    code = code.replace(scriptRegex, scriptNew);
    console.log("Patched script");
}

const contentAreaRegex = /<textarea name=\"content\" required rows=\"10\"/;
const contentAreaNew = `<textarea id="lessonContentInput" name="content" required rows="10"`;
if (contentAreaRegex.test(code)) {
    code = code.replace(contentAreaRegex, contentAreaNew);
    console.log("Patched id for content");
}

fs.writeFileSync('C:/Users/vivaan/Documents/GitHub/Groundwork/backend/index.js', code);
