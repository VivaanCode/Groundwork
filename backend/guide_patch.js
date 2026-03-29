const fs = require('fs');
let code = fs.readFileSync('C:/Users/vivaan/Documents/GitHub/Groundwork/backend/index.js', 'utf8');

const createLessonFormOld = `        <div class="max-w-4xl">
            <form action="/api/lessons/create" method="POST" class="space-y-6">
                <div class="bg-white app-border rounded-xl p-6 shadow-sm">
                    <label class="block text-sm font-bold text-zinc-900 mb-2">Lesson Title *</label>
                    <input type="text" name="title" required placeholder="e.g., The Industrial Revolution"
                           class="w-full p-3 border border-zinc-200 rounded-lg focus:ring-2 focus:ring-zinc-950 focus:outline-none">
                </div>

                <div class="bg-white app-border rounded-xl p-6 shadow-sm">      
                    <label class="block text-sm font-bold text-zinc-900 mb-2">Lesson Content (Markdown) *</label>
                    <textarea name="content" required rows="10" placeholder="Write your lesson content here..."
                              class="w-full p-3 border border-zinc-200 rounded-lg focus:ring-2 focus:ring-zinc-950 focus:outline-none resize-none"></textarea>  
                </div>

                <div class="bg-white app-border rounded-xl p-6 shadow-sm">      
                    <h3 class="font-bold text-zinc-900 mb-4">Lesson Slides</h3> 
                    <div id="slides-container" class="space-y-4 mb-4">`;

const createLessonFormNew = `        <div class="max-w-4xl">
            <form action="/api/lessons/create" method="POST" class="space-y-6">
                <div class="bg-white app-border rounded-xl p-6 shadow-sm">
                    <label class="block text-sm font-bold text-zinc-900 mb-2">Assignment Type *</label>
                    <select id="assignmentTypeToggle" name="type" class="w-full p-3 border border-zinc-200 rounded-lg focus:ring-2 focus:ring-zinc-950 focus:outline-none" onchange="toggleAssignmentType()">
                        <option value="lesson">Normal Lesson</option>
                        <option value="guide">Guide</option>
                    </select>
                </div>

                <div class="bg-white app-border rounded-xl p-6 shadow-sm">
                    <label class="block text-sm font-bold text-zinc-900 mb-2">Title *</label>
                    <input type="text" name="title" required placeholder="e.g., The Industrial Revolution"
                           class="w-full p-3 border border-zinc-200 rounded-lg focus:ring-2 focus:ring-zinc-950 focus:outline-none">
                </div>

                <div id="guide-builder-section" class="hidden">
                    <div class="bg-blue-50 border border-blue-200 rounded-xl p-6 shadow-sm mb-6 text-blue-900">
                        <div class="font-bold flex items-center gap-2 mb-2"><i data-lucide="info" class="w-5 h-5"></i> Please install our extension!</div>
                        <p class="text-sm">Before students can use Guides, they need the Groundwork extension.</p>
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
                        <label class="block text-sm font-bold text-zinc-900 mb-2">Lesson Content (Markdown) *</label>
                        <textarea id="lessonContentInput" name="content" required rows="10" placeholder="Write your lesson content here..."
                                  class="w-full p-3 border border-zinc-200 rounded-lg focus:ring-2 focus:ring-zinc-950 focus:outline-none resize-none"></textarea>  
                    </div>

                    <div class="bg-white app-border rounded-xl p-6 shadow-sm">      
                        <h3 class="font-bold text-zinc-900 mb-4">Lesson Slides</h3> 
                        <div id="slides-container" class="space-y-4 mb-4">`;

code = code.replace(createLessonFormOld, createLessonFormNew);

const formEndOld = `                    <button type="button" onclick="addSlide()" class="px-4 py-2 bg-zinc-100 text-zinc-700 rounded font-medium hover:bg-zinc-200">
                        + Add Slide
                    </button>
                </div>

                <div class="bg-white app-border rounded-xl p-6 shadow-sm mb-6"> 
                    <label class="block text-sm font-bold text-zinc-900 mb-2">Due Date</label>`;

