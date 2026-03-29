const fs = require('fs');
let code = fs.readFileSync('C:/Users/vivaan/Documents/GitHub/Groundwork/backend/index.js', 'utf8');

// I will globally remove actionTarget = 'target="_blank"'; since the user explicitly wants them in the same tab.
code = code.replace(/actionTarget = 'target="_blank"';/g, "actionTarget = '';");

fs.writeFileSync('C:/Users/vivaan/Documents/GitHub/Groundwork/backend/index.js', code);
console.log("Removed target=_blank");
