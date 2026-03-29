let cachedResults = [];

document.getElementById('search-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = document.getElementById('search-query').value;
    const resultsContainer = document.getElementById('results-container');
    const summaryBox = document.getElementById('ai-summary-box');
    const summaryContent = document.getElementById('ai-summary-content');
    const chatInput = document.getElementById('chat-input');
    const chatBtn = document.getElementById('chat-btn');

    resultsContainer.innerHTML = '<div class="p-8 text-center text-zinc-500"><i data-lucide="loader" class="w-8 h-8 mx-auto mb-2 animate-spin"></i> Searching academic sources...</div>';
    lucide.createIcons();

    // Call search
    try {
        const res = await fetch('/api/research/search?q=' + encodeURIComponent(q));
        const data = await res.json();
        
        if (!data.results || data.results.length === 0) {
            resultsContainer.innerHTML = '<div class="p-8 text-center bg-white border border-zinc-200 rounded-xl">No results found for your query. Try different keywords.</div>';
            return;
        }

        cachedResults = data.results.slice(0, 5); // take top 5
        
        let html = '';
        cachedResults.forEach((r, idx) => {
            html += '<div class="p-5 bg-white border border-zinc-200 rounded-xl hover:shadow-md transition-shadow">' +
                    '<a href="' + r.url + '" target="_blank" class="text-blue-600 font-bold text-lg hover:underline">' + r.title + '</a>' +
                    '<div class="text-xs text-green-700 mb-2 truncate">' + r.url + '</div>' +
                    '<p class="text-sm text-zinc-600">' + r.description + '</p>' +
                '</div>';
        });
        resultsContainer.innerHTML = html;

        // Fetch AI summary using these results
        summaryBox.classList.remove('hidden');
        summaryContent.innerHTML = '<i data-lucide="loader" class="w-4 h-4 inline animate-spin"></i> Generating summary & citations...';
        lucide.createIcons();

        const aiRes = await fetch('/api/research/summarize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: q, results: cachedResults })
        });
        const aiData = await aiRes.json();
        if (aiData.result) {
            let parsed = aiData.result.replace(/\n/g, '<br>');
            summaryContent.innerHTML = parsed;
            
            // Enable chat
            chatInput.disabled = false;
            chatBtn.disabled = false;
        } else {
            summaryContent.innerHTML = 'Failed to generate summary.';
        }

    } catch (err) {
        resultsContainer.innerHTML = '<div class="p-8 text-center text-red-500 bg-red-50 border border-red-200 rounded-xl">Error executing search.</div>';
    }
});