const formEndNew = `                    <button type="button" onclick="addSlide()" class="px-4 py-2 bg-zinc-100 text-zinc-700 rounded font-medium hover:bg-zinc-200">
                        + Add Slide
                    </button>
                    </div>
                </div>

                <div class="bg-white app-border rounded-xl p-6 shadow-sm mb-6"> 
                    <label class="block text-sm font-bold text-zinc-900 mb-2">Due Date</label>`;

code = code.replace(formEndOld, formEndNew);

const toggleJS = `        <script>
            function toggleAssignmentType() {
                var type = document.getElementById('assignmentTypeToggle').value;
                var guideSection = document.getElementById('guide-builder-section');
                var lessonSection = document.getElementById('lesson-builder-section');
                var lessonContentInput = document.getElementById('lessonContentInput');
                var guideUrlInput = document.getElementById('guideUrlInput');
                
                if (type === 'guide') {
                    guideSection.classList.remove('hidden');
                    lessonSection.classList.add('hidden');
                    lessonContentInput.required = false;
                    guideUrlInput.required = true;
                } else {
                    guideSection.classList.add('hidden');
                    lessonSection.classList.remove('hidden');
                    lessonContentInput.required = true;
                    guideUrlInput.required = false;
                }
            }

            function addSlide() {`;

const oldToggleJS = `        <script>
            function addSlide() {`;

code = code.replace(oldToggleJS, toggleJS);

// Save mapping in /api/lessons/create
const createApiOld = `    db.lessons[lessonId] = {
        id: lessonId,
        teacherId: teacher.id,
        title: req.body.title,
        content: req.body.content,
        classCode: teacher.classCode,
        slides,
        dueDate: req.body.dueDate || null,
        createdAt: new Date()
    };`;

const createApiNew = `    db.lessons[lessonId] = {
        id: lessonId,
        teacherId: teacher.id,
        title: req.body.title,
        type: req.body.type || 'lesson',
        guideURL: req.body.guideURL || null,
        content: req.body.content || '',
        classCode: teacher.classCode,
        slides,
        dueDate: req.body.dueDate || null,
        createdAt: new Date()
    };`;

code = code.replace(createApiOld, createApiNew);

// UI for student dashboard
// Need to replace the href calculation to support Guides
const dashboardOld = `                                        <a href="/student/lesson/\${assignment.id}" class="px-3 py-1.5 bg-white border border-zinc-200 text-xs font-semibold rounded shadow-sm hover:bg-zinc-100">
                                            \${progressPercent === 0 ? 'Start' : 'Resume'}
                                        </a>`;
const dashboardNew = `                                        \${lesson.type === 'guide' ? 
                                            \`<a href="\${lesson.guideURL}" target="_blank" class="px-3 py-1.5 bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-semibold rounded shadow-sm hover:bg-indigo-100 flex items-center gap-1">Open Guide <i data-lucide="external-link" class="w-3 h-3"></i></a>\` :
                                            \`<a href="/student/lesson/\${assignment.id}" class="px-3 py-1.5 bg-white border border-zinc-200 text-xs font-semibold rounded shadow-sm hover:bg-zinc-100">
                                                \${progressPercent === 0 ? 'Start' : 'Resume'}
                                            </a>\`
                                        }`;

code = code.replace(dashboardOld, dashboardNew);

// Display label Guide
const dashboardLabelOld = `<div class="font-bold text-sm text-zinc-900">\${lesson.title}</div>`;
const dashboardLabelNew = `<div class="font-bold text-sm text-zinc-900 flex items-center gap-2">\${lesson.title} \${lesson.type === 'guide' ? '<span class="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[10px] uppercase font-bold rounded">Guide</span>' : ''}</div>`;

