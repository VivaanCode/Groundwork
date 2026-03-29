const fs = require('fs');
let index = fs.readFileSync('backend/index.js', 'utf8');

const target = `<a href="\${actionHref}" \${actionTarget} class="px-3 py-1.5 bg-white border border-zinc-200 text-xs font-semibold rounded shadow-sm hover:bg-zinc-100 \${isCompleted ? 'text-zinc-600' : ''}">
                                            \${actionText}
                                        </a>`;

const replacement = `\${isCompleted && lesson.type === 'test' ? \`
<span class="px-3 py-1.5 text-xs font-semibold text-zinc-400">
    Submitted
</span>
\` : \`
<a href="\${actionHref}" \${actionTarget} class="px-3 py-1.5 bg-white border border-zinc-200 text-xs font-semibold rounded shadow-sm hover:bg-zinc-100 \${isCompleted ? 'text-zinc-600' : ''}">
    \${actionText}
</a>
\`}`;

index = index.split(target).join(replacement);
fs.writeFileSync('backend/index.js', index);
console.log('Fixed buttons.');