const fs = require('fs');

let code = fs.readFileSync('backend/index.js', 'utf8');

// 1. Backend Route Addition
const aiGenerateSlidesCode = `
app.post("/api/ai/generate-slides", express.json(), async (req, res) => {
    try {
        const { title, description, firstSlide, count } = req.body;
        
        const prompt = \`You are an engaging teaching assistant AI creating slides for a lesson.
Lesson Title: \${title}
Lesson Description: \${description}

The teacher has already created the foundation (Slide 1):
Title: \${firstSlide.title}
Content: \${firstSlide.content}
\${firstSlide.question ? \`Checkpoint Question: \${firstSlide.question}
Options: A) \${firstSlide.options[0]}, B) \${firstSlide.options[1]}, C) \${firstSlide.options[2]}, D) \${firstSlide.options[3]}
Correct Answer: \${firstSlide.answer}\` : ''}

CRITICAL REQUIREMENT: Complete the presentation by generating EXACTLY \${count} MORE sequential slides that logically follow Slide 1. DO NOT REWRITE OR INCLUDE SLIDE 1.
Output MUST BE ONLY A RAW JSON ARRAY of objects, with NO markdown formatting (no \\\`\\\`\\\`json blocks), no code block ticks, and no conversational text whatsoever. JUST THE VALID JSON ARRAY.
Each slide object in the array MUST match this EXACT schema:
[
  {
      "title": "A short engaging slide title",
      "content": "A paragraph explaining the topic clearly to students",
      "question": "A multiple choice checkpoint question string (or empty string if none)",
      "options": ["Option A text", "Option B text", "Option C text", "Option D text"],
      "answer": "A" // Must be exactly A, B, C, or D if question exists (empty string if no question)
  }
]\`;

        const completion = await groq.chat.completions.create({
            messages: [{ role: "user", content: prompt }],
            model: "llama-3.3-70b-versatile",
            temperature: 0.7
        }).catch(async (e) => {
             console.error('Groq versatile failed, falling back to mixtral:', e);
             return await groq.chat.completions.create({
                 messages: [{ role: "user", content: prompt }],
                 model: "mixtral-8x7b-32768",
                 temperature: 0.7
             });
        });

        let responseText = completion.choices[0].message.content.trim();
        // Defensive cleanup just in case LLM wraps in markdown code block
        if (responseText.startsWith('\`\`\`json')) {
            responseText = responseText.substring(7);
        }
        if (responseText.startsWith('\`\`\`')) {
            responseText = responseText.substring(3);
        }
        if (responseText.endsWith('\`\`\`')) {
            responseText = responseText.substring(0, responseText.length - 3);
        }
        responseText = responseText.trim();
        
        try {
            const parsedSlides = JSON.parse(responseText);
            if (!Array.isArray(parsedSlides)) {
                return res.status(500).json({ error: "AI didn't return an array" });
            }
            res.json(parsedSlides);
        } catch(err) {
            console.error('Failed to parse AI JSON:', err, responseText);
            res.status(500).json({ error: "Failed to parse AI response." });
        }
    } catch(e) {
        console.error('AI Slide Gen Error:', e);
        res.status(500).json({ error: e.message });
    }
});

app.post("/api/lessons/create", express.urlencoded({ extended: true }), (req, res) => {`;

code = code.replace(`app.post("/api/lessons/create", express.urlencoded({ extended: true }), (req, res) => {`, aiGenerateSlidesCode);

const oldAddSlideBtn = `<button type="button" onclick="addSlide()" class="px-4 py-2 bg-zinc-100 text-zinc-700 rounded font-medium hover:bg-zinc-200">
                        + Add Slide
                    </button>`;

const newAddSlideSection = `<div class="flex items-center gap-4 mt-4">
                        <button type="button" onclick="addSlide()" class="px-4 py-2 bg-zinc-100 text-zinc-700 rounded font-medium hover:bg-zinc-200">
                            + Add Slide
                        </button>
                        <div class="flex items-center gap-2 relative group">
                            <input type="number" id="ai-slide-count" min="1" max="10" value="3" class="w-16 p-2 border border-purple-200 rounded text-sm text-center focus:ring-2 focus:ring-purple-500 focus:outline-none flex-shrink-0" title="Number of slides to generate">
                            <button type="button" onclick="generateAiSlides()" id="btn-generate-slides" class="px-4 py-2 bg-purple-50 text-purple-700 rounded font-bold hover:bg-purple-100 flex items-center gap-2 transition-colors border border-purple-200 shadow-sm flex-shrink-0 whitespace-nowrap">
                                <i data-lucide="sparkles" class="w-4 h-4"></i> Generate AI Slides
                            </button>
                            <div class="absolute -bottom-10 left-1/2 -translate-x-1/2 bg-zinc-900 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">Fill out Lesson Content & First Slide first</div>
                        </div>
                    </div>`;

code = code.replace(oldAddSlideBtn, newAddSlideSection);