// Apply for both Current and Completed (they share similar code so let's do a global replace or use a regex)
code = code.replaceAll(dashboardLabelOld, dashboardLabelNew);

const dashboardCompletedOld = `<a href="/student/lesson/\${assignment.id}" class="px-3 py-1.5 bg-white border border-zinc-200 text-xs font-semibold rounded shadow-sm hover:bg-zinc-100 text-zinc-600">
                                            Review
                                        </a>`;
const dashboardCompletedNew = `\${lesson.type === 'guide' ? 
                                            \`<a href="\${lesson.guideURL}" target="_blank" class="px-3 py-1.5 bg-white border border-zinc-200 text-xs font-semibold rounded shadow-sm hover:bg-zinc-100 text-zinc-600 flex items-center gap-1">Review Guide <i data-lucide="external-link" class="w-3 h-3"></i></a>\` :
                                            \`<a href="/student/lesson/\${assignment.id}" class="px-3 py-1.5 bg-white border border-zinc-200 text-xs font-semibold rounded shadow-sm hover:bg-zinc-100 text-zinc-600">
                                                Review
                                            </a>\`}`;
code = code.replace(dashboardCompletedOld, dashboardCompletedNew);


// Fix progress calculation problem for guides
const progressOld1 = `const progressPercent = progress && lesson.slides && lesson.slides.length ? Math.round((progress.progress / lesson.slides.length) * 100) : 0;
                                return progressPercent < 100;`;
const progressNew1 = `let progressPercent = progress && lesson.slides && lesson.slides.length ? Math.round((progress.progress / lesson.slides.length) * 100) : 0;
                                if (lesson.type === 'guide') { progressPercent = progress && progress.completed ? 100 : 0; }
                                return progressPercent < 100;`;

const progressOld2 = `const progressPercent = progress && lesson.slides && lesson.slides.length ? Math.round((progress.progress / lesson.slides.length) * 100) : 0;
                                return \``;
const progressNew2 = `let progressPercent = progress && lesson.slides && lesson.slides.length ? Math.round((progress.progress / lesson.slides.length) * 100) : 0;
                                if (lesson.type === 'guide') { progressPercent = progress && progress.completed ? 100 : 0; }
                                return \``;
code = code.replace(progressOld1, progressNew1);
code = code.replace(progressOld2, progressNew2);

const progressOld3 = `const progressPercent = progress && lesson.slides && lesson.slides.length ? Math.round((progress.progress / lesson.slides.length) * 100) : 0;
                                return progressPercent >= 100;`;
const progressNew3 = `let progressPercent = progress && lesson.slides && lesson.slides.length ? Math.round((progress.progress / lesson.slides.length) * 100) : 0;
                                if (lesson.type === 'guide') { progressPercent = progress && progress.completed ? 100 : 0; }
                                return progressPercent >= 100;`;
code = code.replace(progressOld3, progressNew3);


// Inject /api/markGuideCompleted
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
            progress: 0,
            completed: true,
            responses: {}
        };
    } else {
        db.studentProgress[progressId].completed = true;
        db.studentProgress[progressId].progress = 100; // Just in case
    }
    
    saveDb();
    // Prompt asks to process both and redirect to student dashboard,
    // but this is an API call which is typically made from an extension or fetch, so redirecting might not be correct if it's supposed to be an API response, 
    // but I'll add redirect and also json response just in case. They said "redirect to student dashboard".
    // I can check if it expects json or HTML. Often extensions use APIs and expect JSON. Let's do a redirect as requested.
    return res.redirect("/student/dashboard");
});

`;

const lastRouteRegex = /app\.post\(\"\/api\/lessons\/delete\"[\s\S]*?\}\);/;
code = code.replace(lastRouteRegex, (match) => match + markGuidedApi);

fs.writeFileSync('C:/Users/vivaan/Documents/GitHub/Groundwork/backend/index.js', code);
console.log('Added Guide feature');
