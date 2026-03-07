import {
    pgTable,
    integer,
    serial,
    text,
    bigint,
    jsonb,
    pgEnum,
    index,
    unique,
    uuid,
} from 'drizzle-orm/pg-core';

import { sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';

export const statusEnum = pgEnum('status', ['inactive', 'active', 'deleted']);
export const computeStatus = pgEnum('compute_status',
    [
        'initial',        // 初始
        'pending',        // 等待中（在 MQ 中排隊）
        'computing',      // 計算中
        'completed',      // 完成
        'failed',         // 失敗（計算失敗、timeout、外部服務）
        'cancelled'       // 取消
    ]);
export const accountRoleEnum = pgEnum('account_role', ['admin', 'manager', 'normal', 'guest', 'just_view']);

// ── 使用者 ────────────────────────────────────────────────────────────────────

export const account = pgTable('account', {
    account_id: uuid('account_id').primaryKey().$defaultFn(uuidv7),
    status: statusEnum('status').notNull().default('active'),
    account_role: accountRoleEnum('account_role').notNull().default('normal'),

    account: text('account').unique().notNull(),
    password: text('password').notNull(),
    email: text('email').notNull().unique(),
    company_name: text('company'),
    company_industry: text('company_industry'),
    people_name: text('name').notNull(),
    phone: text('phone'),

    point: integer('point').notNull().default(0),

    comment_for_dev: text('comment_for_dev'),

    created_at: bigint('created_at', { mode: 'number' }).default(sql`EXTRACT(EPOCH FROM NOW())::bigint`),
    updated_at: bigint('updated_at', { mode: 'number' }),
    data: jsonb('data'),
    /*
    data 可能含有：
    - preferences: object（使用者偏好設定）
    */
}, (table) => ([
    index().on(table.account),
]))

// ── 點數紀錄（內部稽核，serial PK）───────────────────────────────────────────

export const point_log = pgTable('point_log', {
    id: serial('id').primaryKey(),
    account_id: uuid('account_id').notNull().references(() => account.account_id, { onDelete: 'cascade' }),
    change: integer('change').notNull(),
    reason: text('reason').notNull(), // e.g. "compute_cost", "manual_adjustment", "refund"

    data: jsonb('data'),
    /*
    data 可能含有：
    - compute_id: string（UUID）
    - order_id: string（UUID）
    - note: string
    */

    created_at: bigint('created_at', { mode: 'number' }).default(sql`EXTRACT(EPOCH FROM NOW())::bigint`),
}, (table) => ([
    index().on(table.account_id),
]))

// ── API Token ─────────────────────────────────────────────────────────────────

export const token = pgTable('token', {
    id: uuid('id').primaryKey().$defaultFn(uuidv7),
    account_id: uuid('account_id').notNull().references(() => account.account_id, { onDelete: 'cascade' }),
    status: statusEnum('status').notNull().default('active'),

    token: text('text').notNull().unique(), // 格式：sk-{32 hex}

    created_at: bigint('created_at', { mode: 'number' }).default(sql`EXTRACT(EPOCH FROM NOW())::bigint`),
    dead_at: bigint('dead_at', { mode: 'number' }),
    updated_at: bigint('updated_at', { mode: 'number' }),
    data: jsonb('data'),
    /*
    data 可能含有：
    - comment: string（備註說明此 token 用途）
    - created_by: string（account_id，若由管理者代建）
    */
})

// ── Token 操作紀錄（內部稽核，serial PK）──────────────────────────────────────

export const token_action_log = pgTable('token_action_log', {
    id: serial('id').primaryKey(),
    token_id: uuid('token_id').notNull().references(() => token.id, { onDelete: 'cascade' }),

    date: bigint('date', { mode: 'number' }).default(sql`EXTRACT(EPOCH FROM NOW())::bigint`),
    data: jsonb('data'),
    /*
    data 可能含有：
    - action: "created" | "revoked" | "deleted"
    - by_account_id: string（UUID，管理者代操作時）
    */
})

// ── 地點 ──────────────────────────────────────────────────────────────────────

export const destination = pgTable('destination', {
    account_id: uuid('account_id').notNull().references(() => account.account_id, { onDelete: 'cascade' }),
    id: uuid('id').primaryKey().$defaultFn(uuidv7),
    status: statusEnum('status').notNull().default('active'),

    name: text('name').notNull(),
    address: text('address').notNull(),
    lat: text('lat').notNull(),
    lng: text('lng').notNull(),

    data: jsonb('data'),
    /*
    data 可能含有：
    - is_depot: boolean（是否為車庫/出發點）
    - time_window_start: number（最早可到達，分鐘，從午夜起算；預設 0）
    - time_window_end: number（服務截止，分鐘；預設 1440）
    - late_penalty: number | null（null = 硬時間窗，整數 = 軟時間窗每分鐘懲罰，公尺等效）
    - service_time: number（停留服務分鐘數；預設 0）
    - location_type: "depot" | "restaurant" | "building"（地點類型，供 UI 顯示）
    */

    created_at: bigint('created_at', { mode: 'number' }).default(sql`EXTRACT(EPOCH FROM NOW())::bigint`),
    updated_at: bigint('updated_at', { mode: 'number' }),
    comment_for_account: text('comment_for_account'),

}, (table) => ([
    index().on(table.account_id),
    index().on(table.name),
    index().on(table.address),
]))

// ── 使用者自訂的車輛類型 ───────────────────────────────────────────────────────

export const custom_vehicle_type = pgTable('custom_vehicle_type', {
    account_id: uuid('account_id').notNull().references(() => account.account_id, { onDelete: 'cascade' }),
    id: uuid('id').primaryKey().$defaultFn(uuidv7),
    status: statusEnum('status').notNull().default('active'),

    name: text('name').notNull(),
    capacity: integer('capacity').notNull().default(0), // 車輛容量（盒數，與 BentoV1 items quantity 同單位）

    data: jsonb('data'),
    /*
    data 可能含有：
    - note: string（備註）
    */

    created_at: bigint('created_at', { mode: 'number' }).default(sql`EXTRACT(EPOCH FROM NOW())::bigint`),
    updated_at: bigint('updated_at', { mode: 'number' }),
    comment_for_account: text('comment_for_account'),
})

// ── 車輛 ──────────────────────────────────────────────────────────────────────

export const vehicle = pgTable('vehicle', {
    account_id: uuid('account_id').notNull().references(() => account.account_id, { onDelete: 'cascade' }),
    id: uuid('id').primaryKey().$defaultFn(uuidv7),
    status: statusEnum('status').notNull().default('active'),

    vehicle_number: text('vehicle_number').notNull(),
    vehicle_type: uuid('vehicle_type').notNull().references(() => custom_vehicle_type.id),
    depot_id: uuid('depot_id').references(() => destination.id),

    data: jsonb('data'),
    /*
    data 可能含有：
    - fixed_cost: number（每次派出此車的固定成本，公尺等效；傳給 BentoV1 solver）
    - max_distance: number（最大行駛距離，公尺；0 = 無限制）
    - max_duration_minutes: number（最長工時，分鐘；0 = 無限制）
    - comment: string
    */

    created_at: bigint('created_at', { mode: 'number' }).default(sql`EXTRACT(EPOCH FROM NOW())::bigint`),
    updated_at: bigint('updated_at', { mode: 'number' }),
    comment_for_account: text('comment_for_account'),
}, (table) => ([
    index().on(table.account_id),
]));

// ── 便當訂單（業務訂單，取送配對）────────────────────────────────────────────

export const bento_order = pgTable('bento_order', {
    id: uuid('id').primaryKey().$defaultFn(uuidv7),
    account_id: uuid('account_id').notNull().references(() => account.account_id, { onDelete: 'cascade' }),
    status: statusEnum('status').notNull().default('active'),

    pickup_location_id: uuid('pickup_location_id').notNull().references(() => destination.id),
    delivery_location_id: uuid('delivery_location_id').notNull().references(() => destination.id),

    unserved_penalty: integer('unserved_penalty'), // null = 必送；整數 = 可選（solver 跳過此單的懲罰，公尺等效，實際成本 × 2）

    comment_for_account: text('comment_for_account'),
    data: jsonb('data'),
    /*
    data 可能含有：
    - note: string
    - scheduled_time: number（Unix epoch，預計配送時間）
    */

    created_at: bigint('created_at', { mode: 'number' }).default(sql`EXTRACT(EPOCH FROM NOW())::bigint`),
    updated_at: bigint('updated_at', { mode: 'number' }),
}, (table) => ([
    index().on(table.account_id),
]))

// ── 便當訂單品項（serial PK，不對外暴露）──────────────────────────────────────

export const bento_order_item = pgTable('bento_order_item', {
    id: serial('id').primaryKey(),
    bento_order_id: uuid('bento_order_id').notNull().references(() => bento_order.id, { onDelete: 'cascade' }),
    sku: text('sku').notNull(),      // 商品種類，如 "排骨便當"、"湯品"
    quantity: integer('quantity').notNull().default(1),
}, (table) => ([
    index().on(table.bento_order_id),
]))

// ── VRP 計算任務組（對應「使用者選一批訂單送出計算」）───────────────────────────

export const order = pgTable('order', {
    account_id: uuid('account_id').notNull().references(() => account.account_id, { onDelete: 'cascade' }),
    id: uuid('id').primaryKey().$defaultFn(uuidv7),
    status: statusEnum('status').notNull().default('active'),

    data: jsonb('data'),
    /*
    data 可能含有：
    - note: string
    - scheduled_time: number（Unix epoch）
    */

    created_at: bigint('created_at', { mode: 'number' }).default(sql`EXTRACT(EPOCH FROM NOW())::bigint`),
    updated_at: bigint('updated_at', { mode: 'number' }),

    // BentoV1 格式的快照，建立時固定，計算時直接使用
    location_snapshot: jsonb('location_snapshot').notNull(),
    /*
    location_snapshot 格式（LocationSnapshotEntry[]）：
    [
      {
        idx: 0,                          // 0-based index，用作矩陣索引與 BentoV1 location_id
        db_id: "uuid-...",               // destination.id，webhook 回寫路線時反向對應
        name: "車庫",
        lat: 25.04,
        lng: 121.51,
        time_window_start: 0,            // 分鐘，從午夜起算
        time_window_end: 1440,
        service_time: 0,
        late_penalty: null               // null = 硬時間窗，number = 軟時間窗懲罰（公尺等效）
      }
    ]
    */

    bento_order_snapshot: jsonb('bento_order_snapshot').notNull(),
    /*
    bento_order_snapshot 格式（BentoOrderSnapshotEntry[]）：
    [
      {
        order_id: "uuid-...",            // bento_order.id，直接作為 BentoV1 order_id
        pickup_location_id: 1,           // 對應 location_snapshot 的 idx
        delivery_location_id: 2,
        items: [{ sku: "排骨便當", quantity: 3 }],
        unserved_penalty: null
      }
    ]
    */

    vehicle_snapshot: jsonb('vehicle_snapshot').notNull(),
    /*
    vehicle_snapshot 格式（VehicleSnapshotEntry[]）：
    [
      {
        idx: 0,                          // 0-based index，用作 BentoV1 vehicle_id（整數）
        db_id: "uuid-...",               // vehicle.id，webhook 回寫路線時反向對應
        capacity: 30,
        fixed_cost: 0                    // 公尺等效
      }
    ]
    */

    comment_for_account: text('comment_for_account'),

}, (table) => ([
    index().on(table.account_id),
]));

// ── 一次點擊觸發計算（compute_one_click）──────────────────────────────────────

export const compute_one_click = pgTable('compute_one_click', {
    id: uuid('id').primaryKey().$defaultFn(uuidv7),
    account_id: uuid('account_id').notNull().references(() => account.account_id, { onDelete: 'cascade' }),
    order_id: uuid('order_id').notNull().references(() => order.id),
    status: statusEnum('status').notNull().default('active'),

    start_time: bigint('start_time', { mode: 'number' }),

    data: jsonb('data'),
    /*
    data 可能含有：
    - note: string
    */

    comment_for_account: text('comment_for_account'),
    created_at: bigint('created_at', { mode: 'number' }).default(sql`EXTRACT(EPOCH FROM NOW())::bigint`),
    updated_at: bigint('updated_at', { mode: 'number' }),

}, (table) => ([
    index().on(table.account_id),
    index().on(table.order_id),
]));

// ── 單次實際運算（compute）────────────────────────────────────────────────────

export const compute = pgTable('compute', {
    id: uuid('id').primaryKey().$defaultFn(uuidv7),
    compute_one_click_id: uuid('compute_one_click_id').notNull().references(() => compute_one_click.id, { onDelete: 'cascade' }),
    status: statusEnum('status').notNull().default('active'),

    compute_status: computeStatus('compute_status').notNull().default('initial'),
    start_time: bigint('start_time', { mode: 'number' }),
    end_time: bigint('end_time', { mode: 'number' }),
    fail_reason: text('fail_reason'),

    algo_parameter: jsonb('algo_parameter'),
    /*
    algo_parameter 格式：
    {
      endpoint: "/vrp/bento/v1/solve",
      time_limit_seconds: 30            // 選填
    }
    */

    data: jsonb('data'),
    /*
    data 可能含有：
    - unserved_orders: string[]（BentoV1 回傳中被跳過的 bento_order.id 列表）
    */

    comment_for_account: text('comment_for_account'),
    comment_for_dev: text('comment_for_dev'),

    created_at: bigint('created_at', { mode: 'number' }).default(sql`EXTRACT(EPOCH FROM NOW())::bigint`),
    updated_at: bigint('updated_at', { mode: 'number' }),
}, (table) => ([
    index().on(table.compute_one_click_id),
]));

// ── 計算結果：路線（一輛車一條路線）──────────────────────────────────────────

export const route = pgTable('route', {
    id: uuid('id').primaryKey().$defaultFn(uuidv7),
    compute_id: uuid('compute_id').notNull().references(() => compute.id, { onDelete: 'cascade' }),
    vehicle_id: uuid('vehicle_id').notNull().references(() => vehicle.id),
    status: statusEnum('status').notNull().default('active'),

    total_distance: integer('total_distance').notNull(), // 公尺
    total_time: integer('total_time').notNull(),         // 分鐘
    total_load: integer('total_load').notNull().default(0),

    created_at: bigint('created_at', { mode: 'number' }).default(sql`EXTRACT(EPOCH FROM NOW())::bigint`),
}, (table) => ([
    index().on(table.compute_id),
    index().on(table.vehicle_id),
]))

// ── 計算結果：路線中的每一站（serial PK）──────────────────────────────────────

export const route_stop = pgTable('route_stop', {
    id: serial('id').primaryKey(),
    route_id: uuid('route_id').notNull().references(() => route.id, { onDelete: 'cascade' }),
    destination_id: uuid('destination_id').notNull().references(() => destination.id),

    sequence: integer('sequence').notNull(),
    arrival_time: integer('arrival_time').notNull().default(0), // 分鐘，從午夜起算

    action: text('action').notNull().default('delivery'),
    // 'start' | 'pickup' | 'delivery' | 'pickup+delivery' | 'end'
    // BentoV1 StopBentoV1.action 原樣存入

    bento_order_ids: jsonb('bento_order_ids'),
    // string[]，此停靠點涉及的 bento_order.id（UUID）列表
    // 對應 BentoV1 StopBentoV1.orders

    created_at: bigint('created_at', { mode: 'number' }).default(sql`EXTRACT(EPOCH FROM NOW())::bigint`),
}, (table) => ([
    index().on(table.route_id),
    unique().on(table.route_id, table.sequence),
]))

// ── 兩點距離快取（serial PK，純內部）─────────────────────────────────────────

export const info_between_two_point = pgTable('point_distance', {
    id: serial('id').primaryKey(),

    a_point: uuid('a_point').references(() => destination.id).notNull(),
    b_point: uuid('b_point').references(() => destination.id).notNull(),

    distance_from_a_to_b: text('distance_from_a_b').notNull(),   // 公尺
    time_from_a_to_b: text('time_from_a_b').notNull(),           // 分鐘

    distance_from_a_to_b_dynamic: text('distance_from_a_b_dynamic'),
    time_from_a_to_b_dynamic: text('time_from_a_b_dynamic'),

    polyline_from_map_service: text('polyline_from_map_service'),
    polyline_real: text('polyline_real'),

    data: jsonb('data'),
});
