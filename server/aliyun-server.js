const http = require("http");
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 3000);
const DATA_FILE = process.env.CAR_DATA_FILE || path.join(__dirname, "car-states.json");
const MAX_BODY_BYTES = 50 * 1024 * 1024;
const UPLOAD_DIR = process.env.CAR_UPLOAD_DIR || "/srv/car-api/uploads";

async function readStore() {
  try {
    const text = await fs.readFile(DATA_FILE, "utf8");
    return JSON.parse(text);
  } catch (error) {
    if (error.code === "ENOENT") return { groups: {} };
    throw error;
  }
}

async function writeStore(store) {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(store, null, 2), "utf8");
}

function hashPin(pin, salt) {
  return crypto.createHash("sha256").update(`${salt}:${pin}`).digest("hex");
}

function cleanGroupCode(value) {
  return String(value || "").trim();
}

function newGroup(adminPin, state) {
  const salt = crypto.randomBytes(16).toString("hex");
  return {
    salt,
    adminPinHash: hashPin(adminPin, salt),
    state: state || {},
    updatedAt: Date.now(),
  };
}

function assertAdmin(group, adminPin) {
  if (!group || !adminPin || hashPin(adminPin, group.salt) !== group.adminPinHash) {
    const error = new Error("管理密码不正确");
    error.status = 403;
    throw error;
  }
}

async function handleRpc(name, body) {
  const store = await readStore();

  if (name === "car_upload_image") {
    const raw = String(body.data || "");
    const match = raw.match(/^data:image\/(png|jpe?g|gif|webp);base64,(.+)$/);
    if (!match) {
      const error = new Error("不支持的图片格式，仅接受 PNG/JPEG/GIF/WebP");
      error.status = 400;
      throw error;
    }
    const ext = match[1].replace("jpeg", "jpg");
    const base64Data = match[2];
    const buffer = Buffer.from(base64Data, "base64");
    if (buffer.length > 10 * 1024 * 1024) {
      const error = new Error("图片文件超过 10MB 限制");
      error.status = 413;
      throw error;
    }
    const uniqueName = `${crypto.randomUUID()}.${ext}`;
    const filePath = path.join(UPLOAD_DIR, uniqueName);
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    await fs.writeFile(filePath, buffer);
    return { filename: uniqueName };
  }

  const groupCode = cleanGroupCode(body.p_group_code);
  if (!groupCode) {
    const error = new Error("缺少团号");
    error.status = 400;
    throw error;
  }

  if (name === "car_create_group") {
    const adminPin = String(body.p_admin_pin || "").trim();
    if (!adminPin) {
      const error = new Error("缺少管理密码");
      error.status = 400;
      throw error;
    }
    if (!store.groups[groupCode]) {
      store.groups[groupCode] = newGroup(adminPin, body.p_state || {});
      await writeStore(store);
    } else {
      assertAdmin(store.groups[groupCode], adminPin);
    }
    return store.groups[groupCode].state;
  }

  const group = store.groups[groupCode];
  if (!group) {
    const error = new Error("团号不存在，请先由团长创建");
    error.status = 404;
    throw error;
  }

  if (name === "car_get_state") return group.state;

  if (name === "car_admin_save_state") {
    assertAdmin(group, String(body.p_admin_pin || "").trim());
    group.state = body.p_state || {};
    group.updatedAt = Date.now();
    await writeStore(store);
    return group.state;
  }

  if (name === "car_member_save_state") {
    group.state = body.p_state || {};
    group.updatedAt = Date.now();
    await writeStore(store);
    return group.state;
  }

  const error = new Error("未知接口");
  error.status = 404;
  throw error;
}

function send(res, status, data) {
  res.writeHead(status, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json; charset=utf-8",
  });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        const error = new Error("请求内容太大");
        error.status = 413;
        reject(error);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8");
      resolve(text ? JSON.parse(text) : {});
    });
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      send(res, 200, { ok: true });
      return;
    }
    if (req.method !== "POST") {
      send(res, 405, { error: "只支持 POST" });
      return;
    }
    const match = req.url.match(/^\/api\/([^/?#]+)/);
    if (!match) {
      send(res, 404, { error: "接口不存在" });
      return;
    }
    const body = await readBody(req);
    const result = await handleRpc(match[1], body);
    send(res, 200, result);
  } catch (error) {
    send(res, error.status || 500, { error: error.message || "服务器错误" });
  }
});

server.listen(PORT, () => {
  console.log(`Car API server listening on http://127.0.0.1:${PORT}`);
});
