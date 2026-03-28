const fs = require('fs');
let c = fs.readFileSync('index.js', 'utf8');

c = c.replace(/<a href="\/teacher\/login"[^>]*>Access Platform<\/a>/,
    `<div class="flex gap-2">
        <a href="/teacher/login" class="bg-zinc-950 text-white px-3.5 py-1.5 rounded-md text-[13px] font-medium hover:bg-zinc-800 transition-all font-semibold" style="text-decoration:none;">Teacher Login</a>
        <a href="/student/login" class="bg-white border border-zinc-200 text-zinc-900 px-3.5 py-1.5 rounded-md text-[13px] font-medium hover:bg-zinc-50 shadow-sm transition-all font-semibold" style="text-decoration:none;">Student Login</a>
    </div>`);

fs.writeFileSync('index.js', c);
console.log('Landing page patched');
