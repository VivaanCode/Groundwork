const fs = require('fs');

let code = fs.readFileSync('C:/Users/vivaan/Documents/GitHub/Groundwork/backend/index.js', 'utf8');

const regex = /html \+\= colleagueAssignments\.map\(a => \{[\s\S]*?\}\)\.join\(""\);/;

const replacement = `html += colleagueAssignments.map(a => {
                            const l = db.lessons[a.lessonId];
                            const t = db.users[l.teacherId];
                            const tName = t ? t.name : 'Unknown';
                            const dateStr = new Date(a.dueDate).toLocaleDateString();
                            
                            let iconHtml = '<i data-lucide="calendar" class="w-4 h-4"></i>';
                            let iconBg = 'bg-zinc-100 text-zinc-600';
                            let labelHtml = '';
                            
                            if (l.type === 'guide') {
                                iconHtml = '<i data-lucide="compass" class="w-4 h-4"></i>';
                                iconBg = 'bg-blue-50 text-blue-600';
                                labelHtml = '<span class="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[10px] uppercase font-bold rounded ml-2">Guide</span>';
                            }

                            return '<div class="p-4 bg-white app-border rounded-xl flex justify-between items-center shadow-sm">' +
                                '<div class="flex items-center gap-3">' +
                                '<div class="p-2 ' + iconBg + ' rounded-lg">' + iconHtml + '</div>' +
                                '<div><div class="font-bold text-sm text-zinc-900 flex items-center">' + l.title + labelHtml + '</div>' +
                                '<div class="text-xs text-zinc-500 mt-0.5">Teacher: ' + tName + '</div></div></div>' +
                                '<div class="text-xs font-bold px-2 py-1 bg-red-50 text-red-600 rounded">Due: ' + dateStr + '</div></div>';
                        }).join("");`;

if (regex.test(code)) {
    code = code.replace(regex, replacement);
    fs.writeFileSync('C:/Users/vivaan/Documents/GitHub/Groundwork/backend/index.js', code);
    console.log("Success with regex!");
} else {
    console.log("Failed with regex!");
}