const fs = require('fs');
let code = fs.readFileSync('C:/Users/vivaan/Documents/GitHub/Groundwork/backend/index.js', 'utf8');

code = code.replace(/} catch \\(e\\) { res\\.status\\(500\\)\\.send\\("Auth failed:/, "}\n    } catch (e) { res.status(500).send(\"Auth failed:");

fs.writeFileSync('C:/Users/vivaan/Documents/GitHub/Groundwork/backend/index.js', code);
console.log("done");
