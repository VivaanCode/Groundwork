const fs = require('fs');
let c = fs.readFileSync('index.js', 'utf8');

const sSendMessage = `socket.on('send-message', (data) => {
        const { senderId, recipientId, message } = data;
        const senderInfo = db.users[senderId];
        const senderName = senderInfo ? senderInfo.name : 'Student';

        if (!db.messages) db.messages = [];
        db.messages.push({
            id: Date.now().toString() + Math.random().toString(),
            senderId,
            recipientId,
            message,
            timestamp: Date.now()
        });

        const recipientSocket = connectedUsers[recipientId];
        if (recipientSocket) {
            io.to(recipientSocket).emit('receive-message', {
                from: senderName,
                message: message,
                senderId: senderId
            });
        }
    });`;

const sTeacherReply = `socket.on('teacher-reply', (data) => {
        const { senderId, recipientName, message } = data;
        const teacher = db.users[senderId];
        if (!teacher) return;

        let recipientId = null;
        for (const uid in db.users) {
            const u = db.users[uid];
            if (u.role === 'student' && u.classCode === teacher.classCode && u.name === recipientName) {
                recipientId = u.id;
                break;
            }
        }

        if (recipientId) {
            if (!db.messages) db.messages = [];
            db.messages.push({
                id: Date.now().toString() + Math.random().toString(),
                senderId,
                recipientId,
                message,
                timestamp: Date.now()
            });

            const recipientSocket = connectedUsers[recipientId];
            if (recipientSocket) {
                io.to(recipientSocket).emit('receive-message', {
                    from: teacher.name,
                    message: message,
                    senderId: senderId
                });
            }
        }
    });`;

c = c.replace(/socket\.on\('send-message', \(data\) => \{[\s\S]*?\}\);\n/m, sSendMessage + '\n');
c = c.replace(/socket\.on\('teacher-reply', \(data\) => \{[\s\S]*?\}\);\n/m, sTeacherReply + '\n');

fs.writeFileSync('index.js', c);
console.log('socket complete');
