const fs = require('fs');

let code = fs.readFileSync('C:/Users/vivaan/Documents/GitHub/Groundwork/backend/index.js', 'utf8');

const targetStr = `<a href="/teacher/lessons/create" class="p-5 bg-white app-border rounded-xl flex flex-col items-start gap-3 hover:shadow-md transition-all group block" style="text-decoration:none; color:inherit;">
                            <div class="p-2 bg-blue-50 text-blue-600 rounded-lg group-hover:scale-110 transition-transform"><i data-lucide="sparkles" class="w-5 h-5"></i></div>
                            <div class="text-left font-bold text-sm">Create Lesson</div>
                        </a>`;

const replacementStr = `<a href="/teacher/lessons/create" class="p-5 bg-white app-border rounded-xl flex flex-col items-start gap-3 hover:shadow-md transition-all group block" style="text-decoration:none; color:inherit;">
                            <div class="p-2 bg-blue-50 text-blue-600 rounded-lg group-hover:scale-110 transition-transform"><i data-lucide="sparkles" class="w-5 h-5"></i></div>
                            <div class="text-left font-bold text-sm">Create Lesson</div>
                        </a>
                        <a href="/teacher/rubric/create" class="p-5 bg-white app-border rounded-xl flex flex-col items-start gap-3 hover:shadow-md transition-all group block" style="text-decoration:none; color:inherit;">
                            <div class="p-2 bg-pink-50 text-pink-600 rounded-lg group-hover:scale-110 transition-transform"><i data-lucide="file-check-2" class="w-5 h-5"></i></div>
                            <div class="text-left font-bold text-sm">Create Rubric</div>
                        </a>`;

if (code.includes(targetStr)) {
    code = code.replace(targetStr, replacementStr);
    // Also change grid-cols-2 to grid-cols-2 lg:grid-cols-3 if we want it to look nice? Let's just do grid-cols-2 md:grid-cols-3
    code = code.replace('<div class="grid grid-cols-2 gap-4">', '<div class="grid grid-cols-2 md:grid-cols-3 gap-4">');
    fs.writeFileSync('C:/Users/vivaan/Documents/GitHub/Groundwork/backend/index.js', code);
    console.log("Dashboard rubric link added");
} else {
    console.log("Failed to find command center link target in backend/index.js");
}
