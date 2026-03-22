import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const DEFAULT_RESTAURANT_ID = "11111111-1111-4111-8111-111111111111";

const DEFAULT_CATEGORIES = [
  { id: "31111111-1111-4111-8111-111111111111", slug: "burgers", name: "Hamburgueres", emoji: "🍔", sort_order: 0 },
  { id: "31111111-1111-4111-8111-111111111112", slug: "combos", name: "Combos", emoji: "🍟", sort_order: 1 },
  { id: "31111111-1111-4111-8111-111111111113", slug: "drinks", name: "Bebidas", emoji: "🥤", sort_order: 2 },
  { id: "31111111-1111-4111-8111-111111111114", slug: "desserts", name: "Sobremesas", emoji: "🍫", sort_order: 3 },
];

const DEFAULT_PRODUCTS = [
  { id: "41111111-1111-4111-8111-111111111111", category_id: DEFAULT_CATEGORIES[0].id, slug: "smash-classico", name: "Smash Classico", description: "Pao brioche, 150g de blend bovino, queijo, alface, tomate e molho da casa.", image_url: "", price: 29.9, compare_at_price: null, is_featured: 1, sort_order: 0 },
  { id: "41111111-1111-4111-8111-111111111112", category_id: DEFAULT_CATEGORIES[0].id, slug: "double-smash", name: "Double Smash", description: "Dois blends de 150g, cheddar duplo, cebola caramelizada e molho barbecue.", image_url: "", price: 38.9, compare_at_price: null, is_featured: 1, sort_order: 1 },
  { id: "41111111-1111-4111-8111-111111111113", category_id: DEFAULT_CATEGORIES[0].id, slug: "bacon-burger", name: "Bacon Burger", description: "Blend 180g, bacon crocante, queijo americano, picles e mostarda dijon.", image_url: "", price: 34.9, compare_at_price: null, is_featured: 0, sort_order: 2 },
  { id: "41111111-1111-4111-8111-111111111114", category_id: DEFAULT_CATEGORIES[1].id, slug: "combo-classico", name: "Combo Classico", description: "Smash classico com batata frita e refrigerante 350ml.", image_url: "", price: 44.9, compare_at_price: null, is_featured: 1, sort_order: 3 },
  { id: "41111111-1111-4111-8111-111111111115", category_id: DEFAULT_CATEGORIES[1].id, slug: "combo-double", name: "Combo Double", description: "Double Smash com batata frita grande e milk shake.", image_url: "", price: 54.9, compare_at_price: null, is_featured: 0, sort_order: 4 },
  { id: "41111111-1111-4111-8111-111111111116", category_id: DEFAULT_CATEGORIES[2].id, slug: "milk-shake", name: "Milk Shake", description: "Shake cremoso nos sabores chocolate, morango ou baunilha, 400ml.", image_url: "", price: 18.9, compare_at_price: null, is_featured: 0, sort_order: 5 },
  { id: "41111111-1111-4111-8111-111111111117", category_id: DEFAULT_CATEGORIES[2].id, slug: "refrigerante-350ml", name: "Refrigerante 350ml", description: "Coca-Cola, Guarana ou Sprite.", image_url: "", price: 7.9, compare_at_price: null, is_featured: 0, sort_order: 6 },
  { id: "41111111-1111-4111-8111-111111111118", category_id: DEFAULT_CATEGORIES[3].id, slug: "brownie-com-sorvete", name: "Brownie c Sorvete", description: "Brownie de chocolate belga com bola de sorvete de baunilha e calda.", image_url: "", price: 22.9, compare_at_price: null, is_featured: 0, sort_order: 7 },
];

const DEFAULT_BANNERS = [
  { id: "21111111-1111-4111-8111-111111111111", badge: "Novidade", title: "Smash classico da casa", subtitle: "Blend artesanal, queijo derretido e molho especial.", code: "SMASH10", image_url: "", sort_order: 0, is_active: 1 },
  { id: "21111111-1111-4111-8111-111111111112", badge: "Combo", title: "Combo double com fritas", subtitle: "Mais vendido da semana com milk shake opcional.", code: "", image_url: "", sort_order: 1, is_active: 1 },
  { id: "21111111-1111-4111-8111-111111111113", badge: "Entrega", title: "Entrega rapida em Sao Paulo", subtitle: "Acompanhe o motoboy em tempo real pelo app.", code: "", image_url: "", sort_order: 2, is_active: 1 },
  { id: "21111111-1111-4111-8111-111111111114", badge: "Desconto", title: "Primeira compra com 10% off", subtitle: "Use o cupom SMASH10 no fechamento do pedido.", code: "SMASH10", image_url: "", sort_order: 3, is_active: 1 },
];

