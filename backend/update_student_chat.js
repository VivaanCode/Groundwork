const fs = require('fs');
let c = fs.readFileSync('index.js', 'utf8');

const oldChatHtml = `<div id="chat-container" class="h-64 bg-zinc-50 rounded-lg border border-zinc-100 p-4 overflow-y-auto mb-4 custom-scroll space-y-3">
                   <div class="text-center text-[11px] font-medium text-zinc-400 my-2 uppercase tracking-wider">Chat started</div>
               </div>`;

const newChatHtml = `<div id="chat-container" class="h-64 bg-zinc-50 rounded-lg border border-zinc-100 p-4 overflow-y-auto mb-4 custom-scroll space-y-3">
                   <div class="text-center text-[11px] font-medium text-zinc-400 my-2 uppercase tracking-wider">Chat started</div>
                   \${(() => {
                       if (!db.messages) return '';
                       const chatHistory = db.messages.filter(m => (m.senderId === user.id && m.recipientId === teacherId) || (m.senderId === teacherId && m.recipientId === user.id)).sort((a,b) => a.timestamp - b.timestamp);
                       
                       return chatHistory.map(m => {
                           const isSelf = m.senderId === user.id;
                           const senderName = isSelf ? 'You' : teacher.name;
                           return \`<div class="w-full flex \${isSelf ? 'justify-end' : 'justify-start'}">
                                <div class="p-3 rounded-lg text-sm max-w-[80%] \${isSelf ? 'bg-zinc-950 text-white' : 'bg-white border border-zinc-200 text-zinc-800'}">
                                    \${!isSelf ? \`<div class="text-[10px] font-bold opacity-50 mb-1 uppercase">\${senderName}</div>\` : ''}
                                    \${m.message}
                                </div>
                           </div>\`;
                       }).join('');
                   })()}
               </div>
               <script>
                   setTimeout(() => {
                       const cc = document.getElementById('chat-container');
                       if (cc) cc.scrollTop = cc.scrollHeight;
                   }, 100);
               </script>`;

c = c.replace(oldChatHtml, newChatHtml);

fs.writeFileSync('index.js', c);
console.log('updated student chat');
