const fs = require('fs');

let code = fs.readFileSync('C:/Users/vivaan/Documents/GitHub/Groundwork/backend/index.js', 'utf8');

const startIndex = code.indexOf('<div class="col-span-12 lg:col-span-8 space-y-6">');
const endIndexStr = '<div class="col-span-12 lg:col-span-4 space-y-6 mt-8 lg:mt-0">';
const endIndex = code.indexOf(endIndexStr);

if (startIndex === -1 || endIndex === -1) {
    console.log("Could not find boundaries");
    process.exit(1);
}

const replacement = `<div class="col-span-12 lg:col-span-8 space-y-6">
                <div class="bg-white app-border rounded-xl p-6 shadow-sm">
                    <h2 class="text-[13px] font-bold text-zinc-400 uppercase tracking-widest mb-4">Current Tasks & Lessons</h2>
                    <div class="space-y-3">
                        \${(() => {
                            const allAssignments = Object.values(db.assignments || {}).filter(a => a.classCode === user.classCode);
                            const currentAssignments = allAssignments.filter(assignment => {
                                const lesson = db.lessons[assignment.lessonId];
                                if (!lesson) return false;
                                const progress = Object.values(db.studentProgress || {}).find(p => p.studentId === user.id && p.assignmentId === assignment.id);
                                let progressPercent = progress && lesson.slides && lesson.slides.length ? Math.round((progress.progress / lesson.slides.length) * 100) : 0;
                                if (lesson.type === 'guide') { progressPercent = progress && progress.completed ? 100 : 0; }
                                return progressPercent < 100;
                            });

                            const renderAssignment = (assignment, isCompleted) => {
                                const lesson = db.lessons[assignment.lessonId];
                                const progress = Object.values(db.studentProgress || {}).find(p => p.studentId === user.id && p.assignmentId === assignment.id);
                                let progressPercent = progress && lesson.slides && lesson.slides.length ? Math.round((progress.progress / lesson.slides.length) * 100) : 0;
                                if (lesson.type === 'guide') { progressPercent = progress && progress.completed ? 100 : 0; }
                                
                                let icon = '<i data-lucide="book-open" class="w-4 h-4"></i>';
                                let iconBg = 'bg-orange-100 text-orange-600';
                                let label = '';
                                let actionHref = \`/student/lesson/\${assignment.id}\`;
                                let actionText = isCompleted ? 'Review' : (progressPercent === 0 ? 'Start' : 'Resume');
                                let actionTarget = '';

                                if (lesson.type === 'guide') {
                                    icon = '<i data-lucide="compass" class="w-4 h-4"></i>';
                                    iconBg = 'bg-blue-100 text-blue-600';
                                    label = '<span class="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[10px] uppercase font-bold rounded ml-2">Guide</span>';
                                    actionHref = \`/student/lesson/\${assignment.id}\`; // this will redirect
                                    // Or can we do: actionHref = lesson.guideURL ? lesson.guideURL : actionHref;
                                    if (lesson.guideURL) {
                                        actionHref = lesson.guideURL;
                                        actionTarget = 'target="_blank"';
                                    }
                                    actionText = isCompleted ? 'Review Link' : 'Open Link';
                                }
                                
                                if (isCompleted) {
                                    icon = '<i data-lucide="check-circle" class="w-4 h-4"></i>';
                                    iconBg = 'bg-green-100 text-green-600';
                                }

                                return \`
                                    <div class="flex items-center justify-between p-4 bg-zinc-50 border border-zinc-100 rounded-lg hover:border-zinc-300 transition-colors cursor-pointer group \${isCompleted ? 'opacity-75' : ''}">
                                        <div class="flex items-center gap-3 flex-1">
                                            <div class="p-2 \${iconBg} rounded-md group-hover:scale-110 transition-transform">
                                                \${icon}
                                            </div>
                                            <div class="flex-1">
                                                <div class="font-bold text-sm text-zinc-900 flex items-center">\${lesson.title}\${label}</div>
                                                <div class="text-[11px] font-medium text-zinc-500 mt-0.5">
                                                    \${isCompleted ? 'Completed' : \`Due: \${assignment.dueDate ? new Date(assignment.dueDate).toLocaleDateString() : 'No Due Date'} &bull; Progress: \${progressPercent}%\`}
                                                </div>
                                                \${!isCompleted && lesson.type !== 'guide' ? \`
                                                <div class="w-32 h-1.5 bg-zinc-200 rounded-full mt-1.5 overflow-hidden">
                                                    <div class="h-full bg-accent transition-all" style="width: \${progressPercent}%"></div>
                                                </div>
                                                \` : ''}
                                            </div>
                                        </div>
                                        <a href="\${actionHref}" \${actionTarget} class="px-3 py-1.5 bg-white border border-zinc-200 text-xs font-semibold rounded shadow-sm hover:bg-zinc-100 \${isCompleted ? 'text-zinc-600' : ''}">
                                            \${actionText}
                                        </a>
                                    </div>
                                \`;
                            };

                            return currentAssignments.length > 0 ? currentAssignments.map(a => renderAssignment(a, false)).join("") : '<div class="text-center py-10 bg-zinc-50 border border-zinc-100 rounded-xl"><div class="text-5xl mb-4">🌴</div><h4 class="text-sm font-bold text-zinc-900 mb-1">Catching a break!</h4><p class="text-xs text-zinc-500">No active lessons assigned yet.</p></div>';
                        })()}
                    </div>
                </div>

                <div class="bg-white app-border rounded-xl p-6 shadow-sm mt-6">
                    <h2 class="text-[13px] font-bold text-zinc-400 uppercase tracking-widest mb-4">Completed Lessons</h2>
                    <div class="space-y-3">
                        \${(() => {
                            const allAssignments = Object.values(db.assignments || {}).filter(a => a.classCode === user.classCode);
                            const completedAssignments = allAssignments.filter(assignment => {
                                const lesson = db.lessons[assignment.lessonId];
                                if (!lesson) return false;
                                const progress = Object.values(db.studentProgress || {}).find(p => p.studentId === user.id && p.assignmentId === assignment.id);
                                let progressPercent = progress && lesson.slides && lesson.slides.length ? Math.round((progress.progress / lesson.slides.length) * 100) : 0;
                                if (lesson.type === 'guide') { progressPercent = progress && progress.completed ? 100 : 0; }
                                return progressPercent >= 100;
                            });

                            // Re-using the render function
                            const renderAssignment = (assignment, isCompleted) => {
                                const lesson = db.lessons[assignment.lessonId];
                                const progress = Object.values(db.studentProgress || {}).find(p => p.studentId === user.id && p.assignmentId === assignment.id);
                                let progressPercent = progress && lesson.slides && lesson.slides.length ? Math.round((progress.progress / lesson.slides.length) * 100) : 0;
                                if (lesson.type === 'guide') { progressPercent = progress && progress.completed ? 100 : 0; }
                                
                                let icon = '<i data-lucide="book-open" class="w-4 h-4"></i>';
                                let iconBg = 'bg-orange-100 text-orange-600';
                                let label = '';
                                let actionHref = \`/student/lesson/\${assignment.id}\`;
                                let actionText = isCompleted ? 'Review' : (progressPercent === 0 ? 'Start' : 'Resume');
                                let actionTarget = '';

                                if (lesson.type === 'guide') {
                                    icon = '<i data-lucide="compass" class="w-4 h-4"></i>';
                                    iconBg = 'bg-blue-100 text-blue-600';
                                    label = '<span class="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[10px] uppercase font-bold rounded ml-2">Guide</span>';
                                    if (lesson.guideURL) {
                                        actionHref = lesson.guideURL;
                                        actionTarget = 'target="_blank"';
                                    }
                                    actionText = isCompleted ? 'Review Link' : 'Open Link';
                                }
                                
                                if (isCompleted) {
                                    icon = '<i data-lucide="check-circle" class="w-4 h-4"></i>';
                                    iconBg = 'bg-green-100 text-green-600';
                                }

                                return \`
                                    <div class="flex items-center justify-between p-4 bg-zinc-50 border border-zinc-100 rounded-lg hover:border-zinc-300 transition-colors cursor-pointer group \${isCompleted ? 'opacity-75' : ''}">
                                        <div class="flex items-center gap-3 flex-1">
                                            <div class="p-2 \${iconBg} rounded-md group-hover:scale-110 transition-transform">
                                                \${icon}
                                            </div>
                                            <div class="flex-1">
                                                <div class="font-bold text-sm text-zinc-900 flex items-center">\${lesson.title}\${label}</div>
                                                <div class="text-[11px] font-medium text-zinc-500 mt-0.5">
                                                    \${isCompleted ? 'Completed' : \`Due: \${assignment.dueDate ? new Date(assignment.dueDate).toLocaleDateString() : 'No Due Date'} &bull; Progress: \${progressPercent}%\`}
                                                </div>
                                                \${!isCompleted && lesson.type !== 'guide' ? \`
                                                <div class="w-32 h-1.5 bg-zinc-200 rounded-full mt-1.5 overflow-hidden">
                                                    <div class="h-full bg-accent transition-all" style="width: \${progressPercent}%"></div>
                                                </div>
                                                \` : ''}
                                            </div>
                                        </div>
                                        <a href="\${actionHref}" \${actionTarget} class="px-3 py-1.5 bg-white border border-zinc-200 text-xs font-semibold rounded shadow-sm hover:bg-zinc-100 \${isCompleted ? 'text-zinc-600' : ''}">
                                            \${actionText}
                                        </a>
                                    </div>
                                \`;
                            };

                            return completedAssignments.length > 0 ? completedAssignments.map(a => renderAssignment(a, true)).join("") : '<div class="text-center py-6 text-zinc-500 text-sm">No completed lessons yet.</div>';
                        })()}
                    </div>
                </div>
            </div>

            `;

code = code.substring(0, startIndex) + replacement + code.substring(endIndex);

fs.writeFileSync('C:/Users/vivaan/Documents/GitHub/Groundwork/backend/index.js', code);
console.log("Teacher dashboard replacement complete!");
