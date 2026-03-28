const fs = require('fs');
let c = fs.readFileSync('index.js', 'utf8');

const regex = /if \(foundStudent\) \{[\s\S]*?Class Roster Grades: \${rosterInfo}\.`;\n            \}/;

const repl = `if (foundStudent) {
                context += "\\nNote: The sender is related to student: " + foundStudent.name + " (Email: " + foundStudent.email + "). Current overall grade: " + getGrade(foundStudent.id) + ".";
                
                if (db.messages) {
                    const recentChats = db.messages.filter(m => (m.senderId === foundStudent.id && m.recipientId === teacher.id) || (m.senderId === teacher.id && m.recipientId === foundStudent.id)).sort((a,b) => a.timestamp - b.timestamp).slice(-5);
                    if (recentChats.length > 0) {
                        context += "\\nRecent chat messages with this student:\\n" + recentChats.map(m => (m.senderId === teacher.id ? 'Teacher' : 'Student') + ': ' + m.message).join('\\n');
                    }
                }
            }
            
            if (students.length > 0) {
                const rosterInfo = students.map(s => s.name + ' (' + s.email + ') - Grade: ' + getGrade(s.id)).join(', ');
                context += "\\n\\nFull Class Roster List for reference (Make sure to verify if an email relates to a student using this list. Do not hallucinate students not in this list):\\n" + rosterInfo + ".";
            }`;

c = c.replace(regex, repl);
fs.writeFileSync('index.js', c);
console.log('done replacing');
