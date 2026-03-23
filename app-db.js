import crypto from "node:crypto";

const DEFAULT_RESTAURANT_ID = "11111111-1111-4111-8111-111111111111";
const DEFAULT_ADMIN_USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const DEFAULT_ADMIN_ACCOUNT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const DEFAULT_ADMIN_PHONE = "5500000000000";
const DEFAULT_ADMIN_EMAIL = process.env.DEFAULT_ADMIN_EMAIL || "smashadmin@smash.com";
const DEFAULT_ADMIN_PASSWORD = process.env.DEFAULT_ADMIN_PASSWORD || "admin123";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const DEFAULT_WHATSAPP_TEMPLATES = [
  {
    key: "order_summary",
    label: "Resumo do pedido",
    body: [
      "Agradecemos *{{customer_name}}*, confirmamos o seu pedido *{{order_code}}*. Vou te atualizando sobre o seu pedido por aqui 😉",
      "",
      "====== Pedido nº *{{order_code}}* ======",
      "",
      "{{items_block}}",
      "{{obs_block}}",
      "",
      "Forma de Pagamento: *{{payment_method}}* {{payment_emoji}}",
      "",
      "Valor itens: *{{items_total}}*",
      "{{delivery_fee_block}}",
      "= Valor Total: *{{total}}*",
      "",
      "{{delivery_mode_label}}",
      "{{address_block}}",
    ].join("\n"),
  },
  {
    key: "pending",
    label: "Pedido recebido",
    body: "Ola, {{customer_name}}, seu pedido *{{order_code}}* foi recebido e estamos organizando tudo por aqui.",
  },
  {
    key: "confirmed",
    label: "Pedido confirmado",
    body: "Ola, {{customer_name}}, confirmamos o pedido *{{order_code}}* e ele ja entrou em preparo!",
  },
  {
    key: "preparing",
    label: "Pedido em preparo",
    body: "Ola, {{customer_name}}, seu pedido *{{order_code}}* esta em preparo neste momento.",
  },
  {
    key: "out_for_delivery",
    label: "Saiu para entrega",
    body: "Ola, {{customer_name}}, seu pedido *{{order_code}}* saiu para entrega e ja esta a caminho.",
  },
  {
    key: "delivered",
    label: "Pedido entregue",
    body: "Ola, {{customer_name}}, seu pedido *{{order_code}}* foi entregue. Bom apetite!",
  },
  {
    key: "cancelled",
    label: "Pedido cancelado",
    body: "Ola, {{customer_name}}, seu pedido *{{order_code}}* foi cancelado. Se precisar, fale com a loja.",
  },
];

const nowIso = () => new Date().toISOString();
const hashValue = (value) => crypto.createHash("sha256").update(value).digest("hex");
const createId = () => crypto.randomUUID();
const createToken = () => crypto.randomBytes(48).toString("hex");
const createPasswordSalt = () => crypto.randomBytes(16).toString("hex");
const hashPassword = (password, salt) => crypto.scryptSync(password, salt, 64).toString("hex");
const verifyPassword = (password, salt, expectedHash) => {
  const calculatedHash = hashPassword(password, salt);
  return crypto.timingSafeEqual(Buffer.from(calculatedHash, "hex"), Buffer.from(expectedHash, "hex"));
};
const hasColumn = (db, tableName, columnName) => db.prepare(`PRAGMA table_info(${tableName})`).all()
  .some((column) => column.name === columnName);
