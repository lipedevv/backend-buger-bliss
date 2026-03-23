import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import multer from "multer";
import pino from "pino";
import QRCode from "qrcode";
import { Boom } from "@hapi/boom";
import makeWASocket, { DisconnectReason, fetchLatestBaileysVersion, useMultiFileAuthState } from "@whiskeysockets/baileys";
import {
  buildAdminDashboardOverview,
  changeAdminPassword,
  countAdminMemberships,
  createAddress,
  createDriverLocation,
  createOrderRecord,
  createPhoneVerification,
  createUserSession,
  deleteAddress,
  deleteSession,
  ensureAdminMembership,
  findOrCreateUserByPhone,
  getDriverProfileByUser,
  getAdminAccountForUser,
  getPromoNotificationSettings,
  getOrderById,
  getSessionUser,
  getWhatsappSessionRow,
  initAppDatabase,
  loginAdminAccount,
  listAddresses,
  listDriverProfiles,
  listOrdersForDriver,
  listOrdersForRestaurant,
  listOrdersForUser,
  listWhatsappMessageTemplates,
  mapDriverProfile,
  serializeWhatsappSession,
  setDefaultAddress,
  updateOrderRecord,
  updatePromoNotificationSettings,
  updateWhatsappMessageTemplates,
  updateDriverProfileRecord,
  updateOrderStatus,
  updateWhatsappSessionRow,
  upsertDriverProfileRecord,
  verifyPhoneCode,
} from "./app-db.js";
import {
  getCatalogSnapshot,
  initCatalogDatabase,
  replaceRestaurantHours,
  saveCategoryRecord,
  saveDeliveryZoneRecord,
  saveDiscountRecord,
  saveProductRecord,
  updateRestaurantRecord,
} from "./catalog-db.js";

dotenv.config({
  path: process.env.WHATSAPP_ENV_FILE || path.join(process.cwd(), ".env"),
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logger = pino({ level: process.env.LOG_LEVEL || "info" });

const PORT = Number(process.env.PORT || 4010);
const RESTAURANT_ID = process.env.WHATSAPP_RESTAURANT_ID || "11111111-1111-4111-8111-111111111111";
const AUTH_DIR = process.env.BAILEYS_AUTH_DIR || path.join(__dirname, ".baileys-auth");
const SQLITE_PATH = process.env.SQLITE_PATH || path.join(__dirname, "data", "catalog.sqlite");
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, "data", "uploads");
const MAX_UPLOAD_SIZE_BYTES = Number(process.env.MAX_UPLOAD_SIZE_BYTES || 8 * 1024 * 1024);

fs.mkdirSync(AUTH_DIR, { recursive: true });
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
const db = initCatalogDatabase(SQLITE_PATH);
initAppDatabase(db);

const app = express();
app.set("trust proxy", true);
app.use(cors());
app.use("/uploads", express.static(UPLOADS_DIR));
app.use(express.json());

const state = {
  socket: null,
  isConnecting: false,
};

const normalizePhone = (value = "") => value.replace(/\D/g, "");
const normalizeJid = (phone) => `${normalizePhone(phone)}@s.whatsapp.net`;
const createCode = () => String(Math.floor(100000 + Math.random() * 900000));
const getPublicBaseUrl = (req) => (process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");
const buildAbsoluteAssetUrl = (req, value) => {
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return `${getPublicBaseUrl(req)}${value.startsWith("/") ? value : `/${value}`}`;
};
const resolveCatalogSnapshotUrls = (req, snapshot) => ({
  ...snapshot,
  restaurant: {
    ...snapshot.restaurant,
    logoUrl: buildAbsoluteAssetUrl(req, snapshot.restaurant.logoUrl),
    heroImageUrl: buildAbsoluteAssetUrl(req, snapshot.restaurant.heroImageUrl),
  },
  banners: snapshot.banners.map((banner) => ({
    ...banner,
    imageUrl: buildAbsoluteAssetUrl(req, banner.imageUrl),
  })),
  products: snapshot.products.map((product) => ({
    ...product,
    image: buildAbsoluteAssetUrl(req, product.image),
  })),
});
const isDiscountActiveNow = (discount) => {
  if (!discount?.isActive) return false;
  const now = Date.now();
  if (discount.startsAt && new Date(discount.startsAt).getTime() > now) return false;
  if (discount.endsAt && new Date(discount.endsAt).getTime() < now) return false;
  return true;
};
const buildPublicPromoNotification = () => {
  const snapshot = getCatalogSnapshot(db);
  const settings = getPromoNotificationSettings(db);
  const activeDiscounts = (snapshot.discounts || []).filter(isDiscountActiveNow);

  if (!settings?.enabled || activeDiscounts.length === 0) {
    return {
      enabled: false,
      title: settings?.title || "Promocao nova no app",
      body: settings?.body || "Tem desconto novo te esperando.",
      targetPath: settings?.targetPath || "/promos",
      activeDiscounts: [],
      updatedAt: settings?.updatedAt || new Date().toISOString(),
    };
  }

  return {
    enabled: true,
    title: settings.title,
    body: `${settings.body} ${activeDiscounts[0]?.title ? `Oferta: ${activeDiscounts[0].title}.` : ""}`.trim(),
    targetPath: settings.targetPath,
    activeDiscounts,
    updatedAt: settings.updatedAt,
  };
};

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => {
      callback(null, UPLOADS_DIR);
    },
    filename: (req, file, callback) => {
      const safeKind = String(req.body.kind || "image").toLowerCase().replace(/[^a-z0-9-]/g, "-") || "image";
      const parsedExt = path.extname(file.originalname || "").toLowerCase();
      const ext = parsedExt && parsedExt.length <= 8 ? parsedExt : ".jpg";
      callback(null, `${safeKind}-${Date.now()}-${crypto.randomUUID()}${ext}`);
    },
  }),
  limits: {
    fileSize: MAX_UPLOAD_SIZE_BYTES,
  },
  fileFilter: (_req, file, callback) => {
    if (!file.mimetype?.startsWith("image/")) {
      callback(new Error("Envie apenas arquivos de imagem."));
      return;
    }
    callback(null, true);
  },
});

