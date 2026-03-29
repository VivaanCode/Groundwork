const fs = require('fs');
let code = fs.readFileSync('C:/Users/vivaan/Documents/GitHub/Groundwork/backend/index.js', 'utf8');

// 1. Teacher due date modal replacing inline text
const teacherDueDateOld = `document.getElementById('dueDateInput').addEventListener('change', function(e) {
                const selectedDate = e.target.value;
                const warningBox = document.getElementById('dateWarning');
                const warningText = document.getElementById('dateWarningText');
                
                if (!selectedDate || colleagueAssignments.length === 0) {
                    warningBox.classList.add('hidden');
                    return;
                }
                
                const conflicts = colleagueAssignments.filter(function(a) { return a.date === selectedDate; });
                
                if (conflicts.length > 0) {
                    const msg = conflicts.map(function(c) { return '<li><strong>' + c.title + '</strong> (' + c.teacherName + ')'; }).join('');
                    warningText.innerHTML = 'Your colleagues also have assignments due on this date:<ul class="list-disc ml-4 mt-2">' + msg + '</ul>';
                    warningBox.classList.remove('hidden');
                } else {
                    warningBox.classList.add('hidden');
                }
            });`;

const teacherDueDateNew = `document.getElementById('dueDateInput').addEventListener('change', function(e) {
                const selectedDate = e.target.value;
                const warningBox = document.getElementById('dateWarning');
                const warningText = document.getElementById('dateWarningText');
                
                if (!selectedDate || colleagueAssignments.length === 0) {
                    warningBox.classList.add('hidden');
                    return;
                }
                
                const conflicts = colleagueAssignments.filter(function(a) { return a.date === selectedDate; });
                
                if (conflicts.length > 0) {
                    const msg = conflicts.map(function(c) { return '<li><strong>' + c.title + '</strong> (' + c.teacherName + ')'; }).join('');
                    showAppModal('Schedule Conflict Warning', 'This due date overlaps with assignments from other teachers in your school. This might overwhelm students. <br><br>The following assignments are also due on ' + new Date(selectedDate).toLocaleDateString() + ':<ul class="list-disc ml-6 mt-2 text-sm">' + msg + '</ul>');
                    warningBox.classList.remove('hidden');
                    warningText.innerHTML = 'There are ' + conflicts.length + ' other assignments due on this date.';
                } else {
                    warningBox.classList.add('hidden');
                }
            });`;

code = code.replace(teacherDueDateOld, teacherDueDateNew);

// 2 & 3. Study Group peers logic
const peersOld = `    const peers = Object.values(db.studentProgress)
        .filter(p => p.assignmentId === assignmentId && p.studentId !== student.id)
        .map(p => ({
            progress: p,
            user: db.users[p.studentId]
        }))
        .filter(p => p.user && p.user.classCode === student.classCode);`;

const peersNew = `    const studentsInClass = Object.values(db.users).filter(u => u.role === 'student' && u.classCode === student.classCode && u.id !== student.id);
    const peers = studentsInClass.map(u => {
        const progress = Object.values(db.studentProgress).find(p => p.studentId === u.id && p.assignmentId === assignmentId) || {};
        return { user: u, progress: progress };
    });`;

code = code.replace(peersOld, peersNew);

const peerMapOld = `                \${peers.length > 0 ? peers.map(p => \`
                    <div class="flex items-center justify-between p-4 border border-zinc-100 rounded-xl hover:border-zinc-300 transition-all bg-white shadow-sm hover:shadow-md">
                        <div class="flex items-center gap-4">
                            <img src="\${p.user.picture || 'https://via.placeholder.com/150'}" alt="\${p.user.name}" class="w-10 h-10 rounded-full border border-zinc-200 object-cover">
                            <div>
                                <h3 class="font-bold text-zinc-900 text-sm">\${p.user.name}</h3>
                                <p class="text-xs text-zinc-500 mt-0.5">Progress: Slide \${(p.progress.progress || 0) + 1} of \${lesson.slides.length}</p>
                            </div>
                        </div>
                        <span class="text-[10px] font-bold px-2 py-1 bg-emerald-100 text-emerald-700 rounded-lg flex items-center gap-1 uppercase tracking-widest">
                            <i data-lucide="circle-dot" class="w-3 h-3"></i> Working
                        </span>
                    </div>
                \`).join('') : \`
                    <div class="text-center py-8 text-zinc-500 border border-dashed border-zinc-200 rounded-xl bg-zinc-50 text-sm">
                        No other students have started this lesson yet. Be the first!
                    </div>
                \`}`;

