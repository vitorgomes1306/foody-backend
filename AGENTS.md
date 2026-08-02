<claude-mem-context>
# Memory Context

# [foody] recent context, 2026-08-02 2:22pm GMT-3

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (19,849t read) | 415,009t work | 95% savings

### Aug 1, 2026
S295 Fix Supabase image uploads in the foody/chefito project — credentials were empty, then the configured project was found to be unreachable (DNS ENOTFOUND). User now wants to switch to a different Supabase project. (Aug 1 at 1:25 PM)
S296 Fix Supabase image uploads in foody/chefito — root cause found (Supabase project DNS unreachable), user wants to switch to a different/working Supabase project (Aug 1 at 1:25 PM)
### Aug 2, 2026
1742 12:00a 🔴 Flavor Button Layout Fix Build Confirmed in CounterProductConfigurator
1744 12:06a 🟣 "Marcar como pronto" Button Added to OrdersBoard Production Column
1745 12:07a 🟣 OrdersBoard "Marcar como pronto" Button Build Confirmed
1747 12:16a 🟣 Detailed Daily Orders Report Modal — "Pedidos hoje" Card
1748 " 🔵 Codebase State Before Detailed Daily Orders Report Feature
1749 " 🟣 Order Source Filter Tabs in "Prontos para entrega" Column — /orders Board
1750 12:24a 🟣 Sales Dashboard "Pedidos do dia" Tab — Modal Replaced with Dedicated Tab
1751 " 🟣 Backend `todayOrders` Raw Array Exposed in Sales Report API
1752 " 🔵 OrdersBoard Card Model Missing `waiterId` — Needed for Ready Column Source Filter
1753 6:54a 🟣 Source Filter Tabs in "Prontos para entrega" Column — OrdersBoard
1754 7:20a 🔵 Vercel Frontend 404 on Login — API URL Configuration Issue
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

Access 415k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>