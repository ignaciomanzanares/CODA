# FinHealth – Developer Setup Guide

Welcome to the FinHealth project! Follow these steps to get started.

## 1. Prerequisites

- **Docker** (recommended for dev container)
- **Node.js** (v18+ if running locally)
- **npm** (v9+)
- **Git**

## 2. Clone the Repository

```sh
git clone <repo-url>
cd FinHealth
```

## 3. Open in VS Code (Recommended)

- Open the project folder in **Visual Studio Code**.
- If prompted, **"Reopen in Container"** (for dev container setup).

## 4. Install Dependencies

```sh
npm install
```

## 5. Start the Development Environment

### Using Dev Container (Recommended)
- Open the Command Palette (`Ctrl+Shift+P`).
- Select: **Dev Containers: Reopen in Container**
- The environment will set up automatically.

### Or, Run Locally

#### Start the Backend

```sh
cd server
npm install
npm run dev
```

#### Start the Frontend

Open a new terminal:

```sh
cd client
npm install
npm run dev
```

## 6. Access the App

- Open your browser and go to: [http://localhost:5173](http://localhost:5173)

## 7. Useful Commands

- **Run all tests:**  
  ```sh
  npm test
  ```
- **Build for production:**  
  ```sh
  npm run build
  ```

## 8. Troubleshooting

- If you have issues, try restarting the dev container or deleting `node_modules` and running `npm install` again.
- Check `.env` files in `server/` for environment variables.

---

**Need help?**  
Ask in the team chat or check the [replit.md](replit.md) file for more