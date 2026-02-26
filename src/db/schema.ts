import {
    pgTable,
    integer,
    serial,
    text,
    bigint,
    jsonb,
    boolean,
    pgEnum,
    index,
    unique,
} from 'drizzle-orm/pg-core';

import { is, sql } from 'drizzle-orm';

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
export const accountRoleEnum = pgEnum('account_role', ['admin', 'manager', 'normal', 'guest', 'just_view']); // just_view 只能get, 不能 post、put、delete

// 使用者
export const account = pgTable('account', {
    account_id: serial('account_id').primaryKey(),
    status: statusEnum('status').notNull().default('active'),
    account_role: accountRoleEnum('account_role').notNull().default('normal'), // 權限，預設為 normal

    account: text('account').unique().notNull(),
    password: text('password').notNull(),
    email: text('email').notNull().unique(),
    company_name: text('company'),
    company_industry: text('company_industry'),
    people_name: text('name').notNull(),
    phone: text('phone'),

    point: integer('point').notNull().default(0), // 點數，預設為 0

    comment_for_dev: text('comment_for_dev'), // 給開發者看的備註欄位，使用者不會看到

    created_at: bigint('created_at', { mode: 'number' }).default(sql`EXTRACT(EPOCH FROM NOW())::bigint`),
    updated_at: bigint('updated_at', { mode: 'number' }),
    data: jsonb('data'),
}, (table) => ([
    index().on(table.account),
    // index("account_account_gin").using('gin', sql`to_tsvector('english', ${table.account})`)
]))

// 點數紀錄
export const point_log = pgTable('point_log', {
    id: serial('id').primaryKey(),
    account_id: integer('account_id').notNull().references(() => account.account_id, { onDelete: 'cascade' }),
    change: integer('change').notNull(), // 點數變動，正數表示增加，負數表示減少
    reason: text('reason').notNull(), // 點數變動原因，例如 "compute_cost", "manual_adjustment", "refund" 等

    data: jsonb('data'), // 其他相關資料，例如 compute_id、order_id 等

    created_at: bigint('created_at', { mode: 'number' }).default(sql`EXTRACT(EPOCH FROM NOW())::bigint`),
}, (table) => ([
    index().on(table.account_id),
]))

// api 版本的 token
export const token = pgTable('token', {
    id: serial('id').primaryKey(),
    account_id: integer('account_id').notNull().references(() => account.account_id, { onDelete: 'cascade' }),
    status: statusEnum('status').notNull().default('active'),

    token: text('text').notNull().unique(),

    created_at: bigint('created_at', { mode: 'number' }).default(sql`EXTRACT(EPOCH FROM NOW())::bigint`),
    updated_at: bigint('updated_at', { mode: 'number' }),
    data: jsonb('data'),    // comment 放這
})

// 地點
export const destination = pgTable('destination', {
    account_id: integer('account_id').notNull().references(() => account.account_id, { onDelete: 'cascade' }),
    id: serial('id').primaryKey(),
    status: statusEnum('status').notNull().default('active'), // inactive, active, deleted

    name: text('name').notNull(), // 地點名稱
    address: text('address').notNull(),         // 詳細地址
    lat: text('lat').notNull(), // 經度
    lng: text('lng').notNull(), // 緯度

    data: jsonb('data'),
    /*
    is_depot: 是否為倉庫(出發點)
    time_window: json 形式, 以分鐘紀錄, [{start: 480, end: 720}, {start: 780, end: 1020}] 表示 08:00-12:00, 13:00-17:00
    operation_time: 預計停留時間(作業時間、卸貨時間等), 以分鐘為單位
    demand: 需求量
    priority: 優先順序, 數字越大優先順序越高
    樓層
    有沒有電梯
    有沒有管理室
    comment: 備註
    */
    created_at: bigint('created_at', { mode: 'number' }).default(sql`EXTRACT(EPOCH FROM NOW())::bigint`),
    updated_at: bigint('updated_at', { mode: 'number' }),
    comment_for_account: text('comment_for_account'), // 給使用者看的備註欄位，使用者會看到

}, (table) => ([
    index().on(table.account_id),
    index().on(table.name),
    index().on(table.address),
]))

// 使用者自訂的車輛類型
export const custom_vehicle_type = pgTable('custom_vehicle_type', {
    account_id: integer('account_id').notNull().references(() => account.account_id, { onDelete: 'cascade' }),
    id: serial('id').primaryKey(),
    status: statusEnum('status').notNull().default('active'), // inactive, active, deleted

    name: text('name').notNull(), // 車輛類型名稱
    capacity: integer('capacity').notNull().default(0), // 車輛容量（可以是重量、體積或載客數，根據需求定義）

    data: jsonb('data'), // 其他自訂資料
    /*

    */
    created_at: bigint('created_at', { mode: 'number' }).default(sql`EXTRACT(EPOCH FROM NOW())::bigint`),
    updated_at: bigint('updated_at', { mode: 'number' }),

    comment_for_account: text('comment_for_account'), // 給使用者看的備註欄位，使用者會看到
})

// 車輛
export const vehicle = pgTable('vehicle', {
    account_id: integer('account_id').notNull().references(() => account.account_id, { onDelete: 'cascade' }),
    id: serial('id').primaryKey(),
    status: statusEnum('status').notNull().default('active'), // inactive, active, deleted

    vehicle_number: text('vehicle_number').notNull(), // 車牌號碼或車輛代號
    vehicle_type: integer('vehicle_type').notNull().references(() => custom_vehicle_type.id), // 車輛類型（如貨車、轎車、機車等），可以參考 custom_vehicle_type 定義的類型
    depot_id: integer('depot_id').references(() => destination.id), //預設出發位置（通常是倉庫），參考 destination 表的 id


    data: jsonb('data'),
    /*
    comment: 備註
    max_distance: 車輛最大行駛距離（公尺），0 表示無限制
    max_working_time: 車輛最長工時（分鐘），0 表示無限制
    */

    created_at: bigint('created_at', { mode: 'number' }).default(sql`EXTRACT(EPOCH FROM NOW())::bigint`),
    updated_at: bigint('updated_at', { mode: 'number' }),

    comment_for_account: text('comment_for_account'), // 給使用者看的備註欄位，使用者會看到
}, (table) => ([
    index().on(table.account_id),
]));

