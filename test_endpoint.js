const fs = require('fs');
let code = fs.readFileSync('backend/index.js', 'utf8');

const testEndpoint = \
app.get("/student/test/:assignmentId", (req, res) => {
    if (!req.session.userId || !db.users[req.session.userId]) return res.redirect("/");
    const student = db.users[req.session.userId];
    const assignment = db.assignments[req.params.assignmentId];
    if (!assignment || assignment.classCode !== student.classCode) return res.status(403).send("Forbidden");
    const lesson = db.lessons[assignment.lessonId];
    if (!lesson || lesson.type !== 'test') return res.status(404).send("Test not found");

    res.send(renderDashboard(\\\
        <div class="max-w-4xl mx-auto bg-white p-8 rounded-xl shadow-sm app-border mt-8 text-center" id="test-launcher">
            <h1 class="text-3xl font-bold mb-4">\\\</h1>
            <p class="text-zinc-600 mb-8">This is a secured test. It will launch in full screen. Ensure you have no other windows open. Switching tabs or exiting fullscreen will be recorded as a violation.</p>
            <div id="test-error" class="text-red-600 font-bold mb-4"></div>
            <button id="start-test-btn" class="px-6 py-3 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 transition">Launch Secure Test</button>
        </div>
        
        <div id="test-content" class="hidden">
             <!-- The actual test injected when started -->
             <div class="mb-4 flex items-center justify-between">
                <h1 class="text-xl font-bold text-zinc-900 flex-1">\\\ - SECURE TEST</h1>
            </div>
            
            <div class="bg-white app-border rounded-xl p-8 shadow-sm">
                <iframe src="/student/lesson/\\\?isTest=true" class="w-full h-[80vh] border-0"></iframe>
                <div class="mt-4 text-center">
                    <button id="end-test-btn" class="px-6 py-3 bg-zinc-900 text-white font-bold rounded-lg hover:bg-zinc-800 transition">Submit Test</button>
                </div>
            </div>
        </div>

        <script>
            const startBtn = document.getElementById('start-test-btn');
            const endBtn = document.getElementById('end-test-btn');
            const launcher = document.getElementById('test-launcher');
            const content = document.getElementById('test-content');
            const errDiv = document.getElementById('test-error');

            window.addEventListener("message", (event) => {
                if (event.data && event.data.type === "CLASSLOOP_START_TEST_RESPONSE") {
                    const response = event.data.response || {};
                    if (response.ok) {
                        launcher.classList.add('hidden');
                        content.classList.remove('hidden');
                        document.body.style.background = '#fff';
                    } else {
                        errDiv.innerText = response.error || 'Please close all other windows and make sure the extension is installed.';
                        startBtn.innerText = 'Launch Secure Test';
                        startBtn.disabled = false;
                    }
                }
                if (event.data && event.data.type === "CLASSLOOP_END_TEST_RESPONSE") {
                    window.location.href = '/student/dashboard';
                }
            });

            startBtn.addEventListener('click', () => {
                errDiv.innerText = '';
                startBtn.innerText = 'Checking permissions & windows...';
                startBtn.disabled = true;
                
                const timer = setTimeout(() => {
                    errDiv.innerText = 'Extension not responding. Do you have the Classloop extension installed and enabled?';
                    startBtn.innerText = 'Launch Secure Test';
                    startBtn.disabled = false;
                }, 2000);

                window.addEventListener('message', function checkResp(e) {
                    if (e.data && e.data.type === 'CLASSLOOP_START_TEST_RESPONSE') {
                        clearTimeout(timer);
                        window.removeEventListener('message', checkResp);
                    }
                });

                window.postMessage({ type: 'CLASSLOOP_START_TEST' }, '*');
            });

            endBtn.addEventListener('click', () => {
                window.postMessage({ type: 'CLASSLOOP_END_TEST' }, '*');
            });
        </script>
    \\\, student));
});
\

// Fix the issue where PowerShell evaluates strings, I'll use raw injection