const syncSessionToDatabase = async (patch = {}) => {
  updateWhatsappSessionRow(db, patch);
};

const clearSocket = () => {
  state.socket = null;
  state.isConnecting = false;
};
const currency = (value) => `R$ ${Number(value || 0).toFixed(2).replace(".", ",")}`;
const orderCode = (order) => order?.id ? order.id.slice(0, 6).toLowerCase() : "pedido";
const paymentEmoji = (paymentMethod = "") => {
  const normalized = String(paymentMethod).toLowerCase();
  if (normalized.includes("pix")) return "💸";
  if (normalized.includes("card") || normalized.includes("cart")) return "💳";
  if (normalized.includes("cash") || normalized.includes("dinheiro")) return "💵";
  return "🧾";
};
const friendlyPaymentMethod = (paymentMethod = "") => {
  const normalized = String(paymentMethod).toLowerCase();
  if (normalized.includes("pix")) return "Pix";
  if (normalized.includes("card") || normalized.includes("cart")) return "Cartão - Máquina Móvel";
  if (normalized.includes("cash") || normalized.includes("dinheiro")) return "Dinheiro";
  return paymentMethod || "Nao informado";
};
const friendlyDeliveryLabel = (order) => order?.deliveryMode === "delivery" ? "*Entrega*" : "*Retirada na Loja*";
const addressBlock = (order) => {
  if (order?.deliveryMode === "delivery") {
    return `Endereco de Entrega: *${order?.addressFull || "Nao informado"}*`;
  }
  return `Endereco para Retirada: *${order?.addressFull || "Nao informado"}*`;
};
const formatOrderItemsBlock = (order) => (order?.items || []).map((item) => {
  const options = (item.optionSnapshot || []).map((option) => {
    const prefix = option.groupName ? `_🔸${option.groupName}:_\n` : "";
    return `${prefix}*▪️ ${option.name}*`;
  }).join("\n");
  return [
    `➡️ ${item.quantity} x *${item.productName}*`,
    options,
    "",
  ].filter(Boolean).join("\n");
}).join("\n");
const buildObsBlock = (order) => order?.obs ? `*OBS: ${order.obs}*` : "";
const buildDeliveryFeeBlock = (order) => Number(order?.deliveryFee || 0) > 0 ? `+ Taxa de entrega: *${currency(order.deliveryFee)}*` : "";
const buildTemplateVariables = (order) => ({
  customer_name: order?.customerName || "cliente",
  order_code: orderCode(order),
  payment_method: friendlyPaymentMethod(order?.paymentMethod),
  payment_emoji: paymentEmoji(order?.paymentMethod),
  items_total: currency(order?.subtotal || 0),
  delivery_fee_block: buildDeliveryFeeBlock(order),
  total: currency(order?.total || 0),
  delivery_mode_label: friendlyDeliveryLabel(order),
  address_block: addressBlock(order),
  items_block: formatOrderItemsBlock(order),
  obs_block: buildObsBlock(order),
});
const renderTemplate = (body, variables) => Object.entries(variables).reduce(
  (content, [key, value]) => content.replaceAll(`{{${key}}}`, String(value ?? "")),
  body,
).replace(/\n{3,}/g, "\n\n").trim();
const getTemplateBody = (key) => listWhatsappMessageTemplates(db).find((template) => template.key === key)?.body || "";

