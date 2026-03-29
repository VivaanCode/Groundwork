const fs = require('fs');
let code = fs.readFileSync('C:/Users/vivaan/Documents/GitHub/Groundwork/backend/index.js', 'utf8');

const regex = /\} catch \(e\)/;
const replacement = `}
    } catch (e)`;

code = code.replace(regex, replacement);

fs.writeFileSync('C:/Users/vivaan/Documents/GitHub/Groundwork/backend/index.js', code);
console.log('Fixed syntax error');
