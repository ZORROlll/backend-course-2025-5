const fs = require('fs').promises;
const path = require('path');
const http = require('http');
const { program } = require('commander'); // візьме тільки змінну program
const superagent = require('superagent');

program
  .requiredOption('-h, --host <host>', 'Адреса сервера')
  .requiredOption('-p, --port <port>', 'Порт сервера', Number)
  .requiredOption('-c, --cache <cache>', 'Шлях до директорії кешу')
  .parse(process.argv); 

const options = program.opts(); // зберігаються значення параметрів

async function ensureCacheDir() {
  try {
    await fs.access(options.cache);
  } catch {
    await fs.mkdir(options.cache, { recursive: true }); // recursive: true означає створння усіх вкладені папки, якщо треба
    console.log(`Створено директорію кешу: ${options.cache}`);
  }
}

function getCacheFilePath(httpCode) {
  return path.join(options.cache, `${httpCode}.jpg`);
}

async function handleGet(req, res, httpCode) { // функція яка приймає число
  const filePath = getCacheFilePath(httpCode);

  try {
    const data = await fs.readFile(filePath);
    console.log(`Віддаю з кешу: ${filePath}`);
    res.writeHead(200, { 'Content-Type': 'image/jpeg' });
    res.end(data);
  } catch {
    const url = `https://http.cat/${httpCode}.jpg`; // створюється посилання
    console.log(`Кешу немає — завантажую з ${url}`);

    try {
      const response = await superagent.get(url).buffer(true).parse(superagent.parse.image);
      await fs.writeFile(filePath, response.body);
      console.log(`Картинку збережено: ${filePath}`);
      res.writeHead(200, { 'Content-Type': 'image/jpeg' });
      res.end(response.body);
    } catch (error) {
      console.error('Помилка завантаження:', error.message);
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end(`Картинку для коду ${httpCode} не знайдено`);
    }
  }
}

async function handlePut(req, res, httpCode) {
  const filePath = getCacheFilePath(httpCode);
  let chunks = [];

  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);

  let existed = true;
  try {
    await fs.access(filePath);
  } catch {
    existed = false;
  }

  await fs.writeFile(filePath, buffer);

  res.writeHead(existed ? 200 : 201, { 'Content-Type': 'text/plain' });
  res.end(existed
    ? `Картинку для коду ${httpCode} оновлено вручну`
    : `Картинку для коду ${httpCode} створено вручну`);
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

    if (!httpCode || !/^\d+$/.test(httpCode)) {
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