const peerMapNew = `                \${peers.length > 0 ? peers.map(p => \`
                    <div class="flex flex-col sm:flex-row sm:items-center justify-between p-4 border border-zinc-100 rounded-xl hover:border-zinc-300 transition-all bg-white shadow-sm hover:shadow-md gap-4">
                        <div class="flex items-center gap-4">
                            <img src="\${p.user.picture || 'https://via.placeholder.com/150'}" alt="\${p.user.name}" class="w-10 h-10 rounded-full border border-zinc-200 object-cover">
                            <div>
                                <h3 class="font-bold text-zinc-900 text-sm">\${p.user.name}</h3>
                                <p class="text-xs text-zinc-500 mt-0.5">Progress: \${p.progress.id ? 'Slide ' + ((p.progress.progress || 0) + 1) + ' of ' + lesson.slides.length : 'Not Started'}</p>
                            </div>
                        </div>
                        <div class="flex items-center gap-3">
                            <span class="text-[10px] font-bold px-2 py-1 \${p.progress.id ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-100 text-zinc-600'} rounded-lg flex items-center gap-1 uppercase tracking-widest">
                                \${p.progress.id ? '<i data-lucide="circle-dot" class="w-3 h-3"></i> Working' : 'Inactive'}
                            </span>
                            <a href="/student/contact-teacher?peer=\${p.user.id}" class="px-3 py-1.5 bg-indigo-50 text-indigo-700 text-xs font-bold rounded-lg hover:bg-indigo-100 transition-colors flex items-center gap-1" style="text-decoration:none;">
                                <i data-lucide="message-square" class="w-3 h-3"></i> Message
                            </a>
                        </div>
                    </div>
                \`).join('') : \`
                    <div class="text-center py-8 text-zinc-500 border border-dashed border-zinc-200 rounded-xl bg-zinc-50 text-sm">
                        There are no other students in your class to study with.
                    </div>
                \`}`;

code = code.replace(peerMapOld, peerMapNew);

// 4. Logo redirection
const logoOld = `<div class="flex items-center gap-2">
                <div class="w-5 h-5 bg-zinc-950 flex items-center justify-center rounded-[3px]">
                    <div class="w-1.5 h-1.5 bg-white rounded-full"></div>       
                </div>
                <span class="font-medium text-sm tracking-tight">ClassLoop</span>
            </div>`;

const logoNew = `<a href="\${user ? '/' + user.role + '/dashboard' : '/'}" class="flex items-center gap-2" style="text-decoration:none; color:inherit;">
                <div class="w-5 h-5 bg-zinc-950 flex items-center justify-center rounded-[3px]">
                    <div class="w-1.5 h-1.5 bg-white rounded-full"></div>       
                </div>
                <span class="font-medium text-sm tracking-tight">ClassLoop</span>
            </a>`;

const logoLandingOld = `<div class="flex items-center gap-2">
        <div class="w-5 h-5 bg-zinc-950 flex items-center justify-center rounded-[3px]">
          <div class="w-1.5 h-1.5 bg-white rounded-full"></div>
        </div>
        <span class="font-medium text-sm tracking-tight">ClassLoop</span>
      </div>`;

const logoLandingNew = `<a href="/" class="flex items-center gap-2" style="text-decoration:none; color:inherit;">
        <div class="w-5 h-5 bg-zinc-950 flex items-center justify-center rounded-[3px]">
          <div class="w-1.5 h-1.5 bg-white rounded-full"></div>
        </div>
        <span class="font-medium text-sm tracking-tight">ClassLoop</span>
      </a>`;

code = code.replace(logoOld, logoNew);
code = code.replace(logoLandingOld, logoLandingNew);

// Fix potential issue where user isn't defined on landing page
// Not needed if we only replace inside renderDashboard and renderLandingPage respectively.
// Wait, the first replacement is for renderDashboard, let's verify if `logoOld` matched. It did.

fs.writeFileSync('C:/Users/vivaan/Documents/GitHub/Groundwork/backend/index.js', code);
console.log('Applied main fixes');
