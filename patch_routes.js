const fs = require('fs');

let code = fs.readFileSync('C:/Users/vivaan/Documents/GitHub/Groundwork/backend/index.js', 'utf8');

const anchor = `// --- Lessons and Progress Routes ---`;
const replacement = `// --- AI Rubric Routes ---
app.get("/teacher/rubric/create", (req, res) => {
    if (!req.session.userId || !db.users[req.session.userId]) return res.redirect("/");
    const teacher = db.users[req.session.userId];
    if (teacher.role !== 'teacher') return res.redirect("/");

    let content = \`
    <div class="mb-6 flex items-center gap-3">
        <a href="/teacher/dashboard" class="p-2 bg-white app-border rounded-lg hover:bg-zinc-50">
            <i data-lucide="arrow-left" class="w-4 h-4"></i>
        </a>
        <h1 class="text-2xl font-bold text-zinc-900">Create Rubric</h1>
    </div>

    <div class="max-w-3xl mx-auto bg-white app-border rounded-xl p-8 shadow-sm">
        <form id="rubricForm" class="space-y-6" onsubmit="generateRubric(event)">
            <div>
                <label class="block text-sm font-bold text-zinc-900 mb-2">Assignment Name *</label>
                <input type="text" id="assignmentName" required class="w-full p-3 border border-zinc-200 rounded-lg focus:ring-2 focus:ring-zinc-950 focus:outline-none" placeholder="e.g. History Essay">
            </div>
            <div>
                <label class="block text-sm font-bold text-zinc-900 mb-2">Assignment Description *</label>
                <textarea id="assignmentDesc" required class="w-full p-3 border border-zinc-200 rounded-lg h-32 resize-none focus:ring-2 focus:ring-zinc-950 focus:outline-none" placeholder="Explain what the assignment is..."></textarea>
            </div>
            <div>
                <label class="block text-sm font-bold text-zinc-900 mb-2">What are you looking for? (Optional)</label>
                <textarea id="assignmentCriteria" class="w-full p-3 border border-zinc-200 rounded-lg h-24 resize-none focus:ring-2 focus:ring-zinc-950 focus:outline-none" placeholder="e.g. 5 paragraphs, strong thesis, proper MLA formatting..."></textarea>
            </div>
            
            <button type="submit" id="submitBtn" class="w-full p-4 bg-zinc-950 text-white rounded-xl font-bold hover:shadow-lg hover:bg-zinc-800 transition-all flex items-center justify-center gap-2">
                <i data-lucide="sparkles" class="w-5 h-5"></i> Generate Rubric
            </button>
        </form>

        <div id="loadingState" class="hidden text-center py-12">
            <i data-lucide="loader-2" class="w-8 h-8 text-zinc-400 animate-spin mx-auto mb-4"></i>
            <p class="text-zinc-600 font-medium">AI is crafting your rubric...</p>
        </div>

        <div id="rubricOutput" class="hidden mt-8 pt-8 border-t border-zinc-100">
            <div class="flex items-center justify-between mb-4">
                <h2 class="text-lg font-bold text-zinc-900">Generated Rubric</h2>
                <button type="button" onclick="copyRubric()" class="px-4 py-2 bg-zinc-100 text-zinc-700 rounded-lg font-medium hover:bg-zinc-200 transition-colors flex items-center gap-2 text-xs shadow-sm">
                    <i data-lucide="copy" class="w-3.5 h-3.5"></i> Copy Board
                </button>
            </div>
            <div id="rubricContent" class="prose prose-sm max-w-none prose-table:border-collapse prose-th:bg-zinc-100 prose-td:border prose-td:border-zinc-200 prose-th:border prose-th:border-zinc-200 prose-th:p-3 prose-td:p-3 prose-table:w-full prose-table:text-sm"></div>
        </div>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
    <script>
        async function generateRubric(e) {
            e.preventDefault();
            const btn = document.getElementById('submitBtn');
            const loading = document.getElementById('loadingState');
            const output = document.getElementById('rubricOutput');
            const content = document.getElementById('rubricContent');

            btn.disabled = true;
            btn.classList.add('opacity-50');
            loading.classList.remove('hidden');
            output.classList.add('hidden');

            try {
                const res = await fetch('/api/ai/rubric', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: document.getElementById('assignmentName').value,
                        desc: document.getElementById('assignmentDesc').value,
                        criteria: document.getElementById('assignmentCriteria').value
                    })
                });

                const data = await res.json();
                
                if (data.error) throw new Error(data.error);
                
                content.innerHTML = marked.parse(data.rubric);
                lucide.createIcons();
                output.classList.remove('hidden');
            } catch (err) {
                alert('Error: ' + err.message);
            } finally {
                btn.disabled = false;
                btn.classList.remove('opacity-50');
                loading.classList.remove('hidden');
            }
        }
        
        function copyRubric() {
             const text = document.getElementById('rubricContent').innerText;
             navigator.clipboard.writeText(text);
             const btn = event.currentTarget;
             const originalHtml = btn.innerHTML;
             btn.innerHTML = '<i data-lucide="check" class="w-3.5 h-3.5 text-green-600"></i> Copied!';
             lucide.createIcons();
             setTimeout(() => { btn.innerHTML = originalHtml; lucide.createIcons(); }, 2000);
        }
    </script>
    \`;
    
    res.send(renderDashboard(content, teacher));
});

app.post("/api/ai/rubric", express.json(), async (req, res) => {
    try {
        const { name, desc, criteria } = req.body;
        
        const prompt = \`You are an expert teacher creating a grading rubric.
Assignment Name: \${name}
Assignment Description: \${desc}
\${criteria ? 'Specific Requirements / What the teacher is looking for: ' + criteria : ''}

Please generate a professional, highly-organized grading rubric in a Markdown table format. 
Columns should represent skill levels (e.g., Excellent, Proficient, Needs Improvement, Incomplete).
Rows should represent different grading criteria (e.g., Content, Grammar, Formatting) based on the description provided.

ONLY return the markdown table and absolutely NO other conversational text.\`;

        const completion = await groq.chat.completions.create({
            messages: [{ role: "user", content: prompt }],
            model: "llama-3.3-70b-versatile",
        }).catch(async () => {
             return await groq.chat.completions.create({
                 messages: [{ role: "user", content: prompt }],
                 model: "mixtral-8x7b-32768",
             });
        });

        res.json({ rubric: completion.choices[0].message.content });
    } catch (e) {
        console.error("Groq Rubric Error:", e);
        res.status(500).json({ error: e.message });
    }
});

// --- Lessons and Progress Routes ---`;

if (code.includes(anchor)) {
    code = code.replace(anchor, replacement);
    fs.writeFileSync('C:/Users/vivaan/Documents/GitHub/Groundwork/backend/index.js', code);
    console.log("Rubric routes added");
} else {
    console.log("Could not find anchor to inject rubric routes");
}
