import fs from 'fs';

if (fs.existsSync('./.env.local')) {
  const lines = fs.readFileSync('./.env.local', 'utf-8').split('\n');
  lines.forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      console.log("Env key:", match[1].trim());
    }
  });
}
