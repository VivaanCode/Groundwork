const fs = require('fs');

let code = fs.readFileSync('C:/Users/vivaan/Documents/GitHub/Groundwork/backend/index.js', 'utf8');

const regex = /<a href="\/teacher\/lessons\/create"([\s\S]*?)<div class="text-left font-bold text-sm">Create Lesson<\/div>\s*<\/a>/;

const match = code.match(regex);
if (match) {
    const replacementStr = match[0] + `
                      <a href="/teacher/rubric/create" class="p-5 bg-white app-border rounded-xl flex flex-col items-start gap-3 hover:shadow-md transition-all group block" style="text-decoration:none; color:inherit;">
                          <div class="p-2 bg-pink-50 text-pink-600 rounded-lg group-hover:scale-110 transition-transform"><i data-lucide="file-check-2" class="w-5 h-5"></i></div>
                          <div class="text-left font-bold text-sm">Create Rubric</div>
                      </a>`;
                      
    code = code.replace(regex, replacementStr);
    code = code.replace('<div class="grid grid-cols-2 gap-4">', '<div class="grid grid-cols-2 md:grid-cols-3 gap-4">');
    
    fs.writeFileSync('C:/Users/vivaan/Documents/GitHub/Groundwork/backend/index.js', code);
    console.log("Dashboard rubric link added with regex");
} else {
    console.log("Failed to find command center link target with regex");
}