const ensureSocket = async () => {
  if (state.socket || state.isConnecting) return state.socket;
  state.isConnecting = true;
  await syncSessionToDatabase({ status: "connecting", error_message: null });

  const { state: authState, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();
  const socket = makeWASocket({
    version,
    auth: authState,
    logger,
    printQRInTerminal: false,
    browser: ["ChefBora", "Chrome", "1.0.0"],
  });

  socket.ev.on("creds.update", saveCreds);
  state.socket = socket;

  socket.ev.on("connection.update", async (update) => {
    const { connection, qr, lastDisconnect } = update;

    if (qr) {
      const qrCodeDataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 320 });
      await syncSessionToDatabase({
        status: "qr_ready",
        qr_code_data_url: qrCodeDataUrl,
        error_message: null,
      });
    }

    if (connection === "open") {
      await syncSessionToDatabase({
        status: "connected",
        qr_code_data_url: null,
        phone_jid: socket.user?.id || null,
        phone_number: socket.user?.id ? normalizePhone(socket.user.id) : null,
        device_name: socket.user?.name || "WhatsApp",
        last_connected_at: new Date().toISOString(),
        error_message: null,
      });
      state.isConnecting = false;
    }

    if (connection === "close") {
      const statusCode = lastDisconnect?.error instanceof Boom
        ? lastDisconnect.error.output.statusCode
        : lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      await syncSessionToDatabase({
        status: shouldReconnect ? "connecting" : "disconnected",
        error_message: lastDisconnect?.error?.message || null,
      });
      clearSocket();

      if (shouldReconnect) {
        setTimeout(() => {
          ensureSocket().catch((error) => logger.error({ error }, "Falha ao reconectar socket"));
        }, 2500);
      }
    }
  });

  state.isConnecting = false;
  return socket;
};

const sendVerificationMessage = async (phone, code) => {
  if (!state.socket) {
    throw new Error("WhatsApp ainda nao esta conectado.");
  }

  await state.socket.sendMessage(normalizeJid(phone), {
    text: code,
  });
};

const sendOrderStatusMessage = async (order, status) => {
  if (!state.socket || !order?.customerPhone) {
    return;
  }

  const templateKey = status === "pending" ? "order_summary" : status;
  const templateBody = getTemplateBody(templateKey);
  if (!templateBody) {
    return;
  }

  await state.socket.sendMessage(normalizeJid(order.customerPhone), {
    text: renderTemplate(templateBody, buildTemplateVariables(order)),
  });
};

const parseAuthToken = (req) => {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) return null;
  return authHeader.slice(7).trim();
};

const authMiddleware = (req, res, next) => {
  const token = parseAuthToken(req);
  const session = getSessionUser(db, token);
  if (!session) {
    return res.status(401).json({ error: "Sessao invalida." });
  }
  req.auth = session;
  next();
};

