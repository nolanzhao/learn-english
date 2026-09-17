import { sqliteTable, text, integer, primaryKey, index } from "drizzle-orm/sqlite-core";
import { user } from "./auth-schema";

/* 练习记录: 一行一个条目 (用户 × 词库 × 下标). 事件流按条目 upsert. */
export const progress = sqliteTable("progress", {
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  deck: text("deck").notNull(),
  idx: integer("idx").notNull(),
  c: integer("c").notNull().default(0),        // 答对次数
  w: integer("w").notNull().default(0),        // 答错次数
  streak: integer("streak").notNull().default(0),
  last: integer("last").notNull().default(0),  // 最后一次作答时间(ms)
}, (t) => [primaryKey({ columns: [t.userId, t.deck, t.idx] }), index("progress_user_deck").on(t.userId, t.deck)]);

export const favorite = sqliteTable("favorite", {
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  deck: text("deck").notNull(),
  idx: integer("idx").notNull(),
  createdAt: integer("created_at").notNull(),
}, (t) => [primaryKey({ columns: [t.userId, t.deck, t.idx] })]);

export const daily = sqliteTable("daily", {
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  day: text("day").notNull(),                  // YYYY-MM-DD (客户端本地日期)
  n: integer("n").notNull().default(0),
  c: integer("c").notNull().default(0),
}, (t) => [primaryKey({ columns: [t.userId, t.day] })]);

/* 界面偏好 + 本轮位置, 体积小, 整包存 */
export const userPref = sqliteTable("user_pref", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  ui: text("ui").notNull().default("{}"),
  updatedAt: integer("updated_at").notNull(),
});
