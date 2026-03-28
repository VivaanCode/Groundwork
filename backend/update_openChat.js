const fs = require('fs');
let c = fs.readFileSync('index.js', 'utf8');

const oldOpen = `            function openChatFor(name) {
                document.getElementById('teacher-chat-widget').classList.remove('hidden');
                document.getElementById('teacher-chat-messages').style.display = 'flex';
                document.getElementById('teacher-chat-messages').nextElementSibling.style.display = 'flex';
                document.getElementById('current-reply-target').value = name;
                document.getElementById('teacher-msg-input').placeholder = 'Message ' + name + '...';
                document.getElementById('teacher-msg-input').focus();
            }`;

const newOpen = `            async function openChatFor(name) {
                document.getElementById('teacher-chat-widget').classList.remove('hidden');
                document.getElementById('teacher-chat-messages').style.display = 'flex';
                document.getElementById('teacher-chat-messages').nextElementSibling.style.display = 'flex';
                document.getElementById('current-reply-target').value = name;
                document.getElementById('teacher-msg-input').placeholder = 'Message ' + name + '...';
                document.getElementById('teacher-msg-input').focus();
                
                const container = document.getElementById('teacher-chat-messages');
                container.innerHTML = '<div class="text-center text-xs text-zinc-400 my-2"><i data-lucide="loader-2" class="w-3 h-3 animate-spin inline-block"></i> Loading...</div>';
                lucide.createIcons();
                
                try {
                    const res = await fetch('/api/chat/' + encodeURIComponent(name));
                    const messages = await res.json();
                    container.innerHTML = '';
                    if (messages.length === 0) {
                        container.innerHTML = '<div class="text-center text-xs text-zinc-400 my-2">No messages yet.</div>';
                    } else {
                        messages.forEach(m => {
                            const wrap = document.createElement('div');
                            wrap.className = 'w-full flex ' + (m.isSelf ? 'justify-end' : 'justify-start');
                            
                            const msg = document.createElement('div');
                            msg.className = 'p-2 rounded-lg max-w-[85%] ' + (m.isSelf ? 'bg-zinc-950 text-white' : 'bg-white border border-zinc-200 text-zinc-800 cursor-pointer');
                            
                            if (!m.isSelf) {
                                msg.innerHTML = '<div class="text-[9px] font-bold opacity-50 mb-0.5 uppercase">' + m.sender + '</div>';
                                msg.onclick = () => {
                                    document.getElementById('current-reply-target').value = m.sender;
                                    document.getElementById('teacher-msg-input').placeholder = 'Reply to ' + m.sender + '...';
                                    document.getElementById('teacher-msg-input').focus();
                                };
                            }
                            msg.appendChild(document.createTextNode(m.message));
                            wrap.appendChild(msg);
                            container.appendChild(wrap);
                        });
                        container.scrollTop = container.scrollHeight;
                    }
                } catch (e) {
                    container.innerHTML = '<div class="text-center text-xs text-red-400 my-2">Failed to load messages</div>';
                }
            }`;

c = c.replace(oldOpen, newOpen);
fs.writeFileSync('index.js', c);
console.log('done openchatfor');