const requireAdmin = (req, res, next) => {
  const hasAdminRole = req.auth.profile.memberships.some((membership) => membership.role === "admin" || membership.role === "manager");
  if (!hasAdminRole && req.auth.profile.preferredRole !== "admin") {
    return res.status(403).json({ error: "Acesso restrito ao admin." });
  }
  next();
};

const jsonOrder = (order) => order;

app.get("/health", (_req, res) => {
  res.json({ ok: true, status: getWhatsappSessionRow(db)?.status || "disconnected" });
});

app.get("/api/catalog/snapshot", (_req, res) => {
  res.json({ ok: true, snapshot: resolveCatalogSnapshotUrls(_req, getCatalogSnapshot(db)) });
});

app.get("/api/public/promo-notification", (_req, res) => {
  res.json({ ok: true, notification: buildPublicPromoNotification() });
});

app.put("/api/catalog/restaurant", authMiddleware, requireAdmin, (req, res) => {
  updateRestaurantRecord(db, req.body);
  res.json({ ok: true, snapshot: getCatalogSnapshot(db) });
});

app.put("/api/catalog/hours", authMiddleware, requireAdmin, (req, res) => {
  replaceRestaurantHours(db, req.body.hours || []);
  res.json({ ok: true, snapshot: getCatalogSnapshot(db) });
});

app.post("/api/catalog/categories", authMiddleware, requireAdmin, (req, res) => {
  saveCategoryRecord(db, { id: req.body.id || crypto.randomUUID(), ...req.body });
  res.json({ ok: true, snapshot: getCatalogSnapshot(db) });
});

app.post("/api/catalog/products", authMiddleware, requireAdmin, (req, res) => {
  saveProductRecord(db, { id: req.body.id || crypto.randomUUID(), ...req.body });
  res.json({ ok: true, snapshot: getCatalogSnapshot(db) });
});

app.post("/api/catalog/discounts", authMiddleware, requireAdmin, (req, res) => {
  saveDiscountRecord(db, { id: req.body.id || crypto.randomUUID(), ...req.body });
  res.json({ ok: true, snapshot: getCatalogSnapshot(db) });
});

app.post("/api/catalog/delivery-zones", authMiddleware, requireAdmin, (req, res) => {
  saveDeliveryZoneRecord(db, { id: req.body.id || crypto.randomUUID(), ...req.body });
  res.json({ ok: true, snapshot: getCatalogSnapshot(db) });
});

app.post("/api/auth/request-code", async (req, res) => {
  try {
    const phone = normalizePhone(req.body.phone || "");
    if (phone.length < 12) {
      return res.status(400).json({ error: "Telefone invalido." });
    }

    const code = createCode();
    createPhoneVerification(db, phone, code);

    if (state.socket) {
      await sendVerificationMessage(phone, code);
    }

    res.json({
      ok: true,
      developmentCode: state.socket ? undefined : code,
      message: state.socket ? "Codigo enviado no WhatsApp." : "Codigo gerado localmente para desenvolvimento.",
    });
  } catch (error) {
    logger.error({ error }, "Falha ao solicitar codigo");
    res.status(500).json({ error: error.message || "Falha ao solicitar codigo." });
  }
});

app.post("/api/auth/verify-code", (req, res) => {
  try {
    const phone = normalizePhone(req.body.phone || "");
    const code = String(req.body.code || "").trim();
    const name = String(req.body.name || "").trim();

    verifyPhoneCode(db, phone, code);
    const user = findOrCreateUserByPhone(db, phone, name);
    const token = createUserSession(db, user.id);
    const session = getSessionUser(db, token);

    res.json({ ok: true, token, profile: session.profile });
  } catch (error) {
    logger.error({ error }, "Falha ao validar codigo");
    res.status(400).json({ error: error.message || "Falha ao validar codigo." });
  }
});

app.get("/api/auth/me", authMiddleware, (req, res) => {
  res.json({ ok: true, profile: req.auth.profile });
});

