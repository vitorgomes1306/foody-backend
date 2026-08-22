<claude-mem-context>
# Memory Context

# [foody] recent context, 2026-08-22 7:07am GMT-3

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (19,901t read) | 2,149,974t work | 99% savings

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
### Aug 21, 2026
S381 Add subscription plan selection (Lite/Básico/Master) to user registration in the Foody/Chefito SaaS platform (Aug 21 at 8:22 AM)
2470 9:41a 🟣 Lite plan App.jsx wired: KDS removed, LiteOrdersPage integrated, bottom nav updated
2472 9:42a 🟣 Lite plan dark theme CSS applied to index.html
2473 " 🟣 Lite dark theme + LiteOrdersPage build verified clean
2474 9:43a 🔄 Cleanup: removed unused ChefHat import and added color-scheme:dark to Lite shell
2475 " 🟣 Lite plan v2 complete — dark theme, LiteOrdersPage, KDS removed — build verified
2476 " 🔵 Glassmorphism upgrade patch failed — liteMoreSheet styles don't match expected
2477 9:45a 🟣 Glassmorphism CSS added to Lite plan via append-after media query workaround
2478 9:46a 🟣 Glassmorphism build verified — Lite plan CSS complete
2479 9:49a ⚖️ ProductWizard component needs dark theme for Lite plan
2480 " 🔵 ProductWizard, CategorySelect, ProductMenuScheduleFields CSS classes mapped for dark theming
2481 9:50a 🟣 OrderDetailsPage: Lite Mode Action Bar + Payment Modal
2482 " 🟣 Lite Mode CSS: OrderDetailsActions + LitePaymentModal Dark Glass Styles
2483 " 🟣 SalesDashboard: isLite Prop Hides Waiter/Commission Features
2484 " 🟣 SalesDashboard Lite: Full Dark-Glass Mobile CSS in index.html
2485 " 🔵 apply_patch Idempotency Issue: Repeated Patch Applications in Same Session
2486 1:56p 🔵 Git Push Pending After Successful Rebase on frontend Repo
2487 2:02p 🔵 Dual-Repo Structure Confirmed: Frontend Push Still Pending
2488 2:04p 🔵 Theme Architecture: Three Independent useThemeToggle Contexts
2489 " 🟣 Theme-Aware Logo Switching in Sidebar and Login
2491 " ⚖️ Lite Mode Requirements for /companies Route
2490 2:05p 🟣 Theme-Aware Logo Build Verified — New Uncommitted Changes on Top of Unpushed Commit
2492 2:10p 🟣 CompaniesPage Lite mode: entire "Configurações" card hidden
2493 2:17p 🟣 CompaniesPage Lite: entire "Configurações" card hidden, not just checkbox
2495 " 🔵 Bluetooth direct printing: Web Bluetooth API vs window.print() trade-offs
2497 " 🔵 Existing print-agent architecture: polling Node.js agent with ESC/POS and PrintJob queue
2494 2:18p 🟣 CompaniesPage Lite mode: final structure verified, build passes
2499 2:29p 🔵 Mobile app has direct Bluetooth printer access; desktop web version requires print-agent
2496 " 🔵 Native Bluetooth printing: platform APIs investigated for direct thermal printer access
2500 2:31p 🟣 CatalogPage product edit form: mobile responsiveness needed for Lite mode
2498 2:32p 🔵 Print-agent full architecture: dual polling loop, ESC/POS generation, two print modes
2501 3:24p 🔴 CatalogPage Lite — FlavorManager button layout fix
2502 3:29p 🔵 FlavorManager row layout — CSS selector too broad
2503 " 🔴 FlavorManager refactored to fix Lite mobile button layout
2504 3:30p 🟣 FlavorManager Lite dark CSS added to index.html
2506 " ⚖️ FlavorManager row layout: all 5 elements inline (single row)
2507 " 🟣 Foody/Chefito Lite: Android APK debug compilado com sucesso via Capacitor
2508 " 🟣 ChefitoPrinterPlugin: Plugin nativo Android para impressora Bluetooth ESC/POS
2509 " 🟣 Capacitor configurado no frontend foody com scripts de build Android
2505 " ✅ Frontend build passes with FlavorManager + catalog Lite mobile changes
2510 5:11p 🔴 Android APK UI Fixes: Font Scale and Status Bar Overlap
2511 9:34p 🔴 Android APK Build Fixed: JAVA_HOME Required for Gradle Wrapper on macOS
### Aug 22, 2026
2512 6:39a 🔵 Android 15 Edge-to-Edge Enforcement Causes Status Bar Overlap in Capacitor Apps
2513 " 🔵 Capacitor Android Project Baseline: Missing Edge-to-Edge and Font Scale Fixes
2514 " 🔴 Capacitor MainActivity: Fixed Status Bar Overlap and Font Scale
2515 6:40a 🔴 APK Rebuilt Successfully with UI Fixes: Font Scale and Status Bar
2516 " 🔵 ViewCompat Inset Listener on WebView Insufficient for Capacitor Edge-to-Edge Fix
2517 6:41a 🔴 Capacitor Inset Fix: Moved to WebView Parent Container with Margin Layout Params
2518 " 🔵 Second Inset Patch Silently Failed: Git Diff Shows Original Code Still in Place
2519 6:54a 🔴 Third APK Build: Parent Container Inset Fix Successfully Compiled
2520 " ✅ New APK with Parent Container Inset Fix: SHA256 Confirmed Changed

Access 2150k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>