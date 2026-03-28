const fs = require('fs');
let c = fs.readFileSync('index.js', 'utf8');

const regex2 = /<div class="col-span-12 lg:col-span-4">\s*<h2 class="text-\[13px\] font-bold text-zinc-400 uppercase tracking-widest mb-4 flex items-center justify-between">Inbox Stream <a href="\/teacher\/email" class="text-\[10px\] text-accent hover:underline">View All<\/a><\/h2>\s*<div class="bg-white app-border rounded-xl overflow-hidden shadow-sm max-h-\[350px\] overflow-y-auto custom-scroll">\s*\$\{emailHtml\}\s*<\/div>\s*<\/div>/;

const repl2 = `<div class="col-span-12 lg:col-span-4 flex flex-col gap-8">
                <div>
                    <h2 class="text-[13px] font-bold text-zinc-400 uppercase tracking-widest mb-4 flex items-center justify-between">Recent Chats</h2>
                    <div class="bg-white app-border rounded-xl overflow-hidden shadow-sm max-h-[350px] overflow-y-auto custom-scroll">
                        \${(() => {
                            if (!db.messages || db.messages.length === 0) return '<div class="p-8 text-center text-zinc-400 text-sm">No messages yet.</div>';
                            
                            const teacherMessages = db.messages.filter(m => m.recipientId === user.id || m.senderId === user.id);
                            const latestByStudent = {};
                            teacherMessages.forEach(m => {
                                const studentId = m.senderId === user.id ? m.recipientId : m.senderId;
                                const student = db.users[studentId];
                                if (student && student.role === 'student') {
                                    if (!latestByStudent[studentId] || latestByStudent[studentId].timestamp < m.timestamp) {
                                        latestByStudent[studentId] = { student, message: m, unread: m.recipientId === user.id && !m.read ? true : false };
                                    }
                                }
                            });
                            
                            const sorted = Object.values(latestByStudent).sort((a,b) => b.message.timestamp - a.message.timestamp);
                            if (sorted.length === 0) return '<div class="p-8 text-center text-zinc-400 text-sm">No messages yet.</div>';
                            
                            return sorted.map(item => \`<div class="p-3 bg-white border-b border-zinc-100 last:border-0 hover:bg-zinc-50 transition-colors cursor-pointer group" onclick="openChatFor('\${item.student.name}')">
                                <div class="flex justify-between items-start mb-1">
                                    <span class="text-[12px] font-bold text-zinc-900 flex items-center gap-1">\${item.student.name} \${item.unread ? '<div class="w-1.5 h-1.5 bg-red-500 rounded-full"></div>' : ''}</span>
                                    <span class="text-[10px] text-zinc-400">\${new Date(item.message.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                </div>
                                <div class="text-[12px] font-medium text-zinc-700 truncate">\${item.message.senderId === user.id ? 'You: ' : ''}\${item.message.message}</div>
                            </div>\`).join("");
                        })()}
                    </div>
                </div>

                <div>
                    <h2 class="text-[13px] font-bold text-zinc-400 uppercase tracking-widest mb-4 flex items-center justify-between">Inbox Stream <a href="/teacher/email" class="text-[10px] text-accent hover:underline">View All</a></h2>        
                    <div class="bg-white app-border rounded-xl overflow-hidden shadow-sm max-h-[350px] overflow-y-auto custom-scroll">
                        \${emailHtml}
                    </div>
                </div>
            </div>`;

c = c.replace(regex2, repl2);

// Make sure `teacherMessages` variable scope doesn't leak. The IIFE avoids it.

fs.writeFileSync('index.js', c);
console.log('done replacing layout');
