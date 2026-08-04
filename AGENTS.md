<claude-mem-context>
# Memory Context

# [foody] recent context, 2026-08-03 11:03pm GMT-3

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (19,068t read) | 674,815t work | 97% savings

### Aug 1, 2026
S295 Fix Supabase image uploads in the foody/chefito project — credentials were empty, then the configured project was found to be unreachable (DNS ENOTFOUND). User now wants to switch to a different Supabase project. (Aug 1 at 1:25 PM)
S296 Fix Supabase image uploads in foody/chefito — root cause found (Supabase project DNS unreachable), user wants to switch to a different/working Supabase project (Aug 1 at 1:25 PM)
### Aug 2, 2026
1755 7:21a 🔵 Root Cause of Vercel 404: Wrong Env Var Name + All-Relative API URLs
1756 " 🔴 Vercel→Railway API Routing Fixed via Fetch Monkey-Patch + apiBase Module
1758 " 🔵 Production 500 on User Registration — Prisma Binary Target Mismatch on Railway (Linux)
1759 " 🔵 Railway DATABASE_URL Not Set — Prisma Cannot Connect
1757 7:22a 🔵 Vercel Fix Verified in Build — Railway URL Baked into Bundle
1760 9:30a 🔵 Railway DATABASE_URL Must Be Added as Reference Variable via UI
1761 9:38a 🔵 Database Connected But Registration Still 500 — Likely Missing Migrations
1762 " 🔵 Railway Database Now Connected — /test/database Returns 200
1763 " 🔵 Login Returns 500 — Prisma Tables Missing, Migrations Never Deployed
1764 9:39a 🔵 34 Prisma Migrations Never Applied to Railway — Full Schema History
1765 9:42a 🔵 Migrations Deployed — Registration Works, Login Returns 500
1766 9:43a 🔵 Login Route Works for Non-Existent Users — Fails Only for Real Users
1767 " 🔴 Fixed: Users Created Active=true + JWT_SECRET Guard Added to Login
1768 9:54a 🔵 Vercel SPA Refresh Returns 404 — Missing Rewrite Rule
1769 " 🔴 Added vercel.json SPA Fallback Rewrite to Fix F5 404
1770 10:03a 🔵 Production Images Broken — /uploads Paths Resolve Against Vercel CDN
1771 " 🔵 Scope of /uploads Image URLs — 10+ <img> Sites Need apiUrl() Prefix
1772 10:04a 🔴 Fixed Production Image URLs — assetUrl() Helper Rewrites /uploads Paths
1773 " 🔵 Railway Filesystem Serves Uploaded Images — But Files Are Ephemeral
1774 " ⚖️ New Feature: Local Print Node for Order Receipts
1775 10:20a 🟣 Local Print Agent Implemented — Chefito Print Agent
1776 10:23a 🔴 Print Agent Node 18 Compatibility — Replaced import.meta.dirname with fileURLToPath
1777 10:33a 🔵 Print Agent Detects Orders But Doesn't Print — PRINT_MODE Configuration Question
1779 " 🔵 Thermal Print Output Too Narrow — PAPER_WIDTH Doesn't Match Printer Paper
1780 " 🔵 Thermal Print Receipt Shows Only ~10 Characters Per Line With Tiny Font
1778 11:01a 🟣 Tenant UUID Display Added to Company Edit Modal
1781 11:40a 🔵 User's Thermal Printer Identified: Tomate MDK-082
1782 " 🔵 Tomate MDK-082 Confirmed as 80mm ESC/POS Thermal Printer
1783 11:42a 🟣 Print Agent: ESC/POS Raw Mode + Windows RAW Spooler Script
1784 " 🔵 ESC/POS Patch Failed — All Files Still at Old State
1785 11:43a 🟣 Print Agent: Windows RAW Print Script and Config vars Applied (printer.js Pending)
1786 " 🔴 Print Agent: ESC/POS Raw Printing Fully Applied — Fixes Tiny Font on Windows
1787 " 🔵 Print Agent ESC/POS Rewrite Verified — PAPER_WIDTH Still 42 in Active .env
1788 11:54a 🔵 Windows Raw Print Script Fails with Exit Code 1 — Printing Broken After ESC/POS Rewrite
1789 " 🔴 Print Agent: Stderr Capture Added + C# out-variable Syntax Fixed for Older .NET
1790 11:57a 🔵 Windows Machine Has Stale Print Agent — SMB Share Shows Old printer.js Without ESC/POS Patches
1791 " 🟣 Print Agent Files Synced to Windows Machine via SMB Share
1792 11:58a 🔵 Windows Print Agent Configuration Verified — Printer Name is "termica2"
1793 12:05p 🔵 PM2 `startup` Command Fails on Windows — "Init system not found"
### Aug 3, 2026
1794 9:22p 🔵 Foody Product Data Model — Variants, Flavors, and Fractions
1795 " 🔵 Frontend Catalog Page Location Confirmed
1796 " 🔵 Catalog.tsx Existing Product Form — Simple Modal Without Variants/Flavors
1797 " 🔵 Frontend Product TypeScript Types Already Include Variants and Flavors
1798 " 🔵 Backend Flavor and Variant CRUD APIs Already Exist
1799 " 🔵 Backend Variant API Supports Per-Flavor Pricing in a Single POST
1800 " 🟣 ProductWizardModal Component Created
1801 9:28p 🟣 Catalog.tsx Wired to ProductWizardModal — Button and State Added
1802 " 🔵 Two Parallel Frontend Codebases — Both Need Wizard
1803 " 🟣 ProductWizard Component Built for chefito_frontend (Legacy JSX Admin)
1804 10:54p ⚖️ Customer Pizza Order Flow — Fraction + Sizes UX Redesign Requested
S297 Novo produto Wizard button in /catalog — guided multi-step product creation modal with sizes, flavors, fractions, and pricing matrix (Aug 3 at 10:54 PM)
**Investigated**: - Full Foody project structure: Express/Prisma backend + two active frontends (chefito_frontend JSX legacy admin, frontend-chefito TSX/Tailwind newer rewrite)
    - Existing Product data model: allowFraction, skipKds, usesFlavors, maxFlavors, ProductFlavor, ProductVariant, ProductVariantFlavor tables
    - Backend API coverage: full CRUD for products, flavors, and variants already existed; flavor POST in chefito_frontend requires price field; variant POST uses count-based seq
    - chefito_frontend/src/App.jsx CatalogPage: already had FlavorManager.jsx and VariantManager.jsx (new untracked file) for post-creation editing
    - frontend-chefito/src/pages/Catalog.tsx: simpler modal without variants/flavors; types/product.ts already fully typed for variants+flavors
    - CSS architecture: chefito_frontend uses inline styles in index.html &lt;style&gt; block, not separate CSS files

