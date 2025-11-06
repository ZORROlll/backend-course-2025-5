const fs = require('fs').promises;
const path = require('path');
const http = require('http');
const https = require('https');
const { program } = require('commander');

program
  .requiredOption('-h, --host <host>', 'Адреса сервера')
  .requiredOption('-p, --port <port>', 'Порт сервера', Number)
  .requiredOption('-c, --cache <cache>', 'Шлях до директорії кешу')
  .parse(process.argv);

const options = program.opts();

async function ensureCacheDir() {
  try {
    await fs.access(options.cache);
  } catch {
    await fs.mkdir(options.cache, { recursive: true });
    console.log(`Створено директорію кешу: ${options.cache}`);
  }
}

function getCacheFilePath(httpCode) {
  return path.join(options.cache, `${httpCode}.jpg`);
}

async function handleGet(req, res, httpCode) {
  const filePath = getCacheFilePath(httpCode);

  try {
    // Перевіряємо, чи є файл у кеші
    const data = await fs.readFile(filePath);
    console.log(`Віддаю з кешу: ${filePath}`);
    res.writeHead(200, { 'Content-Type': 'image/jpeg' });
    res.end(data);
  } catch {
    // Якщо немає — завантажуємо з http.cat
    const url = `https://http.cat/${httpCode}.jpg`;
    console.log(`Кешу немає — завантажую з ${url}`);

    https.get(url, async (response) => {
      if (response.statusCode === 200) {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', async () => {
          const buffer = Buffer.concat(chunks);
          await fs.writeFile(filePath, buffer); // зберігаємо в кеш
          console.log(`Картинку збережено: ${filePath}`);
          res.writeHead(200, { 'Content-Type': 'image/jpeg' });
          res.end(buffer);
        });
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end(`Картинку для коду ${httpCode} не знайдено 😿`);
      }
    }).on('error', (err) => {
      console.error('Помилка завантаження:', err);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Помилка при завантаженні картинки');
    });
  }
}

async function handlePut(req, res, httpCode) {
  const filePath = getCacheFilePath(httpCode);
  const chunks = [];

  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', async () => {
    const buffer = Buffer.concat(chunks);
    
    let fileExists = false;
    try {
      await fs.access(filePath);
      fileExists = true;
    } catch {
    }
    
    await fs.writeFile(filePath, buffer);
  
    if (fileExists) {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(`Картинку для коду ${httpCode} оновлено вручну`);
    } else {
      res.writeHead(201, { 'Content-Type': 'text/plain' });
      res.end(`Картинку для коду ${httpCode} створено вручну`);
    }
  });
}

async function handleDelete(req, res, httpCode) {
  const filePath = getCacheFilePath(httpCode);
  try {
    await fs.unlink(filePath);
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(`Картинку для коду ${httpCode} видалено з кешу`);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end(`Картинку для коду ${httpCode} не знайдено`);
  }
}

async function startServer() {
  await ensureCacheDir();

  const server = http.createServer(async (req, res) => {
    const httpCode = req.url.slice(1);

    if (!/^\d+$/.test(httpCode)) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      return res.end('Некоректний HTTP код');
    }

    switch (req.method) {
      case 'GET':
        await handleGet(req, res, httpCode);
        break;
      case 'PUT':
        await handlePut(req, res, httpCode);
        break;
      case 'DELETE':
        await handleDelete(req, res, httpCode);
        break;
      default:
        res.writeHead(405, { 'Content-Type': 'text/plain' });
        res.end('Метод не підтримується');
    }
  });

  server.listen(options.port, options.host, () => {
    console.log(`Проксі-сервер запущено на ${options.host}:${options.port}`);
    console.log(`Кеш-директорія: ${path.resolve(options.cache)}`);
  });
}

startServer().catch(err => {
  console.error('Помилка при запуску сервера:', err);
});
