const crypto = require('crypto');
const fs = require('fs');

const algorithm = 'aes-256-cbc';
const key = process.env.ENCRYPTION_KEY;
const iv = crypto.randomBytes(16);

const data = fs.readFileSync('dep.json', 'utf8');

const cipher = crypto.createCipheriv(algorithm, Buffer.from(key, 'hex'), iv);
let encrypted = cipher.update(data, 'utf8', 'hex');
encrypted += cipher.final('hex');

const encryptedData = {
  iv: iv.toString('hex'),
  data: encrypted
};

fs.writeFileSync('dep.json', JSON.stringify(encryptedData));

console.log('Encryption complete');
