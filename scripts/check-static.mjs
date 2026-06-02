import fs from "node:fs";

const sample = JSON.parse(fs.readFileSync("data/menu-sample.json", "utf8").replace(/^\uFEFF/, ""));
const categories = Array.isArray(sample.categories) ? sample.categories : sample.categories.value;
const count = categories.reduce((sum, category) => sum + category.items.length, 0);
if (categories.length !== 14) throw new Error(`Expected 14 categories, got ${categories.length}`);
if (count !== 100) throw new Error(`Expected 100 products, got ${count}`);

const schema = fs.readFileSync("supabase/schema.sql", "utf8");
for (const table of ["products", "orders", "order_items", "settings"]) {
  if (!schema.includes(`public.${table}`)) throw new Error(`Missing table ${table}`);
}

const publicHtml = fs.readFileSync("index.html", "utf8");
if (!publicHtml.includes('type="module" src="assets/js/app.js"')) throw new Error("Public app module missing");
if (/const products|menuCategories/.test(publicHtml)) throw new Error("Inline product data still present in HTML");

console.log("Static checks passed");
