# Disclimer this is a fully AI-prompted Rust project to improve my Rust learning at the age of 90.


# 💰 Money Manager

> Because spreadsheets are so 2010, and your bank's app is... let's not go there.

A brutally honest, double-entry accounting desktop app that actually respects your data by keeping it LOCAL. No clouds, no subscriptions, no "oops we got hacked" emails at 3 AM.

## 🎯 What This Thing Does

Manual double-entry bookkeeping for humans who:
- Don't trust banks to categorize "AMZN MKTP" correctly
- Want to see where their money *actually* goes
- Believe data should live on YOUR computer, not Bezos's
- Enjoy the satisfying click of balanced books

**Key Features:**
- 📊 Calendar view (see your financial sins laid out day by day)
- 💳 Track Cash, Banks, Credit Cards, and that Bitcoin you bought in 2017
- 🏷️ Hierarchical categories (Food > Lunch > "Why did I order sushi again?")
- 📈 Charts that make you feel productive while avoiding real work
- 🌙 Dark mode (because your eyes deserve better at 2 AM)
- 🔒 Offline-first (your spending habits are between you and SQLite)

## 🛠️ Tech Stack

**Backend:**
- Rust 🦀 (because we're masochists who enjoy compile times)
- Tauri v2 (Electron's cooler, lighter cousin)
- SQLx (async database magic)
- SQLite (your data, your disk, your business)

**Frontend:**
- React + TypeScript (because `any` is not a type)
- Tailwind CSS (utility classes go brrr)
- Vite (fast refresh or bust)

## 📋 Prerequisites

Before you embarrass yourself with "it doesn't work":

### Required Software

1. **Node.js** (v18 or higher)
   ```bash
   # Check if you have it
   node --version
   # If not: https://nodejs.org/
   ```

2. **pnpm** (because npm is slow and yarn is... yarn)
   ```bash
   # Install globally
   npm install -g pnpm
   
   # Verify
   pnpm --version
   ```

3. **Rust** (stable channel)
   ```bash
   # Install via rustup
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   
   # Verify
   rustc --version
   cargo --version
   ```

4. **Tauri Prerequisites** (Windows-specific)
   - **Microsoft Visual Studio C++ Build Tools**
     - Download: https://visualstudio.microsoft.com/visual-cpp-build-tools/
     - Install "Desktop development with C++" workload
   - **WebView2** (usually pre-installed on Windows 10/11)
     - If missing: https://developer.microsoft.com/microsoft-edge/webview2/

## 🚀 Setup Instructions

### 1. Clone the Repository
```bash
git clone <your-repo-url>
cd money-manager
```

### 2. Install Dependencies
```bash
# Frontend dependencies
pnpm install

# Rust dependencies (happens automatically on first build)
cd src-tauri
cargo fetch
cd ..
```

### 3. Database Setup
The database is automatically created on first run. No manual setup needed! 

Location: `%APPDATA%\com.moneymanager.dev\money_manager.db`

**Migrations run automatically** when you start the app.

## 🏃‍♂️ Running the Application

### Development Mode
```bash
# Start dev server with hot reload
pnpm tauri dev
```

This will:
1. Start Vite dev server (React hot reload)
2. Compile Rust code (grab coffee ☕)
3. Launch the app window
4. Watch for changes

**First run takes 5-10 minutes** because Rust needs to compile half the internet.

### Build for Production
```bash
# Create optimized build
pnpm tauri build
```

Output: `src-tauri/target/release/bundle/`

## 📁 Project Structure

```
money-manager/
├── src/                          # React Frontend
│   ├── components/               # Reusable UI components
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   ├── AccountCard.tsx
│   │   └── ...
│   ├── views/                    # Page-level components
│   │   ├── DashboardView.tsx
│   │   ├── AccountsView.tsx
│   │   └── TransactionsView.tsx
│   ├── contexts/                 # React Context providers
│   │   └── ThemeContext.tsx
│   ├── types/                    # TypeScript interfaces
│   │   ├── account.ts
│   │   └── transaction.ts
│   ├── App.tsx                   # Main app component
│   └── main.tsx                  # Entry point
│
├── src-tauri/                    # Rust Backend
│   ├── src/
│   │   ├── commands/             # Tauri command handlers
│   │   │   ├── accounts.rs
│   │   │   ├── transactions.rs
│   │   │   └── categories.rs
│   │   ├── models/               # Data structures
│   │   │   ├── account.rs
│   │   │   └── transaction.rs
│   │   ├── db/                   # Database setup
│   │   │   └── mod.rs
│   │   ├── migrations/           # SQLx migrations
│   │   │   ├── 20240101000001_init.sql
│   │   │   └── 20240101000002_seed_data.sql
│   │   └── lib.rs                # Library entry
│   ├── Cargo.toml                # Rust dependencies
│   └── tauri.conf.json           # Tauri configuration
│
├── package.json                  # Frontend dependencies
├── tailwind.config.js            # Tailwind CSS config
├── tsconfig.json                 # TypeScript config
└── vite.config.ts                # Vite config
```

## 🧪 Development Workflow

### Common Commands
```bash
# Install new frontend dependency
pnpm add <package>

# Install new Rust dependency
cd src-tauri
cargo add <crate>
cd ..

# Format code
pnpm format              # Frontend (Prettier)
cargo fmt                # Rust

# Type checking
pnpm typecheck          # TypeScript
cargo check             # Rust

# Run tests
cargo test              # Rust tests
```

### Hot Reload Behavior
- **Frontend changes** (React/TS): Instant hot reload ⚡
- **Rust changes**: Full recompile (~30s-2min) 🐌
- **Database changes**: Restart required 🔄

## 🐛 Troubleshooting

### "Error: Could not find Visual Studio"
**Fix:** Install VS C++ Build Tools (see Prerequisites)

### "WebView2 not found"
**Fix:** Install WebView2 Runtime from Microsoft

### "EACCES: permission denied" on pnpm install
**Fix:** Don't use `sudo`. Ever. Run as regular user.

### "Rust compilation failed"
**Fix:** 
```bash
cd src-tauri
cargo clean
cargo build
```

### "Port 1420 already in use"
**Fix:** Kill the old dev server
```bash
# Windows
taskkill /F /IM node.exe

# Or just restart your computer like a caveman
```

### Database is corrupted
**Fix:** Delete the database file (you'll lose data!)
```bash
# Windows
del %APPDATA%\com.moneymanager.dev\money_manager.db
```

## 📚 Useful Resources

- [Tauri Documentation](https://tauri.app/v1/guides/)
- [SQLx Documentation](https://docs.rs/sqlx/)
- [React TypeScript Cheatsheet](https://react-typescript-cheatsheet.netlify.app/)
- [Tailwind CSS Docs](https://tailwindcss.com/docs)

## 🤝 Contributing

Found a bug? Feature request? 

1. Open an issue (be specific or be ignored)
2. Fork the repo
3. Make your changes
4. Test EVERYTHING
5. Submit a PR

**Code Style:**
- Rust: `cargo fmt` (no negotiation)
- TypeScript: Prettier (already configured)
- Commits: Descriptive or it didn't happen

## 📜 License

MIT License - Do whatever you want, just don't blame me when your financial advisor sees your spending habits.

## 🎯 Roadmap

Current Status: **Phase 1 Complete** ✅

**Coming Soon:**
- [ ] Categories Management (Phase 2)
- [ ] Transaction Entry Form (Phase 3)
- [ ] Calendar View (Phase 4)
- [ ] Budget Tracking (Phase 5)
- [ ] Reports & Analytics (Phase 6)
- [ ] Recurring Transactions (Phase 7)
- [ ] Credit Card Settlement Logic (Phase 8 - The Final Boss)

## 💡 Pro Tips

1. **First build is slow** - Rust compiles dependencies once. Second build is faster.
2. **Keep dev server running** - Only restart when changing Rust code.
3. **Use dark mode** - Your eyes will thank you.
4. **Backup your database** - Settings > Data Management (when implemented).
5. **Read error messages** - They're actually helpful (looking at you, TypeScript).

## 🆘 Getting Help

1. Check this README
2. Check the Issues page
3. Read the error message (seriously)
4. Google the error message
5. Ask in Discussions
6. Sacrifice a rubber duck to the debugging gods

---

**Built with 🦀 Rust, ⚛️ React, and 🤬 determination**

*"It's not about the money, it's about knowing where the money went."* - Every accountant, probably
