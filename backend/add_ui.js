const fs = require('fs');
let c = fs.readFileSync('index.js', 'utf8');

const importUiCode = `
          <div class="mb-6 flex items-center justify-between">
              <div class="flex items-center gap-3">
                  <a href="/teacher/dashboard" class="p-2 bg-white app-border rounded-lg hover:bg-zinc-50">
                      <i data-lucide="arrow-left" class="w-4 h-4"></i>
                  </a>
                  <h1 class="text-2xl font-bold text-zinc-900">Create New Lesson</h1>
              </div>
              
              <div class="flex items-center gap-2">
                  <input type="file" id="import-json-file" accept=".json" class="hidden" onchange="handleImportJson(event)">
                  <button onclick="document.getElementById('import-json-file').click()" class="px-4 py-2 bg-white border border-zinc-200 text-zinc-700 rounded-lg font-medium hover:bg-zinc-50 flex items-center gap-2 text-sm shadow-sm transition-colors">
                      <i data-lucide="upload" class="w-4 h-4"></i> Import JSON
                  </button>
              </div>
          </div>

          <script>
            async function handleImportJson(event) {
                const file = event.target.files[0];
                if (!file) return;
                
                try {
                    const text = await file.text();
                    const json = JSON.parse(text);
                    
                    const response = await fetch('/api/lessons/import', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(json)
                    });
                    
                    if (response.ok) {
                        alert('Lesson imported successfully!');
                        window.location.href = '/teacher/dashboard';
                    } else {
                        const error = await response.json();
                        alert('Failed to import: ' + (error.error || 'Unknown error'));
                    }
                } catch (e) {
                    alert('Invalid JSON file: ' + e.message);
                }
                
                // Clear the input so it can be used again
                event.target.value = '';
            }
          </script>
`;

c = c.replace(/<div class="mb-6 flex items-center gap-3">[\s\S]*?<h1 class="text-2xl font-bold text-zinc-900">Create New Lesson<\/h1>\s*<\/div>/, importUiCode);

fs.writeFileSync('index.js', c);
console.log('ui done');
