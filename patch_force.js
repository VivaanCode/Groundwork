const fs = require('fs');
let code = fs.readFileSync('extension/background.js', 'utf8');
code = code.replace(/if \(message\.type === "END_TEST"\) \{/, \if (message.type === "FORCE_FULLSCREEN") {
        if (testWindowId) chrome.windows.update(testWindowId, { state: "fullscreen" });
        return true;
    }
    if (message.type === "END_TEST") {\);
fs.writeFileSync('extension/background.js', code);
console.log('Force fullscreen added');
