const fs = require('fs');
let code = fs.readFileSync('C:/Users/vivaan/Documents/GitHub/Groundwork/backend/index.js', 'utf8');

const regex44 = `if (!db.schoolsByCode) db.schoolsByCode = {};
    }
    } catch (e) {
        console.error('Failed to load db.json', e);`;

const rep44 = `if (!db.schoolsByCode) db.schoolsByCode = {};
    } catch (e) {
        console.error('Failed to load db.json', e);`;

code = code.replace(regex44, rep44);

const regex904 = `        } else {
            req.session.tokens = tokens;
            return res.redirect("/student/dashboard?token=" + user.loginToken); 
        } catch (e) { res.status(500).send("Auth failed: " + e.message); }      
});`;

const rep904 = `        } else {
            req.session.tokens = tokens;
            return res.redirect("/student/dashboard?token=" + user.loginToken); 
        }
    } catch (e) { res.status(500).send("Auth failed: " + e.message); }      
});`;

code = code.replace(regex904, rep904);

fs.writeFileSync('C:/Users/vivaan/Documents/GitHub/Groundwork/backend/index.js', code);
console.log('Fixed syntax correctly');