**Learned**: - Two frontend codebases coexist: chefito_frontend (deployed JSX admin with lucide-react, react-dropzone) and frontend-chefito (newer TSX/Tailwind rewrite)
    - Flavor creation in chefito_frontend requires both name AND price; frontend-chefito only requires name — different API contracts for same endpoint
    - Variant seq is auto-assigned server-side (count+1) in chefito_frontend's backend; frontend-chefito backend accepts explicit seq
    - Product soft-delete: if product has order history, DELETE sets active=false instead of physical deletion
    - effectiveBasePrice() computes min(prices) across sizes/flavors to set the product's base price field
    - canContinue() validates each step: requires ≥1 flavor if usesFlavors, ≥1 size if usesSizes, validates all price fields are valid numbers on step 3

**Completed**: - Created chefito_frontend/src/products/ProductWizard.jsx: 4-step guided wizard (Informações → Formato → Preços → Revisão) with ToggleCard flags, ImagePicker via react-dropzone, dynamic price matrix for sizes×flavors
    - Wired ProductWizard into chefito_frontend/src/App.jsx CatalogPage: "Novo produto Wizard" button (Sparkles icon, disabled if no categories), existing form renamed "Cadastro avançado"
    - Injected ~60 wizard CSS classes into chefito_frontend/index.html inline style block including responsive @media(max-width:760px) breakpoints
    - Build confirmed: npm run build exit 0, 1859 modules, no errors
    - Also created frontend-chefito/src/components/ProductWizardModal.tsx: 6-step TSX wizard (Básico → Tipo → Sabores → Tamanhos → Foto → Revisar) with step-skipping logic when usesFlavors=false, ToggleCard, StepIndicator, bottom-sheet mobile layout
    - Wired ProductWizardModal into frontend-chefito/src/pages/Catalog.tsx with showWizard state and import

**Next Steps**: User requested a redesign of the customer-facing ordering flow for fractioned pizza products. Specifically: when a product has both allowFraction=true AND sizes (variants), the customer should see sizes displayed prominently before flavor selection. This targets the customer menu/counter UI (CounterProductConfigurator or equivalent), not the admin wizard. The example was cut off in the request — awaiting full specification or implementation of the new selection flow.


Access 675k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>