app.patch("/api/profile", authMiddleware, (req, res) => {
  db.prepare(`
    UPDATE users
    SET name = COALESCE(?, name), updated_at = ?
    WHERE id = ?
  `).run(req.body.name || null, new Date().toISOString(), req.auth.profile.userId);
  const refreshed = getSessionUser(db, req.auth.token);
  res.json({ ok: true, profile: refreshed.profile });
});

app.post("/api/auth/logout", authMiddleware, (req, res) => {
  deleteSession(db, req.auth.token);
  res.json({ ok: true });
});

app.post("/api/admin-auth/login", (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const session = loginAdminAccount(db, email, password);
    res.json({ ok: true, ...session });
  } catch (error) {
    logger.error({ error }, "Falha no login admin");
    res.status(400).json({ error: error.message || "Falha no login admin." });
  }
});

app.get("/api/admin-auth/me", authMiddleware, (req, res) => {
  const admin = getAdminAccountForUser(db, req.auth.profile.userId);
  if (!admin) {
    return res.status(403).json({ error: "Conta admin nao encontrada." });
  }
  res.json({ ok: true, admin });
});

app.post("/api/admin-auth/change-password", authMiddleware, (req, res) => {
  try {
    const admin = changeAdminPassword(
      db,
      req.auth.profile.userId,
      String(req.body.currentPassword || ""),
      String(req.body.nextPassword || ""),
    );
    res.json({ ok: true, admin });
  } catch (error) {
    logger.error({ error }, "Falha ao trocar senha admin");
    res.status(400).json({ error: error.message || "Falha ao trocar senha admin." });
  }
});

app.post("/api/admin/bootstrap", authMiddleware, (req, res) => {
  if (countAdminMemberships(db) > 0) {
    return res.status(409).json({ error: "O restaurante ja possui admin." });
  }
  ensureAdminMembership(db, req.auth.profile.userId);
  const refreshed = getSessionUser(db, req.auth.token);
  res.json({ ok: true, profile: refreshed.profile });
});

app.get("/api/addresses", authMiddleware, (req, res) => {
  res.json({ ok: true, addresses: listAddresses(db, req.auth.profile.userId) });
});

app.post("/api/addresses", authMiddleware, (req, res) => {
  const address = createAddress(db, req.auth.profile.userId, req.body);
  res.json({ ok: true, address, addresses: listAddresses(db, req.auth.profile.userId) });
});

app.delete("/api/addresses/:id", authMiddleware, (req, res) => {
  deleteAddress(db, req.auth.profile.userId, req.params.id);
  res.json({ ok: true, addresses: listAddresses(db, req.auth.profile.userId) });
});

app.post("/api/addresses/:id/default", authMiddleware, (req, res) => {
  setDefaultAddress(db, req.auth.profile.userId, req.params.id);
  res.json({ ok: true, addresses: listAddresses(db, req.auth.profile.userId) });
});

app.get("/api/orders", authMiddleware, (req, res) => {
  res.json({ ok: true, orders: listOrdersForUser(db, req.auth.profile.userId) });
});

app.get("/api/orders/:id", authMiddleware, (req, res) => {
  const order = getOrderById(db, req.params.id);
  if (!order) {
    return res.status(404).json({ error: "Pedido nao encontrado." });
  }
  const isOwner = order.userId === req.auth.profile.userId;
  const isAdmin = req.auth.profile.memberships.some((membership) => membership.role === "admin" || membership.role === "manager");
  const isDriver = order.assignedDriverId && getDriverProfileByUser(db, req.auth.profile.userId)?.id === order.assignedDriverId;
  if (!isOwner && !isAdmin && !isDriver) {
    return res.status(403).json({ error: "Sem permissao para ver este pedido." });
  }
  res.json({ ok: true, order });
});

