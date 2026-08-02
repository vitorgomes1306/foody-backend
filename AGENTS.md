<claude-mem-context>
# Memory Context

# [foody] recent context, 2026-08-02 9:42am GMT-3

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (19,548t read) | 506,708t work | 96% savings

### Aug 1, 2026
S295 Fix Supabase image uploads in the foody/chefito project — credentials were empty, then the configured project was found to be unreachable (DNS ENOTFOUND). User now wants to switch to a different Supabase project. (Aug 1 at 1:25 PM)
S296 Fix Supabase image uploads in foody/chefito — root cause found (Supabase project DNS unreachable), user wants to switch to a different/working Supabase project (Aug 1 at 1:25 PM)
1714 10:40p 🔵 App.jsx allowFraction Section Already Replaced — Patch Anchor No Longer Exists
1715 " 🟣 usesFlavors and allowFraction Are Now Mutually Exclusive — Auto-Clear on Server
1716 " 🔵 npx prisma migrate status Always Fails from exec_command Due to Network Isolation
1717 " 🟣 Auto-Accept Orders Bypass KDS
1718 10:51p 🔴 Auto-Accept Orders Now Sets Status to "preparing" Instead of "confirmed"
1719 " ✅ Main Layout: Scrollable Pages, Board-Only Overflow Hidden
1720 " 🔴 OrderItem kitchenStatus Also Set to "preparing" on Auto-Accept
1721 10:53p ✅ Order Card Hides Total for Non-Addition Orders
1722 10:56p 🟣 KDS Addition Items Merge Back to Main Order Card When Ready
1723 11:05p 🟣 Orders Board Cards Now Show Full Item Details
1724 11:10p ⚖️ Auto-Print Orders on KDS Production — Architecture Discussion
1725 11:32p 🟣 WaiterMyOrdersPage Rewritten with Full Item Details and Bill Closing
1726 11:34p 🔵 apply_patch Fails on Freshly Written Single-Line JSX in WaiterMyOrdersPage
1727 11:35p 🟣 Waiter Commission Fields Added to Bill Closing Flow
1728 " 🟣 Bill Closing Modal UI Updated with Commission Summary and Fields
1729 11:36p 🔵 Sidebar Navigation Architecture in Chefito Frontend
1730 " 🟣 Sales Report API Endpoint Created
1731 11:42p 🟣 Sales Dashboard Frontend Page Created
1732 " 🟣 Sales Dashboard CSS Styles and paidAt-based Filtering Added
1733 11:49p 🔵 Payment Method Data Structure in Foody Codebase
1734 " 🟣 Payment Methods Breakdown Card Added to Sales Dashboard
1735 11:50p 🟣 Payment Methods Dashboard Feature Build Verified
1736 11:51p 🔵 Order Type System and Full Order Prisma Schema Mapped
1738 " 🟣 Order Source Breakdown Panel Added to Sales Dashboard
1740 " 🔵 Flavor Name and Price Layout Bug in CounterProductConfigurator
1737 11:52p 🔵 Order Creation Routes and Type Flow Architecture
1741 " 🔴 Fixed Flavor Name/Price Layout in CounterProductConfigurator
1739 11:53p 🟣 Order Source Panel Build Verified — Dashboard Feature Complete
1743 11:58p 🔵 OrdersBoard Production Column Lacks "Mark Ready" Button
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

Access 507k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>