const ensureColumn = (db, tableName, columnName, definition) => {
  if (!hasColumn(db, tableName, columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
};

export const initAppDatabase = (db) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      phone TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL DEFAULT '',
      avatar_url TEXT NOT NULL DEFAULT '',
      phone_verified_at TEXT,
      preferred_role TEXT NOT NULL DEFAULT 'customer',
      loyalty_points_balance REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS memberships (
      id TEXT PRIMARY KEY,
      restaurant_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'customer',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS addresses (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      label TEXT NOT NULL DEFAULT 'Casa',
      street TEXT NOT NULL,
      number TEXT NOT NULL DEFAULT '',
      complement TEXT DEFAULT '',
      neighborhood TEXT NOT NULL DEFAULT '',
      city TEXT NOT NULL DEFAULT '',
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      restaurant_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      delivery_mode TEXT NOT NULL DEFAULT 'delivery',
      payment_method TEXT NOT NULL DEFAULT 'pix',
      address_label TEXT,
      address_full TEXT,
      customer_name TEXT NOT NULL DEFAULT '',
      customer_phone TEXT NOT NULL DEFAULT '',
      coupon_code TEXT,
      subtotal REAL NOT NULL DEFAULT 0,
      discount REAL NOT NULL DEFAULT 0,
      delivery_fee REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      loyalty_points_redeemed REAL NOT NULL DEFAULT 0,
      loyalty_discount REAL NOT NULL DEFAULT 0,
      loyalty_points_earned REAL NOT NULL DEFAULT 0,
      obs TEXT,
      notes_internal TEXT,
      assigned_driver_id TEXT,
      created_at TEXT NOT NULL,
      confirmed_at TEXT,
      prepared_at TEXT,
      dispatched_at TEXT,
      delivered_at TEXT,
      cancelled_at TEXT,
      latitude REAL,
      longitude REAL
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      product_id TEXT,
      product_slug TEXT,
      product_name TEXT NOT NULL,
      product_price REAL NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      extras TEXT NOT NULL DEFAULT '[]',
      option_snapshot TEXT NOT NULL DEFAULT '[]',
      item_total REAL NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS driver_profiles (
      id TEXT PRIMARY KEY,
      restaurant_id TEXT NOT NULL,
      user_id TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      vehicle_label TEXT NOT NULL DEFAULT '',
      vehicle_plate TEXT NOT NULL DEFAULT '',
      avatar_url TEXT NOT NULL DEFAULT '',
      is_online INTEGER NOT NULL DEFAULT 0,
      is_available INTEGER NOT NULL DEFAULT 1,
      last_seen_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS driver_locations (
      id TEXT PRIMARY KEY,
      driver_id TEXT NOT NULL,
      order_id TEXT,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      accuracy_meters REAL,
      heading REAL,
      speed_mps REAL,
      battery_level INTEGER,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS order_status_events (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      status TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      actor_user_id TEXT,
      actor_role TEXT NOT NULL DEFAULT 'system',
      latitude REAL,
      longitude REAL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS phone_verifications (
      id TEXT PRIMARY KEY,
      phone TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      expires_at TEXT NOT NULL,
      verified_at TEXT,
      last_sent_at TEXT,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS whatsapp_sessions (
      id TEXT PRIMARY KEY,
      restaurant_id TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'disconnected',
      qr_code_data_url TEXT,
      phone_jid TEXT,
      phone_number TEXT,
      device_name TEXT,
      error_message TEXT,
      last_connected_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS admin_accounts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password_salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      must_change_password INTEGER NOT NULL DEFAULT 1,
      is_active INTEGER NOT NULL DEFAULT 1,
      failed_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until TEXT,
      last_login_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS promo_notification_settings (
      restaurant_id TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL DEFAULT 0,
      title TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL DEFAULT '',
      target_path TEXT NOT NULL DEFAULT '/promos',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS whatsapp_message_templates (
      key TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    );
  `);

  ensureColumn(db, "users", "loyalty_points_balance", "REAL NOT NULL DEFAULT 0");
  ensureColumn(db, "orders", "loyalty_points_redeemed", "REAL NOT NULL DEFAULT 0");
  ensureColumn(db, "orders", "loyalty_discount", "REAL NOT NULL DEFAULT 0");
  ensureColumn(db, "orders", "loyalty_points_earned", "REAL NOT NULL DEFAULT 0");

  const hasWhatsappSession = db.prepare("SELECT id FROM whatsapp_sessions WHERE restaurant_id = ?").get(DEFAULT_RESTAURANT_ID);
  if (!hasWhatsappSession) {
    db.prepare(`
      INSERT INTO whatsapp_sessions (
        id, restaurant_id, status, created_at, updated_at
      ) VALUES (?, ?, 'disconnected', ?, ?)
    `).run(createId(), DEFAULT_RESTAURANT_ID, nowIso(), nowIso());
  }

  const adminUser = db.prepare("SELECT id FROM users WHERE id = ? LIMIT 1").get(DEFAULT_ADMIN_USER_ID);
  if (!adminUser) {
    db.prepare(`
      INSERT INTO users (id, phone, name, phone_verified_at, preferred_role, created_at, updated_at)
      VALUES (?, ?, 'Smash Admin', ?, 'admin', ?, ?)
    `).run(DEFAULT_ADMIN_USER_ID, DEFAULT_ADMIN_PHONE, nowIso(), nowIso(), nowIso());
  }

  const adminMembership = db.prepare(`
    SELECT id
    FROM memberships
    WHERE restaurant_id = ?
      AND user_id = ?
    LIMIT 1
  `).get(DEFAULT_RESTAURANT_ID, DEFAULT_ADMIN_USER_ID);

  if (!adminMembership) {
    db.prepare(`
      INSERT INTO memberships (id, restaurant_id, user_id, role, is_active, created_at, updated_at)
      VALUES (?, ?, ?, 'admin', 1, ?, ?)
    `).run(createId(), DEFAULT_RESTAURANT_ID, DEFAULT_ADMIN_USER_ID, nowIso(), nowIso());
  }

  const adminAccount = db.prepare("SELECT id FROM admin_accounts WHERE id = ? LIMIT 1").get(DEFAULT_ADMIN_ACCOUNT_ID);
  if (!adminAccount) {
    const salt = createPasswordSalt();
    db.prepare(`
      INSERT INTO admin_accounts (
        id, user_id, email, password_salt, password_hash, must_change_password, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 1, 1, ?, ?)
    `).run(
      DEFAULT_ADMIN_ACCOUNT_ID,
      DEFAULT_ADMIN_USER_ID,
      DEFAULT_ADMIN_EMAIL,
      salt,
      hashPassword(DEFAULT_ADMIN_PASSWORD, salt),
      nowIso(),
      nowIso(),
    );
  }

  const promoSettings = db.prepare("SELECT restaurant_id FROM promo_notification_settings WHERE restaurant_id = ? LIMIT 1").get(DEFAULT_RESTAURANT_ID);
  if (!promoSettings) {
    db.prepare(`
      INSERT INTO promo_notification_settings (restaurant_id, enabled, title, body, target_path, updated_at)
      VALUES (?, 0, 'Promocao nova no app', 'Tem desconto novo te esperando.', '/promos', ?)
    `).run(DEFAULT_RESTAURANT_ID, nowIso());
  }

  DEFAULT_WHATSAPP_TEMPLATES.forEach((template) => {
    const existingTemplate = db.prepare("SELECT key FROM whatsapp_message_templates WHERE key = ? LIMIT 1").get(template.key);
    if (!existingTemplate) {
      db.prepare(`
        INSERT INTO whatsapp_message_templates (key, label, body, updated_at)
        VALUES (?, ?, ?, ?)
      `).run(template.key, template.label, template.body, nowIso());
    }
  });
};

const getMembershipRows = (db, userId) => db.prepare(`
  SELECT *
  FROM memberships
  WHERE user_id = ?
    AND is_active = 1
`).all(userId);

const mapProfile = (db, userRow) => ({
  id: userRow.id,
  userId: userRow.id,
  name: userRow.name,
  phone: userRow.phone,
  avatarUrl: userRow.avatar_url || "",
  phoneVerifiedAt: userRow.phone_verified_at || null,
  preferredRole: userRow.preferred_role || "customer",
  loyaltyPointsBalance: Number(userRow.loyalty_points_balance || 0),
  memberships: getMembershipRows(db, userRow.id).map((membership) => ({
    id: membership.id,
    restaurantId: membership.restaurant_id,
    userId: membership.user_id,
    role: membership.role,
    isActive: Boolean(membership.is_active),
  })),
});

export const getSessionUser = (db, token) => {
  if (!token) return null;
  const tokenHash = hashValue(token);
  const session = db.prepare(`
    SELECT *
    FROM sessions
    WHERE token_hash = ?
      AND expires_at > ?
    LIMIT 1
  `).get(tokenHash, nowIso());

  if (!session) return null;
  const user = db.prepare("SELECT * FROM users WHERE id = ? LIMIT 1").get(session.user_id);
  if (!user) return null;
  return {
    token,
    session,
    profile: mapProfile(db, user),
  };
};

export const createPhoneVerification = (db, phone, code) => {
  const id = createId();
  const timestamp = nowIso();
  db.prepare(`
    INSERT INTO phone_verifications (
      id, phone, code_hash, status, expires_at, last_sent_at, attempt_count, created_at, updated_at
    ) VALUES (?, ?, ?, 'pending', ?, ?, 0, ?, ?)
  `).run(
    id,
    phone,
    hashValue(code),
    new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    timestamp,
    timestamp,
    timestamp,
  );
  return id;
};

export const verifyPhoneCode = (db, phone, code) => {
  const record = db.prepare(`
    SELECT *
    FROM phone_verifications
    WHERE phone = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).get(phone);

  if (!record) {
    throw new Error("Nenhuma verificacao pendente encontrada.");
  }
  if (new Date(record.expires_at).getTime() < Date.now()) {
    db.prepare("UPDATE phone_verifications SET status = 'expired', updated_at = ? WHERE id = ?").run(nowIso(), record.id);
    throw new Error("Codigo expirado.");
  }
  if (hashValue(code) !== record.code_hash) {
    db.prepare(`
      UPDATE phone_verifications
      SET status = 'failed', attempt_count = attempt_count + 1, updated_at = ?
      WHERE id = ?
    `).run(nowIso(), record.id);
    throw new Error("Codigo invalido.");
  }

  db.prepare(`
    UPDATE phone_verifications
    SET status = 'verified', verified_at = ?, updated_at = ?
    WHERE id = ?
  `).run(nowIso(), nowIso(), record.id);

  return record;
};

export const findOrCreateUserByPhone = (db, phone, name = "") => {
  const existing = db.prepare("SELECT * FROM users WHERE phone = ? LIMIT 1").get(phone);
  if (existing) {
    if (name && !existing.name) {
      db.prepare("UPDATE users SET name = ?, phone_verified_at = ?, updated_at = ? WHERE id = ?")
        .run(name, nowIso(), nowIso(), existing.id);
      return db.prepare("SELECT * FROM users WHERE id = ?").get(existing.id);
    }

    db.prepare("UPDATE users SET phone_verified_at = ?, updated_at = ? WHERE id = ?")
      .run(nowIso(), nowIso(), existing.id);
    return db.prepare("SELECT * FROM users WHERE id = ?").get(existing.id);
  }

  const id = createId();
  const timestamp = nowIso();
  db.prepare(`
    INSERT INTO users (id, phone, name, phone_verified_at, preferred_role, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'customer', ?, ?)
  `).run(id, phone, name || "", timestamp, timestamp, timestamp);

  return db.prepare("SELECT * FROM users WHERE id = ?").get(id);
};

export const createUserSession = (db, userId) => {
  const token = createToken();
  db.prepare(`
    INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(createId(), userId, hashValue(token), new Date(Date.now() + SESSION_TTL_MS).toISOString(), nowIso());
  return token;
};

export const deleteSession = (db, token) => {
  if (!token) return;
  db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashValue(token));
};

export const listAddresses = (db, userId) => db.prepare(`
  SELECT *
  FROM addresses
  WHERE user_id = ?
  ORDER BY is_default DESC, created_at ASC
`).all(userId);

export const createAddress = (db, userId, payload) => {
  const id = createId();
  const isFirst = !db.prepare("SELECT id FROM addresses WHERE user_id = ? LIMIT 1").get(userId);
  if (payload.is_default || isFirst) {
    db.prepare("UPDATE addresses SET is_default = 0 WHERE user_id = ?").run(userId);
  }

  db.prepare(`
    INSERT INTO addresses (
      id, user_id, label, street, number, complement, neighborhood, city, is_default, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    userId,
    payload.label || "Casa",
    payload.street,
    payload.number || "",
    payload.complement || "",
    payload.neighborhood || "",
    payload.city || "",
    payload.is_default || isFirst ? 1 : 0,
    nowIso(),
  );
  return db.prepare("SELECT * FROM addresses WHERE id = ?").get(id);
};

export const deleteAddress = (db, userId, addressId) => {
  db.prepare("DELETE FROM addresses WHERE id = ? AND user_id = ?").run(addressId, userId);
};

export const setDefaultAddress = (db, userId, addressId) => {
  db.prepare("UPDATE addresses SET is_default = 0 WHERE user_id = ?").run(userId);
  db.prepare("UPDATE addresses SET is_default = 1 WHERE id = ? AND user_id = ?").run(addressId, userId);
};

export const createOrderRecord = (db, payload) => {
  const orderId = createId();
  const timestamp = nowIso();
  const restaurant = db.prepare("SELECT loyalty_points_per_real FROM restaurant LIMIT 1").get();
  const user = db.prepare("SELECT loyalty_points_balance FROM users WHERE id = ? LIMIT 1").get(payload.userId);
  const requestedRedeem = Math.max(0, Number(payload.loyaltyPointsRedeemed || 0));
  const availablePoints = Number(user?.loyalty_points_balance || 0);
  const redeemableCeiling = Math.max(0, Number(payload.subtotal || 0) - Number(payload.discount || 0));
  const safeRedeem = Math.min(requestedRedeem, availablePoints, redeemableCeiling);
  const loyaltyDiscount = Math.min(Math.max(0, Number(payload.loyaltyDiscount || safeRedeem)), safeRedeem);
  const pointsPerReal = Math.max(0, Number(restaurant?.loyalty_points_per_real || 0));
  const loyaltyPointsEarned = Number(Math.max(0, ((payload.subtotal || 0) - (payload.discount || 0) - loyaltyDiscount) * pointsPerReal).toFixed(2));

  if (requestedRedeem > availablePoints) {
    throw new Error("Pontos insuficientes para esse pedido.");
  }

  db.prepare(`
    INSERT INTO orders (
      id, user_id, restaurant_id, status, delivery_mode, payment_method, address_label, address_full,
      customer_name, customer_phone, coupon_code, subtotal, discount, delivery_fee, total,
      loyalty_points_redeemed, loyalty_discount, loyalty_points_earned, obs,
      notes_internal, assigned_driver_id, created_at, latitude, longitude
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    orderId,
    payload.userId,
    payload.restaurantId || DEFAULT_RESTAURANT_ID,
    "pending",
    payload.deliveryMode,
    payload.paymentMethod,
    payload.addressLabel || null,
    payload.addressFull || null,
    payload.customerName || "",
    payload.customerPhone || "",
    payload.couponCode || null,
    payload.subtotal || 0,
    payload.discount || 0,
    payload.deliveryFee || 0,
    payload.total || 0,
    safeRedeem,
    loyaltyDiscount,
    loyaltyPointsEarned,
    payload.obs || null,
    payload.notesInternal || null,
    payload.assignedDriverId || null,
    timestamp,
    payload.latitude ?? null,
    payload.longitude ?? null,
  );

  if (safeRedeem > 0) {
    db.prepare(`
      UPDATE users
      SET loyalty_points_balance = MAX(0, loyalty_points_balance - ?), updated_at = ?
      WHERE id = ?
    `).run(safeRedeem, timestamp, payload.userId);
  }

  const insertItem = db.prepare(`
    INSERT INTO order_items (
      id, order_id, product_id, product_slug, product_name, product_price, quantity, extras, option_snapshot, item_total
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  (payload.items || []).forEach((item) => {
    insertItem.run(
      createId(),
      orderId,
      item.productId || null,
      item.productSlug || null,
      item.productName,
      item.productPrice,
      item.quantity,
      JSON.stringify(item.extras || []),
      JSON.stringify(item.optionSnapshot || []),
      item.itemTotal,
    );
  });

  db.prepare(`
    INSERT INTO order_status_events (
      id, order_id, status, note, actor_user_id, actor_role, created_at
    ) VALUES (?, ?, 'pending', ?, ?, ?, ?)
  `).run(createId(), orderId, "Pedido recebido pelo app", payload.userId, "customer", timestamp);

  return orderId;
};

const mapOrderRow = (db, row) => {
  const items = db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(row.id).map((item) => ({
    id: item.id,
    orderId: item.order_id,
    productId: item.product_id,
    productSlug: item.product_slug,
    productName: item.product_name,
    productPrice: item.product_price,
    quantity: item.quantity,
    extras: JSON.parse(item.extras || "[]"),
    optionSnapshot: JSON.parse(item.option_snapshot || "[]"),
    itemTotal: item.item_total,
  }));

  const location = row.assigned_driver_id
    ? db.prepare("SELECT * FROM driver_locations WHERE order_id = ? ORDER BY created_at DESC LIMIT 1").get(row.id)
    : null;

  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    userId: row.user_id,
    status: row.status,
    deliveryMode: row.delivery_mode,
    paymentMethod: row.payment_method,
    addressLabel: row.address_label,
    addressFull: row.address_full,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    couponCode: row.coupon_code,
    subtotal: row.subtotal,
    discount: row.discount,
    deliveryFee: row.delivery_fee,
    total: row.total,
    loyaltyPointsRedeemed: Number(row.loyalty_points_redeemed || 0),
    loyaltyDiscount: Number(row.loyalty_discount || 0),
    loyaltyPointsEarned: Number(row.loyalty_points_earned || 0),
    obs: row.obs,
    notesInternal: row.notes_internal,
    assignedDriverId: row.assigned_driver_id,
    createdAt: row.created_at,
    confirmedAt: row.confirmed_at,
    preparedAt: row.prepared_at,
    dispatchedAt: row.dispatched_at,
    deliveredAt: row.delivered_at,
    cancelledAt: row.cancelled_at,
    latitude: row.latitude,
    longitude: row.longitude,
    items,
    latestDriverLocation: location ? {
      id: location.id,
      driverId: location.driver_id,
      orderId: location.order_id,
      latitude: location.latitude,
      longitude: location.longitude,
      accuracyMeters: location.accuracy_meters,
      heading: location.heading,
      speedMps: location.speed_mps,
      batteryLevel: location.battery_level,
      createdAt: location.created_at,
    } : null,
  };
};

export const getOrderById = (db, orderId) => {
  const row = db.prepare("SELECT * FROM orders WHERE id = ? LIMIT 1").get(orderId);
  return row ? mapOrderRow(db, row) : null;
};

export const listOrdersForUser = (db, userId) => db.prepare(`
  SELECT *
  FROM orders
  WHERE user_id = ?
  ORDER BY created_at DESC
`).all(userId).map((row) => mapOrderRow(db, row));

export const listOrdersForRestaurant = (db, restaurantId) => db.prepare(`
  SELECT *
  FROM orders
  WHERE restaurant_id = ?
  ORDER BY created_at DESC
  LIMIT 20
`).all(restaurantId).map((row) => mapOrderRow(db, row));

export const updateOrderStatus = (db, orderId, status, actor) => {
  const currentOrder = db.prepare("SELECT * FROM orders WHERE id = ? LIMIT 1").get(orderId);
  const timestampFieldMap = {
    confirmed: "confirmed_at",
    preparing: "prepared_at",
    dispatched: "dispatched_at",
    out_for_delivery: "dispatched_at",
    delivered: "delivered_at",
    cancelled: "cancelled_at",
  };

  db.prepare(`UPDATE orders SET status = ? WHERE id = ?`).run(status, orderId);
  const field = timestampFieldMap[status];
  if (field) {
    db.prepare(`UPDATE orders SET ${field} = ? WHERE id = ?`).run(nowIso(), orderId);
  }
  if (status === "delivered" && currentOrder && !currentOrder.delivered_at && Number(currentOrder.loyalty_points_earned || 0) > 0) {
    db.prepare(`
      UPDATE users
      SET loyalty_points_balance = loyalty_points_balance + ?, updated_at = ?
      WHERE id = ?
    `).run(Number(currentOrder.loyalty_points_earned || 0), nowIso(), currentOrder.user_id);
  }
  db.prepare(`
    INSERT INTO order_status_events (
      id, order_id, status, note, actor_user_id, actor_role, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(createId(), orderId, status, actor.note || "", actor.userId || null, actor.role || "system", nowIso());
};

export const updateOrderRecord = (db, orderId, patch) => {
  db.prepare(`
    UPDATE orders
    SET
      customer_name = COALESCE(?, customer_name),
      customer_phone = COALESCE(?, customer_phone),
      address_label = COALESCE(?, address_label),
      address_full = COALESCE(?, address_full),
      notes_internal = COALESCE(?, notes_internal),
      assigned_driver_id = COALESCE(?, assigned_driver_id)
    WHERE id = ?
  `).run(
    patch.customerName ?? null,
    patch.customerPhone ?? null,
    patch.addressLabel ?? null,
    patch.addressFull ?? null,
    patch.notesInternal ?? null,
    patch.assignedDriverId ?? null,
    orderId,
  );
};

export const countAdminMemberships = (db) => {
  const row = db.prepare(`
    SELECT COUNT(*) AS total
    FROM memberships
    WHERE restaurant_id = ?
      AND is_active = 1
      AND role IN ('admin', 'manager')
  `).get(DEFAULT_RESTAURANT_ID);
  return row?.total || 0;
};

export const ensureAdminMembership = (db, userId) => {
  const existing = db.prepare(`
    SELECT * FROM memberships
    WHERE restaurant_id = ?
      AND user_id = ?
    LIMIT 1
  `).get(DEFAULT_RESTAURANT_ID, userId);

  if (existing) {
    db.prepare(`
      UPDATE memberships
      SET role = 'admin', is_active = 1, updated_at = ?
      WHERE id = ?
    `).run(nowIso(), existing.id);
  } else {
    db.prepare(`
      INSERT INTO memberships (id, restaurant_id, user_id, role, is_active, created_at, updated_at)
      VALUES (?, ?, ?, 'admin', 1, ?, ?)
    `).run(createId(), DEFAULT_RESTAURANT_ID, userId, nowIso(), nowIso());
  }

  db.prepare("UPDATE users SET preferred_role = 'admin', updated_at = ? WHERE id = ?").run(nowIso(), userId);
};

export const upsertDriverProfileRecord = (db, userId, payload) => {
  const existing = db.prepare("SELECT * FROM driver_profiles WHERE user_id = ? LIMIT 1").get(userId);
  if (existing) {
    db.prepare(`
      UPDATE driver_profiles
      SET display_name = ?, phone = ?, vehicle_label = ?, vehicle_plate = ?, last_seen_at = ?, updated_at = ?
      WHERE id = ?
    `).run(
      payload.displayName,
      payload.phone || "",
      payload.vehicleLabel || "",
      payload.vehiclePlate || "",
      nowIso(),
      nowIso(),
      existing.id,
    );
  } else {
    db.prepare(`
      INSERT INTO driver_profiles (
        id, restaurant_id, user_id, display_name, phone, vehicle_label, vehicle_plate,
        is_online, is_available, last_seen_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?, ?)
    `).run(
      createId(),
      DEFAULT_RESTAURANT_ID,
      userId,
      payload.displayName,
      payload.phone || "",
      payload.vehicleLabel || "",
      payload.vehiclePlate || "",
      nowIso(),
      nowIso(),
      nowIso(),
    );
  }

  return db.prepare("SELECT * FROM driver_profiles WHERE user_id = ? LIMIT 1").get(userId);
};

export const updateDriverProfileRecord = (db, driverId, patch) => {
  db.prepare(`
    UPDATE driver_profiles
    SET
      display_name = COALESCE(?, display_name),
      phone = COALESCE(?, phone),
      vehicle_label = COALESCE(?, vehicle_label),
      vehicle_plate = COALESCE(?, vehicle_plate),
      is_online = COALESCE(?, is_online),
      is_available = COALESCE(?, is_available),
      last_seen_at = ?,
      updated_at = ?
    WHERE id = ?
  `).run(
    patch.displayName ?? null,
    patch.phone ?? null,
    patch.vehicleLabel ?? null,
    patch.vehiclePlate ?? null,
    patch.isOnline == null ? null : (patch.isOnline ? 1 : 0),
    patch.isAvailable == null ? null : (patch.isAvailable ? 1 : 0),
    nowIso(),
    nowIso(),
    driverId,
  );
};

export const mapDriverProfile = (row) => row ? ({
  id: row.id,
  restaurantId: row.restaurant_id,
  userId: row.user_id,
  displayName: row.display_name,
  phone: row.phone,
  vehicleLabel: row.vehicle_label,
  vehiclePlate: row.vehicle_plate,
  avatarUrl: row.avatar_url || "",
  isOnline: Boolean(row.is_online),
  isAvailable: Boolean(row.is_available),
  lastSeenAt: row.last_seen_at || null,
}) : null;

export const listDriverProfiles = (db) => db.prepare(`
  SELECT *
  FROM driver_profiles
  WHERE restaurant_id = ?
  ORDER BY created_at DESC
`).all(DEFAULT_RESTAURANT_ID).map(mapDriverProfile);

export const getDriverProfileByUser = (db, userId) => {
  const row = db.prepare("SELECT * FROM driver_profiles WHERE user_id = ? LIMIT 1").get(userId);
  return mapDriverProfile(row);
};

export const listOrdersForDriver = (db, driverId) => db.prepare(`
  SELECT *
  FROM orders
  WHERE assigned_driver_id = ?
  ORDER BY created_at DESC
`).all(driverId).map((row) => mapOrderRow(db, row));

export const createDriverLocation = (db, payload) => {
  db.prepare(`
    INSERT INTO driver_locations (
      id, driver_id, order_id, latitude, longitude, accuracy_meters, heading, speed_mps, battery_level, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    createId(),
    payload.driverId,
    payload.orderId || null,
    payload.latitude,
    payload.longitude,
    payload.accuracyMeters ?? null,
    payload.heading ?? null,
    payload.speedMps ?? null,
    payload.batteryLevel ?? null,
    nowIso(),
  );
};

export const getWhatsappSessionRow = (db) => db.prepare(`
  SELECT *
  FROM whatsapp_sessions
  WHERE restaurant_id = ?
  LIMIT 1
`).get(DEFAULT_RESTAURANT_ID);

export const updateWhatsappSessionRow = (db, patch) => {
  const current = getWhatsappSessionRow(db);
  db.prepare(`
    UPDATE whatsapp_sessions
    SET
      status = ?,
      qr_code_data_url = ?,
      phone_jid = ?,
      phone_number = ?,
      device_name = ?,
      error_message = ?,
      last_connected_at = ?,
      updated_at = ?
    WHERE restaurant_id = ?
  `).run(
    patch.status ?? current.status,
    patch.qr_code_data_url ?? current.qr_code_data_url,
    patch.phone_jid ?? current.phone_jid,
    patch.phone_number ?? current.phone_number,
    patch.device_name ?? current.device_name,
    patch.error_message ?? current.error_message,
    patch.last_connected_at ?? current.last_connected_at,
    nowIso(),
    DEFAULT_RESTAURANT_ID,
  );
};

export const serializeWhatsappSession = (row) => ({
  id: row.id,
  restaurantId: row.restaurant_id,
  status: row.status,
  qrCodeDataUrl: row.qr_code_data_url || "",
  phoneJid: row.phone_jid || "",
  phoneNumber: row.phone_number || "",
  deviceName: row.device_name || "",
  errorMessage: row.error_message || "",
  lastConnectedAt: row.last_connected_at || null,
});

export const loginAdminAccount = (db, email, password) => {
  const account = db.prepare(`
    SELECT *
    FROM admin_accounts
    WHERE lower(email) = lower(?)
      AND is_active = 1
    LIMIT 1
  `).get(email);

  if (!account) {
    throw new Error("Credenciais invalidas.");
  }

  if (account.locked_until && new Date(account.locked_until).getTime() > Date.now()) {
    throw new Error("Login temporariamente bloqueado. Tente novamente em alguns minutos.");
  }

  if (!verifyPassword(password, account.password_salt, account.password_hash)) {
    const failedAttempts = (account.failed_attempts || 0) + 1;
    const lockedUntil = failedAttempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null;
    db.prepare(`
      UPDATE admin_accounts
      SET failed_attempts = ?, locked_until = ?, updated_at = ?
      WHERE id = ?
    `).run(failedAttempts, lockedUntil, nowIso(), account.id);
    throw new Error("Credenciais invalidas.");
  }

  db.prepare(`
    UPDATE admin_accounts
    SET failed_attempts = 0, locked_until = NULL, last_login_at = ?, updated_at = ?
    WHERE id = ?
  `).run(nowIso(), nowIso(), account.id);

  const token = createUserSession(db, account.user_id);
  const session = getSessionUser(db, token);
  return {
    token,
    profile: session.profile,
    admin: {
      email: account.email,
      mustChangePassword: Boolean(account.must_change_password),
      lastLoginAt: account.last_login_at || null,
    },
  };
};

export const getAdminAccountForUser = (db, userId) => {
  const account = db.prepare(`
    SELECT *
    FROM admin_accounts
    WHERE user_id = ?
      AND is_active = 1
    LIMIT 1
  `).get(userId);

  if (!account) return null;

  return {
    email: account.email,
    mustChangePassword: Boolean(account.must_change_password),
    lastLoginAt: account.last_login_at || null,
  };
};

export const changeAdminPassword = (db, userId, currentPassword, nextPassword) => {
  const account = db.prepare(`
    SELECT *
    FROM admin_accounts
    WHERE user_id = ?
      AND is_active = 1
    LIMIT 1
  `).get(userId);

  if (!account) {
    throw new Error("Conta admin nao encontrada.");
  }

  if (!verifyPassword(currentPassword, account.password_salt, account.password_hash)) {
    throw new Error("Senha atual invalida.");
  }

  if (typeof nextPassword !== "string" || nextPassword.length < 10 || !/[A-Za-z]/.test(nextPassword) || !/\d/.test(nextPassword)) {
    throw new Error("A nova senha precisa ter pelo menos 10 caracteres, com letras e numeros.");
  }

  const nextSalt = createPasswordSalt();
  db.prepare(`
    UPDATE admin_accounts
    SET password_salt = ?, password_hash = ?, must_change_password = 0, updated_at = ?
    WHERE id = ?
  `).run(nextSalt, hashPassword(nextPassword, nextSalt), nowIso(), account.id);

  return getAdminAccountForUser(db, userId);
};

export const getPromoNotificationSettings = (db) => {
  const row = db.prepare(`
    SELECT *
    FROM promo_notification_settings
    WHERE restaurant_id = ?
    LIMIT 1
  `).get(DEFAULT_RESTAURANT_ID);

  return row ? {
    enabled: Boolean(row.enabled),
    title: row.title,
    body: row.body,
    targetPath: row.target_path,
    updatedAt: row.updated_at,
  } : null;
};

export const updatePromoNotificationSettings = (db, patch) => {
  db.prepare(`
    UPDATE promo_notification_settings
    SET
      enabled = COALESCE(?, enabled),
      title = COALESCE(?, title),
      body = COALESCE(?, body),
      target_path = COALESCE(?, target_path),
      updated_at = ?
    WHERE restaurant_id = ?
  `).run(
    patch.enabled == null ? null : (patch.enabled ? 1 : 0),
    patch.title ?? null,
    patch.body ?? null,
    patch.targetPath ?? null,
    nowIso(),
    DEFAULT_RESTAURANT_ID,
  );

  return getPromoNotificationSettings(db);
};

export const listWhatsappMessageTemplates = (db) => db.prepare(`
  SELECT *
  FROM whatsapp_message_templates
  ORDER BY key
`).all().map((row) => ({
  key: row.key,
  label: row.label,
  body: row.body,
  updatedAt: row.updated_at,
}));

export const updateWhatsappMessageTemplates = (db, templates) => {
  const upsert = db.prepare(`
    INSERT INTO whatsapp_message_templates (key, label, body, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      label = excluded.label,
      body = excluded.body,
      updated_at = excluded.updated_at
  `);
  const timestamp = nowIso();
  const transaction = db.transaction((rows) => {
    rows.forEach((template) => {
      upsert.run(
        template.key,
        template.label || DEFAULT_WHATSAPP_TEMPLATES.find((item) => item.key === template.key)?.label || template.key,
        template.body || "",
        timestamp,
      );
    });
  });
  transaction(templates || []);
  return listWhatsappMessageTemplates(db);
};

export const buildAdminDashboardOverview = (db, restaurantId = DEFAULT_RESTAURANT_ID) => {
  const orders = db.prepare(`
    SELECT *
    FROM orders
    WHERE restaurant_id = ?
    ORDER BY created_at DESC
  `).all(restaurantId);
  const users = db.prepare(`
    SELECT *
    FROM users
    ORDER BY created_at DESC
  `).all();

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7)).getTime();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const completedOrders = orders.filter((order) => !["cancelled"].includes(order.status));
  const deliveredOrders = completedOrders.filter((order) => order.status === "delivered");

  const revenueByRange = (rangeStart) => deliveredOrders
    .filter((order) => new Date(order.created_at).getTime() >= rangeStart)
    .reduce((sum, order) => sum + Number(order.total || 0), 0);

  const topProductsMap = new Map();
  db.prepare(`
    SELECT oi.product_name AS product_name, SUM(oi.quantity) AS quantity, SUM(oi.item_total) AS revenue
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE o.restaurant_id = ?
      AND o.status != 'cancelled'
    GROUP BY oi.product_name
    ORDER BY quantity DESC, revenue DESC
    LIMIT 5
  `).all(restaurantId).forEach((row) => {
    topProductsMap.set(row.product_name, {
      productName: row.product_name,
      quantity: Number(row.quantity || 0),
      revenue: Number(row.revenue || 0),
    });
  });

  const timeline = Array.from({ length: 7 }).map((_, offset) => {
    const date = new Date(now);
    date.setDate(now.getDate() - (6 - offset));
    const dayKey = date.toISOString().slice(0, 10);
    const dayOrders = deliveredOrders.filter((order) => order.created_at.slice(0, 10) === dayKey);
    return {
      label: date.toLocaleDateString("pt-BR", { weekday: "short" }),
      total: dayOrders.reduce((sum, order) => sum + Number(order.total || 0), 0),
      orderCount: dayOrders.length,
    };
  });

  const alerts = [];
  const lateOrders = orders.filter((order) => ["pending", "confirmed", "preparing"].includes(order.status)
    && (Date.now() - new Date(order.created_at).getTime()) > 35 * 60 * 1000);
  if (lateOrders.length > 0) {
    alerts.push({
      id: "late-orders",
      level: "warning",
      title: "Pedido atrasado",
      description: `${lateOrders.length} pedido(s) estao aguardando atencao ha mais de 35 minutos.`,
    });
  }
  const pendingPayments = orders.filter((order) => String(order.payment_method || "").toLowerCase().includes("pendente"));
  if (pendingPayments.length > 0) {
    alerts.push({
      id: "payment-pending",
      level: "danger",
      title: "Pagamento pendente",
      description: `${pendingPayments.length} pedido(s) com pagamento pendente precisam de revisao.`,
    });
  }
  if (alerts.length === 0) {
    alerts.push({
      id: "all-good",
      level: "info",
      title: "Operacao normal",
      description: "Sem alertas criticos no momento.",
    });
  }

  return {
    revenueToday: revenueByRange(startOfDay),
    revenueWeek: revenueByRange(startOfWeek),
    revenueMonth: revenueByRange(startOfMonth),
    averageTicket: deliveredOrders.length
      ? deliveredOrders.reduce((sum, order) => sum + Number(order.total || 0), 0) / deliveredOrders.length
      : 0,
    totalSales: deliveredOrders.reduce((sum, order) => sum + Number(order.total || 0), 0),
    newCustomers: users.filter((user) => new Date(user.created_at).getTime() >= startOfMonth).length,
    pendingOrders: orders.filter((order) => order.status === "pending").length,
    preparingOrders: orders.filter((order) => ["confirmed", "preparing"].includes(order.status)).length,
    deliveringOrders: orders.filter((order) => ["dispatched", "out_for_delivery"].includes(order.status)).length,
    finishedOrders: orders.filter((order) => order.status === "delivered").length,
    cancelledOrders: orders.filter((order) => order.status === "cancelled").length,
    salesTimeline: timeline,
    topProducts: Array.from(topProductsMap.values()),
    alerts,
  };
};