app.post("/api/orders", authMiddleware, (req, res) => {
  try {
    const orderId = createOrderRecord(db, {
      ...req.body,
      userId: req.auth.profile.userId,
      restaurantId: RESTAURANT_ID,
    });
    const order = getOrderById(db, orderId);
    sendOrderStatusMessage(order, "pending").catch((error) => {
      logger.warn({ error, orderId }, "Falha ao enviar status inicial no WhatsApp");
    });
    res.json({ ok: true, order });
  } catch (error) {
    logger.warn({ error }, "Falha ao criar pedido");
    res.status(400).json({ error: error.message || "Falha ao criar pedido." });
  }
});

app.patch("/api/orders/:id/status", authMiddleware, (req, res) => {
  const order = getOrderById(db, req.params.id);
  if (!order) {
    return res.status(404).json({ error: "Pedido nao encontrado." });
  }

  const isAdmin = req.auth.profile.memberships.some((membership) => membership.role === "admin" || membership.role === "manager");
  const driver = getDriverProfileByUser(db, req.auth.profile.userId);
  const isAssignedDriver = driver && order.assignedDriverId === driver.id;
  if (!isAdmin && !isAssignedDriver) {
    return res.status(403).json({ error: "Sem permissao para atualizar este pedido." });
  }

  updateOrderStatus(db, order.id, req.body.status, {
    userId: req.auth.profile.userId,
    role: isAdmin ? "admin" : "driver",
    note: req.body.note || "",
  });
  const updatedOrder = getOrderById(db, order.id);
  sendOrderStatusMessage(updatedOrder, req.body.status).catch((error) => {
    logger.warn({ error, orderId: order.id, status: req.body.status }, "Falha ao enviar status no WhatsApp");
  });
  res.json({ ok: true, order: updatedOrder });
});

app.patch("/api/admin/orders/:id", authMiddleware, requireAdmin, (req, res) => {
  const order = getOrderById(db, req.params.id);
  if (!order) {
    return res.status(404).json({ error: "Pedido nao encontrado." });
  }

  updateOrderRecord(db, order.id, {
    customerName: req.body.customerName,
    customerPhone: req.body.customerPhone,
    addressLabel: req.body.addressLabel,
    addressFull: req.body.addressFull,
    notesInternal: req.body.notesInternal,
    assignedDriverId: req.body.assignedDriverId,
  });

  res.json({ ok: true, order: getOrderById(db, order.id) });
});

app.post("/api/admin/assets", authMiddleware, requireAdmin, (req, res) => {
  upload.single("file")(req, res, (error) => {
    if (error) {
      logger.error({ error }, "Falha no upload de imagem");
      res.status(400).json({ error: error.message || "Falha ao enviar imagem." });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: "Nenhuma imagem enviada." });
      return;
    }

    const assetPath = `/uploads/${req.file.filename}`;
    res.json({
      ok: true,
      assetPath,
      assetUrl: buildAbsoluteAssetUrl(req, assetPath),
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
    });
  });
});

app.get("/api/admin/dashboard", authMiddleware, requireAdmin, (_req, res) => {
  const snapshot = resolveCatalogSnapshotUrls(_req, getCatalogSnapshot(db));
  res.json({
    ok: true,
    dashboard: {
      ...snapshot,
      recentOrders: listOrdersForRestaurant(db, RESTAURANT_ID),
      overview: buildAdminDashboardOverview(db, RESTAURANT_ID),
      drivers: listDriverProfiles(db),
      whatsappSession: serializeWhatsappSession(getWhatsappSessionRow(db)),
      promoNotificationSettings: getPromoNotificationSettings(db),
      whatsappTemplates: listWhatsappMessageTemplates(db),
    },
  });
});

app.get("/api/admin/promo-settings", authMiddleware, requireAdmin, (_req, res) => {
  res.json({ ok: true, settings: getPromoNotificationSettings(db) });
});

app.put("/api/admin/promo-settings", authMiddleware, requireAdmin, (req, res) => {
  const settings = updatePromoNotificationSettings(db, req.body || {});
  res.json({ ok: true, settings });
});

app.put("/api/admin/whatsapp-templates", authMiddleware, requireAdmin, (req, res) => {
  const templates = updateWhatsappMessageTemplates(db, req.body?.templates || []);
  res.json({ ok: true, templates });
});