// 一筆訂單(一筆訂單可以多次計算)
export const order = pgTable('order', {
    account_id: integer('account_id').notNull().references(() => account.account_id, { onDelete: 'cascade' }),
    id: serial('id').primaryKey(),
    status: statusEnum('status').notNull().default('active'), // inactive, active, deleted

    algorithm: text('algorithm').notNull().default('未設定'),

    data: jsonb('data'),
    /*
        order_number: 訂單編號，使用者自訂，或者系統自動生成的唯一識別碼
        scheduled_time: 預計配送時間，可以用來優先處理緊急訂單或者安排配送順序
    */

    created_at: bigint('created_at', { mode: 'number' }).default(sql`EXTRACT(EPOCH FROM NOW())::bigint`),
    updated_at: bigint('updated_at', { mode: 'number' }),
    destination_snapshot: jsonb('destination_snapshot').notNull(),  // 建立訂單時地點的快照
    vehicle_snapshot: jsonb('vehicle_snapshot').notNull(),          // 建立訂單時車輛的快照

    comment_for_account: text('comment_for_account'), // 給使用者看的備註欄位，使用者會看到

}, (table) => ([
    index().on(table.account_id),
]));

// 一次計算任務
export const compute = pgTable('compute', {
    account_id: integer('account_id').notNull().references(() => account.account_id, { onDelete: 'cascade' }),
    id: serial('id').primaryKey(),
    order_id: integer('order_id').notNull().references(() => order.id), // 對應的訂單
    status: statusEnum('status').notNull().default('active'), // inactive, active, deleted

    compute_status: computeStatus('compute_status').notNull().default('initial'),
    start_time: bigint('start_time', { mode: 'number' }),
    end_time: bigint('end_time', { mode: 'number' }),
    fail_reason: text('fail_reason'),

    data: jsonb('data'),
    /*
    compute_policy 計算策略描述 ex:
    {
    time_limit_seconds: 30,
    fixed_vehicle_cost: 1000,
    first_solution_strategy: "PATH_CHEAPEST_ARC"
    }

    result  改存到 route 跟 route_stop 表
    matrix  從 info_between_two_point 動態使用
    */

    created_at: bigint('created_at', { mode: 'number' }).default(sql`EXTRACT(EPOCH FROM NOW())::bigint`),
    updated_at: bigint('updated_at', { mode: 'number' }),

    comment_for_account: text('comment_for_account'), // 給使用者看的備註欄位，使用者會看到

}, (table) => ([
    index().on(table.account_id),
    index().on(table.order_id),
]));

// 計算完成後，一條路線（對應一輛車）
export const route = pgTable('route', {
    id: serial('id').primaryKey(),
    compute_id: integer('compute_id').notNull().references(() => compute.id, { onDelete: 'cascade' }),
    vehicle_id: integer('vehicle_id').notNull().references(() => vehicle.id),
    status: statusEnum('status').notNull().default('active'),

    total_distance: integer('total_distance').notNull(), // 公尺
    total_time: integer('total_time').notNull(),         // 分鐘
    total_load: integer('total_load').notNull().default(0),

    created_at: bigint('created_at', { mode: 'number' }).default(sql`EXTRACT(EPOCH FROM NOW())::bigint`),
}, (table) => ([
    index().on(table.compute_id),
    index().on(table.vehicle_id),
]))

// 計算完成後，路線中的每一站
export const route_stop = pgTable('route_stop', {
    id: serial('id').primaryKey(),
    route_id: integer('route_id').notNull().references(() => route.id, { onDelete: 'cascade' }),
    destination_id: integer('destination_id').notNull().references(() => destination.id),

    sequence: integer('sequence').notNull(),        // 第幾站，0 = depot 出發
    arrival_time: integer('arrival_time').notNull().default(0), // 抵達時間（分鐘，距當天 00:00）, 0 分鐘表示出發點
    demand: integer('demand').notNull().default(0),

    created_at: bigint('created_at', { mode: 'number' }).default(sql`EXTRACT(EPOCH FROM NOW())::bigint`),
}, (table) => ([
    index().on(table.route_id),
    unique().on(table.route_id, table.sequence), // 同一路線內 sequence 不重複
]))

export const info_between_two_point = pgTable('point_distance', {
    id: serial('id').primaryKey(),

    a_point: integer('a_point').references(() => destination.id).notNull(), // 參考 destination 表的 id
    b_point: integer('b_point').references(() => destination.id).notNull(),

    distance_from_a_to_b: text('distance_from_a_b').notNull(),   // 公尺
    time_from_a_to_b: text('time_from_a_b').notNull(),           // 分鐘

    distance_from_a_to_b_dynamic: text('distance_from_a_b_dynamic'),   // 公尺
    time_from_a_to_b_dynamic: text('time_from_a_b_dynamic'),           // 分鐘

    polyline_from_map_service: text('polyline_from_map_service'), // 從地圖服務取得的路線 polyline 編碼
    polyline_real: text('polyline_real'), // 真實路線的 polyline 編碼，可能會因為交通狀況等因素與預估路線不同

    data: jsonb('data'),

});