const DEFAULT_HOURS = [
  { id: "12111111-1111-4111-8111-111111111111", weekday: 0, opens_at: "18:00", closes_at: "23:00", is_closed: 0 },
  { id: "12111111-1111-4111-8111-111111111112", weekday: 1, opens_at: "18:00", closes_at: "23:00", is_closed: 0 },
  { id: "12111111-1111-4111-8111-111111111113", weekday: 2, opens_at: "18:00", closes_at: "23:00", is_closed: 0 },
  { id: "12111111-1111-4111-8111-111111111114", weekday: 3, opens_at: "18:00", closes_at: "23:30", is_closed: 0 },
  { id: "12111111-1111-4111-8111-111111111115", weekday: 4, opens_at: "18:00", closes_at: "23:30", is_closed: 0 },
  { id: "12111111-1111-4111-8111-111111111116", weekday: 5, opens_at: "17:00", closes_at: "23:59", is_closed: 0 },
  { id: "12111111-1111-4111-8111-111111111117", weekday: 6, opens_at: "17:00", closes_at: "23:59", is_closed: 0 },
];

const DEFAULT_DELIVERY_ZONES = [
  { id: "13111111-1111-4111-8111-111111111111", name: "Consolacao e Paulista", fee: 6.9, min_eta_minutes: 30, max_eta_minutes: 45, min_order_amount: 20, is_active: 1, geojson: "{}" },
  { id: "13111111-1111-4111-8111-111111111112", name: "Centro expandido", fee: 9.9, min_eta_minutes: 40, max_eta_minutes: 55, min_order_amount: 30, is_active: 1, geojson: "{}" },
];

const DEFAULT_DISCOUNTS = [
  { id: "71111111-1111-4111-8111-111111111111", code: "SMASH10", title: "Primeira compra", description: "Ganhe 10 por cento de desconto na primeira compra.", type: "percentage", value: 10, min_order_amount: 20, max_discount_amount: 15, usage_limit: null, per_user_limit: 1, applies_to_delivery: 1, applies_to_pickup: 1, starts_at: null, ends_at: null, is_active: 1 },
];

const DEFAULT_OPTION_GROUPS = [
  { id: "51111111-1111-4111-8111-111111111111", product_id: DEFAULT_PRODUCTS[0].id, name: "Adicionais", min_select: 0, max_select: 5, is_required: 0, sort_order: 0 },
  { id: "51111111-1111-4111-8111-111111111112", product_id: DEFAULT_PRODUCTS[1].id, name: "Adicionais", min_select: 0, max_select: 5, is_required: 0, sort_order: 0 },
  { id: "51111111-1111-4111-8111-111111111113", product_id: DEFAULT_PRODUCTS[2].id, name: "Adicionais", min_select: 0, max_select: 5, is_required: 0, sort_order: 0 },
  { id: "51111111-1111-4111-8111-111111111114", product_id: DEFAULT_PRODUCTS[3].id, name: "Adicionais", min_select: 0, max_select: 5, is_required: 0, sort_order: 0 },
  { id: "51111111-1111-4111-8111-111111111115", product_id: DEFAULT_PRODUCTS[4].id, name: "Adicionais", min_select: 0, max_select: 5, is_required: 0, sort_order: 0 },
];

const DEFAULT_OPTIONS = DEFAULT_OPTION_GROUPS.flatMap((group, groupIndex) => [
  { id: `option-${groupIndex + 1}-1`, group_id: group.id, name: "Bacon extra", price: 5, is_active: 1, sort_order: 0 },
  { id: `option-${groupIndex + 1}-2`, group_id: group.id, name: "Queijo cheddar", price: 4, is_active: 1, sort_order: 1 },
  { id: `option-${groupIndex + 1}-3`, group_id: group.id, name: "Cebola caramelizada", price: 3, is_active: 1, sort_order: 2 },
  { id: `option-${groupIndex + 1}-4`, group_id: group.id, name: "Ovo", price: 3, is_active: 1, sort_order: 3 },
  { id: `option-${groupIndex + 1}-5`, group_id: group.id, name: "Molho especial", price: 2, is_active: 1, sort_order: 4 },
]);

