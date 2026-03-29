const fs = require('fs');
let content = fs.readFileSync('backend/index.js', 'utf8');
content = content.replace(if (lesson.type === 'guide') {, if (lesson.type === 'test') { actionHref = '/student/test/' + assignment.id; actionText = isCompleted ? 'Review Test' : 'Start Test'; label = '<span class=\"px-1.5 py-0.5 bg-red-100 text-red-700 text-[10px] uppercase font-bold rounded ml-2\">Test</span>'; iconBg = 'bg-red-100 text-red-600'; icon = '<i data-lucide=\"file-warning\" class=\"w-4 h-4\"></i>'; }\n                                if (lesson.type === 'guide') {);
fs.writeFileSync('backend/index.js', content);
console.log('done dashboard link');
