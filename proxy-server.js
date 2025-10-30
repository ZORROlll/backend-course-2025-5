const http = require('http');
const fs = require('fs').promises;
const path = require('path');
const { program } = require('commander');

program
  .requiredOption('-h, --host <host>', 'Адреса сервера')
  .requiredOption('-p, --port <port>', 'Порт сервера', parseInt)
  .requiredOption('-c, --cache <cache>', 'Шлях до директорії кешу')
  .parse(process.argv);

const options = program.opts();
options.cache = path.resolve(options.cache);

async function ensureCacheDir() {
  try {
    await fs.access(options.cache);
    console.log(`Директорія кешу вже існує: ${options.cache}`);
  } catch {
    await fs.mkdir(options.cache, { recursive: true });
    console.log(`Створено директорію кешу: ${options.cache}`);
  }
}

async function startServer() {
  await ensureCacheDir();

  const server = http.createServer((req, res) => {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Проксі-сервер працює! Очікую налаштувань...');
  });

  server.listen(options.port, options.host, () => {
    console.log(`Проксі-сервер запущено на адресі: http://${options.host}:${options.port}`);
    console.log(`Директорія для кешу: ${options.cache}`);
  });
}


startServer().catch(error => {
  console.error('Помилка при запуску сервера:', error);
  process.exit(1);
});
