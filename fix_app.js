const fs = require('fs');
let code = fs.readFileSync('backend/index.js', 'utf8');
const searchLink = \<a href="/student/research" class="flex items-center gap-2.5 px-2 py-1.5 text-[13px] font-medium text-zinc-500 hover:text-zinc-900"><i data-lucide="search" class="w-4 h-4"></i> Research</a>\;

if (code.includes('Student Dashboard')) {
  console.log("has student dash");
} else {
  // Let's find out how the layout works
  const match = code.match(/function renderDashboard\([^)]+\) \{\s+return \([\s\S]+?)\;\s+\}/);
  if (match) {
        console.log("Found renderDashboard");
  } else {
        console.log("Not found renderDashboard by that regex");
  }
}
