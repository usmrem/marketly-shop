"use strict";

// Backend without external npm dependencies: Node.js built-in HTTP + SQLite.
const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");

const ROOT_DIR = __dirname;
const DATA_DIR = path.join(ROOT_DIR, "data");
const DB_PATH = path.join(DATA_DIR, "marketly.sqlite");
const PORT = Number(process.env.PORT) || 3000;
const FREE_SHIPPING_LIMIT = 20000;
const DELIVERY_FEE = 1500;
const MAX_BODY_SIZE = 100 * 1024;

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");
db.exec("PRAGMA busy_timeout = 5000;");
db.exec(fs.readFileSync(path.join(ROOT_DIR, "database", "schema.sql"), "utf8"));

// Небольшие миграции позволяют запускать новую версию и со старой локальной БД.
function ensureColumn(tableName, columnName, definition) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  if (!columns.some((column) => column.name === columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}
ensureColumn("products", "details", "TEXT NOT NULL DEFAULT ''");
ensureColumn("orders", "payment_method", "TEXT NOT NULL DEFAULT 'cash_on_delivery'");

const seedProducts = [
  { id: 1, name: "Наушники Pulse Air", category: "electronics", category_label: "Электроника", price: 24990, old_price: 31990, rating: 4.9, reviews: 128, art: "🎧", tone: "tone-lilac", badge: "Хит продаж", description: "Чистый звук и комфорт на весь день", details: "Беспроводные наушники с мягкими амбушюрами, удобным управлением и зарядным кейсом. Подойдут для музыки, обучения и видеозвонков. Время работы зависит от громкости и режима использования.", popularity: 98, stock: 100 },
  { id: 2, name: "Кроссовки Urban Move", category: "fashion", category_label: "Стиль", price: 32990, old_price: null, rating: 4.8, reviews: 86, art: "👟", tone: "tone-mint", badge: "Новинка", description: "Лёгкая подошва для активных дней", details: "Повседневные кроссовки с лёгкой амортизирующей подошвой и текстильной подкладкой. Универсальный дизайн подходит для прогулок и повседневной одежды. Перед покупкой рекомендуется сверить размер.", popularity: 94, stock: 100 },
  { id: 3, name: "Умные часы Nova", category: "electronics", category_label: "Электроника", price: 45990, old_price: 52990, rating: 4.9, reviews: 204, art: "⌚", tone: "tone-peach", badge: "-13%", description: "Активность, сон и важные уведомления", details: "Умные часы для отслеживания активности и повседневных уведомлений. Удобный ремешок, яркий дисплей и несколько режимов тренировок. Совместимость и доступность функций зависят от смартфона.", popularity: 96, stock: 100 },
  { id: 4, name: "Настольная лампа Glow", category: "home", category_label: "Для дома", price: 14990, old_price: null, rating: 4.7, reviews: 57, art: "💡", tone: "tone-yellow", badge: "Для уюта", description: "Мягкий свет для работы и отдыха", details: "Компактная настольная лампа для рабочего стола или прикроватной тумбы. Даёт комфортное освещение для чтения и учёбы. Для ухода используйте сухую мягкую ткань; источник питания и лампа указываются в комплекте поставки.", popularity: 85, stock: 100 },
  { id: 5, name: "Рюкзак Daily Carry", category: "fashion", category_label: "Стиль", price: 18990, old_price: 22990, rating: 4.8, reviews: 73, art: "🎒", tone: "tone-blue", badge: "-17%", description: "Продуманные карманы и лаконичный дизайн", details: "Городской рюкзак для учёбы, работы и коротких поездок. Основное отделение удобно для повседневных вещей, а дополнительные карманы помогают организовать мелочи. Цвет и фактура представлены в демонстрационном виде.", popularity: 90, stock: 100 },
  { id: 6, name: "Термокружка Keep Warm", category: "accessories", category_label: "Аксессуары", price: 7990, old_price: null, rating: 4.6, reviews: 42, art: "☕", tone: "tone-sand", badge: null, description: "Сохраняет температуру любимого напитка", details: "Многоразовая термокружка для кофе, чая и других напитков. Удобна в дороге и на работе. Не заполняйте до самого края и соблюдайте рекомендации по уходу, указанные производителем.", popularity: 76, stock: 100 },
  { id: 7, name: "Колонка Mini Boom", category: "electronics", category_label: "Электроника", price: 16990, old_price: null, rating: 4.7, reviews: 91, art: "🔊", tone: "tone-pink", badge: "Компактная", description: "Яркий звук в небольшом корпусе", details: "Портативная колонка для музыки дома или на прогулке. Компактный корпус удобно брать с собой, а простое управление подходит для ежедневного использования. Время автономной работы зависит от громкости и подключения.", popularity: 87, stock: 100 },
  { id: 8, name: "Аромадиффузор Calm", category: "home", category_label: "Для дома", price: 11990, old_price: null, rating: 4.8, reviews: 64, art: "🪴", tone: "tone-slate", badge: "Для уюта", description: "Добавьте комнате спокойствия и свежести", details: "Декоративный аромадиффузор для создания приятной атмосферы в комнате. Используйте подходящие ароматические жидкости согласно инструкции производителя, держите вдали от детей и домашних животных.", popularity: 81, stock: 100 },
  { id: 9, name: "Мышь Swift Wireless", category: "electronics", category_label: "Электроника", price: 9990, old_price: 12990, rating: 4.7, reviews: 39, art: "🖱️", tone: "tone-lilac", badge: "-23%", description: "Точная навигация без лишних проводов", details: "Беспроводная компьютерная мышь для учёбы и офисной работы. Эргономичная форма помогает комфортно работать, а компактный размер упрощает переноску. Тип подключения и питание указаны на упаковке.", popularity: 83, stock: 100 },
  { id: 10, name: "Кошелёк City Slim", category: "accessories", category_label: "Аксессуары", price: 6490, old_price: null, rating: 4.5, reviews: 31, art: "👛", tone: "tone-peach", badge: null, description: "Компактный аксессуар на каждый день", details: "Небольшой кошелёк с отделениями для карт и наличных. Тонкий формат удобно помещается в сумку или карман. Материал и цвет зависят от демонстрационной комплектации.", popularity: 70, stock: 100 },
  { id: 11, name: "Худи Softline", category: "fashion", category_label: "Стиль", price: 21990, old_price: null, rating: 4.8, reviews: 54, art: "🧥", tone: "tone-pink", badge: "Популярное", description: "Мягкий материал для уютных образов", details: "Базовое худи свободного кроя для повседневного гардероба. Подходит для прохладной погоды и многослойных образов. Для выбора размера сверяйтесь с размерной сеткой продавца.", popularity: 88, stock: 100 },
  { id: 12, name: "Умная лампа Aura", category: "home", category_label: "Для дома", price: 8990, old_price: null, rating: 4.6, reviews: 27, art: "💡", tone: "tone-yellow", badge: "Новинка", description: "Освещение под настроение и задачу", details: "Декоративная лампа для комнаты, рабочего места или зоны отдыха. Помогает создать мягкое акцентное освещение. Перед покупкой проверьте цоколь, параметры питания и совместимость с нужными устройствами.", popularity: 79, stock: 100 }
];

const insertProduct = db.prepare(`
  INSERT OR IGNORE INTO products
    (id, name, category, category_label, price, old_price, rating, reviews, art, tone, badge, description, details, popularity, stock)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
for (const p of seedProducts) {
  insertProduct.run(p.id, p.name, p.category, p.category_label, p.price, p.old_price,
    p.rating, p.reviews, p.art, p.tone, p.badge, p.description, p.details, p.popularity, p.stock);
}

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon"
};

function sendJson(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  res.end(body);
}

function sendError(res, statusCode, message) {
  sendJson(res, statusCode, { error: message });
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.setEncoding("utf8");

    req.on("data", (chunk) => {
      data += chunk;
      if (Buffer.byteLength(data, "utf8") > MAX_BODY_SIZE) {
        const error = new Error("Размер запроса превышает допустимый лимит.");
        error.statusCode = 413;
        reject(error);
        req.destroy();
      }
    });

    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        const error = new Error("Некорректный JSON в запросе.");
        error.statusCode = 400;
        reject(error);
      }
    });

    req.on("error", reject);
  });
}

function cleanString(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function validateCustomer(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { error: "Заполните контактные данные покупателя." };
  }

  const customer = {
    name: cleanString(raw.name, 120),
    phone: cleanString(raw.phone, 40),
    email: cleanString(raw.email, 254).toLowerCase(),
    paymentMethod: cleanString(raw.paymentMethod, 40),
    city: cleanString(raw.city, 100),
    address: cleanString(raw.address, 250),
    comment: cleanString(raw.comment, 1000)
  };

  if (customer.name.split(/\s+/).filter(Boolean).length < 2) return { error: "Укажите фамилию и имя покупателя." };
  if (customer.phone.replace(/\D/g, "").length < 10) return { error: "Укажите корректный номер телефона." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) return { error: "Укажите корректный email." };
  if (!customer.city) return { error: "Укажите город доставки." };
  if (customer.address.length < 5) return { error: "Укажите полный адрес доставки." };
  if (!["cash_on_delivery", "card_on_delivery", "bank_transfer_demo"].includes(customer.paymentMethod)) {
    return { error: "Выберите корректный способ оплаты." };
  }

  return { customer };
}

function getProducts() {
  const rows = db.prepare(`
    SELECT id, name, category, category_label, price, old_price, rating, reviews,
           art, tone, badge, description, details, popularity, stock
    FROM products
    WHERE active = 1
    ORDER BY id
  `).all();

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    category: row.category,
    categoryLabel: row.category_label,
    price: row.price,
    oldPrice: row.old_price,
    rating: row.rating,
    reviews: row.reviews,
    art: row.art,
    tone: row.tone,
    badge: row.badge,
    description: row.description,
    details: row.details,
    popularity: row.popularity,
    stock: row.stock
  }));
}

function createOrder(body) {
  const validation = validateCustomer(body?.customer);
  if (validation.error) {
    const error = new Error(validation.error);
    error.statusCode = 400;
    throw error;
  }

  const rawItems = body?.items;
  if (!Array.isArray(rawItems) || rawItems.length === 0 || rawItems.length > 50) {
    const error = new Error("Корзина пуста или содержит слишком много позиций.");
    error.statusCode = 400;
    throw error;
  }

  const quantities = new Map();
  for (const item of rawItems) {
    const productId = Number(item?.productId);
    const quantity = Number(item?.quantity);
    if (!Number.isSafeInteger(productId) || productId <= 0 || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 99) {
      const error = new Error("В корзине есть некорректный товар или количество.");
      error.statusCode = 400;
      throw error;
    }
    quantities.set(productId, (quantities.get(productId) || 0) + quantity);
    if (quantities.get(productId) > 99) {
      const error = new Error("Количество одного товара не может превышать 99.");
      error.statusCode = 400;
      throw error;
    }
  }

  const getProduct = db.prepare("SELECT id, name, price, stock FROM products WHERE id = ? AND active = 1");
  const insertOrder = db.prepare(`
    INSERT INTO orders (order_number, customer_name, phone, email, payment_method, city, address, comment, subtotal, delivery_fee, total)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertOrderItem = db.prepare(`
    INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price, line_total)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const decrementStock = db.prepare("UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?");

  let transactionStarted = false;
  try {
    db.exec("BEGIN IMMEDIATE");
    transactionStarted = true;

    let subtotal = 0;
    const lines = [];
    for (const [productId, quantity] of quantities.entries()) {
      const product = getProduct.get(productId);
      if (!product) {
        const error = new Error(`Товар с ID ${productId} не найден.`);
        error.statusCode = 400;
        throw error;
      }
      if (product.stock < quantity) {
        const error = new Error(`Недостаточно товара «${product.name}» на складе.`);
        error.statusCode = 409;
        throw error;
      }
      const lineTotal = product.price * quantity;
      subtotal += lineTotal;
      lines.push({ productId: product.id, name: product.name, quantity, price: product.price, lineTotal });
    }

    const deliveryFee = subtotal >= FREE_SHIPPING_LIMIT ? 0 : DELIVERY_FEE;
    const total = subtotal + deliveryFee;
    const orderNumber = `MK-${Date.now().toString().slice(-6)}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
    const c = validation.customer;
    const orderResult = insertOrder.run(orderNumber, c.name, c.phone, c.email, c.paymentMethod, c.city, c.address,
      c.comment, subtotal, deliveryFee, total);
    const orderId = Number(orderResult.lastInsertRowid);

    for (const line of lines) {
      const stockResult = decrementStock.run(line.quantity, line.productId, line.quantity);
      if (Number(stockResult.changes) !== 1) {
        const error = new Error(`Недостаточно товара «${line.name}» на складе.`);
        error.statusCode = 409;
        throw error;
      }
      insertOrderItem.run(orderId, line.productId, line.name, line.quantity, line.price, line.lineTotal);
    }

    db.exec("COMMIT");
    transactionStarted = false;
    return { orderId, orderNumber, subtotal, deliveryFee, total };
  } catch (error) {
    if (transactionStarted) {
      try { db.exec("ROLLBACK"); } catch (rollbackError) {
        console.error("Не удалось откатить транзакцию:", rollbackError);
      }
    }
    throw error;
  }
}

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = decodeURIComponent(url.pathname);
  const method = req.method || "GET";

  if (pathname.startsWith("/api/")) {
    if (method === "GET" && pathname === "/api/health") {
      return sendJson(res, 200, { ok: true, database: "sqlite", timestamp: new Date().toISOString() });
    }

    if (method === "GET" && pathname === "/api/products") {
      return sendJson(res, 200, getProducts());
    }

    if (method === "POST" && pathname === "/api/orders") {
      const body = await readJsonBody(req);
      const result = createOrder(body);
      return sendJson(res, 201, {
        ok: true,
        orderId: result.orderId,
        orderNumber: result.orderNumber,
        subtotal: result.subtotal,
        deliveryFee: result.deliveryFee,
        total: result.total,
        message: "Заказ сохранён в базе данных. Оплата не выполнялась."
      });
    }

    if (method === "POST" && pathname === "/api/newsletter") {
      const body = await readJsonBody(req);
      const email = cleanString(body?.email, 254).toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return sendError(res, 400, "Укажите корректный email.");
      }
      const result = db.prepare("INSERT OR IGNORE INTO newsletter_subscribers (email) VALUES (?)").run(email);
      return sendJson(res, 201, {
        ok: true,
        message: Number(result.changes) > 0
          ? "Спасибо за подписку! Email сохранён в базе данных."
          : "Этот email уже подписан на рассылку."
      });
    }

    return sendError(res, 404, "API-маршрут не найден.");
  }

  if (method !== "GET" && method !== "HEAD") {
    return sendError(res, 405, "Метод не поддерживается.");
  }

  // Keep the database, schema and backend source out of the public static area.
  const blockedFiles = new Set(["/server.js", "/package.json", "/package-lock.json", "/README.md", "/.gitignore"]);
  if (blockedFiles.has(pathname) || pathname === "/data" || pathname.startsWith("/data/") || pathname === "/database" || pathname.startsWith("/database/")) {
    return sendError(res, 404, "Страница не найдена.");
  }

  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const filePath = path.resolve(ROOT_DIR, relative);
  if (!filePath.startsWith(`${ROOT_DIR}${path.sep}`) && filePath !== path.join(ROOT_DIR, "index.html")) {
    return sendError(res, 403, "Доступ запрещён.");
  }

  let stat;
  try {
    stat = await fs.promises.stat(filePath);
  } catch {
    return sendError(res, 404, "Страница не найдена.");
  }
  if (!stat.isFile()) return sendError(res, 404, "Страница не найдена.");

  const contentType = mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream";
  res.writeHead(200, {
    "Content-Type": contentType,
    "Content-Length": stat.size,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-cache"
  });
  if (method === "HEAD") return res.end();
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer((req, res) => {
  handleRequest(req, res).catch((error) => {
    console.error("Ошибка запроса:", error);
    if (res.headersSent) return res.end();
    const status = Number.isInteger(error.statusCode) ? error.statusCode : 500;
    sendError(res, status, status < 500 ? error.message : "Внутренняя ошибка сервера. Попробуйте позже.");
  });
});

server.listen(PORT, () => {
  console.log(`Marketly запущен: http://localhost:${PORT}`);
  console.log(`SQLite база данных: ${DB_PATH}`);
  console.log("Зависимости npm не нужны. Для остановки нажмите Ctrl+C.");
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