const addSlideScriptFunc = `function addSlide() {`;
const aiGenerationScript = `
            async function generateAiSlides() {
                const title = document.querySelector('input[name="title"]').value.trim();
                const description = document.getElementById('lessonContentInput').value.trim();
                const firstSlideInput = document.querySelector('input[name="slides[]"]');
                const firstSlideContent = document.querySelector('textarea[name="slide-content[]"]');
                const firstSlideQuestion = document.querySelector('input[name="questions[]"]');
                
                if (!title || !description || !firstSlideInput || !firstSlideInput.value.trim() || !firstSlideContent.value.trim()) {
                    alert('Please fill out the lesson title, description, and the content of the first slide before generating more slides with AI.');
                    return;
                }
                
                const slideCountInput = document.getElementById('ai-slide-count');
                const count = parseInt(slideCountInput.value) || 3;
                
                const btn = document.getElementById('btn-generate-slides');
                const originalHtml = btn.innerHTML;
                btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Generating...';
                btn.disabled = true;
                
                // Construct first slide payload
                const parentSlide = firstSlideInput.closest('.slide-item');
                const qOptions = parentSlide.querySelectorAll('input[name^="question-option-"]');
                const qAnswer = parentSlide.querySelector('input[name="question-answer[]"]');
                
                const firstSlide = {
                    title: firstSlideInput.value.trim(),
                    content: firstSlideContent.value.trim(),
                    question: firstSlideQuestion ? firstSlideQuestion.value.trim() : '',
                    options: Array.from(qOptions).map(o => o.value.trim()),
                    answer: qAnswer ? qAnswer.value.trim().toUpperCase() : ''
                };

                try {
                    const response = await fetch('/api/ai/generate-slides', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ title, description, firstSlide, count })
                    });
                    
                    if (!response.ok) throw new Error('API Error');
                    
                    const newSlides = await response.json();
                    
                    for (const slide of newSlides) {
                        const nextCount = document.querySelectorAll('.slide-item').length + 1;
                        let slideHtml = '<div class="slide-item p-4 bg-purple-50/50 border border-purple-200 rounded-lg mt-4 shadow-sm">';
                        slideHtml += '<div class="flex items-center gap-2 mb-2"><i data-lucide="sparkles" class="w-4 h-4 text-purple-600"></i><span class="text-xs font-bold text-purple-600 uppercase tracking-wider">AI Generated Slide</span></div>';
                        slideHtml += '<input type="text" name="slides[]" placeholder="Slide ' + nextCount + ' title" value="' + (slide.title || '').replace(/"/g, '&quot;') + '" class="w-full p-2 border border-zinc-200 rounded mb-2">';
                        slideHtml += '<textarea name="slide-content[]" placeholder="Slide content..." rows="3" class="w-full p-2 border border-zinc-200 rounded resize-none">' + (slide.content || '') + '</textarea>';
                        slideHtml += '<label class="block text-sm font-medium text-zinc-700 mt-4 mb-2">Checkpoint Question (Optional)</label>';
                        slideHtml += '<input type="text" name="questions[]" placeholder="Ask a checkpoint question..." value="' + (slide.question || '').replace(/"/g, '&quot;') + '" class="w-full p-2 border border-zinc-200 rounded mb-2">';
                        slideHtml += '<div class="flex gap-2 mb-2">';
                        slideHtml += '<input type="text" name="question-option-1[]" placeholder="Option A" value="' + (slide.options && slide.options[0] ? slide.options[0] : '').replace(/"/g, '&quot;') + '" class="flex-1 p-2 border border-zinc-200 rounded text-sm">';
                        slideHtml += '<input type="text" name="question-option-2[]" placeholder="Option B" value="' + (slide.options && slide.options[1] ? slide.options[1] : '').replace(/"/g, '&quot;') + '" class="flex-1 p-2 border border-zinc-200 rounded text-sm">';
                        slideHtml += '</div><div class="flex gap-2 mb-2">';
                        slideHtml += '<input type="text" name="question-option-3[]" placeholder="Option C" value="' + (slide.options && slide.options[2] ? slide.options[2] : '').replace(/"/g, '&quot;') + '" class="flex-1 p-2 border border-zinc-200 rounded text-sm">';
                        slideHtml += '<input type="text" name="question-option-4[]" placeholder="Option D" value="' + (slide.options && slide.options[3] ? slide.options[3] : '').replace(/"/g, '&quot;') + '" class="flex-1 p-2 border border-zinc-200 rounded text-sm">';
                        slideHtml += '</div><label class="block text-sm font-medium text-zinc-700 mb-2">Correct Answer (A, B, C, or D)</label>';
                        slideHtml += '<input type="text" name="question-answer[]" placeholder="A, B, C, or D" value="' + (slide.answer || '') + '" class="w-full p-2 border border-zinc-200 rounded text-sm uppercase">';
                        slideHtml += '</div>';
                        document.getElementById('slides-container').insertAdjacentHTML('beforeend', slideHtml);
                    }
                    
                    // Re-initialize lucide icons for new slides
                    if (window.lucide) {
                        lucide.createIcons();
                    }
                    
                    // Scroll to bottom
                    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
                    
                } catch(err) {
                    alert('Error generating slides: ' + err.message);
                } finally {
                    btn.innerHTML = originalHtml;
                    btn.disabled = false;
                    if (window.lucide) lucide.createIcons();
                }
            }
            
            function addSlide() {`;

code = code.replace(addSlideScriptFunc, aiGenerationScript);

fs.writeFileSync('backend/index.js', code);
console.log('Patch complete.');