app.post("/api/driver/profile", authMiddleware, (req, res) => {
  const row = upsertDriverProfileRecord(db, req.auth.profile.userId, req.body);
  res.json({ ok: true, driver: mapDriverProfile(row) });
});

app.patch("/api/driver/profile", authMiddleware, (req, res) => {
  const row = getDriverProfileByUser(db, req.auth.profile.userId);
  if (!row) {
    return res.status(404).json({ error: "Perfil de entregador nao encontrado." });
  }
  updateDriverProfileRecord(db, row.id, req.body);
  res.json({ ok: true, driver: getDriverProfileByUser(db, req.auth.profile.userId) });
});

app.get("/api/driver/dashboard", authMiddleware, (req, res) => {
  const driver = getDriverProfileByUser(db, req.auth.profile.userId);
  res.json({
    ok: true,
    dashboard: {
      restaurant: getCatalogSnapshot(db).restaurant,
      driver,
      assignedOrders: driver ? listOrdersForDriver(db, driver.id) : [],
    },
  });
});

app.post("/api/driver/location", authMiddleware, (req, res) => {
  const driver = getDriverProfileByUser(db, req.auth.profile.userId);
  if (!driver) {
    return res.status(404).json({ error: "Perfil de entregador nao encontrado." });
  }
  createDriverLocation(db, {
    driverId: driver.id,
    orderId: req.body.orderId || null,
    latitude: req.body.latitude,
    longitude: req.body.longitude,
    accuracyMeters: req.body.accuracyMeters ?? null,
    heading: req.body.heading ?? null,
    speedMps: req.body.speedMps ?? null,
    batteryLevel: req.body.batteryLevel ?? null,
  });
  res.json({ ok: true });
});

app.get("/api/whatsapp/status", (_req, res) => {
  res.json({
    ok: true,
    session: serializeWhatsappSession(getWhatsappSessionRow(db)),
  });
});

app.post("/api/whatsapp/connect", authMiddleware, requireAdmin, async (_req, res) => {
  try {
    await ensureSocket();
    res.json({ ok: true, session: serializeWhatsappSession(getWhatsappSessionRow(db)) });
  } catch (error) {
    logger.error({ error }, "Falha ao conectar WhatsApp");
    updateWhatsappSessionRow(db, { status: "error", error_message: error.message });
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/whatsapp/disconnect", authMiddleware, requireAdmin, async (_req, res) => {
  try {
    if (state.socket) {
      await state.socket.logout();
    }
    clearSocket();
    updateWhatsappSessionRow(db, {
      status: "disconnected",
      qr_code_data_url: null,
      error_message: null,
    });
    res.json({ ok: true });
  } catch (error) {
    logger.error({ error }, "Falha ao desconectar WhatsApp");
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/phone-verifications/request", authMiddleware, async (req, res) => {
  try {
    const phone = normalizePhone(req.body.phone || req.auth.profile.phone || "");
    if (phone.length < 12) {
      return res.status(400).json({ error: "Telefone invalido." });
    }
    const code = createCode();
    createPhoneVerification(db, phone, code);
    if (state.socket) {
      await sendVerificationMessage(phone, code);
    }
    res.json({
      ok: true,
      developmentCode: state.socket ? undefined : code,
      message: state.socket ? "Codigo enviado no WhatsApp." : "Codigo gerado localmente para desenvolvimento.",
    });
  } catch (error) {
    logger.error({ error }, "Falha ao solicitar verificacao");
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/phone-verifications/confirm", authMiddleware, (req, res) => {
  try {
    const phone = normalizePhone(req.body.phone || req.auth.profile.phone || "");
    const code = String(req.body.code || "").trim();
    verifyPhoneCode(db, phone, code);
    const user = findOrCreateUserByPhone(db, phone, req.auth.profile.name);
    res.json({ ok: true, profile: user });
  } catch (error) {
    logger.error({ error }, "Falha ao confirmar verificacao");
    res.status(400).json({ error: error.message });
  }
});

app.listen(PORT, async () => {
  logger.info(`Backend ouvindo em http://localhost:${PORT}`);
  await syncSessionToDatabase({});
});
