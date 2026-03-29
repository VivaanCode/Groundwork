const fs = require('fs');
let code = fs.readFileSync('C:/Users/vivaan/Documents/GitHub/Groundwork/backend/index.js', 'utf8');

const regex = /\} catch \(e\) \{ res\.status\(500\)\.send\("Auth failed:" \+ e\.message\); \}/;
const replacement = `}
    } catch (e) { res.status(500).send("Auth failed: " + e.message); }`;

// actually check for spaces and just use indexof
const searchString = `} catch (e) { res.status(500).send("Auth failed: " + e.message); }`;
const replacementString = `}
    } catch (e) { res.status(500).send("Auth failed: " + e.message); }`;

code = code.replace(searchString, replacementString);

fs.writeFileSync('C:/Users/vivaan/Documents/GitHub/Groundwork/backend/index.js', code);
console.log("done");