export const initCatalogDatabase = (dbPath) => {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS restaurant (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      whatsapp_phone TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      logo_url TEXT NOT NULL DEFAULT '',
      hero_image_url TEXT NOT NULL DEFAULT '',
      address_line TEXT NOT NULL DEFAULT '',
      neighborhood TEXT NOT NULL DEFAULT '',
      city TEXT NOT NULL DEFAULT '',
      state TEXT NOT NULL DEFAULT '',
      postal_code TEXT NOT NULL DEFAULT '',
      latitude REAL,
      longitude REAL,
      delivery_fee REAL NOT NULL DEFAULT 0,
      min_order_amount REAL NOT NULL DEFAULT 0,
      free_delivery_min REAL,
      pickup_eta_min INTEGER NOT NULL DEFAULT 15,
      pickup_eta_max INTEGER NOT NULL DEFAULT 25,
      delivery_eta_min INTEGER NOT NULL DEFAULT 30,
      delivery_eta_max INTEGER NOT NULL DEFAULT 45,
      accepts_orders INTEGER NOT NULL DEFAULT 1,
      delivery_tracking_enabled INTEGER NOT NULL DEFAULT 1,
      loyalty_enabled INTEGER NOT NULL DEFAULT 1,
      loyalty_points_per_real REAL NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'active',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS restaurant_hours (
      id TEXT PRIMARY KEY,
      weekday INTEGER NOT NULL UNIQUE,
      opens_at TEXT,
      closes_at TEXT,
      is_closed INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS restaurant_banners (
      id TEXT PRIMARY KEY,
      badge TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL,
      subtitle TEXT NOT NULL DEFAULT '',
      code TEXT NOT NULL DEFAULT '',
      image_url TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      emoji TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      category_id TEXT,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      image_url TEXT NOT NULL DEFAULT '',
      price REAL NOT NULL DEFAULT 0,
      compare_at_price REAL,
      is_featured INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS product_option_groups (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      name TEXT NOT NULL,
      min_select INTEGER NOT NULL DEFAULT 0,
      max_select INTEGER NOT NULL DEFAULT 1,
      is_required INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS product_options (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL,
      name TEXT NOT NULL,
      price REAL NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS delivery_zones (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      fee REAL NOT NULL DEFAULT 0,
      min_eta_minutes INTEGER NOT NULL DEFAULT 30,
      max_eta_minutes INTEGER NOT NULL DEFAULT 45,
      min_order_amount REAL NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      geojson TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS discounts (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL DEFAULT 'percentage',
      value REAL NOT NULL DEFAULT 0,
      min_order_amount REAL NOT NULL DEFAULT 0,
      max_discount_amount REAL,
      usage_limit INTEGER,
      per_user_limit INTEGER,
      applies_to_delivery INTEGER NOT NULL DEFAULT 1,
      applies_to_pickup INTEGER NOT NULL DEFAULT 1,
      starts_at TEXT,
      ends_at TEXT,
      is_active INTEGER NOT NULL DEFAULT 1
    );
  `);

  seedDefaults(db);
  return db;
};

const seedDefaults = (db) => {
  const hasRestaurant = db.prepare("SELECT id FROM restaurant LIMIT 1").get();
  if (hasRestaurant) return;

  db.prepare(`
    INSERT INTO restaurant (
      id, slug, name, description, phone, whatsapp_phone, email, logo_url, hero_image_url,
      address_line, neighborhood, city, state, postal_code, latitude, longitude,
      delivery_fee, min_order_amount, free_delivery_min, pickup_eta_min, pickup_eta_max,
      delivery_eta_min, delivery_eta_max, accepts_orders, delivery_tracking_enabled,
      loyalty_enabled, loyalty_points_per_real, status
    ) VALUES (
      @id, @slug, @name, @description, @phone, @whatsapp_phone, @email, @logo_url, @hero_image_url,
      @address_line, @neighborhood, @city, @state, @postal_code, @latitude, @longitude,
      @delivery_fee, @min_order_amount, @free_delivery_min, @pickup_eta_min, @pickup_eta_max,
      @delivery_eta_min, @delivery_eta_max, @accepts_orders, @delivery_tracking_enabled,
      @loyalty_enabled, @loyalty_points_per_real, @status
    )
  `).run({
    id: DEFAULT_RESTAURANT_ID,
    slug: "smash-house",
    name: "Smash House",
    description: "Hamburgueria artesanal com combos, sobremesas e entrega rapida.",
    phone: "11940028922",
    whatsapp_phone: "11940028922",
    email: "contato@smashhouse.app",
    logo_url: "",
    hero_image_url: "",
    address_line: "Rua Augusta, 1200",
    neighborhood: "Consolacao",
    city: "Sao Paulo",
    state: "SP",
    postal_code: "01305000",
    latitude: -23.5572,
    longitude: -46.657,
    delivery_fee: 6.9,
    min_order_amount: 20,
    free_delivery_min: 50,
    pickup_eta_min: 15,
    pickup_eta_max: 25,
    delivery_eta_min: 30,
    delivery_eta_max: 45,
    accepts_orders: 1,
    delivery_tracking_enabled: 1,
    loyalty_enabled: 1,
    loyalty_points_per_real: 1,
    status: "active",
  });

  const insertHour = db.prepare("INSERT INTO restaurant_hours (id, weekday, opens_at, closes_at, is_closed) VALUES (@id, @weekday, @opens_at, @closes_at, @is_closed)");
  DEFAULT_HOURS.forEach((row) => insertHour.run(row));

  const insertBanner = db.prepare("INSERT INTO restaurant_banners (id, badge, title, subtitle, code, image_url, sort_order, is_active) VALUES (@id, @badge, @title, @subtitle, @code, @image_url, @sort_order, @is_active)");
  DEFAULT_BANNERS.forEach((row) => insertBanner.run(row));

  const insertCategory = db.prepare("INSERT INTO categories (id, slug, name, emoji, sort_order, is_active) VALUES (@id, @slug, @name, @emoji, @sort_order, 1)");
  DEFAULT_CATEGORIES.forEach((row) => insertCategory.run(row));

  const insertProduct = db.prepare("INSERT INTO products (id, category_id, slug, name, description, image_url, price, compare_at_price, is_featured, is_active, sort_order) VALUES (@id, @category_id, @slug, @name, @description, @image_url, @price, @compare_at_price, @is_featured, 1, @sort_order)");
  DEFAULT_PRODUCTS.forEach((row) => insertProduct.run(row));

  const insertGroup = db.prepare("INSERT INTO product_option_groups (id, product_id, name, min_select, max_select, is_required, sort_order) VALUES (@id, @product_id, @name, @min_select, @max_select, @is_required, @sort_order)");
  DEFAULT_OPTION_GROUPS.forEach((row) => insertGroup.run(row));

  const insertOption = db.prepare("INSERT INTO product_options (id, group_id, name, price, is_active, sort_order) VALUES (@id, @group_id, @name, @price, @is_active, @sort_order)");
  DEFAULT_OPTIONS.forEach((row) => insertOption.run(row));

  const insertZone = db.prepare("INSERT INTO delivery_zones (id, name, fee, min_eta_minutes, max_eta_minutes, min_order_amount, is_active, geojson) VALUES (@id, @name, @fee, @min_eta_minutes, @max_eta_minutes, @min_order_amount, @is_active, @geojson)");
  DEFAULT_DELIVERY_ZONES.forEach((row) => insertZone.run(row));

  const insertDiscount = db.prepare("INSERT INTO discounts (id, code, title, description, type, value, min_order_amount, max_discount_amount, usage_limit, per_user_limit, applies_to_delivery, applies_to_pickup, starts_at, ends_at, is_active) VALUES (@id, @code, @title, @description, @type, @value, @min_order_amount, @max_discount_amount, @usage_limit, @per_user_limit, @applies_to_delivery, @applies_to_pickup, @starts_at, @ends_at, @is_active)");
  DEFAULT_DISCOUNTS.forEach((row) => insertDiscount.run(row));
};

const mapBoolean = (value) => Boolean(value);

export const getCatalogSnapshot = (db) => {
  const restaurant = db.prepare("SELECT * FROM restaurant LIMIT 1").get();
  const hours = db.prepare("SELECT * FROM restaurant_hours ORDER BY weekday").all();
  const banners = db.prepare("SELECT * FROM restaurant_banners WHERE is_active = 1 ORDER BY sort_order").all();
  const categories = db.prepare("SELECT * FROM categories WHERE is_active = 1 ORDER BY sort_order").all();
  const products = db.prepare("SELECT * FROM products WHERE is_active = 1 ORDER BY sort_order").all();
  const groups = db.prepare("SELECT * FROM product_option_groups ORDER BY sort_order").all();
  const options = db.prepare("SELECT * FROM product_options WHERE is_active = 1 ORDER BY sort_order").all();
  const deliveryZones = db.prepare("SELECT * FROM delivery_zones WHERE is_active = 1 ORDER BY fee").all();
  const discounts = db.prepare("SELECT * FROM discounts WHERE is_active = 1 ORDER BY title").all();

  const groupsByProduct = new Map();
  const optionsByGroup = new Map();

  for (const option of options) {
    const current = optionsByGroup.get(option.group_id) || [];
    current.push({
      id: option.id,
      name: option.name,
      price: option.price,
    });
    optionsByGroup.set(option.group_id, current);
  }

  for (const group of groups) {
    const current = groupsByProduct.get(group.product_id) || [];
    current.push({
      id: group.id,
      name: group.name,
      minSelect: group.min_select,
      maxSelect: group.max_select,
      isRequired: mapBoolean(group.is_required),
      options: optionsByGroup.get(group.id) || [],
    });
    groupsByProduct.set(group.product_id, current);
  }

  const categoriesById = new Map(categories.map((category) => [category.id, category]));

  return {
    restaurant: {
      id: restaurant.id,
      slug: restaurant.slug,
      name: restaurant.name,
      description: restaurant.description,
      phone: restaurant.phone,
      whatsappPhone: restaurant.whatsapp_phone,
      email: restaurant.email,
      logoUrl: restaurant.logo_url,
      heroImageUrl: restaurant.hero_image_url,
      addressLine: restaurant.address_line,
      neighborhood: restaurant.neighborhood,
      city: restaurant.city,
      state: restaurant.state,
      postalCode: restaurant.postal_code,
      latitude: restaurant.latitude,
      longitude: restaurant.longitude,
      deliveryFee: restaurant.delivery_fee,
      minOrderAmount: restaurant.min_order_amount,
      freeDeliveryMin: restaurant.free_delivery_min,
      pickupEtaMin: restaurant.pickup_eta_min,
      pickupEtaMax: restaurant.pickup_eta_max,
      deliveryEtaMin: restaurant.delivery_eta_min,
      deliveryEtaMax: restaurant.delivery_eta_max,
      acceptsOrders: mapBoolean(restaurant.accepts_orders),
      deliveryTrackingEnabled: mapBoolean(restaurant.delivery_tracking_enabled),
      loyaltyEnabled: mapBoolean(restaurant.loyalty_enabled),
      loyaltyPointsPerReal: restaurant.loyalty_points_per_real,
      status: restaurant.status,
      hours: hours.map((hour) => ({
        id: hour.id,
        weekday: hour.weekday,
        opensAt: hour.opens_at,
        closesAt: hour.closes_at,
        isClosed: mapBoolean(hour.is_closed),
      })),
    },
    banners: banners.map((banner) => ({
      id: banner.id,
      badge: banner.badge,
      title: banner.title,
      subtitle: banner.subtitle,
      code: banner.code,
      imageUrl: banner.image_url,
      sortOrder: banner.sort_order,
    })),
    categories: categories.map((category) => ({
      id: category.id,
      slug: category.slug,
      name: category.name,
      emoji: category.emoji,
      sortOrder: category.sort_order,
    })),
    products: products.map((product) => ({
      id: product.id,
      slug: product.slug,
      name: product.name,
      description: product.description,
      price: product.price,
      compareAtPrice: product.compare_at_price,
      image: product.image_url,
      categoryId: product.category_id,
      category: categoriesById.get(product.category_id)?.slug || "all",
      featured: mapBoolean(product.is_featured),
      extras: (groupsByProduct.get(product.id) || []).flatMap((group) => group.options),
      optionGroups: groupsByProduct.get(product.id) || [],
    })),
    deliveryZones: deliveryZones.map((zone) => ({
      id: zone.id,
      name: zone.name,
      fee: zone.fee,
      minEtaMinutes: zone.min_eta_minutes,
      maxEtaMinutes: zone.max_eta_minutes,
      minOrderAmount: zone.min_order_amount,
      isActive: mapBoolean(zone.is_active),
      geojson: JSON.parse(zone.geojson || "{}"),
    })),
    discounts: discounts.map((discount) => ({
      id: discount.id,
      restaurantId: restaurant.id,
      code: discount.code,
      title: discount.title,
      description: discount.description,
      type: discount.type,
      value: discount.value,
      minOrderAmount: discount.min_order_amount,
      maxDiscountAmount: discount.max_discount_amount,
      usageLimit: discount.usage_limit,
      perUserLimit: discount.per_user_limit,
      appliesToDelivery: mapBoolean(discount.applies_to_delivery),
      appliesToPickup: mapBoolean(discount.applies_to_pickup),
      startsAt: discount.starts_at,
      endsAt: discount.ends_at,
      isActive: mapBoolean(discount.is_active),
    })),
  };
};

export const updateRestaurantRecord = (db, restaurant) => {
  db.prepare(`
    UPDATE restaurant SET
      name = @name,
      description = @description,
      phone = @phone,
      whatsapp_phone = @whatsappPhone,
      email = @email,
      logo_url = @logoUrl,
      hero_image_url = @heroImageUrl,
      address_line = @addressLine,
      neighborhood = @neighborhood,
      city = @city,
      state = @state,
      postal_code = @postalCode,
      latitude = @latitude,
      longitude = @longitude,
      delivery_fee = @deliveryFee,
      min_order_amount = @minOrderAmount,
      free_delivery_min = @freeDeliveryMin,
      pickup_eta_min = @pickupEtaMin,
      pickup_eta_max = @pickupEtaMax,
      delivery_eta_min = @deliveryEtaMin,
      delivery_eta_max = @deliveryEtaMax,
      accepts_orders = @acceptsOrders,
      delivery_tracking_enabled = @deliveryTrackingEnabled,
      loyalty_enabled = @loyaltyEnabled,
      loyalty_points_per_real = @loyaltyPointsPerReal,
      status = @status,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = @id
  `).run({
    ...restaurant,
    acceptsOrders: restaurant.acceptsOrders ? 1 : 0,
    deliveryTrackingEnabled: restaurant.deliveryTrackingEnabled ? 1 : 0,
    loyaltyEnabled: restaurant.loyaltyEnabled ? 1 : 0,
  });
};

export const replaceRestaurantHours = (db, hours) => {
  const upsert = db.prepare(`
    INSERT INTO restaurant_hours (id, weekday, opens_at, closes_at, is_closed)
    VALUES (@id, @weekday, @opensAt, @closesAt, @isClosed)
    ON CONFLICT(weekday) DO UPDATE SET
      opens_at = excluded.opens_at,
      closes_at = excluded.closes_at,
      is_closed = excluded.is_closed
  `);
  const transaction = db.transaction((rows) => {
    rows.forEach((hour) => {
      upsert.run({
        id: hour.id || crypto.randomUUID(),
        weekday: hour.weekday,
        opensAt: hour.opensAt,
        closesAt: hour.closesAt,
        isClosed: hour.isClosed ? 1 : 0,
      });
    });
  });
  transaction(hours);
};

export const saveCategoryRecord = (db, category) => {
  db.prepare(`
    INSERT INTO categories (id, slug, name, emoji, sort_order, is_active)
    VALUES (@id, @slug, @name, @emoji, @sortOrder, 1)
    ON CONFLICT(id) DO UPDATE SET
      slug = excluded.slug,
      name = excluded.name,
      emoji = excluded.emoji,
      sort_order = excluded.sort_order
  `).run({
    id: category.id,
    slug: category.slug,
    name: category.name,
    emoji: category.emoji || "📋",
    sortOrder: category.sortOrder ?? 0,
  });
};

export const saveProductRecord = (db, product) => {
  db.prepare(`
    INSERT INTO products (id, category_id, slug, name, description, image_url, price, compare_at_price, is_featured, is_active, sort_order)
    VALUES (@id, @categoryId, @slug, @name, @description, @image, @price, @compareAtPrice, @featured, 1, @sortOrder)
    ON CONFLICT(id) DO UPDATE SET
      category_id = excluded.category_id,
      slug = excluded.slug,
      name = excluded.name,
      description = excluded.description,
      image_url = excluded.image_url,
      price = excluded.price,
      compare_at_price = excluded.compare_at_price,
      is_featured = excluded.is_featured,
      sort_order = excluded.sort_order
  `).run({
    id: product.id,
    categoryId: product.categoryId,
    slug: product.slug,
    name: product.name,
    description: product.description || "",
    image: product.image || "",
    price: product.price,
    compareAtPrice: product.compareAtPrice ?? null,
    featured: product.featured ? 1 : 0,
    sortOrder: product.sortOrder ?? 0,
  });
};

export const saveDiscountRecord = (db, discount) => {
  db.prepare(`
    INSERT INTO discounts (id, code, title, description, type, value, min_order_amount, max_discount_amount, usage_limit, per_user_limit, applies_to_delivery, applies_to_pickup, starts_at, ends_at, is_active)
    VALUES (@id, @code, @title, @description, @type, @value, @minOrderAmount, @maxDiscountAmount, @usageLimit, @perUserLimit, @appliesToDelivery, @appliesToPickup, @startsAt, @endsAt, @isActive)
    ON CONFLICT(id) DO UPDATE SET
      code = excluded.code,
      title = excluded.title,
      description = excluded.description,
      type = excluded.type,
      value = excluded.value,
      min_order_amount = excluded.min_order_amount,
      max_discount_amount = excluded.max_discount_amount,
      usage_limit = excluded.usage_limit,
      per_user_limit = excluded.per_user_limit,
      applies_to_delivery = excluded.applies_to_delivery,
      applies_to_pickup = excluded.applies_to_pickup,
      starts_at = excluded.starts_at,
      ends_at = excluded.ends_at,
      is_active = excluded.is_active
  `).run({
    id: discount.id,
    code: discount.code.toUpperCase(),
    title: discount.title,
    description: discount.description || "",
    type: discount.type,
    value: discount.value,
    minOrderAmount: discount.minOrderAmount ?? 0,
    maxDiscountAmount: discount.maxDiscountAmount ?? null,
    usageLimit: discount.usageLimit ?? null,
    perUserLimit: discount.perUserLimit ?? null,
    appliesToDelivery: discount.appliesToDelivery ? 1 : 0,
    appliesToPickup: discount.appliesToPickup ? 1 : 0,
    startsAt: discount.startsAt ?? null,
    endsAt: discount.endsAt ?? null,
    isActive: discount.isActive ? 1 : 0,
  });
};

export const saveDeliveryZoneRecord = (db, zone) => {
  db.prepare(`
    INSERT INTO delivery_zones (id, name, fee, min_eta_minutes, max_eta_minutes, min_order_amount, is_active, geojson)
    VALUES (@id, @name, @fee, @minEtaMinutes, @maxEtaMinutes, @minOrderAmount, @isActive, @geojson)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      fee = excluded.fee,
      min_eta_minutes = excluded.min_eta_minutes,
      max_eta_minutes = excluded.max_eta_minutes,
      min_order_amount = excluded.min_order_amount,
      is_active = excluded.is_active,
      geojson = excluded.geojson
  `).run({
    id: zone.id,
    name: zone.name,
    fee: zone.fee,
    minEtaMinutes: zone.minEtaMinutes ?? 30,
    maxEtaMinutes: zone.maxEtaMinutes ?? 45,
    minOrderAmount: zone.minOrderAmount ?? 0,
    isActive: zone.isActive ? 1 : 0,
    geojson: JSON.stringify(zone.geojson || {}),
  });
};
