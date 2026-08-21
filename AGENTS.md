<claude-mem-context>
# Memory Context

# [foody] recent context, 2026-08-21 11:33am GMT-3

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (19,993t read) | 829,452t work | 98% savings

### Aug 1, 2026
S297 Novo produto Wizard button in /catalog — guided multi-step product creation modal with sizes, flavors, fractions, and pricing matrix (Aug 1 at 1:25 PM)
S295 Fix Supabase image uploads in the foody/chefito project — credentials were empty, then the configured project was found to be unreachable (DNS ENOTFOUND). User now wants to switch to a different Supabase project. (Aug 1 at 1:25 PM)
S296 Fix Supabase image uploads in foody/chefito — root cause found (Supabase project DNS unreachable), user wants to switch to a different/working Supabase project (Aug 1 at 1:25 PM)
### Aug 3, 2026
S343 Fix TypeError on product registration in Foody project — "Cannot read properties of null (reading 'promotionalPrice')" at routes/product.js:248 (Aug 3 at 10:54 PM)
### Aug 8, 2026
S344 Build a professional POS (PDV profissional) page for Foody — cashier-focused quick-sale interface showing only skipKds=true products, styled after the existing reports route layout (Aug 8 at 11:52 PM)
### Aug 9, 2026
S345 Add barcode field to products in the foody restaurant management system (Aug 9 at 12:09 AM)
### Aug 16, 2026
2302 7:32a 🟣 Global Dark Theme Applied to All Foody/Chefito Views
2305 " 🔵 `:root` CSS custom property token rule incorrectly scoped as descendant selector
2306 12:57p 🔵 Confirmed: `[data-theme="dark"] :root` descendant bug present in index.html
2307 12:58p 🔴 Fixed invalid `:root` descendant selector — dark mode CSS tokens now correctly scoped
2308 " ✅ Dark mode hardcoded as default by adding `data-theme="dark"` to `<html>` element
2309 " 🔵 `data-theme="dark"` attribute not present on `<html>` despite previous edit claim
2311 " 🔵 Missing /companies Route and Header Company Selector Dropdown
2310 1:01p 🔵 Dark mode CSS infrastructure fully verified — `data-theme="dark"` active on HTML root
2312 1:06p 🟣 Missing /companies route and header company dropdown identified
2315 1:16p 🔄 TenantSwitcher badge colors migrated to CSS custom properties
2313 1:36p 🔵 CompaniesPage and TenantSwitcher components already exist in App.jsx
2314 1:37p 🔵 iFood Merchant API — Architecture and Endpoints Mapped
### Aug 21, 2026
2443 8:20a 🔵 Foody Project Structure: Registration & Plan Feature Scope
2444 8:21a 🔵 Foody Registration Flow: Full Stack Architecture Mapped
2445 " 🔵 JWT Contains Only userId — Plan Enforcement Requires DB Lookup
2446 " 🔵 frontend/ Uses Inline CSS in index.html; frontend-chefito/ Uses Tailwind + shadcn
2447 " 🟣 Subscription Plan Selection Added to Registration Flow (Full Stack)
S381 Add subscription plan selection (Lite/Básico/Master) to user registration in the Foody/Chefito SaaS platform (Aug 21 at 8:22 AM)
2448 8:25a ⚖️ frontend-chefito/ Excluded from Active Development Scope
2449 " 🔵 frontend-chefito/ Renamed to frontend-inativo/; Frontend Plan UI Patch Did Not Apply
2450 " 🟣 Prisma Schema Valid and Prisma Client Regenerated; frontend/ Build Passes
2451 8:26a 🟣 Plan Selection UI Confirmed Applied to Active Frontend; Full Stack Feature Complete
2452 " 🔵 SVG React Import Bug: vite-plugin-svgr Missing from Vite Config
2453 9:10a 🔴 SVG React Import Broken: vite-plugin-svgr Not Installed, BikeDeliveryIcon Unusable
2454 " 🔴 vite-plugin-svgr Installed in frontend/ to Fix SVG React Component Import
2455 9:11a 🔴 SVG React Import Fixed: vite-plugin-svgr Registered in Vite Config and BikeDeliveryIcon Props Corrected
2456 " 🔴 frontend/ Build Passes With SVG Fix — 1868 Modules, No Errors
2457 9:16a 🟣 Subscription Plan Prices Added to Registration UI
2458 9:21a ⚖️ Lite Plan Gets Dedicated Mobile-Only Frontend with Desktop Block
2459 " 🔵 App.jsx Architecture Mapped for Lite Frontend Extraction
2460 9:22a 🔵 Profile API Returns plan Field; App.jsx Can Route Lite Users After Login
2461 9:23a 🔵 apply_patch Rejects Multiple Update File Blocks Targeting the Same File
2462 " 🟣 Lite Frontend Foundation: Constants, isMobileAccess() and Lucide Icon Imports Added to App.jsx
2463 9:24a 🟣 Lite Frontend: DashboardLayout Gets isLite Prop, Route Blocking, and WhatsApp Polling Disabled
2464 " ⚖️ Lite Plan: Remove KDS, add dark-theme mobile production view
2465 9:39a 🔵 OrdersBoard API and data model for Lite production screen
2467 " 🟣 New LiteOrdersPage component for Lite plan production orders
2466 9:40a 🔵 Orders API supports status/type filters; OrdersBoard polls every 5s
2468 " 🔵 App.jsx patch failed: LITE_BLOCKED_ROUTES already modified
2469 " 🔵 Exact App.jsx state before Lite KDS removal patch
2470 9:41a 🟣 Lite plan App.jsx wired: KDS removed, LiteOrdersPage integrated, bottom nav updated
2471 " 🔵 No existing dark theme in index.html — needs fresh dark CSS block
2472 9:42a 🟣 Lite plan dark theme CSS applied to index.html
2473 " 🟣 Lite dark theme + LiteOrdersPage build verified clean
2474 9:43a 🔄 Cleanup: removed unused ChefHat import and added color-scheme:dark to Lite shell
2475 " 🟣 Lite plan v2 complete — dark theme, LiteOrdersPage, KDS removed — build verified
2476 " 🔵 Glassmorphism upgrade patch failed — liteMoreSheet styles don't match expected
2477 9:45a 🟣 Glassmorphism CSS added to Lite plan via append-after media query workaround
2478 9:46a 🟣 Glassmorphism build verified — Lite plan CSS complete
2479 9:49a ⚖️ ProductWizard component needs dark theme for Lite plan
2480 " 🔵 ProductWizard, CategorySelect, ProductMenuScheduleFields CSS classes mapped for dark theming

Access 829k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>