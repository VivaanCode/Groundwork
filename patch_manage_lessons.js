const fs = require('fs');

let code = fs.readFileSync('C:/Users/vivaan/Documents/GitHub/Groundwork/backend/index.js', 'utf8');

const searchString = `            \${allAssignments.length > 0 ? allAssignments.map(assignment => {    
                const lesson = db.lessons[assignment.lessonId];
                if (!lesson) return '';
                return \`
                    <div class="p-5 bg-white app-border rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4 hover:shadow-md transition-shadow">
                        <div class="flex items-center gap-4">
                            <div class="p-3 bg-indigo-50 text-indigo-600 rounded-lg">
                                <i data-lucide="book-open" class="w-6 h-6"></i> 
                            </div>
                            <div>
                                <div class="font-bold text-zinc-900">\${lesson.title}</div>
                                <div class="text-xs text-zinc-500 mt-1">        
                                    Assigned: \${new Date(assignment.assignedAt || lesson.createdAt || Date.now()).toLocaleDateString()} &bull; Due: \${assignment.dueDate ? new Date(assignment.dueDate).toLocaleDateString() : 'No Due Date'}   
                                </div>
                            </div>
                        </div>`;

const replacementString = `            \${allAssignments.length > 0 ? allAssignments.map(assignment => {    
                const lesson = db.lessons[assignment.lessonId];
                if (!lesson) return '';
                
                let icon = '<i data-lucide="book-open" class="w-6 h-6"></i>';
                let iconBg = 'bg-indigo-50 text-indigo-600';
                let label = '';
                
                if (lesson.type === 'guide') {
                    icon = '<i data-lucide="compass" class="w-6 h-6"></i>';
                    iconBg = 'bg-blue-50 text-blue-600';
                    label = '<span class="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[10px] uppercase font-bold rounded ml-2">Guide</span>';
                }

                return \`
                    <div class="p-5 bg-white app-border rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4 hover:shadow-md transition-shadow">
                        <div class="flex items-center gap-4">
                            <div class="p-3 \${iconBg} rounded-lg">
                                \${icon}
                            </div>
                            <div>
                                <div class="font-bold text-zinc-900 flex items-center">\${lesson.title}\${label}</div>
                                <div class="text-xs text-zinc-500 mt-1">        
                                    Assigned: \${new Date(assignment.assignedAt || lesson.createdAt || Date.now()).toLocaleDateString()} &bull; Due: \${assignment.dueDate ? new Date(assignment.dueDate).toLocaleDateString() : 'No Due Date'}   
                                </div>
                            </div>
                        </div>`;

if (code.includes(searchString)) {
    code = code.replace(searchString, replacementString);
    fs.writeFileSync('C:/Users/vivaan/Documents/GitHub/Groundwork/backend/index.js', code);
    console.log("Manage lessons patched successfully");
} else {
    console.log("Could not find the target string in manage lessons");
}