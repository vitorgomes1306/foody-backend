<claude-mem-context>
# Memory Context

# [foody] recent context, 2026-08-22 9:22am GMT-3

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (20,017t read) | 526,095t work | 96% savings

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
2521 7:07a 🔵 CHEFITO/Foody Project Structure and Existing Schema
2522 " ⚖️ Subscription System Architecture Decision: Stripe with Provider Abstraction
2523 7:08a 🔵 Frontend App.jsx Routing and Auth Architecture
2524 " 🔵 Plan Prices Hardcoded in Login.jsx Registration Form
2525 " ✅ Stripe SDK Installed in Backend
2526 7:09a 🟣 Billing Schema Added: BillingSettings and Subscription Models
2527 " 🟣 Billing Utility Layer and Stripe Provider Abstraction Implemented
2528 " 🟣 Billing API Routes and Subscription Access Middleware Integrated into Express Server
2529 7:11a 🔄 Subscription Access Check Moved Into authMiddleware
2530 7:12a 🟣 Frontend Subscription Pages Implemented
2531 " 🟣 Subscription Pages Integrated into App.jsx Routing
2532 " 🟣 App.jsx Billing Status Polling and Forced Subscription Block Screen
2533 " ✅ Backend and Frontend Builds Pass Successfully
2534 7:13a 🔵 Stripe Environment Variables Not Yet Configured in .env
2535 " 🔐 billingCustomerId Stripped from Login and Profile API Responses
2536 " 🟣 billingTrialStartedAt Field Added for Independent Trial Clock
2537 " ✅ Final Validation: All Builds and Checks Pass After Billing System Implementation
2538 8:49a 🚨 Live Stripe Secret Key Committed to .env.billing.example — GitHub Push Blocked
2539 " 🔵 Git State: Billing System in Unpushed Commit with Leaked Secrets in .env.billing.example
2540 " 🔵 Git Index Lock Error Prevented Commit Amend
2541 " 🔴 Stripe Credentials Removed from Git History via Commit Amend
2542 8:50a 🔵 Production Deployment Infrastructure Confirmed: Railway (Backend) + Vercel (Frontend)
2543 " ⚖️ Pivot from Stripe to Sicoob Bank Integration
2544 9:11a 🔵 Sicoob PIX API Technical Details Researched
2545 9:12a 🔵 Sicoob PIX API Exact Endpoints and Auth Mechanism Confirmed
2546 " 🔵 Current Billing Codebase Structure Before Sicoob Migration
2547 9:13a 🟣 Sicoob PIX Provider Implemented — billing/providers/sicoob.js Created
2548 " 🟣 routes/billing.js Updated for Sicoob — Webhook, Sync Endpoint, and Provider-Agnostic Activation
2549 9:14a ✅ qrcode npm Package Added to Frontend
2550 " 🔵 apply_patch Rejects Delete+Add on Same File — Must Use Update Instead
2551 9:15a 🔵 SubscriptionPage.css Patch Failed — Content Mismatch on Media Query Line
2553 " 🔵 SubscriptionPage.css Patch Persistently Fails — Likely Invisible Character or Encoding Mismatch
2552 " 🔵 File State After Patch Failures — CustomerSubscriptionPage Missing, CSS/Admin Not Updated
2554 9:16a 🔵 SubscriptionPage.css Cannot Be Patched — Each CSS Rule Is on a Separate Line
2555 " 🔴 PIX CSS Added via New PixPayment.css File — Workaround for Unpatchable SubscriptionPage.css
2556 " ✅ .env.billing.example Updated with Sicoob Environment Variables
2557 9:17a 🔵 Full Sicoob Integration State Verified — All Backend Files Complete, Frontend Untracked
2558 " 🔵 Full Build Validation Passes — Backend and Frontend Both Compile Successfully
2559 " 🟣 Sicoob Webhook Auto-Configuration Endpoint Added
2560 " 🟣 Admin UI Gets "Configurar webhook Pix" Button for Sicoob

Access 526k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>